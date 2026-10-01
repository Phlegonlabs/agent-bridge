# Native provider

Select **Agent Bridge** for Codex or Cursor, or **Claude Bridge** for a task executed by Claude Code CLI. The connection is OpenAI Chat Completions at `http://127.0.0.1:32147/v1`. Its local token is separate from the CLI account credentials.

`config/native-provider.json` exposes eight Codex models, eleven Cursor model families and two Claude models. Each model advertises only its configured reasoning levels. Models without effort control expose `default`. Codex receives `model_reasoning_effort`; Cursor selects an exact native model variant, preserving the fast qualifier. Unsupported strengths fail instead of selecting another model. The catalogs describe this machine's installed CLIs and accounts, not guaranteed entitlement to every model.

Run `node scripts/register-provider.mjs --update` after changing routes. It backs up the native provider file and reconciles only Agent Bridge and Claude Bridge, preserving other providers and manual model overrides. Start with `pwsh -NoProfile -NonInteractive -File scripts/start-provider.ps1`; stop with `node scripts/stop-provider.mjs`. Restart after changing routes. The optional scheduled task is documented in the README.

## Claude task execution

Claude routes require `mode: "delegate"`. They hand the full current task and conversation context to Claude CLI, using context files for large transcripts. The working directory must come from a system or developer `working directory:` marker. Writable routes reject missing or invalid workspaces and missing ZCode session IDs.

The configured `workspace-write` policy allows Read, Glob, Grep, file edits within the workspace, and explicitly named shell command patterns. Claude uses `dontAsk` permissions with no permission prompts. A writable turn that finishes after a denied tool retains its result and reports the denial; this does not certify that every requested action succeeded. Read-only denials fail the run. This is a CLI permission boundary, not an operating-system sandbox. Background services, publishing, deletion and permission bypass are outside the worker assignment. Standalone CLI workers default to read-only unless the caller supplies an execution policy.

The bridge keys session receipts by ZCode session ID and type. The first turn starts a native Claude session; later turns resume it, including a model change between completed turns. Workspace or tool-policy changes are rejected. Completed duplicate requests return the saved result. A running turn returns busy. Pre-spawn failures restore the previous receipt; an interrupted native write requires explicit recovery and is never automatically replayed. Keep the private receipts under `.bridge/provider/sessions`. Use `node scripts/claude-session-recovery.mjs .bridge/provider/sessions inspect --session-id ID --session-type TYPE` to inspect a stuck session. After checking its native history and workspace, `recover` requires `--expected-native-session UUID --inspected`; crashed running receipts also require verified offline execution and `--offline-service-verified`. Recovery preserves a backup.

Claude returns its own answer and can stream text deltas. Forced outer function calls and structured response formats are rejected before execution, so answer-format correction cannot repeat a writable task. Native initialization verifies the model and session. The CLI receives the selected effort flag; when initialization omits effort, the report labels it as unreported rather than claiming runtime confirmation.

## Relay and limits

Codex and Cursor remain model relays: they return text or validated function calls for ZCode to execute. They do not perform workspace edits themselves. Codex receives the complete prompt through standard input and verifies the model and selected effort from its rollout under `CODEX_HOME`. Cursor verifies the exact catalog dispatch and the runtime model name. Requests accept text and function schemas; images are unsupported.

The global concurrency ceiling is 14, with Codex capped at 4, Claude at 4 and Cursor at 12. These are bridge limits; other desktop tasks are not counted. Same-request model fallback is disabled. A rate limit cools its provider pool and queues later requests. Request bodies are limited to 4 MiB and responses to 512 KiB. Deadlines and cancellation clean up task-owned CLI processes.

Never upload `.bridge`: it contains tokens, prompts, native session receipts and raw CLI logs. Run `npm test` for the offline suite. Legacy GLM profile workers remain available through `bin/bridge.mjs`, but no GLM native model route is registered because its relay dispatch audit fails.
