import { readFile, writeFile } from 'node:fs/promises';
import { bridgeRoot } from '../src/account.mjs';
import path from 'node:path';
import { cursorRuntime, cursorModels } from '../src/cursor.mjs';
const catalog = await cursorModels(await cursorRuntime());
// Only this allowlist is exposed through the bridge. The Cursor account catalog is
// wider, but every route has to earn its place: an unlisted model is not registered,
// not selectable, and not eligible for capacity routing.
const allowedModels = new Set(['composer-2.5', 'composer-2.5-fast', 'grok-4.7-high', 'grok-4.7-medium', 'kimi-k3-high']);
const routes = {};
for (const model of catalog.models.filter(item => allowedModels.has(item.id))) routes[`cursor-${model.id}`] = {
  provider: 'cursor', model: model.id, description: `${model.label} via Cursor CLI. ${model.id === 'composer-2.5' ? 'Default balanced coding and protocol relay model.' : 'Available in the current account catalog; verify on first use.'}`,
  auto: ['composer-2.5', 'composer-2.5-fast', 'grok-4.7-high', 'kimi-k3-high'].includes(model.id),
};
const config = { version: 1, port: 32147, globalLimit: 14, limits: { zcode: 2, cursor: 12 },
  attemptTimeoutMs: 120000, requestTimeoutMs: 300000, router: 'cursor-composer-2.5',
  fallback: { enabled: false, on: ['PROVIDER_UNAVAILABLE', 'CURSOR_MODEL_UNAVAILABLE'], routes: {} }, routes };
const file = path.join(bridgeRoot, 'config', 'native-provider.json');
try { await writeFile(file, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' }); }
catch (error) { if (error.code !== 'EEXIST') throw error; console.log('Existing native provider configuration preserved.'); }
console.log(JSON.stringify({ configuredRoutes: Object.keys(JSON.parse(await readFile(file, 'utf8')).routes).length }));
