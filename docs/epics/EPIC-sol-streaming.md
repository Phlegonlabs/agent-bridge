# Sol connection and streaming repair

Status: implementation verified, independently reviewed and active on port 32147; desktop rendering remains unverified.

The owner requested multi-agent diagnosis, connection repair and streaming on 2026-10-05.
Repository: `agent-bridge`; branch: `codex/harness-refresh-0.61.0`.
First observed HEAD: `86fd208fdd6b282ed6121415665316360393bbc1`.
Existing Claude progress work was preserved. Another session committed it as `59a27e4` during exploration.
The parent observed that commit and its clean worktree before editing. The parent owns this repair's writes.
There is no PRD or architecture source. The native-provider guide defines the retained relay contract.
UI impact: `none`; no application markup or styles change.

## Accepted outcome

- SOL-001: distinguish upstream content rejection from a generic connection error without replaying or bypassing rejected requests.
- SOL-002: send real Codex answer deltas and labelled status while retaining model, effort and final protocol verification.
- SOL-003: keep deadlines, task-owned process cleanup, privacy and the existing host-tool boundary.

Two independent read-only GLM-5.3-FlashX explorers examined connection failures and streaming separately.
A read-only GPT-6 Astra architecture agent examined the native streaming interface.
Recent sampled failures contain valid native reconnect notices followed by a content-rejection error item.
The current bridge reports that terminal item as a generic `CODEX_REPORTED_ERROR`.
Successful installed `codex exec --json` runs emit completed messages, without observed token deltas.
Installed Codex CLI: `0.160.0`. Its generated app-server schema defines `item/agentMessage/delta`.
Private schema and diagnostic evidence remain under ignored `.bridge/` paths.

## Change log

2026-10-05 — working-tree from `59a27e4`: classify structured Codex content rejection and explain the cause to callers.
Scope: Codex error classifier, audit, relay, focused tests and this indexed record.
Unknown errors remain fatal. Assistant prose cannot trigger the classifier. Fallback triggers remain unchanged.
Focused verification passed 49 Codex, provider and fallback tests with exit 0.
Evidence: `.bridge/sol-errors-9c6e76bc-9080-4163-9b19-8e4abdbda983/stdout.log`.
Independent review is pending. No configuration, service or external account changed.
External documentation-only commits `99e4df9` and `62a9539` were observed during this step; their scope remains separate.
Installed Harness is `0.62.1`; loaded identity is unobserved. Shared AGENTS rules match its template by meaning.

## Verification and remaining work

2026-10-05 — independent reviewer found a valid mixed content/tool envelope failed only in streaming mode at `ca889a4`.
The repair retains streamed content and sends accompanying tool calls only after native and protocol validation.
HTTP finalization sends any remaining content and validated calls independently. Invalid tool envelopes still fail without another attempt.
The regression covers mixed envelopes before and after terminal validation. All 42 focused HTTP, provider and fallback tests passed, exit 0.
Evidence: `.bridge/sol-mixed-caff2b4c-e7f1-4a3f-a3d6-d8f3524e26a8/stdout.log`.

2026-10-05 — working-tree after `a37fb2b`: connect Codex content and status to HTTP, with bounded owned-prefix replay.
Session-identified Codex turns retain one worker, task ID and deadline across identical reconnects.
Changed active turns remain busy. Anonymous Codex and Cursor requests retain disconnect cancellation.
After partial content, correction and fallback are prohibited. Final mismatches fail without a successful stream terminator.
Tool envelopes and structured content remain buffered and validated. Private reasoning and native errors do not enter status.
The initial HTTP regression used the wrong Cursor route ID in an updated legacy fixture and reached its 90-second supervisor deadline.
Its recorded process tree terminated with no survivors. The route ID is corrected; the repaired focused check passed with exit 0.
Evidence: `.bridge/sol-http-933172c7-dd14-4a67-80fe-7e5b31fe5a96/`.
Repaired evidence: `.bridge/sol-http-repair-8b042422-5c98-4a08-aa63-4f8a70c08aa6/stdout.log`.
The README language pair and native-provider guide now describe the retained contract and cache limits.

