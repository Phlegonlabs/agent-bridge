import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { readPresets, selectPreset, executeJobs, runWorkflow } from '../src/workflow.mjs';
import { readWorkflowStatus, WorkflowStatusJournal } from '../src/workflow-status.mjs';
import { TaskProgress } from '../src/task-progress.mjs';

function gate() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function preset() {
  const selected = selectPreset(await readPresets());
  selected.preset.parallelLimit = 1; selected.preset.attemptTimeoutMs = 2000; selected.preset.runTimeoutMs = 5000;
  return selected;
}

test('workflow publishes queued jobs and real activity before results, then flushes terminal status', async () => {
  const selected = await preset(), runId = randomUUID(), began = gate(), pending = gate();
  const worker = Object.keys(selected.preset.workers)[0], observed = [];
  const running = runWorkflow({ ...selected, runId, cwd: process.cwd(),
    jobs: [{ id: 'first', worker, task: 'PRIVATE_CANARY' }, { id: 'second', worker, task: 'PRIVATE_CANARY' }],
    onProgress: value => observed.push(value), execute: async (_route, options) => {
      options.onProgress({ type: 'running', runId: 'native-run' });
      options.onProgress({ type: 'activity', kind: 'tool_started', command: 'PRIVATE_CANARY' });
      began.resolve(); await pending.promise;
      options.onProgress({ type: 'finishing' });
      return { ok: true, code: 'VERIFIED', actualModel: 'synthetic-model', response: 'PRIVATE_CANARY' };
    } });
  try {
    await began.promise; await pause(30);
    const live = await readWorkflowStatus(runId);
    assert.equal(live.tasks[0].state, 'running'); assert.equal(live.tasks[1].state, 'queued');
    assert.equal(live.tasks[0].lastActivityKind, 'tool_started');
    assert.equal(live.liveness, 'unverified');
    assert.doesNotMatch(JSON.stringify(live), /PRIVATE_CANARY|command|ownerPid|ownerStartedAt/);
    const firstTime = live.tasks[0].lastActivityAt;
    await pause(20);
    const quiet = await readWorkflowStatus(runId);
    assert.equal(quiet.tasks[0].lastActivityAt, firstTime);
    assert.ok(quiet.tasks[0].lastActivityAgeMs > live.tasks[0].lastActivityAgeMs);
    pending.resolve(); const report = await running;
    assert.equal(report.ok, true); assert.equal(report.progressAvailable, true);
    const final = await readWorkflowStatus(runId);
    assert.equal(final.workflowState, 'finished'); assert.ok(final.tasks.every(task => task.state === 'finished'));
    await assert.rejects(runWorkflow({ ...selected, runId, jobs: [{ id: 'first', worker, task: 'never' }] }), { code: 'WORKFLOW_ID_EXISTS' });
    assert.ok(observed.some(value => value.state === 'running'));
  } finally { pending.resolve(); await running; }
});

test('observer failure and late fallback activity cannot change workflow results', async () => {
  const selected = await preset(), worker = Object.keys(selected.preset.workers)[0];
  selected.preset.fallback = { enabled: true, on: ['CURSOR_MODEL_UNAVAILABLE'] };
  selected.preset.workers[worker].fallbacks = [Object.keys(selected.preset.routes).find(name => name !== selected.preset.workers[worker].route)];
  let previous, calls = 0; const records = [];
  const report = await executeJobs({ preset: selected.preset, cwd: process.cwd(), jobs: [{ id: 'one', worker, task: 'test' }],
    onProgress: value => { records.push(value); throw new Error('display unavailable'); }, execute: async (_route, options) => {
      calls++;
      if (calls === 1) { previous = options.onProgress; return { ok: false, code: 'CURSOR_MODEL_UNAVAILABLE' }; }
      options.onProgress({ type: 'running', runId: 'second-run' });
      previous({ type: 'activity', kind: 'native_retry' });
      return { ok: true, code: 'VERIFIED', actualModel: 'second-model' };
    } });
  assert.equal(report.ok, true); assert.equal(report.jobs[0].fallbackUsed, true);
  assert.equal(records.at(-1).attempt, 2); assert.equal(records.at(-1).lastActivityKind, null);
});

