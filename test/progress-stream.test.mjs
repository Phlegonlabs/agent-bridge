import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressStream } from '../src/progress-stream.mjs';
import { TaskProgress } from '../src/task-progress.mjs';

test('visible status uses observations and fixed labels without exposing native payloads', () => {
  let time = 0;
  const task = new TaskProgress({ now: () => time }), stream = new ProgressStream({ now: () => time });
  const initial = stream.next({ ...task.snapshot(), prompt: 'PRIVATE_CANARY', nativeReasoning: 'PRIVATE_CANARY' });
  assert.match(initial, /已接收/); assert.match(initial, /尚未觀察到原生活動/);
  task.beginAttempt({ provider: 'claude', model: 'opus' }); task.update({ type: 'running' });
  task.update({ type: 'activity', kind: 'tool_started', input: 'PRIVATE_CANARY' });
  time = 464000;
  const running = stream.next(task.snapshot());
  assert.match(running, /執行中 · 已用 7 分 44 秒 · 第 1 次嘗試/);
  assert.match(running, /最近活動：工具開始執行（距今 7 分 44 秒）/);
  assert.doesNotMatch(initial + running, /PRIVATE_CANARY|prompt|nativeReasoning|input/);
  assert.equal(task.record.lastActivityAt, 0);
});

test('quiet status ages without heartbeats pretending to be activity or flooding the display', () => {
  let time = 1000;
  const task = new TaskProgress({ now: () => time }), stream = new ProgressStream({ now: () => time });
  task.update({ type: 'running' }); task.update({ type: 'activity', kind: 'text' });
  stream.next(task.snapshot());
  time += 10000; task.update({ type: 'output' });
  assert.equal(stream.next(task.snapshot()), null);
  time += 20000;
  assert.match(stream.next(task.snapshot()), /文字輸出（距今 30 秒）/);
  assert.equal(task.record.lastActivityAt, 1000);
  task.settle({ ok: false, code: 'CLAUDE_MODEL_MISMATCH' });
  assert.match(stream.next(task.snapshot()), /執行失敗/);
  time += 30000; assert.equal(stream.next(task.snapshot()), null);
});

test('missing status never creates work and noisy status has a finite byte budget', () => {
  const task = new TaskProgress(), stream = new ProgressStream({ maxBytes: 1024 });
  assert.equal(stream.next(null), null); assert.equal(stream.next({ state: 'running' }), null);
  let text = '';
  for (let index = 0; index < 100; index++) {
    task.update({ type: 'activity', kind: index % 2 ? 'tool_started' : 'tool_finished' });
    text += stream.next(task.snapshot()) ?? '';
  }
  assert.match(text, /訊息已達顯示上限/);
  assert.ok(Buffer.byteLength(text) <= 1024);
  assert.equal(stream.next(task.snapshot()), null);
  assert.equal(task.record.state, 'accepted');
});
