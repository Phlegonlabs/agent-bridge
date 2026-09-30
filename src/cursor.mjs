import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bridgeRoot } from './account.mjs';
import { BridgeError, hash } from './profiles.mjs';
import { runProcess } from './process.mjs';
import { createCursorAudit, parseCursorModels } from './cursor-audit.mjs';

export const cursorBuild = '2026.09.18-9a7762b';
export async function cursorRuntime(directory = process.env.CURSOR_BRIDGE_DIR) {
  const root = await realpath(directory ?? path.join(bridgeRoot, '.bridge', 'tools', `cursor-${cursorBuild}`, 'dist-package'));
  const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (metadata.name !== '@anysphere/agent-cli-runtime') throw new BridgeError('INVALID_CURSOR_RUNTIME', 'Select an official Cursor CLI package directory.');
  const command = await realpath(path.join(root, process.platform === 'win32' ? 'node.exe' : 'node'));
  const entry = await realpath(path.join(root, 'index.js'));
  return { command, prefix: [entry], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CURSOR_INVOKED_AS: 'cursor-agent' } };
}

async function commandResult(runtime, args, { timeoutMs = 20000, signal, onLine } = {}) {
  const logs = path.join(bridgeRoot, '.bridge', 'cursor-commands', randomUUID());
  await mkdir(logs, { recursive: true, mode: 0o700 });
  const stdoutPath = path.join(logs, 'stdout.log');
  const execution = await runProcess({ command: runtime.command, args: [...runtime.prefix, ...args],
    cwd: bridgeRoot, env: runtime.env, timeoutMs, signal, maxBytes: 256 * 1024,
    stdoutPath, stderrPath: path.join(logs, 'stderr.log'), onLine });
  return { execution, logs, stdout: await readFile(stdoutPath, 'utf8') };
}

export async function cursorModels(runtime, options = {}) {
  const result = await commandResult(runtime, ['models'], options);
  if (result.execution.reason || result.execution.exitCode !== 0) throw new BridgeError('CURSOR_MODELS_FAILED', 'Cursor model listing failed. Check login with doctor --provider cursor.');
  return { provider: 'cursor', models: parseCursorModels(result.stdout), logs: result.logs };
}

export async function cursorDoctor(runtime, options = {}) {
  const result = await commandResult(runtime, ['status', '--format', 'json'], options);
  let status;
  try { status = JSON.parse(result.stdout); } catch { /* Raw authentication output stays private. */ }
  const authenticated = !result.execution.reason && result.execution.exitCode === 0 &&
    status?.status === 'authenticated' && status?.isAuthenticated === true;
  return { ok: authenticated, provider: 'cursor', authenticated, modelAccess: 'unverified',
    cli: runtime.prefix[0], code: authenticated ? 'CURSOR_AUTHENTICATED' : 'CURSOR_AUTH_REQUIRED', logs: result.logs };
}

export async function cursorLogin(runtime, { signal, onAuthorizeUrl = () => {} } = {}) {
  const result = await commandResult(runtime, ['login'], { signal, timeoutMs: 310000, onLine(line) {
    for (const raw of line.match(/https:\/\/[^\s\x1b]+/g) ?? []) {
      try {
        const url = new URL(raw);
        if (url.hostname === 'cursor.com' || url.hostname.endsWith('.cursor.com') || url.hostname === 'cursor.sh' || url.hostname.endsWith('.cursor.sh')) onAuthorizeUrl(url.href);
      } catch { /* Other output stays private. */ }
    }
  } });
  if (result.execution.reason || result.execution.exitCode !== 0) return { ok: false, provider: 'cursor', code: 'CURSOR_LOGIN_FAILED', execution: result.execution, logs: result.logs };
  return cursorDoctor(runtime, { signal });
}

export async function runCursor({ cwd, task, model, cursorDir, timeoutMs = 60000, signal, trustWorkspace = false }) {
  if (typeof model !== 'string' || !model || model === 'auto') throw new BridgeError('CURSOR_MODEL_REQUIRED', 'Choose an explicit Cursor model from models --provider cursor; Auto cannot prove a fixed model.');
  if (typeof task !== 'string' || !task.trim() || Buffer.byteLength(task) > 32768) throw new BridgeError('INVALID_TASK', 'Task must be 1..32768 bytes.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000) throw new BridgeError('INVALID_TIMEOUT', 'Timeout must be 100..600000 ms.');
  const deadline = Date.now() + timeoutMs;
  const workspace = await realpath(cwd);
  if (!(await stat(workspace)).isDirectory()) throw new BridgeError('INVALID_CWD', 'Workspace must be a directory.');
  const runtime = await cursorRuntime(cursorDir);
  const catalog = await cursorModels(runtime, { signal, timeoutMs: Math.min(20000, timeoutMs) });
  const selected = catalog.models.find(item => item.id === model);
  if (!selected) throw new BridgeError('CURSOR_MODEL_UNAVAILABLE', 'The requested model is not in the current Cursor account catalog.');
  const runId = randomUUID();
  const logs = path.join(bridgeRoot, '.bridge', 'runs', runId);
  await mkdir(logs, { recursive: true, mode: 0o700 });
  await writeFile(path.join(logs, 'request.json'), JSON.stringify({ runId, provider: 'cursor', model,
    catalogLabel: selected.label, taskSha256: hash(task), mode: 'ask', trustWorkspace, timeoutMs }, null, 2), { flag: 'wx', mode: 0o600 });
  const audit = createCursorAudit(selected);
  const remainingMs = deadline - Date.now();
  if (remainingMs < 100) throw new BridgeError('TIMEOUT', 'Cursor preflight exhausted the run deadline.');
  const execution = await runProcess({ command: runtime.command, cwd: workspace, env: runtime.env,
    args: [...runtime.prefix, '--print', '--output-format', 'stream-json', '--mode', 'ask',
      '--model', model, '--workspace', workspace, ...(trustWorkspace ? ['--trust'] : []), '--', task],
    timeoutMs: remainingMs, signal, stdoutPath: path.join(logs, 'events.jsonl'), stderrPath: path.join(logs, 'stderr.log'), onLine: audit.ingest });
  const report = { schema: 'zcode-workflow-bridge/result/1', runId, ...audit.finish(execution), mode: 'ask', execution, logs };
  await writeFile(path.join(logs, 'result.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  return report;
}
