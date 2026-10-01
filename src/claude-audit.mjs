import { BridgeError } from './profiles.mjs';

// Claude reports the requested id, optionally with a bracketed variant suffix
// such as claude-opus-5-5[1m]; anything else is a silent model fallback.
export function reportedModelMatches(model, reported) {
  return typeof reported === 'string' && (reported === model ||
    (reported.startsWith(model) && /^\[[^\]]+\]$/.test(reported.slice(model.length))));
}

export function createClaudeAudit(model, { expectedSessionId, effort = null, mode = 'read-only',
  toolNames = ['Read', 'Glob', 'Grep'] } = {}) {
  let init, result, errorCode, finalResponse, reportedEffort, eventCount = 0;
  let permissionDenials = [];
  const configuredTools = new Set(toolNames);
  const toolsUsed = new Set();
  let toolUseCount = 0;
  const reject = code => { errorCode ??= code; throw new BridgeError(code, code); };
  function ingest(line) {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); }
    catch { if (init) reject('CLAUDE_INVALID_EVENT'); return; }
    if (!event || typeof event !== 'object' || Array.isArray(event)) reject('CLAUDE_INVALID_EVENT');
    eventCount++;
    if (Array.isArray(event.permission_denials) && event.permission_denials.length) {
      permissionDenials = [...permissionDenials, ...event.permission_denials];
      if (mode !== 'workspace-write') reject('CLAUDE_PERMISSION_DENIED');
    }
    if (result) reject('CLAUDE_EVENT_AFTER_RESULT');
    if (event.type === 'system' && event.subtype === 'init') {
      if (init) reject('CLAUDE_DUPLICATE_INIT');
      if (typeof event.session_id !== 'string' || !event.session_id) reject('CLAUDE_SESSION_UNVERIFIED');
      if (expectedSessionId && event.session_id !== expectedSessionId) reject('CLAUDE_SESSION_MISMATCH');
      if (!reportedModelMatches(model, event.model)) reject('CLAUDE_MODEL_MISMATCH');
      if (event.effort !== undefined) {
        if (effort && event.effort !== effort) reject('CLAUDE_EFFORT_MISMATCH');
        reportedEffort = event.effort;
      }
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
          if (part?.type !== 'tool_use') continue;
          toolUseCount++;
          toolsUsed.add(part.name);
          if (!configuredTools.has(part.name)) reject('CLAUDE_UNAUTHORIZED_TOOL');
        }
      }
      if (event.type === 'result') result = event;
    }
  }
  function finish(execution) {
    const base = { provider: 'claude', agent: 'claude-code', expectedModel: `claude/${model}`, eventCount };
    const toolEvidence = { requestedTools: [...configuredTools].sort(),
      toolsUsed: [...toolsUsed].sort(), toolUseCount,
      permissionDenied: permissionDenials.length > 0, permissionDenials };
    const effortEvidence = reportedEffort === undefined
      ? { requestedEffort: effort, actualEffort: null, effortEvidence: 'not-reported-by-claude-init' }
      : { requestedEffort: effort, actualEffort: reportedEffort, effortEvidence: 'claude-system-init' };
    const fail = code => ({ ...base, ...toolEvidence, ...effortEvidence, ok: false, code });
    if (errorCode) return fail(errorCode);
    if (execution.reason) return fail(execution.reason.toUpperCase());
    if (execution.exitCode !== 0) return fail('CLAUDE_CLI_FAILED');
    if (expectedSessionId && !init) return fail('CLAUDE_SESSION_UNVERIFIED');
    if (!init || !result) return fail('CLAUDE_RESULT_UNVERIFIED');
    if (result.is_error !== false || result.api_error_status || typeof result.result !== 'string') return fail('CLAUDE_RESULT_FAILED');
    const completionCode = permissionDenials.length ? 'VERIFIED_WITH_PERMISSION_DENIALS' : 'VERIFIED';
    return { ...base, ...toolEvidence, ...effortEvidence, ok: true, code: completionCode, actualModel: `claude/${model}`,
      modelEvidence: 'claude-system-init', reportedModel: init.reportedModel,
      sessionId: init.sessionId, response: result.result, ...(finalResponse !== undefined ? { finalResponse } : {}) };
  }
  return { ingest, finish };
}
