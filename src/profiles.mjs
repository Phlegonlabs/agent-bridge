import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseDocument } from 'yaml';

export class BridgeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const defaultAgentsDirectory = () => path.join(homedir(), '.zcode', 'agents');
const knownKeys = new Set(['name', 'description', 'model', 'thoughtLevel', 'color', 'permissionMode',
  'tools', 'disallowedTools', 'skills', 'injectAgentsMd', 'maxTurns', 'background', 'memory', 'mcpServers']);
const namePattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
export const hash = text => createHash('sha256').update(text).digest('hex');

export function parseProfile(text, source = '') {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!match) throw new BridgeError('INVALID_PROFILE', 'Agent requires Markdown frontmatter.');
  const doc = parseDocument(match[1], { uniqueKeys: true, strict: true });
  if (doc.errors.length) throw new BridgeError('INVALID_PROFILE', 'Invalid or duplicate frontmatter fields.');
  let data;
  try { data = doc.toJS({ maxAliasCount: 0 }); }
  catch { throw new BridgeError('INVALID_PROFILE', 'YAML aliases are not supported.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BridgeError('INVALID_PROFILE', 'Frontmatter must be a mapping.');
  for (const key of Object.keys(data)) if (!knownKeys.has(key)) {
    throw new BridgeError('UNSUPPORTED_PROFILE_FIELD', `Unsupported profile field: ${key}`);
  }
  if (!namePattern.test(data.name ?? '') || typeof data.description !== 'string' || !data.description.trim()) {
    throw new BridgeError('INVALID_PROFILE', 'Agent needs a valid name and description.');
  }
  for (const key of ['model', 'thoughtLevel', 'permissionMode']) {
    if (data[key] !== undefined && typeof data[key] !== 'string') throw new BridgeError('INVALID_PROFILE', `${key} must be a string.`);
  }
  for (const key of ['tools', 'disallowedTools', 'skills', 'mcpServers']) {
    if (data[key] !== undefined && !(typeof data[key] === 'string' ||
      Array.isArray(data[key]) && data[key].every(x => typeof x === 'string'))) {
      throw new BridgeError('INVALID_PROFILE', `${key} must be a string or a list of strings.`);
    }
  }
  if (data.background === true) throw new BridgeError('BACKGROUND_PROFILE', 'The first adapter requires foreground agent profiles.');
  const model = data.model && data.model !== 'inherit' ? data.model : null;
  if (model && (!model.includes('/') || model.startsWith('/') || model.endsWith('/'))) {
    throw new BridgeError('AMBIGUOUS_MODEL', 'Use a provider-qualified model in the native agent profile.');
  }
  return { name: data.name, description: data.description, model, thoughtLevel: data.thoughtLevel ?? null,
    tools: data.tools ?? '*', permissionMode: data.permissionMode ?? null,
    source, sha256: hash(text), fields: data, instructions: match[2].trim() };
}

export async function listProfiles(directory = defaultAgentsDirectory()) {
  const root = await realpath(directory);
  const result = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (!item.name.endsWith('.md') || !item.isFile()) continue;
    const file = path.join(root, item.name);
    if ((await stat(file)).size > 131072) throw new BridgeError('PROFILE_TOO_LARGE', `Profile too large: ${item.name}`);
    const resolved = await realpath(file);
    if (path.dirname(resolved) !== root) throw new BridgeError('PROFILE_PATH', 'Agent file resolves outside its directory.');
    result.push(parseProfile(await readFile(resolved, 'utf8'), resolved));
  }
  const names = new Set();
  for (const item of result) {
    if (names.has(item.name)) throw new BridgeError('DUPLICATE_PROFILE', `Duplicate agent: ${item.name}`);
    names.add(item.name);
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveProfile(name, cwd) {
  if (!namePattern.test(name ?? '')) throw new BridgeError('INVALID_AGENT', 'Invalid agent name.');
  const profiles = await listProfiles();
  const profile = profiles.find(x => x.name === name);
  if (!profile) throw new BridgeError('AGENT_NOT_FOUND', `User agent not found: ${name}`);
  // A project profile with the same name can change native resolution.
  const projectRoot = path.join(cwd, '.zcode', 'agents');
  try {
    const projectProfiles = await listProfiles(projectRoot);
    if (projectProfiles.some(x => x.name === name)) throw new BridgeError('SHADOWED_PROFILE', 'A project agent shadows this user agent.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return profile;
}

export function publicProfile(p) {
  return { name: p.name, model: p.model, thoughtLevel: p.thoughtLevel, tools: p.tools,
    permissionMode: p.permissionMode, sha256: p.sha256 };
}

export function requireReadOnlyProfile(profile) {
  const fields = profile.fields;
  const tools = Array.isArray(fields.tools) ? fields.tools : typeof fields.tools === 'string' ? fields.tools.split(/[,\s]+/).filter(Boolean) : ['*'];
  const readTools = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Skill']);
  if (fields.permissionMode !== 'plan' || tools.some(tool => !readTools.has(tool)) || fields.memory !== undefined) {
    throw new BridgeError('PROFILE_NOT_READ_ONLY', 'This first adapter only runs plan-mode profiles with explicit read-only tools and no agent memory.');
  }
}
