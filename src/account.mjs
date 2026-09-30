import { mkdir, readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { BridgeError } from './profiles.mjs';
import { runProcess } from './process.mjs';

export const bridgeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Never import or update the desktop account store. The official CLI owns login.
export async function accountEnvironment(runtime, root = bridgeRoot) {
  const base = path.join(root, '.bridge');
  await mkdir(base, { recursive: true, mode: 0o700 });
  if ((await lstat(base)).isSymbolicLink()) throw new BridgeError('UNSAFE_STATE_PATH', 'Bridge state must not be a symbolic link.');
  const accountRoot = path.join(base, 'account');
  const privateDir = path.join(accountRoot, '.zcode', 'v2');
  for (const dir of [accountRoot, path.join(accountRoot, '.zcode'), privateDir]) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if ((await lstat(dir)).isSymbolicLink()) throw new BridgeError('UNSAFE_STATE_PATH', 'Account state must not be a symbolic link.');
  }
  const configPath = path.join(privateDir, 'provider_config.json');
  const empty = { schemaVersion: 1, config: { providerConfigRules: { providerRules: [] },
    modelConfigRules: { providerModelRules: [], manualProviderModelRules: [] } } };
  try { await writeFile(configPath, JSON.stringify(empty), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if ((await lstat(configPath)).isSymbolicLink()) throw new BridgeError('UNSAFE_STATE_PATH', 'Account config must not be a symbolic link.');
  return { ...process.env, ZCODE_DATA_BASE_DIR: await realpath(accountRoot),
    ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: runtime.providerConfig,
    ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: configPath };
}

export async function loginAccount(runtime, { signal, onAuthorizeUrl = () => {}, root = bridgeRoot } = {}) {
  const env = await accountEnvironment(runtime, root);
  const dir = path.join(root, '.bridge', 'login', randomUUID());
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const stdoutPath = path.join(dir, 'stdout.json'), stderrPath = path.join(dir, 'stderr.log');
  const execution = await runProcess({ command: runtime.command,
    args: [...runtime.prefix, 'login', 'zai', '--json'], cwd: root, env, signal,
    timeoutMs: 310000, maxBytes: 131072, stdoutPath, stderrPath,
    onStderrLine(line) {
      try {
        const url = new URL(line.trim());
        if (url.protocol === 'https:' && (url.hostname === 'z.ai' || url.hostname.endsWith('.z.ai'))) onAuthorizeUrl(url.href);
      } catch { /* Other CLI notices stay in the private log. */ }
    } });
  let response;
  try { response = JSON.parse(await readFile(stdoutPath, 'utf8')); } catch { /* Failure details stay private. */ }
  const ok = !execution.reason && execution.exitCode === 0 && response?.status === 'ready' && response?.provider === 'zai';
  return { ok, code: ok ? 'LOGIN_READY' : 'LOGIN_FAILED', model: ok ? response.model : undefined,
    accountScope: 'bridge-only', execution, logs: dir };
}
