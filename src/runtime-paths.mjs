import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { BridgeError } from './profiles.mjs';

const execute = promisify(execFile);
export function zcodeCandidates({ platform = process.platform, home = homedir(), env = process.env } = {}) {
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  if (platform === 'win32') return [
    join(env.ProgramFiles || 'C:\\Program Files', 'ZCode/resources/glm/zcode.cjs'),
    join(env.LOCALAPPDATA || join(home, 'AppData/Local'), 'Programs/ZCode/resources/glm/zcode.cjs'),
  ];
  if (platform === 'darwin') return [
    '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs',
    join(home, 'Applications/ZCode.app/Contents/Resources/glm/zcode.cjs'),
  ];
  return [
    ...(env.APPDIR ? [join(env.APPDIR, 'resources/glm/zcode.cjs')] : []),
    '/opt/ZCode/resources/glm/zcode.cjs', '/opt/zcode/resources/glm/zcode.cjs',
    '/usr/lib/zcode/resources/glm/zcode.cjs',
  ];
}

export async function findZcodeBundle(explicit, options = {}) {
  for (const candidate of explicit ? [explicit] : zcodeCandidates(options)) {
    try {
      const resolved = await realpath(candidate);
      if (path.extname(resolved) !== '.cjs' || !(await stat(resolved)).isFile()) {
        throw new BridgeError('INVALID_CLI', 'Select the official resources/glm/zcode.cjs bundle.');
      }
      return resolved;
    } catch (error) { if (explicit || !['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
  }
  throw new BridgeError('ZCODE_NOT_INSTALLED', 'ZCode bundle not found. Install ZCode, or set ZCODE_BRIDGE_CLI to resources/glm/zcode.cjs (extract AppImage first on Linux).');
}

export async function nativeExecutable(name, explicit) {
  let located = explicit;
  if (!located) {
    if (process.platform === 'win32' && name === 'agent') {
      const candidate = path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'cursor-agent', 'agent.exe');
      try { if ((await stat(candidate)).isFile()) located = candidate; } catch { /* Try PATH repair hint. */ }
    }
  }
  if (!located) {
    try {
      const lookup = await execute(process.platform === 'win32' ? 'where.exe' : 'which',
        [process.platform === 'win32' ? `${name}.exe` : name], { timeout: 8000, windowsHide: true });
      located = lookup.stdout.trim().split(/\r?\n/)[0];
    } catch { /* Try the official native installer directory below. */ }
  }
  if (!located) {
    const candidate = path.join(homedir(), '.local', 'bin', process.platform === 'win32' ? `${name}.exe` : name);
    try { if ((await stat(candidate)).isFile()) located = candidate; } catch { /* Report a useful install error. */ }
  }
  const code = name === 'agent' ? 'CURSOR' : name.toUpperCase();
  if (!located) throw new BridgeError(`${code}_NOT_INSTALLED`, `${name} CLI not found. Install the official native CLI or set ${code}_BRIDGE_BIN.`);
  if (['.cmd', '.bat', '.ps1'].includes(path.extname(located).toLowerCase())) {
    throw new BridgeError(`${code}_RUNTIME_INVALID`, `${name} resolved to a launcher shim. Select the native executable with ${code}_BRIDGE_BIN.`);
  }
  try { return await realpath(located); }
  catch { throw new BridgeError(`${code}_NOT_INSTALLED`, `The selected ${name} executable does not exist.`); }
}
