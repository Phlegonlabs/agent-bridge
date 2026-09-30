import test from 'node:test';
import assert from 'node:assert/strict';
import { createCursorAudit, parseCursorModels } from '../src/cursor-audit.mjs';
import { runCursor } from '../src/cursor.mjs';

const selected = { id: 'composer-2.5', label: 'Composer 2.5' };
const init = { type: 'system', subtype: 'init', session_id: 'session', model: selected.label };
const terminal = { type: 'result', subtype: 'success', session_id: 'session', is_error: false, result: 'DONE' };
function evaluate(events, execution = { exitCode: 0, reason: null }) {
  const audit = createCursorAudit(selected);
  for (const event of events) { try { audit.ingest(typeof event === 'string' ? event : JSON.stringify(event)); } catch {} }
  return audit.finish(execution);
}

test('Cursor catalog maps official IDs to labels without selecting Auto', () => {
  assert.deepEqual(parseCursorModels('Available models\nauto - Auto (default)\ncomposer-2.5 - Composer 2.5\n'), [
    { id: 'auto', label: 'Auto' }, selected,
  ]);
  assert.throws(() => parseCursorModels('Sign in first'), { code: 'CURSOR_MODEL_CATALOG_INVALID' });
  assert.throws(() => parseCursorModels('x - X\nx - Y'), { code: 'CURSOR_MODEL_CATALOG_INVALID' });
});

test('Cursor requires native session/model evidence and terminal success', () => {
  const result = evaluate([init, terminal]);
  assert.equal(result.ok, true); assert.equal(result.actualModel, 'cursor/composer-2.5');
  assert.equal(result.modelEvidence, 'cursor-system-init'); assert.equal(result.response, 'DONE');
  assert.equal(evaluate([init]).code, 'CURSOR_RESULT_UNVERIFIED');
  assert.equal(evaluate([terminal]).ok, false);
});

test('Cursor rejects model fallback even if the assistant claims the expected model', () => {
  assert.equal(evaluate([{ ...init, model: 'Other model' }, { ...terminal, result: 'I used Composer 2.5' }]).code, 'CURSOR_MODEL_MISMATCH');
  assert.equal(evaluate([{ type: 'assistant', message: { content: [{ text: 'Composer 2.5' }] } }, terminal]).ok, false);
});

test('Cursor rejects another session, duplicate initialization, and extra terminal data', () => {
  assert.equal(evaluate([init, { ...terminal, session_id: 'other' }]).code, 'CURSOR_SESSION_MISMATCH');
  assert.equal(evaluate([init, init, terminal]).code, 'CURSOR_DUPLICATE_INIT');
  assert.equal(evaluate([init, terminal, terminal]).code, 'CURSOR_EVENT_AFTER_RESULT');
});

test('Cursor tolerates catalog labels that omit tokens the runtime reports', () => {
  const check = (model, reported) => {
    const audit = createCursorAudit(model);
    for (const event of [{ ...init, model: reported }, terminal]) { try { audit.ingest(JSON.stringify(event)); } catch {} }
    return audit.finish({ exitCode: 0, reason: null });
  };
  // Cursor's catalog label drops a context token its runtime name carries.
  assert.equal(check({ id: 'grok-4.7-high', label: 'Grok 4.7  High' }, 'Grok 4.7 256K High').ok, true);
  assert.equal(check({ id: 'grok-4.7-medium', label: 'Grok 4.7  Medium' }, 'Grok 4.7 256K Medium').ok, true);
  // Cursor's catalog label drops a tier that the id and the runtime name still carry.
  assert.equal(check({ id: 'cursor-grok-4.6-high', label: 'Grok 4.6' }, 'Grok 4.6 High').ok, true);
  assert.equal(check({ id: 'kimi-k3-max', label: 'Kimi K3' }, 'Kimi K3 Max').ok, true);
  // A compact id alias Cursor never prints at runtime is not required.
  assert.equal(check({ id: 'grok-4.7-xhigh', label: 'Grok 4.7  Extra High' }, 'Grok 4.7 256K Extra High').ok, true);
  // Tolerated loosening: a reported token that no expected id or label carries is accepted.
  assert.equal(check({ id: 'composer-2.5', label: 'Composer 2.5' }, 'Composer 2.5 Fast').ok, true);
  // A missing family or tier token is still a mismatch.
  assert.equal(check({ id: 'grok-4.7-low', label: 'Grok 4.7  Low' }, 'Grok 4.7 256K High').code, 'CURSOR_MODEL_MISMATCH');
  assert.equal(check({ id: 'cursor-grok-4.6-high', label: 'Grok 4.6' }, 'Grok 4.6 Low').code, 'CURSOR_MODEL_MISMATCH');
  assert.equal(check({ id: 'composer-2.5-fast', label: 'Composer 2.5 Fast' }, 'Composer 2.5').code, 'CURSOR_MODEL_MISMATCH');
  assert.equal(check({ id: 'composer-2.5', label: 'Composer 2.5' }, 'Other model').code, 'CURSOR_MODEL_MISMATCH');
  assert.equal(check({ id: 'composer-2.5', label: 'Composer 2.5' }, '').code, 'CURSOR_MODEL_MISMATCH');
});

