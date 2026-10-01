import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { bridgeRoot } from './account.mjs';
import { BridgeError } from './profiles.mjs';
import { ProviderPool } from './provider-pool.mjs';
import { ModelRelay } from './provider-relay.mjs';
import { validateChat, completion } from './provider-protocol.mjs';
export const providerState = path.join(bridgeRoot, '.bridge', 'provider');
export async function localToken() {
  await mkdir(providerState, { recursive: true, mode: 0o700 });
  const file = path.join(providerState, 'token');
  try { await writeFile(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const value = (await readFile(file, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new BridgeError('INVALID_TOKEN', 'Invalid local provider token.');
  return value;
}
export function validateProviderConfig(config) {
  const fail = () => { throw new BridgeError('INVALID_CONFIG', 'Invalid native provider configuration.'); };
  if (!config || config.version !== 1 || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 ||
      !Number.isInteger(config.globalLimit) || config.globalLimit < 1 || config.globalLimit > 14) fail();
  if (!config.limits || typeof config.limits !== 'object' || Array.isArray(config.limits) || Object.keys(config.limits).length > 16 ||
      !['zcode', 'cursor'].every(name => Object.hasOwn(config.limits, name))) fail();
  for (const [name, limit] of Object.entries(config.limits)) if (!/^[a-z][a-z0-9-]{0,50}$/.test(name) ||
      limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 14)) fail();
  if (!Number.isInteger(config.attemptTimeoutMs) || config.attemptTimeoutMs < 1000 || config.attemptTimeoutMs > 540000 ||
      !Number.isInteger(config.requestTimeoutMs) || config.requestTimeoutMs < config.attemptTimeoutMs || config.requestTimeoutMs > 540000) fail();
  if (!config.routes || typeof config.routes !== 'object' || Array.isArray(config.routes) || Object.keys(config.routes).length > 64) fail();
  for (const [id, route] of Object.entries(config.routes)) {
    if (!/^[a-z][a-z0-9._-]{0,100}$/.test(id) || typeof route.description !== 'string' || route.description.length > 500) fail();
    if (route.provider === 'cursor') { if (typeof route.model !== 'string' || !/^[a-z0-9._-]+$/.test(route.model) || route.model === 'auto') fail(); }
    else if (route.provider === 'claude') { if (typeof route.model !== 'string' || !/^[a-z0-9._-]+$/.test(route.model) || route.model === 'auto') fail(); }
    else if (route.provider === 'codex') { if (typeof route.model !== 'string' || !/^[a-z0-9._-]+$/.test(route.model) || route.model === 'auto') fail(); }
    else if (route.provider === 'zcode') { if (typeof route.agent !== 'string' || typeof route.expectedModel !== 'string' || !route.expectedModel.includes('/')) fail(); }
    else fail();
    // Claude-as-relay is refused by Anthropic's terms, so a claude route must
    // declare delegation explicitly; mode means nothing for any other provider.
    if (route.provider === 'claude' && route.mode !== 'delegate') fail();
    if (route.provider !== 'claude' && route.mode !== undefined) fail();
    if (!Object.hasOwn(config.limits, route.pool ?? route.provider) ||
        route.pool !== undefined && (typeof route.pool !== 'string' || !/^[a-z][a-z0-9-]{0,50}$/.test(route.pool))) fail();
  }
  if (!config.fallback || typeof config.fallback.enabled !== 'boolean' || !Array.isArray(config.fallback.on) ||
      config.fallback.on.some(code => !['PROVIDER_UNAVAILABLE', 'CURSOR_MODEL_UNAVAILABLE'].includes(code)) ||
      !config.fallback.routes || typeof config.fallback.routes !== 'object') fail();
  for (const [id, candidates] of Object.entries(config.fallback.routes)) {
    if (!Object.hasOwn(config.routes, id) || !Array.isArray(candidates) || candidates.length > 2 ||
        new Set([id, ...candidates]).size !== candidates.length + 1 || candidates.some(candidate => !Object.hasOwn(config.routes, candidate))) fail();
  }
  return config;
}
export async function readProviderConfig(file = path.join(bridgeRoot, 'config', 'native-provider.json')) {
  if ((await stat(file)).size > 131072) throw new BridgeError('INVALID_CONFIG', 'Provider configuration is too large.');
  return validateProviderConfig(JSON.parse(await readFile(file, 'utf8')));
}
function statusFor(code) {
  if (code === 'DEPENDENCIES_NOT_READY') return 409;
  if (['RATE_LIMITED', 'QUEUE_FULL'].includes(code)) return 429;
  if (['TIMEOUT', 'REQUEST_TIMEOUT', 'CANCELLED'].includes(code)) return 504;
  if (/^(INVALID|UNKNOWN|UNSUPPORTED)/.test(code)) return 400;
  return 502;
}
// The whole request body is buffered here before the relay sees it, and the relay hands
// anything over 6000 characters to the CLI as a transport file, so this cap only bounds
// bridge memory. ZCode resends the entire conversation every turn, so a long session grows
// until it crossed the previous 512 KiB literal and failed its turn with a 413. Nothing
// records why 512 KiB was chosen: it was a bare literal, and contextWindow is never read
// here (it is only advertised to ZCode at registration).
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;

export function createProviderServer({ config, token, relay, pool = new ProviderPool(config) }) {
  validateProviderConfig(config);
  relay ??= new ModelRelay(config, pool);
  const controllers = new Set();
  const modelIds = Object.keys(config.routes);
  const send = (res, status, value) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); } };
  const server = http.createServer(async (req, res) => {
    let timer, heartbeat, controller;
    try {
      if (req.headers.origin || !/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host ?? '')) { send(res, 403, { error: { message: 'Loopback clients only.', type: 'access_denied' } }); return; }
      if (req.method === 'GET' && req.url === '/health') { send(res, 200, { service: 'agent-bridge', version: 1, ready: !pool.stopped }); return; }
      const actual = Buffer.from(req.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${token}`);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { send(res, 401, { error: { message: 'Invalid local provider key.', type: 'authentication_error' } }); return; }
      if (req.method === 'POST' && req.url === '/shutdown') { send(res, 202, { stopping: true }); void server.shutdown(); return; }
      if (req.method === 'GET' && req.url === '/v1/models') { send(res, 200, { object: 'list', data: modelIds.map(id => ({ id, object: 'model', created: 0, owned_by: 'local-workflow-bridge' })) }); return; }
      if (req.method === 'GET' && req.url === '/status') { send(res, 200, { ...pool.snapshot(), fallbackEnabled: config.fallback.enabled, routes: modelIds }); return; }
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') { send(res, 404, { error: { message: 'Use /v1/chat/completions.', type: 'not_found' } }); return; }
      if (controllers.size >= 64) throw new BridgeError('QUEUE_FULL', 'Too many queued requests.');
      controller = new AbortController(); controllers.add(controller);
      timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) { send(res, 413, { error: { message: `Request exceeds ${MAX_BODY_BYTES / 1024 / 1024} MiB.`, type: 'invalid_request_error' } }); return; }
        chunks.push(chunk);
      }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new BridgeError('INVALID_REQUEST', 'Invalid JSON body.'); }
      validateChat(body, modelIds);
      const streamId = `chatcmpl-${randomUUID()}`, streamCreated = Math.floor(Date.now() / 1000);
      const sse = delta => `data: ${JSON.stringify({ id: streamId, object: 'chat.completion.chunk', created: streamCreated, model: body.model,
        choices: [{ index: 0, ...delta }] })}\n\n`;
      let streamed = false;
      const onContentDelta = body.stream && !body.response_format
        ? text => { streamed = true; if (!res.destroyed && !controller.signal.aborted) res.write(sse({ delta: { content: text }, finish_reason: null })); }
        : undefined;
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.flushHeaders();
        res.write(sse({ delta: { role: 'assistant', content: '' }, finish_reason: null }));
        heartbeat = setInterval(() => { if (!res.destroyed) res.write(': waiting for CLI model\n\n'); }, 10000);
      }
      const { message } = await relay.complete(body, { signal: controller.signal, onContentDelta, transport: {
        sessionId: req.headers['x-session-id'], sessionType: req.headers['x-zcode-session-type'],
      } });
      const result = completion(message, body.model, streamId);
      if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESPONSE_BYTES) throw new BridgeError('RESPONSE_TOO_LARGE', 'Model response exceeds the local limit.');
      if (controller.signal.aborted) throw new BridgeError('REQUEST_TIMEOUT', 'The request deadline or client connection ended.');
      if (body.stream) {
        if (message.tool_calls?.length) res.write(sse({ delta: { tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) }, finish_reason: null }));
        else if (!streamed && message.content) res.write(sse({ delta: { content: message.content }, finish_reason: null }));
        res.write(sse({ delta: {}, finish_reason: message.tool_calls?.length ? 'tool_calls' : 'stop' }));
        res.end('data: [DONE]\n\n');
      }
      else send(res, 200, result);
    } catch (error) {
      const code = error instanceof BridgeError ? error.code : 'PROVIDER_ERROR';
      const value = { error: { message: error instanceof BridgeError ? error.message : 'Local provider request failed.', type: 'api_error', code } };
      if (res.headersSent) { if (!res.destroyed) { res.write(`data: ${JSON.stringify(value)}\n\n`); res.end(); } }
      else { if (statusFor(code) === 429) res.setHeader('Retry-After', '15'); send(res, statusFor(code), value); }
    } finally { clearTimeout(timer); clearInterval(heartbeat); if (controller) controllers.delete(controller); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000; server.maxConnections = 80;
  server.shutdown = async () => {
    pool.close(); for (const controller of controllers) controller.abort();
    await new Promise(resolve => server.close(resolve));
  };
  return server;
}
