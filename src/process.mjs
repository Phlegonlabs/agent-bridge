import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { BridgeError } from './profiles.mjs';

const execute = promisify(execFile);

export function ownedProcessTree(tree, rootPid, startedAt) {
  const root = tree.find(entry => entry.pid === rootPid);
  const rootStarted = Date.parse(root?.started);
  if (!Number.isFinite(rootStarted) || Math.abs(rootStarted - startedAt) > 2000) return [];
  const owned = [root], seen = new Set([rootPid]);
  for (let index = 0; index < owned.length; index++) {
    const parent = owned[index];
    for (const entry of tree) {
      if (!seen.has(entry.pid) && entry.parent === parent.pid &&
          Date.parse(entry.started) >= Date.parse(parent.started)) {
        seen.add(entry.pid); owned.push(entry);
      }
    }
  }
  return owned;
}

export async function terminateOwnedTree(child, startedAt) {
  if (child.exitCode !== null || child.signalCode !== null) return { status: 'already_exited', pid: child.pid };
  if (process.platform === 'win32') {
    const script = `$q = [System.Collections.Generic.Queue[int]]::new(); $q.Enqueue(${child.pid}); $seen = @{}; $rows = @(); while ($q.Count -gt 0 -and $rows.Count -lt 256) { $n = $q.Dequeue(); if ($seen.ContainsKey($n)) { continue }; $seen[$n] = $true; $p = Get-CimInstance Win32_Process -Filter "ProcessId = $n"; if ($p) { $rows += [pscustomobject]@{pid=$p.ProcessId; parent=$p.ParentProcessId; name=$p.Name; started=$p.CreationDate.ToUniversalTime().ToString('o')}; Get-CimInstance Win32_Process -Filter "ParentProcessId = $n" | ForEach-Object { $q.Enqueue([int]$_.ProcessId) } } }; ConvertTo-Json -InputObject @($rows) -Compress`;
    const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 20000, maxBuffer: 131072 });
    const snapshot = JSON.parse(stdout || '[]');
    const tree = ownedProcessTree(snapshot, child.pid, startedAt);
    const root = tree.find(x => x.pid === child.pid);
    if (!root && snapshot.some(entry => entry.pid === child.pid)) throw new Error('Owned PID identity could not be verified.');
    if (!root) return { status: 'already_exited', pid: child.pid, tree };
    if (child.exitCode === null && child.signalCode === null) {
      const ownedIdentities = tree.map(entry => `@{pid=${entry.pid};started='${entry.started}';name='${entry.name}'}`).join(',');
      const stop = `foreach ($item in @(${ownedIdentities})) { $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($item.pid)"; if ($p -and $p.CreationDate.ToUniversalTime().ToString('o') -eq $item.started -and $p.Name -eq $item.name) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } }`;
      await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', stop],
        { windowsHide: true, timeout: 20000, maxBuffer: 131072 });
    }
    const identities = tree.map(p => `@{pid=${p.pid};started='${p.started}'}`).join(',');
    const verify = `$alive = @(); foreach ($item in @(${identities})) { $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($item.pid)"; if ($p -and $p.CreationDate.ToUniversalTime().ToString('o') -eq $item.started) { $alive += $item.pid } }; ConvertTo-Json -InputObject @($alive) -Compress`;
    const checked = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', verify],
      { windowsHide: true, timeout: 20000, maxBuffer: 131072 });
    const survivors = JSON.parse(checked.stdout || '[]');
    return { status: survivors.length ? 'unconfirmed' : 'terminated', pid: child.pid, tree, survivors };
  }
  process.kill(-child.pid, 'SIGKILL');
  return { status: 'terminated_process_group', pid: child.pid };
}

