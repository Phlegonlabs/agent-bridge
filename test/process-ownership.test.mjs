import test from 'node:test';
import assert from 'node:assert/strict';
import { ownedProcessTree } from '../src/process.mjs';

const startedAt = Date.parse('2026-10-01T17:00:00Z');
const process = (pid, parent, seconds) => ({ pid, parent, started: new Date(startedAt + seconds * 1000).toISOString(), name: 'node.exe' });

test('cleanup excludes older processes whose parent PID has been reused', () => {
  const root = process(100, 1, 0), child = process(101, 100, 1), console = process(102, 101, 2);
  const oldSystemProcess = process(103, 102, -3600), oldChild = process(104, 103, -3599);
  assert.deepEqual(ownedProcessTree([root, child, console, oldSystemProcess, oldChild], 100, startedAt), [root, child, console]);
});

test('cleanup refuses an older root and excludes unrelated process trees', () => {
  assert.deepEqual(ownedProcessTree([process(100, 1, -3600)], 100, startedAt), []);
  const root = process(100, 1, 0), child = process(101, 100, 1), unrelated = process(200, 1, 2);
  assert.deepEqual(ownedProcessTree([child, unrelated, root], 100, startedAt), [root, child]);
});

test('cleanup refuses a reused root PID and missing creation time', () => {
  assert.deepEqual(ownedProcessTree([process(100, 1, 30)], 100, startedAt), []);
  assert.deepEqual(ownedProcessTree([{ pid: 100, parent: 1 }], 100, startedAt), []);
});
