# Harness 0.61.0 context synchronization

## Scope

Update shared instructions and existing skill pins. Preserve project rules, product decisions and history. UI impact: none.
The owner selected `codex/harness-refresh-0.61.0` on 2026-10-04. Local atomic commits follow the effective owner instructions.
This direct task grants no new push, deployment, activation, protected-branch promotion or cleanup.

## Baseline

- Repository: `C:\Users\mps19\Documents\GitHub\agent-bridge`
- Original branch: `main`
- Observed HEAD: `acb9b31304e5933134079f923a08544b24edb3f4`
- Work branch: `codex/harness-refresh-0.61.0`
- Prior dirty paths: 0; observed / unverified, outside this maintenance scope.
- Installed Harness: 0.61.0; loaded skill identity: unknown.
- Installed template SHA-256: `feed8dcc70b3691d9822a1b05641d4502dae452fd1926954f09db3fc78fff62f`
- Requirements: HARNESS maintenance; no product requirement change.
- Route: one parent writer, sequential direct document maintenance; no managed PLAN/RUN.

## Change Log

2026-10-04 — working-tree: reconciled AGENTS.md, CLAUDE.md.
Shared rules are current by meaning. Retained local differences: project-specific headings, paths and deployment context.
Changed instruction fingerprint: `90992c4afe8c87d40715bedd28056de42da612bb093b142518236bdab9e2e239`.

Verification: bindings product-definition: PASS; context headings valid; owner sections preserved; original PLAN/RUN bytes preserved where present.
Unrelated tracked working changes retain their original diff. The staged scope receives a final whitespace check before commit.
Stage slots remain pending; no managed stage readiness is claimed.
No application code changed, so application tests and browser checks are not applicable.
No artifact class was introduced; generated logs and receipts stay outside the repository. Existing ignore rules remain unchanged.
Commit identity is retained in the external per-checkout receipt, rather than a self-referencing commit.

## Handoff

```text
Repository / branch / HEAD / dirty paths: C:\Users\mps19\Documents\GitHub\agent-bridge / main (tracks origin/main) / 0a220e5d8236ec823b830844df429d36edb0b547 (docs(harness): adopt the released 0.75.3 bundle and fix the managed-run pointer) when written; this update lands in the next commit / 0 dirty paths before this edit; ignored .bridge/, .tmp-debug*/ and .zcode/ left alone
Stage and skill: Harness 0.75.3 adoption and handoff documentation audit, direct documentation maintenance by one writer; no PLAN/RUN; UI impact none
Inputs consumed (path + hash or revision): Harness 0.75.3 from tag v0.75.3 (645b433501b1dafc61634d992fb86c9f293c8c3e), contract a191bfa0f78af4ef856528173ae36d734275322f7a053a956e7788d76ea8f631; VERSION sha256 d8a163093d4d9081f96229d64aa23677edf86005827404595c4fd1af5834ea26; PROJECT_AGENTS.template.md sha256 ade4855dfda73be0d47bae559a1e6b821f8b4efb06086bc97910999e10de78f1; PROJECT_CLAUDE.template.md sha256 39f476bc67ebd0b85acdbf22b0a1a91770b85c549c4d3d451526b784e6bc63b8 (same as 0.75.2); AGENTS.md sha256 ce4192871c106cc595987c07e417a73957a8903c08ec72f6873cb80bd626c078; CLAUDE.md sha256 9d8ba938f5a36337e0a47bb97c453066090ed7271e04b7695fbb82429c58f7f4 (unchanged); loaded skill identity unobserved
Approvals in force (gate, owner, date, candidate): none granted by this record; the 0.75.3 adoption and this document update were requested on 2026-11-02; product approvals and original PLAN/RUN pins are unchanged (no docs/product package or docs/goal files exist here)
Done and verified (command, exit code): 0.75.3 adopted in 0a220e5: AGENTS.md Harness Version now names v0.75.3 and contract a191bfa0f78af4ef856528173ae36d734275322f7a053a956e7788d76ea8f631, and the managed-run bullet in Runtime Boundary points at delivery-harness/references/project-operating-rules.md#managed-product-delivery-harness-runs instead of a section AGENTS.md never had. Audit against the installed 0.75.3 PROJECT_AGENTS.template.md: shared rules current by meaning, and that bullet now matches the template; local rules kept: default-branch sentence, Harness Version section, max_message_bytes bullet, Required Reading routing, code_security_verification binding, resolved Deployment section. CLAUDE.md is current by meaning and has no section pointer to fix. Live-doc search (git grep -n -E "0\.75\.2|9ffdddab|d70347f8") found no stale current-version line outside docs/epics; the only live hit is docs/document-sync.json installed_digest, left for the parent refresh. Change Log rows, including the 0.75.2 and 0.75.3 adoption rows, are unchanged. Checks: check_skill_bindings.py --stage product-definition exit 0; git diff --check exit 0. Earlier 0.75.2 audit (2026-11-02): AGENTS.md shared rules were stale in three spots (Required Reading scope line missing, ui_quality_verification stage text, impeccable side-effect pointer) and were brought to the template by meaning (3f6cde1); live docs fixed (1f934ca): docs/compatibility.md said the 0.61.0 refresh branch was not merged into main, but main contains it, and docs/DOCUMENTS.md now describes this Epic as the adoption log and handoff; follow-up (c8f3e03, e1d1559): docs/DEPLOYMENT.md has the External Console Setup table (one none / n/a row) and a Measurement Sources section with the template header and no rows, because no metric is named, so check_deployment.py --require-measurement-sources no longer reports either section
Remaining: product definition (no docs/product package), the pending UI stage bindings, and loaded runtime identity stay separate checks; check_deployment.py still reports Release Unit Names, Required Secrets and Variables and Environment Status in docs/DEPLOYMENT.md; docs/document-sync.json still records the 0.75.2 installed_digest 9ffdddabf8b701a672dbc037308e78dcd90f7ccf57407ac6eef7bb9bb24c1740 until the Harness parent refreshes it
Blocked / waiting (gate name or owner decision): nothing is waiting on the owner
Next action (one command or one owner decision): Harness parent refreshes docs/document-sync.json after all repositories finish; no owner decision is open
Next owner (skill or human): Harness parent, then human owner
```

