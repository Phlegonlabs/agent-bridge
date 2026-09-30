import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { accountEnvironment, loginAccount } from '../src/account.mjs';

async function fixture() {
  const root = path.resolve('.bridge', 'tests', randomUUID());
  await mkdir(root, { recursive: true });
  return root;
}

test('account storage and defaults stay inside the bridge and preserve existing bytes', async () => {
  const root = await fixture();
  const env = await accountEnvironment({ providerConfig: 'builtin.json' }, root);
  assert.equal(env.ZCODE_DATA_BASE_DIR, path.join(root, '.bridge', 'account'));
  const filename = env.ZCODE_PERSONAL_PROVIDER_CONFIG_FILE;
  const initial = JSON.parse(await readFile(filename, 'utf8'));
  assert.deepEqual(initial.config.providerConfigRules.providerRules, []);
  assert.deepEqual(initial.config.modelConfigRules.providerModelRules, []);
  const marker = '{"testExistingAccount":"preserve"}';
  await writeFile(filename, marker);
  await accountEnvironment({ providerConfig: 'builtin.json' }, root);
  assert.equal(await readFile(filename, 'utf8'), marker);
});

test('login reports readiness without exposing user fields or tokens', async () => {
  const root = await fixture();
  const fixtureFile = path.join(root, 'login.cjs');
  await writeFile(fixtureFile, `console.error('https://chat.z.ai/authorize?state=test'); console.log(JSON.stringify({status:'ready',provider:'zai',model:'account:zai-individual-coding-plan/GLM-5.3',user:{email:'PRIVATE'},token:'SECRET'}))`);
  const urls = [];
  const result = await loginAccount({ command: process.execPath, prefix: [fixtureFile], providerConfig: 'builtin.json' }, { root, onAuthorizeUrl: x => urls.push(x) });
  assert.equal(result.ok, true); assert.equal(urls.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|SECRET/);
});
