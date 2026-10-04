import { mkdir, readFile, writeFile, rename, lstat } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bridgeRoot } from './account.mjs';
import { BridgeError, hash } from './profiles.mjs';
import { providerDoctor, providerModels, providerLogin, providers } from './provider-tools.mjs';
import { codexRoutes, cursorRoutes, resolveModelSelection } from './model-options.mjs';
import { validateProviderConfig, localToken } from './provider-server.mjs';
import { localProviderConfig } from './provider-config-path.mjs';
import { updateProviders, reconcileProviders } from './provider-registration.mjs';

export const writableTools = ['Read', 'Glob', 'Grep', 'Edit(./**)', 'Write(./**)',
  ...['npm', 'npx', 'pnpm', 'yarn', 'node', 'python', 'py', 'uv', 'dotnet', 'cargo', 'go'].map(name => `Bash(${name} *)`),
  ...['status', 'diff', 'log', 'add', 'commit'].map(name => `Bash(git ${name}*)`)];

export function buildSetupConfig({ catalogs, selections, port = 32147, writeMode = 'workspace-write', fallback, fallbackEffort = 'xhigh' }) {
  if (!['workspace-write', 'read-only'].includes(writeMode)) throw new BridgeError('INVALID_EXECUTION', 'Choose workspace-write or read-only.');
  if (!fallback) throw new BridgeError('FALLBACK_CHOICE_REQUIRED', 'Choose off or an explicit Codex fallback model.');
  const routes = {};
  for (const [provider, ids] of Object.entries(selections)) {
    if (!['codex', 'cursor', 'claude'].includes(provider) || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) {
      throw new BridgeError('INVALID_MODEL_SELECTION', 'Select unique explicit models for each bridge provider.');
    }
    const catalog = catalogs[provider]?.models ?? [];
    const selected = ids.map(id => {
      const found = catalog.find(model => model.id === id);
      if (found) return found;
      if (provider === 'claude' && /^claude-[a-z0-9.-]+$/.test(id)) return { id, efforts: [], defaultEffort: null };
      throw new BridgeError('MODEL_UNAVAILABLE', `${provider} model ${id} is absent from the local catalog.`);
    });
    const generated = provider === 'codex' ? codexRoutes({ models: selected })
      : provider === 'cursor' ? cursorRoutes(selected)
      : Object.fromEntries(selected.map(model => [model.id, {
        provider: 'claude', model: model.id, description: `${model.id} as a Claude Code task delegate.`,
        mode: 'delegate', sessionContinuity: true,
        ...(model.efforts?.length ? { reasoning: { values: model.efforts, default: model.defaultEffort ?? model.efforts[0] } } : {}),
        execution: writeMode === 'read-only' ? { mode: 'read-only', tools: ['Read', 'Glob', 'Grep'] }
          : { mode: writeMode, writeScope: './**', tools: writableTools },
      }]));
    for (const [id, route] of Object.entries(generated)) {
      if (routes[id]) throw new BridgeError('INVALID_MODEL_SELECTION', 'Duplicate route ID across providers.');
      routes[id] = route;
    }
  }
  if (!Object.keys(routes).length) throw new BridgeError('INVALID_MODEL_SELECTION', 'Select at least one bridge model, or use ZCode native GLM setup only.');
  const fallbackRoutes = {};
  if (fallback !== 'off') {
    if (routes[fallback]?.provider !== 'codex') throw new BridgeError('FALLBACK_MODEL_UNAVAILABLE', 'Select a configured Codex route for fallback.');
    resolveModelSelection(routes[fallback], fallbackEffort);
    for (const [id, route] of Object.entries(routes)) if (route.provider === 'claude') fallbackRoutes[id] = [fallback];
    if (!Object.keys(fallbackRoutes).length) throw new BridgeError('INVALID_FALLBACK', 'Claude fallback requires a selected Claude model.');
  }
  return validateProviderConfig({ version: 1, port: Number(port), globalLimit: 14,
    limits: { zcode: 2, cursor: 12, claude: 4, codex: 4 }, attemptTimeoutMs: 420000, requestTimeoutMs: 900000,
    fallback: { enabled: fallback !== 'off', on: ['TIMEOUT', 'RATE_LIMITED'], reasoningEffort: fallbackEffort, routes: fallbackRoutes }, routes });
}

