import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProviderServer, readProviderConfig } from '../src/provider-server.mjs';
import { ProviderPool } from '../src/provider-pool.mjs';
import { ModelRelay } from '../src/provider-relay.mjs';

function gate() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(work) {
  const state = await mkdtemp(path.join(tmpdir(), 'bridge-reconnect-'));
  const config = await readProviderConfig(path.join(process.cwd(), 'config/native-provider.json'));
  config.fallback.enabled = false; config.attemptTimeoutMs = 1000; config.requestTimeoutMs = 5000;
  const pool = new ProviderPool(config), pending = gate(), began = gate();
  let calls = 0, workerSignal;
  const relay = new ModelRelay(config, pool, async (route, prompt, settings) => {
    calls++; workerSignal = settings.signal; settings.onNativeStarted?.();
    assert.equal(settings.onPartial, undefined, 'advisory native text must not escape owned execution');
    await writeFile(path.join(state, 'completed-step.txt'), `${calls}`); began.resolve();
    await pending.promise;
    return { ok: true, code: 'VERIFIED', sessionId: settings.session.id, runId: 'synthetic',
      response: 'audited final answer', execution: { pid: 42, exitCode: 0 } };
  }, state);
  const server = createProviderServer({ config, pool, relay, token: 'test', heartbeatMs: 20 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = { model: 'claude-opus-5-5', stream: true, messages: [
    { role: 'system', content: `working directory: ${state}` }, { role: 'user', content: 'one long task' },
  ] };
  const request = (value = body, signal = AbortSignal.timeout(4000), auth = 'test') => fetch(`${base}/v1/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'x-session-id': 'one-session',
      'x-zcode-session-type': 'subagent' }, body: JSON.stringify(value), signal,
  });
  const status = async () => (await (await fetch(`${base}/status`, { headers: { Authorization: 'Bearer test' },
    signal: AbortSignal.timeout(1000) })).json()).delegates;
  try { await work({ request, status, body, pending, began, server, relay, state,
    calls: () => calls, signal: () => workerSignal }); }
  finally { pending.resolve(); await server.shutdown(); await rm(state, { recursive: true, force: true }); }
}

test('HTTP reconnects join one writable execution and replay its audited result', async () => {
  await fixture(async ({ request, status, body, pending, began, state, calls, signal }) => {
    for (let i = 0; i < 20; i++) {
      const controller = new AbortController(); const response = await request(body, controller.signal);
      assert.equal(response.status, 200); await began.promise;
      controller.abort(); await response.body.cancel().catch(() => {});
      const deadline = Date.now() + 1000;
      while ((await status()).waiters && Date.now() < deadline) await pause(5);
      assert.equal((await status()).waiters, 0);
    }
    assert.equal(calls(), 1); assert.equal(signal().aborted, false);
    assert.equal(await readFile(path.join(state, 'completed-step.txt'), 'utf8'), '1');
    assert.equal((await request({ ...body, model: 'claude-sonnet-5-5' })).status, 409);
    assert.equal((await request(body, AbortSignal.timeout(1000), 'wrong')).status, 401);
    const joined = await request(body); pending.resolve();
    const stream = await joined.text(); assert.match(stream, /audited final answer/); assert.match(stream, /\[DONE\]/);
    const replay = await request({ ...body, stream: false });
    assert.equal((await replay.json()).choices[0].message.content, 'audited final answer');
    assert.equal(calls(), 1); assert.equal((await status()).active, 0);
  });
});

test('server shutdown awaits detached delegate cleanup', async () => {
  await fixture(async ({ request, body, began, server, pending, signal, relay }) => {
    const cleaned = gate(), aborted = gate();
    const original = relay.invoke;
    relay.invoke = async (...parameters) => {
      const settings = parameters[2];
      settings.signal.addEventListener('abort', () => aborted.resolve(), { once: true });
      const result = await original(...parameters); await cleaned.promise; return result;
    };
    const controller = new AbortController(), response = await request(body, controller.signal);
    await began.promise; controller.abort(); await response.body.cancel().catch(() => {});
    let stopped = false; const stopping = server.shutdown().then(() => { stopped = true; });
    await aborted.promise; assert.equal(signal().aborted, true); assert.equal(stopped, false);
    pending.resolve(); cleaned.resolve(); await stopping;
    assert.equal(stopped, true);
  });
});

test('ordinary relay requests still cancel on HTTP disconnect', async () => {
  await fixture(async ({ request, body, relay }) => {
    const started = gate(), aborted = gate();
    relay.complete = async (_body, { signal }) => {
      started.resolve(); await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      aborted.resolve(); throw new Error('cancelled');
    };
    const controller = new AbortController();
    const response = await request({ ...body, model: 'gpt-6.1-sol' }, controller.signal);
    await started.promise; controller.abort(); await response.body.cancel().catch(() => {});
    await aborted.promise;
  });
});
