import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSetupConfig, saveSetupConfig, runSetup } from '../src/setup.mjs';
import { providerConfigPath, localProviderConfig } from '../src/provider-config-path.mjs';

const catalogs = {
  codex: { models: [{ id: 'gpt-test', label: 'Test', visible: true, internal: false, efforts: ['low', 'xhigh'], defaultEffort: 'low' }] },
  claude: { models: [{ id: 'claude-test', efforts: ['low', 'high'], defaultEffort: 'high' }] },
  cursor: { models: [{ id: 'composer-test', label: 'Composer Test' }] },
};
const options = { catalogs, selections: { codex: ['gpt-test'], claude: ['claude-test'] }, fallback: 'gpt-test' };
const native = () => ({ schemaVersion: 1, config: { providerOrder: ['other'],
  providerConfigRules: { providerRules: [{ providerId: 'other', config: { access: { apiKey: 'fixture-only' } } }] },
  modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] } } });

test('new setup uses selected providers, scoped writable Claude and an explicit supported fallback', () => {
  const config = buildSetupConfig(options);
  assert.deepEqual(Object.keys(config.routes), ['gpt-test', 'claude-test']);
  assert.equal(config.routes['claude-test'].execution.mode, 'workspace-write');
  assert.equal(config.routes['claude-test'].sessionContinuity, true);
  assert.deepEqual(config.fallback.routes['claude-test'], ['gpt-test']);
  assert.ok(!config.routes['cursor-composer-test']);
  assert.throws(() => buildSetupConfig({ ...options, fallback: undefined }), { code: 'FALLBACK_CHOICE_REQUIRED' });
  assert.throws(() => buildSetupConfig({ ...options, fallback: 'missing' }), { code: 'FALLBACK_MODEL_UNAVAILABLE' });
  assert.throws(() => buildSetupConfig({ ...options, fallbackEffort: 'ultra' }), { code: 'MODEL_EFFORT_UNSUPPORTED' });
  assert.throws(() => buildSetupConfig({ ...options, selections: { codex: ['missing'] } }), { code: 'MODEL_UNAVAILABLE' });
  assert.equal(buildSetupConfig({ ...options, selections: { cursor: ['composer-test'] }, fallback: 'off' }).fallback.enabled, false);
});

test('setup saves outside tracked config, is idempotent and backs up changed settings', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bridge-setup-'));
  await mkdir(path.join(root, 'config'));
  const legacy = path.join(root, 'config', 'native-provider.json'); await writeFile(legacy, 'legacy fixture');
  assert.equal(await providerConfigPath(undefined, root), legacy);
  const config = buildSetupConfig(options), first = await saveSetupConfig(config, { root });
  assert.equal(await providerConfigPath(undefined, root), first.configPath);
  assert.equal(await providerConfigPath(legacy, root), legacy);
  assert.equal((await saveSetupConfig(config, { root })).changed, false);
  const changed = await saveSetupConfig({ ...config, port: 32148 }, { root });
  assert.equal(JSON.parse(await readFile(changed.backup)).port, 32147);
  assert.equal(await readFile(legacy, 'utf8'), 'legacy fixture');
  assert.deepEqual(await readdir(path.dirname(first.configPath)), ['backups', 'native-provider.json']);
});

test('fresh setup registers both providers without personal agents, preserves unrelated settings, and repeats safely', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bridge-fresh-'));
  const nativeFile = path.join(root, 'zcode.json'); await writeFile(nativeFile, JSON.stringify(native()));
  const seen = [];
  const dependencies = { root, nativeFile, preview() {},
    doctor: async provider => { seen.push(provider); return { ok: true, installed: true, authenticated: true }; },
    models: async provider => catalogs[provider] };
  const settings = { interactive: false, providers: 'codex,claude', models: 'codex:gpt-test,claude:claude-test', fallback: 'gpt-test' };
  const first = await runSetup(settings, dependencies);
  assert.equal(first.registered, true);
  assert.deepEqual(seen, ['codex', 'claude']);
  const stored = JSON.parse(await readFile(nativeFile));
  assert.deepEqual(stored.config.providerConfigRules.providerRules[0], native().config.providerConfigRules.providerRules[0]);
  assert.equal(stored.config.providerConfigRules.providerRules.length, 3);
  const second = await runSetup(settings, dependencies);
  assert.equal(second.changed, false); assert.equal(second.registration.changed, false);
  assert.equal(await readFile(nativeFile, 'utf8'), JSON.stringify(stored, null, 2) + '\n');
});

test('setup accepts a linked workspace ancestor but rejects redirected local storage before writes', async () => {
  const container = await mkdtemp(path.join(tmpdir(), 'bridge-links-'));
  const actual = path.join(container, 'actual'); await mkdir(actual);
  const alias = path.join(container, 'alias');
  await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const root = path.join(alias, 'workspace'); await mkdir(root);
  assert.equal((await saveSetupConfig(buildSetupConfig(options), { root })).changed, true);
  const redirected = path.join(container, 'redirected'); await mkdir(redirected);
  const unsafeRoot = path.join(actual, 'unsafe'); await mkdir(unsafeRoot);
  await symlink(redirected, path.join(unsafeRoot, '.bridge'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(saveSetupConfig(buildSetupConfig(options), { root: unsafeRoot }), { code: 'UNSAFE_CONFIG' });
  assert.deepEqual(await readdir(redirected), []);
});

test('dry run and cancellation do not register or save settings; missing selected CLI fails before writes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bridge-preview-'));
  const dependencies = { root, preview() {}, doctor: async () => ({ ok: true, installed: true, authenticated: true }), models: async () => catalogs.codex };
  const settings = { providers: 'codex', models: 'codex:gpt-test', fallback: 'off' };
  assert.equal((await runSetup({ ...settings, interactive: false, dryRun: true }, dependencies)).dryRun, true);
  assert.equal((await runSetup({ ...settings, interactive: true }, { ...dependencies, ask: async () => 'no' })).code, 'SETUP_CANCELLED');
  await assert.rejects(readFile(localProviderConfig(root)), { code: 'ENOENT' });
  await assert.rejects(runSetup({ ...settings, interactive: false }, { ...dependencies, doctor: async () => ({ installed: false, code: 'CODEX_NOT_INSTALLED' }) }), { code: 'CODEX_NOT_INSTALLED' });
});
