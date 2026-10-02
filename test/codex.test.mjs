import test from 'node:test';
import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCodexAudit } from '../src/codex-audit.mjs';
import { codexRuntime, runCodex } from '../src/codex.mjs';

const model = 'gpt-6.1-sol';
const thread = { type: 'thread.started', thread_id: 'thread' };
const message = { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'DONE' } };
const turn = { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
const verified = { sessionConfirmed: true, reportedModel: model };
function evaluate(events, execution = { exitCode: 0, reason: null }, rollout = verified, requestedEffort = null) {
  const audit = createCodexAudit(model, requestedEffort);
  for (const event of events) { try { audit.ingest(typeof event === 'string' ? event : JSON.stringify(event)); } catch {} }
  return audit.finish(execution, rollout);
}

async function codexFixture({ reconnect = false } = {}) {
  const home = await mkdtemp(path.join(tmpdir(), 'agent-bridge-codex-home-'));
  const workspace = await mkdtemp(path.join(tmpdir(), 'agent-bridge-codex-run-'));
  await writeFile(path.join(home, 'models_cache.json'), JSON.stringify({
    models: [{ slug: model, display_name: 'GPT Test', visibility: 'list',
      default_reasoning_level: 'medium',
      description: 'Test model.',
      supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }] }],
  }));
  const runtime = path.join(home, process.platform === 'win32' ? 'codex.exe' : 'codex');
  try { await link(process.execPath, runtime); } catch { await writeFile(runtime, await readFile(process.execPath)); }
  const sessions = path.join(home, 'sessions', '2026', '10', '01');
  await mkdir(sessions, { recursive: true });
  await writeFile(path.join(sessions, 'rollout-test-fake-thread.jsonl'), [
    JSON.stringify({ type: 'session_meta', payload: { session_id: 'fake-thread' } }),
    JSON.stringify({ type: 'turn_context', payload: { model, effort: 'high' } }),
  ].join('\n') + '\n');
  // The fake native runtime is Node itself. It finds this extensionless `exec`
  // script, consumes stdin, and reports both argument vector and prompt evidence.
  await writeFile(path.join(workspace, 'exec'), `
const args = process.argv.slice(2);
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { prompt += chunk; });
process.stdin.on('end', () => {
  const event = value => process.stdout.write(JSON.stringify(value) + '\\n');
  event({ type: 'thread.started', thread_id: 'fake-thread' });
  if (${reconnect}) event({ type: 'error', message: 'Reconnecting... 2/5 (unexpected status 502 Bad Gateway: Our servers are currently overloaded. Please try again later.)' });
  event({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ args, prompt }) } });
  event({ type: 'turn.completed', usage: {} });
});
`);
  return { home, workspace, runtime };
}

async function withCodexHome(home, operation) {
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = home;
  try { return await operation(); }
  finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
  }
}

test('Codex requires thread/turn evidence, rollout confirmation and a final message', () => {
  const result = evaluate([thread, { type: 'turn.started' }, message, turn]);
  assert.equal(result.ok, true); assert.equal(result.actualModel, 'codex/gpt-6.1-sol');
  assert.equal(result.modelEvidence, 'codex-rollout-turn-context'); assert.equal(result.response, 'DONE');
  assert.equal(evaluate([thread, turn]).code, 'CODEX_RESULT_UNVERIFIED');
  assert.equal(evaluate([message, turn]).code, 'CODEX_THREAD_MISSING');
});

test('Codex rejects a rollout that reports another model or cannot be found', () => {
  assert.equal(evaluate([thread, message, turn], undefined, { sessionConfirmed: true, reportedModel: 'gpt-6-astra' }).code, 'CODEX_MODEL_MISMATCH');
  assert.equal(evaluate([thread, message, turn], undefined, { sessionConfirmed: false, reportedModel: undefined }).code, 'CODEX_SESSION_UNVERIFIED');
});

test('Codex verifies requested rollout effort and preserves an observed default', () => {
  const effort = { sessionConfirmed: true, reportedModel: model, reportedEffort: 'high' };
  assert.equal(evaluate([thread, message, turn], undefined, effort, 'high').actualEffort, 'high');
  assert.equal(evaluate([thread, message, turn], undefined,
    { ...effort, reportedEffort: 'low' }, 'high').code, 'CODEX_EFFORT_MISMATCH');
  assert.equal(evaluate([thread, message, turn], undefined,
    { sessionConfirmed: true, reportedModel: model }, 'high').code, 'CODEX_EFFORT_UNVERIFIED');
  assert.equal(evaluate([thread, message, turn], undefined, effort).actualEffort, 'high');
});