## 2026-10-07 — Harness 0.62.3 context entry

The owner requested the update across the GitHub folders. UI impact: none; direct maintenance by one parent writer.
Baseline: `a08b9744558ee7e892e91dfd59a6e77d8fbe849e` on `codex/zcode-image-routing`. Prior unrelated changes remain observed/unverified.
Scope: `AGENTS.md`.
Installed template SHA-256: `0ab60fc38dbad32ed6025833a1ea152c7d2e38da5b8c22a6584f25edb082de11`. Loaded skill identity remains unknown.
Moved shared procedures behind mandatory routes. Retained local rule text, skill pins, deployment facts and historical RUN bytes.
Verification: exact retained-section comparison, local link/anchor checks, scoped whitespace check and independent review. Final results and commit identity are recorded in the checkout-external GitHub synchronization report.
No product tests are applicable. This update grants no push, deployment, installation, archival or cleanup.

| 2026-10-25 Harness candidate adoption | Owner requested all GitHub Harness checkouts use the latest candidate and publish their work branches. Baseline `ac7a84f6d24482da5d4c7aede88e97e9801cbcd5` on `codex/zcode-image-routing`. `AGENTS.md` and `CLAUDE.md` adopt 0.69.0 source `4b46736d8665d9ad5704e3a31b6f4fb8f6bbe7d7`; bundle `d4bb059a057766f65bb886de3fcc6743e5ad3fc719513f4c64e3051693db3a23`; template `32ca0bf1680c8bf84b045e9d98521550cc7d53a668db41731c8f902f9831bf7e`; instruction fingerprint `aaa84b82a8d3837c8275b8eb4e974dd7e503a68f3a1d410f130b5a399e0c0c63`. Shared rules reconciled by meaning; local owner sections, external/pending bindings, product/design bytes and RUN pins retained. Bindings PASS (product-definition only; unresolved slots retained); exact retained-byte and whitespace checks PASS. Entry inventory reviewed for this maintenance scope; loaded identity remains unobserved. UI impact: none. No product readiness or release approval. Independent review and remote readback follow in the parent handoff. |
| 2026-10-25 product-document reconciliation | Portfolio adoption follow-up verified tracked docs by name: compatibility, cursor, DEPLOYMENT, native-provider, workflow-presets, zcode-images, DOCUMENTS.md and eight Epics. No docs/product package exists in this checkout, so no PRD or review copy was created; a missing product definition stays an explicit gap, not completed work. UI impact: none. No product readiness claim. | Reconciliation observation only; no checker applicable (no package). Next action: product definition requires a separate owner request. |
| 2026-10-26 Harness 0.72.0 adoption | Owner asked every GitHub Harness checkout to use the released 0.72.0. Baseline `dbe1f56a9bdf873164c9bfafbf9472c4f47b847c` on `codex/zcode-image-routing`. `AGENTS.md` Harness Version moves from candidate 0.69.0 to released `v0.72.0` (`e1cd13a4af3e5b916e57bb2d3ba0978a1e001f4e`), contract `06ca34cf1fc2c9f3846c7eb035236fa251ac1727955bce0d25ebc61801f4d50d`, shared root. No bound Harness pin changed. Bindings check: exit 1: C:\Users\mps19\Documents\GitHub\agent-bridge\AGENTS.md: line 51: slot 'code_security_verification' must bind exactly one skill name, got '`pending`'. CLAUDE.md unchanged (project template unchanged since 0.69). Product/design bytes, approvals and RUN pins retained. UI impact: none. Not pushed. |
| 2026-10-29 Harness 0.73.0 adoption | Adopt the installed Harness 0.73.0 candidate bundle. Baseline `9a7964a7437464d64e3d409bf45f4b3ef1c72428` on `harness-0.73.0`. `AGENTS.md` Harness Version moves from released `v0.72.0` to candidate `feat/surface-taxonomy` (`e84753009e68e41a958ec1ad5729578ed405c1c0`, not yet tagged), five-skill contract `f7bfe714dc63339802a96d726a8c2e07a64ffb442161b66dd06f0c7cfa06e92f`, shared root. The `code_security_verification` slot now binds `delivery-harness/references/security-review.md` (`5295475d…`) instead of a separate skill, and the activation record is retired in favour of External Console Setup rows in `docs/DEPLOYMENT.md`. Bindings check: exit 1: only the pending UI slots remain (ui_design, style_integration, design_compilation, frontend_implementation, ui_quality_verification); the security slot passes. No product or release change. UI impact: none. Not pushed. |
| 2026-10-31 Harness 0.74.0 adoption | Adopt released Harness 0.74.0 from tag `v0.74.0` (`b8e322498c9f93a8aec18d7f439c470f98f88de0`), five-skill contract `beab394e9bb952be6766d0b20472de299ae07af1362b7a2c8796ea26ef9f91da`, shared root. The release adds the inspector `Next` block, stage cards, the launch brief, route caps, the readiness environment preflight, the Epic `## Handoff` block and the independent PRD review. Bindings check: exit 1: pending UI slots remain (design_compilation, frontend_implementation, style_integration, ui_design, ui_quality_verification). No product or release change. UI impact: none. Not pushed. |
| 2026-10-31 Harness 0.74.1 adoption | Adopt released Harness 0.74.1 from tag `v0.74.1` (`9e9280a711ce1a8e67578ccdc1ccb7cbfe848dc5`), five-skill contract `ea3fb3f1d0bc0831611e53310f0421c6ed332aa92822a801c8ae46c965d1bc3c`, shared root. The patch keeps the document-sync inventory alive when `docs/goal/PLAN.md` or `RUN.md` exceeds the per-file limit and when a default-scanned file name matches the secret and history exclusion. No bound skill changed. No product or release change. UI impact: none. Not pushed. |
| 2026-11-02 Harness 0.75.2 adoption | Adopt released Harness 0.75.2 from tag `v0.75.2` (`d70347f898c700a64f05ec04712f533f79a4b92a`), five-skill contract `9ffdddabf8b701a672dbc037308e78dcd90f7ccf57407ac6eef7bb9bb24c1740`, shared root. The release adds Linux desktop targets, a GA4 admin setup guide, the design-first UI flow (optional R0 exploration, journey maps before HiFi), the AI feature contract, performance and cost budgets, native build cleanup, the `program` delivery profile, and thinner references. No bound skill pin equalled the previous release tree, so bindings are unchanged. No product or release change. UI impact: none. Not pushed. |
| 2026-11-02 Harness 0.75.3 adoption | Adopt released Harness 0.75.3 from tag `v0.75.3` (`645b433501b1dafc61634d992fb86c9f293c8c3e`), five-skill contract `a191bfa0f78af4ef856528173ae36d734275322f7a053a956e7788d76ea8f631`, shared root. The release fixes template defects found in the 0.75.2 adoption; this repo's AGENTS.md now points the managed-run rules at `project-operating-rules.md` and Mandatory Governance Routes instead of a section it never had. Bound skill pins are unchanged (their trees did not change). No product or release change. UI impact: none. |
