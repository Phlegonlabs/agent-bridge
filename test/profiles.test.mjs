import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProfile, requireReadOnlyProfile } from '../src/profiles.mjs';

const profile = (extra = '') => `---\nname: explorer\ndescription: Read files\nmodel: account:test/model-a\npermissionMode: plan\ntools: [Read, Glob, Grep]\n${extra}---\nInspect the source.`;
test('preserves native profile fields without copying the prompt into public metadata', () => {
  const parsed = parseProfile(profile('thoughtLevel: high\n'));
  assert.equal(parsed.model, 'account:test/model-a');
  assert.equal(parsed.thoughtLevel, 'high');
  assert.deepEqual(parsed.tools, ['Read', 'Glob', 'Grep']);
  requireReadOnlyProfile(parsed);
});
test('rejects duplicate keys, aliases, and silently ignored model controls', () => {
  for (const extra of ['model: other/model\n', 'reasoningEffort: high\n', 'skills: &s [Read]\nmcpServers: *s\n']) {
    assert.throws(() => parseProfile(profile(extra)));
  }
});
test('read-only gate rejects bypass permissions and wildcard tools', () => {
  for (const text of [profile().replace('plan', 'bypassPermissions'), profile().replace('[Read, Glob, Grep]', '["*"]'), profile('memory: user\n')]) {
    assert.throws(() => requireReadOnlyProfile(parseProfile(text)), { code: 'PROFILE_NOT_READ_ONLY' });
  }
});
test('rejects unsafe identity, ambiguous model, and background profiles', () => {
  for (const text of [profile().replace('name: explorer', 'name: ../../other'), profile().replace('account:test/model-a', 'model-a'), profile('background: true\n')]) assert.throws(() => parseProfile(text));
});
