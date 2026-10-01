import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexAudit } from '../src/codex-audit.mjs';
import { codexRuntime, runCodex } from '../src/codex.mjs';

const model = 'gpt-6.1-sol';
const thread = { type: 'thread.started', thread_id: 'thread' };
const message = { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'DONE' } };
const turn = { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
const verified = { sessionConfirmed: true, reportedModel: model };
function evaluate(events, execution = { exitCode: 0, reason: null }, rollout = verified) {
  const audit = createCodexAudit(model);
  for (const event of events) { try { audit.ingest(typeof event === 'string' ? event : JSON.stringify(event)); } catch {} }
  return audit.finish(execution, rollout);
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

test('Codex rejects relay-forbidden tool work and error events', () => {
  const shell = { type: 'item.completed', item: { type: 'command_execution', command: 'dir' } };
  const edit = { type: 'item.completed', item: { type: 'file_change', changes: [] } };
  const mcp = { type: 'item.completed', item: { type: 'mcp_tool_call', server: 'x' } };
  assert.equal(evaluate([thread, shell, message, turn]).code, 'CODEX_UNEXPECTED_TOOL');
  assert.equal(evaluate([thread, edit, message, turn]).code, 'CODEX_UNEXPECTED_TOOL');
  assert.equal(evaluate([thread, mcp, message, turn]).code, 'CODEX_UNEXPECTED_TOOL');
  assert.equal(evaluate([{ type: 'error', message: 'boom' }]).code, 'CODEX_REPORTED_ERROR');
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
  await assert.rejects(runCodex({ cwd: '.', task: 'x'.repeat(32769), model }), { code: 'INVALID_TASK' });
  await assert.rejects(runCodex({ cwd: '.', task: 'x', model, timeoutMs: 50 }), { code: 'INVALID_TIMEOUT' });
  await assert.rejects(runCodex({ cwd: '.', task: 'x', model, timeoutMs: 700000 }), { code: 'INVALID_TIMEOUT' });
});

test('codexRuntime rejects npm launcher shims Node cannot spawn', async () => {
  await assert.rejects(codexRuntime('C:\\fake\\codex.cmd'), { code: 'CODEX_RUNTIME_INVALID' });
});
