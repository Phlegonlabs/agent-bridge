# Claude long-task reliability

Status: locally_verified; live_validation_pending

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

2026-10-05 — HTTP integration after `aa511df`.
Connections detach from owned Claude tasks without cancelling their workers.
Authenticated identical retries attach before SSE headers; other active turns return 409.
Owned responses contain heartbeats and audited final text only.
The status endpoint reports aggregate jobs, waiters and cache counts.
Focused HTTP, fallback and provider tests passed, exit 0.
Twenty real HTTP disconnects retained one synthetic worker and one recorded side effect.
Shutdown waited for detached cleanup; ordinary relay disconnects still cancelled work.
Evidence: `.bridge/http-reconnect-1791184155151/stdout.log`.

2026-10-05 — LT-006 long-budget repair after `cdb3d3e`.
Claude receives separate 75-minute attempts and 90-minute request deadlines.
Legacy configurations receive defaults without file migration.
New setup configurations and the tracked example explicitly record the budgets.
Codex, Cursor and batch preset budgets retain their existing behavior.
English and Traditional Chinese README instructions now describe detachment and recovery.
The native-provider guide describes current deadlines and declared fallback settings.
Twenty-seven focused budget, adapter, setup and HTTP tests passed, exit 0.
An HTTP retry retained the original short test deadline.
Evidence: `.bridge/long-budgets-final-1791184466023/stdout.log`.

2026-10-05 — LT-004 validation follow-up after `fa53903`.
The 188-test regression passed at that candidate.
A new isolated probe found lost PID evidence when callback result validation failed before the spawn hook.
Capture PID evidence before validation so oversized results retain uncertainty.
The probe failed before repair and passed afterward; 38 focused session/fallback tests passed.
Evidence: `.bridge/pid-validation-probe-1791184654651/stdout.log` and `.bridge/pid-validation-repair-1791184673906/stdout.log`.

2026-10-05 — LT-001/003 admission repair after `2b602ef`.
The independent reviewer found that cached pre-spawn queue errors prevented retries after capacity recovered.
Certified pre-spawn queue, cooldown and provider-availability errors now release their cache entry.
Unknown and post-spawn failures remain retained; request deadlines remain unchanged.
Focused registry, HTTP and fallback tests passed, including queue rejection followed by one successful execution.
Evidence: `.bridge/admission-repair-1791184853093/stdout.log`.

2026-10-05 — final source checkpoint at `3b3d576ebbfa5ec2787ca3ef3445f5b690c6f5a2`.
Branch remains `codex/harness-refresh-0.61.0`; its worktree was clean.
The native independent reviewer accepted this candidate with no remaining actionable findings.
All 191 offline tests passed on Windows Node 24.19.0, exit 0.
Evidence: `.bridge/claude-release-regression-1791184952379/stdout.log`.
Scoped source/test/config/README/native-provider diff SHA-256 from baseline `90b4e48`:
`24bc9f85f72507d0131d20f57fb4808e002d9118d276261d7992d11f37cc209f`.
The repair commits are `edbb615`, `aa511df`, `cdb3d3e`, `fa53903`, `2b602ef` and `3b3d576`.
New modules and tests remain below 500 lines.
Private state and logs remain ignored; source, fixtures and the configuration example remain tracked.
The README pair, native-provider guide and compatibility record agree with the accepted repair.
No PRD or architecture source exists; that baseline gap remains recorded above.
Installed Harness remains 0.61.0; loaded identity remains unknown.
Template SHA-256: `feed8dcc70b3691d9822a1b05641d4502dae452fd1926954f09db3fc78fff62f`.
Shared AGENTS rules remain current by meaning; retain the intentional deployment paragraph.
No governance edit was needed.

WineGlobe stayed on `docs/wineglobe-product-definition`, HEAD `ef18c7bb71370a224723c4761e5b624c79875cb4`.
Its only working-tree item remained the unrelated untracked `nul` file.
The inspected UI workflow uses bounded host asks; it contains no hundreds-iteration retry loop.
Five Claude executions shared one native session and reached approximately 541 seconds.
One Codex execution also timed out. Quota-pressure events did not establish quota rejection as the timeout cause.
The bounded trace inspection did not prove hundreds of persisted reconnect notices.
A proposed WineGlobe Epic trace update remains unwritten because that checkout was read-only.

The existing provider remained ready on port 32147, PID 17072, with an established connection.
This task did not stop, restart or publish it.
The next operator must finish active work before deliberately loading the repaired source.
Real 60-minute execution, desktop reconnect behavior and the new three-platform CI run remain unverified.
Existing fallback effort-drift and host tool-replay risks remain deferred.
The repair does not certify exactly-once host tool execution or UI rendering.
