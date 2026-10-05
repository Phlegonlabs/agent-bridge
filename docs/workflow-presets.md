# Saved execution settings and auto route

The tracked preset is an example, separate from setup's native provider configuration. Review model IDs against your account catalog before running it. To customize it, copy the preset to a new file, edit the worker/model choices, and pass `--config FILE` to both `presets` and `workflow`. A saved desktop workflow must pass that same file to both commands. The existing batch adapter supports ZCode, Cursor and Claude; Codex uses native provider routes or standalone tasks.

Select the project workflow `model-bridge` in official ZCode. Supply the task for the current stage. The saved preset chooses allowed worker models, the parallel limit, deadlines and fallback policy. You do not need to select every model again.

This is a saved workflow entry, not a new item in ZCode's model dropdown. The current upstream saved-argument form accepts string, number, boolean and JSON fields; it has no custom enum/dropdown field. The official installation is unchanged.

## Defaults

`config/workflow-presets.json` stores the default preset `cursor`:

| Worker | Native execution | Model |
| --- | --- | --- |
| `explorer` | Cursor CLI ask mode | Composer 2.5 Fast |
| `reviewer` | Cursor CLI ask mode | Grok 4.7 High |
| `cursor` | Cursor CLI ask mode | Composer 2.5 |
| `claude` | Claude Code CLI, single-task delegation | Claude Opus 5.5 |
| `claude-sonnet` | Claude Code CLI, single-task delegation | Claude Sonnet 5.5 |

Claude workers receive one self-contained task per job and run through the native Claude Code CLI with model and session audits. Native provider routes also support Claude, but must use `mode: "delegate"`; Claude executes the task itself rather than acting as a text/function-call relay. See [native provider](native-provider.md).

Every route is verified from the model name Cursor reports at runtime. Cursor's catalog label and that runtime name can differ, so verification requires the catalog label's tokens plus any tier keyword spelled out in the route id. Cursor adding a token (`Grok 4.7  High` reported as `Grok 4.7 256K High`) passes; a missing family or tier token still fails. See [native provider](native-provider.md) for the exact rule.

- Parallel limit: **14 active jobs per batch**, not 14 jobs created automatically. The same worker can serve multiple independent jobs.
- Attempt deadline: 420 seconds. Batch deadline: 540 seconds, followed by owned-process cleanup. Queued jobs share this batch deadline.
- Automatic fallback: **off**, with empty candidate lists.
- Workers remain read-only through native plan/ask behavior. These are not operating-system sandboxes, and this extension does not enable implementation workers.

Worker descriptions help the planner choose. Routing is free within the saved allowlist, not a fixed mapping from stage names. Add another explicit route and worker to the configuration to expand that allowlist. ZCode profiles still determine their own models; `expectedModel` checks their identity rather than overriding it. Use `node bin/bridge.mjs profiles` to inspect ZCode profiles, and `node bin/bridge.mjs models --provider cursor` to obtain current Cursor model IDs.

## How auto route works

The main ZCode model can split the stage into independent jobs and pass them in `saved.args.jobs`. The bridge checks the whole job list against the preset before dispatch and uses the assigned worker's saved route.

When the saved workflow receives only `task`, its native `bridge-router` actor creates that job list. This actor's model follows ZCode's native workflow actor/Sub Agent Model settings. The bridge cannot force it to use the outer main model. Supplying `jobs` from the main model skips this additional actor.

The planning actor receives worker descriptions and route/model names and is instructed to plan without tools. That instruction is not a host permission restriction: the native actor retains ZCode's normal runtime capabilities. Worker execution still uses the bridge's existing native model audits and read-only adapter checks.

Only independent jobs belong in one batch. The outer orchestrator must await one batch, read its results, and prepare a later batch for dependent stages. Each batch has its own concurrency limit; there is no global cap across separate ZCode workflow runs.

## Check execution

Every job records queueing, worker start, native activity and terminal verification.
The CLI writes sanitized progress to stderr; stdout remains one final JSON result.
Workflow snapshots are private files under `.bridge/workflows/<UUID>/status.json`.
The saved workflow reports its UUID before execution and polls status while the batch runs.
Its intermediate reports show job states and last observed activity, without worker content.
Reports are bounded below ZCode's item limit. Existing native actor views may still show final answers only.

Use the UUID to check a batch independently:

