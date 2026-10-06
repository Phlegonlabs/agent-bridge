import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runProcess } from '../src/process.mjs';

async function run(options = {}) {
  const dir = path.resolve('.bridge/process-input-' + randomUUID());
  await mkdir(dir, { recursive: true });
  const result = await runProcess({ command: process.execPath,
    args: ['--input-type=module', '-e', "process.stdin.setEncoding('utf8');process.stdin.on('data',s=>process.stdout.write(s));"],
    cwd: process.cwd(), timeoutMs: 3000, stdoutPath: dir + '/stdout.log', stderrPath: dir + '/stderr.log', ...options });
  return { result, output: await readFile(dir + '/stdout.log', 'utf8') };
}

test('interactive input writes after receiving output and closes the owned child', async () => {
  let io;
  const { result, output } = await run({ onStdin: input => { io = input; io.write('first\n'); },
    onLine: line => { if (line === 'first') { io.write('second\n'); io.end(); io.end(); } } });
  assert.equal(output, 'first\nsecond\n'); assert.equal(result.exitCode, 0); assert.equal(result.reason, null);
});

test('interactive input cannot replace static input or write after EOF', async () => {
  await assert.rejects(run({ stdinText: 'x', onStdin() {} }), { code: 'INVALID_INPUT' });
  const { result } = await run({ onStdin: io => { io.end(); assert.throws(() => io.write('x'), { code: 'STDIN_CLOSED' }); } });
  assert.equal(result.exitCode, 0);
});

test('interactive child obeys the existing absolute process deadline', async () => {
  const { result } = await run({ timeoutMs: 100, onStdin() {} });
  assert.equal(result.reason, 'timeout'); assert.notEqual(result.cleanup?.status, 'unconfirmed');
});
