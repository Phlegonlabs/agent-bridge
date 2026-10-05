# Claude long-task reliability

Status: in_progress

## Problem And Baseline

The owner needs 30–60 minute Claude tasks to survive HTTP reconnects.
Five Claude executions and one Codex execution reached the nine-minute deadline.
Confirmed process termination does not prove that earlier writes were undone.

Repository: `agent-bridge`; branch: `codex/harness-refresh-0.61.0`.
Baseline: `90b4e4891730b1b01cff9cdc9538f29190971d84`; initial worktree was clean.
`docs/product/PRD.md` and architecture sources are absent.
The owner's instructions and existing native-provider contract define this bounded repair.
UI impact: none; no frontend code or product pages change.

## Accepted Scope

Owner instructions, 2026-10-04: prioritize interrupted long tasks; defer further fallback work.
Keep one Claude execution when its HTTP client disconnects.
Reconnect identical requests to that execution or its audited result.
Retain uncertainty after interrupted writes and require inspected recovery.
Use finite Claude budgets: 75 minutes per attempt and 90 minutes including queueing.
Keep fallback targets, reasoning and trigger policies unchanged.
Restoring uncertainty also restores existing persistent fallback handoffs after failed writes.

The parent owns implementation in this checkout.
The architecture agent supplied read-only lifecycle recommendations.
Two read-only explorers diagnose the related WineGlobe reconnect report.
This task does not authorize service restarts, publication or edits in WineGlobe.

## Acceptance And Dependencies

| Repair check | Expected outcome | Verification |
| --- | --- | --- |
| LT-001 | Repeated disconnects retain one worker and one side effect. | Isolated HTTP and registry tests |
| LT-002 | Identical active retries attach; different active turns return busy. | Concurrency tests |
| LT-003 | Completed retries return audited results without executing again. | Cache and session tests |
| LT-004 | Post-spawn failures require recovery, including legacy automatic resumable receipts. | Session regression tests |
| LT-005 | Reconnect cannot reset deadlines; shutdown awaits detached cleanup. | Short controlled deadlines |
| LT-006 | Claude supports the long budgets; Codex and Cursor retain existing budgets. | Configuration and adapter tests |
| LT-007 | Request storage, waiters and retained results remain bounded. | Capacity and expiry tests |

Owned Claude responses use heartbeats followed by audited final text.
They do not replay advisory partial text or promise exactly-once client rendering.
Existing durable session receipts provide completed replay after cache expiry or restart.
Restarted unfinished executions remain uncertain and require inspected recovery.

## Document Impact

Update the native-provider guide and both README translations.
Record synthetic checks separately from real account and desktop UI evidence.
Keep private logs under the existing ignored `.bridge/` directory.
No new artifact class requires an ignore rule.

## Change Log

2026-10-04 — first observation at the baseline above.
The prior four product commits changed timeout, resumption, context slicing and streaming behavior.
Those changes were not recorded in the historical native-provider Epic.
Their 174-test suite passed, but an isolated identical-retry probe executed its simulated step twice.
Loaded Harness identity is unknown; installed Harness is 0.61.0.
Shared AGENTS rules match its template by meaning, with the intentional deployment paragraph retained.

## Results And Remaining Work

2026-10-05 — LT-004 working-tree repair based on `72f3835`.
Post-spawn failures retain uncertainty even after confirmed process cleanup.
Legacy automatic resumable receipts require inspection; their original files remain unchanged on load.
Worker PID evidence also blocks retries when the spawn hook was omitted.
Existing fallback handoffs persist after interrupted writes; no fallback policy changed.
Focused session and fallback tests passed: 37 tests, exit 0.
Evidence: `.bridge/session-repair-1791183836888/stdout.log`.
WineGlobe evidence identifies five Claude timeouts and one Codex timeout.
The inspected traces do not establish hundreds of persisted reconnect notices.

2026-10-05 — LT-001/002/003/005/007 registry implementation after `edbb615`.
The server-owned registry preserves deadlines and removes disconnected waiters.
It bounds active jobs, connected waiters, retained results and cache lifetime.
Five isolated registry tests passed, including 300 detached retries with one execution.
Shutdown waits for controlled cleanup before releasing ownership.
Evidence: `.bridge/registry-check-1791183996960/stdout.log`.
HTTP integration remains pending.

Implementation, independent review and final regression remain pending.
The running provider remains owned by its existing operator.
WineGlobe remains read-only, including its unrelated untracked `nul` file.
Real 60-minute execution and desktop reconnect evidence remain separate validation obligations.
