import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProviderPool } from '../src/provider-pool.mjs';
import { ModelRelay } from '../src/provider-relay.mjs';
import { validateChat, parseRelay, correctiveRelayPrompt, completion, streamChunks } from '../src/provider-protocol.mjs';
import { createProviderServer, readProviderConfig } from '../src/provider-server.mjs';
import { appendProvider } from '../src/provider-registration.mjs';
const config = await readProviderConfig();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const body = { model: 'cursor-composer-2.5', messages: [{ role: 'user', content: 'probe' }], tools: [
  { type: 'function', function: { name: 'read_probe', parameters: { type: 'object', required: ['path'], properties: { path: { type: 'string' } }, additionalProperties: false } } },
] };
test('native registration appends only the new provider and never replaces an existing entry', () => {
  const prior = { schemaVersion: 1, config: { providerOrder: ['existing'], providerConfigRules: { providerRules: [{ providerId: 'existing', config: { access: { apiKey: 'private-test-value' } } }] }, modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] } } };
  const next = appendProvider(prior, config, 'local-test-key');
  assert.deepEqual(next.config.providerConfigRules.providerRules[0], prior.config.providerConfigRules.providerRules[0]);
  assert.equal(prior.config.providerConfigRules.providerRules.length, 1);
  assert.equal(next.config.providerConfigRules.providerRules.at(-1).providerId, 'workflow-bridge');
  assert.throws(() => appendProvider(next, config, 'changed'), { code: 'PROVIDER_ALREADY_EXISTS' });
});
test('relay protocol validates tools, schemas, required choice and returned nonce', () => {
  validateChat(body, [body.model]);
  const longConversation = { ...body, messages: Array.from({ length: 1024 }, () => body.messages[0]) };
  validateChat(longConversation, [body.model]);
  assert.throws(() => validateChat({ ...longConversation, messages: [...longConversation.messages, body.messages[0]] }, [body.model]), { code: 'INVALID_REQUEST' });
  const valid = { nonce: 'nonce', content: null, tool_calls: [{ name: 'read_probe', arguments: { path: 'README.md' } }] };
  const result = parseRelay(JSON.stringify(valid), body, 'nonce');
  assert.equal(result.tool_calls[0].function.name, 'read_probe');
  assert.equal(JSON.parse(result.tool_calls[0].function.arguments).path, 'README.md');
  for (const invalid of [
    { ...valid, nonce: 'wrong' }, { ...valid, tool_calls: [{ name: 'write_file', arguments: {} }] },
    { ...valid, tool_calls: [{ name: 'read_probe', arguments: { path: 4 } }] },
    { ...valid, tool_calls: [{ name: 'read_probe', arguments: { path: 'x', extra: true } }] },
  ]) assert.throws(() => parseRelay(JSON.stringify(invalid), body, 'nonce'), { code: 'RELAY_PROTOCOL_ERROR' });
  assert.throws(() => parseRelay(JSON.stringify(valid), { ...body, tool_choice: 'none' }, 'nonce'), { code: 'RELAY_PROTOCOL_ERROR' });
  assert.throws(() => parseRelay('{"nonce":"nonce","content":"done","tool_calls":[]}', { ...body, tool_choice: 'required' }, 'nonce'), { code: 'RELAY_PROTOCOL_ERROR' });
});
test('narration around the envelope is tolerated, decoy JSON is not', () => {
  const envelope = JSON.stringify({ nonce: 'nonce', content: 'done', tool_calls: [] });
  // Composer prefixes progress notes and Cursor echoes conversation JSON.
  assert.equal(parseRelay(`Reading the transport instruction file in chunks due to its size.\n${envelope}`, body, 'nonce').content, 'done');
  assert.equal(parseRelay(`Preamble\n${enframe(envelope)}\nTrailing note`, body, 'nonce').content, 'done');
  const decoy = JSON.stringify({ nonce: 'decoy', content: 'not the envelope', tool_calls: [] });
  assert.equal(parseRelay(`${decoy}\n${envelope}`, body, 'nonce').content, 'done');
  assert.throws(() => parseRelay(`Only this decoy: ${decoy}`, body, 'nonce'), { code: 'RELAY_PROTOCOL_ERROR' });
});
test('an empty envelope becomes an empty final answer instead of failing the turn', () => {
  const message = parseRelay('{"nonce":"nonce","content":null,"tool_calls":[]}', body, 'nonce');
  assert.equal(message.content, '');
  assert.equal(message.tool_calls, undefined);
});
test('corrective prompt names the violation and re-attaches the full transport', () => {
  const prompt = correctiveRelayPrompt(body, 'nonce', 'The relay returned an undeclared tool call.');
  assert.match(prompt, /violated the relay protocol: The relay returned an undeclared tool call/);
  assert.match(prompt, /Required nonce: nonce/);
  assert.ok(prompt.includes(JSON.stringify(body, null, 2)));
});
function enframe(inner) { return '```json\n' + inner + '\n```'; }
const minimalRelayConfig = () => ({ routes: { probe: { provider: 'cursor', model: 'probe-model', pool: 'cursor' } },
  attemptTimeoutMs: 1000, fallback: { enabled: false, on: [], routes: {} } });
