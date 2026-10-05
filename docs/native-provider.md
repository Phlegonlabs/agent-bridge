# Native provider

Select **Agent Bridge** for Codex or Cursor, or **Claude Bridge** for a task executed by Claude Code CLI. The connection is OpenAI Chat Completions at `http://127.0.0.1:32147/v1`. Its local token is separate from the CLI account credentials.

Use `node bin/bridge.mjs setup` for a new installation. It selects models from your local environment and writes `.bridge/config/native-provider.json`. Explicit `--config FILE` takes priority, followed by that local file, then the legacy tracked `config/native-provider.json` (four Codex models, eleven Cursor families and two Claude models). The legacy catalog is a tested example, not an entitlement list.

Each model advertises only its configured reasoning levels. Models without effort control expose `default`. Codex receives `model_reasoning_effort`; Cursor selects an exact native model variant, preserving the fast qualifier. Unsupported strengths fail instead of selecting another model. See the README for installation, login and first-request verification on each platform.

Setup registers both provider groups using the same reconciliation as updates. Run `node scripts/register-provider.mjs --update` after manually changing routes; custom configurations also need `--config FILE`. It backs up changed native provider files and preserves other providers and manual model overrides. Start in the foreground with `node bin/provider.mjs`; stop with Ctrl+C or `node scripts/stop-provider.mjs`. Restart deliberately after changing routes. Legacy Windows launcher and scheduled-task scripts remain available, but the new public setup does not install a background service.

## Claude task execution

Claude routes require `mode: "delegate"`. They hand the full current task and conversation context to Claude CLI, using context files for large transcripts. The working directory must come from a system or developer `working directory:` marker. Writable routes reject missing or invalid workspaces and missing ZCode session IDs.

The configured `workspace-write` policy allows Read, Glob, Grep, file edits within the workspace, and explicitly named shell command patterns. Claude uses `dontAsk` permissions with no permission prompts. A writable turn that finishes after a denied tool retains its result and reports the denial; this does not certify that every requested action succeeded. Read-only denials fail the run. This is a CLI permission boundary, not an operating-system sandbox. Background services, publishing, deletion and permission bypass are outside the worker assignment. Standalone CLI workers default to read-only unless the caller supplies an execution policy.

The bridge keys session receipts by ZCode session ID and type. The first turn starts a native Claude session. Later completed turns resume it, including model changes. Workspace or tool-policy changes are rejected. Completed duplicate requests return the saved result. A different active turn returns busy. Pre-spawn failures restore the previous receipt. Interrupted native writes remain uncertain and require inspection before reuse. This includes legacy receipts automatically marked resumable after timeouts. Receipt loading leaves their original files unchanged. Keep private receipts under `.bridge/provider/sessions`. Use `node scripts/claude-session-recovery.mjs .bridge/provider/sessions inspect --session-id ID --session-type TYPE` to inspect a stuck session. Check its native history, workspace and processes before recovery. Run `recover` with `--expected-native-session UUID --inspected`. Crashed running receipts also require verified offline execution and `--offline-service-verified`. Recovery preserves a backup.

Session-identified Claude turns with continuity retain execution when HTTP disconnects. An identical request attaches to the active task or returns its audited result. A different active turn returns `SESSION_BUSY`, including a model change. Closing the tab detaches its connection. The deadline or authenticated shutdown cancels the worker and waits for cleanup. Streams send heartbeats followed by audited final text. Advisory partial text is not replayed. Forced outer function calls and structured formats are rejected before execution. Native initialization verifies the model and session. The CLI receives the selected effort flag. Missing runtime effort evidence remains labelled unreported.

## Relay and limits

Codex and Cursor remain model relays: they return text or validated function calls for ZCode to execute. They do not perform workspace edits themselves. Codex receives the complete prompt through standard input and verifies the model and selected effort from its rollout under `CODEX_HOME`. Cursor verifies the exact catalog dispatch and the runtime model name. Requests accept text and function schemas; images are unsupported.

The global concurrency ceiling is 14, with Codex capped at 4, Claude at 4 and Cursor at 12. Other desktop tasks are not counted. Configured Claude fallback follows its declared targets, effort and triggers after worker cleanup. GPT uses the original ZCode host tools and inspects partial work before continuing. The handoff persists for that Claude route and ZCode session, including later tool-result turns and bridge restarts. Other routes keep their model. Cancellation, permission denial, protocol errors and unconfirmed cleanup do not trigger fallback.

Claude defaults to a 75-minute attempt and a 90-minute request, including queueing and any configured fallback.
Configure `claudeDelegate.attemptTimeoutMs` and `claudeDelegate.requestTimeoutMs` together.
Attempts allow up to 120 minutes; requests allow up to 135 minutes and must cover the attempt.
Configurations without `claudeDelegate` use these defaults without rewriting their files.
Codex and Cursor retain the generic configured budgets; batch presets retain their own deadlines.
A known Claude cooldown skips the Claude queue.
Request bodies are limited to 4 MiB and responses to 512 KiB.
The server bounds owned jobs and connected waiters at 64 each.
Terminal results remain cached for up to 15 minutes, at most 64 entries and 32 MiB.
Detached connections release their waiters immediately.
The authenticated `/status` endpoint exposes aggregate delegate counts.
Use authenticated `GET /v1/tasks` for individual task status.
Send the existing `x-session-id` and `x-zcode-session-type` headers to limit lookup to one session.
Each completion returns `X-Agent-Bridge-Task-Id`; `GET /v1/tasks/<UUID>` looks up that task.
An owned reconnect returns the same task ID and keeps the original deadline.
Status distinguishes admission, queueing, process start, cleanup and audited completion.
Only recognized native events update `lastActivityAt`; heartbeats and polling do not.
`lastOutputAt` records pipe output separately. Neither timestamp proves useful work or task completion.
Quiet tasks remain running until their existing deadline or explicit cancellation.
Statuses contain no prompts, commands, reasoning text, tool arguments or native session IDs.
Terminal status expires after 15 minutes or bounded retention. Provider restart loses in-memory status.
An unavailable status never authorizes a retry or recovery.

Check a task without starting or changing it:

```sh
node bin/bridge.mjs status --task-id UUID
node bin/bridge.mjs status --cwd /absolute/project/path --watch
node bin/bridge.mjs status --session-id ID --session-type subagent --watch
```

The CLI reads the existing token privately. Default monitoring ends after ten minutes; Ctrl+C stops only the monitor.
Use `--config FILE` when the provider uses a custom configuration.
Native ZCode actor views may show only the final answer. Use this independent status monitor for those tasks.
Status never becomes assistant answer text.
Project lookup matches the working directory declared in the caller's context.
Missing context cannot be matched. The lookup key and project path are not returned in status.
Deadlines and provider shutdown clean up task-owned CLI processes, including detached workers.

Never upload `.bridge`: it contains tokens, prompts, native session receipts and raw CLI logs. Run `npm test` for the offline suite. Legacy GLM profile workers remain available through `bin/bridge.mjs`, but no GLM native model route is registered because its relay dispatch audit fails.
