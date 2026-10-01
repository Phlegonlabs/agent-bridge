import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runProcess } from '../src/process.mjs';

async function options(script, extra = {}) {
  const root = path.resolve('.bridge', 'tests', randomUUID()); await mkdir(root, { recursive: true });
  return { command: process.execPath, args: ['-e', script], cwd: root,
    stdoutPath: path.join(root, 'stdout.log'), stderrPath: path.join(root, 'stderr.log'), timeoutMs: 5000, ...extra };
}
test('drains bounded logs and preserves exit code', async () => {
  const lines = [];
  const opts = await options('console.log("ok");console.error("err");process.exitCode=7', { onLine: x => lines.push(x) });
  const result = await runProcess(opts);
  assert.equal(result.exitCode, 7); assert.deepEqual(lines, ['ok']);
  assert.match(await readFile(opts.stderrPath, 'utf8'), /err/);
});
test('parallel runs preserve independent results', async () => {
  const seen = [[], []];
  const opts = await Promise.all([0, 1].map(i => options(`setTimeout(()=>console.log(${i}),100)`, { onLine: x => seen[i].push(x) })));
  const results = await Promise.all(opts.map(runProcess));
  assert.deepEqual(seen, [['0'], ['1']]);
  assert.ok(results.every(x => x.exitCode === 0));
  assert.ok(results[0].startedAt < results[1].endedAt && results[1].startedAt < results[0].endedAt);
});
test('deadline terminates the owned process', async () => {
  const result = await runProcess(await options('setInterval(()=>{},1000)', { timeoutMs: 300 }));
  assert.equal(result.reason, 'timeout');
  assert.notEqual(result.cleanup.status, 'unconfirmed');
  assert.throws(() => process.kill(result.pid, 0));
});
test('output budget stops an unbounded writer', async () => {
  const result = await runProcess(await options('setInterval(()=>process.stdout.write("x".repeat(65536)),1)', { maxBytes: 4096 }));
  assert.equal(result.reason, 'output_limit');
  assert.throws(() => process.kill(result.pid, 0));
});
test('aborting stops only its own run', async () => {
  const controller = new AbortController();
  const opts = await options('setInterval(()=>{},1000)', { signal: controller.signal });
  const promise = runProcess(opts); const timer = setTimeout(() => controller.abort(), 300);
  const result = await promise; clearTimeout(timer);
  assert.equal(result.reason, 'cancelled'); assert.throws(() => process.kill(result.pid, 0));
});

test('deadline terminates a running child process tree', async () => {
  let descendant;
  const script = `const {spawn}=require('node:child_process'); const worker=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'}); console.log(worker.pid); setInterval(()=>{},1000);`;
  const result = await runProcess(await options(script, { timeoutMs: 500, onLine: x => { descendant = Number(x); } }));
  assert.equal(result.reason, 'timeout');
  assert.equal(result.cleanup.status, process.platform === 'win32' ? 'terminated' : 'terminated_process_group');
  assert.ok(descendant); assert.throws(() => process.kill(descendant, 0));
});

test('a failed executable returns a bounded failure', async () => {
  const result = await runProcess(await options('', { command: 'nonexistent-zcode-bridge-test-executable' }));
  assert.equal(result.reason, 'spawn_failed');
});

test('spawn hook marks only real starts and large stdin avoids command-line limits', async () => {
  let starts=0; const inputText='字"'.repeat(20000), lines=[];
  const result=await runProcess(await options('let n=0;process.stdin.on("data",b=>n+=b.length);process.stdin.on("end",()=>console.log(n));',
    {stdinText:inputText,onSpawn:()=>starts++,onLine:line=>lines.push(line)}));
  assert.equal(result.exitCode,0);assert.equal(starts,1);assert.equal(Number(lines[0]),Buffer.byteLength(inputText));
  await runProcess(await options('',{command:'nonexistent-zcode-bridge-test-executable',onSpawn:()=>starts++}));
  assert.equal(starts,1);
});
