import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProviderPool } from '../src/provider-pool.mjs';
import { ModelRelay, renderDelegation } from '../src/provider-relay.mjs';
import { validateProviderConfig } from '../src/provider-server.mjs';

const fullConfig = routes => ({ version: 1, port: 32147, globalLimit: 14,
  limits: { zcode: 2, cursor: 12, claude: 4 }, attemptTimeoutMs: 1000, requestTimeoutMs: 2000,
  fallback: { enabled: false, on: [], routes: {} }, routes });
const delegateRoute = { provider: 'claude', model: 'claude-opus-5-5', mode: 'delegate', description: 'x' };

test('claude provider routes must declare delegate mode and nothing else may', () => {
  validateProviderConfig(fullConfig({ 'claude-opus-5-5': delegateRoute }));
  assert.throws(() => validateProviderConfig(fullConfig({ 'claude-opus-5-5': { ...delegateRoute, mode: undefined } })), { code: 'INVALID_CONFIG' });
  assert.throws(() => validateProviderConfig(fullConfig({ 'claude-opus-5-5': { ...delegateRoute, mode: 'relay' } })), { code: 'INVALID_CONFIG' });
  assert.throws(() => validateProviderConfig(fullConfig({ 'cursor-x': { provider: 'cursor', model: 'm', mode: 'delegate', description: 'x' } })), { code: 'INVALID_CONFIG' });
});

const body = { model: 'claude-opus-5-5', messages: [
  { role: 'system', content: 'You are ZCode.\n- working directory: C:\\Users\\mps19\\Documents\\GitHub\\agent-bridge' },
  { role: 'user', content: 'Check the README heading.' },
  { role: 'assistant', content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: 'read_probe', arguments: '{"path":"README.md"}' } }] },
  { role: 'tool', tool_call_id: 't1', content: '# Agent Bridge\n...' },
  { role: 'user', content: 'Report the heading and one improvement idea.' },
] };
const stubResponse = { runId: 'run-1', ok: true, code: 'VERIFIED', actualModel: 'claude/claude-opus-5-5', execution: {} };

async function withDelegate(messages, run, onContentDelta) {
  const state = await mkdtemp(path.join(tmpdir(), 'bridge-delegate-'));
  const pool = new ProviderPool({ limits: { claude: 2 } });
  const captured = [];
  const relay = new ModelRelay({ routes: { 'claude-opus-5-5': { provider: 'claude', model: 'claude-opus-5-5', mode: 'delegate' } },
    attemptTimeoutMs: 1000, fallback: { enabled: false, on: [], routes: {} } }, pool,
    async (route, task, options) => {
      // The temp state directory is removed before the caller resumes, so any
      // filesystem facts about the context file must be captured here.
      const pointer = /the file (".*?")/.exec(task);
      const contextSize = pointer ? (await stat(JSON.parse(pointer[1]))).size : null;
      captured.push({ route, task, options, contextSize });
      return { ...stubResponse, response: 'DELEGATED_OK' };
    }, state);
  try {
    const result = await relay.complete({ ...body, messages }, { signal: new AbortController().signal, onContentDelta,
      transport: { sessionId: 'sess-1', sessionType: 'subagent' } });
    return { result, captured, state, pool };
  } finally { await rm(state, { recursive: true, force: true }); pool.close(); }
}

test('a delegate turn renders the transcript as data and returns plain content', async () => {
  const { result, captured } = await withDelegate(body.messages);
  assert.equal(result.message.role, 'assistant'); assert.equal(result.message.content, 'DELEGATED_OK');
  const { task, options } = captured[0];
  assert.match(task, /Current task: Report the heading/);
  assert.match(task, /User: Check the README heading\./);
  assert.match(task, /Tool result: # Agent Bridge/);
  assert.ok(!/envelope|model-relay|nonce/i.test(task), 'delegation task must not carry the relay contract');
  assert.equal(options.cwd, 'C:\\Users\\mps19\\Documents\\GitHub\\agent-bridge');
  assert.equal(result.evidence.mode, 'delegated-task');
  assert.equal(result.evidence.zcodeSessionId, 'sess-1');
});

test('delegate rejects forced tool choice before spawning a worker', async () => {
  const state = await mkdtemp(path.join(tmpdir(), 'bridge-delegate-'));
  const pool = new ProviderPool({ limits: { claude: 2 } });
  let calls = 0;
  const relay = new ModelRelay({ routes: { 'claude-opus-5-5': { provider: 'claude', model: 'claude-opus-5-5', mode: 'delegate' } },
    attemptTimeoutMs: 1000, fallback: { enabled: false, on: [], routes: {} } }, pool, async () => { calls++; return stubResponse; }, state);
  await assert.rejects(relay.complete({ ...body, tool_choice: 'required' }, { signal: new AbortController().signal }), { code: 'UNSUPPORTED_REQUEST' });
  assert.equal(calls, 0);
  await rm(state, { recursive: true, force: true }); pool.close();
});

test('large transcripts move to a plain context file with the ask inline', async () => {
  // Per-message rendering clips at 6000 chars, so overflow needs many messages
  // (real sub-agent medians: 19 messages, ~100 KB).
  const filler = Array.from({ length: 8 }, (_, index) => ({ role: 'user', content: `block ${index}: ${'y'.repeat(6000)}` }));
  const big = [...(body.messages ?? []), ...filler, { role: 'user', content: 'Summarize and finish.' }];
  const { captured } = await withDelegate(big);
  const { task, options } = captured[0];
  assert.ok(task.length < 2000, 'pointer task stays small');
  assert.match(task, /context-/);
  assert.match(task, /Current task: Summarize and finish\./);
  const file = JSON.parse(task.match(/the file (".*?")/)[1]);
  assert.equal(path.dirname(file), options.directory);
  assert.equal(captured[0].contextSize > 40000, true);
});

test('streaming requests pass raw text deltas through to the caller', async () => {
  let seen;
  const delta = text => { seen = text; };
  const { captured } = await withDelegate(body.messages, null, delta);
  assert.equal(captured[0].options.onPartial, delta);
});

test('renderDelegation extracts cwd and keeps the header free of relay language', () => {
  const { task, cwd, contextFile } = renderDelegation(body);
  assert.equal(contextFile, null);
  assert.equal(cwd, 'C:\\Users\\mps19\\Documents\\GitHub\\agent-bridge');
  assert.ok(task.startsWith('You are handling one task'));
  assert.ok(!/envelope|nonce/i.test(task));
});
