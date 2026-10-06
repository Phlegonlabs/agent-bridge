import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createProviderServer, readProviderConfig } from '../src/provider-server.mjs';
import { ProviderPool } from '../src/provider-pool.mjs';
import { ModelRelay } from '../src/provider-relay.mjs';
import { DelegateRequests, delegateSessionKey } from '../src/delegate-requests.mjs';

const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function fixture(work, mode = 'valid') {
  const directory = path.resolve('.bridge/sol-streaming-' + randomUUID()); await mkdir(directory, { recursive: true });
  const config = await readProviderConfig('config/native-provider.json');
  config.attemptTimeoutMs = 1000; config.requestTimeoutMs = 3000;
  config.fallback = { enabled: true, on: ['TIMEOUT', 'RATE_LIMITED'], routes: { 'gpt-6.1-sol': ['gpt-6-sol'] } };
  const pool = new ProviderPool(config), pending = gate(), began = gate(); let calls = 0, signal;
  const relay = new ModelRelay(config, pool, async (_route, prompt, settings) => {
    calls++; signal = settings.signal;
    settings.onProgress?.({ type: 'running' }); settings.onProgress?.({ type: 'activity', kind: 'native_retry' });
    const nonce = /Required nonce: ([a-f0-9-]+)/.exec(prompt)[1];
    const prefix = `{"nonce": "${nonce}", "content": "first `;
    if (!['rejected', 'tool', 'structured', 'rate-limit', 'correction-admission'].includes(mode)) settings.onPartial?.(prefix);
    began.resolve(); await pending.promise;
    if (['rejected', 'timeout', 'rate-limit'].includes(mode)) return { ok: false,
      code: mode === 'rejected' ? 'CODEX_CONTENT_REJECTED' : mode === 'rate-limit' ? 'RATE_LIMITED' : 'TIMEOUT',
      runId: 'synthetic', execution: { exitCode: 1 } };
    if (mode === 'correction-admission') {
      pool.groups.codex.cooldownUntil = Date.now() + 5000;
      return { ok: true, response: 'malformed envelope', runId: 'synthetic', execution: { exitCode: 0 } };
    }
    let response;
    if (mode === 'tool') response = JSON.stringify({ nonce, content: null, tool_calls: [{ name: 'read_probe', arguments: { path: 'fixture' } }] });
    else if (mode === 'structured') { assert.equal(settings.onPartial, undefined); response = JSON.stringify({ nonce, content: '{}', tool_calls: [] }); }
    else {
      const suffix = `second", "tool_calls": ${mode === 'bad-final' ? '[{"name":"undeclared","arguments":{}}]'
        : mode === 'mixed' ? '[{"name":"read_probe","arguments":{"path":"fixture"}}]' : '[]'}}`;
      settings.onPartial?.(suffix); response = prefix + suffix;
    }
    return { ok: true, code: 'VERIFIED', response, runId: 'synthetic', actualModel: 'codex/gpt-6.1-sol', execution: { exitCode: 0 } };
  }, directory);
  const server = createProviderServer({ config, pool, relay, token: 'synthetic-sol-key', heartbeatMs: 10 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = { model: 'gpt-6.1-sol', stream: true, messages: [{ role: 'user', content: 'PRIVATE_PROMPT_CANARY' }] };
  const headers = { Authorization: 'Bearer synthetic-sol-key', 'x-session-id': 'synthetic-sol-session', 'x-zcode-session-type': 'subagent' };
  const request = (value = body, abort = AbortSignal.timeout(4000), session = true) => fetch(base + '/v1/chat/completions', {
    method: 'POST', headers: session ? headers : { Authorization: headers.Authorization }, body: JSON.stringify(value), signal: abort });
  try { await work({ request, body, pending, began, pool, config, calls: () => calls, signal: () => signal,
    lookup: async id => (await (await fetch(base + '/v1/tasks/' + id, { headers, signal: AbortSignal.timeout(1000) })).json()).tasks[0] }); }
  finally { pending.resolve(); await server.shutdown(); }
}

async function* frames(response) {
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (frame === 'data: [DONE]') { yield { done: true }; continue; }
        if (frame.startsWith('data: ')) yield JSON.parse(frame.slice(6));
      }
    }
  } finally { reader.releaseLock(); }
}
async function untilContent(stream) {
  let text = '', status = '';
  while (!text) {
    const { value, done } = await stream.next(); assert.equal(done, false);
    const delta = value.choices?.[0]?.delta;
    text += delta?.content ?? ''; status += delta?.reasoning_content ?? '';
  }
  return { text, status };
}

