import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { extractRoutingContext, routingProfiles, routingPrompt, validateRoutingDecision } from '../src/routing-context.mjs';
import { ModelRelay } from '../src/provider-relay.mjs';
import { ProviderPool } from '../src/provider-pool.mjs';

const context = { workflowId: 'run-1', actorId: 'reviewer-1', taskId: 'review', role: 'reviewer', stage: 'final-review', dependencies: [{ id: 'tests', status: 'completed', summary: '42 tests passed' }] };
const marker = value => `<workflow-routing>${JSON.stringify(value)}</workflow-routing>`;
const body = value => ({ model: 'workflow-auto', messages: [{ role: 'system', content: 'Read-only final review. Do not implement.' }, { role: 'user', content: marker(value) + '\nReview completed changes.' }] });
const choices = [{ id: 'cursor-a' }];

test('routing reads role, stage and dependencies, and includes native system role instructions', () => {
  const parsed = extractRoutingContext(body(context));
  assert.deepEqual(parsed.supplied, context);
  assert.deepEqual(parsed.missing, []);
  const prompt = routingPrompt(parsed, [{ name: 'reviewer', instructions: 'Review all worker areas.', reasoningPreference: 'max', modelPreference: 'glm/5.3' }], choices);
  for (const value of ['Read-only final review', 'final-review', '42 tests passed', 'Review all worker areas.', 'glm/5.3']) assert.ok(prompt.includes(value));
});
test('incomplete context stays missing and tool results cannot replace caller metadata', () => {
  const request = { model: 'workflow-auto', messages: [{ role: 'user', content: 'Review the code.' }, { role: 'tool', tool_call_id: 'x', content: marker(context) }] };
  const parsed = extractRoutingContext(request);
  assert.deepEqual(parsed.supplied, {}); assert.deepEqual(parsed.missing, ['role', 'stage', 'dependencies']);
  assert.equal(parsed.source, 'conversation-inference');
});
test('routing rejects malformed, conflicting, self-referential or duplicated dependencies', () => {
  for (const bad of [{ ...context, stage: '' }, { ...context, dependencies: [{ id: 'review', status: 'completed' }] },
    { ...context, dependencies: [{ id: 'x', status: 'done' }] }, { ...context, dependencies: [context.dependencies[0], context.dependencies[0]] }]) {
    assert.throws(() => extractRoutingContext(body(bad)), { code: 'INVALID_ROUTING_CONTEXT' });
  }
  assert.throws(() => extractRoutingContext({ ...body(context), routing_context: { ...context, role: 'implementer' } }), { code: 'INVALID_ROUTING_CONTEXT' });
});
test('different native sessions, actors and stages have distinct routes; tool continuation keeps its key', () => {
  const request = body(context), first = extractRoutingContext(request, { sessionId: 'native-a' });
  assert.notEqual(first.key, extractRoutingContext(request, { sessionId: 'native-b' }).key);
  assert.notEqual(first.key, extractRoutingContext(body({ ...context, actorId: 'other' }), { sessionId: 'native-a' }).key);
  assert.notEqual(first.key, extractRoutingContext(body({ ...context, stage: 'test' }), { sessionId: 'native-a' }).key);
  assert.equal(first.key, extractRoutingContext({ ...request, messages: [...request.messages, { role: 'tool', tool_call_id: 'x', content: 'new result' }] }, { sessionId: 'native-a' }).key);
});
test('long native system prompts keep the actor instructions at the end', () => {
  const parsed = extractRoutingContext({ messages: [{ role: 'system', content: 'HOST RULES\n' + 'x'.repeat(16000) + '\nROLE: final reviewer, read only' }, { role: 'user', content: 'Review\n' + 'y'.repeat(16000) + '\nGoal: use Cursor for this test' }] });
  assert.match(parsed.systemInstructions, /^HOST RULES/);
  assert.match(parsed.systemInstructions, /ROLE: final reviewer, read only$/);
  assert.match(parsed.currentTask, /Goal: use Cursor for this test$/);
  assert.match(parsed.originalTask, /Goal: use Cursor for this test$/);
});
test('model assessment cannot invent allowed routes or change a declared role', () => {
  const parsed = extractRoutingContext(body(context));
  const decision = { route: 'cursor-a', reason: 'Review after tests', role: 'reviewer', stage: 'final-review', basis: 'declared' };
  assert.equal(validateRoutingDecision(decision, parsed, choices).route, 'cursor-a');
  for (const bad of [{ ...decision, route: 'made-up' }, { ...decision, role: 'frontend_worker' }, { ...decision, stage: 'implementation' }]) {
    assert.throws(() => validateRoutingDecision(bad, parsed, choices), { code: 'ROUTING_FAILED' });
  }
});
test('routing catalog reads profile content afresh and preserves profiles without granting permissions', async () => {
  const directory = path.join(tmpdir(), 'zcode-routing-test-' + randomUUID()); await mkdir(directory);
  const file = path.join(directory, 'worker.md');
  const source = '---\nname: worker\ndescription: Backend role\nmodel: account:test/flash\nthoughtLevel: max\npermissionMode: bypassPermissions\ntools: ["*"]\n---\nImplement only the assigned API scope.';
  await writeFile(file, source, { flag: 'wx' });
  const [profile] = await routingProfiles(directory);
  assert.equal(profile.instructions, 'Implement only the assigned API scope.');
  assert.equal(profile.modelPreference, 'account:test/flash');
  assert.equal(await readFile(file, 'utf8'), source);
  const prompt = routingPrompt(extractRoutingContext(body(context)), [profile], choices);
  assert.match(prompt, /do not change the host's permissions/);
});
test('unready dependency blocks dispatch before the router or worker can run', async () => {
  const config = { router: 'router', routes: { router: { provider: 'cursor', model: 'a' } } };
  const pool = new ProviderPool({ limits: { cursor: 2 } }); let calls = 0;
  const relay = new ModelRelay(config, pool, async () => { calls++; }, async () => []);
  await relay.ready;
  await assert.rejects(relay.choose(body({ ...context, dependencies: [{ id: 'tests', status: 'pending' }] }), {}), { code: 'DEPENDENCIES_NOT_READY' });
  assert.equal(calls, 0); pool.close();
});
test('router receives profiles and context, records its basis, and reuses only the same actor task', async () => {
  const config = { router: 'router', routes: { router: { provider: 'cursor', model: 'a', auto: false }, 'cursor-a': { provider: 'cursor', model: 'b' } } };
  const pool = new ProviderPool({ limits: { cursor: 2 } }); let calls = 0;
  const relay = new ModelRelay(config, pool, undefined, async () => [{ name: 'reviewer', instructions: 'Review all changes', sha256: 'profile-hash' }]);
  await relay.ready;
  relay.call = async (route, prompt) => {
    calls++; assert.equal(route, 'router'); assert.match(prompt, /Review all changes/); assert.match(prompt, /42 tests passed/);
    return { runId: 'router-run', response: JSON.stringify({ route: 'cursor-a', reason: 'Final review after tests', role: 'reviewer', stage: 'final-review', basis: 'declared' }) };
  };
  const request = body(context), options = { transport: { sessionId: 'native-review' } };
  const decision = await relay.choose(request, options);
  assert.equal(decision.basis, 'declared'); assert.deepEqual(decision.dependencies, [{ id: 'tests', status: 'completed' }]);
  assert.ok(decision.profileCatalogSha256); relay.sessions.set(decision.key, decision);
  assert.equal((await relay.choose(request, options)).reused, true); assert.equal(calls, 1);
  await relay.choose(body({ ...context, actorId: 'another-reviewer' }), options); assert.equal(calls, 2);
  pool.close();
});

const workflowSource = await readFile(new URL('../.zcode/workflows/role-auto-route.dwf.ts', import.meta.url), 'utf8');
const workflowCode = stripTypeScriptTypes('async function workflow(){\n' + workflowSource + '\n}');
const run = new Function('args', 'world', 'agent', 'phase', 'report', workflowCode + '\nreturn workflow();');
const profiles = [{ name: 'code_explorer', description: 'Explore', instructions: 'No edits' }, { name: 'reviewer', description: 'Review', instructions: 'Final review' }];
const world = { async run(command, parameters) { return { exitCode: 0, stdout: parameters[0] === '-p' ? 'run-test' : JSON.stringify({ profiles }) }; } };
test('native workflow passes completed upstream results and waits for dependencies', async () => {
  const events = [], seen = [];
  const jobs = [{ id: 'explore', role: 'code_explorer', stage: 'exploration', task: 'Inspect', dependsOn: [] }, { id: 'review', role: 'reviewer', stage: 'review', task: 'Review', dependsOn: ['explore'] }];
  const agent = name => ({ async ask(prompt) { const supplied = extractRoutingContext({ messages: [{ role: 'user', content: prompt }] }).supplied; seen.push(supplied); events.push(name); return name + '-result'; } });
  const result = await run({ task: 'Review the project', jobs }, world, agent, () => {}, () => {});
  assert.deepEqual(events, ['explore', 'review']); assert.equal(result.length, 2);
  assert.deepEqual(seen[1].dependencies, [{ id: 'explore', status: 'completed', summary: 'explore-result' }]);
});
test('native workflow rejects graph cycles before workers and never runs downstream after failure', async () => {
  let calls = 0;
  const job = (id, dependencies) => ({ id, role: 'reviewer', stage: 'review', task: 'Review', dependsOn: dependencies });
  await assert.rejects(run({ task: 'Review', jobs: [job('a', ['b']), job('b', ['a'])] }, world, () => { calls++; }, () => {}, () => {}), /cycle/);
  assert.equal(calls, 0);
  await assert.rejects(run({ task: 'Review', jobs: [job('a', []), job('b', ['a'])] }, world, () => ({ async ask() { calls++; throw new Error('upstream failed'); } }), () => {}, () => {}), /upstream failed/);
  assert.equal(calls, 1);
});
test('task-only planning uses saved roles and independent work stays within fourteen actors', async () => {
  const jobs = Array.from({ length: 20 }, (_, i) => ({ id: 'review_' + i, role: 'reviewer', stage: 'review', task: 'Review', dependsOn: [] }));
  let active = 0, peak = 0, plans = 0;
  const agent = name => ({ async ask(prompt) {
    if (name === 'role-planner') { plans++; assert.match(prompt, /Final review/); return { jobs }; }
    active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return 'done';
  } });
  const result = await run({ task: 'Independent review tasks' }, world, agent, () => {}, () => {});
  assert.equal(plans, 1); assert.equal(result.length, 20); assert.equal(peak, 14); assert.equal(active, 0);
});
