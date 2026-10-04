import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeSessions } from '../src/claude-sessions.mjs';
import { BridgeError } from '../src/profiles.mjs';

const execute = promisify(execFile);
const policy = { execution: { mode: 'full-access', timeoutMs: 60000 } };

function request(overrides = {}) {
  return { sessionId: 'zcode-session-1', sessionType: 'subagent', cwd: process.cwd(),
    policy, fingerprint: `turn-${Math.random()}`, signal: new AbortController().signal, ...overrides };
}

function worker(input, response = 'ok') {
  input.onNativeStarted();
  return { ok: true, sessionId: input.session.id, response };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function withState(work) {
  const directory = await mkdtemp(path.join(tmpdir(), 'claude-sessions-'));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('a session resumes one native id and does not key on the model', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const calls = [];
    const first = await sessions.run(request({ fingerprint: 'a' }), async input => {
      calls.push(input);
      return worker(input, 'first');
    });
    const second = await sessions.run(request({ fingerprint: 'b' }), async input => {
      calls.push(input);
      return worker(input, 'second');
    });
    assert.deepEqual(calls.map(({ session }) => ({ session })), [
      { session: { id: first.sessionId, resume: false } },
      { session: { id: first.sessionId, resume: true } },
    ]);
    assert.equal(first.sessionId, second.sessionId);
  });
});

test('changed cwd or execution policy is rejected before the callback', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const workspace = await mkdtemp(path.join(tmpdir(), 'claude-workspace-'));
    let calls = 0;
    const callback = async input => { calls++; return worker(input); };
    try {
      await sessions.run(request({ cwd: workspace }), callback);
      await assert.rejects(sessions.run(request({ cwd: process.cwd() }), callback), { code: 'SESSION_CWD_CHANGED' });
      await assert.rejects(sessions.run(request({ cwd: workspace, policy: { execution: { mode: 'read-only' } } }), callback),
        { code: 'SESSION_POLICY_CHANGED' });
      assert.equal(calls, 1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

test('completed fingerprints replay without invoking the worker', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    let calls = 0;
    const callback = async input => {
      calls++;
      return worker(input, `turn-${calls}`);
    };
    const first = await sessions.run(request({ fingerprint: 'old-turn' }), callback);
    const second = await sessions.run(request({ fingerprint: 'new-turn' }), callback);
    const replay = await sessions.run(request({ fingerprint: 'old-turn' }), callback);
    assert.equal(calls, 2);
    assert.deepEqual(replay, first);
    assert.notDeepEqual(replay, second);
  });
});

test('an active turn is busy and independent sessions do not block each other', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const gate = deferred();
    let active = 0;
    const callback = async input => {
      active++;
      assert.equal(active, 1);
      input.onNativeStarted();
      await gate.promise;
      active--;
      return { ok: true, sessionId: input.session.id, response: 'ok' };
    };
    const running = sessions.run(request(), callback);
    await assert.rejects(sessions.run(request({ fingerprint: 'other' }), callback), { code: 'SESSION_BUSY' });
    gate.resolve();
    const result = await running;
    assert.equal(result.ok, true);
  });
});

test('distinct ZCode sessions and types receive separate native sessions', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const callback = async input => worker(input);
    const a = await sessions.run(request({ sessionId: 'session-a' }), callback);
    const b = await sessions.run(request({ sessionId: 'session-b' }), callback);
    const readonly = await sessions.run(request({ sessionId: 'session-a', sessionType: 'read-only' }), callback);
    assert.notEqual(a.sessionId, b.sessionId);
    assert.notEqual(a.sessionId, readonly.sessionId);
  });
});

