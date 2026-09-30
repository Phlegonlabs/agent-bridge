#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readProviderConfig, localToken, createProviderServer, providerState } from '../src/provider-server.mjs';
const config = await readProviderConfig();
const server = createProviderServer({ config, token: await localToken() });
server.on('error', error => { console.error(JSON.stringify({ ok: false, code: error.code ?? 'SERVER_ERROR' })); process.exitCode = 1; });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, '127.0.0.1', resolve); });
await mkdir(providerState, { recursive: true });
await writeFile(path.join(providerState, `server-${process.pid}.json`), JSON.stringify({ pid: process.pid, startedAt: Date.now(), port: config.port, command: process.execPath, entry: import.meta.url }), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ ready: true, address: `http://127.0.0.1:${config.port}/v1`, models: Object.keys(config.routes).length + 1 }));
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await server.shutdown(); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
