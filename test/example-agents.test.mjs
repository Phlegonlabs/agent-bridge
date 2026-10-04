import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { parseProfile, requireReadOnlyProfile } from '../src/profiles.mjs';
const execute = promisify(execFile);
test('example agent installation is independent of personal profiles and refuses overwrites', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bridge-agents-'));
  const argumentsList = ['scripts/install-example-agents.mjs', '--directory', directory];
  await execute(process.execPath, argumentsList, { timeout: 5000, windowsHide: true });
  const before = await readFile(path.join(directory, 'bridge-explorer.md'), 'utf8');
  requireReadOnlyProfile(parseProfile(before));
  requireReadOnlyProfile(parseProfile(await readFile(path.join(directory, 'bridge-reviewer.md'), 'utf8')));
  await assert.rejects(execute(process.execPath, argumentsList, { timeout: 5000, windowsHide: true }));
  assert.equal(await readFile(path.join(directory, 'bridge-explorer.md'), 'utf8'), before);
});
