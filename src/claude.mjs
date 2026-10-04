import { mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bridgeRoot } from './account.mjs';
import { BridgeError, hash } from './profiles.mjs';
import { runProcess } from './process.mjs';
import { createClaudeAudit } from './claude-audit.mjs';
import { normalizeClaudeEffort, normalizeClaudeExecution, newSessionId } from './claude-permissions.mjs';
import { nativeExecutable } from './runtime-paths.mjs';


const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Node spawns without a shell, so an npm launcher shim cannot be executed
// (spawn EINVAL); only the native binary is a usable Claude runtime.
export async function claudeRuntime(resolved = process.env.CLAUDE_BRIDGE_BIN) {
  const command = await nativeExecutable('claude', resolved);
  return { command, prefix: [], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } };
}

export { newSessionId };

function buildSessionArguments(session) {
  if (!session) return [];
  if (typeof session !== 'object' || typeof session.id !== 'string' || !UUID_PATTERN.test(session.id) ||
      typeof session.resume !== 'boolean') {
    throw new BridgeError('INVALID_SESSION', 'Session must contain a UUID id and a boolean resume flag.');
  }
  return session.resume ? ['--resume', session.id] : ['--session-id', session.id];
}

function cliToolRules(policy) {
  return policy.tools.map(rule => rule.startsWith('Write(') ? `Edit(${rule.slice('Write('.length)}` : rule);
}

function workerInstructions(policy) {
  return [
    'You are a Claude Code worker delegated by the agent-bridge relay. You may be working alongside other workers: preserve unrelated changes.',
    'Read applicable AGENTS.md and CLAUDE.md files before working. Do only the assigned task.',
    'Do not delegate, push, publish, delete, move, force, bypass permissions, or start background services.',
    'If the assignment explicitly authorizes local commits, follow the repository rules and make atomic commits; otherwise do not commit.',
    'If permission is denied, report the blocker; do not attempt a bypass.',
    `Mode: ${policy.mode}. Authorized write scope: ${policy.writeScope ?? 'none'}.`,
    `Authorized tools: ${policy.tools.join(', ')}. File scope is an assignment boundary, not an OS sandbox.`
  ].join(' ');
}

export async function runClaude(input = {}) {
  const nativeState = { started: false };
  try {
    return await startClaude(input, nativeState);
  } catch (error) {
    error.nativeStarted = error.nativeStarted ?? nativeState.started;
    throw error;
  }
}

async function startClaude({ cwd, task, model, effort, execution, session, newSessionId: requestedNewSessionId,
  timeoutMs = 60000, signal, claudeBin, onTextDelta, onSpawn, runProcessImpl = runProcess }, nativeState) {
  if (typeof model !== 'string' || !model || model === 'auto') throw new BridgeError('CLAUDE_MODEL_REQUIRED', 'Choose an explicit Claude model id, for example claude-opus-5-5.');
  if (typeof task !== 'string' || !task.trim() || Buffer.byteLength(task) > 32768) throw new BridgeError('INVALID_TASK', 'Task must be 1..32768 bytes.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000) throw new BridgeError('INVALID_TIMEOUT', 'Timeout must be 100..600000 ms.');
  const deadline = Date.now() + timeoutMs;
  const workspace = await realpath(cwd);
  if (!(await stat(workspace)).isDirectory()) throw new BridgeError('INVALID_CWD', 'Workspace must be a directory.');
  const runtime = await claudeRuntime(claudeBin);
  const policy = normalizeClaudeExecution(execution, { cwd: workspace });
  const requestedEffort = normalizeClaudeEffort(effort ?? policy.effort);
  policy.effort = requestedEffort;
  if (session === undefined && typeof requestedNewSessionId === 'string') {
    session = { id: requestedNewSessionId, resume: false };
  }
  const sessionArgs = buildSessionArguments(session);
  const runId = randomUUID();
  const logs = path.join(bridgeRoot, '.bridge', 'runs', runId);
  await mkdir(logs, { recursive: true, mode: 0o700 });
  await writeFile(path.join(logs, 'request.json'), JSON.stringify({ runId, provider: 'claude', model,
    taskSha256: hash(task), mode: policy.mode, execution: policy, requestedEffort,
    session: session ? { id: session.id, resume: session.resume } : null, timeoutMs }, null, 2), { flag: 'wx', mode: 0o600 });
  const audit = createClaudeAudit(model, { expectedSessionId: session?.id, effort: requestedEffort,
    mode: policy.mode, toolNames: policy.toolNames });
  // Partial text is advisory: verification still comes from the full audit.
  const onLine = onTextDelta
    ? line => {
        audit.ingest(line);
        if (line.includes('"stream_event"')) {
          try {
            const event = JSON.parse(line);
            if (event?.type === 'stream_event' && event.event?.type === 'content_block_delta' &&
                event.event.delta?.type === 'text_delta' && typeof event.event.delta.text === 'string') onTextDelta(event.event.delta.text);
          } catch { /* Deltas never fail a run. */ }
        }
      }
    : line => audit.ingest(line);
  const remainingMs = deadline - Date.now();
  if (remainingMs < 100) throw new BridgeError('TIMEOUT', 'Claude preflight exhausted the run deadline.');
  if (onSpawn !== undefined && typeof onSpawn !== 'function') {
    throw new BridgeError('INVALID_ON_SPAWN', 'onSpawn must be a function.');
  }
  const notifySpawn = details => {
    nativeState.started = true;
    onSpawn?.(details);
  };
  const processResult = await runProcessImpl({ command: runtime.command, cwd: workspace, env: runtime.env,
    args: [...runtime.prefix, '-p', '--output-format', 'stream-json', '--verbose',
      '--safe-mode', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
      '--tools', policy.toolNames.join(','), '--allowedTools', ...cliToolRules(policy),
      '--append-system-prompt', workerInstructions(policy), '--model', model,
      ...(requestedEffort ? ['--effort', requestedEffort] : []),
      ...sessionArgs,
      ...(onTextDelta ? ['--include-partial-messages'] : []), '--', task],
    timeoutMs: remainingMs, signal, stdoutPath: path.join(logs, 'events.jsonl'), stderrPath: path.join(logs, 'stderr.log'),
    onLine, onSpawn: notifySpawn });
  processResult.nativeStarted = processResult.nativeStarted ?? nativeState.started;
  if (processResult.reason === 'spawn_failed' && processResult.pid === undefined) processResult.nativeStarted = false;
  const report = { schema: 'agent-bridge/result/1', runId, ...audit.finish(processResult), mode: policy.mode,
    toolPolicy: policy, requestedSessionId: session?.id ?? null, sessionResume: session?.resume ?? false,
    nativeStarted: processResult.nativeStarted, execution: processResult, logs };
  await writeFile(path.join(logs, 'result.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  return report;
}
