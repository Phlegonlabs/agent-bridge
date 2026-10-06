import { glob, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bridgeRoot } from './account.mjs';
import { BridgeError, hash } from './profiles.mjs';
import { runProcess } from './process.mjs';
import { createCodexAppServer } from './codex-app-server.mjs';
import { createCodexAudit } from './codex-audit.mjs';
import { codexIsolationArgs } from './codex-isolation.mjs';
import { codexHomeDirectory, codexModelCatalog, normalizeEffortValue, selectCodexModel } from './model-options.mjs';
import { nativeExecutable } from './runtime-paths.mjs';
import { notifyProgress } from './task-progress.mjs';
import { observeNativeProgress } from './native-progress.mjs';


// Node spawns without a shell, so an npm launcher shim cannot be executed
// (spawn EINVAL); only the native codex binary is a usable runtime.
export async function codexRuntime(resolved = process.env.CODEX_BRIDGE_BIN) {
  const command = await nativeExecutable('codex', resolved);
  return { command, prefix: [], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } };
}

// Persisted turn context independently confirms app-server dispatch metadata.
// Locate rollout-<timestamp>-<threadId>.jsonl and confirm its turn_context model.
async function verifyRollout(threadId, codexHome = codexHomeDirectory(), deadline = Infinity) {
  const pattern = path.join(codexHome, 'sessions', '*', '*', '*', `rollout-*-${threadId}.jsonl`)
    .split(path.sep).join('/');
  for (let attempt = 0; attempt < 3; attempt++) {
    if (Date.now() >= deadline) throw new BridgeError('TIMEOUT', 'Codex verification exhausted the run deadline.');
    const files = [];
    for await (const entry of glob(pattern)) files.push(entry);
    if (files.length > 1) throw new BridgeError('CODEX_SESSION_UNVERIFIED', 'Multiple rollout files claim this thread.');
    const file = files[0];
    if (file) {
      const text = await readFile(file, 'utf8');
      let sessionConfirmed = false;
      const reportedModels = new Set();
      const reportedEfforts = new Set();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        if (record?.type === 'session_meta' && record.payload?.session_id === threadId) sessionConfirmed = true;
        if (record?.type === 'turn_context' && typeof record.payload?.model === 'string') reportedModels.add(record.payload.model);
        if (record?.type === 'turn_context' && typeof record.payload?.effort === 'string') reportedEfforts.add(record.payload.effort);
      }
      if (sessionConfirmed && reportedModels.size) {
        if (reportedModels.size > 1) throw new BridgeError('CODEX_MODEL_MISMATCH', 'The rollout records more than one model for this thread.');
        return { sessionConfirmed, reportedModel: reportedModels.values().next().value,
          reportedEffort: reportedEfforts.size === 1 ? reportedEfforts.values().next().value : undefined };
      }
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, Math.min(500, Math.max(0, deadline - Date.now()))));
  }
  return { sessionConfirmed: false, reportedModel: undefined };
}

export async function runCodex({ cwd, task, model, effort, timeoutMs = 60000, signal, codexBin, onProgress, onPartial, purpose = 'relay' }) {
  if (!['relay', 'image'].includes(purpose)) throw new BridgeError('INVALID_CODEX_PURPOSE', 'Choose relay or image execution.');
  if (purpose === 'image' && onPartial) throw new BridgeError('INVALID_CODEX_PURPOSE', 'Image execution does not stream relay text.');
  if (typeof model !== 'string' || !model || model === 'auto') throw new BridgeError('CODEX_MODEL_REQUIRED', 'Choose an explicit Codex model id, for example gpt-6.1-sol.');
  if (typeof task !== 'string' || !task.trim() || Buffer.byteLength(task) > 4 * 1024 * 1024) {
    throw new BridgeError('INVALID_TASK', 'Task must be 1..4194304 bytes.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000) throw new BridgeError('INVALID_TIMEOUT', 'Timeout must be 100..600000 ms.');
  let requestedEffort;
  try { requestedEffort = normalizeEffortValue(effort); }
  catch (error) { throw new BridgeError('CODEX_EFFORT_INVALID', 'Codex effort must be a supported lowercase level or default.'); }
  const deadline = Date.now() + timeoutMs;
  const workspace = await realpath(cwd);
  if (!(await stat(workspace)).isDirectory()) throw new BridgeError('INVALID_CWD', 'Workspace must be a directory.');
  const codexHome = codexHomeDirectory();
  const catalog = await codexModelCatalog(codexHome);
  const selected = selectCodexModel(catalog.models, model, requestedEffort);
  const runtime = await codexRuntime(codexBin);
  const runId = randomUUID();
  const logs = path.join(bridgeRoot, '.bridge', 'runs', runId);
  await mkdir(logs, { recursive: true, mode: 0o700 });
  await writeFile(path.join(logs, 'request.json'), JSON.stringify({ runId, provider: 'codex', model,
    requestedEffort, catalogDefaultEffort: selected.defaultEffort,
    taskSha256: hash(task), mode: 'read-only', purpose, timeoutMs }, null, 2), { flag: 'wx', mode: 0o600 });
  // Native image generation has its own retained exec contract and image proof.
  // It must not inherit the text relay's tool-disabled app-server transport.
  const isolation = purpose === 'relay' ? await codexIsolationArgs(runtime, workspace, logs, deadline, signal) : [];
  const audit = purpose === 'relay'
    ? createCodexAppServer({ model, effort: requestedEffort, cwd: workspace, task, onPartial, onProgress })
    : createCodexAudit(model, requestedEffort);
  const remainingMs = deadline - Date.now();
  if (remainingMs < 100) throw new BridgeError('TIMEOUT', 'Codex preflight exhausted the run deadline.');
  const execution = await runProcess({ command: runtime.command, cwd: workspace, env: runtime.env,
    ...(purpose === 'relay' ? {
      args: [...runtime.prefix, 'app-server', '--stdio', ...isolation], onStdin: audit.start, onLine: audit.onLine,
    } : {
      args: [...runtime.prefix, 'exec', '--json', '--color', 'never', '-s', 'read-only', '--skip-git-repo-check',
        '-C', workspace, '-m', model, ...(requestedEffort !== null ? ['-c', `model_reasoning_effort="${requestedEffort}"`] : []),
        '-c', 'mcp_servers={}', '--', '-'], stdinText: task,
      onLine: line => { audit.ingest(line); notifyProgress(() => observeNativeProgress('codex', line, onProgress)); },
    }),
    timeoutMs: remainingMs, signal,
    stdoutPath: path.join(logs, 'events.jsonl'), stderrPath: path.join(logs, 'stderr.log'),
    onProgress: event => notifyProgress(onProgress, { ...event, runId }) });
  // A missing or ambiguous rollout means the dispatch cannot be verified; the
  // audit then fails CODEX_SESSION_UNVERIFIED instead of guessing.
  const rollout = await verifyRollout(audit.threadId, codexHome, deadline)
    .catch(() => ({ sessionConfirmed: false, reportedModel: undefined, reportedEffort: undefined }));
  const report = { schema: 'agent-bridge/result/1', runId, ...audit.finish(execution, rollout), mode: 'read-only', execution, logs };
  await writeFile(path.join(logs, 'result.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  return report;
}
