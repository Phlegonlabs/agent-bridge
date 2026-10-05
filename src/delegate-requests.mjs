import { BridgeError } from './profiles.mjs';
import { jsonHash } from './claude-sessions.mjs';

export function delegateSessionKey(sessionId, sessionType = 'chat') {
  for (const [value, limit] of [[sessionId, 128], [sessionType, 64]]) {
    if (typeof value !== 'string' || !/^[\x21-\x7e]+$/.test(value) || value.length > limit) {
      throw new BridgeError('INVALID_SESSION_INPUT', 'Invalid Claude session headers.');
    }
  }
  return jsonHash([sessionId, sessionType]);
}

// The server owns execution. Removable waiters own only their current connection.
export class DelegateRequests {
  #entries = new Map();
  #active = new Map();
  #jobs = new Set();
  #waiters = 0;
  #closed = false;
  #sweep;
  #limits;
  constructor({ limit = 64, ttlMs = 15 * 60000, maxBytes = 32 * 1024 * 1024, now = Date.now } = {}) {
    this.#limits = { limit, ttlMs, maxBytes, now };
    this.#sweep = setInterval(() => this.#prune(), Math.min(ttlMs, 60000));
    this.#sweep.unref();
  }

  #prune() {
    const { now, ttlMs, maxBytes, limit } = this.#limits;
    const terminal = [...this.#entries.entries()].filter(([, entry]) => entry.outcome);
    let bytes = terminal.reduce((sum, [, entry]) => sum + entry.bytes, 0), count = terminal.length;
    for (const [key, entry] of terminal) {
      if (now() - entry.finishedAt >= ttlMs || count > limit || bytes > maxBytes) {
        this.#entries.delete(key); bytes -= entry.bytes; count--;
      }
    }
  }

  attach({ sessionKey, fingerprint, timeoutMs, start }) {
    this.#prune();
    if (this.#closed) throw new BridgeError('CANCELLED', 'The provider is stopping.');
    if (this.#waiters >= this.#limits.limit) throw new BridgeError('QUEUE_FULL', 'Too many connected delegate requests.');
    const active = this.#active.get(sessionKey);
    if (active && active.fingerprint !== fingerprint) {
      throw new BridgeError('SESSION_BUSY', 'The Claude session already has a different active turn.');
    }
    const key = jsonHash([sessionKey, fingerprint]);
    let entry = this.#entries.get(key);
    if (!entry) {
      if (this.#active.size >= this.#limits.limit) throw new BridgeError('QUEUE_FULL', 'Too many owned delegate requests.');
      const controller = new AbortController();
      entry = { fingerprint, controller, waiters: new Set(), outcome: null };
      this.#entries.set(key, entry); this.#active.set(sessionKey, entry);
      const timer = setTimeout(() => controller.abort(new BridgeError('REQUEST_TIMEOUT', 'The delegate request deadline ended.')), timeoutMs);
      // Insertion precedes execution, including concurrent retries in this turn.
      const job = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return start(controller.signal);
      }).then(result => ({ result }), error => ({ error })).then(outcome => {
        clearTimeout(timer);
        if (controller.signal.aborted) outcome = { error: controller.signal.reason };
        if (outcome.error) {
          const error = outcome.error;
          outcome = { error: new BridgeError(error instanceof BridgeError ? error.code : 'PROVIDER_ERROR',
            error instanceof BridgeError ? error.message : 'Local delegate request failed.') };
        }
        entry.outcome = outcome; entry.finishedAt = this.#limits.now();
        entry.bytes = Buffer.byteLength(JSON.stringify(outcome));
        this.#active.delete(sessionKey);
        for (const waiter of entry.waiters) { this.#waiters--; waiter(outcome); }
        entry.waiters.clear(); this.#prune();
      }).finally(() => this.#jobs.delete(job));
      this.#jobs.add(job);
    }
    if (entry.outcome) return { outcome: Promise.resolve(entry.outcome), detach() {} };
    let resolve;
    const outcome = new Promise(done => { resolve = done; });
    entry.waiters.add(resolve); this.#waiters++;
    return { outcome, detach: () => {
      if (entry.waiters.delete(resolve)) { this.#waiters--; resolve({ detached: true }); }
    } };
  }

  snapshot() {
    this.#prune();
    const retained = [...this.#entries.values()].filter(entry => entry.outcome);
    return { active: this.#active.size, waiters: this.#waiters, retained: retained.length,
      retainedBytes: retained.reduce((sum, entry) => sum + entry.bytes, 0) };
  }

  async shutdown() {
    this.#closed = true; clearInterval(this.#sweep);
    for (const entry of this.#active.values()) entry.controller.abort(new BridgeError('CANCELLED', 'The provider is stopping.'));
    await Promise.all(this.#jobs);
    this.#entries.clear();
  }
}