test('Sol HTTP reconnect preserves one worker, native deltas, task ID and original deadline', async () => {
  await fixture(async ({ request, body, pending, calls, signal, lookup }) => {
    const abort = new AbortController(), first = await request(body, abort.signal), firstFrames = frames(first);
    const id = first.headers.get('x-agent-bridge-task-id'), before = await lookup(id);
    const initial = await untilContent(firstFrames);
    assert.equal(initial.text, 'first '); assert.match(initial.status, /Agent Bridge 執行狀態/);
    assert.doesNotMatch(initial.status, /PRIVATE_PROMPT_CANARY|first|synthetic-sol-session/);
    assert.equal(calls(), 1);
    abort.abort(); await firstFrames.return();
    const retry = await request(); assert.equal(retry.headers.get('x-agent-bridge-task-id'), id);
    assert.equal(signal().aborted, false); assert.equal((await lookup(id)).deadlineAt, before.deadlineAt);
    const stream = frames(retry), replay = await untilContent(stream); assert.equal(replay.text, 'first ');
    const busy = await request({ ...body, messages: [{ role: 'user', content: 'different turn' }] });
    assert.equal(busy.status, 409); assert.equal((await busy.json()).error.code, 'SESSION_BUSY');
    pending.resolve(); let content = replay.text, stopped = false, done = false;
    for await (const frame of stream) {
      content += frame.choices?.[0]?.delta?.content ?? '';
      stopped ||= frame.choices?.[0]?.finish_reason === 'stop'; done ||= frame.done === true;
    }
    assert.equal(content, 'first second'); assert.equal(stopped && done, true); assert.equal(calls(), 1);
    const cached = await request(); let cachedText = '';
    for await (const frame of frames(cached)) cachedText += frame.choices?.[0]?.delta?.content ?? '';
    assert.equal(cachedText, content); assert.equal(calls(), 1);
  });
});

test('a streamed invalid envelope or native timeout cannot launch correction or fallback after content', async () => {
  for (const mode of ['bad-final', 'timeout']) await fixture(async ({ request, pending, calls }) => {
    const response = await request(), stream = frames(response); const initial = await untilContent(stream);
    pending.resolve(); let error, successful = false;
    for await (const frame of stream) {
      error ??= frame.error;
      successful ||= frame.done === true || frame.choices?.[0]?.finish_reason === 'stop';
    }
    assert.equal(initial.text, 'first '); assert.ok(error); assert.equal(successful, false); assert.equal(calls(), 1);
  }, mode);
});

test('Sol content rejection remains explicit and returns HTTP 400 before streaming', async () => {
  await fixture(async ({ request, pending, calls }) => {
    const responsePromise = request({ model: 'gpt-6.1-sol', stream: false, messages: [{ role: 'user', content: 'probe' }] });
    pending.resolve(); const response = await responsePromise;
    assert.equal(response.status, 400); const result = await response.json();
    assert.equal(result.error.code, 'CODEX_CONTENT_REJECTED'); assert.match(result.error.message, /content checks/);
    assert.equal(calls(), 1);
  }, 'rejected');
});

