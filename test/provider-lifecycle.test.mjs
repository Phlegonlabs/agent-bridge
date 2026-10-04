import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { checkProviderPort } from '../src/provider-lifecycle.mjs';
import { hash } from '../src/profiles.mjs';

test('occupied ports require matching authenticated bridge identity and exact config before reuse', async t => {
  const state = await mkdtemp(path.join(tmpdir(), 'bridge-port-'));
  await writeFile(path.join(state, 'token'), 'fixture-token');
  let config, correctIdentity = false;
  const server = http.createServer((req, res) => {
    if (!correctIdentity) { res.writeHead(404).end(); return; }
    if (req.url === '/health') res.end(JSON.stringify({ service: 'agent-bridge', ready: true, configSha256: hash(JSON.stringify(config)) }));
    else if (req.url === '/status' && req.headers.authorization === 'Bearer fixture-token') res.end('{}');
    else res.writeHead(401).end();
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  config = { port: server.address().port, routes: {} };
  await assert.rejects(checkProviderPort(config, state), { code: 'PORT_IN_USE' });
  correctIdentity = true;
  assert.equal((await checkProviderPort(config, state)).reusable, true);
  await assert.rejects(checkProviderPort({ ...config, routes: { changed: {} } }, state), { code: 'PORT_IN_USE' });
  await writeFile(path.join(state, 'token'), 'wrong-fixture');
  await assert.rejects(checkProviderPort(config, state), { code: 'PORT_IN_USE' });
});