```sh
node bin/bridge.mjs status --workflow-id UUID
node bin/bridge.mjs status --workflow-id UUID --watch
```

Lookup reads recorded snapshots; nonterminal process liveness remains unverified.
The activity age increases during silence. Heartbeats and status reads do not update activity timestamps.
Missing or old status is unavailable evidence, never permission to rerun a job.
`workflow --run-id UUID` reserves a new UUID; an existing run directory is rejected.
Standalone `run` commands print the same lifecycle checks to stderr.
For native provider subagents, use the authenticated task lookup in [native provider](native-provider.md).

## Start from ZCode

Open this repository as the project. For main-model routing, ask:

> 使用本專案的 model-bridge 工作流。先讀取 config/workflow-presets.json，在允許的 worker 裏自由分派本階段的獨立任務。把分派陣列放進 CreateWorkflow 的 saved.args.jobs，總任務放進 saved.args.task，saved.name 為 model-bridge、scope 為 project。沿用預設並行上限 14，fallback 關閉。完成後彙整實際模型與結果。

The saved parameter form contains:

| Parameter | Meaning |
| --- | --- |
| `task` | Required overall task for this stage. |
| `jobs` | Optional JSON array of `{id, worker, task}`. Omit to invoke the native planning actor. |
| `preset` | Saved preset name. Blank uses the config's `defaultPreset`. |
| `parallelLimit` | Optional 1..14 override, valid only for this run. |
| `fallback` | Optional `off` or `configured`; blank inherits the preset. |

The workflow explicitly trusts this repository for Cursor, as the earlier project probe did. It runs commands relative to this repository. Do not copy it to another workspace without updating the bridge path and reviewing workspace trust.

## CLI use

```powershell
node bin/bridge.mjs presets
node bin/bridge.mjs workflow --cwd . --jobs-file examples/workflow-jobs.json --trust-workspace
node bin/bridge.mjs workflow --cwd . --task-file examples/probe-task.txt --parallel-limit 2 --fallback off --trust-workspace
```

The job-file form supports independent tasks and explicit assignments by the orchestrator. The shared-task CLI form sends the same task to all preset workers, or only the comma-separated `--workers` names; it does not invoke an AI planner. Auto planning is in the saved workflow or the outer main model.

Use `--config FILE` for another saved configuration. Optional `--preset NAME`, `--parallel-limit N` and `--fallback off|configured` affect only that run. Job files contain an array, not an object wrapper. A batch accepts 1..32 jobs. Native inline job JSON is limited to 12,000 characters to fit Windows command lines; use the CLI job-file form for longer plans.

## Configure fallback

Fallback is separate from routing. To enable it later, explicitly choose each worker's ordered `fallbacks` route names and set `fallback.enabled` to `true`, or override one run with `fallback=configured`. For example, placing `"cursor-explorer"` in `workers.cursor.fallbacks` allows a later Composer-to-Composer-Fast switch. This example is not enabled in the supplied configuration.

Candidates must exist in the same preset; there may be at most two, with no repeats. Each job tries its primary route and each configured candidate at most once. A fallback keeps the same task and its original parallel slot. The candidate's own native profile/model restrictions apply.

Allowed failure triggers are `TIMEOUT`, `PROVIDER_UNAVAILABLE` and `CURSOR_MODEL_UNAVAILABLE`. A timeout can fall back only after confirmed process-tree termination. Cancellation, auth/trust failures, model mismatch, protocol rejection, unknown errors and unconfirmed cleanup never trigger a switch. Unconfirmed cleanup stops pending jobs and cancels other active jobs. Rate limits and generic provider errors are not automatically retried.

## Results and evidence

Every job records its chosen worker, route, actual model, attempts and whether fallback was used. Each batch saves its preset snapshot and task hashes under `.bridge/workflows/<run-id>`. Full responses and native worker logs stay in ignored local directories.

The command output includes bounded response excerpts to stay below ZCode's 256 KiB `world.run` capture limit. `responseTruncated: true` means the orchestrator must read the full `result.json` in the reported batch `logs` directory before treating the response as complete. Nonzero command exits are failures even if individual jobs succeeded; their results remain in the journal.

See [compatibility evidence](compatibility.md) for actual live runs and unverified limits.

Upstream references: [saved workflow parameter form](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/packages/ui/src/settings/saved-workflows/savedWorkflowArgsForm.ts), [workflow facade and actor API](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/dynamic-workflow/src/facade/dts.ts).
