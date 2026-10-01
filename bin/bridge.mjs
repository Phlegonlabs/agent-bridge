#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { listProfiles, publicProfile, BridgeError } from '../src/profiles.mjs';
import { installedRuntime, runAgent } from '../src/bridge.mjs';
import { loginAccount } from '../src/account.mjs';
import { cursorRuntime, cursorDoctor, cursorModels, cursorLogin, runCursor } from '../src/cursor.mjs';
import { readJsonFile, readPresets, selectPreset, runWorkflow, workflowOutput } from '../src/workflow.mjs';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    agent: { type: 'string' }, cwd: { type: 'string' }, 'task-file': { type: 'string' },
    'expected-model': { type: 'string' }, 'timeout-ms': { type: 'string' }, cli: { type: 'string' }, help: { type: 'boolean' },
    provider: { type: 'string', default: 'zcode' }, model: { type: 'string' }, 'cursor-dir': { type: 'string' },
    'trust-workspace': { type: 'boolean', default: false },
    config: { type: 'string' }, preset: { type: 'string' }, 'parallel-limit': { type: 'string' },
    fallback: { type: 'string' }, task: { type: 'string' }, workers: { type: 'string' }, 'jobs-file': { type: 'string' },
    'jobs-json': { type: 'string' },
  } });
  const command = positionals[0];
  if (!['zcode', 'cursor'].includes(values.provider)) throw new BridgeError('INVALID_PROVIDER', 'Provider must be zcode or cursor.');
  if (values.provider === 'cursor' && (values.agent || values.cli || values['expected-model'])) throw new BridgeError('INVALID_ARGUMENT', 'Cursor uses --model and --cursor-dir, not ZCode agent or CLI options.');
  if (values.provider === 'zcode' && (values.model || values['cursor-dir'] || values['trust-workspace'] && command !== 'workflow')) throw new BridgeError('INVALID_ARGUMENT', 'Cursor options require --provider cursor.');
  const workflowOnly = ['config', 'preset', 'parallel-limit', 'fallback', 'task', 'workers', 'jobs-file', 'jobs-json'];
  if (!['workflow', 'presets'].includes(command) && workflowOnly.some(key => values[key] !== undefined)) throw new BridgeError('INVALID_ARGUMENT', 'Workflow options require workflow or presets.');
  if (['workflow', 'presets'].includes(command) && (values.provider !== 'zcode' || values.agent || values.model || values.cli || values['expected-model'] || values['cursor-dir'] || values['timeout-ms'])) throw new BridgeError('INVALID_ARGUMENT', 'Workflow routes and deadlines come from the preset.');
  if (values.help || !command) {
    emit({ commands: ['profiles', 'doctor', 'login', 'models', 'run', 'presets', 'workflow'], run: '--agent NAME --cwd DIRECTORY --task-file FILE [--expected-model PROVIDER/MODEL] [--timeout-ms 60000]',
      workflow: '--cwd DIRECTORY (--task TEXT | --task-file FILE | --jobs-file FILE | --jobs-json JSON) [--preset NAME] [--workers explorer,reviewer,cursor] [--parallel-limit 14] [--fallback off|configured] [--trust-workspace]',
      cursor: '--provider cursor --model MODEL_ID --cwd DIRECTORY --task-file FILE [--trust-workspace] [--cursor-dir PACKAGE_DIRECTORY]',
      note: 'ZCode expected-model asserts profile identity. Cursor model selects a native model; Cursor runs in ask mode.' });
  } else if (positionals.length !== 1) throw new BridgeError('INVALID_ARGUMENT', 'Unexpected positional arguments.');
  else if (command === 'presets') {
    if (workflowOnly.filter(key => key !== 'config').some(key => values[key] !== undefined) || values.cwd || values['task-file'] || values['trust-workspace']) throw new BridgeError('INVALID_ARGUMENT', 'presets only accepts --config.');
    emit(await readPresets(values.config));
  } else if (command === 'workflow') {
    if (!values.cwd || ['task', 'task-file', 'jobs-file', 'jobs-json'].filter(key => values[key] !== undefined).length !== 1) throw new BridgeError('INVALID_ARGUMENT', 'workflow requires --cwd and exactly one task source.');
    const selected = selectPreset(await readPresets(values.config), { name: values.preset,
      parallelLimit: values['parallel-limit'] === undefined ? undefined : Number(values['parallel-limit']), fallback: values.fallback });
    let jobs;
    if (values['jobs-file'] !== undefined || values['jobs-json'] !== undefined) {
      if (values.workers !== undefined) throw new BridgeError('INVALID_ARGUMENT', 'Job input already assigns workers.');
      if (values['jobs-json'] !== undefined) {
        if (values['jobs-json'].length > 12000) throw new BridgeError('INVALID_TASK', 'Inline jobs exceed 12000 characters. Use --jobs-file.');
        try { jobs = JSON.parse(values['jobs-json']); }
        catch { throw new BridgeError('INVALID_TASK', 'Invalid jobs JSON.'); }
      } else jobs = await readJsonFile(values['jobs-file']);
    } else {
      let task = values.task;
      if (values['task-file']) {
        if ((await stat(values['task-file'])).size > 32768) throw new BridgeError('INVALID_TASK', 'Task file exceeds 32768 bytes.');
        task = await readFile(values['task-file'], 'utf8');
      }
      const workers = values.workers === undefined ? Object.keys(selected.preset.workers) : values.workers.split(',').map(value => value.trim());
      jobs = workers.map(worker => ({ id: worker, worker, task }));
    }
    const report = await runWorkflow({ ...selected, jobs, cwd: values.cwd,
      trustWorkspace: values['trust-workspace'], signal: controller.signal });
    emit(workflowOutput(report)); if (!report.ok) process.exitCode = 1;
  } else if (command === 'profiles') {
    if (values.provider !== 'zcode') throw new BridgeError('INVALID_ARGUMENT', 'profiles lists ZCode profiles. Use models --provider cursor for Cursor.');
    emit({ profiles: (await listProfiles()).map(publicProfile) });
  } else if (command === 'models') {
    if (values.provider !== 'cursor') throw new BridgeError('INVALID_ARGUMENT', 'models requires --provider cursor.');
    emit(await cursorModels(await cursorRuntime(values['cursor-dir']), { signal: controller.signal }));
  }
  else if (command === 'doctor') {
    if (values.provider === 'cursor') {
      const report = await cursorDoctor(await cursorRuntime(values['cursor-dir']), { signal: controller.signal });
      emit(report); if (!report.ok) process.exitCode = 1;
    } else {
    const runtime = await installedRuntime(values.cli);
    emit({ ok: true, node: process.version, cli: runtime.prefix[0], builtinProviderConfigFound: true,
      agentCount: (await listProfiles()).length,
      modelAccess: 'unverified', note: 'Static preflight only. Desktop account providers may be unavailable to a standalone CLI.' });
    }
  } else if (command === 'login') {
    const options = { signal: controller.signal, onAuthorizeUrl: url => process.stderr.write(`Authorize the bridge in your browser: ${url}\n`) };
    const report = values.provider === 'cursor'
      ? await cursorLogin(await cursorRuntime(values['cursor-dir']), options)
      : await loginAccount(await installedRuntime(values.cli), options);
    emit(report); if (!report.ok) process.exitCode = 1;
  } else if (command === 'run') {
    if (!values.cwd || !values['task-file'] || values.provider === 'zcode' && !values.agent || values.provider === 'cursor' && !values.model) throw new BridgeError('INVALID_ARGUMENT', 'run requires --cwd, --task-file, and a ZCode --agent or Cursor --model.');
    const taskPath = values['task-file'];
    if ((await stat(taskPath)).size > 32768) throw new BridgeError('INVALID_TASK', 'Task file exceeds 32768 bytes.');
    const task = await readFile(taskPath, 'utf8');
    const timeoutMs = values['timeout-ms'] === undefined ? 60000 : Number(values['timeout-ms']);
    const report = values.provider === 'cursor'
      ? await runCursor({ cwd: values.cwd, task, model: values.model, cursorDir: values['cursor-dir'], timeoutMs, signal: controller.signal, trustWorkspace: values['trust-workspace'] })
      : await runAgent({ agent: values.agent, cwd: values.cwd, task,
      expectedModel: values['expected-model'], cliPath: values.cli,
      timeoutMs, signal: controller.signal });
    emit(report); if (!report.ok) process.exitCode = 1;
  } else throw new BridgeError('INVALID_ARGUMENT', 'Unknown command.');
} catch (error) {
  emit({ ok: false, code: error.code ?? 'BRIDGE_ERROR', message: error instanceof BridgeError ? error.message : 'Bridge setup failed. Check paths and local file access.' });
  process.exitCode = 1;
}
