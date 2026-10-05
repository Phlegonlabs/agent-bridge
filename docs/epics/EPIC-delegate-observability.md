# Delegate observability

Status: published and active locally; desktop long-task validation pending.

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

2026-10-05 — after `8e0997b`, fix the independent review's attempt-boundary finding.
A replacement attempt clears prior worker start, output and activity observations.
Task admission and deadline remain unchanged. Stale callbacks still cannot alter the replacement attempt.
The regression begins with real first-attempt activity before queueing the next provider.

2026-10-05 — after `08a8429`, bound native workflow monitoring calls as well as reports.
The adapter now uses at most 60 polls with ten-second waits under the existing nine-minute batch deadline.
A synthetic 32-job test checks combined world calls, reports and phases below 256.
This avoids depending on unknown installed-host item accounting. Real rendering remains unverified.

2026-10-05 — candidate `0cacbb7` passed 207 offline tests and independent source review.
Evidence: `.bridge/observability-reviewed-ed8c4539-7ae2-4738-b2ed-0641639b1bce.log`.
Add a project-directory lookup to make native task matching usable without finding session headers first.
The directory declared in request context becomes a private normalized hash key.
The authenticated API and CLI return neither that hash nor the project path.
Requests without a declared absolute working directory remain unmatched.
This OBS-004 follow-up adds no new execution or automatic retry behavior.

2026-10-05 — candidate `4a31a6759db4294c796ca6cb857a5e37adb0aa95` passed all 208 offline tests on Windows Node 24.19.0.
Evidence: `.bridge/observability-project-final-d10496aa-b965-4947-903a-a899c658e45e.log`.
The tests cover workspace matching without exposing its path or private hash.
Source diff from baseline: `.bridge/observability-source-diff-afd1375b-4ff3-4926-b7d8-a943bae60c1c.patch`.
Its SHA-256 is `4272fe4e04c717e15e13e7eba673d65aa3dfd5bdecc0387279f0e0c89936d4d7`.
All new modules remain below 500 physical lines. Existing `.bridge/` rules cover snapshots and verification logs.
No credential files are tracked. WineGlobe and existing provider settings remain outside this write scope.
The installed Harness remains 0.61.0; shared AGENTS rules remain current by meaning.
Template SHA-256: `feed8dcc70b3691d9822a1b05641d4502dae452fd1926954f09db3fc78fff62f`.
Loaded skill identity remains unobserved. No PRD or architecture source appeared during closeout.
This candidate has not been pushed or loaded into the running provider.
New three-platform CI, authenticated long-task activity and installed ZCode progress rendering remain unverified.

2026-10-05 — working-tree: repair the independent delta review's Unicode lookup finding.
Project matching now sends an ASCII hash through a validated private HTTP header.
Real HTTP fixtures use a directory containing Chinese characters and check matching, exclusion and response privacy.
All 208 offline tests passed after this repair.
Evidence: `.bridge/observability-unicode-5329c689-85e8-467a-9117-4b02eaa7097f.log`.
The reviewer accepted this repair; optional workspace metadata admission needs a separate follow-up.

2026-10-05 — after `64808e0`, keep optional status metadata outside relay request admission.
An oversized caller workspace remains unmatched instead of rejecting a valid Codex or Cursor request.
Explicit project lookup retains strict validation. A regression checks both relays reach execution and return their result.
All 209 offline tests passed after this repair.
Evidence: `.bridge/observability-admission-ad68c5dd-618a-490e-b23f-7ad9785bd0a8.log`.
Independent repair review remains pending. No provider process or external state changed.

2026-10-05 — source candidate `288fa52ac9731ce21d1a42b96eeb5be3bb6cadb6` passed independent read-only review.
The reviewer accepted both delta repairs and reported no remaining high-confidence actionable findings.
The 209-test regression above covers these source bytes. The reviewer did not run tests or services.
Final source diff: `.bridge/observability-final-source-fe478a55-792a-4166-b0d2-971bd5cbc702.patch`.
Its SHA-256 is `17f31b83de1b4588b5318de0e90b86b5ce2a32766ee72934b28e90ca90c07d77`.
README translations and the native-provider, workflow and compatibility guides agree with the implemented status contract.
This closeout changes documentation only. OBS-001 through OBS-006 have local synthetic verification.
The working branch remains `codex/harness-refresh-0.61.0`. No provider activation or publication occurred in this round.
Installed ZCode rendering, authenticated long-task activity and new three-platform CI remain pending.
The next activation owner must load this source before using its native task status endpoint.

2026-10-05 — the owner authorized commit, push and deployment, then selected waiting for active tasks before restart.
This supersedes the earlier no-publication and no-activation scope for this action.
The clean candidate was `7549d9a2225eff22176268216ef310ac574d1878` on `codex/harness-refresh-0.61.0`.
Its execution source matches the reviewed `288fa52`; its additional commit changes documentation only.
Eleven pending commits passed a bounded credential-pattern and private-path scan with no findings.
The remote branch advanced from `2a555b5` to exact candidate `7549d9a`, confirmed by remote readback.
Windows, macOS and Linux each passed 209 tests in [CI run 37298333394](https://github.com/Phlegonlabs/agent-bridge/actions/runs/37298333394).

The initial observation had two active requests, including one Claude delegate.
The deployment waited until active, queued and delegate counts were zero.
Authenticated shutdown returned 202. Old PID 34560 and its recorded children exited before replacement startup.
The replacement started at `2026-10-05T10:50:01.1591640Z`, runtime PID 8260, on port 32147.
Volta launcher PID 2104 started intermediary PID 22584, which started the runtime.
The first port check expected the launcher PID and failed. An ancestry check confirmed the actual runtime without another restart.
Separate private records retain the launcher and runtime identities. The finite idle waiter exited.
The requested persistent provider remains active until owner shutdown.

Health is ready and matches configuration SHA-256 `88691397b0719435199f28a4163f5aeb2b0a50b1a0f96c48b36fecf966bd2626`.
Authenticated task status returned the new schema and observed a host-submitted Codex task as running.
Model listing returned 17 routes. Unauthenticated task status returned 401.
The project-filter CLI succeeded; no current task matched the WineGlobe directory at that observation.
No task was manually replayed, and no account or session configuration was migrated.
Evidence: `.bridge/observability-deploy-070b6a6e-7d49-41f6-97c8-b34ad4458df1/`.
Real 60-minute completion and installed ZCode workflow progress rendering remain unverified.
Harness 0.61.0 shared rules remain current by meaning. Loaded skill identity remains unobserved.

2026-10-05 — handoff checkpoint: documentation receipt `1b89411` also passed the three-platform CI matrix.
Evidence: [CI run 37299450420](https://github.com/Phlegonlabs/agent-bridge/actions/runs/37299450420).
Its execution source remains identical to deployed `7549d9a`. The worktree was clean.
The installed Harness is now 0.62.1, an externally observed version change during closeout.
The shared template SHA-256 remains `feed8dcc70b3691d9822a1b05641d4502dae452fd1926954f09db3fc78fff62f`.
Shared AGENTS rules remain current by meaning, with the retained local deployment section. Loaded skill identity remains unobserved.