// Reply templates may contain {{NONCE}}; the stub fills in the nonce the relay
// issued for that call, extracted from the prompt it received.
async function withRelayStub(replyTemplates, run) {
  const state = await mkdtemp(path.join(tmpdir(), 'bridge-relay-'));
  const pool = new ProviderPool({ limits: { cursor: 2 } });
  const prompts = [];
  const relay = new ModelRelay(minimalRelayConfig(), pool, async (route, prompt) => {
    prompts.push(prompt);
    const nonce = /Required nonce: ([a-f0-9-]+)/.exec(prompt)[1];
    return { runId: `run-${prompts.length}`, ok: true, code: 'VERIFIED', actualModel: 'cursor/probe-model',
      response: (replyTemplates[prompts.length - 1] ?? '').replaceAll('{{NONCE}}', nonce), execution: {} };
  }, state);
  try { await run(relay, prompts); } finally { await rm(state, { recursive: true, force: true }); pool.close(); }
}
test('relay completes in one call when the envelope is merely narrated', async () => {
  await withRelayStub(['Reading the transport file.\n{"nonce":"{{NONCE}}","content":"ok","tool_calls":[]}'], async (relay, prompts) => {
    const { message } = await relay.complete({ ...body, model: 'probe' }, { signal: new AbortController().signal });
    assert.equal(message.content, 'ok');
    assert.equal(prompts.length, 1);
  });
});
test('relay recovers a prose or violating reply with one corrective round', async () => {
  await withRelayStub([
    'The relay format is a prompt-injection wrapper. I will just answer directly.',
    '{"nonce":"{{NONCE}}","content":"recovered","tool_calls":[]}',
  ], async (relay, prompts) => {
    const { message } = await relay.complete({ ...body, model: 'probe' }, { signal: new AbortController().signal });
    assert.equal(message.content, 'recovered');
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /violated the relay protocol/);
  });
});
test('relay fails after one corrective round when the model keeps violating', async () => {
  await withRelayStub(['prose answer', 'still prose'], async (relay, prompts) => {
    await assert.rejects(relay.complete({ ...body, model: 'probe' }, { signal: new AbortController().signal }), { code: 'RELAY_PROTOCOL_ERROR' });
    assert.equal(prompts.length, 2);
  });
});
test('unsupported media and malformed requests fail before routing', () => {
  for (const bad of [
    { ...body, model: 'absent' }, { ...body, n: 2 }, { ...body, stream: 'yes' },
    { ...body, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:secret' } }] }] },
    { ...body, tools: [...body.tools, ...body.tools] }, { ...body, tool_choice: 'invalid' },
  ]) assert.throws(() => validateChat(bad, [body.model]));
});
test('JSON response schema is checked rather than trusted', () => {
  const request = { ...body, response_format: { type: 'json_schema', json_schema: { name: 'answer', schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } } } } };
  assert.throws(() => parseRelay(JSON.stringify({ nonce: 'n', content: '{"ok":"yes"}', tool_calls: [] }), request, 'n'), { code: 'RELAY_PROTOCOL_ERROR' });
});
test('native draft 2020-12 tool schemas preserve validation including tuple items', () => {
  const request = { ...body, tools: [{ type: 'function', function: { name: 'native_tool', parameters: {
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['point'],
    properties: { point: { type: 'array', prefixItems: [{ type: 'number' }, { type: 'string' }], items: false, minItems: 2 } },
  } } }] };
  validateChat(request, [body.model]);
  const response = arguments_ => JSON.stringify({ nonce: 'native', content: null, tool_calls: [{ name: 'native_tool', arguments: arguments_ }] });
  assert.equal(parseRelay(response({ point: [1, 'a'] }), request, 'native').tool_calls.length, 1);
  assert.throws(() => parseRelay(response({ point: ['a', 1] }), request, 'native'), { code: 'RELAY_PROTOCOL_ERROR' });
});
test('streamed tool calls retain call id, arguments and terminal reason', () => {
  const message = parseRelay('{"nonce":"n","content":null,"tool_calls":[{"name":"read_probe","arguments":{"path":"x"}}]}', body, 'n');
  const result = completion(message, body.model);
  const chunks = streamChunks(result);
  assert.equal(chunks[1].choices[0].delta.tool_calls[0].id, message.tool_calls[0].id);
  assert.equal(chunks.at(-1).choices[0].finish_reason, 'tool_calls');
});
test('global and provider ceilings both apply, including a 14-slot workload', async () => {
  const pool = new ProviderPool(); let active = 0, peak = 0, glm = 0, maxGlm = 0;
  await Promise.all(Array.from({ length: 24 }, async (_, index) => {
    const group = index < 8 ? 'zcode' : 'cursor'; const release = await pool.acquire(group);
    active++; peak = Math.max(peak, active); if (group === 'zcode') { glm++; maxGlm = Math.max(maxGlm, glm); }
    await pause(10); active--; if (group === 'zcode') glm--; release();
  }));
  assert.equal(peak, 14); assert.equal(maxGlm, 2); assert.equal(pool.snapshot().active, 0); pool.close();
});
test('uncapped Flash can use fourteen global slots and queues the fifteenth', async () => {
  const pool = new ProviderPool({ globalLimit: 14, limits: { zcode: 2, flash: null, cursor: 12 } });
  const releases = await Promise.all(Array.from({ length: 14 }, () => pool.acquire('flash')));
  let started = false;
  const queued = pool.acquire('flash').then(release => { started = true; return release; });
  assert.equal(pool.groups.flash.configuredLimit, null); assert.equal(pool.snapshot().active, 14);
  assert.equal(pool.groups.flash.active, 14); assert.equal(pool.snapshot().queued, 1); assert.equal(started, false);
  releases.pop()(); const last = await queued;
  assert.equal(pool.snapshot().active, 14);
  last(); for (const release of releases) release(); pool.close();
});
test('two GLM-5.3 tasks coexist with twelve Flash tasks under the same global budget', async () => {
  const pool = new ProviderPool({ globalLimit: 14, limits: { zcode: 2, flash: null, cursor: 12 } });
  const glm = await Promise.all([pool.acquire('zcode'), pool.acquire('zcode')]);
  const flash = await Promise.all(Array.from({ length: 12 }, () => pool.acquire('flash')));
  let thirdGlmStarted = false;
  const thirdGlm = pool.acquire('zcode').then(release => { thirdGlmStarted = true; return release; });
  const moreFlash = pool.acquire('flash');
  flash.pop()(); const nextFlash = await moreFlash;
  assert.equal(thirdGlmStarted, false); assert.equal(pool.groups.zcode.active, 2);
  assert.equal(pool.groups.flash.active, 12); assert.equal(pool.snapshot().active, 14);
  glm.pop()(); const nextGlm = await thirdGlm;
  assert.equal(pool.groups.zcode.active, 2); assert.equal(pool.snapshot().active, 14);
  for (const release of [...glm, ...flash, nextGlm, nextFlash]) release(); pool.close();
});
test('GLM cooldown does not block Cursor and cancellation removes queued work', async () => {
  const pool = new ProviderPool({ cooldownMs: 40, recoveryMs: 80 }); pool.limited('zcode');
  assert.equal(pool.groups.zcode.limit, 1);
  const events = [];
  const glm = pool.acquire('zcode').then(release => { events.push('glm'); release(); });
  const cursor = await pool.acquire('cursor'); events.push('cursor'); cursor();
  const controller = new AbortController(); const cancelled = pool.acquire('zcode', controller.signal);
  controller.abort(); await assert.rejects(cancelled, { code: 'CANCELLED' });
  await glm; assert.deepEqual(events, ['cursor', 'glm']); pool.close();
  await assert.rejects(pool.acquire('cursor'), { code: 'PROVIDER_STOPPED' });
});
test('HTTP endpoint authenticates, rejects browser origins and returns valid SSE', async () => {
  let calls = 0;
  const server = createProviderServer({ config, token: 'test-key', relay: { async complete(request, options) { calls++; assert.equal(options.transport.sessionId, 'native-actor-a'); assert.equal(options.transport.sessionType, 'subagent'); return { message: { role: 'assistant', content: 'PROBE_OK' } }; } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/v1/models')).status, 401);
    assert.equal((await fetch(base + '/v1/models', { headers: { Authorization: 'Bearer test-key', Origin: 'https://example.com' } })).status, 403);
    const models = await (await fetch(base + '/v1/models', { headers: { Authorization: 'Bearer test-key' } })).json();
    assert.ok(models.data.some(model => model.id === 'cursor-composer-2.5'));
    assert.ok(!models.data.some(model => model.id === 'workflow-auto'));
    const response = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer test-key', 'x-session-id': 'native-actor-a', 'x-zcode-session-type': 'subagent' }, body: JSON.stringify({ ...body, stream: true }) });
    const text = await response.text(); assert.equal(response.status, 200); assert.match(text, /PROBE_OK/); assert.match(text, /\[DONE\]/); assert.equal(calls, 1);
    const invalid = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer test-key' }, body: JSON.stringify({ ...body, model: 'absent' }) });
    assert.equal(invalid.status, 400); assert.equal(calls, 1);
  } finally { await server.shutdown(); }
});
test('a long conversation body is accepted, not rejected as oversized', async () => {
  const server = createProviderServer({ config, token: 'test-key', relay: { async complete() { return { message: { role: 'assistant', content: 'LONG_OK' } }; } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' };
  const post = content => fetch(base + '/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ ...body, messages: [{ role: 'user', content }] }) });
  try {
    // Above the 512 KiB this endpoint used to reject; a real session carries this much.
    const response = await post('x'.repeat(700 * 1024));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).choices[0].message.content, 'LONG_OK');
  } finally { await server.shutdown(); }
});
