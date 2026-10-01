import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaudeAudit, reportedModelMatches } from '../src/claude-audit.mjs';
import { claudeRuntime, runClaude } from '../src/claude.mjs';
import { claudeEffortLevels, normalizeClaudeEffort, normalizeClaudeExecution, newSessionId } from '../src/claude-permissions.mjs';

const model = 'claude-opus-5-5';
const init = { type: 'system', subtype: 'init', session_id: 'session', model };
const assistant = { type: 'assistant', session_id: 'session', message: { content: [{ type: 'text', text: 'DONE' }] } };
const terminal = { type: 'result', subtype: 'success', session_id: 'session', is_error: false, result: 'DONE' };
function evaluate(events, execution = { exitCode: 0, reason: null }, options = {}) {
  const audit = createClaudeAudit(model, options);
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

test('Claude rejects unauthorized tool use and error results', () => {
  const writeTool = { type: 'assistant', session_id: 'session', message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] } };
  assert.equal(evaluate([init, writeTool, terminal]).code, 'CLAUDE_UNAUTHORIZED_TOOL');
  assert.equal(evaluate([init, writeTool, terminal], undefined, { toolNames: ['Bash'] }).toolsUsed.includes('Bash'), true);
  assert.equal(evaluate([init, { ...terminal, is_error: true }]).code, 'CLAUDE_RESULT_FAILED');
  assert.equal(evaluate([init, { ...terminal, api_error_status: 500 }]).code, 'CLAUDE_RESULT_FAILED');
  assert.equal(evaluate([init, { type: 'error', error: {} }]).code, 'CLAUDE_REPORTED_ERROR');
});

test('Claude rejects configured permission denials instead of reporting verified success', () => {
  const denial = 'Edit(./src/example.js)';
  const denied = { ...terminal, permission_denials: [denial] };
  const result = evaluate([init, denied]);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CLAUDE_PERMISSION_DENIED');
  assert.equal(result.permissionDenied, true);
  assert.deepEqual(result.permissionDenials, [denial]);
});

test('Claude retains workspace-write denials as evidence on a completed terminal result', () => {
  const denial = { tool: 'Edit', input: { file_path: './src/example.js' } };
  const denied = { ...terminal, permission_denials: [denial] };
  const result = evaluate([init, denied], { exitCode: 0, reason: null },
    { expectedSessionId: 'session', mode: 'workspace-write', toolNames: ['Edit'] });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'VERIFIED_WITH_PERMISSION_DENIALS');
  assert.equal(result.permissionDenied, true);
  assert.deepEqual(result.permissionDenials, [denial]);
  assert.equal(result.response, 'DONE');
  assert.equal(evaluate([init, denied], { exitCode: 1, reason: null },
    { expectedSessionId: 'session', mode: 'workspace-write', toolNames: ['Edit'] }).code, 'CLAUDE_CLI_FAILED');
});

test('Claude validates requested session and effort evidence', () => {
  const sessionId = '01999c3e-8f17-7212-9cbf-fef2fd6995f7';
  assert.equal(evaluate([{ ...init, session_id: 'other' }], undefined, { expectedSessionId: sessionId }).code,
    'CLAUDE_SESSION_MISMATCH');
  assert.equal(evaluate([], undefined, { expectedSessionId: sessionId }).code,
    'CLAUDE_SESSION_UNVERIFIED');
  assert.equal(evaluate([init, terminal], undefined, { expectedSessionId: 'session', effort: 'xhigh' }).actualEffort, null);
  assert.equal(evaluate([init, terminal], undefined, { expectedSessionId: 'session', effort: 'xhigh' }).effortEvidence,
    'not-reported-by-claude-init');
  assert.equal(evaluate([{ ...init, effort: 'high' }, terminal], undefined,
    { expectedSessionId: 'session', effort: 'xhigh' }).code, 'CLAUDE_EFFORT_MISMATCH');
});

