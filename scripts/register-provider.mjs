import { readProviderConfig, localToken } from '../src/provider-server.mjs';
import { registerProvider } from '../src/provider-registration.mjs';
const config = await readProviderConfig();
const health = await fetch(`http://127.0.0.1:${config.port}/health`, { signal: AbortSignal.timeout(3000) });
if (!health.ok || (await health.json()).service !== 'zcode-workflow-bridge') throw new Error('Start the local provider before registering it.');
console.log(JSON.stringify(await registerProvider(config, await localToken())));
