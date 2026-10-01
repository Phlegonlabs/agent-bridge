#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { runCodexImage } from '../src/codex-image.mjs';
import { BridgeError } from '../src/profiles.mjs';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
try {
  const { values } = parseArgs({ strict: true, options: {
    cwd: { type: 'string' }, 'prompt-file': { type: 'string' }, 'timeout-ms': { type: 'string' }, help: { type: 'boolean' }
  } });
  if (values.help) {
    console.log(JSON.stringify({ usage: 'node bin/codex-image.mjs --cwd DIRECTORY --prompt-file UTF8_FILE [--timeout-ms 300000]',
      note: 'Uses native Codex image generation with the existing Codex login. No Image API fallback.' }));
  } else {
    if (!values.cwd || !values['prompt-file']) throw new BridgeError('INVALID_ARGUMENT', 'Specify --cwd and --prompt-file.');
    if ((await stat(values['prompt-file'])).size > 16000) throw new BridgeError('INVALID_IMAGE_PROMPT', 'Image prompt exceeds 16000 bytes.');
    const report = await runCodexImage({ cwd: values.cwd, prompt: await readFile(values['prompt-file'], 'utf8'),
      timeoutMs: values['timeout-ms'] === undefined ? 300000 : Number(values['timeout-ms']), signal: controller.signal });
    console.log(JSON.stringify(report));
    if (!report.ok) process.exitCode = 1;
  }
} catch (error) {
  console.log(JSON.stringify({ ok: false, code: error.code ?? 'CODEX_IMAGE_FAILED',
    message: error instanceof BridgeError ? error.message : 'Native image generation failed. Check the local run logs.' }));
  process.exitCode = 1;
}
