import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { TaskProgress, notifyProgress, taskIdPattern } from './task-progress.mjs';
import { WorkflowStatusJournal } from './workflow-status.mjs';
import { setMaxListeners } from 'node:events';
import path from 'node:path';
import { bridgeRoot } from './account.mjs';
import { BridgeError, hash } from './profiles.mjs';
import { runAgent } from './bridge.mjs';
import { runClaude } from './claude.mjs';
import { runCursor } from './cursor.mjs';

export const presetPath = path.join(bridgeRoot, 'config', 'workflow-presets.json');
const namePattern = /^[a-z][a-z0-9-]{0,63}$/;
const fallbackCodes = new Set(['TIMEOUT', 'PROVIDER_UNAVAILABLE', 'CURSOR_MODEL_UNAVAILABLE']);
const invalid = message => { throw new BridgeError('INVALID_WORKFLOW', message); };
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) invalid(`Invalid ${label} fields.`);
}
function dictionary(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length < 1 || Object.keys(value).length > 32 ||
      Object.keys(value).some(key => !namePattern.test(key))) invalid(`Invalid ${label} names.`);
}
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) invalid(`${label} must be ${min}..${max}.`);
}
export function validatePreset(preset) {
  object(preset, ['parallelLimit', 'attemptTimeoutMs', 'runTimeoutMs', 'fallback', 'routes', 'workers'], 'preset');
  integer(preset.parallelLimit, 1, 14, 'parallelLimit');
  integer(preset.attemptTimeoutMs, 100, 540000, 'attemptTimeoutMs');
  integer(preset.runTimeoutMs, 100, 540000, 'runTimeoutMs');
  object(preset.fallback, ['enabled', 'on'], 'fallback');
  if (typeof preset.fallback.enabled !== 'boolean' || !Array.isArray(preset.fallback.on) ||
      preset.fallback.on.some(code => !fallbackCodes.has(code)) ||
      new Set(preset.fallback.on).size !== preset.fallback.on.length) invalid('Invalid fallback policy.');
  dictionary(preset.routes, 'route');
  dictionary(preset.workers, 'worker');
  for (const route of Object.values(preset.routes)) {
    if (route?.provider === 'zcode') {
      object(route, ['provider', 'agent', 'expectedModel'], 'ZCode route');
      if (typeof route.agent !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(route.agent) ||
          typeof route.expectedModel !== 'string' || !/^[^\s/]+\/[^\s]+$/.test(route.expectedModel)) invalid('ZCode route requires an agent and qualified expectedModel.');
    } else if (route?.provider === 'cursor') {
      object(route, ['provider', 'model'], 'Cursor route');
      if (typeof route.model !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(route.model) || route.model === 'auto') invalid('Cursor route requires an explicit model.');
    } else if (route?.provider === 'claude') {
      object(route, ['provider', 'model'], 'Claude route');
      if (typeof route.model !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(route.model) || route.model === 'auto') invalid('Claude route requires an explicit model.');
    } else invalid('Route provider must be zcode, cursor or claude.');
  }
  for (const worker of Object.values(preset.workers)) {
    object(worker, ['description', 'route', 'fallbacks'], 'worker');
    if (typeof worker.description !== 'string' || !worker.description.trim() || worker.description.length > 1000) invalid('Worker description must be 1..1000 characters.');
    if (!Array.isArray(worker.fallbacks) || worker.fallbacks.length > 2) invalid('Each worker may have at most two fallback routes.');
    const routes = [worker.route, ...worker.fallbacks];
    if (routes.some(route => typeof route !== 'string' || !Object.hasOwn(preset.routes, route)) ||
        new Set(routes).size !== routes.length) invalid('Worker routes must exist and must not repeat.');
  }
  return preset;
}
export async function readJsonFile(file) {
  if ((await stat(file)).size > 1024 * 1024) invalid('JSON file exceeds 1 MiB.');
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { invalid('Cannot read a valid JSON file.'); }
}
export async function readPresets(file = presetPath) {
  const config = await readJsonFile(file);
  object(config, ['version', 'defaultPreset', 'presets'], 'config');
  dictionary(config.presets, 'preset');
  if (config.version !== 1 || typeof config.defaultPreset !== 'string' ||
      !Object.hasOwn(config.presets, config.defaultPreset)) invalid('Invalid config version or defaultPreset.');
  Object.values(config.presets).forEach(validatePreset);
  return config;
}
export function selectPreset(config, { name = config.defaultPreset, parallelLimit, fallback } = {}) {
  if (!Object.hasOwn(config.presets, name)) invalid('Unknown preset.');
  const preset = structuredClone(config.presets[name]);
  if (parallelLimit !== undefined) preset.parallelLimit = parallelLimit;
  if (fallback !== undefined) {
    if (!['off', 'configured'].includes(fallback)) invalid('fallback must be off or configured.');
    preset.fallback.enabled = fallback === 'configured';
  }
  return { name, preset: validatePreset(preset) };
}
function validateJobs(jobs, preset) {
  if (!Array.isArray(jobs) || jobs.length < 1 || jobs.length > 32) invalid('Provide 1..32 jobs.');
  const seen = new Set();
  for (const job of jobs) {
    object(job, ['id', 'worker', 'task'], 'job');
    if (typeof job.id !== 'string' || !namePattern.test(job.id) || seen.has(job.id)) invalid('Job IDs must be unique names.');
    seen.add(job.id);
    if (typeof job.worker !== 'string' || !Object.hasOwn(preset.workers, job.worker)) invalid('Unknown job worker.');
    if (typeof job.task !== 'string' || !job.task.trim() || Buffer.byteLength(job.task) > 32768) invalid('Each task must be 1..32768 bytes.');
  }
}
function canFallback(result, policy) {
  if (!policy.enabled || !policy.on.includes(result.code)) return false;
  if (!result.execution) return result.code === 'CURSOR_MODEL_UNAVAILABLE'; // Preflight; no worker started.
  const execution = result.execution;
  if (result.code === 'TIMEOUT') return ['terminated', 'terminated_process_group'].includes(execution.cleanup?.status);
  return !execution.reason && execution.exitCode === 0 && !execution.cleanup;
}
export async function executeRoute(route, options) {
  return route.provider === 'cursor'
    ? runCursor({ ...options, model: route.model })
    : route.provider === 'claude'
      ? runClaude({ ...options, model: route.model })
      : runAgent({ ...options, agent: route.agent, expectedModel: route.expectedModel });
}

