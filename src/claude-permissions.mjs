import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BridgeError } from './profiles.mjs';

const READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);
const WRITE_TOOLS = new Set(['Write', 'Edit']);
const KNOWN_TOOLS = new Set([...READ_TOOLS, ...WRITE_TOOLS, 'Bash']);
const EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const claudeEffortLevels = [...EFFORT_LEVELS];

export function newSessionId() {
  return randomUUID();
}

export function normalizeClaudeEffort(effort) {
  if (effort === undefined || effort === null) return null;
  if (!EFFORT_LEVELS.has(effort)) {
    throw new BridgeError('INVALID_EFFORT', 'Effort must be low, medium, high, xhigh, or max.');
  }
  return effort;
}

function parseToolRule(rule) {
  const opening = rule.indexOf('(');
  if (opening === -1) return { base: rule, argument: null };
  const base = rule.slice(0, opening);
  if (!rule.endsWith(')') || rule.indexOf(')', opening) !== rule.length - 1) {
    throw new BridgeError('INVALID_TOOL_RULE', 'Tool rules must have one parenthesized scope.');
  }
  const argument = rule.slice(opening + 1, -1);
  if (!argument.trim()) throw new BridgeError('INVALID_TOOL_RULE', 'Scoped tool rules require a concrete scope.');
  return { base, argument };
}

function patternRoot(scope, workspace) {
  const wildcard = scope.search(/[*?{]/);
  const prefix = wildcard === -1 ? scope : scope.slice(0, wildcard);
  return path.resolve(workspace, prefix || '.');
}

function rejectUnsafePathScope(scope) {
  const wildcard = scope.search(/[*?{]/);
  const prefix = wildcard === -1 ? scope : scope.slice(0, wildcard);
  if (prefix.includes('~') || path.isAbsolute(prefix) || /^[A-Za-z]:/.test(prefix)) {
    throw new BridgeError('WRITE_SCOPE_OUTSIDE_CWD',
      'Writable scopes cannot use tilde or absolute paths; use a relative path inside cwd.');
  }
  if (prefix.split(/[\\/]+/).includes('..')) {
    throw new BridgeError('WRITE_SCOPE_OUTSIDE_CWD', 'Writable scopes cannot contain path traversal.');
  }
}

function requireInsideWorkspace(scope, workspace, writeScope) {
  rejectUnsafePathScope(scope);
  const root = patternRoot(scope, workspace);
  const relative = path.relative(workspace, root);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new BridgeError('WRITE_SCOPE_OUTSIDE_CWD', 'Writable paths must stay inside the actual working directory.');
  }
  if (writeScope) {
    const writeRoot = patternRoot(writeScope, workspace);
    const relativeToScope = path.relative(writeRoot, root);
    if (relativeToScope.startsWith('..') || path.isAbsolute(relativeToScope)) {
      throw new BridgeError('INVALID_TOOL_RULE', 'Writable tool scopes must stay inside writeScope.');
    }
  }
}

export function normalizeClaudeExecution(execution, { cwd = process.cwd() } = {}) {
  const input = execution ?? 'read-only';
  const mode = typeof input === 'string' ? input : input?.mode;
  const readMode = mode === 'read-only';
  if (!readMode && mode !== 'workspace-write') {
    throw new BridgeError('INVALID_EXECUTION', 'Execution mode must be read-only or workspace-write.');
  }
  if (typeof input === 'object' && input.mode === undefined) {
    throw new BridgeError('INVALID_EXECUTION', 'Execution mode is required.');
  }

  const requestedTools = typeof input === 'string'
    ? undefined
    : input.tools;
  const requestedScope = typeof input === 'string'
    ? undefined
    : input.writeScope;

  if (requestedTools !== undefined && !Array.isArray(requestedTools)) {
    throw new BridgeError('INVALID_TOOL_RULE', 'Tools must be an array of rule strings.');
  }
  if (readMode && requestedTools !== undefined && (!Array.isArray(requestedTools) || !requestedTools.length)) {
    throw new BridgeError('INVALID_TOOL_RULE', 'Read-only tools must be a non-empty array when supplied.');
  }
  let tools = requestedTools === undefined ? ['Read', 'Glob', 'Grep'] : [...requestedTools];

  if (!readMode) {
    if (typeof requestedScope !== 'string' || !requestedScope.trim()) {
      throw new BridgeError('INVALID_EXECUTION', 'workspace-write requires a concrete writeScope.');
    }
    if (!Array.isArray(tools) || !tools.length) throw new BridgeError('INVALID_EXECUTION', 'workspace-write requires configured tools.');
  }
  if (tools.some(tool => typeof tool !== 'string' || !tool.trim())) {
    throw new BridgeError('INVALID_TOOL_RULE', 'Tool rules must be non-empty strings.');
  }

  const workspace = path.resolve(cwd);
  if (readMode && requestedScope !== undefined) {
    throw new BridgeError('INVALID_EXECUTION', 'Read-only execution cannot have writeScope.');
  }
  const writeScope = readMode ? null : requestedScope;
  if (!readMode) requireInsideWorkspace(requestedScope, workspace);

  const parsed = tools.map(rule => ({ rule, ...parseToolRule(rule) }));
  if (parsed.some(({ base }) => !KNOWN_TOOLS.has(base))) {
    throw new BridgeError('UNSUPPORTED_TOOL', 'Claude execution supports Read, Glob, Grep, Write, Edit, and scoped Bash.');
  }
  if (parsed.some(({ base, argument }) => (WRITE_TOOLS.has(base) || base === 'Bash') && argument === null)) {
    throw new BridgeError('INVALID_TOOL_RULE', 'Write, Edit, and Bash require a concrete scope; bare shell is not allowed.');
  }
  if (readMode && parsed.some(({ base }) => WRITE_TOOLS.has(base) || base === 'Bash')) {
    throw new BridgeError('INVALID_TOOL_RULE', 'Read-only execution cannot expose write or shell tools.');
  }
  if (parsed.some(({ rule }) => rule.includes(','))) {
    throw new BridgeError('INVALID_TOOL_RULE', 'Tool rule scopes cannot contain commas; configure each rule separately.');
  }

  if (!readMode) {
    for (const item of parsed) {
      if (WRITE_TOOLS.has(item.base)) {
        requireInsideWorkspace(item.argument, workspace, requestedScope);
      }
    }
  }

  const uniqueRules = [...new Set(tools)];
  const toolNames = [...new Set(parsed.map(item => item.base))].sort();
  return { mode, writeScope, tools: uniqueRules, toolNames, effort: normalizeClaudeEffort(typeof input === 'string' ? undefined : input.effort) };
}
