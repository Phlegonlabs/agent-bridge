import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
async function cli(args) {
  try {
    const result = await execute(process.execPath, ['bin/bridge.mjs', ...args], { timeout: 5000, windowsHide: true, maxBuffer: 65536 });
    return { exitCode: 0, value: JSON.parse(result.stdout) };
  } catch (error) {
    return { exitCode: error.code, value: JSON.parse(error.stdout) };
  }
}
test('preset CLI exposes allowed models and owner-selected defaults', async () => {
  const result = await cli(['presets']);
  assert.equal(result.exitCode, 0);
  assert.equal(result.value.presets[result.value.defaultPreset].parallelLimit, 14);
  assert.equal(result.value.presets[result.value.defaultPreset].fallback.enabled, false);
  assert.equal(result.value.presets[result.value.defaultPreset].routes['cursor-composer'].model, 'composer-2.5');
});
test('workflow CLI rejects invalid routing and conflicting inputs before invoking providers', async () => {
  for (const args of [
    ['workflow', '--cwd', '.', '--jobs-json', '[{"id":"probe","worker":"outside","task":"do not run"}]'],
    ['workflow', '--cwd', '.', '--task', 'do not run', '--parallel-limit', '15'],
    ['workflow', '--cwd', '.', '--task', 'do not run', '--fallback', 'auto'],
    ['workflow', '--cwd', '.', '--task', 'do not run', '--jobs-json', '[]'],
    ['workflow', '--cwd', '.', '--jobs-json', '{'],
    ['workflow', '--cwd', '.', '--jobs-json', '[]', '--workers', 'cursor'],
    ['run', '--preset', 'cursor'],
    ['presets', '--fallback', 'off'],
  ]) {
    const result = await cli(args);
    assert.equal(result.exitCode, 1, args.join(' '));
    assert.equal(result.value.ok, false);
    assert.match(result.value.code, /^INVALID_/);
  }
});