test('stale workflow records expose last recorded state without claiming live execution', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bridge-workflow-status-')), runId = randomUUID();
  const directory = path.join(root, '.bridge', 'workflows', runId);
  await mkdir(directory, { recursive: true });
  try {
    const task = new TaskProgress({ now: () => 1000 }); task.update({ type: 'running' });
    const journal = new WorkflowStatusJournal(directory, runId); journal.observe(task.snapshot()); await journal.flush();
    const value = await readWorkflowStatus(runId, root);
    assert.equal(value.observation, 'recorded-workflow'); assert.equal(value.liveness, 'unverified');
    assert.equal(value.tasks[0].state, 'running'); assert.ok(value.tasks[0].elapsedMs > 1000);
    assert.equal((await readWorkflowStatus(randomUUID(), root)).available, false);
    await assert.rejects(readWorkflowStatus('../private', root), { code: 'INVALID_TASK_ID' });
    const file = path.join(directory, 'status.json');
    await writeFile(file, JSON.stringify({ schema: 'unknown', prompt: 'PRIVATE_CANARY' }));
    await assert.rejects(readWorkflowStatus(runId, root), { code: 'STATUS_UNAVAILABLE' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('saved workflow reports status while execution is pending and preserves final JSON parsing', async () => {
  const source = await readFile('.zcode/workflows/model-bridge.dwf.ts', 'utf8');
  const script = stripTypeScriptTypes(`async function scenario(args, world, phase, report, agent) {\n${source}\n}`, { mode: 'strip' });
  const run = new Function(`${script}\nreturn scenario;`)();
  const selected = await preset(), runId = randomUUID(), pending = gate(), reports = [];
  const worker = Object.keys(selected.preset.workers)[0]; let polls = 0, executionPending = false;
  const result = { ok: true, preset: selected.name, parallelLimit: 1, peakParallel: 1, fallbackEnabled: false,
    logs: 'synthetic', jobs: [{ id: 'one', worker, ok: true, actualModel: 'synthetic', response: 'done', responseTruncated: false, fallbackUsed: false }] };
  const world = { async run(_command, commandArguments) {
    if (commandArguments[0] === '-e') return { exitCode: 0, stdout: runId };
    if (commandArguments[1] === 'presets') return { exitCode: 0, stdout: JSON.stringify({ defaultPreset: selected.name, presets: { [selected.name]: selected.preset } }) };
    if (commandArguments[1] === 'workflow') {
      assert.ok(commandArguments.includes(`--run-id=${runId}`)); executionPending = true;
      await pending.promise; executionPending = false; return { exitCode: 0, stdout: JSON.stringify(result) };
    }
    assert.equal(commandArguments[1], 'status'); polls++;
    if (polls === 2) pending.resolve();
    return { exitCode: 0, stdout: JSON.stringify({ available: true, tasks: [{ jobId: 'one', state: polls === 1 ? 'queued' : 'running',
      attempt: 1, lastActivityAt: null, lastActivityKind: null, lastActivityAgeMs: null, code: null }] }) };
  } };
  const answer = await run({ task: 'inspect', jobs: [{ id: 'one', worker, task: 'inspect' }] }, world, () => {},
    value => reports.push({ value, executionPending }), () => { throw new Error('planner not required'); });
  assert.equal(answer.ok, true);
  assert.ok(reports.some(entry => entry.value.executionStatus && entry.executionPending));
  assert.equal(reports.find(entry => entry.value.workflowId).value.workflowId, runId);
  assert.equal(reports.at(-1).value.response, 'done');
});

test('saved workflow bounds native calls and reports for all 32 jobs', async () => {
  const source = await readFile('.zcode/workflows/model-bridge.dwf.ts', 'utf8');
  const script = stripTypeScriptTypes(`async function scenario(args, world, phase, report, agent) {\n${source}\n}`, { mode: 'strip' });
  const run = new Function(`${script}\nreturn scenario;`)();
  const selected = await preset(), worker = Object.keys(selected.preset.workers)[0], pending = gate();
  const jobs = Array.from({ length: 32 }, (_, index) => ({ id: `job-${index}`, worker, task: 'inspect' }));
  let polls = 0, calls = 0, reports = 0, phases = 0;
  const world = { async run(_command, commandArguments, options) {
    calls++;
    if (commandArguments[0] === '-e') return { exitCode: 0, stdout: randomUUID() };
    if (commandArguments[1] === 'presets') return { exitCode: 0, stdout: JSON.stringify({ defaultPreset: selected.name, presets: { [selected.name]: selected.preset } }) };
    if (commandArguments[1] === 'workflow') {
      await pending.promise;
      return { exitCode: 0, stdout: JSON.stringify({ ok: true, preset: selected.name, parallelLimit: 1, peakParallel: 1,
        fallbackEnabled: false, logs: 'synthetic', jobs: jobs.map(job => ({ ...job, ok: true, actualModel: 'synthetic',
          response: 'done', responseTruncated: false, fallbackUsed: false })) }) };
    }
    polls++;
    assert.ok(commandArguments.includes('--wait-ms=10000')); assert.equal(options.timeoutMs, 15000);
    if (polls === 60) pending.resolve();
    return { exitCode: 0, stdout: JSON.stringify({ available: true,
      tasks: jobs.map(job => ({ jobId: job.id, state: polls % 2 ? 'starting' : 'running', attempt: 1,
        lastActivityAt: null, lastActivityKind: null, lastActivityAgeMs: null, code: null })) }) };
  } };
  await run({ task: 'inspect', jobs }, world, () => { phases++; }, () => { reports++; }, () => {});
  assert.equal(polls, 60); assert.ok(calls + reports + phases < 256);
});