export async function saveSetupConfig(config, { root = bridgeRoot, file = localProviderConfig(root) } = {}) {
  validateProviderConfig(config);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  // Refuse symlinks in the destination's existing parent chain.
  for (let directory = path.dirname(path.resolve(file));;) {
    if ((await lstat(directory)).isSymbolicLink()) throw new BridgeError('UNSAFE_CONFIG', 'Setup configuration cannot be stored through symlinks.');
    const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
  }
  let previous;
  try {
    if ((await lstat(file)).isSymbolicLink()) throw new BridgeError('UNSAFE_CONFIG', 'Setup configuration must be a regular file.');
    previous = await readFile(file, 'utf8');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const serialized = JSON.stringify(config, null, 2) + '\n';
  if (previous === serialized) return { changed: false, configPath: file };
  let backup;
  if (previous !== undefined) {
    const directory = path.join(root, '.bridge', 'config', 'backups');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    backup = path.join(directory, `${randomUUID()}.json`);
    await writeFile(backup, previous, { flag: 'wx', mode: 0o600 });
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  if (previous === undefined) {
    // Exclusive creation preserves a configuration created by another setup.
    await writeFile(file, serialized, { flag: 'wx', mode: 0o600 });
  } else {
    if (hash(await readFile(file, 'utf8')) !== hash(previous)) throw new BridgeError('CONFIG_CHANGED', 'Setup configuration changed while saving.');
    await writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
    if (hash(await readFile(file, 'utf8')) !== hash(previous)) throw new BridgeError('CONFIG_CHANGED', 'Setup configuration changed while saving.');
    await rename(temporary, file);
  }
  return { changed: true, configPath: file, backup };
}

export async function runSetup(options = {}, dependencies = {}) {
  const root = dependencies.root ?? bridgeRoot;
  const doctor = dependencies.doctor ?? providerDoctor, models = dependencies.models ?? providerModels;
  const login = dependencies.login ?? providerLogin;
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY);
  const terminal = interactive && !dependencies.ask ? createInterface({ input: process.stdin, output: process.stderr }) : null;
  const ask = dependencies.ask ?? (question => terminal.question(question));
  const preview = dependencies.preview ?? (value => process.stderr.write(JSON.stringify(value, null, 2) + '\n'));
  try {
    const names = (options.providers ?? (interactive ? await ask('Providers (codex,claude,cursor,zcode; comma separated): ') : '')).split(',').map(s => s.trim()).filter(Boolean);
    if (!names.length || new Set(names).size !== names.length || names.some(name => !providers.includes(name))) throw new BridgeError('INVALID_PROVIDER', 'Select one or more of codex,claude,cursor,zcode with --providers.');
    const catalogs = {}, reports = [], selections = {};
    for (const provider of names) {
      let report = await doctor(provider, options);
      preview(report);
      if (!report.installed) throw new BridgeError(report.code, `${provider} is not installed. See the README platform installation steps.`);
      if (report.authenticated === false || provider === 'zcode') {
        if (interactive && /^y(es)?$/i.test(await ask(`Sign in to ${provider} using its official CLI now? [y/N]: `))) report = await login(provider, options);
        if (report.authenticated === false || provider !== 'zcode' && report.ok === false) throw new BridgeError('AUTH_REQUIRED', `Run login --provider ${provider}, then repeat setup.`);
      }
      reports.push(report);
      catalogs[provider] = await models(provider, options);
      if (provider === 'zcode') continue;
      preview({ provider, catalog: catalogs[provider] });
      let ids = options.models?.split(',').filter(s => s.startsWith(`${provider}:`)).map(s => s.slice(provider.length + 1));
      if (!ids?.length && interactive) ids = (await ask(`${provider} exact model IDs (comma separated): `)).split(',').map(s => s.trim()).filter(Boolean);
      if (!ids?.length) throw new BridgeError('INVALID_MODEL_SELECTION', `Use --models ${provider}:MODEL_ID (comma separated for multiple models).`);
      selections[provider] = ids;
    }
    if (!Object.keys(selections).length) return { ok: true, provider: 'zcode', registered: false, reports,
      next: 'Use ZCode native GLM connection, then install a plan-mode agent profile and run the GLM workflow. See README.' };
    if (options.models?.split(',').some(row => !names.includes(row.split(':')[0]))) throw new BridgeError('INVALID_MODEL_SELECTION', 'A model selection refers to an unselected provider.');
    const fallback = options.fallback ?? (interactive ? await ask('Claude fallback: enter off, or a selected Codex model ID: ') : undefined);
    const writeMode = options.writeMode ?? 'workspace-write';
    const config = buildSetupConfig({ catalogs, selections, fallback, fallbackEffort: options.fallbackEffort, port: options.port, writeMode });
    preview({ configuration: config, destination: options.config ?? localProviderConfig(root),
      note: 'Claude workspace-write allows edits in the active workspace and the shell patterns listed above. This is a CLI policy, not an OS sandbox. Existing sessions are not migrated.' });
    if (options.dryRun) return { ok: true, dryRun: true, config, reports, registered: false };
    if (interactive && !/^y(es)?$/i.test(await ask('Save this configuration and register it in ZCode? [y/N]: '))) return { ok: false, code: 'SETUP_CANCELLED', registered: false };
    const nativeFile = dependencies.nativeFile ?? path.join(homedir(), '.zcode', 'v2', 'provider_config.json');
    try { await lstat(nativeFile); } catch { throw new BridgeError('ZCODE_CONFIG_REQUIRED', 'Open ZCode and complete first launch before registering providers.'); }
    if ((await lstat(nativeFile)).isSymbolicLink()) throw new BridgeError('UNSAFE_CONFIG', 'ZCode provider configuration must be a regular file.');
    reconcileProviders(JSON.parse(await readFile(nativeFile, 'utf8')), config, 'preflight-only');
    const saved = await saveSetupConfig(config, { root, file: options.config ?? localProviderConfig(root) });
    const state = path.join(root, '.bridge', 'provider');
    const registration = await updateProviders(config, await localToken(state), nativeFile, state);
    return { ok: true, ...saved, registered: true, registration, reports,
      next: 'Run node bin/provider.mjs (with --config if you used a custom file), then select Agent Bridge or Claude Bridge in ZCode and verify a first request.' };
  } finally { terminal?.close(); }
}