test('pre-spawn failure preserves the prior receipt and later work resumes it', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const first = await sessions.run(request({ fingerprint: 'complete-first' }), async input => worker(input, 'first'));
    let preSpawnCalls = 0;
    await assert.rejects(sessions.run(request({ fingerprint: 'queue-aborted' }), async () => {
      preSpawnCalls++;
      throw new Error('rejected before Claude spawned');
    }), { message: 'rejected before Claude spawned' });
    const receipt = await sessions.inspect(request());
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.nativeSessionId, first.sessionId);
    const resumed = await sessions.run(request({ fingerprint: 'after-failure' }), async input => {
      assert.equal(input.session.id, first.sessionId);
      assert.equal(input.session.resume, true);
      return worker(input, 'resumed');
    });
    assert.equal(preSpawnCalls, 1);
    assert.equal(resumed.sessionId, first.sessionId);
  });
});

test('a genuine post-spawn failure leaves the session uncertain', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    let calls = 0;
    const failing = async input => {
      calls++;
      input.onNativeStarted();
      throw new Error('worker failed after dispatch');
    };
    await assert.rejects(sessions.run(request(), failing));
    await assert.rejects(sessions.run(request({ fingerprint: 'retry' }), failing), { code: 'SESSION_RECOVERY_REQUIRED' });
    assert.equal((await sessions.inspect(request())).status, 'uncertain');
    assert.equal(calls, 1);
  });
});

test('a machine-killed worker leaves the session resumable', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    let calls = 0;
    const killed = async input => {
      calls++;
      input.onNativeStarted();
      throw Object.assign(new BridgeError('TIMEOUT', 'attempt timed out'), { worker: { ok: false, code: 'TIMEOUT',
        execution: { cleanup: { status: 'terminated', survivors: [] } } } });
    };
    await assert.rejects(sessions.run(request(), killed), { code: 'TIMEOUT' });
    assert.equal((await sessions.inspect(request())).status, 'resumable');
    const resumed = await sessions.run(request({ fingerprint: 'after-kill' }), async input => {
      assert.equal(input.session.resume, true);
      return worker(input, 'resumed work');
    });
    assert.equal(resumed.ok, true);
    assert.equal(calls, 1);
  });
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const unconfirmed = async input => {
      input.onNativeStarted();
      throw Object.assign(new BridgeError('TIMEOUT', 'attempt timed out'), { worker: { ok: false, code: 'TIMEOUT',
        execution: { cleanup: { status: 'unconfirmed' } } } });
    };
    await assert.rejects(sessions.run(request(), unconfirmed), { code: 'TIMEOUT' });
    await assert.rejects(sessions.run(request({ fingerprint: 'retry' }), unconfirmed), { code: 'SESSION_RECOVERY_REQUIRED' });
    assert.equal((await sessions.inspect(request())).status, 'uncertain');
  });
});

test('abort during a successful callback still saves the completed result', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const abort = new AbortController();
    const result = await sessions.run(request({ fingerprint: 'abort-race', signal: abort.signal }), async input => {
      input.onNativeStarted();
      abort.abort();
      return worker(input, 'valid work');
    });
    const receipt = await sessions.inspect(request());
    assert.equal(result.response, 'valid work');
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.turns.length, 1);
  });
});

test('a worker PID is fallback spawn evidence', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    let trackerUsed = false;
    const result = await sessions.run(request(), async input => {
      trackerUsed = false;
      return { ok: true, sessionId: input.session.id, response: 'pid evidence', execution: { pid: 4321 } };
    });
    const receipt = await sessions.inspect(request());
    assert.equal(result.execution.pid, 4321);
    assert.equal(trackerUsed, false);
    assert.equal(receipt.status, 'completed');
  });
});

test('a completed replay remains available when a later turn is uncertain', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const first = await sessions.run(request({ fingerprint: 'old-turn' }), async input => worker(input, 'old'));
    const failing = async input => {
      input.onNativeStarted();
      throw new Error('post-spawn failure');
    };
    await assert.rejects(sessions.run(request({ fingerprint: 'new-turn' }), failing));
    const replay = await sessions.run(request({ fingerprint: 'old-turn' }), failing);
    await assert.rejects(sessions.run(request({ fingerprint: 'new-turn' }), failing), { code: 'SESSION_RECOVERY_REQUIRED' });
    assert.deepEqual(replay, first);
  });
});

