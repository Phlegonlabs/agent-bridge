import { writeFile, rename, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bridgeRoot } from './account.mjs';
import { BridgeError } from './profiles.mjs';
import { publicTaskStatus, taskIdPattern } from './task-progress.mjs';

export class WorkflowStatusJournal {
  constructor(directory, runId) {
    this.directory = directory; this.runId = runId; this.tasks = new Map();
    this.state = 'running'; this.code = null; this.revision = 0;
    this.writes = Promise.resolve(); this.dirty = false; this.available = true;
  }
  observe(snapshot) {
    this.tasks.set(snapshot.taskId, publicTaskStatus(snapshot)); this.revision++; this.dirty = true;
    // Lifecycle changes flush promptly. Repeated native activity coalesces.
    const previous = this.lastStates?.get(snapshot.taskId);
    this.lastStates ??= new Map(); this.lastStates.set(snapshot.taskId, snapshot.state);
    if (previous !== snapshot.state) this.schedule(0);
    else this.schedule(1000);
  }
  schedule(delay) {
    if (this.timer && delay !== 0) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, delay);
    this.timer.unref();
  }
  async flush() {
    clearTimeout(this.timer); this.timer = null;
    if (!this.dirty) { await this.writes; return this.available; }
    this.dirty = false;
    const value = { schema: 'agent-bridge/workflow-status/1', runId: this.runId,
      state: this.state, code: this.code, revision: this.revision, recordedAt: Date.now(),
      ownerPid: process.pid, ownerStartedAt: Date.now() - Math.round(process.uptime() * 1000),
      tasks: [...this.tasks.values()] };
    this.writes = this.writes.then(async () => {
      const temporary = path.join(this.directory, `status-${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
      await rename(temporary, path.join(this.directory, 'status.json'));
      this.available = true;
    }).catch(() => { this.available = false; });
    await this.writes; return this.available;
  }
  async finish(report) {
    this.state = report.ok ? 'finished' : report.code === 'CANCELLED' ? 'cancelled' : 'failed';
    this.code = report.code; this.revision++; this.dirty = true;
    return this.flush();
  }
}

export async function readWorkflowStatus(runId, root = bridgeRoot) {
  if (!taskIdPattern.test(runId)) throw new BridgeError('INVALID_TASK_ID', 'Use a UUID workflow ID.');
  const directory = path.join(root, '.bridge', 'workflows', runId);
  const file = path.join(directory, 'status.json');
  let value;
  try {
    for (const candidate of [path.join(root, '.bridge'), path.join(root, '.bridge', 'workflows'), directory, file]) {
      const info = await lstat(candidate);
      if (info.isSymbolicLink()) throw new Error('unsafe path');
      if (candidate === file && (!info.isFile() || info.size > 128 * 1024)) throw new Error('invalid status file');
    }
    value = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { schema: 'agent-bridge/tasks/1', available: false, tasks: [], observation: 'unavailable' };
    throw new BridgeError('STATUS_UNAVAILABLE', 'Cannot read the recorded workflow status.');
  }
  if (value.schema !== 'agent-bridge/workflow-status/1' || value.runId !== runId ||
      !['running', 'finished', 'failed', 'cancelled'].includes(value.state) || !Array.isArray(value.tasks) || value.tasks.length > 32 ||
      !Number.isFinite(value.recordedAt) || !Number.isInteger(value.revision)) {
    throw new BridgeError('STATUS_UNAVAILABLE', 'Invalid recorded workflow status.');
  }
  const tasks = value.tasks.map(task => {
    const result = publicTaskStatus(task), end = result.finishedAt ?? Date.now();
    return { ...result, elapsedMs: result.acceptedAt === null ? null : Math.max(0, end - result.acceptedAt),
      lastActivityAgeMs: result.lastActivityAt === null ? null : Math.max(0, end - result.lastActivityAt) };
  });
  return { schema: 'agent-bridge/tasks/1', available: true, workflowId: runId,
    workflowState: value.state, revision: value.revision,
    code: typeof value.code === 'string' && /^[A-Z_]{1,64}$/.test(value.code) ? value.code : null,
    tasks, observation: 'recorded-workflow', liveness: value.state === 'running' ? 'unverified' : 'terminal',
    recordedAt: value.recordedAt, observationAgeMs: Math.max(0, Date.now() - value.recordedAt) };
}
