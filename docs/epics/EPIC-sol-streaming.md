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

Test classification, streamed delta identity, forbidden tools, model/effort mismatch, deadlines, cancellation and final-answer equality.
Use isolated synthetic protocol fixtures first. Keep authenticated native evidence separate from desktop rendering.
Run independent source review and the offline suite on the final candidate.
No push or active-task cancellation is authorized by this request.
