import { randomUUID } from 'node:crypto';
import { BridgeError } from './profiles.mjs';

export const terminalStates = new Set(['finished', 'failed', 'cancelled']);
const lifecycleStates = new Set(['queued', 'starting', 'running', 'finishing', 'stopping']);
const activityKinds = new Set(['thinking', 'text', 'tool_started', 'tool_finished', 'native_retry']);
const safeName = value => typeof value === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(value) ? value : null;
const safeModel = value => typeof value === 'string' && /^[a-zA-Z0-9._/-]{1,128}$/.test(value) ? value : null;
export const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function publicTaskStatus(value) {
  if (value?.schema !== 'agent-bridge/task-status/1' || !taskIdPattern.test(value.taskId) ||
      !new Set(['accepted', ...lifecycleStates, ...terminalStates]).has(value.state)) {
    throw new BridgeError('STATUS_UNAVAILABLE', 'Invalid task status record.');
  }
  const result = { schema: value.schema, taskId: value.taskId, state: value.state };
  for (const key of ['parentRunId', 'jobId', 'provider', 'runId', 'code']) result[key] = safeName(value[key]);
  for (const key of ['requestedModel', 'actualModel']) result[key] = safeModel(value[key]);
  result.lastActivityKind = activityKinds.has(value.lastActivityKind) ? value.lastActivityKind : null;
  for (const key of ['revision', 'attempt', 'acceptedAt', 'queuedAt', 'startedAt', 'lastOutputAt',
    'lastActivityAt', 'finishedAt', 'deadlineAt', 'elapsedMs', 'lastActivityAgeMs']) {
    result[key] = Number.isFinite(value[key]) && value[key] >= 0 ? value[key] : null;
  }
  result.recoveryRequired = value.recoveryRequired === true;
  return result;
}

// Observability cannot change execution, permission, audit or cleanup behavior.
export function notifyProgress(observer, event) {
  try { observer?.(event)?.catch?.(() => {}); }
  catch { /* The execution owner still verifies the result. */ }
}

export class TaskProgress {
  constructor({ taskId = randomUUID(), parentRunId, jobId, provider, model, deadlineAt,
    now = Date.now, onChange } = {}) {
    if (!taskIdPattern.test(taskId)) throw new BridgeError('INVALID_TASK_ID', 'Use a UUID task ID.');
    this.now = now; this.onChange = onChange;
    this.record = { schema: 'agent-bridge/task-status/1', taskId,
      parentRunId: safeName(parentRunId), jobId: safeName(jobId), provider: safeName(provider),
      requestedModel: safeModel(model), actualModel: null, runId: null,
      state: 'accepted', revision: 1, attempt: 0, acceptedAt: now(), queuedAt: null,
      startedAt: null, lastOutputAt: null, lastActivityAt: null, lastActivityKind: null,
      finishedAt: null, deadlineAt: Number.isFinite(deadlineAt) ? deadlineAt : null,
      code: null, recoveryRequired: false };
  }

  // Each attempt has its own callback. A late callback cannot alter a later attempt.
  beginAttempt({ provider, model } = {}) {
    if (terminalStates.has(this.record.state) || this.record.state === 'stopping') return () => {};
    const attempt = ++this.record.attempt;
    this.record.provider = safeName(provider); this.record.requestedModel = safeModel(model);
    this.record.runId = null; this.record.startedAt = null;
    this.record.lastOutputAt = null; this.record.lastActivityAt = null; this.record.lastActivityKind = null;
    if (attempt > 1) this.record.queuedAt = null;
    this.record.state = 'starting'; this.changed();
    return event => { if (attempt === this.record.attempt) this.update(event); };
  }

  update(event) {
    const record = this.record;
    if (!event || terminalStates.has(record.state)) return;
    if (record.state === 'stopping' && event.type !== 'stopping') return;
    let changed = false;
    if (lifecycleStates.has(event.type)) {
      // Only an actual process-spawn observation means running.
      record.state = event.type;
      if (event.type === 'queued') record.queuedAt = this.now();
      if (event.type === 'running') {
        record.startedAt ??= this.now(); record.runId = safeName(event.runId);
      }
      changed = true;
    } else if (event.type === 'output') { record.lastOutputAt = this.now(); changed = true; }
    else if (event.type === 'activity' && activityKinds.has(event.kind)) {
      record.lastActivityAt = this.now(); record.lastActivityKind = event.kind; changed = true;
    }
    if (changed) this.changed();
  }

  settle({ ok, code, actualModel, recoveryRequired = false } = {}) {
    if (terminalStates.has(this.record.state)) return;
    this.record.state = ok === true ? 'finished' : code === 'CANCELLED' ? 'cancelled' : 'failed';
    this.record.code = safeName(code) ?? (ok === true ? 'VERIFIED' : 'PROVIDER_ERROR');
    this.record.actualModel = ok === true ? safeModel(actualModel) : null;
    this.record.recoveryRequired = recoveryRequired === true ||
      ['CLEANUP_UNCONFIRMED', 'SESSION_RECOVERY_REQUIRED'].includes(code);
    this.record.finishedAt = this.now(); this.changed();
  }

  changed() { this.record.revision++; notifyProgress(this.onChange, this.snapshot()); }
  snapshot() {
    const time = this.now(), end = this.record.finishedAt ?? time;
    return { ...this.record, elapsedMs: Math.max(0, end - this.record.acceptedAt),
      lastActivityAgeMs: this.record.lastActivityAt === null ? null : Math.max(0, end - this.record.lastActivityAt) };
  }
}

// This bounded index observes tasks; queues and delegate ownership stay elsewhere.
export class TaskStatuses {
  constructor({ now = Date.now, limit = 128, ttlMs = 15 * 60000 } = {}) {
    this.entries = new Map(); this.now = now; this.limit = limit; this.ttlMs = ttlMs;
  }
  prune() {
    const terminal = [...this.entries].filter(([, entry]) => terminalStates.has(entry.progress.record.state));
    let count = terminal.length;
    for (const [id, entry] of terminal) {
      if (this.now() - entry.progress.record.finishedAt >= this.ttlMs || count > this.limit) {
        this.entries.delete(id); count--;
      }
    }
  }
  create(metadata, sessionKey) {
    this.prune();
    const active = [...this.entries.values()].filter(entry => !terminalStates.has(entry.progress.record.state)).length;
    if (active >= this.limit) throw new BridgeError('QUEUE_FULL', 'Too many observed tasks.');
    const progress = new TaskProgress({ ...metadata, now: this.now });
    this.entries.set(progress.record.taskId, { progress, sessionKey });
    return progress;
  }
  get(id) { this.prune(); return this.entries.get(id)?.progress.snapshot() ?? null; }
  list(sessionKey) {
    this.prune();
    return [...this.entries.values()].filter(entry => sessionKey === undefined || entry.sessionKey === sessionKey)
      .map(entry => entry.progress.snapshot());
  }
}
