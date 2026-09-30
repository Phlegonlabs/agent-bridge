import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ModelRelay } from '../src/provider-relay.mjs';
import { ProviderPool } from '../src/provider-pool.mjs';
import { readProviderConfig, validateProviderConfig } from '../src/provider-server.mjs';

const request = () => ({ model: 'workflow-auto', routing_context: { workflowId: randomUUID(), actorId: 'review', taskId: 'review', role: 'reviewer', stage: 'review', dependencies: [] }, messages: [{ role: 'user', content: 'Review existing evidence without edits.' }] });
async function fixture(t, enabled = true, split = false) {
  const config = { ...(await readProviderConfig()), capacityRouting: enabled, router: 'router', globalLimit: 2, limits: { zcode: 1, cursor: 1 },
    // Pin the attempt budget: the early RATE_LIMITED check in ModelRelay.call compares the
    // pool cooldown against it, and the operational native-provider.json timeout may grow.
    attemptTimeoutMs: 1000,
    routes: { flash: { provider: 'zcode', agent: 'code_explorer', expectedModel: 'test/flash', description: 'Flash' },
      reviewer: { provider: 'zcode', agent: 'reviewer', expectedModel: 'test/review', description: 'Review' },
      cursor: { provider: 'cursor', model: 'composer', description: 'Cursor' },
      router: { provider: 'cursor', model: 'router', description: 'Router', auto: false } },
    fallback: { enabled: false, on: [], routes: {} } };
  if (split) { config.globalLimit = 14; config.limits = { zcode: 2, flash: null, cursor: 12 }; config.routes.flash.pool = 'flash'; }
  const pool = new ProviderPool(config), seen = { routers: [], workers: [], failure: null };
  const state = await mkdtemp(path.join(tmpdir(), 'zcode-capacity-'));
  const relay = new ModelRelay(config, pool, async (route, prompt) => {
    if (route.model === 'router') {
      const choices = JSON.parse(prompt.match(/Allowed routes: (.+)/)[1]); seen.routers.push({ choices, prompt });
      return { ok: true, runId: randomUUID(), actualModel: 'test/router', response: JSON.stringify({ route: choices[0].id, reason: 'Use an eligible model for this review', role: 'reviewer', stage: 'review', basis: 'declared' }) };
    }
    seen.workers.push({ route, prompt });
    if (seen.failure) return { ok: false, code: seen.failure, runId: randomUUID() };
    const nonce = JSON.parse(prompt.match(/"nonce":("[^"]+")/)[1]);
    return { ok: true, runId: randomUUID(), actualModel: route.expectedModel ?? 'cursor/' + route.model,
      response: JSON.stringify({ nonce, content: 'verified test response', tool_calls: [] }) };
  }, async () => [], state);
  await relay.ready;
  t.after(() => pool.close());
  return { relay, pool, seen, config, state };
}
const options = () => ({ signal: new AbortController().signal, transport: { sessionId: 'capacity-test' } });

test('new auto tasks exclude all models sharing a full provider pool', async t => {
  const { relay, pool, seen } = await fixture(t); const release = await pool.acquire('zcode');
  try {
    const result = await relay.complete(request(), options());
    assert.equal(result.evidence.selected, 'cursor');
    assert.deepEqual(seen.routers[0].choices.map(c => c.id), ['cursor']);
    assert.equal(seen.workers.length, 1);
  } finally { release(); }
});
test('a task switches at its next request when full and retains its tool history', async t => {
  const { relay, pool, seen, state } = await fixture(t); const body = request();
  assert.equal((await relay.complete(body, options())).evidence.selected, 'flash');
  const release = await pool.acquire('zcode');
  try {
    const next = { ...body, messages: [...body.messages,
      { role: 'assistant', content: null, tool_calls: [{ id: 'read-existing', type: 'function', function: { name: 'read_probe', arguments: '{"path":"README.md"}' } }] },
      { role: 'tool', tool_call_id: 'read-existing', content: 'Existing upstream evidence; do not rerun the tool.' }] };
    const result = await relay.complete(next, options());
    assert.equal(result.evidence.selected, 'cursor'); assert.equal(result.evidence.attempts.length, 1);
    assert.match(seen.workers.at(-1).prompt, /read-existing/); assert.match(seen.workers.at(-1).prompt, /Existing upstream evidence/);
    const evidence = JSON.parse(await readFile(path.join(state, 'requests', result.evidence.id, 'routing.json'), 'utf8'));
    assert.equal(evidence.previousRoute, 'flash'); assert.equal(evidence.switchReason, 'provider-full');
    assert.equal(evidence.role, 'reviewer'); assert.equal(evidence.stage, 'review');
  } finally { release(); }
  const result = await relay.complete(body, options());
  assert.equal(result.evidence.selected, 'cursor'); assert.equal(seen.routers.length, 2);
  const evidence = JSON.parse(await readFile(path.join(state, 'requests', result.evidence.id, 'routing.json'), 'utf8'));
  assert.equal(evidence.switchReason, undefined);
});
test('machine rate limit switches on the next request without replaying the failed request', async t => {
  const { relay, pool, seen } = await fixture(t); const body = request(); seen.failure = 'RATE_LIMITED';
  await assert.rejects(relay.complete(body, options()), { code: 'RATE_LIMITED' });
  assert.equal(seen.workers.length, 1); assert.ok(pool.groups.zcode.cooldownUntil > Date.now());
  seen.failure = null;
  assert.equal((await relay.complete(body, options())).evidence.selected, 'cursor');
  assert.match(seen.routers[1].prompt, /provider-cooldown/);
});
test('an ordinary failed request pins its healthy route instead of rerolling on retry', async t => {
  const { relay, seen } = await fixture(t); const body = request(); seen.failure = 'WRONG_DISPATCH';
  await assert.rejects(relay.complete(body, options()), { code: 'WRONG_DISPATCH' });
  await assert.rejects(relay.complete(body, options()), { code: 'WRONG_DISPATCH' });
  assert.equal(seen.routers.length, 1); assert.equal(seen.workers.length, 2);
  assert.ok(seen.workers.every(w => w.route.expectedModel === 'test/flash'));
});
test('all-busy providers preserve affinity and wait in the bounded queue', async t => {
  const { relay, pool, seen } = await fixture(t); const body = request();
  await relay.complete(body, options());
  const glm = await pool.acquire('zcode'), cursor = await pool.acquire('cursor');
  const controller = new AbortController();
  const pending = relay.complete(body, { ...options(), signal: controller.signal });
  for (let i = 0; i < 100 && !pool.snapshot().queued; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(pool.snapshot().queued, 1); assert.equal(pool.snapshot().active, 2);
  assert.equal(seen.routers.length, 1); assert.equal(seen.workers.length, 1);
  glm(); cursor();
  assert.equal((await pending).evidence.selected, 'flash');
});
test('capacity policy off preserves affinity; explicitly selected models never auto-switch', async t => {
  const { relay, pool, seen } = await fixture(t, false); const body = request();
  await relay.complete(body, options()); pool.limited('zcode', 300000);
  await assert.rejects(relay.complete(body, options()), { code: 'RATE_LIMITED' });
  assert.equal(seen.routers.length, 1);
  relay.config.capacityRouting = true;
  await assert.rejects(relay.complete({ ...body, model: 'flash' }, options()), { code: 'RATE_LIMITED' });
  assert.equal(seen.routers.length, 1); assert.equal(seen.workers.length, 1);
});
test('all cooling providers fail without dispatch and invalid policy is rejected', async t => {
  const { relay, pool, seen, config } = await fixture(t);
  pool.limited('zcode', 300000); pool.limited('cursor', 300000);
  await assert.rejects(relay.complete(request(), options()), { code: 'RATE_LIMITED' });
  assert.equal(seen.workers.length + seen.routers.length, 0);
  assert.throws(() => validateProviderConfig({ ...config, capacityRouting: 'yes' }), { code: 'INVALID_CONFIG' });
});
test('a full GLM-5.3 pool does not exclude or block Flash on the same adapter', async t => {
  const { relay, pool, seen } = await fixture(t, true, true);
  const first = await pool.acquire('zcode'), second = await pool.acquire('zcode');
  try {
    const body = request(), result = await relay.complete(body, options());
    assert.equal(result.evidence.selected, 'flash');
    assert.deepEqual(seen.routers[0].choices.map(c => c.id), ['flash', 'cursor']);
    assert.equal(seen.routers[0].choices[0].pool, 'flash');
    assert.equal(seen.routers[0].choices[0].capacity.configuredLimit, null);
    assert.equal((await relay.complete(body, options())).evidence.selected, 'flash');
    assert.equal(seen.routers.length, 1); assert.equal(pool.groups.zcode.active, 2);
  } finally { first(); second(); }
});
test('Flash rate limits and persisted cooldown do not cool GLM-5.3', async t => {
  const { relay, pool, seen, config, state } = await fixture(t, true, true); seen.failure = 'RATE_LIMITED';
  await assert.rejects(relay.complete(request(), options()), { code: 'RATE_LIMITED' });
  assert.ok(pool.groups.flash.cooldownUntil > Date.now());
  assert.equal(pool.groups.zcode.cooldownUntil, 0); assert.equal(pool.groups.zcode.limit, 2);
  assert.equal(pool.groups.flash.configuredLimit, null);
  const restoredPool = new ProviderPool(config); t.after(() => restoredPool.close());
  const restored = new ModelRelay(config, restoredPool, undefined, async () => [], state); await restored.ready;
  assert.equal(restored.capacityState('flash'), 'provider-cooldown');
  assert.equal(restored.capacityState('reviewer'), 'available');
});
test('GLM-5.3 cooldown leaves Flash eligible and validates pool references', async t => {
  const { relay, pool, seen, config } = await fixture(t, true, true); pool.limited('zcode', 300000);
  assert.equal((await relay.complete(request(), options())).evidence.selected, 'flash');
  assert.ok(seen.routers[0].choices.some(c => c.id === 'flash'));
  assert.ok(!seen.routers[0].choices.some(c => c.id === 'reviewer'));
  assert.doesNotThrow(() => validateProviderConfig(config));
  for (const bad of [
    { ...config, routes: { ...config.routes, flash: { ...config.routes.flash, pool: 'missing' } } },
    { ...config, limits: { ...config.limits, '../outside': null } },
    { ...config, limits: { ...config.limits, flash: 0 } },
  ]) assert.throws(() => validateProviderConfig(bad), { code: 'INVALID_CONFIG' });
});