2026-10-05 — working-tree after `e7a1b9e`: bound and structurally parse streamed relay envelopes.
Only direct content following the matching direct nonce can stream. Nested tool arguments and quoted JSON remain private.
Split Unicode escapes retain surrogate pairs. Invalid escapes and oversized input fail explicitly.
All nine extractor tests passed with `node --test --test-timeout=10000 test/stream-relay.test.mjs`, exit 0.

2026-10-05 — working-tree after `a16d1c9`: replace the Codex exec transport with task-owned app-server stdio.
Native notifications validate thread, turn and item identity. Dispatch model, effort, cwd and policy are checked before generation.
Completed native text must match its deltas. Persisted rollout evidence still verifies model and effort after process exit.
MCP names and transport kinds are inventoried locally. Invocation overrides disable configured MCP servers, apps, plugins and execution tools.
Native approval requests, forbidden tool starts and unexpected MCP startup fail closed.
Two initial isolation probes failed because incomplete MCP overrides lacked valid transport fields.
A corrected native probe verified disabled tools and clean stdin-close termination without changing account configuration.
Evidence: `.bridge/sol-native-probe-8c879430-e88e-4d33-9c6b-5dbf72d856a4/`.
All 23 focused RPC, Codex and process-input tests passed before the final deadline adjustment.
Evidence: `.bridge/sol-rpc-db8a4ff0-3a08-4620-b0f2-f91fd0011d04/stdout.log`.
A benign authenticated request passed model, effort, rollout and exit checks on `gpt-6.1-sol` / `low`.
It observed one 251-byte native delta before completion; it does not prove multiple token chunks or desktop rendering.
Evidence: `.bridge/runs/eb9b0682-64de-4d41-a607-2691442150b4/`.
The final native-adapter check passed the same 23 tests after the deadline adjustment.
Evidence: `.bridge/sol-rpc-final-af24bd0d-2b1a-4cef-b5af-d47df31e2b96/stdout.log`.
Relay envelope streaming, HTTP status, final regression and independent review remain pending.
External documentation commit `58e8154` was observed and preserved; this round did not restart the provider.

2026-10-05 — working-tree after `b967f46`: add bounded interactive stdin to the existing owned-process runner.
The same timeout, cancellation, log drainage and identity-checked cleanup apply to native RPC processes.
Static and interactive input are mutually exclusive. No second process supervisor or persistent app-server is introduced.
All 14 focused process and ownership tests passed, exit 0.
Evidence: `.bridge/sol-input-e2b715a5-6af3-4604-8f18-dad44478c56a/stdout.log`.
An installed-runtime protocol probe confirmed exact model, effort, read-only policy and clean exit after stdin EOF.
It also observed MCP startup despite an empty map. Explicit MCP isolation needs verification before streaming integration.
Probe evidence: `.bridge/sol-protocol-d61f2ac2-20c7-421b-be04-99e6b6f091b5/`.

Test classification, streamed delta identity, forbidden tools, model/effort mismatch, deadlines, cancellation and final-answer equality.
Use isolated synthetic protocol fixtures first. Keep authenticated native evidence separate from desktop rendering.
Run independent source review and the offline suite on the final candidate.
No push or active-task cancellation is authorized by this request.

2026-10-05 — working-tree after `982d6b3`: certify queue and cooldown failures that occur before native invocation.
Owned requests can retry after capacity recovers. A prior executed attempt retains uncertainty across fallback or corrective admission failures.
All 54 focused tests passed, exit 0. They cover recovery and retention after native execution.
Evidence: `.bridge/sol-admission-0ab2909d-1d6f-4e45-8989-2aaa70c38cf5/stdout.log`.