test('pre-callback abort does not poison a new session', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const abort = new AbortController();
    abort.abort();
    let calls = 0;
    await assert.rejects(sessions.run(request({ signal: abort.signal }), async () => { calls++; }), { name: 'AbortError' });
    const result = await sessions.run(request(), async input => worker(input, 'after-abort'));
    assert.equal(calls, 0);
    assert.equal(result.ok, true);
  });
});

test('a receipt found running after restart requires recovery and refuses CLI recovery', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const gate = deferred();
    const running = sessions.run(request(), async input => {
      input.onNativeStarted();
      await gate.promise;
      return worker(input, 'late');
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    const restarted = new ClaudeSessions(directory);
    await assert.rejects(restarted.run(request({ fingerprint: 'restart' }), async () => {
      throw new Error('must not run');
    }), { code: 'SESSION_RECOVERY_REQUIRED' });
    const receipt = await restarted.inspect(request());
    await assert.rejects(restarted.recover({
      sessionId: request().sessionId, sessionType: request().sessionType,
      expectedNativeSessionId: receipt.nativeSessionId, inspected: true, runtimeOffline: false,
    }), { code: 'RUNTIME_ACTIVE' });
    gate.resolve();
    await running;
  });
});

test('a successful result with the wrong native id is a mismatch and uncertain', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    let calls = 0;
    const mismatched = async input => {
      calls++;
      input.onNativeStarted();
      return { ok: true, sessionId: 'not-the-assigned-uuid', response: 'wrong session' };
    };
    await assert.rejects(sessions.run(request(), mismatched), { code: 'SESSION_MISMATCH' });
    await assert.rejects(sessions.run(request({ fingerprint: 'retry' }), mismatched), { code: 'SESSION_RECOVERY_REQUIRED' });
    assert.equal(calls, 1);
  });
});

test('inspected CLI recovery backs up and makes an uncertain receipt resumable', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const first = await sessions.run(request(), async input => worker(input, 'first'));
    const failing = async input => {
      input.onNativeStarted();
      throw new Error('post-spawn failure');
    };
    await assert.rejects(sessions.run(request({ fingerprint: 'failed-turn' }), failing));
    const script = path.join(process.cwd(), 'scripts', 'claude-session-recovery.mjs');
    const inspectArguments = [script, directory, 'inspect', '--session-id', 'zcode-session-1', '--session-type', 'subagent'];
    const inspected = JSON.parse((await execute(process.execPath, inspectArguments)).stdout);
    assert.equal(inspected.status, 'uncertain');
    assert.equal(inspected.nativeSessionId, first.sessionId);
    await assert.rejects(execute(process.execPath,
      [script, directory, 'recover', '--session-id', 'zcode-session-1', '--session-type', 'subagent',
        '--expected-native-session', first.sessionId]),
      /INSPECTION_REQUIRED/);
    const recovered = JSON.parse((await execute(process.execPath, [script, directory, 'recover',
      '--session-id', 'zcode-session-1', '--session-type', 'subagent',
      '--expected-native-session', first.sessionId, '--inspected'])).stdout);
    assert.equal(recovered.status, 'resumable');
    const backup = JSON.parse(await readFile(recovered.backup, 'utf8'));
    assert.equal(backup.status, 'uncertain');
    const resumed = await sessions.run(request({ fingerprint: 'next-turn' }), async input => {
      assert.equal(input.session.id, first.sessionId);
      assert.equal(input.session.resume, true);
      return worker(input, 'resumed');
    });
    assert.equal(resumed.sessionId, first.sessionId);
  });
});

test('the retained turn limit is explicit', async () => {
  await withState(async directory => {
    const sessions = new ClaudeSessions(directory);
    const callback = async input => worker(input);
    for (let turn = 0; turn < 1024; turn++) {
      await sessions.run(request({ fingerprint: `turn-${turn}` }), callback);
    }
    await assert.rejects(sessions.run(request({ fingerprint: 'turn-1024' }), callback), { code: 'SESSION_TURN_LIMIT' });
    const replay = await sessions.run(request({ fingerprint: 'turn-0' }), callback);
    assert.equal(replay.response, 'ok');
  });
});
