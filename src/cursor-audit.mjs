import { BridgeError } from './profiles.mjs';

export function parseCursorModels(text) {
  const models = [];
  for (const line of text.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)) {
    const match = /^([a-zA-Z0-9][a-zA-Z0-9._-]*) - (.+)$/.exec(line.trim());
    if (!match) continue;
    const label = match[2].replace(/\s+\((?:default|current)\)$/, '').trim();
    if (models.some(model => model.id === match[1])) throw new BridgeError('CURSOR_MODEL_CATALOG_INVALID', 'Duplicate model ID in Cursor catalog.');
    models.push({ id: match[1], label });
  }
  if (!models.length) throw new BridgeError('CURSOR_MODEL_CATALOG_INVALID', 'Cursor did not return a model catalog.');
  return models;
}

// Cursor's catalog label and the name the CLI reports at runtime can differ. The
// catalog drops tokens the runtime carries, for example "Grok 4.7  High" for a model
// the runtime calls "Grok 4.7 256K High", and "Grok 4.6" for "Grok 4.6 High".
// Verification therefore requires every token of the catalog label plus any tier
// keyword spelled out in the id, so an added token is tolerated while a missing tier
// or family token is rejected. Compact id aliases such as "xhigh" never appear in a
// runtime display name ("Extra High" does) and are not enforced. A leading "cursor-"
// namespace on a catalog id is not part of the model identity.
const tierKeywords = new Set(['low', 'medium', 'high', 'max', 'fast', 'mini', 'code']);
const tokenize = value => String(value).replace(/^cursor[-_]/, '').toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);

export function reportedModelMatches(model, reported) {
  if (typeof reported !== 'string' || !reported.trim()) return false;
  const reportedTokens = new Set(tokenize(reported));
  const required = [...tokenize(model.label), ...tokenize(model.id).filter(token => tierKeywords.has(token))];
  return required.every(token => reportedTokens.has(token));
}

export function createCursorAudit(model, requestedEffort = null) {
  let init, result, errorCode, finalResponse, eventCount = 0;
  const startedWriteCalls = new Set();
  const reject = code => { errorCode ??= code; throw new BridgeError(code, code); };
  function ingest(line) {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); }
    catch { if (init) reject('CURSOR_INVALID_EVENT'); return; }
    if (!event || typeof event !== 'object' || Array.isArray(event)) reject('CURSOR_INVALID_EVENT');
    eventCount++;
    if (result) reject('CURSOR_EVENT_AFTER_RESULT');
    if (event.type === 'system' && event.subtype === 'init') {
      if (init) reject('CURSOR_DUPLICATE_INIT');
      if (typeof event.session_id !== 'string' || !event.session_id) reject('CURSOR_SESSION_UNVERIFIED');
      if (!reportedModelMatches(model, event.model)) reject('CURSOR_MODEL_MISMATCH');
      init = { sessionId: event.session_id, reportedModel: event.model };
    } else if (event.type === 'error') reject('CURSOR_REPORTED_ERROR');
    else {
      if (!init) reject('CURSOR_INIT_MISSING');
      if (event.session_id !== undefined && event.session_id !== init.sessionId) reject('CURSOR_SESSION_MISMATCH');
      if (event.type === 'tool_call' && event.subtype === 'started') finalResponse = undefined;
      if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
        const parts = event.message.content;
        finalResponse = parts.length && parts.every(part => part.type === 'text' && typeof part.text === 'string')
          ? parts.map(part => part.text).join('') : undefined;
      }
      // Ask mode is read-only, so the host rejects write-family calls itself. A merely
      // attempted and rejected call did nothing; only one that actually ran - or whose
      // outcome we cannot track - is a relay violation.
      if (event.type === 'tool_call' && (event.subtype === 'started' || event.subtype === 'completed')) {
        const writeFamily = [...Object.keys(event.tool_call ?? {}), event.tool_call?.function?.name ?? '']
          .some(key => /^(write|edit|textEdit|applyPatch|delete|shell|terminal|bash)/i.test(key));
        const callId = event.call_id ?? event.toolCallId;
        if (event.subtype === 'started' && writeFamily) {
          if (typeof callId !== 'string') reject('CURSOR_UNEXPECTED_WRITE_TOOL');
          startedWriteCalls.add(callId);
        }
        if (event.subtype === 'completed' && writeFamily && startedWriteCalls.has(callId)) {
          startedWriteCalls.delete(callId);
          const payload = Object.values(event.tool_call ?? {})[0];
          if (!payload?.result || !('rejected' in payload.result)) reject('CURSOR_UNEXPECTED_WRITE_TOOL');
        }
      }
      if (event.type === 'result') {
        if (event.session_id !== init.sessionId) reject('CURSOR_SESSION_MISMATCH');
        result = event;
      }
    }
  }
  function finish(execution) {
    const base = { provider: 'cursor', agent: 'cursor', expectedModel: `cursor/${model.id}`, eventCount,
      requestedEffort: requestedEffort ?? null, actualEffort: model.effort ?? null,
      effortEvidence: 'cursor-native-model-selection' };
    const fail = code => ({ ...base, ok: false, code });
    if (errorCode) return fail(errorCode);
    if (startedWriteCalls.size) return fail('CURSOR_UNEXPECTED_WRITE_TOOL');
    if (execution.reason) return fail(execution.reason.toUpperCase());
    if (execution.exitCode !== 0) return fail('CURSOR_CLI_FAILED');
    if (!init || !result) return fail('CURSOR_RESULT_UNVERIFIED');
    if (result.subtype !== 'success' || result.is_error !== false || typeof result.result !== 'string') return fail('CURSOR_RESULT_FAILED');
    return { ...base, ok: true, code: 'VERIFIED', actualModel: `cursor/${model.id}`,
      modelEvidence: 'cursor-system-init', reportedModel: init.reportedModel,
      sessionId: init.sessionId, response: result.result, ...(finalResponse !== undefined ? { finalResponse } : {}) };
  }
  return { ingest, finish };
}
