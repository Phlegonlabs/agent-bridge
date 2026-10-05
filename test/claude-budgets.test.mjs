import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { claudeDelegateBudget } from '../src/claude-budgets.mjs';
import { ModelRelay } from '../src/provider-relay.mjs';
import { ProviderPool } from '../src/provider-pool.mjs';
import { buildSetupConfig } from '../src/setup.mjs';

test('legacy configurations receive long Claude defaults without mutation', () => {
  const legacy = { attemptTimeoutMs: 540000, requestTimeoutMs: 1200000 };
  const original = JSON.stringify(legacy);
  assert.deepEqual(claudeDelegateBudget(legacy), { attemptTimeoutMs: 4500000, requestTimeoutMs: 5400000 });
  assert.equal(JSON.stringify(legacy), original);
  for (const budget of [null, [], {}, { attemptTimeoutMs: 7200001, requestTimeoutMs: 8100000 },
    { attemptTimeoutMs: 4500000, requestTimeoutMs: 4499999 },
    { attemptTimeoutMs: 4500000, requestTimeoutMs: 8100001 },
    { attemptTimeoutMs: 4500000.5, requestTimeoutMs: 5400000 }]) {
    assert.throws(() => claudeDelegateBudget({ claudeDelegate: budget }), { code: 'INVALID_CONFIG' });
  }
});

test('setup records separate Claude budgets', () => {
  const config = buildSetupConfig({ catalogs: { claude: { models: [] } },
    selections: { claude: ['claude-opus-5-5'] }, fallback: 'off' });
  assert.equal(config.attemptTimeoutMs, 420000);
  assert.deepEqual(config.claudeDelegate, { attemptTimeoutMs: 4500000, requestTimeoutMs: 5400000 });
});

test('Claude attempt selection leaves Codex and Cursor budgets unchanged', async () => {
  const state = await mkdtemp(path.join(tmpdir(), 'bridge-budgets-'));
  const config = { limits: { claude: 1, codex: 1, cursor: 1 }, attemptTimeoutMs: 1234,
    fallback: { enabled: false, routes: {}, on: [] }, routes: {
      claude: { provider: 'claude', model: 'claude-opus-5-5', mode: 'delegate' },
      codex: { provider: 'codex', model: 'gpt-6.1-sol' }, cursor: { provider: 'cursor', model: 'composer-2.5' },
    } };
  const pool = new ProviderPool(config), timeouts = [];
  const relay = new ModelRelay(config, pool, async (route, prompt, settings) => {
    timeouts.push(settings.timeoutMs);
    const nonce = /Required nonce: ([a-f0-9-]+)/.exec(prompt)?.[1];
    return { ok: true, execution: {}, response: nonce ? JSON.stringify({ nonce, content: 'ok', tool_calls: [] }) : 'ok' };
  }, state);
  try {
    for (const model of ['claude', 'codex', 'cursor']) await relay.complete({ model,
      messages: [{ role: 'user', content: 'probe' }] }, { signal: new AbortController().signal });
    assert.deepEqual(timeouts, [4500000, 1234, 1234]);
  } finally { pool.close(); await rm(state, { recursive: true, force: true }); }
});
