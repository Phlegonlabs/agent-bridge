import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { glob, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { bridgeRoot } from './account.mjs';
import { BridgeError, hash } from './profiles.mjs';
import { runProcess } from './process.mjs';
import { createCodexAudit } from './codex-audit.mjs';

const execute = promisify(execFile);
const SHIM_EXTENSIONS = new Set(['.cmd', '.bat', '.ps1']);

// Node spawns without a shell, so an npm launcher shim cannot be executed
// (spawn EINVAL); only the native codex binary is a usable runtime.
export async function codexRuntime(resolved = process.env.CODEX_BRIDGE_BIN) {
  let located = resolved;
  if (!located) {
    const lookup = await execute(process.platform === 'win32' ? 'where.exe' : 'which',
      [process.platform === 'win32' ? 'codex.exe' : 'codex'], { timeout: 8000, windowsHide: true });
    located = lookup.stdout.trim().split(/\r?\n/)[0];
  }
  if (!located) throw new BridgeError('CODEX_NOT_INSTALLED', 'Codex CLI was not found on PATH.');
  if (SHIM_EXTENSIONS.has(path.extname(located).toLowerCase())) {
    throw new BridgeError('CODEX_RUNTIME_INVALID', 'Codex resolved to an npm launcher shim; install the native Codex binary instead.');
  }
  const command = await realpath(located);
  return { command, prefix: [], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } };
}

// exec --json events never name the model; the persisted session rollout does.
// Locate rollout-<timestamp>-<threadId>.jsonl and confirm its turn_context model.
async function verifyRollout(threadId, model) {
  const pattern = path.join(homedir(), '.codex', 'sessions', '*', '*', '*', `rollout-*-${threadId}.jsonl`)
    .split(path.sep).join('/');
  for (let attempt = 0; attempt < 3; attempt++) {
    const files = [];
    for await (const entry of glob(pattern)) files.push(entry);
    if (files.length > 1) throw new BridgeError('CODEX_SESSION_UNVERIFIED', 'Multiple rollout files claim this thread.');
    const file = files[0];
    if (file) {
      const text = await readFile(file, 'utf8');
      let sessionConfirmed = false;
      const reportedModels = new Set();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        if (record?.type === 'session_meta' && record.payload?.session_id === threadId) sessionConfirmed = true;
        if (record?.type === 'turn_context' && typeof record.payload?.model === 'string') reportedModels.add(record.payload.model);
      }
      if (sessionConfirmed && reportedModels.size) {
        if (reportedModels.size > 1) throw new BridgeError('CODEX_MODEL_MISMATCH', 'The rollout records more than one model for this thread.');
        return { sessionConfirmed, reportedModel: reportedModels.values().next().value };
      }
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500));
  }
  return { sessionConfirmed: false, reportedModel: undefined };
}

export async function runCodex({ cwd, task, model, timeoutMs = 60000, signal, codexBin }) {
  if (typeof model !== 'string' || !model || model === 'auto') throw new BridgeError('CODEX_MODEL_REQUIRED', 'Choose an explicit Codex model id, for example gpt-6.1-sol.');
  if (typeof task !== 'string' || !task.trim() || Buffer.byteLength(task) > 32768) throw new BridgeError('INVALID_TASK', 'Task must be 1..32768 bytes.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000) throw new BridgeError('INVALID_TIMEOUT', 'Timeout must be 100..600000 ms.');
  const deadline = Date.now() + timeoutMs;
  const workspace = await realpath(cwd);
  if (!(await stat(workspace)).isDirectory()) throw new BridgeError('INVALID_CWD', 'Workspace must be a directory.');
  const runtime = await codexRuntime(codexBin);
  const runId = randomUUID();
  const logs = path.join(bridgeRoot, '.bridge', 'runs', runId);
  await mkdir(logs, { recursive: true, mode: 0o700 });
  await writeFile(path.join(logs, 'request.json'), JSON.stringify({ runId, provider: 'codex', model,
    taskSha256: hash(task), mode: 'read-only', timeoutMs }, null, 2), { flag: 'wx', mode: 0o600 });
  const audit = createCodexAudit(model);
  const remainingMs = deadline - Date.now();
  if (remainingMs < 100) throw new BridgeError('TIMEOUT', 'Codex preflight exhausted the run deadline.');
  // mcp_servers={} drops configured MCP servers: headless workers must not carry
  // the interactive account's MCP tools, and their OAuth handshake logs noise.
  const execution = await runProcess({ command: runtime.command, cwd: workspace, env: runtime.env,
    args: [...runtime.prefix, 'exec', '--json', '--color', 'never', '-s', 'read-only',
      '--skip-git-repo-check', '-C', workspace, '-m', model, '-c', 'mcp_servers={}',
      '--', task],
    timeoutMs: remainingMs, signal, stdoutPath: path.join(logs, 'events.jsonl'), stderrPath: path.join(logs, 'stderr.log'),
    onLine: line => audit.ingest(line) });
  // A missing or ambiguous rollout means the dispatch cannot be verified; the
  // audit then fails CODEX_SESSION_UNVERIFIED instead of guessing.
  const rollout = await verifyRollout(audit.threadId, model)
    .catch(() => ({ sessionConfirmed: false, reportedModel: undefined }));
  const report = { schema: 'agent-bridge/result/1', runId, ...audit.finish(execution, rollout), mode: 'read-only', execution, logs };
  await writeFile(path.join(logs, 'result.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  return report;
}