test('Codex rejects relay-forbidden tool work and error events', () => {
  const shell = { type: 'item.completed', item: { type: 'command_execution', command: 'dir' } };
  const edit = { type: 'item.completed', item: { type: 'file_change', changes: [] } };
  const mcp = { type: 'item.completed', item: { type: 'mcp_tool_call', server: 'x' } };
  assert.equal(evaluate([thread, shell, message, turn]).code, 'CODEX_UNEXPECTED_TOOL');
  assert.equal(evaluate([thread, edit, message, turn]).code, 'CODEX_UNEXPECTED_TOOL');
  assert.equal(evaluate([thread, mcp, message, turn]).code, 'CODEX_UNEXPECTED_TOOL');
  assert.equal(evaluate([{ type: 'error', message: 'boom' }]).code, 'CODEX_REPORTED_ERROR');
  assert.equal(evaluate([thread, { type: 'item.completed', item: { type: 'error', message: 'Request failed.' } }, message, turn]).code,
    'CODEX_REPORTED_ERROR');
});

test('Codex keeps a skill-budget notice and still requires a verified completed turn', () => {
  const notice = { type: 'item.completed', item: { id: 'item_0', type: 'error',
    message: 'Exceeded skills context budget. All skill descriptions were removed and 1 additional skill was not included in the model-visible skills list.' } };
  const completed = evaluate([thread, notice, message, turn]);
  assert.equal(completed.ok, true);
  assert.deepEqual(completed.warnings, [{ code: 'CODEX_SKILLS_CONTEXT_BUDGET', message: notice.item.message }]);
  assert.equal(evaluate([thread, notice, message]).code, 'CODEX_RESULT_UNVERIFIED');
  assert.equal(evaluate([thread, notice, message, turn], { exitCode: 1, reason: null }).code, 'CODEX_CLI_FAILED');
  assert.equal(evaluate([thread, notice, message, turn], undefined, { sessionConfirmed: false }).code, 'CODEX_SESSION_UNVERIFIED');
});

test('Codex metadata fallback notice does not change the verified model contract', () => {
  const notice = { type: 'item.completed', item: { type: 'error',
    message: `Model metadata for \`${model}\` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.` } };
  const result = evaluate([thread, notice, message, turn]);
  assert.equal(result.ok, true);
  assert.equal(result.actualModel, `codex/${model}`);
  assert.equal(result.warnings[0].code, 'CODEX_MODEL_METADATA_FALLBACK');
  assert.equal(evaluate([thread, notice, message, turn], undefined,
    { sessionConfirmed: true, reportedModel: 'gpt-6-luna' }).code, 'CODEX_MODEL_MISMATCH');
  const unrelated = { ...notice, item: { ...notice.item, message: notice.item.message.replace(model, 'gpt-6-luna') } };
  assert.equal(evaluate([thread, unrelated, message, turn]).code, 'CODEX_REPORTED_ERROR');
});

test('Codex lets native reconnects finish but still rejects failed or unverified turns', () => {
  const retry = { type: 'error', message: 'Reconnecting... 2/5 (unexpected status 502 Bad Gateway: Our servers are currently overloaded. Please try again later.)' };
  const result = evaluate([thread, retry, message, turn]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, [{ code: 'CODEX_RECONNECTING', message: retry.message }]);
  assert.equal(evaluate([thread, retry]).code, 'CODEX_RESULT_UNVERIFIED');
  assert.equal(evaluate([thread, retry, message, turn], { exitCode: 1, reason: null }).code, 'CODEX_CLI_FAILED');
  assert.equal(evaluate([thread, retry, { type: 'error', message: 'Exceeded retry limit.' }]).code, 'CODEX_REPORTED_ERROR');
  assert.equal(evaluate([thread, retry, message, turn], undefined, { sessionConfirmed: false }).code, 'CODEX_SESSION_UNVERIFIED');
  assert.equal(evaluate([thread, retry, message, turn], undefined, { sessionConfirmed: true, reportedModel: 'gpt-6-sol' }).code, 'CODEX_MODEL_MISMATCH');
  for (const invalid of ['Reconnecting... 0/5 (failure)', 'Reconnecting... 6/5 (failure)', 'Reconnecting... 2/5', 'Request failed.']) {
    assert.equal(evaluate([thread, { type: 'error', message: invalid }, message, turn]).code, 'CODEX_REPORTED_ERROR');
  }
  assert.equal(evaluate([retry, thread, message, turn]).code, 'CODEX_REPORTED_ERROR');
  assert.equal(evaluate([thread, message, turn, retry]).code, 'CODEX_EVENT_AFTER_TURN');
  assert.equal(evaluate([thread, retry, { type: 'item.completed', item: { type: 'command_execution' } }, message, turn]).code, 'CODEX_UNEXPECTED_TOOL');
});

