import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ModelRelay, rateLimitDetails } from '../src/provider-relay.mjs';
import { ProviderPool } from '../src/provider-pool.mjs';
import { validateProviderConfig, createProviderServer } from '../src/provider-server.mjs';

const source = 'claude-sonnet-5-5', target = 'gpt-6.1-sol';
const configFor = () => ({ version: 1, port: 32147, globalLimit: 14,
  limits: { zcode: 2, cursor: 12, claude: 4, codex: 4 }, attemptTimeoutMs: 1000, requestTimeoutMs: 900000,
  fallback: { enabled: true, on: ['TIMEOUT', 'RATE_LIMITED'], reasoningEffort: 'xhigh', routes: { [source]: [target] } },
  routes: {
    [source]: { provider: 'claude', model: source, mode: 'delegate', description: 'Claude worker',
      reasoning: { values: ['high', 'xhigh'], default: 'high' }, sessionContinuity: true,
      execution: { mode: 'workspace-write', writeScope: './**', tools: ['Read', 'Edit(./**)'] } },
    [target]: { provider: 'codex', model: target, description: 'GPT worker',
      reasoning: { values: ['low', 'high', 'xhigh'], default: 'low' } },
  } });

async function fixture(run, failure = 'TIMEOUT') {
  const state = await mkdtemp(path.join(tmpdir(), 'bridge-claude-fallback-'));
  const config = configFor(), pool = new ProviderPool(config), calls = [];
  const invoke = async (route, prompt, options) => {
    calls.push({ route, prompt, options });
    if (route.provider === 'claude') {
      options.onNativeStarted?.();
      options.onPartial?.('unfinished Claude output');
      await writeFile(path.join(state, 'partial.txt'), 'completed Claude step');
      return { ok: false, code: failure, runId: 'claude-run', logs: state,
        execution: { pid: 42, exitCode: 1, cleanup: { status: 'terminated' } } };
    }
    assert.equal(await readFile(path.join(state, 'partial.txt'), 'utf8'), 'completed Claude step');
    assert.equal(pool.groups.claude.active, 0, 'Claude must release its slot before GPT starts');
    assert.equal(route.model, target); assert.equal(options.effort, 'xhigh');
    assert.match(prompt, /Inspect the current files and git status\/diff/);
    const nonce = /Required nonce: ([a-f0-9-]+)/.exec(prompt)[1];
    return { ok: true, code: 'VERIFIED', runId: 'gpt-run', actualModel: `codex/${target}`,
      actualEffort: 'xhigh', effortEvidence: 'codex-rollout-turn-context', execution: { exitCode: 0 },
      response: JSON.stringify({ nonce, content: 'continued work', tool_calls: [] }) };
  };
  const relay = new ModelRelay(config, pool, invoke, state);
  const body = { model: source, reasoning_effort: 'high', messages: [
    { role: 'system', content: `working directory: ${state}` }, { role: 'user', content: 'Finish the assigned change.' },
  ] };
  const options = { signal: new AbortController().signal, transport: { sessionId: 'fallback-session', sessionType: 'subagent' } };
  try { await run({ relay, config, pool, calls, body, options, state }); }
  finally { pool.close(); await rm(state, { recursive: true, force: true }); }
}

for (const code of ['TIMEOUT', 'RATE_LIMITED']) test(`Claude ${code} continues with GPT xhigh and persists the handoff`, async () => {
  await fixture(async ({ relay, pool, calls, body, options, state, config }) => {
    const deltas = [];
    const first = await relay.complete(body, { ...options, onContentDelta: text => deltas.push(text) });
    assert.equal(calls.length, 2); assert.deepEqual(deltas, []);
    assert.match(first.message.content, /gpt-6.1-sol \/ xhigh/);
    assert.equal(first.evidence.requestedModel, source); assert.equal(first.evidence.selected, target);
    assert.equal(first.evidence.effectiveEffort, 'xhigh'); assert.equal(first.evidence.actualEffort, 'xhigh');
    assert.equal(first.evidence.fallbackUsed, true);
    assert.deepEqual(first.evidence.attempts.map(attempt => [attempt.route, attempt.ok]), [[source, false], [target, true]]);
    const receipt = await relay.sessions.inspect({ sessionId: 'fallback-session', sessionType: 'subagent' });
    assert.equal(receipt.status, 'uncertain', 'Keep the failed Claude receipt as evidence');
    const restarted = new ModelRelay(config, pool, relay.invoke, state);
    const next = await restarted.complete({ ...body, messages: [...body.messages, { role: 'user', content: 'Continue with the next step.' }] }, options);
    assert.equal(calls.length, 3); assert.equal(calls.at(-1).route.provider, 'codex');
    assert.equal(next.evidence.selected, target);
    await assert.rejects(restarted.complete({ ...body, messages: [
      { role: 'system', content: `working directory: ${tmpdir()}` }, { role: 'user', content: 'Finish.' },
    ] }, options), { code: 'FALLBACK_SCOPE_CHANGED' });
  }, code);
});

