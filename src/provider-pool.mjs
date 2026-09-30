import { BridgeError } from './profiles.mjs';
export class ProviderPool {
  constructor({ globalLimit = 14, limits = { zcode: 2, cursor: 12 }, cooldownMs = 15000, recoveryMs = 120000, maxQueue = 64 } = {}) {
    this.globalLimit = globalLimit; this.active = 0; this.queue = []; this.maxQueue = maxQueue;
    this.cooldownMs = cooldownMs; this.recoveryMs = recoveryMs;
    // null removes the separate pool cap; the global ceiling still applies.
    this.groups = Object.fromEntries(Object.entries(limits).map(([key, limit]) => [key, { configuredLimit: limit,
      limit: limit ?? globalLimit, ceiling: limit ?? globalLimit, active: 0, cooldownUntil: 0, lastLimitedAt: 0 }]));
  }
  snapshot() { return { active: this.active, limit: this.globalLimit, queued: this.queue.length, groups: structuredClone(this.groups) }; }
  acquire(groupName, signal) {
    if (this.stopped) return Promise.reject(new BridgeError('PROVIDER_STOPPED', 'Provider queue is stopped.'));
    if (!this.groups[groupName]) throw new BridgeError('INVALID_POOL', 'Unknown provider pool.');
    if (signal?.aborted) return Promise.reject(new BridgeError('CANCELLED', 'Request cancelled.'));
    if (this.queue.length >= this.maxQueue) return Promise.reject(new BridgeError('QUEUE_FULL', 'Provider queue is full.'));
    return new Promise((resolve, reject) => {
      const item = { groupName, signal, resolve, reject, abort: () => {
        this.queue = this.queue.filter(entry => entry !== item); reject(new BridgeError('CANCELLED', 'Request cancelled.')); this.pump();
      } };
      signal?.addEventListener('abort', item.abort, { once: true }); this.queue.push(item); this.pump();
    });
  }
  pump() {
    clearTimeout(this.timer); this.timer = undefined;
    let wakeAt = Infinity;
    for (let index = 0; index < this.queue.length && this.active < this.globalLimit;) {
      const item = this.queue[index], group = this.groups[item.groupName];
      if (group.cooldownUntil > Date.now()) { wakeAt = Math.min(wakeAt, group.cooldownUntil); index++; continue; }
      if (group.active >= group.limit) { index++; continue; }
      this.queue.splice(index, 1); item.signal?.removeEventListener('abort', item.abort);
      this.active++; group.active++;
      let released = false;
      item.resolve(() => { if (released) return; released = true; this.active--; group.active--; this.pump(); });
    }
    if (Number.isFinite(wakeAt)) this.timer = setTimeout(() => this.pump(), Math.max(1, wakeAt - Date.now()));
  }
  limited(name, retryAfterMs = 0, quota = false) {
    const group = this.groups[name]; if (!quota) group.limit = Math.max(1, Math.floor(group.limit / 2));
    group.lastLimitedAt = Date.now(); group.cooldownUntil = Math.max(group.cooldownUntil, Date.now() + Math.max(this.cooldownMs, Math.min(retryAfterMs, 86400000)));
    this.pump();
  }
  succeeded(name) {
    const group = this.groups[name];
    if (group.limit < group.ceiling && Date.now() - group.lastLimitedAt >= this.recoveryMs) { group.limit++; group.lastLimitedAt = Date.now(); }
  }
  close() { this.stopped = true; clearTimeout(this.timer); for (const item of this.queue.splice(0)) { item.signal?.removeEventListener('abort', item.abort); item.reject(new BridgeError('CANCELLED', 'Provider stopped.')); } }
}
