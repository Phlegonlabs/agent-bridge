import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudit } from '../src/audit.mjs';

const task = 'Return a fixed probe.';
const native = (type, payload = {}, sessionId = 'parent') => ({ type, payload, sessionId, eventId: crypto.randomUUID(), seq: 1 });
const dispatch = () => native('tool.updated', { kind: 'scheduled', toolCallId: 'call-1', toolName: 'Agent', input: { subagent_type: 'explorer', prompt: task, run_in_background: false } });
function successEvents() {
  return [native('turn.started'), dispatch(),
    native('session.updated', { agentType: 'explorer', childSessionId: 'child', parentToolCallId: 'call-1' }),
    native('session.updated', { modelRequestSessionType: 'subagent', providerId: 'provider', modelId: 'model-a', requestId: 'request-1' }, 'child'),
    native('turn.completed', { response: 'ACTUAL_CHILD_RESULT', resultType: 'success' }, 'child'),
    { type: 'result', sessionId: 'parent', response: 'Untrusted parent paraphrase.' }];
}
function evaluate(events) {
  const audit = createAudit('explorer', 'provider/model-a', task);
  for (const event of events) { try { audit.ingest(JSON.stringify(event)); } catch {} }
  return audit.finish({ exitCode: 0, reason: null });
}
test('requires correlated child lifecycle, model request, and completed output', () => {
  const result = evaluate(successEvents());
  assert.equal(result.ok, true); assert.equal(result.actualModel, 'provider/model-a');
  assert.equal(result.response, 'ACTUAL_CHILD_RESULT');
});
test('zero CLI exit cannot turn an Agent error into success', () => {
  const result = evaluate([native('turn.started'), dispatch(), native('tool.updated', { kind: 'error', toolCallId: 'call-1', error: { code: 'provider_not_found' } }), { type: 'result', sessionId: 'parent', response: 'Success!' }]);
  assert.equal(result.code, 'PROVIDER_UNAVAILABLE'); assert.equal(result.ok, false);
});
test('model-written claims cannot replace runtime evidence', () => {
  const events = successEvents().filter(e => e.payload?.requestId === undefined);
  assert.equal(evaluate(events).code, 'MODEL_UNVERIFIED');
});
test('a mismatched model fails before output is accepted', () => {
  const events = successEvents(); events[3].payload.modelId = 'model-b';
  assert.equal(evaluate(events).code, 'MODEL_MISMATCH');
});
test('requires exact task forwarding and rejects extra parent tools', () => {
  const events = successEvents(); events[1].payload.input.prompt = 'Different task';
  assert.equal(evaluate(events).code, 'WRONG_DISPATCH');
  events[1].payload.toolName = 'Bash';
  assert.equal(evaluate(events).code, 'UNEXPECTED_PARENT_TOOL');
});
test('requires child identity correlation and terminal result', () => {
  const events = successEvents(); events[2].payload.parentToolCallId = 'unrelated';
  assert.equal(evaluate(events).code, 'CHILD_UNVERIFIED');
  assert.equal(evaluate(successEvents().slice(0, -1)).code, 'MISSING_RESULT');
});
test('rejects events after terminal result and duplicate dispatch', () => {
  assert.equal(evaluate([...successEvents(), native('turn.completed')]).code, 'EVENT_AFTER_RESULT');
  const extra = dispatch(); extra.payload.toolCallId = 'call-2';
  const events = successEvents(); events.splice(2, 0, extra);
  assert.equal(evaluate(events).code, 'DUPLICATE_DISPATCH');
});
test('timeout and cancellation cannot return success', () => {
  for (const reason of ['timeout', 'cancelled', 'output_limit']) {
    const audit = createAudit('explorer', 'provider/model-a', task);
    successEvents().forEach(x => audit.ingest(JSON.stringify(x)));
    assert.equal(audit.finish({ exitCode: 0, reason }).ok, false);
  }
});