// The pipe is always drained. Only bounded line fragments and sanitized audit facts stay in RAM.
export async function runProcess({ command, args, cwd, env = process.env, timeoutMs = 60000,
  maxBytes = 8 * 1024 * 1024, stdoutPath, stderrPath, onLine = () => {}, onStderrLine = () => {}, onSpawn, stdinText, signal }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000) throw new BridgeError('INVALID_TIMEOUT', 'Timeout must be 100..600000 ms.');
  if (stdinText !== undefined && (typeof stdinText !== 'string' || Buffer.byteLength(stdinText) > 4 * 1024 * 1024)) {
    throw new BridgeError('INVALID_INPUT', 'Process input must be text of at most 4 MiB.');
  }
  if (signal?.aborted) return { exitCode: null, reason: 'cancelled', cleanup: { status: 'not_started' } };
  const out = await open(stdoutPath, 'wx', 0o600);
  let err;
  try { err = await open(stderrPath, 'wx', 0o600); }
  catch (error) { await out.close(); throw error; }
  const startedAt = Date.now();
  let child;
  try {
    child = spawn(command, args, { cwd, env, shell: false, windowsHide: true,
      detached: process.platform !== 'win32', stdio: [stdinText === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  } catch (error) { await out.close(); await err.close(); throw error; }
  let bytes = 0, reason = null, cleanup = null, stopPromise, tail = '', errorTail = '', closed = false;
  let finishClose;
  const decoder = new StringDecoder('utf8');
  const errorDecoder = new StringDecoder('utf8');
  let outputWrites = Promise.resolve(), errorWrites = Promise.resolve();
  function persist(file, chunk) {
    const next = (file === out ? outputWrites : errorWrites).then(() => file.write(chunk)).catch(() => stop('log_write_failed'));
    if (file === out) outputWrites = next; else errorWrites = next;
  }
  function stop(why) {
    if (stopPromise) return stopPromise;
    reason = why;
    stopPromise = terminateOwnedTree(child, startedAt).then(x => { cleanup = x; }).catch(() => {
      cleanup = { status: 'unconfirmed', pid: child.pid };
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }).finally(async () => {
      // Sending a signal is not exit evidence. Wait for Node to reap the root
      // and close its pipes before allowing the caller to proceed.
      if (!closed) await new Promise(resolve => {
        const exited = () => { clearTimeout(deadline); resolve(); };
        const deadline = setTimeout(() => { child.removeListener('close', exited); resolve(); }, 5000);
        child.once('close', exited);
      });
      if (!closed) {
        cleanup = { ...cleanup, status: 'unconfirmed' };
        child.stdout.destroy(); child.stderr.destroy(); child.unref();
        finishClose?.({ exitCode: child.exitCode, exitSignal: child.signalCode });
      }
    });
    return stopPromise;
  }
  function acceptLine(line) {
    if (reason) return;
    try { onLine(line); } catch (error) { stop(error.code ?? 'protocol_rejected'); }
  }
  function receive(chunk, isError) {
    bytes += chunk.length;
    if (bytes > maxBytes) { stop('output_limit'); return; }
    persist(isError ? err : out, chunk);
    if (isError) {
      errorTail += errorDecoder.write(chunk);
      let end;
      while ((end = errorTail.indexOf('\n')) >= 0) {
        try { onStderrLine(errorTail.slice(0, end)); } catch { stop('protocol_rejected'); }
        errorTail = errorTail.slice(end + 1);
      }
      if (Buffer.byteLength(errorTail) > 1024 * 1024) { errorTail = ''; stop('line_limit'); }
      return;
    }
    tail += decoder.write(chunk);
    let end;
    while ((end = tail.indexOf('\n')) >= 0) {
      acceptLine(tail.slice(0, end)); tail = tail.slice(end + 1);
    }
    if (Buffer.byteLength(tail) > 1024 * 1024) { tail = ''; stop('line_limit'); }
  }
  child.stdout.on('data', x => receive(x, false));
  child.stderr.on('data', x => receive(x, true));
  child.once('spawn', () => {
    try { onSpawn?.({ pid: child.pid, startedAt, command, cwd }); }
    catch (error) { void stop(error.code ?? 'spawn_hook_failed'); }
    if (stdinText !== undefined) child.stdin.end(stdinText, 'utf8');
  });
  child.stdin?.on('error', error => { if (error.code !== 'EPIPE') void stop('stdin_failed'); });
  const abort = () => { void stop('cancelled'); };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => { void stop('timeout'); }, timeoutMs);
  const result = await new Promise(resolve => {
    finishClose = resolve;
    child.on('error', () => { reason ??= 'spawn_failed'; });
    child.on('close', (exitCode, exitSignal) => { closed = true; resolve({ exitCode, exitSignal }); });
  });
  clearTimeout(timer); signal?.removeEventListener('abort', abort);
  if (!reason) { tail += decoder.end(); if (tail.trim()) acceptLine(tail); }
  await Promise.all([outputWrites, errorWrites]);
  await stopPromise;
  await out.close(); await err.close();
  return { ...result, pid: child.pid, startedAt, endedAt: Date.now(), bytes, reason, cleanup };
}