test('runCodex does not terminate its worker for an in-progress native reconnect', async () => {
  const { home, workspace, runtime } = await codexFixture({ reconnect: true });
  await withCodexHome(home, async () => {
    const result = await runCodex({ cwd: workspace, task: 'Continue after compaction.', model, effort: 'high', timeoutMs: 1000, codexBin: runtime });
    assert.equal(result.ok, true);
    assert.equal(result.execution.exitCode, 0);
    assert.equal(result.execution.reason, null);
    assert.equal(result.actualEffort, 'high');
    assert.equal(result.warnings[0].code, 'CODEX_RECONNECTING');
  });
});

test('Codex rejects duplicate threads, events after the turn, and malformed lines', () => {
  assert.equal(evaluate([thread, thread, message, turn]).code, 'CODEX_DUPLICATE_THREAD');
  assert.equal(evaluate([thread, message, turn, { type: 'turn.started' }]).code, 'CODEX_EVENT_AFTER_TURN');
  assert.equal(evaluate([thread, 'not json', message, turn]).code, 'CODEX_INVALID_EVENT');
});

test('Codex reports CLI failure and timeouts', () => {
  assert.equal(evaluate([thread, message, turn], { exitCode: 1, reason: null }).code, 'CODEX_CLI_FAILED');
  assert.equal(evaluate([thread, message, turn], { exitCode: null, reason: 'timeout' }).code, 'TIMEOUT');
});

test('runCodex validates model, task, and timeout before touching the runtime', async () => {
  await assert.rejects(runCodex({ cwd: '.', task: 'x', model: 'auto' }), { code: 'CODEX_MODEL_REQUIRED' });
  await assert.rejects(runCodex({ cwd: '.', task: '', model }), { code: 'INVALID_TASK' });
  await assert.rejects(runCodex({ cwd: '.', task: 'x'.repeat(4 * 1024 * 1024 + 1), model }), { code: 'INVALID_TASK' });
  await assert.rejects(runCodex({ cwd: '.', task: 'x', model, timeoutMs: 50 }), { code: 'INVALID_TIMEOUT' });
  await assert.rejects(runCodex({ cwd: '.', task: 'x', model, timeoutMs: 700000 }), { code: 'INVALID_TIMEOUT' });
});

test('runCodex validates catalog effort and forwards the exact config override', async () => {
  const { home, workspace, runtime } = await codexFixture();
  await withCodexHome(home, async () => {
    await assert.rejects(runCodex({ cwd: workspace, task: 'test', model, effort: 'FAST' }),
      { code: 'CODEX_EFFORT_INVALID' });
    await assert.rejects(runCodex({ cwd: workspace, task: 'test', model, effort: 'ultra' }),
      { code: 'CODEX_EFFORT_UNAVAILABLE' });
    const task = 'x'.repeat(32769);
    const requested = await runCodex({ cwd: workspace, task, model, effort: 'high', timeoutMs: 1000, codexBin: runtime });
    assert.equal(requested.ok, true);
    assert.equal(requested.code, 'VERIFIED');
    assert.equal(requested.actualEffort, 'high');
    const events = (await readFile(path.join(requested.logs, 'events.jsonl'), 'utf8')).trim()
      .split('\n').map(line => JSON.parse(line));
    const evidence = JSON.parse(events.find(event => event.type === 'item.completed').item.text);
    const args = evidence.args;
    assert.equal(args.at(-1), '-');
    assert.equal(args.includes(task), false);
    assert.equal(evidence.prompt, task);
    const overrideAt = args.indexOf('-c');
    assert.equal(args[overrideAt + 1], 'model_reasoning_effort="high"');
    assert.equal(JSON.parse(await readFile(path.join(requested.logs, 'request.json'), 'utf8')).requestedEffort, 'high');

    const defaulted = await runCodex({ cwd: workspace, task: 'test', model, timeoutMs: 1000, codexBin: runtime });
    assert.equal(defaulted.ok, true);
    assert.equal(defaulted.actualEffort, 'high');
    const defaultEvents = (await readFile(path.join(defaulted.logs, 'events.jsonl'), 'utf8')).trim()
      .split('\n').map(line => JSON.parse(line));
    const defaultArgs = JSON.parse(defaultEvents.find(event => event.type === 'item.completed').item.text).args;
    assert.equal(defaultArgs.includes('model_reasoning_effort="high"'), false);
    assert.equal(JSON.parse(await readFile(path.join(defaulted.logs, 'request.json'), 'utf8')).requestedEffort, null);
  });
});

test('codexRuntime rejects npm launcher shims Node cannot spawn', async () => {
  await assert.rejects(codexRuntime('C:\\fake\\codex.cmd'), { code: 'CODEX_RUNTIME_INVALID' });
});
