![Agent Bridge — three native CLI paths cross a glass bridge into one workspace](docs/assets/agent-bridge-cover.png)

# Agent Bridge

**Your CLIs. One workspace.**

[繁體中文](README.zh-TW.md) · [Quick start](#quick-start) · [Setup guide](#1-install-the-prerequisites) · [Troubleshooting](#troubleshooting) · [Verification](docs/compatibility.md)

Connect **ZCode** to your installed **Codex, Cursor and Claude Code** CLIs. Each CLI uses its existing account login.
GLM stays on ZCode's native connection, with optional profile workflows.

Agent Bridge runs on your machine at `127.0.0.1`. It checks native model and session evidence before accepting results.
Credentials and execution logs stay in ignored `.bridge/` state. Install the upstream apps and arrange model access separately.

## What you can do

- **Use your CLI models in ZCode.** Choose a provider, model and supported reasoning level from the model selector.
- **Delegate workspace tasks to Claude.** Let Claude Code use its own tools under the configured file and command permissions.
- **Follow long tasks.** View labelled lifecycle status, stream Codex answers and reconnect to session-owned work.
- **Run independent workflow jobs.** Use saved presets or explicit job assignments with bounded concurrency and deadlines.
- **Generate images with Codex.** Use the separate image command and your existing Codex login.

Codex and Cursor return text or validated tool calls for ZCode to execute. Claude delegates can edit the workspace.
Streamed Codex text remains provisional until final verification; tool calls wait for validation.

## Quick start

You need **Git, Node.js 24+, ZCode**, and at least one supported CLI with model access.
Open ZCode and complete its first-launch setup. Install your chosen CLI using the [prerequisite guide](#1-install-the-prerequisites).

```sh
git clone https://github.com/Phlegonlabs/agent-bridge.git
cd agent-bridge
npm ci --ignore-scripts
node bin/bridge.mjs setup
node bin/provider.mjs
```

The interactive wizard selects providers and models, offers login, then saves and registers your choices in ZCode.
Review the displayed permissions before saving. Keep the provider terminal running.

In ZCode, select **Agent Bridge** for Codex/Cursor or **Claude Bridge** for Claude, then choose your configured model.
For Claude, open a project workspace first. Send: **Reply BRIDGE_PROBE_OK without using tools or changing files.**

Confirm the reply. If connection fails, follow [troubleshooting](#troubleshooting). Stop the foreground provider with Ctrl+C.

> Model IDs below are examples. Use `models --provider PROVIDER` to inspect your local catalog, then verify account access.

## Choose a connection

| Connection | How a task runs | Account | Bridge provider in ZCode |
| --- | --- | --- | --- |
| Codex | Returns text or validated tool calls; ZCode runs host tools | Existing Codex login | Agent Bridge |
| Cursor | Native ask mode returns text or validated tool calls; ZCode runs host tools | Existing Cursor login | Agent Bridge |
| Claude Code | Executes a delegated task with its own tools; can edit the active workspace | Existing Claude Code login | Claude Bridge |
| GLM | ZCode native models; optional plan-mode profile workers | ZCode desktop connection, plus isolated CLI login for profile workflows | ZCode native provider |

The bridge targets Windows, macOS and Linux. See [verification status](docs/compatibility.md) for the distinction between offline tests, installation checks and authenticated requests. Model access depends on your account, installed CLI and selected model.

## 1. Install the prerequisites

Install Git, Node.js **24 or later**, [ZCode](https://zcode.z.ai/en/docs/install), and whichever CLIs you want to use. Open ZCode once and complete its first-launch setup so its provider configuration exists. Personal agent profiles are only required for GLM profile workflows.

```sh
git clone https://github.com/Phlegonlabs/agent-bridge.git
cd agent-bridge
npm ci --ignore-scripts
node --version
```

Use the official installers below. Open a new terminal after installation if a command is not on PATH. The bridge does not run these installers for you.

| CLI | Windows PowerShell | macOS / Linux |
| --- | --- | --- |
| [Claude Code](https://code.claude.com/docs/en/setup) | `irm https://claude.ai/install.ps1 \| iex` | `curl -fsSL https://claude.ai/install.sh \| bash` |
| [Codex](https://github.com/openai/codex/blob/main/README.md) | `irm https://chatgpt.com/codex/install.ps1 \| iex` | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` |
| [Cursor CLI](https://cursor.com/docs/cli/installation) | `irm 'https://cursor.com/install?win32=true' \| iex` | `curl https://cursor.com/install -fsS \| bash` |

The backslash before each pipe is Markdown table escaping; copied commands use a normal `|`. Claude workspace shell tools on Windows require Git for Windows so the native CLI provides Bash. Use the native Claude/Codex executable rather than an npm `.cmd` launcher. Cursor's command is `agent`, not the editor's `cursor` launcher.

Check each selected CLI with `claude --version`, `codex --version` or `agent --version`. The optional `scripts/setup-cursor.ps1` preserves the older verified Windows x64 package under `.bridge/tools`; it is not the cross-platform installation path.

## 2. Sign in and inspect models

Run the commands for each selected provider:

```sh
node bin/bridge.mjs login --provider claude
node bin/bridge.mjs login --provider codex
node bin/bridge.mjs login --provider cursor
node bin/bridge.mjs doctor --provider claude
node bin/bridge.mjs doctor --provider codex
node bin/bridge.mjs doctor --provider cursor
node bin/bridge.mjs models --provider claude
node bin/bridge.mjs models --provider codex
node bin/bridge.mjs models --provider cursor
```

Login invokes that provider's official CLI and allows about five minutes for browser authorization. If you are already signed in, skip login and run doctor. Raw login output stays in private logs; the public result contains status, not account credentials.

Doctor distinguishes `installed`, `authenticated`, `modelSelectable` and `requestVerified`. A successful preflight is **not** a successful model request. Codex reads its local model cache; if missing, open `codex` once after login to let the official CLI populate it. Cursor reads its native catalog. Claude lists adapter candidates, not your account's entitlement list; you may select another full `claude-...` ID and then verify it with a live request.

`doctor --provider all` checks all four providers. A provider you have not installed can make that aggregate command exit 1; use individual checks for a partial installation.

## 3. Configure the bridge

For the guided setup, use an interactive terminal:

```sh
node bin/bridge.mjs setup
```

The wizard asks for providers, offers login when needed, shows model choices, asks for exact model IDs and a fallback choice, then displays the configuration before saving and registering it in ZCode. You can configure one provider without installing the others.

Claude defaults to `workspace-write`: Read/Glob/Grep, Edit/Write within `./**`, and the displayed shell command patterns. Those patterns include language/build tools and local Git commands. This is a CLI permission policy, not an operating-system sandbox. Review the printed rules; worker assignments still prohibit publishing, deletion, background services and permission bypass. Use `--write-mode read-only` for review-only delegates.

For a repeatable setup, specify all selections explicitly. Replace these example IDs with IDs from your catalogs:

```sh
node bin/bridge.mjs setup --providers codex,claude --models codex:gpt-6.1-sol,claude:claude-opus-5-5 --fallback off --dry-run
node bin/bridge.mjs setup --providers codex,claude --models codex:gpt-6.1-sol,claude:claude-opus-5-5 --fallback off
node bin/bridge.mjs setup --providers cursor --models cursor:composer-2.5 --fallback off
```

These are alternative configurations. A later setup replaces the bridge's selected route set after backing it up; include all providers/models you want to keep. It preserves unrelated ZCode providers and manual overrides. Repeating identical setup does not duplicate providers or rewrite unchanged settings.

`--dry-run` checks and prints the proposed settings without saving or registering them. `--port 32147` changes the local port. `--config FILE` selects an explicit destination; use the same option when starting or registering that configuration.

Settings are resolved in this order:

1. Explicit `--config FILE`.
2. `.bridge/config/native-provider.json`, created by setup.
3. `config/native-provider.json`, the existing legacy configuration.

Setup does not rewrite the tracked legacy configuration or migrate existing sessions. It backs up changed local settings and changed ZCode registration files under `.bridge/`. Keep backups private.

### Optional Claude fallback

Choose `off` or a selected Codex model ID. The target must exist in the generated route set and support the requested reasoning effort:

```sh
node bin/bridge.mjs setup --providers codex,claude --models codex:gpt-6.1-sol,claude:claude-opus-5-5 --fallback gpt-6.1-sol --fallback-effort xhigh
```

Fallback handles Claude timeout and rate/usage limits after worker cleanup. Codex continues through ZCode's host tools and inspects partial work. It preserves the assignment's file and command restrictions. It does not replay the failed Claude turn. Permission denial, cancellation, model mismatch, protocol failure and unconfirmed cleanup do not trigger fallback. Owned Claude streams show labelled bridge status in ZCode's Thought area before audited final text. These messages contain observations, not native reasoning. Other provider routes keep their selected model.

## 4. Start the provider and connect ZCode

Keep this foreground process running in its terminal:

```sh
node bin/provider.mjs
```

For a custom configuration, use `node bin/provider.mjs --config FILE`. Success prints `ready: true` and the local address. An authenticated bridge with the same configuration is reused. A different service or configuration on that port produces `PORT_IN_USE`; inspect the existing process before restarting it. The bridge does not choose another port or kill an existing service automatically.

In ZCode's model selector, choose **Agent Bridge** for Codex/Cursor or **Claude Bridge** for Claude, then select a configured model and reasoning level. Registration uses OpenAI Chat Completions at `http://127.0.0.1:32147/v1`; the local token is handled by setup. You do not paste your CLI account token into ZCode.

Send a first task such as: **Reply BRIDGE_PROBE_OK without using tools or changing files.** Confirm the reply. For Claude, open a project workspace; writable delegation also requires ZCode's session ID and working-directory context.

`http://127.0.0.1:32147/health` only proves service readiness. Authenticated `/status` and `/v1/models` describe queues and routes. Neither proves account/model access. `/v1/chat/completions` handles model requests. Chat requests accept text/function schemas; image input is not supported here.

For a separate native CLI request check:

```sh
node bin/bridge.mjs doctor --provider codex --live --model gpt-6.1-sol --cwd .
node bin/bridge.mjs doctor --provider claude --live --model claude-opus-5-5 --cwd .
node bin/bridge.mjs doctor --provider cursor --live --model composer-2.5 --cwd . --trust-workspace
```

`requestVerified: true` confirms the exact marker and native completion/model evidence for that CLI. It does not prove a ZCode UI round trip. To inspect UI requests, keep `.bridge/provider/requests` local and check the request's verified result; do not upload raw logs.

Stop the foreground process with Ctrl+C. `node scripts/stop-provider.mjs` requests graceful shutdown of the configured provider and cancels active requests; add `--config FILE` for a custom configuration. The legacy Windows scheduled-task installer remains available for existing users; cross-platform startup-at-login is not included in this version. A scheduled task can restart a stopped Windows provider.

## GLM: native connection and profile workflows

For normal GLM chat, follow [ZCode Connect Models](https://zcode.z.ai/en/docs/configuration) and select a native GLM model. No Agent Bridge provider registration is needed.

For optional CLI profile workflows, the desktop login is not assumed to authenticate the isolated CLI account:

```sh
node bin/bridge.mjs login --provider zcode
node scripts/install-example-agents.mjs
node bin/bridge.mjs profiles
node bin/bridge.mjs models --provider zcode
node bin/bridge.mjs doctor --provider zcode
node bin/bridge.mjs run --provider zcode --agent bridge-explorer --cwd . --task-file examples/probe-task.txt
```

The example installer creates `bridge-explorer.md` and `bridge-reviewer.md` under your user `.zcode/agents` directory. It refuses to overwrite either existing profile. Review their provider-qualified model IDs for your account before running. The samples are generic; no personal profiles are shipped.

Profiles must use `permissionMode: plan`, explicit read tools and no agent memory. Writable or shadowed profiles are rejected. `--expected-model PROVIDER/MODEL` asserts identity; it does not override the profile model. Success requires `ok: true`, the expected actual model and native child-session evidence, not just CLI exit 0.

Open this checkout as a ZCode project. Ask it to use `CreateWorkflow` with `saved.name: glm-parallel-probe` and `saved.scope: project`. `glm-cursor-probe` adds the explicitly trusted Cursor probe. Review model IDs, trust and deadlines in the saved files first. These workflows require the sample profile names; another profile name must be changed in the workflow commands.

## Standalone tasks and saved workflows

```sh
node bin/bridge.mjs run --provider claude --model claude-opus-5-5 --cwd . --task-file examples/probe-task.txt
node bin/bridge.mjs run --provider codex --model gpt-6.1-sol --cwd . --task-file examples/probe-task.txt
node bin/bridge.mjs run --provider cursor --model composer-2.5 --cwd . --task-file examples/probe-task.txt --trust-workspace
node bin/bridge.mjs presets
```

Standalone Claude stays read-only; writable execution and persistent session continuity belong to the configured native delegate routes. Cursor trust accepts only the supplied workspace; ask mode does not enable writable workers. External workers do not inherit ZCode desktop Computer Use.

`model-bridge` is the saved batch workflow. Its tracked preset is an example with specific Cursor/Claude models, not a catalog for every account. Copy and edit the preset for your account before use, then pass `--config FILE` to CLI workflow/presets commands. Saved desktop workflow commands must use that same file if you customize the preset. Codex is available through native provider routes and standalone tasks, not the existing batch preset adapter.

The batch workflow accepts explicit independent `{id, worker, task}` jobs or uses ZCode's native planning actor. Run dependent stages as later batches. Its maximum is 14 active jobs, not a request to create 14 jobs. Preset fallback is separate from Claude native-provider fallback and remains off in the example. See [workflow settings](docs/workflow-presets.md) for deadlines, candidate rules and full-result handling.

## Image generation, sessions and maintenance

- **Codex images:** write a UTF-8 prompt file, then run `node bin/codex-image.mjs --cwd . --prompt-file PROMPT_FILE`. This uses native Codex image generation and its existing login, with no paid Image API fallback. A verified PNG is copied to a new `generated-images/codex-UUID/image.png` directory. The supplied [ZCode skill](skills/codex-imagegen/SKILL.md) needs your checkout path before installation; reference-image editing is not supported by this entry.
- **Claude sessions:** completed turns resume the native session; duplicate completed requests use saved results. Workspace/policy changes and uncertain interrupted writes are rejected. Inspect with `node scripts/claude-session-recovery.mjs .bridge/provider/sessions inspect --session-id ID --session-type TYPE`. Recovery requires checking native history, files and process state; see [recovery instructions](docs/native-provider.md).
- **Updates:** stop your provider after checking active work, pull the repo, run `npm ci --ignore-scripts`, review any catalog changes, then repeat setup or run `node scripts/register-provider.mjs --update`. Use `--config FILE` for custom registration. Restart deliberately; current sessions are not replayed or migrated automatically.
- **Limits:** global 14, Codex 4, Claude 4, Cursor 12. Claude defaults to a 75-minute attempt and a 90-minute request, including queueing. Set `claudeDelegate.attemptTimeoutMs` and `claudeDelegate.requestTimeoutMs` in your provider configuration. Configurations without `claudeDelegate` use these defaults without rewriting existing files. Codex and Cursor retain the generic configured budgets. Batch preset deadlines remain separate. These limits do not account for other apps using your subscriptions. Unsupported reasoning strengths fail explicitly.
- **Private state:** never publish `.bridge`, `.env` files, CLI credentials, personal profiles or raw transcripts. Windows uses inherited local account permissions. Keep the provider on loopback.

## Troubleshooting

### Reconnect to an existing task

For session-identified Codex and long Claude tasks, reconnect with the same session headers, model, effort and request content.
The bridge attaches identical retries to the existing task, even when switching between streaming and buffered responses.
Completed retries return the audited result without another worker.
A different active turn returns `SESSION_BUSY`.
Closing the connection detaches it; the worker continues until completion, its deadline, or authenticated provider shutdown.
Reconnects do not reset deadlines.
Provider shutdown waits for worker cleanup.
After a service crash, unfinished sessions require inspection before recovery.

### Inspect progress

The authenticated `/status` endpoint reports active delegate jobs, waiters and retained results.
Inspect individual workflow actor and subagent requests with the CLI:

```sh
node bin/bridge.mjs status --watch
node bin/bridge.mjs status --task-id UUID
node bin/bridge.mjs status --session-id ID --session-type subagent --watch
node bin/bridge.mjs status --cwd /absolute/project/path --watch
```

Project lookup matches the request's declared working directory. Use `--config FILE` for a custom provider configuration.
Task IDs arrive in the `X-Agent-Bridge-Task-Id` response header.
Status separates queueing, worker start, last observed native activity, cleanup and audited completion.
Heartbeat and polling do not advance activity. Silence does not trigger a rerun.
The monitor ends after ten minutes by default; Ctrl+C stops only monitoring.

### Understand streaming and retained results

Owned Claude streams show lifecycle, elapsed time and recent activity in ZCode's Thought area.
Codex streams show the same labelled status and native answer deltas. Reconnects replay the retained answer prefix.
Tool calls and structured responses remain buffered until verification. Failed partial streams cannot trigger correction or fallback.
Codex replay expires with the in-memory cache or provider restart. Status lookup remains independent.
For a CLI workflow batch, use `status --workflow-id UUID --watch`; its UUID appears in progress output.
The saved `model-bridge` workflow reports job states while waiting for results.
Standalone CLI workers print sanitized progress to stderr and keep final JSON on stdout.
Workflow status is the last recorded snapshot; it does not certify that an old process remains alive.
Results remain cached for up to 15 minutes, within count and memory limits.
Completed Claude receipts also support replay after cache expiry or restart.
HTTP reconnection cannot guarantee exactly-once rendering in the host UI.

### Resolve common errors

| Result | Next step |
| --- | --- |
| `*_NOT_INSTALLED` / `*_RUNTIME_INVALID` | Use the official native installer, reopen the terminal, or set the executable/bundle path below. |
| `AUTH_REQUIRED` | Run login for that exact provider, then doctor. |
| `ZCODE_CONFIG_REQUIRED` | Open ZCode and finish first launch before setup registration. |
| `CODEX_MODEL_CATALOG_UNAVAILABLE` | Open the official Codex CLI after login to populate its local cache. |
| `CODEX_CONTENT_REJECTED` | The upstream provider rejected the request content. The bridge does not replay or bypass that rejection. |
| `MODEL_UNAVAILABLE` / reasoning error | Re-list models, choose an exact ID and a declared reasoning strength. |
| `PORT_IN_USE` | Inspect the listener; reuse or deliberately stop the correct provider before restarting. |
| `AGENT_NOT_FOUND` / `PROFILE_NOT_READ_ONLY` | Install/review generic plan-mode profiles, or use an existing compatible profile explicitly. |
| Session uncertainty / denied tools | Inspect partial work and native evidence. Do not replay writes or bypass permissions. |
| CLI works but ZCode cannot connect | Confirm the provider is running, select its registered provider/model, and bypass proxies for `localhost,127.0.0.1`. |

Optional environment overrides: `ZCODE_BRIDGE_CLI` (official `zcode.cjs`), `CLAUDE_BRIDGE_BIN` and `CODEX_BRIDGE_BIN` (native executable), `CURSOR_BRIDGE_BIN` (official `agent` executable), `CURSOR_BRIDGE_DIR` (official runtime package directory) and `CODEX_HOME` (existing Codex state). Set them in the terminal that runs setup/provider; the bridge does not rewrite your shell profile. Linux AppImage users can extract the app and point `ZCODE_BRIDGE_CLI` at its `resources/glm/zcode.cjs`.

## Detailed guides

| Guide | Use it for |
| --- | --- |
| [Native provider](docs/native-provider.md) | Routing, permissions, streaming, session recovery and task status |
| [Workflow presets](docs/workflow-presets.md) | Batch jobs, model selection, deadlines and preset fallback |
| [Cursor CLI](docs/cursor.md) | Cursor runtime discovery, trust and native model evidence |
| [Compatibility](docs/compatibility.md) | Offline, authenticated CLI and desktop verification boundaries |
| [Local deployment](docs/DEPLOYMENT.md) | Recorded source identity, private state and deliberate restarts |
| [Document index](docs/DOCUMENTS.md) | All guides and implementation records |

## Development and evidence

Run `npm test` for offline checks. GitHub Actions runs Node 24 on Windows, macOS and Linux without account credentials. Authenticated requests are recorded separately in [compatibility notes](docs/compatibility.md). [Document index](docs/DOCUMENTS.md) links the detailed guides and historical implementation records.

This repo is distributed as a Git checkout. npm publication is disabled.
