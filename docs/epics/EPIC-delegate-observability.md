# Delegate observability

Status: in progress.

The owner requested visible execution checks for workflows and subagents on 2026-10-05.
The baseline is `2a555b54bb443c1fc35d1e9f2270b50c5200aa7d` on `codex/harness-refresh-0.61.0`.
The working tree was clean. No PRD or architecture source exists in this repository.
This direct enhancement changes execution status, CLI output and workflow reports. It adds no application UI.
The parent is the only writer. Independent helpers reviewed the workflow and provider boundaries.

## Accepted outcome

- OBS-001: identify accepted, queued, starting, running, finishing, stopping and terminal tasks.
- OBS-002: expose the last observed native activity separately from connection heartbeats.
- OBS-003: retain the task identity and original deadline across owned HTTP reconnects.
- OBS-004: provide authenticated task lookup and finite CLI monitoring for native subagents.
- OBS-005: persist bounded workflow snapshots and report execution status before final results.
- OBS-006: expose no prompts, reasoning text, tool arguments, commands, credentials or native session IDs.

Silence does not authorize reruns, fallback, cancellation or recovery.
The existing audit, cleanup and permission contracts remain authoritative.
Status records are observations, not proof that useful work or the assignment is complete.
Native ZCode actor asks have no verified progress callback. Status lookup must remain available independently.
This round does not modify WineGlobe, the installed ZCode application or active tasks.
Local implementation and atomic commits are authorized. Publication and service activation are separate outcomes.

## Verification

Test lifecycle transitions, stale callbacks, privacy canaries, bounded retention and quiet workers.
Test HTTP authentication, session lookup, reconnect identity, queue state, deadlines and audit failures.
Test workflow snapshots, terminal flushing, status polling and unchanged final stdout.
Run the offline regression suite and an independent source review.
Keep synthetic evidence separate from authenticated desktop/account execution.

## Change log

2026-10-05 — working-tree: add the shared fixed-size status record and native event classifier.
Scope: `src/task-progress.mjs`, `src/native-progress.mjs`, `test/task-progress.test.mjs`.
These records contain lifecycle and activity types only. Execution owners retain scheduling authority.
Four focused tests passed with `node --test --test-timeout=10000 test/task-progress.test.mjs`.
Provider, workflow and CLI integration remain pending.
Installed Harness is 0.61.0; loaded skill identity is unobserved.
The shared AGENTS instructions match the installed template by meaning, with the retained deployment paragraph.

2026-10-05 — after `4b6ec3e`, working-tree: connect provider tasks to native process observations.
Scope: native adapters, process hooks, relay, delegate registry, authenticated task API and status CLI.
Owned reconnects retain one ID. Recognized activity remains separate from output and heartbeat timestamps.
Forty-two focused tests passed, including queueing, reconnect, privacy, audit failure and existing cleanup tests.
Evidence: `.bridge/progress-native-0bcfe0c0-4591-47ba-8cae-80d6eca2f4bd.log`.
The README pair and native provider guide now document lookup and the native UI limitation.
Workflow persistence and final regression remain pending. No live provider was restarted.
The final native-path check passed 80 tests after bounded client decoding and deadline-code separation.
Evidence: `.bridge/progress-native-final-780c69bd-dd7e-4c1d-a9b4-5100ec1ccf1a.log`.

2026-10-05 — after `a6ece67`, working-tree: add bounded atomic workflow status snapshots.
Scope: workflow execution, status reader, CLI progress, saved workflow and workflow guide.
The saved adapter reserves a fresh run UUID and polls status while execution remains pending.
It reports state changes and periodic activity ages without altering final JSON stdout.
Recorded nonterminal snapshots label liveness unverified; task identity reuse is rejected.
The first focused run passed 26 tests and failed one synthetic facade test.
The fixture stripped a top-level return as a module; it now strips the existing workflow function body.
Evidence: `.bridge/workflow-progress-21491062-11c2-45ca-a7b8-9ea41e2a49ce.log`.
Real installed-host rendering remains separate from the synthetic facade test.
The repaired focused run passed all 27 tests.
Evidence: `.bridge/workflow-progress-final-302e8518-be8b-493c-bdd2-d9f69bdd2ce5.log`.

2026-10-05 — candidate `2db1603` passed all 203 offline tests.
Evidence: `.bridge/observability-regression-f1957095-fc16-468f-afcd-1915c87754c3.log`.
A follow-up isolated probe found an unhandled rejection from asynchronous status observers.
The notification helper now handles rejected observer promises without changing worker execution.
A regression test checks this isolation. Final review and repaired-candidate regression remain pending.

2026-10-05 — `18cb3a7` passed all 204 offline tests.
Evidence: `.bridge/observability-final-d2b88524-69c6-413a-bf72-650e081487f1.log`.
Independent review found that deadline substitution discarded native recovery evidence.
The registry now retains that evidence before selecting the public cancellation/deadline code.
A focused regression observes stopping through cleanup and recovery-required failure afterward.
