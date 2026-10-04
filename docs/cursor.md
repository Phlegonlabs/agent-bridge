# Cursor worker

Cursor Agent CLI is a second execution provider. ZCode Dynamic Workflow invokes it with a command step, alongside the existing ZCode agents.

## Setup

New installations use the official Cursor CLI installer for their platform and the `agent` executable. `CURSOR_BRIDGE_BIN` selects its explicit executable path. An existing pinned Windows x64 package `2026.09.18-9a7762b` under ignored `.bridge/tools` remains supported and is preferred when present; `CURSOR_BRIDGE_DIR` selects another official runtime package directory. Neither path uses the editor's `cursor` launcher. The commands below describe the optional pinned Windows installation; see the README for the cross-platform setup.

```powershell
pwsh -NoProfile -NonInteractive -File scripts/setup-cursor.ps1
node bin/bridge.mjs doctor --provider cursor
node bin/bridge.mjs models --provider cursor
```

The setup script downloads a fixed official package and checks its recorded SHA-256. It creates a new directory and preserves any existing installation. It does not modify PATH. An interrupted setup leaves its files in place and reports an existing target on retry; inspect that target before choosing recovery.

The CLI uses its existing Cursor login. If needed, `node bin/bridge.mjs login --provider cursor` starts Cursor's native browser login. Login output stays in ignored private logs, and the bridge reports only authentication status. This account is separate from the isolated ZCode GLM account. The bridge does not read or translate tokens itself.

Use `--cursor-dir` or `CURSOR_BRIDGE_DIR` to select another trusted official package directory containing `package.json`, `index.js`, and its bundled Node executable. Compatibility with other versions is not assumed.

## Run

```powershell
node bin/bridge.mjs run --provider cursor --model composer-2.5 --cwd . --task-file examples/probe-task.txt --trust-workspace
```

The owner selected Composer 2.5 for the first worker. Every workflow command can choose a different explicit model from the native `models` catalog. `auto` is rejected because it does not identify a fixed model.

`--trust-workspace` explicitly accepts Cursor's trust prompt for the supplied workspace. Use it only for a workspace you trust. The saved probe includes it for this bridge project. It does not enable force mode or approve MCP servers. Runs use native `--mode ask`; writable Cursor workers are not part of this milestone. Native rules, plugins, hooks and permissions still belong to Cursor, and ask mode is not an OS sandbox.

Cursor commands do not accept ZCode's `--agent`, `--cli` or `--expected-model`. A ZCode profile's prompt, reasoning setting and tool allowlist are not copied into Cursor. The Cursor worker receives the task file directly and uses its own native environment.

## Result evidence

Success requires process exit 0, a matching native `system/init` model, a consistent session, and a successful terminal result with `is_error: false`. Assistant text claiming a model is ignored. An observed model mismatch, known write tool, session mismatch, malformed stream, timeout or cancellation fails the run.

Cursor's init event reports a model display name. The bridge maps that name to the explicit ID in the current native model catalog. `modelEvidence: cursor-system-init` makes this evidence source visible. It is not the per-request provider telemetry used for ZCode agents and does not independently prove the backend used for every inference.

Model listing is included in the requested run deadline. Logs remain under `.bridge`; the public result has the same result schema as the GLM adapter.

## Mixed workflow

The saved project workflow `glm-cursor-probe` runs:

| Worker | Model |
| --- | --- |
| ZCode `bridge-explorer` | GLM-5.3-Flash |
| ZCode `bridge-reviewer` | GLM-5.3 |
| Cursor | Composer 2.5 |

In the official ZCode project, ask it to run the saved workflow with `CreateWorkflow`, `saved.name: glm-cursor-probe`, and `saved.scope: project`. The workflow checks all three exits and results before reporting success. See `compatibility.md` for current live evidence.

Official references: [installation](https://cursor.com/docs/cli/installation), [CLI parameters](https://cursor.com/docs/cli/reference/parameters), and [output events](https://cursor.com/docs/cli/reference/output-format). Actual flags, authentication and models were also checked against the pinned local runtime.
