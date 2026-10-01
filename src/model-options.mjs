import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { BridgeError } from './profiles.mjs';

// `default` is the native runtime's selection sentinel, never a provider effort.
const EFFORT_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export function normalizeEffortValue(effort) {
  if (effort === undefined || effort === null || effort === 'default') return null;
  if (typeof effort !== 'string' || !EFFORT_PATTERN.test(effort)) {
    throw new BridgeError('MODEL_EFFORT_INVALID', 'Requested effort must be a supported lowercase level or default.');
  }
  return effort;
}

// A route without reasoning metadata has one behavior: use its exact model and do
// not forward an effort field. With metadata, `default` selects the configured
// route default; every other value must be declared explicitly.
export function validateRouteReasoning(route) {
  if (!route || typeof route !== 'object' || Array.isArray(route)) {
    throw new BridgeError('MODEL_EFFORT_CONFIG_INVALID', 'Route must be an object.');
  }
  if (typeof route.model !== 'string' || !route.model) {
    throw new BridgeError('MODEL_EFFORT_CONFIG_INVALID', 'Route model is required.');
  }
  const metadata = route.reasoning;
  if (metadata === undefined) return route;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new BridgeError('MODEL_EFFORT_CONFIG_INVALID', 'Route reasoning must be an object.');
  }
  const variants = metadata.variants ?? {};
  if (typeof variants !== 'object' || Array.isArray(variants)) {
    throw new BridgeError('MODEL_EFFORT_CONFIG_INVALID', 'Route reasoning variants must be an object.');
  }
  const values = metadata.values ?? Object.keys(variants);
  if (!Array.isArray(values) || !values.length ||
      values.some(value => typeof value !== 'string' || !EFFORT_PATTERN.test(value) || value === 'default') ||
      new Set(values).size !== values.length) {
    throw new BridgeError('MODEL_EFFORT_CONFIG_INVALID', 'Route reasoning values must be unique provider effort levels.');
  }
  const selectedDefault = metadata.default ?? values[0];
  if (!values.includes(selectedDefault)) {
    throw new BridgeError('MODEL_EFFORT_CONFIG_INVALID', 'Route reasoning default must be one of its values.');
  }
  for (const [effort, model] of Object.entries(variants)) {
    if (!values.includes(effort) || typeof model !== 'string' || !model) {
      throw new BridgeError('MODEL_EFFORT_CONFIG_INVALID', 'Each reasoning variant needs a declared effort and exact model.');
    }
  }
  return route;
}

export function resolveModelSelection(route, requestedEffort) {
  validateRouteReasoning(route);
  let effort = normalizeEffortValue(requestedEffort);
  const metadata = route.reasoning;
  if (!metadata) {
    if (effort !== null) throw new BridgeError('MODEL_EFFORT_UNSUPPORTED', 'This route does not declare reasoning effort.');
    return { model: route.model, effort: undefined };
  }
  effort ??= metadata.default ?? metadata.values[0];
  if (!metadata.values.includes(effort)) {
    throw new BridgeError('MODEL_EFFORT_UNSUPPORTED', `This route supports reasoning levels: ${metadata.values.join(', ')}.`);
  }
  if (metadata.variants && !Object.hasOwn(metadata.variants, effort)) {
    throw new BridgeError('MODEL_EFFORT_UNAVAILABLE', 'The requested effort has no exact native model mapping.');
  }
  return { model: metadata.variants?.[effort] ?? route.model, effort };
}

// ZCode compiles this restricted CEL expression against reasoningLevel and patches
// the resulting raw JSON body. A JSON object map would add unrelated body fields.
export function reasoningOptionSpec(route) {
  const metadata = validateRouteReasoning(route).reasoning;
  if (!metadata) return { values: ['default'], map: '{}' };
  return { values: metadata.values, map: '{"reasoning_effort": reasoningLevel}' };
}