2026-10-05 — working-tree after `1c0c90a`: retain native exec for the existing image entry only.
Three prior private image receipts confirmed verified generation through exec, whose events omit the built-in image tool.
The image caller selects its retained contract explicitly. Text relay callers retain isolated app-server streaming and tool rejection.
Model, effort, deadlines, process ownership, rollout verification and image-output proof remain required.
All 26 focused Codex, RPC and image-evidence tests passed, exit 0. No new live image was generated.
Evidence: `.bridge/sol-image-boundary-47f79df5-9247-4bd4-b5a0-a2bcb366ad5b/stdout.log`.

## Current handoff

Source candidate: `ebf485c08db4af885c9f5030d6156b5b0206fa08`; branch: `codex/harness-refresh-0.61.0`.
The candidate worktree was clean. All 236 offline tests passed on Windows Node 24.19.0, exit 0.
Evidence: `.bridge/sol-final-regression-a95d46b2-b093-4d2f-81fa-4672879b93d7/stdout.log`.
The benign authenticated Sol/low HTTP probe returned 200 with verified model, completed status and successful SSE termination.
It sent one 229-byte content delta and four status frames. First content arrived at 19,777 ms; completion took 20,164 ms.
This single native trial does not prove multiple token chunks, sustained reliability or actual desktop rendering.
Evidence: `.bridge/sol-final-native-72d1dd23-d368-4d85-869f-4bb603184510/stdout.log`.
The temporary server on port 63854 closed. All finite check supervisors exited; this task leaves no temporary service running.
The independent reviewer found three compatibility issues on `ca889a4`: mixed tool envelopes, admission retention and image transport.
Repairs are `982d6b3`, `1c0c90a` and `ebf485c`.
The independent GPT-6.1 Sol/xhigh reviewer accepted exact source candidate `ebf485c` with no remaining actionable findings.
It performed read-only source review, with no tests, services or children. Test and native execution evidence belong to the parent.
Reviewer backend identity was not exposed beyond the configured role. No fallback was used.

Before the authorized reload, shared listener PID 18544 retained start time `2026-10-06T02:05:59.1817520Z` and command `node bin/provider.mjs`.
Authenticated status observed zero active tasks, queued jobs and active delegates after verification.
At that handoff, loaded source identity was unknown and the candidate had not been activated.
The owner then authorized the idle-only reload. Its verified result is recorded below.
Desktop Sol rendering remains an owner-visible acceptance check after activation.

The current README pair, native-provider guide, compatibility evidence, index and Epic agree with this scoped result.
No PRD, architecture or managed PLAN/RUN exists. No generated tasks view requires reconciliation.
Installed Harness `0.62.1` template SHA-256: `feed8dcc70b3691d9822a1b05641d4502dae452fd1926954f09db3fc78fff62f`.
Shared AGENTS rules are current by meaning; its local deployment section remains intact. Loaded skill identity is unobserved.
The read-only document checker reports first-observation and loaded-identity review gaps, not a delivery approval.
Evidence: `.bridge/sol-handoff-d9aba7c0-851c-4a27-8ec6-fc07b04e9445/stdout.json`.
The existing `.bridge/`, `.env` and dependency ignore rules cover this task. New source and tests remain tracked.

## Authorized reload — 2026-10-05

The owner approved reloading the existing provider. The checkout was clean at `22c4f2db5f07e4a9c0d4ec593ed6c244685a8c3b`.
Its executable source is identical to reviewed and tested candidate `ebf485c`; the intervening commit contains bookkeeping only.
Immediately before authenticated shutdown, active, queued, delegate and waiter counts were zero. Old PID 18544 had no children.
Shutdown returned 202. Old PID 18544 exited and port 32147 closed before replacement startup.
Replacement PID 32128 started at `2026-10-06T06:43:28.3343670Z`, using Node 24.19.0 and `bin/provider.mjs` in this checkout.
The first record write failed because `Set-Content` does not support `-NoClobber`. Startup had already succeeded.
The parent verified the replacement identity, repaired the record with exclusive creation and reused the running replacement.
Health is ready, its configuration hash is unchanged and authenticated status lists the same 17 model routes.
Receipt: `.bridge/provider/activation-sol-f38e7d6a-4a1e-4d92-9410-e4fbdc1cfe0d.json`.

