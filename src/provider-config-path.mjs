import { stat } from 'node:fs/promises';
import path from 'node:path';
import { bridgeRoot } from './account.mjs';

export const localProviderConfig = root => path.join(root, '.bridge', 'config', 'native-provider.json');
export async function providerConfigPath(explicit, root = bridgeRoot) {
  if (explicit) return path.resolve(explicit);
  const local = localProviderConfig(root);
  try { await stat(local); return local; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return path.join(root, 'config', 'native-provider.json');
}
