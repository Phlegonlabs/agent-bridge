import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, lstat, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { BridgeError, hash } from './profiles.mjs';
import { providerState } from './provider-server.mjs';
export const nativeProviderId = 'workflow-bridge';
export function appendProvider(existing, config, token) {
  if (existing.schemaVersion !== 1 || !Array.isArray(existing.config?.providerConfigRules?.providerRules) ||
      !Array.isArray(existing.config?.modelConfigRules?.providerModelRules)) throw new BridgeError('UNKNOWN_CONFIG_SCHEMA', 'Unexpected native provider configuration schema.');
  const output = structuredClone(existing);
  const rules = output.config.providerConfigRules.providerRules;
  const present = rules.find(rule => rule.providerId === nativeProviderId);
  if (present) throw new BridgeError('PROVIDER_ALREADY_EXISTS', 'Provider already exists; preserve it and review changes explicitly.');
  const models = Object.keys(config.routes);
  rules.push({ providerId: nativeProviderId, providerName: 'Cursor Bridge', enabled: true,
    config: { group: 'standard-personal', access: { type: 'api-key', apiKey: token },
      api: { type: 'openai-chat-completions', baseUrl: `http://127.0.0.1:${config.port}/v1` },
      personalModelIds: models, modelOrder: models, visibility: 'visible' } });
  for (const modelId of models) output.config.modelConfigRules.providerModelRules.push({ providerId: nativeProviderId, modelId,
    config: { enabled: true, properties: { contextWindow: 131072, requiresMfjsToolSchema: false,
      inputFormat: { supportsText: true, supportsImage: false, supportsVideo: false, supportsAudio: false, supportsPdf: false },
      outputFormat: { supportsText: true }, supportsToolCall: true, supportsJsonSchemaOutput: false,
      supportsNativeWebSearch: false, supportsMidConversationSystem: true },
    optionSpecs: { reasoningLevel: { values: ['default'], map: '{}' }, maxOutputTokens: { max: 8192 } } } });
  if (Array.isArray(output.config.providerOrder)) output.config.providerOrder.push(nativeProviderId);
  return output;
}
export async function registerProvider(config, token, file = path.join(homedir(), '.zcode', 'v2', 'provider_config.json')) {
  if ((await lstat(file)).isSymbolicLink()) throw new BridgeError('UNSAFE_CONFIG', 'Provider configuration must be a regular file.');
  const original = await readFile(file, 'utf8'), prior = JSON.parse(original);
  const updated = appendProvider(prior, config, token);
  const backupDirectory = path.join(providerState, 'backups', randomUUID()); await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(backupDirectory, 'provider_config.json'), original, { flag: 'wx', mode: 0o600 });
  const temporary = file + `.workflow-bridge-${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(updated, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (hash(await readFile(file, 'utf8')) !== hash(original)) throw new BridgeError('CONFIG_CHANGED', 'Native config changed during registration; original remains untouched.');
  await rename(temporary, file);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(saved, updated);
  const without = structuredClone(saved);
  without.config.providerConfigRules.providerRules = without.config.providerConfigRules.providerRules.filter(rule => rule.providerId !== nativeProviderId);
  without.config.modelConfigRules.providerModelRules = without.config.modelConfigRules.providerModelRules.filter(rule => rule.providerId !== nativeProviderId);
  if (Array.isArray(without.config.providerOrder)) without.config.providerOrder = without.config.providerOrder.filter(id => id !== nativeProviderId);
  assert.deepEqual(without, prior);
  const receipt = { ok: true, providerId: nativeProviderId, models: Object.keys(config.routes).length,
    configPath: file, previousSha256: hash(original), registeredSha256: hash(JSON.stringify(saved)), backupDirectory };
  await writeFile(path.join(backupDirectory, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
  return receipt;
}

// Reconcile only our two providers; preserve every unrelated account and model.
export function reconcileProviders(existing, config, token) {
  if (existing.schemaVersion !== 1 || !Array.isArray(existing.config?.providerConfigRules?.providerRules) ||
      !Array.isArray(existing.config?.modelConfigRules?.providerModelRules)) {
    throw new BridgeError('UNKNOWN_CONFIG_SCHEMA', 'Unexpected native provider configuration schema.');
  }
  const output = structuredClone(existing);
  const owned = new Set(['workflow-bridge', 'claude-bridge']);
  const groups = [
    { id: 'workflow-bridge', name: 'Agent Bridge', entries: Object.entries(config.routes).filter(([, r]) => r.provider !== 'claude') },
    { id: 'claude-bridge', name: 'Claude Bridge', entries: Object.entries(config.routes).filter(([, r]) => r.provider === 'claude') },
  ];
  const rules = output.config.providerConfigRules.providerRules;
  for (const group of groups) {
    const models = group.entries.map(([id]) => id);
    const prior = rules.find(rule => rule.providerId === group.id);
    const next = { ...prior, providerId: group.id, providerName: group.name, enabled: true,
      config: { ...prior?.config, group: 'standard-personal', access: { type: 'api-key', apiKey: token },
        api: { type: 'openai-chat-completions', baseUrl: `http://127.0.0.1:${config.port}/v1` },
        personalModelIds: models, modelOrder: models, visibility: 'visible' } };
    if (prior) rules[rules.indexOf(prior)] = next;
    else rules.push(next);
    output.config.providerOrder ??= [];
    if (!output.config.providerOrder.includes(group.id)) output.config.providerOrder.push(group.id);
  }
  const modelRules = output.config.modelConfigRules.providerModelRules;
  const unrelated = modelRules.filter(rule => !owned.has(rule.providerId));
  const generated = groups.flatMap(group => group.entries.map(([modelId, route]) => ({
    providerId: group.id, modelId, config: { enabled: true,
      properties: { contextWindow: route.contextWindow ?? 131072, requiresMfjsToolSchema: false,
        inputFormat: { supportsText: true, supportsImage: false, supportsVideo: false, supportsAudio: false, supportsPdf: false },
        outputFormat: { supportsText: true }, supportsToolCall: route.mode !== 'delegate', supportsJsonSchemaOutput: false,
        supportsNativeWebSearch: false, supportsMidConversationSystem: true },
      optionSpecs: { reasoningLevel: { values: route.reasoning?.values ?? (Object.keys(route.reasoning?.variants ?? {}).length ? Object.keys(route.reasoning.variants) : ['default']),
        map: '{"reasoning_effort": reasoningLevel}' }, maxOutputTokens: { max: 8192, map: '{}' } } }
  })));
  output.config.modelConfigRules.providerModelRules = [...unrelated, ...generated];
  return output;
}
export async function updateProviders(config, token, file = path.join(homedir(), '.zcode', 'v2', 'provider_config.json')) {
  if ((await lstat(file)).isSymbolicLink()) throw new BridgeError('UNSAFE_CONFIG', 'Provider configuration must be a regular file.');
  const original = await readFile(file, 'utf8'), prior = JSON.parse(original);
  const updated = reconcileProviders(prior, config, token);
  if (JSON.stringify(updated) === JSON.stringify(prior)) return { ok: true, changed: false };
  const backupDirectory = path.join(providerState, 'backups', randomUUID());
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(backupDirectory, 'provider_config.json'), original, { flag: 'wx', mode: 0o600 });
  const temporary = file + `.agent-bridge-${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(updated, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (hash(await readFile(file, 'utf8')) !== hash(original)) throw new BridgeError('CONFIG_CHANGED', 'Native config changed during registration.');
  await rename(temporary, file);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), updated);
  const owned = new Set(['workflow-bridge', 'claude-bridge']);
  for (const key of ['providerConfigRules', 'modelConfigRules']) {
    const listKey = key === 'providerConfigRules' ? 'providerRules' : 'providerModelRules';
    assert.deepEqual(updated.config[key][listKey].filter(r => !owned.has(r.providerId)), prior.config[key][listKey].filter(r => !owned.has(r.providerId)));
  }
  const receipt = { ok: true, changed: true, models: Object.keys(config.routes).length, configPath: file,
    previousSha256: hash(original), registeredSha256: hash(JSON.stringify(updated)), backupDirectory };
  await writeFile(path.join(backupDirectory, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
  return receipt;
}
