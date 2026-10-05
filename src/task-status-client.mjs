import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { readProviderConfig, providerState } from './provider-server.mjs';
import { BridgeError } from './profiles.mjs';
import { delegateSessionKey } from './delegate-requests.mjs';
import { taskIdPattern, terminalStates, publicTaskStatus } from './task-progress.mjs';

export async function readTaskStatus({ taskId, sessionId, sessionType, config, signal,
  state = providerState, fetchImpl = fetch } = {}) {
  if (taskId !== undefined && !taskIdPattern.test(taskId)) throw new BridgeError('INVALID_TASK_ID', 'Use a UUID task ID.');
  if (taskId && sessionId || sessionType !== undefined && sessionId === undefined) {
    throw new BridgeError('INVALID_ARGUMENT', 'Choose a task ID or session headers.');
  }
  if (sessionId !== undefined) delegateSessionKey(sessionId, sessionType);
  const settings = await readProviderConfig(config);
  const tokenFile = path.join(state, 'token');
  let token;
  try {
    const info = await lstat(tokenFile);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 128) throw new Error('unsafe token');
    token = (await readFile(tokenFile, 'utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('invalid token');
  } catch { throw new BridgeError('STATUS_UNAVAILABLE', 'No existing provider token. Start the configured bridge before checking native tasks.'); }
  let response;
  try {
    response = await fetchImpl(`http://127.0.0.1:${settings.port}/v1/tasks${taskId ? `/${taskId}` : ''}`, {
      headers: { Authorization: `Bearer ${token}`, ...(sessionId === undefined ? {} :
        { 'x-session-id': sessionId, 'x-zcode-session-type': sessionType ?? 'chat' }) },
      redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
    });
  } catch { throw new BridgeError('STATUS_UNAVAILABLE', 'Cannot reach the configured bridge. No task was started or retried.'); }
  if (![200, 404].includes(response.status)) throw new BridgeError('STATUS_UNAVAILABLE', 'The provider rejected status lookup.');
  let bytes = 0; const chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > 512 * 1024) throw new BridgeError('STATUS_UNAVAILABLE', 'Status response exceeds its limit.');
    chunks.push(Buffer.from(chunk));
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new BridgeError('STATUS_UNAVAILABLE', 'Invalid status response.'); }
  if (value.schema !== 'agent-bridge/tasks/1' || !Array.isArray(value.tasks) || value.tasks.length > 256) {
    throw new BridgeError('STATUS_UNAVAILABLE', 'The server did not return task status.');
  }
  return { schema: value.schema, available: value.available !== false, tasks: value.tasks.map(publicTaskStatus),
    observation: 'current-provider', observedAt: Date.now() };
}

// Finite polling is read-only. Silence never starts another model request.
export async function watchTaskStatus(options, emit, read = readTaskStatus) {
  const duration = options.watchMs ?? 600000, interval = options.intervalMs ?? 2000;
  if (!Number.isInteger(duration) || duration < 1000 || duration > 5400000 ||
      !Number.isInteger(interval) || interval < 1000 || interval > 60000) {
    throw new BridgeError('INVALID_ARGUMENT', 'Watch lasts 1000..5400000 ms; interval is 1000..60000 ms.');
  }
  const end = Date.now() + duration;
  options = { ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(duration)]) : AbortSignal.timeout(duration) };
  do {
    options.signal?.throwIfAborted();
    let value;
    try { value = await read(options); }
    catch (error) { if (Date.now() >= end && options.signal.aborted) return; throw error; }
    emit(value);
    if (!value.available || (options.taskId && value.tasks.every(task => terminalStates.has(task.state)))) return;
    const remaining = end - Date.now();
    if (remaining <= 0) break;
    try { await pause(Math.min(interval, remaining), undefined, { signal: options.signal }); }
    catch (error) { if (Date.now() >= end) return; throw error; }
  } while (Date.now() < end);
}
