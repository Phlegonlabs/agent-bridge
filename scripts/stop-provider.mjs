import { parseArgs } from 'node:util';
import { localToken, readProviderConfig } from '../src/provider-server.mjs';
const { values } = parseArgs({ options: { config: { type: 'string' } } });
const config = await readProviderConfig(values.config);
const response = await fetch(`http://127.0.0.1:${config.port}/shutdown`, { method: 'POST', headers: { Authorization: `Bearer ${await localToken()}` }, signal: AbortSignal.timeout(5000) });
if (response.status !== 202) throw new Error('Provider did not accept shutdown.');
console.log('Graceful shutdown requested; active requests are being cancelled and cleaned up.');