test('Cursor errors, malformed output and exit failures cannot become success', () => {
  assert.equal(evaluate([init, { ...terminal, is_error: true }]).code, 'CURSOR_RESULT_FAILED');
  assert.equal(evaluate([init, { type: 'error' }, terminal]).code, 'CURSOR_REPORTED_ERROR');
  assert.equal(evaluate([init, '{not json']).code, 'CURSOR_INVALID_EVENT');
  for (const execution of [{ exitCode: 1 }, { exitCode: 0, reason: 'timeout' }, { exitCode: 0, reason: 'cancelled' }]) {
    assert.equal(evaluate([init, terminal], execution).ok, false);
  }
});
test('Cursor relay can use the final native assistant message without pre-tool narration', () => {
  const assistant = text => ({ type: 'assistant', session_id: 'session', message: { content: [{ type: 'text', text }] } });
  const read = { type: 'tool_call', subtype: 'started', session_id: 'session', tool_call: { readToolCall: {} } };
  const result = evaluate([init, assistant('Reading transport.'), read, assistant('{"answer":"DONE"}'), { ...terminal, result: 'Reading transport.\n{"answer":"DONE"}' }]);
  assert.equal(result.finalResponse, '{"answer":"DONE"}');
  assert.match(result.response, /Reading transport/);
  assert.equal(evaluate([init, assistant('Reading transport.'), read, terminal]).finalResponse, undefined);
});

test('Cursor allows read events and rejects executed write tools', () => {
  const event = { type: 'tool_call', subtype: 'started', session_id: 'session', tool_call: { readToolCall: {} } };
  assert.equal(evaluate([init, event, terminal]).ok, true);
  assert.equal(evaluate([init, { ...event, tool_call: { writeToolCall: {} } }, terminal]).code, 'CURSOR_UNEXPECTED_WRITE_TOOL');
  assert.equal(evaluate([init, { ...event, tool_call: { function: { name: 'Shell' } } }, terminal]).code, 'CURSOR_UNEXPECTED_WRITE_TOOL');
  // A write-family call the host rejected in read-only ask mode did nothing and is tolerated.
  const shellStarted = { type: 'tool_call', subtype: 'started', session_id: 'session', call_id: 'call-1', tool_call: { shellToolCall: { command: 'Get-Content transport.txt' } } };
  const shellRejected = { type: 'tool_call', subtype: 'completed', session_id: 'session', call_id: 'call-1', tool_call: { shellToolCall: { result: { rejected: { command: 'Get-Content transport.txt', reason: '' } } } } };
  assert.equal(evaluate([init, shellStarted, shellRejected, terminal]).ok, true);
  // A write-family call that actually ran is still a violation.
  const shellExecuted = { type: 'tool_call', subtype: 'completed', session_id: 'session', call_id: 'call-1', tool_call: { shellToolCall: { result: { output: 'done' } } } };
  assert.equal(evaluate([init, shellStarted, shellExecuted, terminal]).code, 'CURSOR_UNEXPECTED_WRITE_TOOL');
  // A write-family call whose completion never arrived cannot be cleared.
  assert.equal(evaluate([init, shellStarted, terminal]).code, 'CURSOR_UNEXPECTED_WRITE_TOOL');
});

test('Cursor requires an explicit model before launching anything', async () => {
  await assert.rejects(runCursor({ cwd: '.', task: 'test', model: 'auto' }), { code: 'CURSOR_MODEL_REQUIRED' });
  await assert.rejects(runCursor({ cwd: '.', task: 'test' }), { code: 'CURSOR_MODEL_REQUIRED' });
});
