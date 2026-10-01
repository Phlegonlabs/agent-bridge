# Agent Bridge

For the native model dropdown, use the registered **Cursor Bridge** provider. Two routes are exposed: `gpt-6.1-sol` and `gpt-6-astra`, both served by the Codex CLI adapter (`src/codex.mjs`) with exact-dispatch audit from session rollout evidence. GLM's model-protocol relay fails its exact-dispatch audit, so GLM models are not offered. See [native provider setup and status](docs/native-provider.md).

Run existing ZCode agent profiles from the official app's Dynamic Workflow command steps. Keep the official installation and Computer Use intact.

Cursor Agent CLI is also available as a worker with `--provider cursor --model composer-2.5`. It uses its own Cursor account and native ask mode. See [Cursor setup and usage](docs/cursor.md); the combined saved workflow is `glm-cursor-probe`.

Cursor Agent CLI and Claude Code CLI adapters remain available (`src/cursor.mjs`, `src/claude.mjs`). Cursor routes can be re-added in `config/native-provider.json`. Claude must stay a single-task delegate, not a relay route: the envelope/transport framing is refused by Anthropic (`stop_reason: "refusal"`, ToS on duplicating model outputs), while normal task delegation runs fine. Delegate one task with `node bin/bridge.mjs run --provider claude --model claude-opus-5-5 --cwd DIRECTORY --task-file FILE [--timeout-ms 120000]`, or use the `claude` / `claude-sonnet` workers in a preset workflow (`config/workflow-presets.json`); both keep the exact-dispatch audit (`claude-system-init`). The runtime resolver rejects npm `.cmd` shims, which Node cannot spawn without a shell.

`stream: true` requests on Claude routes stream for real: the CLI runs with `--include-partial-messages` and an incremental envelope scanner forwards the relay envelope's content string token by token (`src/stream-relay.mjs`). Requests with `response_format` stay buffered — their content needs the final validation pass, and a corrective round cannot retract text already sent. Non-stream requests are byte-identical to before.

The earlier CLI-worker workflow `model-bridge` remains available. It supports routing within its saved worker/model allowlist, a parallel limit of 14, and configurable fallback that is off by default. See [saved execution settings](docs/workflow-presets.md).

Status: local prototype. GLM-5.3-Flash, GLM-5.3 and Cursor Composer 2.5 ran together successfully through the official CLI's native Dynamic Workflow engine. The shipped preset is now Cursor-only. See [compatibility evidence](docs/compatibility.md) for verification of the current extension.

The bridge must verify the dispatched agent and model from runtime evidence. A model's statement that it delegated work is not evidence. Unsupported profile settings must fail explicitly rather than silently losing tool restrictions.

The first milestone covers Windows, profile discovery, bounded headless runs, structured results, and a two-model plan-mode workflow. The adapter currently accepts profiles with `permissionMode: plan`, explicit read tools, and no agent memory. It rejects writable profiles.

This repository does not contain credentials or copies of personal agent definitions.

## Setup

Requires Node.js 24+, the official Windows ZCode installation, and existing Markdown agents in `%USERPROFILE%\.zcode\agents`.

```powershell
npm ci --ignore-scripts
node bin/bridge.mjs doctor
node bin/bridge.mjs profiles
node bin/bridge.mjs login
```

`doctor` checks paths and profile metadata. It does not prove account or model access. `login` starts the official Z.AI browser authorization and waits up to five minutes. Complete it with the account that has GLM Coding Plan. A fallback URL is printed if the browser does not appear. Retry `login` if that link expires.

The official CLI stores this new login under `.bridge/account/.zcode/v2`. The bridge sets the account and provider-config paths only for its child processes. It does not copy desktop tokens or change desktop model settings. Agents continue to load from their existing user directory. Never upload `.bridge`: it contains credentials, raw model events, prompts, and execution logs. Windows directory access uses the local account's inherited permissions.

### Keep the provider running

The native provider (`bin/provider.mjs`, port 32147) is a plain Node process; it does not survive a reboot on its own. Register a scheduled task that starts it at logon and health-checks it every 5 minutes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-provider-task.ps1
```

`scripts/start-provider.ps1` is idempotent, so repeated runs only restart a dead provider. To remove the task: `Unregister-ScheduledTask -TaskName ZCodeWorkflowBridgeProvider -Confirm:$false`. To stop the provider for this session only: `node scripts/stop-provider.mjs`.

## Run one agent

```powershell
node bin/bridge.mjs run --agent code_explorer --cwd . --task-file examples/probe-task.txt --expected-model account:zai-individual-coding-plan/GLM-5.3-Flash
```

Choose `--agent` from `profiles`. The profile determines its model, reasoning level, prompt, and tools through ZCode's native Agent runtime. `--expected-model` asserts the model; it does not override it. A different model requires another existing profile configured for that model.

The stock CLI exposes neither `--agent` nor `--model`. This adapter asks its parent model to call the native Agent tool once, then verifies the dispatch, child session, actual model request, and child result from runtime events. This adds a parent model request and can fail if it does not follow the dispatch contract. Parent prose and a zero CLI exit code are insufficient for success.

The command prints one JSON result. Exit code `0` means `ok: true` with verified agent/model evidence. Failures exit `1`. Examples include `PROVIDER_UNAVAILABLE`, `MODEL_MISMATCH`, `WRONG_DISPATCH`, and `TIMEOUT`. Logs are stored under this bridge repository's `.bridge/runs`, even when the target workspace differs.

## Dynamic Workflow

Open this repository as the project in official ZCode. A project workflow named `glm-parallel-probe` is provided under `.zcode/workflows`. Ask ZCode:

> 執行本專案已保存的 glm-parallel-probe 工作流，使用 CreateWorkflow 的 saved 來源，scope 為 project。完成後回報兩個 Agent 的 actualModel 和結果。

The workflow starts `code_explorer` and `reviewer` through `Promise.all`, checks both process exits, and reports their verified models. It uses paths relative to this repository. [The standalone example](examples/parallel-review.dwf.ts) shows absolute paths for a workflow in a different project.

To assign an agent to a stage, put its name in that stage's `world.run` arguments. To run stages sequentially, await the first stage before starting the second. The native Sub Agent Model selector controls native workflow actors; this bridge uses the selected custom profiles instead. It does not edit that selector.

The saved workflow compiled and completed through the official bundled CLI's native Dynamic Workflow engine. Launching it from the desktop UI has not been tested. External CLI workers do not inherit desktop Computer Use. The official app remains installed and retains its own capabilities.

## Limits and verification

- The bridge requests plan mode and accepts plan-mode profiles. This is not an operating-system sandbox. Existing native plugins, hooks, skills, and runtime state remain controlled by ZCode.
- Keep each command's workflow timeout longer than the bridge timeout plus process cleanup time. The example uses 60 seconds plus a 30-second allowance.
- Cancellation and deadlines terminate the owned process tree and check the observed Windows process identities. A cleanup result of `unconfirmed` requires inspection; it is never reported as successful work. Detached daemons are unsupported.
- Project agents that shadow a selected user agent are rejected. Unsupported frontmatter fields also fail explicitly.
- Changing the profile during a run invalidates that run's result. Mid-run model switching and writable workers are not implemented.

Run `npm test` for the offline suite. Live GLM, Cursor and native Dynamic Workflow evidence is tracked in [the compatibility notes](docs/compatibility.md).
