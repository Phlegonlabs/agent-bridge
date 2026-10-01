import { mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
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
      !['running', 'uncertain', 'completed'].includes(receipt.status) ||
      !Array.isArray(receipt.turns) || receipt.turns.length > TURN_LIMIT ||
      receipt.turns.some(turn => typeof turn?.fingerprintHash !== 'string' ||
        (turn.status !== 'completed' && turn.status !== 'uncertain'))) {
      throw new BridgeError('SESSION_STATE_INVALID', 'Claude session state did not match its schema.');
    }
    return receipt;
  }

  #requireAvailable(receipt, request) {
    if (!receipt) return;
    if (receipt.status !== 'completed') {
      throw new BridgeError('SESSION_RECOVERY_REQUIRED',
        `Claude session is ${receipt.status}; inspect the native session before reuse.`);
    }
    if (receipt.cwd !== request.cwd) {
      throw new BridgeError('SESSION_CWD_CHANGED', 'The native session belongs to a different workspace.');
    }
    if (receipt.policyHash !== request.policyHash) {
      throw new BridgeError('SESSION_POLICY_CHANGED', 'The native session belongs to a different execution policy.');
    }
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

  async run(request, callback) {
    if (typeof callback !== 'function') throw new BridgeError('INVALID_SESSION_CALLBACK', 'Claude callback must be a function.');
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw new BridgeError('INVALID_SESSION_INPUT', 'Claude session request must be an object.');
    }
    const zcodeSessionId = boundedToken(request.sessionId, 'sessionId', 128);
    const sessionType = boundedToken(request.sessionType, 'sessionType', 64);
    const fingerprint = boundedToken(request.fingerprint, 'fingerprint', 32768);
    const keyHash = jsonHash([zcodeSessionId, sessionType]);
    const fingerprintHash = hash(fingerprint);

    if (this.#locks.has(keyHash)) throw new BridgeError('SESSION_BUSY', 'The Claude session already has an active turn.');
    this.#locks.set(keyHash, true);
    try {
      await this.#ready;
      request.signal?.throwIfAborted();
      const cwd = await canonicalDirectory(request.cwd);
      const policyHash = jsonHash(request.policy ?? {});
      const receipt = await this.#load(keyHash);
      this.#requireAvailable(receipt, { cwd, policyHash });
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

      let callbackStarted = false;
      try {
        request.signal?.throwIfAborted();
        callbackStarted = true;
        const result = await callback({ session: { id: nativeSessionId, resume } });
        this.#validateResult(result);
        request.signal?.throwIfAborted();
        if (result.ok && result.sessionId !== nativeSessionId) {
          throw new BridgeError('SESSION_MISMATCH', 'The Claude worker did not use the assigned native session.');
        }
        if (!result.ok) {
          await this.#writeAtomic(this.#statePath(keyHash), {
            ...running,
            status: 'uncertain',
            failure: { code: result.code ?? 'WORKER_FAILED', at: new Date().toISOString() },
          });
          return result;
        }
        const completed = {
          ...running,
          status: 'completed',
          completedAt: new Date().toISOString(),
          turns: [...running.turns, { status: 'completed', fingerprintHash, result,
            completedAt: new Date().toISOString() }],
        };
        await this.#writeAtomic(this.#statePath(keyHash), completed);
        return result;
      } catch (error) {
        const code = error instanceof BridgeError ? error.code : 'CALLBACK_FAILED';
        if (!callbackStarted) {
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
    } finally {
      this.#locks.delete(keyHash);
    }
  }
}
