import { copyFile, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BridgeError, hash } from './profiles.mjs';

const SESSION_SCHEMA = 'agent-bridge/claude-session/1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[\x21-\x7e]+$/;
const TURN_LIMIT = 1024;
const MAX_RESULT_BYTES = 1024 * 1024;

function boundedToken(value, name, limit) {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value) || value.length > limit) {
    throw new BridgeError('INVALID_SESSION_INPUT', `${name} must be 1..${limit} printable ASCII characters.`);
  }
  return value;
}

function stableJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) return value.map(stableJson);
  const prototype = Object.getPrototypeOf(value);
  if (typeof value !== 'object' || prototype !== Object.prototype && prototype !== null) {
    throw new BridgeError('INVALID_POLICY', 'Policy must be JSON data.');
  }
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJson(value[key])]));
}

function jsonHash(value) {
  return hash(JSON.stringify(stableJson(value)));
}

export { jsonHash };

// Continuation marker on a completed turn: how many request messages the
// native session has already seen, keyed by a stable-order hash of them.
function validTurnContext(value) {
  return value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Number.isInteger(value.messageCount) && value.messageCount >= 0 &&
    typeof value.prefixHash === 'string');
}

async function canonicalDirectory(value) {
  try {
    const resolved = await realpath(value);
    if (!(await stat(resolved)).isDirectory()) throw new Error('not a directory');
    return resolved;
  } catch {
    throw new BridgeError('INVALID_CWD', 'Workspace must be an existing directory.');
  }
}

export class ClaudeSessions {
  #directory;
  #ready;
  #root;
  #locks = new Map();

  constructor(directory) {
    if (typeof directory !== 'string' || !directory.trim()) {
      throw new BridgeError('INVALID_SESSION_STATE', 'Session state requires a directory.');
    }
    this.#directory = directory;
    this.#ready = this.#prepare();
  }

