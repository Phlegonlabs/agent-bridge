import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeClaudeExecution } from '../src/claude-permissions.mjs';

test('relative write scopes resolve against the supplied workspace', async () => {
  const workspace = await mkdir(path.join(tmpdir(), 'claude-scope-'), { recursive: true });
  try {
    assert.notEqual(path.resolve(workspace), path.resolve(process.cwd()));
    const execution = {
      mode: 'workspace-write',
      writeScope: './**',
      tools: ['Read', 'Glob', 'Grep', 'Edit(./src/**)', 'Write(./docs/**)', 'Bash(npm *)'],
    };
    assert.deepEqual(normalizeClaudeExecution(execution, { cwd: workspace }), {
      mode: 'workspace-write',
      writeScope: './**',
      tools: execution.tools,
      toolNames: ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'],
      effort: null,
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('non-array tools fail with an adapter validation error', () => {
  const execution = {
    mode: 'workspace-write',
    writeScope: './**',
    tools: 'Edit(./**)',
  };
  assert.throws(() => normalizeClaudeExecution(execution), { code: 'INVALID_TOOL_RULE' });
  assert.throws(() => normalizeClaudeExecution({ ...execution, mode: 'read-only', writeScope: undefined }),
    { code: 'INVALID_TOOL_RULE' });
});
