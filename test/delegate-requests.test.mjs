import test from 'node:test';
import assert from 'node:assert/strict';
import { DelegateRequests, delegateSessionKey } from '../src/delegate-requests.mjs';
import { BridgeError } from '../src/profiles.mjs';

function gate() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const turn = (start, overrides = {}) => ({ sessionKey: delegateSessionKey('session'), fingerprint: 'turn', timeoutMs: 2000, start, ...overrides });

test('hundreds of detached retries use one execution and retain no waiters', async () => {
  const registry = new DelegateRequests(), pending = gate(); let calls = 0;
  const start = async () => { calls++; await pending.promise; return { message: { content: 'audited result' } }; };
  try {
    for (let index = 0; index < 300; index++) {
      const connection = registry.attach(turn(start)); connection.detach();
      assert.deepEqual(await connection.outcome, { detached: true });
      assert.equal(registry.snapshot().waiters, 0);
    }
    assert.equal(calls, 1);
    assert.throws(() => registry.attach(turn(start, { fingerprint: 'different-model-or-turn' })), { code: 'SESSION_BUSY' });
    const joined = registry.attach(turn(start)); pending.resolve();
    assert.equal((await joined.outcome).result.message.content, 'audited result');
    assert.deepEqual(await registry.attach(turn(start)).outcome, await joined.outcome);
    assert.equal(calls, 1);
  } finally { pending.resolve(); await registry.shutdown(); }
});

test('reattachment preserves the deadline and ownership until cleanup settles', async () => {
  const registry = new DelegateRequests(), cleanup = gate(), aborted = gate(); let calls = 0;
  const start = async signal => {
    calls++; await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    aborted.resolve(); await cleanup.promise; throw signal.reason;
  };
  try {
    registry.attach(turn(start, { timeoutMs: 30 })).detach();
    await new Promise(resolve => setTimeout(resolve, 15));
    const retry = registry.attach(turn(start, { timeoutMs: 2000 }));
    await aborted.promise;
    assert.equal(registry.snapshot().active, 1);
    assert.throws(() => registry.attach(turn(start, { fingerprint: 'next' })), { code: 'SESSION_BUSY' });
    cleanup.resolve();
    assert.equal((await retry.outcome).error.code, 'REQUEST_TIMEOUT');
    assert.equal(calls, 1); assert.equal(registry.snapshot().active, 0);
  } finally { cleanup.resolve(); await registry.shutdown(); }
});

test('shutdown waits for detached execution cleanup and rejects new requests', async () => {
  const registry = new DelegateRequests(), cleanup = gate(), began = gate(), aborted = gate();
  const start = async signal => {
    began.resolve(); await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    aborted.resolve(); await cleanup.promise;
  };
  registry.attach(turn(start)).detach(); await began.promise;
  let stopped = false; const stopping = registry.shutdown().then(() => { stopped = true; });
  await aborted.promise; assert.equal(stopped, false);
  assert.throws(() => registry.attach(turn(start)), { code: 'CANCELLED' });
  cleanup.resolve(); await stopping; assert.equal(registry.snapshot().active, 0);
});

test('capacity, retention bytes and expiration are bounded', async () => {
  let now = 0;
  const registry = new DelegateRequests({ limit: 2, ttlMs: 100, maxBytes: 60, now: () => now });
  const pending = gate();
  try {
    const a = registry.attach(turn(() => pending.promise));
    const b = registry.attach(turn(() => pending.promise, { sessionKey: 'second' }));
    assert.throws(() => registry.attach(turn(() => pending.promise)), { code: 'QUEUE_FULL' });
    a.detach(); b.detach();
    assert.throws(() => registry.attach(turn(() => pending.promise, { sessionKey: 'third' })), { code: 'QUEUE_FULL' });
    pending.resolve('x'.repeat(100)); await registry.shutdown();
  } finally { pending.resolve(); await registry.shutdown(); }
  const cache = new DelegateRequests({ ttlMs: 100, maxBytes: 60, now: () => now });
  try {
    for (let i = 0; i < 5; i++) await cache.attach(turn(async () => '1234567890', { fingerprint: `${i}` })).outcome;
    assert.ok(cache.snapshot().retainedBytes <= 60);
    now = 101; assert.equal(cache.snapshot().retained, 0);
  } finally { await cache.shutdown(); }
});

test('headers are validated before accepting a session identity', () => {
  for (const value of ['', 'a b', 'a'.repeat(129), ['duplicate']]) {
    assert.throws(() => delegateSessionKey(value), { code: 'INVALID_SESSION_INPUT' });
  }
  assert.notEqual(delegateSessionKey('a', 'chat'), delegateSessionKey('a', 'subagent'));
});

test('certified pre-spawn admission failures retry, while uncertain failures stay retained', async () => {
  for (const started of [false, true, undefined]) {
    const registry = new DelegateRequests(); let calls = 0;
    const start = async () => {
      calls++;
      if (calls === 1) throw Object.assign(new BridgeError('QUEUE_FULL', 'full'), { nativeExecutionStarted: started });
      return 'one completed execution';
    };
    try {
      assert.equal((await registry.attach(turn(start)).outcome).error.code, 'QUEUE_FULL');
      const retry = await registry.attach(turn(start)).outcome;
      if (started === false) { assert.equal(retry.result, 'one completed execution'); assert.equal(calls, 2); }
      else { assert.equal(retry.error.code, 'QUEUE_FULL'); assert.equal(calls, 1); }
    } finally { await registry.shutdown(); }
  }
});
