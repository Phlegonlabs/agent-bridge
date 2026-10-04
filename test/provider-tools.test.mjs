import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseAuthentication } from '../src/provider-tools.mjs';
const execute = promisify(execFile);

test('authentication parsing never treats a failed or unknown status as a login', () => {
  const result = { execution: { exitCode: 0 }, stdout: '{"loggedIn":true,"email":"private-fixture"}', stderr: '' };
  assert.equal(parseAuthentication('claude', result), true);
  assert.equal(parseAuthentication('claude', { ...result, stdout: '{"unknown":true}' }), false);
  assert.equal(parseAuthentication('codex', { ...result, stdout: '', stderr: 'Logged in using ChatGPT' }), true);
  assert.equal(parseAuthentication('codex', { ...result, stdout: 'Not logged in' }), false);
  assert.equal(parseAuthentication('claude', { ...result, execution: { exitCode: 1 } }), false);
});

test('Claude and Codex doctors inspect their own runtime and never report ZCode success', async () => {
  for (const provider of ['claude', 'codex']) {
    try {
      await execute(process.execPath, ['bin/bridge.mjs', 'doctor', '--provider', provider], {
        timeout: 8000, windowsHide: true, env: { ...process.env, [`${provider.toUpperCase()}_BRIDGE_BIN`]: '/missing-fixture/runtime' },
      });
      assert.fail('Missing provider must fail');
    } catch (error) {
      const report = JSON.parse(error.stdout);
      assert.equal(report.provider, provider); assert.equal(report.installed, false);
      assert.equal(report.code, `${provider.toUpperCase()}_NOT_INSTALLED`);
      assert.equal(report.agentCount, undefined);
    }
  }
});
