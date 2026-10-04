import net from 'node:net';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { BridgeError, hash } from './profiles.mjs';
import { readProviderConfig, createProviderServer, localToken, providerState } from './provider-server.mjs';

export async function checkProviderPort(config, state = providerState) {
  const occupied = await new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: config.port });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(1500, () => finish(true));
    socket.once('connect', () => finish(true));
    socket.once('error', error => finish(error.code !== 'ECONNREFUSED'));
  });
  if (!occupied) return { occupied: false };
  try {
    const token = (await readFile(path.join(state, 'token'), 'utf8')).trim();
    const base = `http://127.0.0.1:${config.port}`;
    const healthResponse = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
    const health = await healthResponse.json();
    const status = await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1500) });
    if (healthResponse.ok && health.service === 'agent-bridge' && health.ready && status.ok &&
        health.configSha256 === hash(JSON.stringify(config))) return { occupied: true, reusable: true };
  } catch { /* Never start a second server or stop a service we cannot identify. */ }
  throw new BridgeError('PORT_IN_USE', `Port ${config.port} is occupied by another service or a bridge with different settings. Review the existing service before restarting it.`);
}

export async function serveProvider({ configFile, signal, onReady = console.log, state = providerState, createServer = createProviderServer } = {}) {
  if (signal?.aborted) return;
  const config = await readProviderConfig(configFile);
  if ((await checkProviderPort(config, state)).reusable) {
    onReady(JSON.stringify({ ok: true, reused: true, port: config.port })); return;
  }
  const server = createServer({ config, token: await localToken(state) });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, '127.0.0.1', resolve); });
  await mkdir(state, { recursive: true, mode: 0o700 });
  const record = path.join(state, `server-${process.pid}-${randomUUID()}.json`);
  let stopping;
  const stop = () => stopping ??= server.shutdown();
  signal?.addEventListener('abort', stop, { once: true });
  try {
    await writeFile(record, JSON.stringify({ pid: process.pid, startedAt: Date.now(), port: config.port,
      command: process.execPath, entry: 'bin/provider.mjs', configSha256: hash(JSON.stringify(config)), purpose: 'foreground provider', expires: 'on user shutdown or terminal close' }), { flag: 'wx', mode: 0o600 });
    onReady(JSON.stringify({ ok: true, ready: true, address: `http://127.0.0.1:${config.port}/v1`, models: Object.keys(config.routes).length }));
    if (signal?.aborted) await stop();
    if (server.listening) await new Promise((resolve, reject) => { server.once('close', resolve); server.once('error', reject); });
  } finally { signal?.removeEventListener('abort', stop); await stop(); }
}
