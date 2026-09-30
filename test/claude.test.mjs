import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaudeAudit, reportedModelMatches } from '../src/claude-audit.mjs';
import { claudeRuntime, runClaude } from '../src/claude.mjs';

const model = 'claude-opus-5-5';
const init = { type: 'system', subtype: 'init', session_id: 'session', model };
const assistant = { type: 'assistant', session_id: 'session', message: { content: [{ type: 'text', text: 'DONE' }] } };
const terminal = { type: 'result', subtype: 'success', session_id: 'session', is_error: false, result: 'DONE' };
function evaluate(events, execution = { exitCode: 0, reason: null }) {
  const audit = createClaudeAudit(model);
  for (const event of events) { try { audit.ingest(typeof event === 'string' ? event : JSON.stringify(event)); } catch {} }
  return audit.finish(execution);
}

test('Claude requires native session/model evidence and terminal success', () => {
  const result = evaluate([init, assistant, terminal]);
  assert.equal(result.ok, true); assert.equal(result.actualModel, 'claude/claude-opus-5-5');
  assert.equal(result.modelEvidence, 'claude-system-init'); assert.equal(result.response, 'DONE');
  assert.equal(result.finalResponse, 'DONE');
  assert.equal(evaluate([init]).code, 'CLAUDE_RESULT_UNVERIFIED');
  assert.equal(evaluate([assistant, terminal]).ok, false);
});

test('Claude rejects model fallback but tolerates bracketed variants', () => {
  assert.equal(reportedModelMatches(model, 'claude-opus-5-5'), true);
  assert.equal(reportedModelMatches(model, 'claude-opus-5-5[1m]'), true);
  assert.equal(reportedModelMatches(model, 'claude-sonnet-5-5'), false);
  assert.equal(evaluate([{ ...init, model: 'claude-sonnet-5-5' }, terminal]).code, 'CLAUDE_MODEL_MISMATCH');
});

test('Claude rejects another session, duplicate initialization, and extra terminal data', () => {
  assert.equal(evaluate([init, { ...terminal, session_id: 'other' }]).code, 'CLAUDE_SESSION_MISMATCH');
  assert.equal(evaluate([init, init, terminal]).code, 'CLAUDE_DUPLICATE_INIT');
  assert.equal(evaluate([init, terminal, terminal]).code, 'CLAUDE_EVENT_AFTER_RESULT');
});

test('Claude rejects relay-forbidden tool use and error results', () => {
  const writeTool = { type: 'assistant', session_id: 'session', message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] } };
  assert.equal(evaluate([init, writeTool, terminal]).code, 'CLAUDE_UNEXPECTED_WRITE_TOOL');
  assert.equal(evaluate([init, { ...terminal, is_error: true }]).code, 'CLAUDE_RESULT_FAILED');
  assert.equal(evaluate([init, { ...terminal, api_error_status: 500 }]).code, 'CLAUDE_RESULT_FAILED');
  assert.equal(evaluate([init, { type: 'error', error: {} }]).code, 'CLAUDE_REPORTED_ERROR');
});

test('Claude reports CLI failure and malformed events', () => {
  assert.equal(evaluate([init, terminal], { exitCode: 1, reason: null }).code, 'CLAUDE_CLI_FAILED');
  assert.equal(evaluate([init, terminal], { exitCode: null, reason: 'timeout' }).code, 'TIMEOUT');
  assert.equal(evaluate([init, 'not json', terminal]).code, 'CLAUDE_INVALID_EVENT');
});

test('runClaude validates model, task, and timeout before touching the runtime', async () => {
  await assert.rejects(runClaude({ cwd: '.', task: 'x', model: 'auto' }), { code: 'CLAUDE_MODEL_REQUIRED' });
  await assert.rejects(runClaude({ cwd: '.', task: '', model }), { code: 'INVALID_TASK' });
  await assert.rejects(runClaude({ cwd: '.', task: 'x'.repeat(32769), model }), { code: 'INVALID_TASK' });
  await assert.rejects(runClaude({ cwd: '.', task: 'x', model, timeoutMs: 50 }), { code: 'INVALID_TIMEOUT' });
  await assert.rejects(runClaude({ cwd: '.', task: 'x', model, timeoutMs: 700000 }), { code: 'INVALID_TIMEOUT' });
});

test('claudeRuntime rejects npm launcher shims Node cannot spawn', async () => {
  await assert.rejects(claudeRuntime('C:\\fake\\claude.cmd'), { code: 'CLAUDE_RUNTIME_INVALID' });
});
