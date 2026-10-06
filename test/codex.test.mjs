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
  await writeFile(path.join(workspace, 'mcp'), "console.log('[]');\n");
  await writeFile(path.join(workspace, 'exec'), `
let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',text=>{prompt+=text;});
process.stdin.on('end',()=>{
  const emit=value=>console.log(JSON.stringify(value));
  emit({type:'thread.started',thread_id:'fake-thread'});emit({type:'turn.started'});
  emit({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({args:process.argv.slice(2),prompt})}});
  emit({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}});
});
`);
  // Node stands in for the native app-server. The fixture uses the observed RPC
  // lifecycle and emits real deltas before its terminal item.
  await writeFile(path.join(workspace, 'app-server'), `
const readline = require('node:readline');
const args = process.argv.slice(2);
const event = value => process.stdout.write(JSON.stringify(value) + '\\n');
const notify = (method, params) => event({method, params});
readline.createInterface({input: process.stdin}).on('line', line => {
  const request = JSON.parse(line);
  if(request.method === 'initialize') event({id:request.id,result:{userAgent:'fixture'}});
  if(request.method === 'thread/start') event({id:request.id,result:{thread:{id:'fake-thread'},
    model:'${model}',reasoningEffort:'high',cwd:process.cwd(),sandbox:{type:'readOnly'},approvalPolicy:'never'}});
  if(request.method === 'turn/start') {
    const ids={threadId:'fake-thread',turnId:'turn'};
    event({id:request.id,result:{turn:{id:'turn',status:'inProgress',items:[]}}});
    notify('turn/started',{threadId:'fake-thread',turn:{id:'turn',status:'inProgress',items:[]}});
    if (${reconnect}) notify('error',{...ids,willRetry:true,error:{message:'Server overloaded',codexErrorInfo:'serverOverloaded'}});
    const text=JSON.stringify({args,prompt:request.params.input[0].text,effort:request.params.effort});
    notify('item/started',{...ids,item:{id:'answer',type:'agentMessage',text:''}});
    notify('item/agentMessage/delta',{...ids,itemId:'answer',delta:text.slice(0,10)});
    notify('item/agentMessage/delta',{...ids,itemId:'answer',delta:text.slice(10)});
    notify('item/completed',{...ids,item:{id:'answer',type:'agentMessage',text}});
    notify('turn/completed',{threadId:'fake-thread',turn:{id:'turn',status:'completed',items:[]}});
  }
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

test('Codex identifies upstream content rejection without accepting or exposing the failed answer', () => {
  const rejected = { type: 'item.completed', item: { type: 'error',
    message: 'unexpected status 502 Bad Gateway: This content was flagged for possible policy violations. PRIVATE_ERROR_BODY' } };
  const result = evaluate([thread, rejected, message, turn]);
  assert.equal(result.ok, false); assert.equal(result.code, 'CODEX_CONTENT_REJECTED');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ERROR_BODY|DONE/);
  assert.equal(evaluate([thread, { type: 'error', message: rejected.item.message }]).code, 'CODEX_CONTENT_REJECTED');
  assert.equal(evaluate([thread, { ...message, item: { ...message.item, text: rejected.item.message } }, turn]).ok, true);
  assert.equal(evaluate([thread, { ...rejected, item: { ...rejected.item, message: 'unexpected status 502 Bad Gateway: overloaded' } }]).code,
    'CODEX_REPORTED_ERROR');
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

test('runCodex validates catalog effort and forwards exact RPC input with incremental text', async () => {
  const { home, workspace, runtime } = await codexFixture();
  await withCodexHome(home, async () => {
    await assert.rejects(runCodex({ cwd: workspace, task: 'test', model, effort: 'FAST' }),
      { code: 'CODEX_EFFORT_INVALID' });
    await assert.rejects(runCodex({ cwd: workspace, task: 'test', model, effort: 'ultra' }),
      { code: 'CODEX_EFFORT_UNAVAILABLE' });
    const task = 'x'.repeat(32769);
    const partials = [];
    const requested = await runCodex({ cwd: workspace, task, model, effort: 'high', timeoutMs: 1000, codexBin: runtime,
      onPartial: text => partials.push(text) });
    assert.equal(requested.ok, true);
    assert.equal(requested.code, 'VERIFIED');
    assert.equal(requested.actualEffort, 'high');
    const events = (await readFile(path.join(requested.logs, 'events.jsonl'), 'utf8')).trim()
      .split('\n').map(line => JSON.parse(line));
    const evidence = JSON.parse(events.find(event => event.method === 'item/completed').params.item.text);
    const args = evidence.args;
    assert.equal(args.includes('--stdio'), true);
    assert.equal(args.includes(task), false);
    assert.equal(evidence.prompt, task);
    assert.equal(evidence.effort, 'high');
    assert.equal(partials.length, 2); assert.equal(partials.join(''), requested.response);
    assert.ok(args.includes('features.shell_tool=false')); assert.ok(args.includes('features.plugins=false'));
    assert.equal(JSON.parse(await readFile(path.join(requested.logs, 'request.json'), 'utf8')).requestedEffort, 'high');

    const defaulted = await runCodex({ cwd: workspace, task: 'test', model, timeoutMs: 1000, codexBin: runtime });
    assert.equal(defaulted.ok, true);
    assert.equal(defaulted.actualEffort, 'high');
    const defaultEvents = (await readFile(path.join(defaulted.logs, 'events.jsonl'), 'utf8')).trim()
      .split('\n').map(line => JSON.parse(line));
    const defaultEvidence = JSON.parse(defaultEvents.find(event => event.method === 'item/completed').params.item.text);
    assert.equal(defaultEvidence.effort, undefined);
    assert.equal(JSON.parse(await readFile(path.join(defaulted.logs, 'request.json'), 'utf8')).requestedEffort, null);
  });
});

test('codexRuntime rejects npm launcher shims Node cannot spawn', async () => {
  await assert.rejects(codexRuntime('C:\\fake\\codex.cmd'), { code: 'CODEX_RUNTIME_INVALID' });
});

test('only explicit image execution retains the native exec transport without weakening relay isolation', async () => {
  const { home, workspace, runtime } = await codexFixture();
  await withCodexHome(home, async () => {
    const image = await runCodex({ cwd: workspace, task: 'native image contract', model, effort: 'high',
      purpose: 'image', timeoutMs: 1000, codexBin: runtime });
    assert.equal(image.ok, true); assert.equal(image.actualEffort, 'high');
    const native = JSON.parse(image.response);
    assert.equal(native.prompt, 'native image contract'); assert.ok(native.args.includes('--json'));
    assert.ok(native.args.includes('mcp_servers={}')); assert.equal(native.args.includes('--stdio'), false);
    assert.equal(native.args.includes('features.shell_tool=false'), false);
    const relay = await runCodex({ cwd: workspace, task: 'text relay', model, effort: 'high', timeoutMs: 1000, codexBin: runtime });
    assert.equal(relay.ok, true); assert.ok(JSON.parse(relay.response).args.includes('features.shell_tool=false'));
    await assert.rejects(runCodex({ cwd: workspace, task: 'image', model, purpose: 'image', onPartial: () => {} }),
      { code: 'INVALID_CODEX_PURPOSE' });
    await assert.rejects(runCodex({ cwd: workspace, task: 'image', model, purpose: 'other' }), { code: 'INVALID_CODEX_PURPOSE' });
  });
});
