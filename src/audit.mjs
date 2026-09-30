import { BridgeError } from './profiles.mjs';

// Accept evidence only from native event envelopes, never from model-written prose.
export function createAudit(agent, expectedModel, expectedTask, transportFile) {
  const scheduled = new Map(), children = new Map(), models = new Map(), outputs = new Map();
  const toolErrors = new Map();
  let rootSession, result, protocolError, eventCount = 0;
  function reject(code) { protocolError ??= code; throw new BridgeError(code, code); }
  function ingest(line) {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); }
    catch { return; } // CLI may print a bounded startup notice outside the JSON stream.
    if (!event || typeof event !== 'object' || Array.isArray(event)) return;
    if (result) reject('EVENT_AFTER_RESULT');
    if (event.type === 'result') { result = event; return; }
    if (typeof event.eventId !== 'string' || typeof event.sessionId !== 'string' || !Number.isInteger(event.seq)) return;
    eventCount++;
    if (event.type === 'turn.started') rootSession ??= event.sessionId;
    const p = event.payload ?? {};
    if (event.type === 'tool.updated' && p.kind === 'scheduled' && event.sessionId === rootSession && p.source !== 'subagent') {
      // The dispatcher may inspect only the exact relay transport before handing it to the child.
      if (transportFile && p.toolName === 'Read' && p.input?.file_path === transportFile) return;
      if (p.toolName !== 'Agent') reject('UNEXPECTED_PARENT_TOOL');
      if (p.input?.subagent_type !== agent || p.input?.run_in_background === true || p.input?.prompt !== expectedTask) reject('WRONG_DISPATCH');
      scheduled.set(p.toolCallId, p.input.subagent_type);
      if (scheduled.size > 1) reject('DUPLICATE_DISPATCH');
    }
    if (p.agentType === agent && typeof p.childSessionId === 'string' && typeof p.parentToolCallId === 'string') {
      children.set(p.childSessionId, p.parentToolCallId);
    }
    if (p.modelRequestSessionType === 'subagent' && typeof p.providerId === 'string' && typeof p.modelId === 'string' && typeof p.requestId === 'string') {
      const id = event.sessionId;
      const model = `${p.providerId}/${p.modelId}`;
      const values = models.get(id) ?? new Set(); values.add(model); models.set(id, values);
      if (expectedModel && model !== expectedModel) reject('MODEL_MISMATCH');
    }
    if (event.type === 'tool.updated' && p.kind === 'error' && scheduled.has(p.toolCallId)) {
      toolErrors.set(p.toolCallId, { code: p.error?.code ?? 'AGENT_ERROR' });
    }
    if (event.type === 'turn.completed' && event.sessionId !== rootSession) {
      outputs.set(event.sessionId, { response: p.response, resultType: p.resultType });
    }
  }
  function finish(processResult) {
    const fail = code => ({ ok: false, code, agent, expectedModel, eventCount, parentSessionId: rootSession ?? null });
    if (protocolError) return fail(protocolError);
    if (processResult.reason) return fail(processResult.reason.toUpperCase());
    if (processResult.exitCode !== 0) return fail('CLI_FAILED');
    if (!result || result.sessionId !== rootSession) return fail('MISSING_RESULT');
    if (scheduled.size !== 1) return fail('DISPATCH_UNVERIFIED');
    if (toolErrors.size) return fail([...toolErrors.values()][0].code === 'provider_not_found' ? 'PROVIDER_UNAVAILABLE' : 'AGENT_FAILED');
    const callId = [...scheduled.keys()][0];
    const selected = [...children.entries()].filter(([, id]) => id === callId);
    if (selected.length !== 1) return fail('CHILD_UNVERIFIED');
    const childId = selected[0][0];
    const observed = [...(models.get(childId) ?? [])];
    if (observed.length !== 1 || expectedModel && observed[0] !== expectedModel) return fail('MODEL_UNVERIFIED');
    const output = outputs.get(childId);
    if (!output || output.resultType !== 'success' || typeof output.response !== 'string') return fail('CHILD_RESULT_UNVERIFIED');
    return { ok: true, code: 'VERIFIED', agent, expectedModel, actualModel: observed[0],
      parentSessionId: rootSession, childSessionId: childId, eventCount, response: output.response };
  }
  return { ingest, finish };
}
