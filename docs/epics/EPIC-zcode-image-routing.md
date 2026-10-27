# ZCode chat image routing

Status: locally configured; live chat verification pending

## Problem and baseline

The owner requested Codex image generation in ordinary ZCode chats on 2026-10-06.
The owner confirmed that ZCode setup already existed.
The installed `codex-imagegen` skill had the correct bridge path but only advertised explicit Codex requests.
The installed backend `image-gen` skill advertised generic image requests.
Repository: `agent-bridge`; entry branch: `codex/readme-cover`; baseline: `83ba386602761eb53f648e39cccdeb234e3d2f06`.
The entry working tree was clean. Current PRD and architecture files do not exist.
The retained contract is `src/codex-image.mjs`, its CLI, and `skills/codex-imagegen/SKILL.md`.

## Accepted scope and checks

Default ordinary new-image chat requests to the existing Codex skill.
Honor explicit image-provider or model choices. Keep reference-image limits and failure behavior.
Preserve installed paths, login, provider configuration, backend skills and existing local instructions.
UI impact: `none`. One parent writer owns `codex/zcode-image-routing`; no managed PLAN/RUN is needed.
Back up the two local instruction files before their scoped update.
Verify source-to-installed skill parity, preservation of unrelated instruction bytes, CLI help and existing image regressions.
Live ZCode skill selection and a fresh generated image need separate runtime evidence.

## Change log

2026-10-06 — working-tree from the baseline above: update the source skill, local ZCode routing and both README pointers.
Add `docs/zcode-images.md` and index this record. No application code or artifact class changes; existing `.bridge/` ignores cover backups and logs.
Two read-only explorers were dispatched for adapter and workflow questions before clarification.
The workflow explorer stopped with HTTP 429; availability fallback was not permitted for quota exhaustion.
The clarified task is one instruction-routing change and does not modify the saved workflow or adapters.

## Result and remaining work

Local routing is configured. Backups and hash receipts are in `.bridge/zcode-image-routing-478dc2d4-36ed-431f-b2fc-590e4d9ef22a/`.
The installed skill matches the source except its retained machine command and path instructions.
Readback verified the real bridge command and every original byte of the local AGENTS file.
CLI help and `git diff --check` passed. Existing image and Codex regression tests passed: 20 tests, exit 0.
The test process PID 40128 exited. Its supervisor imposed a 120-second deadline; no task-owned service remains.
The first check through the Volta `node` launcher produced no test logs and supplied no test evidence.
The bounded check used the installed Node executable and retained actual exit and log evidence.
No live chat-selection or fresh-generation PASS is claimed. A new ZCode chat must load the changed instructions.
The running provider does not need a restart for these skill and instruction changes.
Installed Harness: `0.62.2`. Loaded contract identity and prior document-sync baseline remain unobserved.
The shared AGENTS sections match the installed template; the deployment section retains its project-specific loopback policy.
Template SHA-256: `feed8dcc70b3691d9822a1b05641d4502dae452fd1926954f09db3fc78fff62f`. Shared-rule drift: `current`.
The document checker returned `review_required` for those two identity gaps. Scoped sources were reviewed directly.

2026-10-06 — review repair, working-tree: make unsupported reference requests stop explicitly in both source and installed instructions.
The pre-repair local files have separate backups. Final parity and original-instruction preservation checks passed.
Final receipt: `.bridge/zcode-image-routing-478dc2d4-36ed-431f-b2fc-590e4d9ef22a/final-receipt.json`.
Routing skill SHA-256: `11c8679ad9c79d56717629bed75e57f2280cae2e931487b772adb879f9d430c4`.
Routing document SHA-256: `1d4fdd06fac2a963aa3f942b6aa1bdcc09d88f528e02a1c0f2b8484f97fc2761`.
Independent reviewer `/root/image_routing_review` accepted that source and installed snapshot after the reference-rule repair.
Dispatch binding: native reviewer, `gpt-6.1-sol` / `xhigh`; independent provider telemetry was unavailable.
The reviewer inspected retained tests and verified installed parity and all 4,378 original AGENTS bytes.
It reported no remaining findings. Live chat selection, generation and rendering remain outside this review.
