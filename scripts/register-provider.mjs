import { parseArgs } from 'node:util';
import { readProviderConfig, localToken } from '../src/provider-server.mjs';
import { updateProviders } from '../src/provider-registration.mjs';
const { values } = parseArgs({ options: { config: { type: 'string' }, update: { type: 'boolean' } } });
const config = await readProviderConfig(values.config);
const health = await fetch(`http://127.0.0.1:${config.port}/health`, { signal: AbortSignal.timeout(3000) });
if (!health.ok || (await health.json()).service !== 'agent-bridge') throw new Error('Start the local provider before registering it.');
console.log(JSON.stringify(await updateProviders(config, await localToken())));
