import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskProgress, TaskStatuses } from '../src/task-progress.mjs';
import { observeNativeProgress } from '../src/native-progress.mjs';

test('status separates lifecycle, real activity, silence and terminal verification', () => {
  let time = 1000;
  const task = new TaskProgress({ now: () => time, provider: 'claude', model: 'opus', deadlineAt: 9000 });
  const update = task.beginAttempt({ provider: 'claude', model: 'opus' });
  update({ type: 'queued' }); assert.equal(task.snapshot().startedAt, null);
  time = 2000; update({ type: 'running', runId: 'native-id' });
  time = 2500; update({ type: 'activity', kind: 'tool_started', command: 'PRIVATE_CANARY' });
  time = 8000; update({ type: 'heartbeat' });
  assert.equal(task.snapshot().state, 'running');
  assert.equal(task.snapshot().lastActivityAgeMs, 5500);
  assert.equal(task.snapshot().deadlineAt, 9000);
  assert.doesNotMatch(JSON.stringify(task.snapshot()), /PRIVATE_CANARY/);
  update({ type: 'finishing' });
  task.settle({ ok: false, code: 'CLAUDE_MODEL_MISMATCH', actualModel: 'wrong' });
  update({ type: 'activity', kind: 'text' }); task.settle({ ok: true });
  assert.equal(task.snapshot().state, 'failed'); assert.equal(task.snapshot().actualModel, null);
});

test('late attempts and callbacks cannot revive stopping or terminal tasks', () => {
  const task = new TaskProgress();
  const old = task.beginAttempt({ provider: 'claude' });
  const current = task.beginAttempt({ provider: 'codex' });
  old({ type: 'running' }); assert.equal(task.snapshot().state, 'starting');
  current({ type: 'running' }); current({ type: 'stopping' });
  current({ type: 'finishing' }); assert.equal(task.snapshot().state, 'stopping');
  task.settle({ ok: false, code: 'CLEANUP_UNCONFIRMED' });
  assert.equal(task.snapshot().recoveryRequired, true);
  assert.equal(task.snapshot().attempt, 2);
});

test('public native observations contain kinds only and ignore keep-alive events', () => {
  const received = [];
  const ingest = (provider, event) => observeNativeProgress(provider, JSON.stringify(event), value => received.push(value));
  ingest('claude', { type: 'system', subtype: 'ui_invalidate', secret: 'PRIVATE_CANARY' });
  ingest('claude', { type: 'stream_event', event: { delta: { type: 'thinking_delta', thinking: 'PRIVATE_CANARY' } } });
  ingest('claude', { type: 'assistant', message: { content: [{ type: 'tool_use', input: { command: 'PRIVATE_CANARY' } }] } });
  ingest('claude', { type: 'user', message: { content: [{ type: 'tool_result', content: 'PRIVATE_CANARY' }] } });
  ingest('codex', { type: 'error', message: 'Reconnecting... 2/5 PRIVATE_CANARY' });
  ingest('codex', { type: 'item.completed', item: { type: 'command_execution', command: 'PRIVATE_CANARY' } });
  ingest('cursor', { type: 'tool_call', subtype: 'started', tool_call: { secret: 'PRIVATE_CANARY' } });
  assert.deepEqual(received.map(value => value.kind), ['thinking', 'tool_started', 'tool_finished', 'native_retry', 'tool_finished', 'tool_started']);
  assert.doesNotMatch(JSON.stringify(received), /PRIVATE_CANARY/);
  assert.doesNotThrow(() => ingest('claude', { type: 'assistant', message: { content: [] } }));
  assert.doesNotThrow(() => observeNativeProgress('codex', '{bad', () => { throw new Error('observer'); }));
});

test('lookup is bounded, session-scoped and expires without affecting execution', () => {
  let time = 100;
  const statuses = new TaskStatuses({ now: () => time, limit: 2, ttlMs: 100 });
  const a = statuses.create({ provider: 'claude' }, 'private-a');
  const b = statuses.create({ provider: 'codex' }, 'private-b');
  assert.throws(() => statuses.create({}), { code: 'QUEUE_FULL' });
  a.settle({ ok: true, code: 'VERIFIED' });
  assert.equal(statuses.list('private-a').length, 1);
  assert.doesNotMatch(JSON.stringify(statuses.list()), /private-a|private-b/);
  time = 201; assert.equal(statuses.get(a.record.taskId), null);
  assert.equal(statuses.get(b.record.taskId).state, 'accepted');
});
