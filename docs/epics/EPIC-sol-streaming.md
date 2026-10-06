# Sol connection and streaming repair

Status: implementation and verification in progress.

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
The regression covers mixed envelopes before and after terminal validation. All 43 focused HTTP, provider and fallback tests passed, exit 0.
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