test('validated tool calls retain accompanying content while structured responses stay buffered', async () => {
  for (const mode of ['tool', 'structured', 'mixed']) await fixture(async ({ request, body, pending }) => {
    const value = mode !== 'structured' ? { ...body, tools: [{ type: 'function', function: { name: 'read_probe',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }] }
      : { ...body, response_format: { type: 'json_object' } };
    const response = await request(value), stream = frames(response); let content = '', calls = [], terminal;
    if (mode === 'mixed') content = (await untilContent(stream)).text;
    pending.resolve();
    for await (const frame of stream) {
      content += frame.choices?.[0]?.delta?.content ?? ''; calls.push(...(frame.choices?.[0]?.delta?.tool_calls ?? []));
      if (frame.choices?.[0]?.finish_reason) terminal = frame.choices[0].finish_reason;
    }
    assert.equal(content, mode === 'structured' ? '{}' : mode === 'mixed' ? 'first second' : '');
    assert.equal(terminal, mode !== 'structured' ? 'tool_calls' : 'stop');
    if (mode !== 'structured') assert.equal(calls[0].function.name, 'read_probe');
  }, mode);
});

test('owned stream observers detach, replay once and enforce the response cap', async () => {
  const registry = new DelegateRequests(), pending = gate(); let emit;
  const turn = { sessionKey: delegateSessionKey('synthetic'), fingerprint: 'turn', timeoutMs: 1000,
    start: async (_signal, _progress, send) => { emit = send; await pending.promise; return { message: { content: 'ab' } }; } };
  try {
    const first = registry.attach(turn), observed = []; first.subscribe(text => observed.push(text));
    await Promise.resolve(); emit('a'); first.detach(); emit('b'); assert.deepEqual(observed, ['a']);
    const second = registry.attach(turn), replay = []; second.subscribe(text => replay.push(text)); assert.deepEqual(replay, ['ab']);
    assert.throws(() => emit('x'.repeat(512 * 1024)), { code: 'RESPONSE_TOO_LARGE' });
    pending.resolve(); await second.outcome;
  } finally { pending.resolve(); await registry.shutdown(); }
});

test('an identical owned Sol request reaches recovered capacity after certified cooldown or queue rejection', async () => {
  for (const admission of ['cooldown', 'queue']) await fixture(async ({ request, body, pending, pool, config, calls }) => {
    config.fallback.enabled = false;
    const releases = admission === 'queue' ? await Promise.all(Array.from({ length: config.limits.codex }, () => pool.acquire('codex'))) : [];
    if (admission === 'queue') pool.maxQueue = 0;
    else pool.groups.codex.cooldownUntil = Date.now() + 5000;
    try {
      const first = await request({ ...body, stream: false });
      assert.equal(first.status, 429); assert.equal((await first.json()).error.code, admission === 'queue' ? 'QUEUE_FULL' : 'RATE_LIMITED');
      assert.equal(calls(), 0);
      for (const release of releases) release(); pool.groups.codex.cooldownUntil = 0; pool.maxQueue = 100;
      pending.resolve();
      const second = await request({ ...body, stream: false });
      assert.equal(second.status, 200); assert.equal((await second.json()).choices[0].message.content, 'first second');
      assert.equal(calls(), 1);
    } finally { for (const release of releases) release(); }
  });
});

test('a later fallback admission rejection retains uncertainty from an earlier native attempt', async () => {
  await fixture(async ({ request, body, pending, pool, calls }) => {
    pool.groups.codex.cooldownUntil = 0;
    pending.resolve();
    // The first failed native attempt imposes its real cooldown. Its fallback
    // then fails before invocation, but the combined request remains uncertain.
    const first = await request({ ...body, stream: false });
    assert.notEqual(first.status, 200);
    const count = calls();
    pool.groups.codex.cooldownUntil = 0;
    const second = await request({ ...body, stream: false });
    assert.notEqual(second.status, 200); assert.equal(calls(), count);
  }, 'rate-limit');
});

test('a corrective admission rejection retains a successful malformed native attempt', async () => {
  await fixture(async ({ request, body, pending, pool, config, calls }) => {
    config.fallback.enabled = false; pending.resolve();
    const first = await request({ ...body, stream: false });
    assert.equal(first.status, 429); assert.equal(calls(), 1);
    pool.groups.codex.cooldownUntil = 0;
    const second = await request({ ...body, stream: false });
    assert.equal(second.status, 429); assert.equal(calls(), 1);
  }, 'correction-admission');
});