A fresh benign request to the reloaded service returned HTTP 200, one 173-byte content delta and three status frames.
First content arrived at 13,625 ms; total duration was 13,825 ms. Stop and `[DONE]` frames completed successfully.
Authenticated task lookup returned `finished` / `VERIFIED` on `codex/gpt-6.1-sol`.
Native run `87b7b47f-bf29-4356-af3b-28011745d105` confirms app-server stdio, effort `low`, model, rollout and exit 0.
The probe deliberately omitted session ownership so a failed verification disconnect would cancel its own worker.
Probe supervisor exited 0. After verification, active, queued and active delegate counts returned to zero.
No native worker remains. Child PID 28836 is the replacement's console host, created at `2026-10-06T06:43:28.3425730Z`.
Evidence: `.bridge/sol-reloaded-proof-39320e15-0a80-4b15-8117-b7b26459390d/stdout.log` and `.bridge/runs/87b7b47f-bf29-4356-af3b-28011745d105/`.
The persistent provider remains active until owner shutdown. No account, configuration, rejected task or remote Git state changed.

## Release verification — 2026-10-06

The owner requested commit, push, deployment and merge of all pending work.
This supersedes the earlier publication restriction for this release.
Entry branch: `codex/harness-refresh-0.61.0`; HEAD: `b1c75865f4aff8cddea8484ae2c0244dc03f0c95`; working tree: clean.
Remote `main` remains `acb9b31304e5933134079f923a08544b24edb3f4`. No development branch or open PR exists.
All 42 pending commits belong to the one observed work branch. Fifteen unpublished commits were pushed and read back.
The release uses one parent writer and one independent source reviewer. There is no managed PLAN/RUN.

The local bounded regression passed 236 tests, exit 0, on Windows Node 24.19.0.
Evidence: `.bridge/release-regression-94bcc6a6-f815-4163-b59c-06b698cf570f/`.
CI `37434905790` passed on Linux and macOS. Two Windows attempts reported unconfirmed short-deadline cleanup.
The second attempt passed 235 tests and failed the interactive 100 ms deadline check.
The first attempt also failed static cleanup and a 1,000 ms Cursor fixture deadline.
These failures remain evidence; no runtime limit or identity check was relaxed.

Working-tree from `b1c7586`: preserve safe process identity evidence when Windows cleanup cannot validate the root.
Scope: `src/process.mjs`, cleanup assertion diagnostics and this record; trace: SOL-003; UI impact: none.
The record contains process IDs, names and creation times, with no arguments or credential values.
Cleanup behavior remains unchanged. The next CI run must identify the failed cleanup stage before a repair.
The diagnostic candidate passed all 236 local tests, exit 0. Source review, `main` merge and deployment remain pending.
Evidence: `.bridge/release-regression-44ec1e85-b5d2-40c5-a308-c333d78957cb/`.
The existing provider, PID 32128, was ready and idle. It has not been stopped during release verification.
Private diagnostics stay under the existing `.bridge/` ignore rule. No new artifact class requires an ignore change.
Harness 0.62.1 template `feed8dcc70b3691d9822a1b05641d4502dae452fd1926954f09db3fc78fff62f` still matches shared rules by meaning.
The local deployment paragraph is retained. Loaded skill identity remains unobserved.

