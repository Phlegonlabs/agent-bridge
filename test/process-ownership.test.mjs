import test from 'node:test';
import assert from 'node:assert/strict';
import { platform } from 'node:process';
import { ownedProcessTree, terminateOwnedTree } from '../src/process.mjs';

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

test('Windows cleanup verifies survivors after a failed termination command', { skip: platform !== 'win32' }, async () => {
  for (const survivors of [[], [100]]) {
    let calls = 0;
    const executeCommand = async () => {
      calls++;
      if (calls === 1) return { stdout: JSON.stringify([process(100, 1, 0)]) };
      if (calls === 2) throw Object.assign(new Error('Synthetic stop race'), { code: 1, stderr: '' });
      return { stdout: JSON.stringify(survivors) };
    };
    const result = await terminateOwnedTree({ pid: 100, exitCode: null, signalCode: null }, startedAt, executeCommand);
    assert.equal(calls, 3);
    assert.equal(result.status, survivors.length ? 'unconfirmed' : 'terminated');
    assert.deepEqual(result.survivors, survivors);
    assert.equal(result.terminationFailure.reason, 'termination_failed');
  }
});

test('Windows cleanup cannot certify termination when survivor verification fails', { skip: platform !== 'win32' }, async () => {
  let calls = 0;
  const executeCommand = async () => {
    calls++;
    if (calls === 1) return { stdout: JSON.stringify([process(100, 1, 0)]) };
    throw Object.assign(new Error('Synthetic command failure'), { code: 1, stderr: '' });
  };
  await assert.rejects(terminateOwnedTree({ pid: 100, exitCode: null, signalCode: null }, startedAt, executeCommand),
    error => error.cleanup?.status === 'unconfirmed' && error.cleanup.reason === 'verification_failed');
  assert.equal(calls, 3);
});
