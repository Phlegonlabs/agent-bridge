import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexAppServer } from '../src/codex-app-server.mjs';

function fixture(overrides = {}) {
  const sent = [], partial = [], progress = [];
  const protocol = createCodexAppServer({ model: 'gpt-6.1-sol', effort: 'high', cwd: process.cwd(), task: 'PROBE',
    onPartial: text => partial.push(text), onProgress: event => progress.push(event), ...overrides });
  protocol.start({ write: text => sent.push(JSON.parse(text)), end: () => sent.push('EOF') });
  const feed = event => protocol.onLine(JSON.stringify(event));
  feed({ id: 1, result: {} });
  const ready = (changes = {}) => {
    feed({ id: 2, result: { model: 'gpt-6.1-sol', reasoningEffort: 'high', cwd: process.cwd(),
      approvalPolicy: 'never', sandbox: { type: 'readOnly' }, thread: { id: 'thread' }, ...changes } });
    feed({ id: 3, result: { turn: { id: 'turn', status: 'inProgress', items: [] } } });
    feed({ method: 'turn/started', params: { threadId: 'thread', turn: { id: 'turn' } } });
  };
  const notify = (method, value = {}) => feed({ method, params: { threadId: 'thread', turnId: 'turn', ...value } });
  return { protocol, feed, ready, notify, sent, partial, progress };
}
const item = { id: 'answer', type: 'agentMessage', text: '' };

test('native text deltas arrive before completion and preserve audited model and effort', () => {
  const f = fixture(); f.ready(); f.notify('item/started', { item });
  f.notify('item/agentMessage/delta', { itemId: 'answer', delta: 'first' });
  assert.deepEqual(f.partial, ['first']); assert.notEqual(f.sent.at(-1), 'EOF');
  f.notify('item/agentMessage/delta', { itemId: 'answer', delta: ' second' });
  f.notify('item/completed', { item: { ...item, text: 'first second' } });
  f.notify('turn/completed', { turn: { id: 'turn', status: 'completed' } });
  assert.equal(f.sent.at(-1), 'EOF');
  const result = f.protocol.finish({ exitCode: 0 }, { sessionConfirmed: true, reportedModel: 'gpt-6.1-sol', reportedEffort: 'high' });
  assert.equal(result.ok, true); assert.equal(result.response, 'first second');
  assert.equal(result.transport, 'codex-app-server-stdio');
  assert.equal(f.protocol.finish({ exitCode: 0 }, { sessionConfirmed: false }).ok, false);
});

test('dispatch metadata is verified before the task reaches native execution', () => {
  for (const [changes, code] of [[{ model: 'gpt-6-sol' }, 'CODEX_MODEL_MISMATCH'],
    [{ reasoningEffort: 'low' }, 'CODEX_EFFORT_MISMATCH'], [{ approvalPolicy: 'on-request' }, 'CODEX_ISOLATION_UNVERIFIED'],
    [{ sandbox: { type: 'dangerFullAccess' } }, 'CODEX_ISOLATION_UNVERIFIED']]) {
    const f = fixture(); assert.throws(() => f.ready(changes), { code });
    assert.equal(f.sent.some(event => event?.method === 'turn/start'), false);
  }
});

test('wrong identities, deltas before item start and conflicting completed text fail closed', () => {
  let f = fixture(); f.ready();
  assert.throws(() => f.notify('item/agentMessage/delta', { itemId: 'answer', delta: 'x' }), { code: 'CODEX_INVALID_ITEM' });
  f = fixture(); f.ready(); f.notify('item/started', { item });
  assert.throws(() => f.notify('item/agentMessage/delta', { threadId: 'foreign', itemId: 'answer', delta: 'x' }), { code: 'CODEX_SESSION_UNVERIFIED' });
  assert.throws(() => f.notify('item/agentMessage/delta', { turnId: 'foreign', itemId: 'answer', delta: 'x' }), { code: 'CODEX_TURN_MISMATCH' });
  f.notify('item/agentMessage/delta', { itemId: 'answer', delta: 'x' });
  assert.throws(() => f.notify('item/completed', { item: { ...item, text: 'different' } }), { code: 'CODEX_STREAM_MISMATCH' });
});

test('native tools, approvals and MCP startup cannot escape the relay boundary', () => {
  for (const type of ['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'webSearch', 'collabAgentToolCall']) {
    const f = fixture(); f.ready();
    assert.throws(() => f.notify('item/started', { item: { id: 'tool', type } }), { code: 'CODEX_UNEXPECTED_TOOL' });
  }
  const f = fixture(); f.ready();
  assert.throws(() => f.feed({ id: 'approval', method: 'item/commandExecution/requestApproval', params: {} }), { code: 'CODEX_UNEXPECTED_TOOL' });
  assert.throws(() => f.notify('mcpServer/startupStatus/updated'), { code: 'CODEX_ISOLATION_UNVERIFIED' });
});

test('structured policy rejection never continues while retryable connection errors report safe status', () => {
  const f = fixture(); f.ready();
  f.notify('error', { willRetry: true, error: { message: 'PRIVATE_NATIVE_ERROR', codexErrorInfo: 'serverOverloaded' } });
  assert.equal(f.progress.at(-1).kind, 'native_retry'); assert.deepEqual(f.partial, []);
  for (const error of [{ message: 'This content was flagged for possible policy violations.' },
    { message: 'PRIVATE_NATIVE_ERROR', codexErrorInfo: 'cyberPolicy' }]) {
    assert.throws(() => f.notify('error', { willRetry: true, error }), { code: 'CODEX_CONTENT_REJECTED' });
  }
  assert.throws(() => f.notify('error', { willRetry: false, error: { message: 'Disconnected' } }), { code: 'CODEX_REPORTED_ERROR' });
});

test('reasoning payloads stay private and oversized native deltas stop at the response limit', () => {
  const f = fixture(); f.ready(); f.notify('item/started', { item: { id: 'thought', type: 'reasoning' } });
  f.notify('item/reasoning/textDelta', { itemId: 'thought', delta: 'PRIVATE_REASONING' });
  assert.doesNotMatch(JSON.stringify(f.partial) + JSON.stringify(f.progress), /PRIVATE_REASONING/);
  f.notify('item/started', { item });
  assert.throws(() => f.notify('item/agentMessage/delta', { itemId: 'answer', delta: 'x'.repeat(512 * 1024 + 1) }), { code: 'RESPONSE_TOO_LARGE' });
});
