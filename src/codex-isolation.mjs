import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from './process.mjs';
import { BridgeError } from './profiles.mjs';

// Disabled entries need their original transport kind. Empty maps do not remove
// configured servers. Retain names and kinds only; never forward credentials.
export async function codexIsolationArgs(runtime, cwd, logs, deadline, signal) {
  const timeoutMs = Math.min(10000, deadline - Date.now());
  if (timeoutMs < 100) throw new BridgeError('TIMEOUT', 'Codex isolation preflight exhausted the run deadline.');
  const stdoutPath = path.join(logs, 'mcp-list.json');
  const execution = await runProcess({ command: runtime.command, args: [...runtime.prefix, 'mcp', 'list', '--json'],
    cwd, env: runtime.env, timeoutMs, signal, maxBytes: 1024 * 1024,
    stdoutPath, stderrPath: path.join(logs, 'mcp-list.stderr.log') });
  if (execution.cleanup?.status === 'unconfirmed') throw new BridgeError('CLEANUP_UNCONFIRMED', 'Codex isolation process cleanup was not confirmed.');
  if (execution.reason || execution.exitCode !== 0) throw new BridgeError(execution.reason === 'cancelled' ? 'CANCELLED' : 'CODEX_ISOLATION_UNVERIFIED', 'Codex MCP isolation could not be verified.');
  let servers;
  try { servers = JSON.parse(await readFile(stdoutPath, 'utf8')); }
  catch { throw new BridgeError('CODEX_ISOLATION_UNVERIFIED', 'Codex MCP inventory was invalid.'); }
  if (!Array.isArray(servers) || servers.length > 128 || servers.some(server =>
    !/^[a-zA-Z0-9_-]{1,128}$/.test(server?.name ?? '') || !['stdio', 'streamable_http'].includes(server.transport?.type))) {
    throw new BridgeError('CODEX_ISOLATION_UNVERIFIED', 'Codex MCP inventory contains unsupported entries.');
  }
  return [...servers.flatMap(server => ['-c', `mcp_servers.${server.name}={${server.transport.type === 'stdio'
    ? 'command="disabled-by-agent-bridge"' : 'url="http://127.0.0.1:1"'},enabled=false}`]),
    ...['apps', 'plugins', 'remote_plugin', 'shell_tool', 'multi_agent', 'browser_use', 'computer_use']
      .flatMap(feature => ['-c', `features.${feature}=false`]), '-c', 'web_search="disabled"'];
}
