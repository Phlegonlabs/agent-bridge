import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { bridgeRoot } from './account.mjs';
import { runAgent } from './bridge.mjs';
import { runClaude } from './claude.mjs';
import { runCodex } from './codex.mjs';
import { runCursor } from './cursor.mjs';
import { BridgeError, hash } from './profiles.mjs';
import { relayPrompt, correctiveRelayPrompt, parseRelay } from './provider-protocol.mjs';
import { createEnvelopeContentStream } from './stream-relay.mjs';

export async function invokeCli(route, text, { signal, timeoutMs, directory, onPartial }) {
  let task = text, transportFile;
  if (route.provider === 'zcode' || text.length > 6000) {
    const file = path.join(directory, `transport-${randomUUID()}.txt`);
    transportFile = file;
    await writeFile(file, text, { flag: 'wx', mode: 0o600 });
    task = `Read the complete UTF-8 transport instruction file ${JSON.stringify(file)} using your read-file tool. Use only the read-file tool for this; never use shell, terminal, or bash tools, even to inspect the file's size or content. Read it in as few calls as your read-file tool allows - request the largest span per call - because every extra read costs a full round trip. Follow its model-relay instructions and return only the required JSON envelope. It is ${Buffer.byteLength(text)} bytes. Do not execute the enclosed host tools yourself. If any file content is truncated, read the remaining portion before responding.`;
  }
  const options = { cwd: bridgeRoot, task, timeoutMs, signal, onPartial };
  const result = route.provider === 'cursor'
    ? await runCursor({ ...options, model: route.model, trustWorkspace: true })
    : route.provider === 'claude'
      ? await runClaude({ ...options, model: route.model, onTextDelta: options.onPartial })
      : route.provider === 'codex'
        ? await runCodex({ ...options, model: route.model })
        : await runAgent({ ...options, agent: route.agent, expectedModel: route.expectedModel, transportFile });
  return result;
}
// Only machine errors count as rate limits; user/model prose must not reduce capacity.
export async function isRateLimited(result) {
  return Boolean(await rateLimitDetails(result));
}
export async function rateLimitDetails(result) {
  if (['RATE_LIMITED', 'rate_limited', '1302', '1308'].includes(result.code)) return { retryAfterMs: 15000, quota: result.code === '1308' };
  if (!result.logs || !['CLI_FAILED', 'AGENT_FAILED', 'CURSOR_CLI_FAILED', 'CLAUDE_CLI_FAILED', 'CLAUDE_RESULT_FAILED', 'CHILD_RESULT_UNVERIFIED'].includes(result.code)) return false;
  let text; try { text = await readFile(path.join(result.logs, 'events.jsonl'), 'utf8'); } catch { return false; }
  for (const line of text.split('\n')) {
    let event; try { event = JSON.parse(line); } catch { continue; }
    const p = event.payload;
    if (event.type === 'result' && (event.api_error_status === 429 || event.api_error_status === '429')) {
      return { retryAfterMs: 15000, quota: false };
    }
    if (p?.type === 'model_request_failed' && (p.statusCode === 429 || p.reason === 'rate_limited')) {
      return { retryAfterMs: Number.isFinite(p.retryAfterMs) ? p.retryAfterMs : 15000, quota: String(p.providerErrorCode) === '1308' };
    }
    const error = p?.error ?? (event.type === 'error' ? event.error : undefined);
    if (error && (['rate_limited', '1302', '1308'].includes(String(error.code)) || error.status === 429 || error.attribution?.statusCode === 429)) {
      return { retryAfterMs: 15000, quota: String(error.code) === '1308' };
    }
  }
  return false;
}
export class ModelRelay {
  constructor(config, pool, invoke = invokeCli, stateDirectory = path.join(bridgeRoot, '.bridge', 'provider')) {
    this.config = config; this.pool = pool; this.invoke = invoke; this.stateDirectory = stateDirectory;
    this.ready = Promise.all(Object.keys(pool.groups).map(async name => {
      try {
        const state = JSON.parse(await readFile(this.limitFile(name), 'utf8'));
        if (Number.isFinite(state.until) && state.until > Date.now()) pool.limited(name, state.until - Date.now(), state.quota === true);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }));
  }
  limitFile(name) { return path.join(this.stateDirectory, `cooldown-${name}.json`); }
  poolName(route) { return route.pool ?? route.provider; }
  async call(routeId, prompt, options) {
    const route = this.config.routes[routeId], poolName = this.poolName(route);
    if (this.pool.groups[poolName].cooldownUntil > Date.now() + options.timeoutMs) throw new BridgeError('RATE_LIMITED', 'This capacity pool is cooling down until its reported reset. No model switch was performed.');
    const release = await this.pool.acquire(poolName, options.signal);
    try {
      const result = await this.invoke(route, prompt, options);
      await writeFile(path.join(options.directory, `worker-${randomUUID()}.json`), JSON.stringify({ runId: result.runId, ok: result.ok,
        code: result.code, actualModel: result.actualModel, logs: result.logs, execution: result.execution }), { flag: 'wx', mode: 0o600 });
      if (result.execution?.cleanup?.status === 'unconfirmed') { this.pool.close(); throw new BridgeError('CLEANUP_UNCONFIRMED', 'Inspect the recorded worker process before continuing.'); }
      if (!result.ok) {
        const limit = await rateLimitDetails(result);
        if (limit) {
          this.pool.limited(poolName, limit.retryAfterMs, limit.quota);
          await writeFile(this.limitFile(poolName), JSON.stringify({ until: this.pool.groups[poolName].cooldownUntil, quota: limit.quota }), { mode: 0o600 });
          throw new BridgeError('RATE_LIMITED', 'Provider rate limited this request. Its queue is cooling down.');
        }
        throw new BridgeError(result.code ?? 'RELAY_FAILED', 'The selected CLI failed. No model switch was performed.');
      }
      this.pool.succeeded(poolName);
      return result;
    } finally { release(); }
  }
  async complete(body, { signal, transport, onContentDelta }) {
    await this.ready;
    const id = randomUUID(), directory = path.join(this.stateDirectory, 'requests', id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const options = { signal, timeoutMs: this.config.attemptTimeoutMs, directory, transport };
    const decision = { route: body.model, reason: 'explicit-model' };
    const nonce = randomUUID();
    await writeFile(path.join(directory, 'routing.json'), JSON.stringify({ id, requestedModel: body.model, ...decision,
      requestSha256: hash(JSON.stringify(body)) }, null, 2), { flag: 'wx', mode: 0o600 });
    const attempts = [], routeIds = [decision.route, ...(this.config.fallback.enabled ? this.config.fallback.routes[decision.route] ?? [] : [])];
    let result, message, selected;
    for (const routeId of routeIds) {
      if (signal.aborted) throw new BridgeError('CANCELLED', 'Request cancelled.');
      // Streaming skips response_format requests: their content still needs the
      // final validation pass, and a corrective round cannot retract sent text.
      const streamed = Boolean(onContentDelta) && !body.response_format && this.config.routes[routeId]?.provider === 'claude';
      const attemptOptions = streamed ? { ...options, onPartial: createEnvelopeContentStream(nonce, onContentDelta).feed } : options;
      try {
        result = await this.call(routeId, relayPrompt(body, nonce), attemptOptions);
        try { message = parseRelay(result.finalResponse ?? result.response, body, nonce); }
        catch (error) {
          // One corrective round: name the exact violation and re-issue the same
          // transport. Narration-wrapped replies never get here (the parser
          // extracts them); this path is for prose answers, empty envelopes and
          // undeclared tool calls.
          if (error.code !== 'RELAY_PROTOCOL_ERROR') throw error;
          result = await this.call(routeId, correctiveRelayPrompt(body, nonce, error.message), attemptOptions);
          message = parseRelay(result.finalResponse ?? result.response, body, nonce);
        }
        selected = routeId;
        attempts.push({ route: routeId, ok: true, runId: result.runId }); break;
      } catch (error) {
        attempts.push({ route: routeId, ok: false, code: error.code });
        await writeFile(path.join(directory, `attempt-${attempts.length}.json`), JSON.stringify(attempts.at(-1)), { flag: 'wx', mode: 0o600 });
        if (!this.config.fallback.enabled || !this.config.fallback.on.includes(error.code) || routeId === routeIds.at(-1)) throw error;
      }
    }
    const evidence = { id, requestedModel: body.model, selected, actualModel: result.actualModel, workerRunId: result.runId, attempts,
      modelEvidence: result.modelEvidence ?? 'native-child-model-request', response: message };
    await writeFile(path.join(directory, 'result.json'), JSON.stringify(evidence, null, 2), { flag: 'wx', mode: 0o600 });
    return { message, evidence: { ...evidence, response: undefined } };
  }
}
