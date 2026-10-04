#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { listProfiles, publicProfile, BridgeError } from '../src/profiles.mjs';
import { runAgent } from '../src/bridge.mjs';
import { providerDoctor, providerLogin, providerModels } from '../src/provider-tools.mjs';
import { runSetup } from '../src/setup.mjs';
import { runCodex } from '../src/codex.mjs';
import { runCursor } from '../src/cursor.mjs';
import { runClaude } from '../src/claude.mjs';
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
    'jobs-json': { type: 'string' }, live: { type: 'boolean', default: false },
    providers: { type: 'string' }, models: { type: 'string' }, port: { type: 'string' },
    'write-mode': { type: 'string' }, 'fallback-effort': { type: 'string' }, 'dry-run': { type: 'boolean', default: false },
  } });
  const command = positionals[0];
  if (!['zcode', 'cursor', 'claude', 'codex'].includes(values.provider) && !(command === 'doctor' && values.provider === 'all')) throw new BridgeError('INVALID_PROVIDER', 'Provider must be zcode, cursor, claude or codex; doctor also accepts all.');
  if (values.provider === 'cursor' && (values.agent || values.cli || values['expected-model'])) throw new BridgeError('INVALID_ARGUMENT', 'Cursor uses --model and --cursor-dir, not ZCode agent or CLI options.');
  if (['claude', 'codex'].includes(values.provider) && (values.agent || values.cli || values['expected-model'] || values['cursor-dir'] || values['trust-workspace'])) throw new BridgeError('INVALID_ARGUMENT', 'Claude uses --model only, not ZCode agent or Cursor options.');
  if (values.provider === 'zcode' && command !== 'setup' && (values.model || values['cursor-dir'] || values['trust-workspace'] && command !== 'workflow')) throw new BridgeError('INVALID_ARGUMENT', 'Cursor options require --provider cursor.');
  if (values.live && (command !== 'doctor' || values.provider === 'all')) throw new BridgeError('INVALID_ARGUMENT', 'Use --live with doctor and one explicit provider.');
  if (command !== 'setup' && ['providers','models','port','write-mode','fallback-effort'].some(key => values[key] !== undefined) || values['dry-run'] && command !== 'setup') throw new BridgeError('INVALID_ARGUMENT', 'Setup options require setup.');
  const workflowOnly = ['config', 'preset', 'parallel-limit', 'fallback', 'task', 'workers', 'jobs-file', 'jobs-json'];
  if (!['workflow', 'presets', 'setup'].includes(command) && workflowOnly.some(key => values[key] !== undefined)) throw new BridgeError('INVALID_ARGUMENT', 'Workflow options require workflow or presets.');
  if (['workflow', 'presets'].includes(command) && (values.provider !== 'zcode' || values.agent || values.model || values.cli || values['expected-model'] || values['cursor-dir'] || values['timeout-ms'])) throw new BridgeError('INVALID_ARGUMENT', 'Workflow routes and deadlines come from the preset.');
  if (values.help || !command) {
    emit({ commands: ['setup', 'profiles', 'doctor', 'login', 'models', 'run', 'presets', 'workflow'], setup: '--providers codex,claude,cursor --models PROVIDER:MODEL_ID,... --fallback off|CODEX_MODEL [--write-mode workspace-write|read-only] [--port 32147] [--config FILE] [--dry-run]', doctor: '--provider zcode|cursor|claude|codex|all [--live --model MODEL --cwd DIRECTORY]', run: '--agent NAME --cwd DIRECTORY --task-file FILE [--expected-model PROVIDER/MODEL] [--timeout-ms 60000]',
      workflow: '--cwd DIRECTORY (--task TEXT | --task-file FILE | --jobs-file FILE | --jobs-json JSON) [--preset NAME] [--workers explorer,reviewer,cursor] [--parallel-limit 14] [--fallback off|configured] [--trust-workspace]',
      cursor: '--provider cursor --model MODEL_ID --cwd DIRECTORY --task-file FILE [--trust-workspace] [--cursor-dir PACKAGE_DIRECTORY]',
      claude: '--provider claude --model claude-opus-5-5 --cwd DIRECTORY --task-file FILE [--timeout-ms 120000]',
      note: 'ZCode expected-model asserts profile identity. Cursor model selects a native model; Cursor runs in ask mode. Claude delegates one self-contained task to the native Claude Code CLI.' });
  } else if (positionals.length !== 1) throw new BridgeError('INVALID_ARGUMENT', 'Unexpected positional arguments.');
  else if (command === 'setup') {
    const setupReport = await runSetup({ ...values, writeMode: values['write-mode'], fallbackEffort: values['fallback-effort'],
      dryRun: values['dry-run'], cursorDir: values['cursor-dir'], signal: controller.signal,
      onAuthorizeUrl: url => process.stderr.write(`Authorize in your browser: ${url}\n`) });
    emit(setupReport); if (!setupReport.ok) process.exitCode = 1;
  } else if (command === 'presets') {
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
    emit(await providerModels(values.provider, { cli: values.cli, cursorDir: values['cursor-dir'], signal: controller.signal }));
  } else if (command === 'doctor') {
    const report = await providerDoctor(values.provider, { ...values, cursorDir: values['cursor-dir'],
      expectedModel: values['expected-model'], trustWorkspace: values['trust-workspace'],
      timeoutMs: values['timeout-ms'] === undefined ? undefined : Number(values['timeout-ms']), signal: controller.signal });
    emit(report); if (!report.ok) process.exitCode = 1;
  } else if (command === 'login') {
    const report = await providerLogin(values.provider, { cli: values.cli, cursorDir: values['cursor-dir'], signal: controller.signal,
      onAuthorizeUrl: url => process.stderr.write(`Authorize in your browser: ${url}\n`) });
    emit(report); if (!report.ok) process.exitCode = 1;
  } else if (command === 'run') {
    if (!values.cwd || !values['task-file'] || values.provider === 'zcode' && !values.agent || values.provider !== 'zcode' && !values.model) throw new BridgeError('INVALID_ARGUMENT', 'run requires --cwd, --task-file, and a ZCode --agent or a Cursor/Claude --model.');
    const taskPath = values['task-file'];
    if ((await stat(taskPath)).size > 32768) throw new BridgeError('INVALID_TASK', 'Task file exceeds 32768 bytes.');
    const task = await readFile(taskPath, 'utf8');
    const timeoutMs = values['timeout-ms'] === undefined ? 60000 : Number(values['timeout-ms']);
    const report = values.provider === 'cursor'
      ? await runCursor({ cwd: values.cwd, task, model: values.model, cursorDir: values['cursor-dir'], timeoutMs, signal: controller.signal, trustWorkspace: values['trust-workspace'] })
      : values.provider === 'claude'
        ? await runClaude({ cwd: values.cwd, task, model: values.model, timeoutMs, signal: controller.signal })
        : values.provider === 'codex' ? await runCodex({ cwd: values.cwd, task, model: values.model, timeoutMs, signal: controller.signal })
        : await runAgent({ agent: values.agent, cwd: values.cwd, task,
      expectedModel: values['expected-model'], cliPath: values.cli,
      timeoutMs, signal: controller.signal });
    emit(report); if (!report.ok) process.exitCode = 1;
  } else throw new BridgeError('INVALID_ARGUMENT', 'Unknown command.');
} catch (error) {
  emit({ ok: false, code: error.code ?? 'BRIDGE_ERROR', message: error instanceof BridgeError ? error.message : 'Bridge setup failed. Check paths and local file access.' });
  process.exitCode = 1;
}