  async #prepare() {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    this.#root = await realpath(this.#directory);
    await mkdir(path.join(this.#root, 'keys'), { recursive: true, mode: 0o700 });
  }

  #statePath(keyHash) {
    if (!this.#root) throw new BridgeError('SESSION_STATE_UNAVAILABLE', 'Session state is not ready.');
    const file = path.join(this.#root, 'keys', `${keyHash}.json`);
    const relative = path.relative(this.#root, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BridgeError('SESSION_STATE_PATH', 'Session state resolved outside its directory.');
    }
    return file;
  }

  async #writeAtomic(file, value) {
    const relative = path.relative(this.#root, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BridgeError('SESSION_STATE_PATH', 'Session state resolved outside its directory.');
    }
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, file);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  async #load(keyHash) {
    const file = this.#statePath(keyHash);
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new BridgeError('SESSION_STATE_UNAVAILABLE', 'Claude session state could not be read.');
    }
    let receipt;
    try {
      receipt = JSON.parse(text);
    } catch {
      throw new BridgeError('SESSION_STATE_INVALID', 'Claude session state is not valid JSON.');
    }
    if (receipt?.schema !== SESSION_SCHEMA || receipt.keyHash !== keyHash ||
      !UUID_PATTERN.test(receipt.nativeSessionId ?? '') ||
      typeof receipt.cwd !== 'string' || typeof receipt.policyHash !== 'string' ||
      !['running', 'uncertain', 'completed', 'resumable'].includes(receipt.status) ||
      !Array.isArray(receipt.turns) || receipt.turns.length > TURN_LIMIT ||
      receipt.turns.some(turn => typeof turn?.fingerprintHash !== 'string' ||
        (turn.status !== 'completed' && turn.status !== 'uncertain') || !validTurnContext(turn.context))) {
      throw new BridgeError('SESSION_STATE_INVALID', 'Claude session state did not match its schema.');
    }
    // Earlier releases marked killed workers resumable without inspecting writes.
    // Interpret those receipts safely without changing their original bytes.
    if (receipt.status === 'resumable' && !receipt.recoveredAt &&
        ['TIMEOUT', 'CANCELLED'].includes(receipt.failure?.code)) receipt.status = 'uncertain';
    return receipt;
  }

  #requireAvailable(receipt, request) {
    if (!receipt) return;
    if (receipt.cwd !== request.cwd) {
      throw new BridgeError('SESSION_CWD_CHANGED', 'The native session belongs to a different workspace.');
    }
    if (receipt.policyHash !== request.policyHash) {
      throw new BridgeError('SESSION_POLICY_CHANGED', 'The native session belongs to a different execution policy.');
    }
    if (receipt.status === 'completed' || receipt.status === 'resumable') return;
    if (this.#findTurn(receipt, request.fingerprintHash)) return;
    throw new BridgeError('SESSION_RECOVERY_REQUIRED',
      `Claude session is ${receipt.status}; inspect the native session before reuse.`);
  }

  #findTurn(receipt, fingerprintHash) {
    return receipt?.turns.find(turn => turn.fingerprintHash === fingerprintHash &&
      turn.status === 'completed' && turn.result && typeof turn.result === 'object');
  }

  #validateResult(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.ok !== 'boolean') {
      throw new BridgeError('CALLBACK_INVALID_RESULT', 'Claude callback must return a result object with ok.');
    }
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_RESULT_BYTES) {
      throw new BridgeError('RESULT_TOO_LARGE', 'Persisted Claude result exceeds 1 MiB.');
    }
  }

  async #withKeyLock(keyHash, operation) {
    if (this.#locks.has(keyHash)) throw new BridgeError('SESSION_BUSY', 'The Claude session already has an active turn.');
    this.#locks.set(keyHash, true);
    try {
      return await operation();
    } finally {
      this.#locks.delete(keyHash);
    }
  }

  async #identity(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw new BridgeError('INVALID_SESSION_INPUT', 'Claude session request must be an object.');
    }
    const sessionId = boundedToken(request.sessionId, 'sessionId', 128);
    const sessionType = boundedToken(request.sessionType, 'sessionType', 64);
    return { sessionId, sessionType, keyHash: jsonHash([sessionId, sessionType]) };
  }

  async inspect(request) {
    const identity = await this.#identity(request);
    return this.#withKeyLock(identity.keyHash, async () => {
      await this.#ready;
      const receipt = await this.#load(identity.keyHash);
      if (!receipt) throw new BridgeError('SESSION_NOT_FOUND', 'No Claude session receipt exists for this key.');
      return receipt;
    });
  }

  async recover(request) {
    const identity = await this.#identity(request);
    if (!UUID_PATTERN.test(request.expectedNativeSessionId ?? '')) {
      throw new BridgeError('INVALID_SESSION_INPUT', 'expectedNativeSessionId must be a UUID.');
    }
    if (request.inspected !== true) {
      throw new BridgeError('INSPECTION_REQUIRED', 'Confirm that the native Claude session was inspected.');
    }
    return this.#withKeyLock(identity.keyHash, async () => {
      await this.#ready;
      const file = this.#statePath(identity.keyHash);
      const receipt = await this.#load(identity.keyHash);
      if (!receipt) throw new BridgeError('SESSION_NOT_FOUND', 'No Claude session receipt exists for this key.');
      if (receipt.nativeSessionId !== request.expectedNativeSessionId) {
        throw new BridgeError('SESSION_MISMATCH', 'The expected native session does not match the receipt.');
      }
      if (receipt.status === 'running' && request.runtimeOffline !== true) {
        throw new BridgeError('RUNTIME_ACTIVE',
          'Verify the service is offline on port 32147 and pass runtimeOffline before recovering a running receipt.');
      }
      if (receipt.status === 'completed') {
        throw new BridgeError('SESSION_ALREADY_COMPLETED', 'The receipt is already completed.');
      }
      if (receipt.status === 'resumable') {
        throw new BridgeError('SESSION_ALREADY_RESUMABLE', 'The receipt is already resumable.');
      }
      const backup = `${file}.${new Date().toISOString().replace(/[:.]/g, '-')}.backup`;
      await copyFile(file, backup);
      await this.#writeAtomic(file, {
        ...receipt,
        status: 'resumable',
        recoveredAt: new Date().toISOString(),
      });
      return { status: 'resumable', backup };
    });
  }

  async run(request, callback) {
    if (typeof callback !== 'function') throw new BridgeError('INVALID_SESSION_CALLBACK', 'Claude callback must be a function.');
    const { keyHash } = await this.#identity(request);
    const fingerprint = boundedToken(request.fingerprint, 'fingerprint', 32768);
    const fingerprintHash = hash(fingerprint);

    return this.#withKeyLock(keyHash, async () => {
      await this.#ready;
      request.signal?.throwIfAborted();
      const cwd = await canonicalDirectory(request.cwd);
      const policyHash = jsonHash(request.policy ?? {});
      const receipt = await this.#load(keyHash);
      this.#requireAvailable(receipt, { cwd, policyHash, fingerprintHash });
      const previous = this.#findTurn(receipt, fingerprintHash);
      if (previous) return previous.result;

      if (receipt && receipt.turns.length >= TURN_LIMIT) {
        throw new BridgeError('SESSION_TURN_LIMIT', `A Claude session is limited to ${TURN_LIMIT} retained turns.`);
      }

      const nativeSessionId = receipt?.nativeSessionId ?? randomUUID();
      const resume = Boolean(receipt);
      const running = {
        schema: SESSION_SCHEMA,
        keyHash,
        nativeSessionId,
        cwd,
        policyHash,
        status: 'running',
        startedAt: new Date().toISOString(),
        turns: receipt?.turns ?? [],
      };
      await this.#writeAtomic(this.#statePath(keyHash), running);

      let executionStarted = false;
      try {
        request.signal?.throwIfAborted();
        const result = await callback({ session: { id: nativeSessionId, resume },
          onNativeStarted: () => { executionStarted = true; },
          priorContext: receipt?.turns?.at(-1)?.context ?? null });
        this.#validateResult(result);
        const spawnEvidence = executionStarted ||
          Number.isInteger(result.execution?.pid) && result.execution.pid > 0;
        executionStarted = Boolean(spawnEvidence);
        if (result.ok && result.sessionId !== nativeSessionId) {
          throw new BridgeError('SESSION_MISMATCH', 'The Claude worker did not use the assigned native session.');
        }
        if (!result.ok) {
          if (!spawnEvidence) {
            if (receipt) await this.#writeAtomic(this.#statePath(keyHash), receipt);
            else await unlink(this.#statePath(keyHash)).catch(() => {});
            return result;
          }
          await this.#writeAtomic(this.#statePath(keyHash), {
            ...running,
            status: 'uncertain',
            failure: { code: result.code ?? 'WORKER_FAILED', at: new Date().toISOString() },
          });
          return result;
        }
        let turnMarker;
        try { turnMarker = request.turnContext?.(); } catch { turnMarker = undefined; }
        const completed = {
          ...running,
          status: 'completed',
          completedAt: new Date().toISOString(),
          turns: [...running.turns, { status: 'completed', fingerprintHash, result,
            completedAt: new Date().toISOString(),
            ...(validTurnContext(turnMarker) && turnMarker ? { context: turnMarker } : {}) }],
        };
        await this.#writeAtomic(this.#statePath(keyHash), completed);
        return result;
      } catch (error) {
        const code = error instanceof BridgeError ? error.code : 'CALLBACK_FAILED';
        executionStarted ||= error.nativeStarted === true || error.nativeExecutionStarted === true ||
          error.worker?.nativeStarted === true ||
          Number.isInteger(error.worker?.execution?.pid) && error.worker.execution.pid > 0;
        if (executionStarted) error.nativeExecutionStarted = true;
        if (!executionStarted) {
          if (receipt) await this.#writeAtomic(this.#statePath(keyHash), receipt);
          else await unlink(this.#statePath(keyHash)).catch(() => {});
        } else {
          await this.#writeAtomic(this.#statePath(keyHash), {
            ...running,
            status: 'uncertain',
            failure: { code, at: new Date().toISOString() },
          }).catch(() => {});
        }
        throw error;
      }
    });
    }
  }