// A slot stays occupied through fallback and process cleanup. Limits are per batch.
export async function executeJobs({ preset, jobs, cwd, signal, trustWorkspace = false, execute = executeRoute, onProgress, runId }) {
  preset = validatePreset(structuredClone(preset));
  jobs = structuredClone(jobs);
  validateJobs(jobs, preset);
  const controller = new AbortController();
  setMaxListeners(preset.parallelLimit + 2, controller.signal);
  const deadline = Date.now() + preset.runTimeoutMs;
  const tasks = jobs.map(job => {
    const route = preset.routes[preset.workers[job.worker].route];
    const progress = new TaskProgress({ parentRunId: runId, jobId: job.id, provider: route.provider,
      model: route.model ?? route.expectedModel, deadlineAt: deadline, onChange: onProgress });
    notifyProgress(onProgress, progress.snapshot()); progress.update({ type: 'queued' });
    return progress;
  });
  let stopCode, next = 0, active = 0, peakParallel = 0;
  const stop = code => {
    stopCode ??= code;
    for (const progress of tasks) progress.update({ type: 'stopping' });
    controller.abort();
  };
  const cancel = () => stop('CANCELLED');
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => stop('WORKFLOW_TIMEOUT'), preset.runTimeoutMs);
  const results = new Array(jobs.length);
  async function consumer() {
    while (!controller.signal.aborted && next < jobs.length) {
      const index = next++, job = jobs[index], worker = preset.workers[job.worker];
      const attempts = [];
      active++; peakParallel = Math.max(peakParallel, active);
      try {
        const routes = [worker.route, ...(preset.fallback.enabled ? worker.fallbacks : [])];
        for (const routeName of routes) {
          if (controller.signal.aborted) break;
          const remaining = deadline - Date.now();
          if (remaining < 100) { stop('WORKFLOW_TIMEOUT'); break; }
          const startedAt = Date.now();
          let result;
          const route = preset.routes[routeName];
          const observe = tasks[index].beginAttempt({ provider: route.provider, model: route.model ?? route.expectedModel });
          try {
            result = await execute(route, { cwd, task: job.task, trustWorkspace, onProgress: observe,
              timeoutMs: Math.min(preset.attemptTimeoutMs, remaining), signal: controller.signal });
          } catch (error) {
            result = { ok: false, code: error instanceof BridgeError ? error.code : 'BRIDGE_ERROR' };
          }
          attempts.push({ route: routeName, startedAt, endedAt: Date.now(), result });
          if (result.execution?.cleanup?.status === 'unconfirmed') stop('CLEANUP_UNCONFIRMED');
          if (result.ok || !canFallback(result, preset.fallback)) break;
        }
        const last = attempts.at(-1);
        results[index] = { id: job.id, worker: job.worker, ok: last?.result.ok === true,
          code: last?.result.code ?? stopCode ?? 'NOT_STARTED', route: last?.route,
          actualModel: last?.result.actualModel, response: last?.result.response,
          fallbackUsed: attempts.length > 1, attempts };
        tasks[index].settle(results[index]);
      } finally { active--; }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(jobs.length, preset.parallelLimit) }, consumer));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
  for (let index = 0; index < jobs.length; index++) {
    results[index] ??= { id: jobs[index].id, worker: jobs[index].worker, ok: false,
      code: stopCode ?? 'NOT_STARTED', fallbackUsed: false, attempts: [] };
    tasks[index].settle(results[index]);
  }
  const ok = !stopCode && results.every(result => result.ok);
  return { ok, code: stopCode ?? (ok ? 'VERIFIED' : 'WORKFLOW_FAILED'),
    parallelLimit: preset.parallelLimit, peakParallel, fallbackEnabled: preset.fallback.enabled, jobs: results };
}
export async function runWorkflow({ name, preset, jobs, runId = randomUUID(), onProgress, ...options }) {
  validatePreset(preset); validateJobs(jobs, preset);
  if (!taskIdPattern.test(runId)) throw new BridgeError('INVALID_TASK_ID', 'Use a UUID workflow ID.');
  const parent = path.join(bridgeRoot, '.bridge', 'workflows'), logs = path.join(parent, runId);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  try { await mkdir(logs, { mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') throw new BridgeError('WORKFLOW_ID_EXISTS', 'This workflow ID already exists. Status lookup never reruns it.'); throw error; }
  await writeFile(path.join(logs, 'request.json'), JSON.stringify({ name, preset,
    jobs: jobs.map(({ id, worker, task }) => ({ id, worker, taskSha256: hash(task) })) }, null, 2), { flag: 'wx', mode: 0o600 });
  const journal = new WorkflowStatusJournal(logs, runId);
  try {
    const report = { schema: 'agent-bridge/workflow/1', runId, preset: name,
      ...await executeJobs({ preset, jobs, ...options, runId, onProgress: snapshot => {
        journal.observe(snapshot); notifyProgress(onProgress, snapshot);
      } }), logs };
    await writeFile(path.join(logs, 'result.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    report.progressAvailable = await journal.finish(report);
    return report;
  } catch (error) {
    await journal.finish({ ok: false, code: error instanceof BridgeError ? error.code : 'WORKFLOW_FAILED' });
    throw error;
  }
}

// Native world.run captures at most 256 KiB. Full responses stay in the run journal.
export function workflowOutput(report) {
  return { ...report, jobs: report.jobs.map(job => {
    let response = job.response, responseTruncated = false;
    if (typeof response === 'string' && Buffer.byteLength(JSON.stringify(response)) > 4000) {
      let low = 0, high = Math.min(response.length, 4000);
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (Buffer.byteLength(JSON.stringify(response.slice(0, mid))) <= 4000) low = mid; else high = mid - 1;
      }
      response = response.slice(0, low); responseTruncated = true;
    }
    return { ...job, response, responseTruncated, attempts: job.attempts.map(attempt => ({
      route: attempt.route, startedAt: attempt.startedAt, endedAt: attempt.endedAt,
      ok: attempt.result.ok, code: attempt.result.code, runId: attempt.result.runId,
      actualModel: attempt.result.actualModel, logs: attempt.result.logs,
    })) };
  }) };
}
