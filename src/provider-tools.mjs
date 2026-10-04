import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bridgeRoot, loginAccount } from './account.mjs';
import { installedRuntime, runAgent } from './bridge.mjs';
import { listProfiles, publicProfile, BridgeError } from './profiles.mjs';
import { cursorRuntime, cursorDoctor, cursorModels, cursorLogin, runCursor } from './cursor.mjs';
import { claudeRuntime, runClaude } from './claude.mjs';
import { codexRuntime, runCodex } from './codex.mjs';
import { codexModelCatalog } from './model-options.mjs';
import { runProcess } from './process.mjs';

export const providers = ['zcode', 'cursor', 'claude', 'codex'];
export const claudeCandidates = ['claude-opus-5-5', 'claude-sonnet-5-5'];
export async function providerRuntime(provider, options = {}) {
  if (provider === 'zcode') return installedRuntime(options.cli);
  if (provider === 'cursor') return cursorRuntime(options.cursorDir);
  if (provider === 'claude') return claudeRuntime();
  if (provider === 'codex') return codexRuntime();
  throw new BridgeError('INVALID_PROVIDER', 'Choose zcode, cursor, claude or codex.');
}

export async function runtimeCommand(runtime, args, { signal, timeoutMs = 15000, onLine, root = bridgeRoot } = {}) {
  const logs = path.join(root, '.bridge', 'commands', randomUUID());
  await mkdir(logs, { recursive: true, mode: 0o700 });
  const execution = await runProcess({ command: runtime.command, args: [...runtime.prefix, ...args],
    cwd: root, env: runtime.env, signal, timeoutMs, maxBytes: 256 * 1024,
    stdoutPath: path.join(logs, 'stdout.log'), stderrPath: path.join(logs, 'stderr.log'), onLine, onStderrLine: onLine });
  return { execution, logs, stdout: await readFile(path.join(logs, 'stdout.log'), 'utf8'), stderr: await readFile(path.join(logs, 'stderr.log'), 'utf8') };
}

export function parseAuthentication(provider, result) {
  if (result.execution.reason || result.execution.exitCode !== 0) return false;
  if (provider === 'claude') {
    try { const value = JSON.parse(result.stdout); return value.loggedIn === true || value.isAuthenticated === true; }
    catch { return false; }
  }
  return /logged in/i.test(result.stdout + result.stderr) && !/not logged in/i.test(result.stdout + result.stderr);
}

export async function providerModels(provider, options = {}) {
  await providerRuntime(provider, options);
  if (provider === 'cursor') return { ...await cursorModels(await cursorRuntime(options.cursorDir), options), source: 'native-catalog', requestVerified: false };
  if (provider === 'codex') {
    const catalog = await codexModelCatalog();
    return { provider, ...catalog, models: catalog.models.filter(m => m.visible && !m.internal), requestVerified: false };
  }
  if (provider === 'claude') return { provider, source: 'adapter-candidates', accountCatalogAvailable: false,
    models: claudeCandidates.map(id => ({ id, efforts: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'high' })),
    requestVerified: false, note: 'These are candidate exact IDs, not an account entitlement list. Supply another full model ID if needed, then verify it with doctor --live.' };
  let profiles;
  try { profiles = (await listProfiles()).map(publicProfile); }
  catch (error) { if (error.code !== 'ENOENT') throw error; profiles = []; }
  return { provider, source: 'user-profiles', models: profiles, requestVerified: false };
}

export async function providerDoctor(provider, options = {}) {
  if (provider === 'all') {
    const reports = [];
    for (const name of providers) reports.push(await providerDoctor(name, options));
    return { ok: reports.every(r => r.ok), providers: reports };
  }
  const report = { ok: false, provider, installed: false, authenticated: 'unknown', modelSelectable: false, requestVerified: false };
  try {
    const runtime = await providerRuntime(provider, options);
    report.installed = true; report.cli = runtime.prefix[0] ?? runtime.command;
    if (provider === 'cursor') {
      const auth = await cursorDoctor(runtime, options);
      report.authenticated = auth.authenticated; report.logs = auth.logs;
    } else if (provider !== 'zcode') {
      const result = await runtimeCommand(runtime, provider === 'claude' ? ['auth', 'status', '--json'] : ['login', 'status'], options);
      report.authenticated = parseAuthentication(provider, result); report.logs = result.logs;
    }
    try {
      const catalog = await providerModels(provider, options);
      report.modelSelectable = catalog.models.length > 0; report.modelCount = catalog.models.length;
      report.modelSource = catalog.source;
      if (provider === 'claude') report.modelSelectable = 'unverified-candidates';
    } catch (error) { report.catalogCode = error.code ?? 'CATALOG_UNAVAILABLE'; }
    report.ok = report.installed && report.authenticated !== false && report.modelSelectable !== false;
    report.code = report.ok ? 'PREFLIGHT_READY' : report.authenticated === false ? 'AUTH_REQUIRED' : 'MODEL_CATALOG_REQUIRED';
    if (options.live) {
      if (provider === 'zcode' ? !options.agent : !options.model) throw new BridgeError('INVALID_ARGUMENT', 'Live checks require --agent for ZCode or an explicit --model for other providers.');
      const task = 'Return exactly BRIDGE_PROBE_OK. Do not use tools, read files, or change anything.';
      const base = { cwd: options.cwd ?? bridgeRoot, task, timeoutMs: options.timeoutMs ?? 120000, signal: options.signal };
      const result = provider === 'zcode' ? await runAgent({ ...base, agent: options.agent, cliPath: options.cli, expectedModel: options.expectedModel })
        : provider === 'cursor' ? await runCursor({ ...base, model: options.model, cursorDir: options.cursorDir, trustWorkspace: options.trustWorkspace })
        : provider === 'claude' ? await runClaude({ ...base, model: options.model, execution: 'read-only' })
        : await runCodex({ ...base, model: options.model });
      report.requestVerified = result.ok === true && (result.response ?? result.finalResponse)?.trim() === 'BRIDGE_PROBE_OK';
      report.ok = report.requestVerified; report.code = report.ok ? 'REQUEST_VERIFIED' : result.code ?? 'PROBE_FAILED';
      report.actualModel = result.actualModel; report.actualEffort = result.actualEffort; report.logs = result.logs;
    }
  } catch (error) { report.ok = false; report.code = error.code ?? 'PREFLIGHT_FAILED'; report.message = error instanceof BridgeError ? error.message : 'Inspect the private command log and official installation path.'; }
  return report;
}

export async function providerLogin(provider, options = {}) {
  const runtime = await providerRuntime(provider, options);
  if (provider === 'zcode') return loginAccount(runtime, options);
  if (provider === 'cursor') return cursorLogin(runtime, options);
  const allowed = provider === 'claude' ? ['claude.ai', 'claude.com', 'anthropic.com'] : ['openai.com', 'chatgpt.com'];
  const result = await runtimeCommand(runtime, provider === 'claude' ? ['auth', 'login'] : ['login'], {
    ...options, timeoutMs: 310000, onLine(line) {
      for (const raw of line.match(/https:\/\/[^\s\x1b]+/g) ?? []) {
        try { const url = new URL(raw); if (allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) options.onAuthorizeUrl?.(url.href); }
        catch { /* Other output stays private. */ }
      }
    },
  });
  if (result.execution.reason || result.execution.exitCode !== 0) return { ok: false, provider, code: 'LOGIN_FAILED', logs: result.logs };
  return providerDoctor(provider, options);
}