export async function codexModelCatalog(codexHome = process.env.CODEX_HOME ?? path.join(homedir(), '.codex')) {
  const file = path.join(codexHome, 'models_cache.json');
  let text;
  try {
    if ((await stat(file)).size > 4 * 1024 * 1024) throw new Error('too large');
    text = await readFile(file, 'utf8');
  } catch {
    throw new BridgeError('CODEX_MODEL_CATALOG_UNAVAILABLE', 'Codex local model cache is unavailable.');
  }
  let cache;
  try { cache = JSON.parse(text); } catch {
    throw new BridgeError('CODEX_MODEL_CATALOG_INVALID', 'Codex local model cache is not valid JSON.');
  }
  if (!cache || typeof cache !== 'object' || Array.isArray(cache) || !Array.isArray(cache.models)) {
    throw new BridgeError('CODEX_MODEL_CATALOG_INVALID', 'Codex local model cache has an unexpected shape.');
  }
  const models = cache.models.map(entry => {
    if (!entry || typeof entry !== 'object' || typeof entry.slug !== 'string' || !entry.slug) {
      throw new BridgeError('CODEX_MODEL_CATALOG_INVALID', 'Codex catalog entry is missing a model slug.');
    }
    const levels = (entry.supported_reasoning_levels ?? []).map(level => {
      const value = typeof level === 'string' ? level : level?.effort;
      return typeof value === 'string' && EFFORT_PATTERN.test(value) ? value : null;
    });
    if (levels.includes(null) || new Set(levels).size !== levels.length) {
      throw new BridgeError('CODEX_MODEL_CATALOG_INVALID', `Codex model ${entry.slug} has invalid reasoning levels.`);
    }
    const defaultEffort = entry.default_reasoning_level ?? null;
    if (defaultEffort !== null && !levels.includes(defaultEffort)) {
      throw new BridgeError('CODEX_MODEL_CATALOG_INVALID', `Codex model ${entry.slug} has an undeclared default effort.`);
    }
    return {
      id: entry.slug,
      label: typeof entry.display_name === 'string' && entry.display_name ? entry.display_name : entry.slug,
      defaultEffort,
      efforts: levels,
      visible: entry.visibility === 'list',
      internal: entry.slug === 'codex-auto-review',
    };
  });
  if (new Set(models.map(model => model.id)).size !== models.length) {
    throw new BridgeError('CODEX_MODEL_CATALOG_INVALID', 'Codex local model cache contains duplicate slugs.');
  }
  return {
    source: 'codex-local-cache',
    fetchedAt: typeof cache.fetched_at === 'string' ? cache.fetched_at : null,
    clientVersion: typeof cache.client_version === 'string' ? cache.client_version : null,
    models,
  };
}

export function codexRoutes(catalog) {
  const models = catalog?.models;
  if (!Array.isArray(models)) throw new BridgeError('CODEX_MODEL_CATALOG_INVALID', 'A Codex catalog is required.');
  const routes = {};
  for (const model of models) {
    if (!model.visible || model.internal) continue;
    const reasoning = model.efforts.length
      ? { values: model.efforts, default: model.efforts.includes(model.defaultEffort) ? model.defaultEffort : model.efforts[0] }
      : undefined;
    routes[model.id] = {
      provider: 'codex',
      model: model.id,
      description: `${model.label} via the Codex CLI using the machine's existing login.`,
      ...(reasoning ? { reasoning } : {}),
    };
  }
  return routes;
}

export function selectCodexModel(models, model, effort) {
  const requested = normalizeEffortValue(effort);
  const selected = models.find(entry => entry.id === model);
  if (!selected) throw new BridgeError('CODEX_MODEL_UNAVAILABLE', 'The requested model is not in the Codex local model cache.');
  if (requested !== null && !selected.efforts.includes(requested)) {
    throw new BridgeError('CODEX_EFFORT_UNAVAILABLE', 'The selected Codex model does not support the requested effort.');
  }
  return selected;
}

