# README presentation and generated cover

Status: complete

## Problem and baseline

The README contained a full setup guide, but lacked a cover and a short first-use path.
The owner requested a README update and an image-generation cover on 2026-10-06.
Repository: `agent-bridge`; entry branch: `main`; baseline: `0acb20331584643116c221dce81234a870941340`.
The entry working tree was clean. Current PRD and architecture files do not exist.
Existing CLI help, README instructions and `docs/native-provider.md` define the retained behavior.

## Accepted scope

Update the English and Traditional Chinese READMEs together. Generate and embed one cover stored in this checkout.
Retain setup commands, permission boundaries, recovery rules and verification limits.
Application UI impact: `none`; only public documentation presentation changes.
One parent writer owns this direct task on `codex/readme-cover`.
One coherent inspection of existing behavior suffices; independent substantive research questions do not arise.
No application code, provider configuration or running service changes are required.

## Acceptance and document impact

- Both READMEs use the same cover and retain matching setup steps.
- Readers can find capabilities, quick start, progress commands and detailed guides.
- Local file links and GitHub heading anchors resolve. The cover decodes and its text is visually checked.
- CLI help confirms documented commands and options. Existing operational limits remain explicit.
- `docs/DOCUMENTS.md` indexes this record. No PRD, architecture or managed PLAN/RUN needs synchronization.

The cover is a canonical documentation asset and must remain tracked.
Existing `.bridge/`, dependency and log ignore rules cover private verification output; no ignore change is required.

## Cover generation

Tool: built-in `image_gen.imagegen`, through `functions.exec`; no CLI/API fallback.
Asset: `docs/assets/agent-bridge-cover.png`.
The generated original stays in Codex's generated-image directory; the README uses the copied repository asset.
The image shows three terminal paths crossing a glass bridge into a single workspace.
Visual inspection confirmed the title, subtitle, legibility and opaque background.

<details>
<summary>Final generation prompt</summary>

```text
Use case: stylized-concept
Asset type: wide GitHub README cover for the open-source project Agent Bridge, landscape 2.4:1 composition.
Primary request: create a polished editorial technology illustration of a physical bridge connecting a local coding workspace to several native CLI runtimes. This is a developer tool that connects ZCode to Codex, Cursor and Claude Code using existing logins.
Scene: an expansive midnight navy background, a sculptural architectural bridge made of brushed graphite and translucent glass. Three luminous cyan, mint and warm amber paths flow from separate abstract terminal blocks and converge across the bridge into one local workspace block. Delicate restrained terminal-grid details, precise material reflections, depth and elegant negative space. Bold memorable architecture, crafted product-launch art, restrained color rather than generic sci-fi clutter.
Composition: large crisp typography on the left, beautiful bridge sculpture occupying the right half with routes extending across the lower third. Keep all text within generous safe margins and readable at thumbnail width.
Text (verbatim): "AGENT BRIDGE" with smaller subtitle "Your CLIs. One workspace." Only these two text strings.
Typography: confident modern grotesk sans serif, ivory white, careful kerning, no faux code labels.
Constraints: no official company logos, no robot, no people, no cloud service imagery, no badges, no watermark, no tiny illegible UI. Opaque background. Deliver a finished refined cover image.
```

</details>

## Change log

2026-10-06 — working-tree from `0acb203`: add the generated cover, bilingual feature overview, quick start and guide links.
Split troubleshooting into reconnect, progress, streaming and error sections. Preserve the full operational guide.
Scope: `README.md`, `README.zh-TW.md`, the cover, document index and this record.
Verification passed; no unrelated change was observed at entry or the pre-commit checkpoint.
README SHA-256: `280b5c98a5b5aa5a734e4e45f1f54be08adfccee2efa4a1a4b46d86cd7773484`.
Chinese README SHA-256: `e6749328ec5d83b75241e97e088c258b3e960f6cfa3e628e93962e8840d4665d`.
Cover SHA-256: `554b6f0a202040fc9c19bc3ebfbeae65685fee64e26afdab6df7c44b80a178bd`.
The containing atomic commit identifies these bytes without a self-referencing record edit.

## Handoff audit

Installed Harness: `0.62.2`; loaded skill identity: unobserved.
Template SHA-256: `feed8dcc70b3691d9822a1b05641d4502dae452fd1926954f09db3fc78fff62f`.
Shared AGENTS rules remain current by meaning; preserve local role, deployment and data rules.
The entry document inventory reports first-observation and unknown-loaded-identity findings, rather than approval.
Its private output is `.bridge/readme-entry-20261006.json`.
No shared governance change is needed for this documentation task.

## Results and remaining work

All 46 local links and heading anchors passed. Each README retains all nine original command blocks.
PNG integrity, decompression and original-copy equality passed: 1942 x 809 pixels, 1,826,537 bytes.
Visual inspection confirmed the cover's two requested text strings and three-path bridge composition.
`node bin/bridge.mjs --help` exited 0 within a 15-second subprocess deadline.
Its commands and status options agree with the added examples. `git diff --check` passed.
Private verification: `.bridge/readme-verification-20261006.json`.
The handoff inventory reports the same first-observation and unknown-loaded-identity gaps; no required source is missing.
The bilingual READMEs, index and task record agree with the inspected CLI and native-provider contract.
No application code changed; application regression tests and independent code review were not required for this scope.
No service, watcher or native model request was started for verification.
Remote publication and provider deployment are outside this request.
