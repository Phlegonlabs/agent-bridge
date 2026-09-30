import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bridgeRoot } from './account.mjs';
import { BridgeError, hash } from './profiles.mjs';
import { runProcess } from './process.mjs';
import { createClaudeAudit } from './claude-audit.mjs';

const execute = promisify(execFile);
const SHIM_EXTENSIONS = new Set(['.cmd', '.bat', '.ps1']);

const WORKER_INSTRUCTIONS = 'You are a Claude Code worker delegated by the agent-bridge relay. Do only the assigned relay task. Do not delegate, commit, push, publish, delete, move, or overwrite existing data. If permission is denied, report the blocker; do not attempt a bypass. Do not start background services. File scope is an assignment boundary, not an OS sandbox.';

// Node spawns without a shell, so an npm launcher shim cannot be executed
// (spawn EINVAL); only the native binary is a usable Claude runtime.
export async function claudeRuntime(resolved = process.env.CLAUDE_BRIDGE_BIN) {
  let located = resolved;
  if (!located) {
    const lookup = await execute(process.platform === 'win32' ? 'where.exe' : 'which',
      [process.platform === 'win32' ? 'claude.exe' : 'claude'], { timeout: 8000, windowsHide: true });
    located = lookup.stdout.trim().split(/\r?\n/)[0];
  }
  if (!located) throw new BridgeError('CLAUDE_NOT_INSTALLED', 'Claude Code CLI was not found on PATH.');
  if (SHIM_EXTENSIONS.has(path.extname(located).toLowerCase())) {
    throw new BridgeError('CLAUDE_RUNTIME_INVALID', 'Claude resolved to an npm launcher shim; install the native Claude Code binary instead.');
  }
  const command = await realpath(located);
  return { command, prefix: [], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } };
}

export async function runClaude({ cwd, task, model, timeoutMs = 60000, signal, claudeBin }) {
  if (typeof model !== 'string' || !model || model === 'auto') throw new BridgeError('CLAUDE_MODEL_REQUIRED', 'Choose an explicit Claude model id, for example claude-opus-5-5.');
  if (typeof task !== 'string' || !task.trim() || Buffer.byteLength(task) > 32768) throw new BridgeError('INVALID_TASK', 'Task must be 1..32768 bytes.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000) throw new BridgeError('INVALID_TIMEOUT', 'Timeout must be 100..600000 ms.');
  const deadline = Date.now() + timeoutMs;
  const workspace = await realpath(cwd);
  if (!(await stat(workspace)).isDirectory()) throw new BridgeError('INVALID_CWD', 'Workspace must be a directory.');
  const runtime = await claudeRuntime(claudeBin);
  const runId = randomUUID();
  const logs = path.join(bridgeRoot, '.bridge', 'runs', runId);
  await mkdir(logs, { recursive: true, mode: 0o700 });
  await writeFile(path.join(logs, 'request.json'), JSON.stringify({ runId, provider: 'claude', model,
    taskSha256: hash(task), mode: 'read-only', timeoutMs }, null, 2), { flag: 'wx', mode: 0o600 });
  const audit = createClaudeAudit(model);
  const remainingMs = deadline - Date.now();
  if (remainingMs < 100) throw new BridgeError('TIMEOUT', 'Claude preflight exhausted the run deadline.');
  const execution = await runProcess({ command: runtime.command, cwd: workspace, env: runtime.env,
    args: [...runtime.prefix, '-p', '--output-format', 'stream-json', '--verbose',
      '--safe-mode', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
      '--tools', 'Read,Glob,Grep', '--allowedTools', 'Read', 'Glob', 'Grep',
      '--append-system-prompt', WORKER_INSTRUCTIONS, '--model', model, '--', task],
    timeoutMs: remainingMs, signal, stdoutPath: path.join(logs, 'events.jsonl'), stderrPath: path.join(logs, 'stderr.log'), onLine: audit.ingest });
  const report = { schema: 'agent-bridge/result/1', runId, ...audit.finish(execution), mode: 'read-only', execution, logs };
  await writeFile(path.join(logs, 'result.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  return report;
}
