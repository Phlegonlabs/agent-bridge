import { parseArgs } from 'node:util';
import { copyFile, mkdir, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { bridgeRoot } from '../src/account.mjs';
const { values } = parseArgs({ options: { directory: { type: 'string' } } });
const directory = path.resolve(values.directory ?? path.join(homedir(), '.zcode', 'agents'));
const names = ['bridge-explorer', 'bridge-reviewer'];
for (const name of names) {
  try { await lstat(path.join(directory, `${name}.md`)); throw new Error(`Existing ${name}.md preserved. Choose another directory or use your existing profiles.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await mkdir(directory, { recursive: true });
for (const name of names) await copyFile(path.join(bridgeRoot, 'examples', 'agents', `${name}.md`), path.join(directory, `${name}.md`), constants.COPYFILE_EXCL);
console.log(JSON.stringify({ ok: true, directory, profiles: names, next: 'Review the model IDs for your account before running a live probe.' }));
