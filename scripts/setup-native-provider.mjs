import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Keep the old entry point, but use the same setup wizard as the public CLI.
const child = spawn(process.execPath, [fileURLToPath(new URL('../bin/bridge.mjs', import.meta.url)), 'setup', ...process.argv.slice(2)],
  { stdio: 'inherit', windowsHide: true });
child.once('error', () => { console.error('Could not start setup. Run node bin/bridge.mjs setup.'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