2026-10-06 — working-tree from `0d2f054`: the independent reviewer found a buffered owned-request regression.
The server supplied a content callback even without streaming. Retained provisional content wrongly disabled the existing protocol correction.
Only streaming unstructured Codex requests now supply that callback. Buffered requests retain one validated correction.
Streaming retries of a buffered task return its audited result without another worker.
Scope: `src/provider-server.mjs`, HTTP regression and this record; trace: SOL-002. Real streamed prefixes still prohibit correction.
The new HTTP regression failed with 502 before the fix and passed after it. All 237 local tests passed, exit 0.
Evidence: `.bridge/release-regression-65ef9a1a-ea20-4542-be12-afeeb274710d/` and `.bridge/release-regression-f8053d47-fbe8-4660-b920-a0bc528f04df/`.
Source review remains pending for the repair. Windows cleanup diagnostics continue separately; `main` and the service remain unchanged.
Diagnostic CI `37435713247` reported `cleanup_failed`, which excludes the newly recorded root identity mismatch case.

2026-10-06 — working-tree from `75cc5c4`: label failed Windows snapshot, termination and verification commands separately.
Retain bounded stderr from those controlled identity-only commands. These commands contain no task arguments or credentials.
No process ownership, cancellation rule or timeout changes. All 237 local tests passed, exit 0.
Evidence: `.bridge/release-regression-0cd959b8-ffe4-4e8b-91c9-57fd24d808f8/`. Diagnostic CI and source review remain pending.

2026-10-06 — working-tree from `8b35cc7`: CI `37436551037` narrowed cleanup failure to the termination command.
It exited 1 without stderr, before the independent survivor check could run. Creation-time validation passed.
Windows cleanup now verifies the captured process identities even when the termination command returns nonzero.
Only a successful check with no surviving identities certifies termination. Failed verification still remains unconfirmed.
The termination command's failure evidence remains attached. No ownership check or runtime budget changes.
Scope: `src/process.mjs`, process ownership regression and this record; trace: SOL-003.
All 239 local tests passed, exit 0. Synthetic regressions distinguish stopped, surviving and unverifiable process identities.
Evidence: `.bridge/release-regression-032f0331-1b0b-4ae2-81ec-6f2f0d1b3479/`. CI and source review remain pending.

2026-10-06 — release result at `7d7710a42a12a8e0249a851db7d39445f989dd05`.
Independent source review accepted the buffered-response and Windows cleanup repairs, with no actionable source findings.
The reviewer binding was native GPT-6.1 Sol / xhigh; actual backend model identity was not exposed. No fallback was used.
CI `37437571697` passed on Windows, Linux and macOS. Earlier failed runs remain historical evidence.
All 46 pending commits fast-forwarded `main` from `acb9b31304e5933134079f923a08544b24edb3f4` to this exact candidate.
Remote work-branch and main readback matched the candidate. Main CI `37437955854` passed on all three platforms.

The idle-only deployment initially stopped before shutdown because it detected a child process.
Inspection identified the existing Windows console host, not a worker. Its identity was captured for shutdown verification.
Authenticated shutdown then closed old PID 32128, its console child 28836 and port 32147 before replacement.
New runtime PID 8820 started at `2026-10-06T08:43:45.9946970Z` from the clean candidate checkout.
Health, configuration identity, all 17 routes, authentication and native Sol completion passed.
The benign request returned 177 content bytes, one content delta and three status frames in 13,176 ms.
The smoke checker initially omitted the provider namespace. Its failed exit remains recorded; corrected receipt validation passed.
No production task was cancelled, replayed or migrated. No account or configuration changed.
Deployment evidence and remaining desktop/long-task gaps are indexed in `docs/DEPLOYMENT.md`.

This receipt commit changes only operational documents. Source parity with the deployed candidate must remain exact.
Shared AGENTS rules remain current by meaning against the unchanged Harness 0.62.1 template.
Its local deployment paragraph now names the observed manual target. Loaded Harness identity remains unobserved.
No PRD, architecture, design package or managed PLAN/RUN exists; no product contract was rewritten.
The persistent provider remains active until owner shutdown. Temporary verification processes exited; private artifacts remain ignored.
Desktop rendering and multiple live content chunks remain unverified. Shared Harness 0.62.1 rules remain current by meaning.