function cursorIdentity(id) {
  const unnamespaced = String(id).replace(/^cursor-/, '');
  const fast = unnamespaced.endsWith('-fast');
  const stem = fast ? unnamespaced.slice(0, -'-fast'.length) : unnamespaced;
  const match = /^(.+)-(low|medium|high|xhigh|max|ultra)$/.exec(stem);
  return { family: match?.[1] ?? stem, fast, effort: match?.[2] ?? null };
}

// Cursor exposes strengths as separate native account models. Keep the `fast`
// qualifier separate so high and high-fast never collapse into one family.
export function cursorModelGroups(models) {
  if (!Array.isArray(models)) throw new BridgeError('CURSOR_MODEL_CATALOG_INVALID', 'A Cursor model catalog is required.');
  const rows = [];
  for (const entry of models) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || typeof entry.label !== 'string') {
      throw new BridgeError('CURSOR_MODEL_CATALOG_INVALID', 'Cursor catalog entry is incomplete.');
    }
    if (entry.id === 'auto') continue;
    if (rows.some(model => model.model === entry.id)) {
      throw new BridgeError('CURSOR_MODEL_CATALOG_INVALID', 'Duplicate model ID in Cursor catalog.');
    }
    rows.push({ model: entry.id, label: entry.label, ...cursorIdentity(entry.id) });
  }
  return rows;
}

export function cursorRoutes(models, { defaultEffort = 'high' } = {}) {
  const rows = cursorModelGroups(models);
  const order = new Map(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map((effort, index) => [effort, index]));
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.family}\0${row.fast}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const routes = {};
  for (const [key, members] of groups) {
    const [family, fastText] = key.split('\0');
    const fast = fastText === 'true';
    const routeId = `cursor-${family}${fast ? '-fast' : ''}`;
    if (Object.hasOwn(routes, routeId)) throw new BridgeError('CURSOR_MODEL_CATALOG_INVALID', 'Cursor families collide on a route ID.');
    const efforts = members.map(row => row.effort).filter(Boolean)
      .sort((left, right) => (order.get(left) ?? 99) - (order.get(right) ?? 99));
    if (efforts.length) {
      const selectedDefault = efforts.includes(defaultEffort) ? defaultEffort : efforts.at(-1);
      routes[routeId] = {
        provider: 'cursor',
        model: family,
        description: `${members.reduce((short, row) => row.label.length < short.length ? row.label : short, members[0].label).trim()} via Cursor CLI.`,
        reasoning: {
          values: efforts,
          default: selectedDefault,
          variants: Object.fromEntries(members.map(row => [row.effort, row.model])),
        },
      };
    } else {
      if (members.length !== 1) throw new BridgeError('CURSOR_MODEL_CATALOG_INVALID', 'A Cursor singleton family has multiple models.');
      routes[routeId] = {
        provider: 'cursor',
        model: members[0].model,
        description: `${members[0].label} via Cursor CLI.`,
      };
    }
  }
  return routes;
}

// Parent routes normally resolve first and pass the exact native model. This also
// lets runCursor accept a family alias: it maps only within the same family and
// fast qualifier, and requires an exact catalog model for the requested effort.
export function selectCursorModel(models, model, effort) {
  const requested = normalizeEffortValue(effort);
  const rows = cursorModelGroups(models);
  const exact = rows.find(row => row.model === model);
  if (exact) {
    if (requested !== null && exact.effort !== requested) {
      throw new BridgeError('CURSOR_EFFORT_UNAVAILABLE', 'The exact Cursor model does not provide the requested effort.');
    }
    return exact;
  }
  if (requested === null) {
    throw new BridgeError('CURSOR_MODEL_UNAVAILABLE', 'The requested model is not in the current Cursor account catalog.');
  }
  const identity = cursorIdentity(model);
  const matches = rows.filter(row => row.family === identity.family && row.fast === identity.fast && row.effort === requested);
  if (matches.length !== 1) {
    throw new BridgeError('CURSOR_EFFORT_UNAVAILABLE', 'The Cursor catalog has no exact model for this family and effort.');
  }
  return matches[0];
}
