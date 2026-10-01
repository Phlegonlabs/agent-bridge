import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  codexModelCatalog, codexRoutes, cursorModelGroups, cursorRoutes,
  reasoningOptionSpec, resolveModelSelection, selectCursorModel, validateRouteReasoning,
} from '../src/model-options.mjs';

const codexCatalog = {
  fetched_at: '2026-10-01T00:00:00Z',
  client_version: '0.159.3',
  models: [
    { slug: 'gpt-6.1-sol', display_name: 'GPT-6.1-Sol', visibility: 'list',
      default_reasoning_level: 'medium',
      supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }] },
    { slug: 'gpt-reserve', visibility: 'hide', supported_reasoning_levels: [] },
    { slug: 'codex-auto-review', visibility: 'list', supported_reasoning_levels: [] },
  ],
};

test('Codex catalog reads local cache and routes only visible native models', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'agent-bridge-codex-'));
  await writeFile(path.join(home, 'models_cache.json'), JSON.stringify(codexCatalog));
  const catalog = await codexModelCatalog(home);
  assert.equal(catalog.source, 'codex-local-cache');
  assert.deepEqual(catalog.models.map(model => model.id), ['gpt-6.1-sol', 'gpt-reserve', 'codex-auto-review']);
  assert.deepEqual(codexRoutes(catalog), {
    'gpt-6.1-sol': {
      provider: 'codex', model: 'gpt-6.1-sol',
      description: 'GPT-6.1-Sol via the Codex CLI using the machine\'s existing login.',
      reasoning: { values: ['low', 'medium', 'high'], default: 'medium' },
    },
  });
});

test('Route reasoning resolves default and exact variants without silent fallback', () => {
  const legacy = { agent: 'implementer', expectedModel: 'gpt-legacy' };
  assert.equal(validateRouteReasoning(legacy), legacy);
  assert.throws(() => validateRouteReasoning({ ...legacy, reasoning: { values: ['high'], default: 'high' } }),
    { code: 'MODEL_EFFORT_CONFIG_INVALID' });
  const exact = resolveModelSelection({ model: 'gpt-6.1-sol', reasoning: { values: ['low', 'high'], default: 'high' } });
  assert.deepEqual(exact, { model: 'gpt-6.1-sol', effort: 'high' });
  assert.deepEqual(resolveModelSelection({ model: 'gpt-6.1-sol', reasoning: { values: ['low', 'high'], default: 'high' } }, 'low'),
    { model: 'gpt-6.1-sol', effort: 'low' });
  const cursorRoute = { model: 'grok-4.7', reasoning: {
    values: ['low', 'high'], default: 'high', variants: { low: 'grok-4.7-low', high: 'grok-4.7-high' } } };
  assert.deepEqual(resolveModelSelection(cursorRoute, 'default'), { model: 'grok-4.7-high', effort: 'high' });
  assert.throws(() => resolveModelSelection(cursorRoute, 'xhigh'), { code: 'MODEL_EFFORT_UNSUPPORTED' });
  assert.throws(() => resolveModelSelection({ model: 'composer', reasoning: { values: ['high'], default: 'high',
    variants: {} } }, 'high'), { code: 'MODEL_EFFORT_UNAVAILABLE' });
  assert.throws(() => resolveModelSelection({ model: 'composer' }, 'high'), { code: 'MODEL_EFFORT_UNSUPPORTED' });
});

test('Reasoning option metadata uses the proven CEL body patch', () => {
  assert.deepEqual(reasoningOptionSpec({ model: 'composer' }), { values: ['default'], map: '{}' });
  assert.deepEqual(reasoningOptionSpec({ model: 'gpt-6.1-sol', reasoning: { values: ['low', 'high'], default: 'high' } }),
    { values: ['default', 'low', 'high'], map: '{"reasoning_effort": reasoningLevel}' });
});

test('Cursor families preserve fast models and map actual catalog variants', () => {
  const models = [
    { id: 'auto', label: 'Auto' },
    { id: 'composer-2.5', label: 'Composer 2.5' },
    { id: 'composer-2.5-fast', label: 'Composer 2.5 Fast' },
    { id: 'cursor-grok-4.5-high', label: 'Grok 4.5' },
    { id: 'cursor-grok-4.5-high-fast', label: 'Grok 4.5 Fast' },
    { id: 'grok-4.7-low', label: 'Grok 4.7 Low' },
    { id: 'grok-4.7-high', label: 'Grok 4.7 High' },
    { id: 'grok-4.7-low-fast', label: 'Grok 4.7 Low Fast' },
    { id: 'grok-4.7-high-fast', label: 'Grok 4.7 High Fast' },
  ];
  assert.deepEqual(cursorModelGroups(models).filter(row => row.family === 'grok-4.7'), [
    { model: 'grok-4.7-low', label: 'Grok 4.7 Low', family: 'grok-4.7', fast: false, effort: 'low' },
    { model: 'grok-4.7-high', label: 'Grok 4.7 High', family: 'grok-4.7', fast: false, effort: 'high' },
    { model: 'grok-4.7-low-fast', label: 'Grok 4.7 Low Fast', family: 'grok-4.7', fast: true, effort: 'low' },
    { model: 'grok-4.7-high-fast', label: 'Grok 4.7 High Fast', family: 'grok-4.7', fast: true, effort: 'high' },
  ]);
  const routes = cursorRoutes(models, { defaultEffort: 'high' });
  assert.deepEqual(routes['cursor-grok-4.7'].reasoning, {
    values: ['low', 'high'], default: 'high',
    variants: { low: 'grok-4.7-low', high: 'grok-4.7-high' },
  });
  assert.deepEqual(routes['cursor-grok-4.7-fast'].reasoning.variants,
    { low: 'grok-4.7-low-fast', high: 'grok-4.7-high-fast' });
  assert.deepEqual(routes['cursor-composer-2.5-fast'], {
    provider: 'cursor', model: 'composer-2.5-fast',
    description: 'Composer 2.5 Fast via Cursor CLI.',
  });
  assert.throws(() => selectCursorModel(models, 'composer-2.5', 'high'), { code: 'CURSOR_EFFORT_UNAVAILABLE' });
  assert.equal(selectCursorModel(models, 'grok-4.7-fast', 'high').model, 'grok-4.7-high-fast');
  assert.ok(!JSON.stringify(routes).includes('"null":'));
  assert.throws(() => cursorRoutes([...models, { id: 'grok-4.7', label: 'Grok 4.7' }]),
    { code: 'CURSOR_MODEL_CATALOG_INVALID' });
});
