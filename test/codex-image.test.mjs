import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, utimes, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nativeImageEvidence, runCodexImage, saveNativeImage } from '../src/codex-image.mjs';

const sessionId = '01a0f86c-5833-7b92-92a8-4652c4942464';
async function fixture(output = true) {
  const codexHome = await mkdtemp(path.join(tmpdir(), 'codex-image-test-'));
  const directory = path.join(codexHome, 'generated_images', sessionId);
  const sessions = path.join(codexHome, 'sessions', '2026', '10', '01');
  await mkdir(directory, { recursive: true });
  await mkdir(sessions, { recursive: true });
  const records = [{ type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'call-image',
    input: 'const result = await tools.image_gen__imagegen({prompt:"cube"}); generatedImage(result);' } }];
  if (output) records.push({ type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'call-image',
    output: [{ type: 'input_image', image_url: 'data:image/png;base64,test' }] } });
  const rollout = path.join(sessions, `rollout-test-${sessionId}.jsonl`);
  await writeFile(rollout, records.map(record => JSON.stringify(record)).join('\n'));
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.write('IHDR', 12); png.writeUInt32BE(1024, 16); png.writeUInt32BE(1024, 20);
  const sourcePath = path.join(directory, 'native.png');
  await writeFile(sourcePath, png);
  return { codexHome, sourcePath, rollout, sessionId, startedAt: Date.now() - 5000 };
}

test('image verification needs a native image tool result, not a PNG or model claim alone', async () => {
  const setup = await fixture(false);
  await assert.rejects(nativeImageEvidence(setup), { code: 'CODEX_IMAGE_UNVERIFIED' });
  const verified = await nativeImageEvidence(await fixture());
  assert.equal(verified.width, 1024); assert.equal(verified.height, 1024);
  assert.match(verified.sha256, /^[a-f0-9]{64}$/);
});

test('image verification rejects stale and malformed files and extra native images', async () => {
  const stale = await fixture();
  await utimes(stale.sourcePath, new Date(0), new Date(0));
  await assert.rejects(nativeImageEvidence(stale), { code: 'CODEX_IMAGE_UNVERIFIED' });
  const malformed = await fixture();
  await writeFile(malformed.sourcePath, Buffer.alloc(24));
  await assert.rejects(nativeImageEvidence(malformed), { code: 'CODEX_IMAGE_UNVERIFIED' });
  const extra = await fixture();
  await writeFile(path.join(path.dirname(extra.sourcePath), 'second.png'), await readFile(extra.sourcePath));
  await assert.rejects(nativeImageEvidence(extra), { code: 'CODEX_IMAGE_UNVERIFIED' });
});

test('saving an image preserves its source and refuses an existing destination', async () => {
  const setup = await fixture();
  const evidence = await nativeImageEvidence(setup);
  const workspace = await mkdtemp(path.join(tmpdir(), 'codex-image-workspace-'));
  const saved = await saveNativeImage(evidence, workspace, sessionId);
  assert.deepEqual(await readFile(saved.path), await readFile(setup.sourcePath));
  await assert.rejects(saveNativeImage(evidence, workspace, sessionId), { code: 'EEXIST' });
});

test('saving an image refuses a generated-images junction outside the workspace', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'codex-image-workspace-'));
  const other = await mkdtemp(path.join(tmpdir(), 'codex-image-other-'));
  await symlink(other, path.join(workspace, 'generated-images'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(saveNativeImage({ sourcePath: 'unused' }, workspace), { code: 'INVALID_IMAGE_DESTINATION' });
});

test('empty prompts and invalid session ids fail before invoking Codex', async () => {
  await assert.rejects(runCodexImage({ cwd: '.', prompt: '' }), { code: 'INVALID_IMAGE_PROMPT' });
  await assert.rejects(nativeImageEvidence({ sessionId: '../../elsewhere', startedAt: 0 }), { code: 'CODEX_IMAGE_UNVERIFIED' });
});
