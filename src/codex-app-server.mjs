import path from 'node:path';
import { BridgeError } from './profiles.mjs';
import { createCodexAudit } from './codex-audit.mjs';
import { codexErrorCode } from './codex-errors.mjs';
import { notifyProgress } from './task-progress.mjs';

const passive = new Set(['remoteControl/status/changed', 'account/updated', 'account/rateLimits/updated',
  'configWarning', 'thread/status/changed', 'thread/tokenUsage/updated', 'thread/name/updated']);
const allowedItems = new Set(['userMessage', 'agentMessage', 'reasoning', 'plan', 'contextCompaction']);
const samePath = (a, b) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);

export function createCodexAppServer({ model, effort, cwd, task, onPartial, onProgress }) {
  const audit = createCodexAudit(model, effort);
  let io, expectedId = 1, threadId, turnId, started = false, ended = false;
  const items = new Map(), warnings = [];
  const fail = code => { throw new BridgeError(code, code); };
  const ingest = event => audit.ingest(JSON.stringify(event));
  const send = (id, method, params) => io.write(JSON.stringify({ id, method, params }) + '\n');
  const identity = params => {
    if (!threadId || params?.threadId !== threadId) fail('CODEX_SESSION_UNVERIFIED');
    if (params.turnId !== undefined && (!turnId || params.turnId !== turnId)) fail('CODEX_TURN_MISMATCH');
  };
  const bindTurn = turn => {
    if (!turn || typeof turn.id !== 'string' || !turn.id || turnId && turnId !== turn.id) fail('CODEX_TURN_MISMATCH');
    turnId = turn.id;
  };
  const errorCode = error => ['cyberPolicy', 'misalignmentPolicyViolation'].includes(error?.codexErrorInfo)
    ? 'CODEX_CONTENT_REJECTED' : codexErrorCode(error?.message);

  function onLine(line) {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { fail('CODEX_INVALID_EVENT'); }
    if (!event || typeof event !== 'object' || Array.isArray(event)) fail('CODEX_INVALID_EVENT');
    if (event.id !== undefined) {
      if (event.method) fail('CODEX_UNEXPECTED_TOOL'); // Never answer native approval or tool requests.
      if (event.id !== expectedId || expectedId === null) fail('CODEX_INVALID_RESPONSE');
      if (event.error) fail(errorCode(event.error));
      const result = event.result;
      if (!result || typeof result !== 'object') fail('CODEX_INVALID_RESPONSE');
      if (expectedId === 1) {
        io.write(JSON.stringify({ method: 'initialized' }) + '\n'); expectedId = 2;
        send(2, 'thread/start', { model, cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: false,
          ...(effort !== null ? { config: { model_reasoning_effort: effort } } : {}) });
      } else if (expectedId === 2) {
        if (result.model !== model) fail('CODEX_MODEL_MISMATCH');
        if (effort !== null && result.reasoningEffort !== effort) fail('CODEX_EFFORT_MISMATCH');
        if (typeof result.cwd !== 'string' || !samePath(result.cwd, cwd) ||
            result.sandbox?.type !== 'readOnly' || result.approvalPolicy !== 'never') fail('CODEX_ISOLATION_UNVERIFIED');
        threadId = result.thread?.id;
        if (typeof threadId !== 'string' || !threadId) fail('CODEX_SESSION_UNVERIFIED');
        ingest({ type: 'thread.started', thread_id: threadId }); expectedId = 3;
        send(3, 'turn/start', { threadId, model, ...(effort !== null ? { effort } : {}),
          input: [{ type: 'text', text: task, text_elements: [] }] });
      } else {
        bindTurn(result.turn); expectedId = null;
      }
      return;
    }
    const method = event.method, params = event.params;
    if (typeof method !== 'string') fail('CODEX_INVALID_EVENT');
    if (method.startsWith('codex/event/') || passive.has(method)) return;
    if (method === 'thread/started') {
      if (params?.thread?.id !== threadId) fail('CODEX_SESSION_UNVERIFIED');
      return;
    }
    if (method === 'mcpServer/startupStatus/updated') fail('CODEX_ISOLATION_UNVERIFIED');
    if (method === 'turn/started') {
      identity({ threadId: params?.threadId }); bindTurn(params?.turn);
      if (started || ended) fail('CODEX_DUPLICATE_TURN');
      started = true; ingest({ type: 'turn.started' }); return;
    }
    identity(params);
    if (!started || ended) fail('CODEX_EVENT_AFTER_TURN');
    if (method === 'error') {
      const code = errorCode(params.error);
      if (code === 'CODEX_CONTENT_REJECTED' || params.willRetry !== true) fail(code);
      warnings.push({ code: 'CODEX_RECONNECTING' });
      notifyProgress(onProgress, { type: 'activity', kind: 'native_retry' }); return;
    }
    if (method === 'item/started') {
      const item = params.item;
      if (!item || !allowedItems.has(item.type)) fail('CODEX_UNEXPECTED_TOOL');
      if (typeof item.id !== 'string' || !item.id || items.has(item.id) || items.size >= 1024) fail('CODEX_INVALID_ITEM');
      items.set(item.id, { type: item.type, text: '', complete: false });
      if (item.type === 'reasoning') notifyProgress(onProgress, { type: 'activity', kind: 'thinking' });
    } else if (method === 'item/agentMessage/delta') {
      const item = items.get(params.itemId);
      if (!item || item.type !== 'agentMessage' || item.complete || typeof params.delta !== 'string') fail('CODEX_INVALID_ITEM');
      if (Buffer.byteLength(item.text) + Buffer.byteLength(params.delta) > 512 * 1024) fail('RESPONSE_TOO_LARGE');
      item.text += params.delta;
      notifyProgress(onProgress, { type: 'activity', kind: 'text' });
      onPartial?.(params.delta);
    } else if (method === 'item/completed') {
      const item = items.get(params.item?.id);
      if (!item || item.complete || item.type !== params.item.type) fail('CODEX_INVALID_ITEM');
      item.complete = true;
      if (item.type === 'agentMessage') {
        if (typeof params.item.text !== 'string' || item.text !== params.item.text) fail('CODEX_STREAM_MISMATCH');
        ingest({ type: 'item.completed', item: { type: 'agent_message', text: item.text } });
      }
    } else if (method === 'turn/completed') {
      bindTurn(params.turn);
      if (params.turn.status !== 'completed') fail(errorCode(params.turn.error));
      if ([...items.values()].some(item => !item.complete)) fail('CODEX_RESULT_UNVERIFIED');
      ingest({ type: 'turn.completed' }); ended = true; io.end();
    } else if (method.startsWith('item/reasoning/') || method === 'turn/plan/updated') {
      notifyProgress(onProgress, { type: 'activity', kind: 'thinking' });
    } else fail('CODEX_UNEXPECTED_EVENT');
  }
  return { onLine,
    start(input) { io = input; send(1, 'initialize', { clientInfo: { name: 'agent_bridge', version: '0.1.0' },
      capabilities: { experimentalApi: false } }); },
    get threadId() { return threadId; },
    finish(execution, rollout) {
      const result = audit.finish(execution, rollout);
      return { ...result, ...(warnings.length ? { warnings: [...(result.warnings ?? []), ...warnings] } : {}),
        transport: 'codex-app-server-stdio' };
    },
  };
}
