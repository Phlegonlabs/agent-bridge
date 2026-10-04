import test from 'node:test';
import assert from 'node:assert/strict';
import { zcodeCandidates, findZcodeBundle, nativeExecutable } from '../src/runtime-paths.mjs';

test('ZCode searches system and per-user Windows/macOS installs and extracted Linux AppImages', () => {
  const win = zcodeCandidates({ platform: 'win32', home: 'C:\\Users\\test', env: {} });
  assert.ok(win.some(p => p.includes('Program Files')));
  assert.ok(win.some(p => p.includes('AppData\\Local')));
  assert.ok(zcodeCandidates({ platform: 'darwin', home: '/Users/test', env: {} }).includes('/Users/test/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs'));
  assert.equal(zcodeCandidates({ platform: 'linux', env: { APPDIR: '/tmp/extracted' } })[0], '/tmp/extracted/resources/glm/zcode.cjs');
});
test('explicit missing paths and Windows launcher shims never silently use another runtime', async () => {
  await assert.rejects(findZcodeBundle('/missing-review-runtime/zcode.cjs'), { code: 'ENOENT' });
  await assert.rejects(nativeExecutable('claude', 'C:\\fake\\claude.cmd'), { code: 'CLAUDE_RUNTIME_INVALID' });
  await assert.rejects(nativeExecutable('codex', '/missing-review-runtime/codex'), { code: 'CODEX_NOT_INSTALLED' });
});