test('fallback keeps host tool calls for the next ZCode turn', async () => {
  await fixture(async ({ relay, calls, body, options }) => {
    const original = relay.invoke;
    relay.invoke = async (route, prompt, settings) => {
      if (route.provider === 'claude') return original(route, prompt, settings);
      calls.push({ route, prompt, options: settings });
      const nonce = /Required nonce: ([a-f0-9-]+)/.exec(prompt)[1];
      return { ok: true, runId: 'gpt-tools', execution: {}, response: JSON.stringify({ nonce, content: '',
        tool_calls: [{ name: 'read_probe', arguments: { path: 'partial.txt' } }] }) };
    };
    const result = await relay.complete({ ...body, tools: [{ type: 'function', function: { name: 'read_probe',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }] }, options);
    assert.equal(result.message.tool_calls[0].function.name, 'read_probe');
    assert.equal(JSON.parse(result.message.tool_calls[0].function.arguments).path, 'partial.txt');
  });
});

test('HTTP streaming delivers the GPT answer after a Claude timeout', async () => {
  await fixture(async ({ relay, config, pool, body }) => {
    const server = createProviderServer({ config, pool, relay, token: 'fallback-test-key' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/chat/completions`, {
        method: 'POST', headers: { Authorization: 'Bearer fallback-test-key', 'x-session-id': 'stream-session', 'x-zcode-session-type': 'subagent' },
        body: JSON.stringify({ ...body, stream: true }), signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 200);
      const stream = await response.text();
      assert.match(stream, /continued work/); assert.match(stream, /gpt-6.1-sol/); assert.match(stream, /\[DONE\]/);
      assert.doesNotMatch(stream, /unfinished Claude output/);
    } finally { await server.shutdown(); }
  });
});

for (const code of ['CLAUDE_PERMISSION_DENIED', 'CLAUDE_MODEL_MISMATCH', 'CLAUDE_RESULT_FAILED', 'CANCELLED']) {
  test(`${code} cannot start GPT fallback`, async () => {
    await fixture(async ({ relay, calls, body, options }) => {
      await assert.rejects(relay.complete(body, options), { code }); assert.equal(calls.length, 1);
    }, code);
  });
}

test('unconfirmed Claude cleanup and cancelled requests cannot start GPT', async () => {
  await fixture(async ({ relay, pool, calls, body, options }) => {
    relay.invoke = async () => { calls.push('claude'); return { ok: false, code: 'TIMEOUT', execution: { cleanup: { status: 'unconfirmed' } } }; };
    await assert.rejects(relay.complete(body, options), { code: 'CLEANUP_UNCONFIRMED' });
    assert.equal(calls.length, 1); assert.equal(pool.stopped, true);
  });
  await fixture(async ({ relay, calls, body, options }) => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(relay.complete(body, { ...options, signal: controller.signal }));
    assert.equal(calls.length, 0);
  });
});

test('a timeout with earlier permission denials cannot bypass them through GPT', async () => {
  await fixture(async ({ relay, calls, body, options }) => {
    const original = relay.invoke;
    relay.invoke = async (route, prompt, settings) => ({ ...await original(route, prompt, settings),
      permissionDenied: true, permissionDenials: [{ tool_name: 'Bash' }] });
    await assert.rejects(relay.complete(body, options), { code: 'CLAUDE_PERMISSION_DENIED' });
    assert.equal(calls.length, 1);
  });
});

test('known Claude cooldown skips its queue and starts GPT immediately', async () => {
  await fixture(async ({ relay, pool, calls, body, options, state }) => {
    await writeFile(path.join(state, 'partial.txt'), 'completed Claude step');
    pool.limited('claude', 60000, true);
    const result = await relay.complete(body, options);
    assert.equal(calls.length, 1); assert.equal(calls[0].route.provider, 'codex');
    assert.equal(result.evidence.sourceCode, 'RATE_LIMITED'); assert.equal(pool.snapshot().queued, 0);
  });
});

test('disabled fallback and unmapped routes keep their original failure', async () => {
  for (const disable of [config => { config.fallback.enabled = false; }, config => { config.fallback.routes = {}; }]) {
    await fixture(async ({ relay, config, calls, body, options }) => {
      disable(config);
      await assert.rejects(relay.complete(body, options), { code: 'TIMEOUT' }); assert.equal(calls.length, 1);
    });
  }
});

test('only configured failure codes and supported fallback effort are accepted', () => {
  validateProviderConfig(configFor());
  for (const code of ['CANCELLED', 'CLAUDE_PERMISSION_DENIED', 'CLAUDE_RESULT_FAILED']) {
    const config = configFor(); config.fallback.on.push(code);
    assert.throws(() => validateProviderConfig(config), { code: 'INVALID_CONFIG' });
  }
  const bad = configFor(); bad.fallback.reasoningEffort = 'ultra';
  assert.throws(() => validateProviderConfig(bad), { code: 'MODEL_EFFORT_UNSUPPORTED' });
});

test('Claude machine rate-limit events are recognized but ordinary text is ignored', async () => {
  const state = await mkdtemp(path.join(tmpdir(), 'bridge-claude-rate-limit-'));
  try {
    for (const event of [
      { type: 'error', error: { status: 429 } },
      { type: 'error', error: { type: 'rate_limit_error' } },
      { type: 'assistant', error: 'rate_limit', message: { content: [] } },
      { type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } },
      { type: 'result', api_error_status: 429 },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'rate_limit and 429 are examples' }] } },
    ]) {
      await writeFile(path.join(state, 'events.jsonl'), JSON.stringify(event));
      const result = await rateLimitDetails({ code: 'CLAUDE_REPORTED_ERROR', logs: state });
      assert.equal(Boolean(result), Boolean(event.error || event.rate_limit_info || event.api_error_status));
    }
  } finally { await rm(state, { recursive: true, force: true }); }
});