test('Claude normalizes read-only and concrete write policies', () => {
  const cwd = process.cwd();
  assert.deepEqual(normalizeClaudeExecution(undefined, { cwd }), {
    mode: 'read-only', writeScope: null, tools: ['Read', 'Glob', 'Grep'], toolNames: ['Glob', 'Grep', 'Read'], effort: null });
  const tools = ['Read', 'Glob', 'Grep', 'Edit(./**)', 'Write(./**)', 'Bash(npm test*)'];
  assert.deepEqual(normalizeClaudeExecution({ mode: 'workspace-write', writeScope: './**', tools }, { cwd }),
    { mode: 'workspace-write', writeScope: './**', tools, toolNames: ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'], effort: null });
  assert.deepEqual(normalizeClaudeEffort('xhigh'), 'xhigh');
  assert.deepEqual(claudeEffortLevels, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.match(newSessionId(), /^[0-9a-f-]{36}$/);
});

test('Claude rejects unsafe policies, effort, and writable paths outside cwd', () => {
  const write = { mode: 'workspace-write', writeScope: './**', tools: ['Edit(./**)'] };
  assert.throws(() => normalizeClaudeExecution('workspace-write'), { code: 'INVALID_EXECUTION' });
  assert.throws(() => normalizeClaudeExecution({ ...write, writeScope: undefined }), { code: 'INVALID_EXECUTION' });
  assert.throws(() => normalizeClaudeExecution({ ...write, tools: ['Bash'] }), { code: 'INVALID_TOOL_RULE' });
  assert.throws(() => normalizeClaudeExecution({ ...write, tools: ['Write'] }), { code: 'INVALID_TOOL_RULE' });
  assert.throws(() => normalizeClaudeExecution({ ...write, tools: ['WebFetch'] }), { code: 'UNSUPPORTED_TOOL' });
  assert.throws(() => normalizeClaudeExecution({ ...write, tools: ['Edit(../outside/**)'] }), { code: 'WRITE_SCOPE_OUTSIDE_CWD' });
  for (const scope of ['~/**', '../outside/**', '/outside/**', 'C:\\outside/**']) {
    assert.throws(() => normalizeClaudeExecution({ ...write, writeScope: scope }), { code: 'WRITE_SCOPE_OUTSIDE_CWD' });
    assert.throws(() => normalizeClaudeExecution({ ...write, tools: [`Edit(${scope})`] }),
      { code: 'WRITE_SCOPE_OUTSIDE_CWD' });
  }
  assert.throws(() => normalizeClaudeEffort('ultra'), { code: 'INVALID_EFFORT' });
});

test('runClaude passes normalized policy, effort, and native session arguments to the CLI', async () => {
  const calls = [];
  const sessionId = newSessionId();
  const runProcessImpl = async options => {
    calls.push(options);
    options.onLine(JSON.stringify({ ...init, session_id: sessionId, effort: 'xhigh' }));
    options.onLine(JSON.stringify({ ...terminal, session_id: sessionId }));
    return { exitCode: 0, reason: null, cleanup: { status: 'terminated' } };
  };
  const result = await runClaude({ cwd: process.cwd(), task: 'Inspect the policy arguments.', model,
    effort: 'xhigh', session: { id: sessionId, resume: true },
    execution: { mode: 'workspace-write', writeScope: './**', tools: [
      'Read', 'Glob', 'Grep', 'Edit(./**)', 'Write(./**)', 'Bash(npm *)', 'Bash(git status*)'
    ] }, runProcessImpl });
  assert.equal(result.ok, true);
  assert.equal(result.sessionId, sessionId);
  assert.equal(result.requestedEffort, 'xhigh');
  assert.equal(result.toolPolicy.toolNames.join(','), 'Bash,Edit,Glob,Grep,Read,Write');
  assert.equal(result.toolPolicy.effort, 'xhigh');
  const args = calls[0].args;
  const effortAt = args.indexOf('--effort');
  const resumeAt = args.indexOf('--resume');
  assert.equal(args[args.indexOf('--tools') + 1], 'Bash,Edit,Glob,Grep,Read,Write');
  assert.deepEqual(args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--append-system-prompt')),
    ['Read', 'Glob', 'Grep', 'Edit(./**)', 'Edit(./**)', 'Bash(npm *)', 'Bash(git status*)']);
  assert.equal(args[effortAt + 1], 'xhigh');
  assert.equal(args[resumeAt + 1], sessionId);
  assert.equal(args.includes('--session-id'), false);
  assert.equal(args.includes('--fork-session'), false);
  assert.equal(args.includes('--dangerously-skip-permissions'), false);
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

test('runClaude tracks native spawn state through onSpawn and pre-process errors', async () => {
  const validationError = await runClaude({ cwd: '.', task: 'x', model: 'auto' }).catch(error => error);
  assert.equal(validationError.code, 'CLAUDE_MODEL_REQUIRED');
  assert.equal(validationError.nativeStarted, false);

  const spawnCalls = [];
  const spawnError = new Error('native launch failed');
  await assert.rejects(runClaude({
    cwd: process.cwd(), task: 'Inspect spawn evidence.', model,
    onSpawn: details => spawnCalls.push(details),
    runProcessImpl: async options => {
      options.onSpawn({ pid: 4219, startedAt: 123, command: 'claude', cwd: process.cwd() });
      throw spawnError;
    },
  }), error => {
    assert.equal(error, spawnError);
    assert.equal(error.nativeStarted, true);
    return true;
  });
  assert.deepEqual(spawnCalls, [{ pid: 4219, startedAt: 123, command: 'claude', cwd: process.cwd() }]);

  const result = await runClaude({
    cwd: process.cwd(), task: 'Preflight fails before spawn.', model,
    runProcessImpl: async () => ({ exitCode: null, reason: 'spawn_failed', cleanup: null }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.nativeStarted, false);
  assert.equal(result.execution.nativeStarted, false);
});

test('claudeRuntime rejects npm launcher shims Node cannot spawn', async () => {
  await assert.rejects(claudeRuntime('C:\\fake\\claude.cmd'), { code: 'CLAUDE_RUNTIME_INVALID' });
});
