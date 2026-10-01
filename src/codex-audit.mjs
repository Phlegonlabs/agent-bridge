import { BridgeError } from './profiles.mjs';

// exec --json only reports thread/turn/item events; the dispatched model lives in
// the session rollout's turn_context records, so runCodex supplies them at finish.
const ALLOWED_ITEM_TYPES = new Set(['agent_message', 'reasoning', 'todo_list']);

export function createCodexAudit(model, requestedEffort = null) {
  let threadId, turnCompleted, finalResponse, errorCode, eventCount = 0;
  const reject = code => { errorCode ??= code; throw new BridgeError(code, code); };
  function ingest(line) {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); }
    catch { reject('CODEX_INVALID_EVENT'); return; }
    if (!event || typeof event !== 'object' || Array.isArray(event)) reject('CODEX_INVALID_EVENT');
    eventCount++;
    if (errorCode) return;
    if (event.type === 'error') reject('CODEX_REPORTED_ERROR');
    if (turnCompleted) reject('CODEX_EVENT_AFTER_TURN');
    if (event.type === 'thread.started') {
      if (threadId) reject('CODEX_DUPLICATE_THREAD');
      if (typeof event.thread_id !== 'string' || !event.thread_id) reject('CODEX_SESSION_UNVERIFIED');
      threadId = event.thread_id;
    } else {
      if (!threadId) reject('CODEX_THREAD_MISSING');
      if (event.type === 'item.completed' && event.item && typeof event.item === 'object') {
        if (event.item.type === 'agent_message') {
          if (typeof event.item.text === 'string') finalResponse = event.item.text;
        } else if (!ALLOWED_ITEM_TYPES.has(event.item.type)) {
          // The relay task allows only built-in reads; a shell command, file edit,
          // MCP call or web search is outside the read-only worker contract.
          reject('CODEX_UNEXPECTED_TOOL');
        }
      } else if (event.type === 'turn.completed') {
        turnCompleted = event;
      }
    }
  }
  function finish(execution, rollout = {}) {
    const actualEffort = typeof rollout.reportedEffort === 'string' ? rollout.reportedEffort : null;
    const effortEvidence = actualEffort === null ? 'not-reported-by-codex-rollout' : 'codex-rollout-turn-context';
    const base = { provider: 'codex', agent: 'codex-cli', expectedModel: `codex/${model}`, eventCount,
      requestedEffort: requestedEffort ?? null, actualEffort, effortEvidence };
    const fail = code => ({ ...base, ok: false, code });
    if (errorCode) return fail(errorCode);
    if (execution.reason) return fail(execution.reason.toUpperCase());
    if (execution.exitCode !== 0) return fail('CODEX_CLI_FAILED');
    if (!threadId || !turnCompleted) return fail('CODEX_RESULT_UNVERIFIED');
    if (typeof finalResponse !== 'string') return fail('CODEX_RESULT_UNVERIFIED');
    if (rollout.sessionConfirmed !== true) return fail('CODEX_SESSION_UNVERIFIED');
    if (rollout.reportedModel !== model) return fail('CODEX_MODEL_MISMATCH');
    if (requestedEffort !== null) {
      if (actualEffort === null) return fail('CODEX_EFFORT_UNVERIFIED');
      if (actualEffort !== requestedEffort) return fail('CODEX_EFFORT_MISMATCH');
    }
    return { ...base, ok: true, code: 'VERIFIED', actualModel: `codex/${model}`,
      modelEvidence: 'codex-rollout-turn-context', reportedModel: rollout.reportedModel,
      sessionId: threadId, response: finalResponse, finalResponse };
  }
  return { ingest, finish, get threadId() { return threadId; } };
}
