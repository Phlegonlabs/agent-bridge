import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProviderServer, readProviderConfig } from '../src/provider-server.mjs';
import { ProviderPool } from '../src/provider-pool.mjs';
import { ModelRelay } from '../src/provider-relay.mjs';
import { BridgeError } from '../src/profiles.mjs';
import { readTaskStatus, watchTaskStatus } from '../src/task-status-client.mjs';

function gate() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(work, check) {
  const end = Date.now() + 1500;
  let value;
  do { value = await work(); if (check(value)) return value; await pause(10); } while (Date.now() < end);
  assert.fail(`State did not settle: ${JSON.stringify(value)}`);
}
async function fixture(work, fail = false) {
  const state = await mkdtemp(path.join(tmpdir(), 'bridge-progress-'));
  const config = await readProviderConfig(path.join(process.cwd(), 'config/native-provider.json'));
  config.fallback.enabled = false; config.limits.claude = 1;
  config.claudeDelegate = { attemptTimeoutMs: 1000, requestTimeoutMs: 5000 };
  const pool = new ProviderPool(config), pending = gate(), started = gate(); let calls = 0;
  const relay = new ModelRelay(config, pool, async (_route, _prompt, options) => {
    calls++; options.onNativeStarted?.(); options.onProgress({ type: 'running', runId: 'native-run' });
    options.onProgress({ type: 'activity', kind: 'tool_started', command: 'PRIVATE_CANARY' });
    started.resolve(); await pending.promise;
    options.onProgress({ type: 'finishing' });
    if (fail) throw new BridgeError('CLAUDE_MODEL_MISMATCH', 'Synthetic audit failure.');
    return { ok: true, code: 'VERIFIED', sessionId: options.session.id, runId: 'native-run',
      actualModel: 'claude-opus-5-5', response: 'audited answer', execution: { pid: 42, exitCode: 0 } };
  }, state);
  const token = 'a'.repeat(64), server = createProviderServer({ config, token, pool, relay, heartbeatMs: 10 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${token}`, 'x-session-id': 'workflow-actor', 'x-zcode-session-type': 'subagent' };
  const body = { model: 'claude-opus-5-5', stream: true, messages: [
    { role: 'system', content: `working directory: ${state}` }, { role: 'user', content: 'PRIVATE_CANARY' },
  ] };
  const lookup = async (suffix = '', extra = {}) => {
    const response = await fetch(`${base}/v1/tasks${suffix}`, { headers: { ...headers, ...extra }, signal: AbortSignal.timeout(2000) });
    return { status: response.status, value: await response.json() };
  };
  const request = signal => fetch(`${base}/v1/chat/completions`, { method: 'POST', headers,
    body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(4000) });
  try { await work({ state, config, pool, server, base, token, headers, body, lookup, request, pending, started, calls: () => calls }); }
  finally { pending.resolve(); await server.shutdown(); await rm(state, { recursive: true, force: true }); }
}

test('subagent task lookup survives disconnect and shows queued, native activity and audited completion', async () => {
  await fixture(async ({ pool, lookup, request, pending, started, calls }) => {
    const release = await pool.acquire('claude');
    const controller = new AbortController(), response = await request(controller.signal);
    const id = response.headers.get('x-agent-bridge-task-id'); assert.ok(id);
    const queued = await eventually(lookup, value => value.value.tasks[0]?.state === 'queued');
    assert.equal(queued.value.tasks[0].startedAt, null);
    release(); await started.promise;
    const task = (await lookup(`/${id}`)).value.tasks[0];
    assert.equal(task.state, 'running'); assert.equal(task.lastActivityKind, 'tool_started');
    controller.abort(); await response.body.cancel().catch(() => {});
    await pause(35);
    const quiet = (await lookup(`/${id}`)).value.tasks[0];
    assert.equal(quiet.lastActivityAt, task.lastActivityAt);
    assert.equal(quiet.deadlineAt, task.deadlineAt);
    assert.doesNotMatch(JSON.stringify(quiet), /PRIVATE_CANARY|workflow-actor|sessionId|command/);
    assert.equal((await lookup('', { 'x-session-id': 'other' })).value.tasks.length, 0);
    assert.equal((await lookup('', { Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await lookup('', { Origin: 'https://example.test' })).status, 403);
    const joined = await request(); assert.equal(joined.headers.get('x-agent-bridge-task-id'), id);
    pending.resolve(); assert.match(await joined.text(), /audited answer/);
    const finished = (await lookup(`/${id}`)).value.tasks[0];
    assert.equal(finished.state, 'finished'); assert.equal(finished.actualModel, 'claude-opus-5-5');
    assert.equal(calls(), 1); assert.equal((await lookup('/00000000-0000-4000-8000-000000000000')).status, 404);
  });
});

test('native completion cannot certify a failed audit', async () => {
  await fixture(async ({ request, pending, started, lookup }) => {
    const response = await request(); await started.promise;
    const id = response.headers.get('x-agent-bridge-task-id'); pending.resolve();
    assert.match(await response.text(), /CLAUDE_MODEL_MISMATCH/);
    const task = (await lookup(`/${id}`)).value.tasks[0];
    assert.equal(task.state, 'failed'); assert.equal(task.actualModel, null);
  }, true);
});

test('status client reads existing credentials privately and never creates a token', async () => {
  await fixture(async ({ state, config, server, token, request, started, pending }) => {
    const file = path.join(state, 'config.json'); config.port = server.address().port;
    await writeFile(file, JSON.stringify(config)); await writeFile(path.join(state, 'token'), token);
    const response = await request(); await started.promise;
    const taskId = response.headers.get('x-agent-bridge-task-id');
    const value = await readTaskStatus({ state, config: file, taskId });
    assert.equal(value.tasks[0].state, 'running'); assert.doesNotMatch(JSON.stringify(value), new RegExp(token));
    const absent = path.join(state, 'absent');
    await assert.rejects(readTaskStatus({ state: absent, config: file }), { code: 'STATUS_UNAVAILABLE' });
    await assert.rejects(readFile(path.join(absent, 'token')), { code: 'ENOENT' });
    pending.resolve(); await response.text();
  });
});

test('finite status watch stops at a terminal task without dispatching work', async () => {
  let reads = 0; const emitted = [];
  await watchTaskStatus({ taskId: '00000000-0000-4000-8000-000000000000', watchMs: 1000 }, value => emitted.push(value),
    async () => { reads++; return { available: true, tasks: [{ state: 'finished' }] }; });
  assert.equal(reads, 1); assert.equal(emitted.length, 1);
});
