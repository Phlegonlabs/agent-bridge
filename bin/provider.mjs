#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { serveProvider } from '../src/provider-lifecycle.mjs';
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
try {
  const { values } = parseArgs({ options: { config: { type: 'string' } } });
  await serveProvider({ configFile: values.config, signal: controller.signal });
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: error.code ?? 'SERVER_ERROR', message: error.message })); process.exitCode = 1;
}
