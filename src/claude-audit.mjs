import { BridgeError } from './profiles.mjs';

const RELAY_TOOLS = new Set(['Read', 'Glob', 'Grep']);

// Claude reports the requested id, optionally with a bracketed variant suffix
// such as claude-opus-5-5[1m]; anything else is a silent model fallback.
export function reportedModelMatches(model, reported) {
  return typeof reported === 'string' && (reported === model ||
    (reported.startsWith(model) && /^\[[^\]]+\]$/.test(reported.slice(model.length))));
}

export function createClaudeAudit(model) {
  let init, result, errorCode, finalResponse, eventCount = 0;
  const reject = code => { errorCode ??= code; throw new BridgeError(code, code); };
  function ingest(line) {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); }
    catch { if (init) reject('CLAUDE_INVALID_EVENT'); return; }
    if (!event || typeof event !== 'object' || Array.isArray(event)) reject('CLAUDE_INVALID_EVENT');
    eventCount++;
    if (result) reject('CLAUDE_EVENT_AFTER_RESULT');
    if (event.type === 'system' && event.subtype === 'init') {
      if (init) reject('CLAUDE_DUPLICATE_INIT');
      if (typeof event.session_id !== 'string' || !event.session_id) reject('CLAUDE_SESSION_UNVERIFIED');
      if (!reportedModelMatches(model, event.model)) reject('CLAUDE_MODEL_MISMATCH');
      init = { sessionId: event.session_id, reportedModel: event.model };
    } else if (event.type === 'error') {
      reject('CLAUDE_REPORTED_ERROR');
    } else {
      if (!init) reject('CLAUDE_INIT_MISSING');
      if (event.session_id !== undefined && event.session_id !== init.sessionId) reject('CLAUDE_SESSION_MISMATCH');
      if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
        const parts = event.message.content;
        finalResponse = parts.length && parts.every(part => part.type === 'text' && typeof part.text === 'string')
          ? parts.map(part => part.text).join('') : undefined;
        // The CLI's tool allowlist already blocks writes; this re-checks what
        // actually ran so a flag regression cannot pass unnoticed.
        for (const part of parts) {
          if (part?.type === 'tool_use' && !RELAY_TOOLS.has(part.name)) reject('CLAUDE_UNEXPECTED_WRITE_TOOL');
        }
      }
      if (event.type === 'result') result = event;
    }
  }
  function finish(execution) {
    const base = { provider: 'claude', agent: 'claude-code', expectedModel: `claude/${model}`, eventCount };
    const fail = code => ({ ...base, ok: false, code });
    if (errorCode) return fail(errorCode);
    if (execution.reason) return fail(execution.reason.toUpperCase());
    if (execution.exitCode !== 0) return fail('CLAUDE_CLI_FAILED');
    if (!init || !result) return fail('CLAUDE_RESULT_UNVERIFIED');
    if (result.is_error !== false || result.api_error_status || typeof result.result !== 'string') return fail('CLAUDE_RESULT_FAILED');
    return { ...base, ok: true, code: 'VERIFIED', actualModel: `claude/${model}`,
      modelEvidence: 'claude-system-init', reportedModel: init.reportedModel,
      sessionId: init.sessionId, response: result.result, ...(finalResponse !== undefined ? { finalResponse } : {}) };
  }
  return { ingest, finish };
}
