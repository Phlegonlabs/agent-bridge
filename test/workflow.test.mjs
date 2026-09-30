import test from 'node:test';
import assert from 'node:assert/strict';
import { readPresets, selectPreset, validatePreset, executeJobs, workflowOutput } from '../src/workflow.mjs';
import { BridgeError } from '../src/profiles.mjs';

const config = await readPresets();
const fresh = () => selectPreset(config).preset;
const jobs = Array.from({ length: 5 }, (_, index) => ({ id: `job-${index}`, worker: 'cursor', task: `Task ${index}` }));
const success = { ok: true, code: 'VERIFIED', actualModel: 'composer-2.5', response: 'done' };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function enabled() {
  const preset = fresh(); preset.fallback.enabled = true;
  preset.workers.cursor.fallbacks = ['cursor-reviewer', 'cursor-explorer'];
  return preset;
}
test('saved defaults and per-run overrides do not mutate configuration', () => {
  assert.equal(fresh().parallelLimit, 14); assert.equal(fresh().fallback.enabled, false);
  const selected = selectPreset(config, { parallelLimit: 2, fallback: 'configured' });
  assert.equal(selected.preset.parallelLimit, 2); assert.equal(selected.preset.fallback.enabled, true);
  assert.equal(fresh().parallelLimit, 14); assert.equal(fresh().fallback.enabled, false);
});
test('queue bounds actual execution and preserves task routing and result order', async () => {
  const preset = fresh(); preset.parallelLimit = 2;
  let active = 0, peak = 0; const tasks = [];
  const result = await executeJobs({ preset, jobs, execute: async (route, options) => {
    assert.equal(route.provider, 'cursor'); active++; peak = Math.max(peak, active); tasks.push(options.task);
    await pause(options.task === 'Task 0' ? 40 : 10); active--;
    return { ...success, response: options.task };
  } });
  assert.equal(result.ok, true); assert.equal(peak, 2); assert.equal(result.peakParallel, 2);
  assert.deepEqual(result.jobs.map(job => job.response), jobs.map(job => job.task));
  assert.deepEqual(tasks, jobs.map(job => job.task));
});
test('disabled fallback never uses configured candidates', async () => {
  const preset = enabled(); preset.fallback.enabled = false; let count = 0;
  const result = await executeJobs({ preset, jobs: jobs.slice(0, 1), execute: async () => {
    count++; throw new BridgeError('CURSOR_MODEL_UNAVAILABLE', 'unavailable');
  } });
  assert.equal(count, 1); assert.equal(result.ok, false); assert.equal(result.jobs[0].fallbackUsed, false);
});
test('fallback is ordered, bounded and keeps its slot while cleanup finishes', async () => {
  const preset = enabled(); preset.parallelLimit = 1; const calls = []; let cleaned = false;
  const worker = preset.workers.cursor;
  const modelOf = route => preset.routes[route].model;
  const primary = modelOf(worker.route);
  const [firstFallback, secondFallback] = worker.fallbacks.map(modelOf);
  assert.equal(worker.fallbacks.length, 2, 'this test needs two configured fallback routes');
  assert.equal(new Set([primary, firstFallback, secondFallback]).size, 3, 'fallback models must be distinguishable');
  const result = await executeJobs({ preset, jobs: jobs.slice(0, 2), execute: async (route, options) => {
    calls.push([options.task, route.model]);
    if (route.model === primary) {
      await pause(10); cleaned = true;
      return { ok: false, code: 'TIMEOUT', execution: { reason: 'timeout', cleanup: { status: 'terminated', survivors: [] } } };
    }
    assert.equal(cleaned, true);
    if (route.model === firstFallback) return { ok: false, code: 'PROVIDER_UNAVAILABLE', execution: { exitCode: 0, reason: null, cleanup: null } };
    return { ...success, actualModel: route.model };
  } });
  const chain = [primary, firstFallback, secondFallback];
  assert.equal(result.ok, true); assert.equal(result.peakParallel, 1);
  assert.deepEqual(calls.map(call => call[1]), [...chain, ...chain]);
  assert.equal(result.jobs[0].attempts.length, 3); assert.equal(result.jobs[0].fallbackUsed, true);
  assert.equal(result.jobs[0].actualModel, secondFallback);
});
test('fallback cannot bypass protocol, auth, cancellation or missing cleanup evidence', async () => {
  for (const failure of [
    { code: 'MODEL_MISMATCH' }, { code: 'WRONG_DISPATCH' }, { code: 'CURSOR_AUTH_REQUIRED' },
    { code: 'CANCELLED' }, { code: 'TIMEOUT' },
    { code: 'TIMEOUT', execution: { reason: 'timeout', cleanup: { status: 'already_exited' } } },
    { code: 'PROVIDER_UNAVAILABLE', execution: { exitCode: 1 } },
  ]) {
    let calls = 0;
    const result = await executeJobs({ preset: enabled(), jobs: jobs.slice(0, 1), execute: async () => { calls++; return { ok: false, ...failure }; } });
    assert.equal(calls, 1, failure.code); assert.equal(result.ok, false);
  }
});
test('unconfirmed cleanup stops queued work and cancels other active work', async () => {
  const preset = enabled(); preset.parallelLimit = 2; let calls = 0;
  const result = await executeJobs({ preset, jobs, execute: async (_, { task, signal }) => {
    calls++;
    if (task === 'Task 0') { await pause(10); return { ok: false, code: 'TIMEOUT', execution: { cleanup: { status: 'unconfirmed' } } }; }
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    return { ok: false, code: 'CANCELLED' };
  } });
  assert.equal(calls, 2); assert.equal(result.code, 'CLEANUP_UNCONFIRMED');
  assert.equal(result.jobs[2].attempts.length, 0);
});
test('run deadline cancels active work and does not start pending jobs', async () => {
  const preset = fresh(); preset.parallelLimit = 1; preset.runTimeoutMs = 150;
  let calls = 0;
  const result = await executeJobs({ preset, jobs, execute: async (_, { signal, timeoutMs }) => {
    calls++; assert.ok(timeoutMs <= 150);
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    return { ok: false, code: 'CANCELLED' };
  } });
  assert.equal(result.code, 'WORKFLOW_TIMEOUT'); assert.equal(calls, 1);
  assert.equal(result.jobs[1].code, 'WORKFLOW_TIMEOUT');
});
test('pre-cancelled batch does not start a worker', async () => {
  const controller = new AbortController(); controller.abort();
  const result = await executeJobs({ preset: fresh(), jobs, signal: controller.signal, execute: async () => assert.fail('started') });
  assert.equal(result.code, 'CANCELLED'); assert.equal(result.peakParallel, 0);
});
test('all configuration and jobs are checked before dispatch', async () => {
  for (const mutate of [
    preset => { preset.parallelLimit = 0; }, preset => { preset.parallelLimit = 15; },
    preset => { preset.routes['cursor-composer'].model = 'auto'; },
    preset => { preset.workers.cursor.fallbacks = ['absent']; },
    preset => { preset.workers.cursor.fallbacks = ['cursor-composer']; },
    preset => { preset.fallback.on = ['MODEL_MISMATCH']; },
    preset => { preset.routes['cursor-reviewer'].command = 'cmd'; },
  ]) {
    const preset = fresh(); mutate(preset);
    await assert.rejects(executeJobs({ preset, jobs, execute: async () => assert.fail('started') }), { code: 'INVALID_WORKFLOW' });
  }
  await assert.rejects(executeJobs({ preset: fresh(), jobs: [...jobs, { ...jobs[0], id: 'bad', worker: 'absent' }], execute: async () => assert.fail('started') }), { code: 'INVALID_WORKFLOW' });
  assert.throws(() => selectPreset(config, { fallback: 'auto' }), { code: 'INVALID_WORKFLOW' });
  assert.throws(() => validatePreset(null), { code: 'INVALID_WORKFLOW' });
});
test('14 parallel slots queue surplus jobs without spawning extra work', async () => {
  const many = Array.from({ length: 20 }, (_, index) => ({ id: `job-${index}`, worker: 'cursor', task: 'probe' }));
  let active = 0, peak = 0;
  const report = await executeJobs({ preset: fresh(), jobs: many, execute: async () => {
    active++; peak = Math.max(peak, active); await pause(15); active--; return success;
  } });
  assert.equal(report.ok, true); assert.equal(peak, 14); assert.equal(report.peakParallel, 14);
  assert.equal(report.jobs.length, 20);
});
test('workflow output stays below native capture limit and marks excerpts', () => {
  const response = '\u0000'.repeat(32768);
  const report = { jobs: Array.from({ length: 32 }, (_, index) => ({ id: `job-${index}`, response,
    attempts: [{ route: 'cursor-composer', result: { ...success, response } }] })) };
  const output = workflowOutput(report);
  assert.ok(Buffer.byteLength(JSON.stringify(output)) < 200000);
  assert.equal(output.jobs[0].responseTruncated, true);
  assert.equal(report.jobs[0].response, response);
  assert.equal(output.jobs[0].attempts[0].response, undefined);
});
