# Project Rules

This file is ready-to-use shared repository guidance. Resolve the repository's commands and protected paths from live project state; do not leave template placeholders or assume they are always the same across repositories. Managed Harness requires the default branch to be named `main` (see Git Safety).

## Runtime Boundary

- This file contains shared repository governance. Preserve the current host's effective instruction discovery and precedence.
- Apply `delivery-harness/references/delegation-contract.md` before direct or managed routing. Split independent substantive research/exploration questions into distinct authorized sibling instances, resolve mandatory frontend/reviewer roles against effective host policy, and verify actual launch/result identity. One writer owns each checkout, including the parent. Required delegation never silently falls back to parent work.
- Use the general runtime adapter reference (`delivery-harness/references/runtime-adapters.md`) for observed capabilities, authorization, isolation and result contracts. Host policy supplies role/model and explicit bridge bindings; shared skills supply no provider-specific model default. External execution retains its own authorization and capability checks.
- Rules under **Managed Product Delivery Harness Runs** apply only after the Harness routes work into PLAN/RUN. Small direct work follows the shared principles, Git safety, and verification rules without creating Harness state, missions, workers, or worktrees unless the repository or user requires them.

## Project Entry And Current Work

Start with the effective repository instructions, `docs/DOCUMENTS.md` when present, current product/design sources and relevant unfinished work. At the first work in a new session and every skill invocation, apply `delivery-harness/references/document-sync-contract.md`. Resolve every `delivery-harness/` reference against the observed installed delivery-harness skill root, not a presumed target-local `skills/` directory. Observe loaded versus installed skill identity; unknown means unknown, not the current disk version.

Keep one current PRD. Complete enhancements use `docs/epics/EPIC-<id>.md`, indexed in `docs/DOCUMENTS.md`, to record the problem, baseline, accepted outcome, requirement references, dependencies, document impact and result. Small fixes append to the relevant Epic; detailed direct-task evidence may be linked from it. Follow `delivery-harness/references/bounded-enhancement.md`; an Epic never duplicates PRD or RUN and never grants actions.

Select the record before implementation: a new accepted outcome gets a new Epic; same-outcome fixes append to its Change Log; an isolated small fix gets a bounded Epic entry that may link detailed direct-task evidence. Log the reason, affected scope, commit, tests and remaining work. Do not rewrite closed history. UI enhancements add or patch only named Wireframe/HiFi pages and necessary connecting controls; retain every unaffected product page, style and ID. Full package coverage is not an instruction to redraw the product.

Derive the goal, write scope, design source, dependencies and acceptance checks in the existing task record or PLAN/RUN. Use direct work when one writer and one coherent verification sequence suffice; use managed coordination only when durable handoff, isolated integration or a bounded graph requires it. Preserve valid decisions and authorizations; ask only about a concrete missing dependency.

## Repository Change Checkpoints

These checks apply to every agent task, including work outside Product Delivery Harness and repositories without PLAN/RUN. Run them at task start, after a significant edit/commit/merge/branch switch or newly observed external change, and before completion or handoff. They are task checkpoints, not a background timer, and require only local Git plus the repository documents.

- Observe repository root, branch, HEAD, staged/unstaged changes and non-ignored untracked paths. Compare with the last recorded repository/branch/HEAD and scoped change evidence in the relevant Epic. Use bounded local history and scoped diffs; do not fetch, scan all history or open credential files. Include commits made outside Harness as well as current working-tree changes.
- If the baseline is missing, unreachable or belongs to another branch/repository, record a first observation or baseline gap and the current facts. Do not claim an exact delta or that nothing changed. Preserve unrelated dirty work; discovering a change is not permission to edit it.
- Record each meaningful code, product, configuration or documentation change in `docs/epics/EPIC-<id>.md`, even for small direct work. Append to the matching Epic's Change Log; create a narrowly scoped Epic only when no suitable one exists. An unknown-purpose external change is `observed / unverified` with an explicit scope/intent gap, not an accepted feature or completed task. Keep `docs/DOCUMENTS.md` indexed.
- Keep the record factual: observation time, repository/branch, baseline and observed HEAD, affected paths and requirement IDs when known, observed behavior/change, decision source if known, actual verification and unresolved work. Label uncommitted evidence `working-tree` and record its actual verification separately; HEAD alone does not identify those bytes. Retain scoped diff evidence or its fingerprint so an unchanged HEAD cannot hide new edits. Exclude secrets, generated caches and the Epic/index update itself from recursive change logging.
- Group related changes into one logical entry; append again only when the observed change, verification or unresolved state differs. Reuse an existing entry from another agent instead of duplicating it. A no-change check needs no new Epic or log row. Preserve old results and archived records; a follow-up links them rather than rewriting history.
- During a read-only or no-write task, report the proposed Epic update without writing it. Otherwise update the Epic/index under the task's local documentation authority. The record never grants product approval, marks tests passed without evidence, creates PLAN/RUN, or authorizes commits, branches, installs, pushes, deployment or cleanup.

## Handoff Documentation Audit

Before every handoff, repeat the repository change checkpoint and check whether the documents affected by the observed work agree with the current product and task state. Use `docs/DOCUMENTS.md` to find applicable live PRD, architecture, design, deployment and activation sources; check their status, links, requirement IDs and acceptance criteria. Confirm that each meaningful change appears in the matching Epic Change Log and that the current task record names the actual result, verification and remaining work. For a managed run, compare `docs/goal/PLAN.md` and `RUN.md` with any `docs/tasks.md` view using the renderer's `--check`; RUN is authoritative and a direct task does not need a tasks view. Do not hand-edit the generated part of `docs/tasks.md` or rewrite archived records.

At the same handoff, compare this `AGENTS.md` with the **observed installed** `delivery-harness/assets/templates/PROJECT_AGENTS.template.md` and `delivery-harness/VERSION`. Check shared rules by meaning, not whole-file equality: repositories may add stricter local instructions. Mark the shared rules `current`, `stale` or `unknown` with the observed template identity and concrete differences. Under the current task's authorized document-write scope, update only stale shared instructions in place, preserving owner rules, local paths, bindings and historical decisions; never replace the file from the template. If the installed template is unobserved or a safe merge is unclear, leave the file intact and name the gap in the handoff.

The handoff names the repository, branch, HEAD and working-tree status, the template identity and drift decision, document/Epic/task findings, changes actually made, verification and the next owner/action. A read-only handoff reports proposed updates without writing. A no-change audit needs no new Epic row. This is a task-boundary check, not a timer or permission to publish, approve, commit, push or delete.

## Required Reading

- Before any managed Product Delivery Harness work, the session reads this file's **Managed Product Delivery Harness Runs** rules and the installed `delivery-harness` SKILL.md (the orchestration skill itself, loaded as a skill rather than a table slot); the Skill Bindings table below pins the stage-slot skills the harness dispatches, and their pinned SHA-256 hashes are verified by `delivery-harness/scripts/check_skill_bindings.py`.
- Before any product-affecting direct work, the session reads the affected sections of `docs/product/PRD.md` plus every document `docs/DOCUMENTS.md` names for that scope (retained wireframes, design package, architecture). A named source that does not exist yet is reported, not skipped.
- Skipping this reading is a blocking review finding: a change built on unread contracts is not a completed change.

## Skill Bindings

The delivery flow binds stage slots, not fixed skill names. This table binds the project's installed skills to those slots; updating it to adopt a new skill is a project edit, not a harness change, and a bound skill inherits the same modes, frozen sources, and review gates as the default.

| Slot | Stage | Bound skill | Pinned SHA-256 |
| --- | --- | --- | --- |
| ui_design | approved Product Definition → UI intake, directions, HiFi, approval | `pending` | `pending` |
| style_integration | approved PRD and selected direction → page theme and connected HiFi target | `pending` | `pending` |
| design_compilation | frozen design-system pair | `pending` | `pending` |
| frontend_implementation | implementation missions | `pending` | `pending` |
| ui_quality_verification | authorized HiFi/page-quality review | `pending` | `pending` |
| code_security_verification | fresh unified code-security review before final regression and closeout | `pending` | `pending` |

These rows are intentionally unresolved in the seed. Before managed work, observe the installed skill trees, show the exact choices and side effects to the owner, then replace each required stage slot with one skill name and its full-tree SHA-256. `pending` in both cells is allowed only outside the checked stage. Product Definition uses `--stage product-definition`; UI authoring uses `--stage ui-design`; compilation uses `--stage design-compilation`; a proven headless/backend-only scope uses `--stage backend`. Omit `--stage` for full UI delivery or unknown applicability. Recheck at every stage change; a stage result never authorizes a later stage. `frontend-design` is external and supports visual direction/frontend authoring only; do not claim compilation, conformance, or read-only modes it does not define. The pinned `impeccable` profile requires separate authorization for subagents, browser/server activity, snapshot writes, and any optional binary download; it is not a Harness read-only reviewer. `delivery-harness/scripts/check_skill_bindings.py` rejects unresolved, fenced, duplicate, malformed, missing, or drifted bindings. The code-security reviewer receives no implementation or lifecycle authority.

## Core Development Principles

For work consuming a Product Definition package, apply `delivery-harness/references/pre-delivery-self-review.md` before execution. A backend-only binding check is not permission to defer required UI/self-review for a UI-bearing initial delivery. Keep scoped enhancement/maintenance routes and the reference's historical-approval catch-up rules.

### Bounded Enhancement And Test Evidence

- At every skill invocation, apply the shared `delivery-harness/references/document-sync-contract.md`; inspect current PRD, runtime/skill identity and relevant instruction pointers before work. Preserve owner rules and immutable history.
- Follow `delivery-harness/references/bounded-enhancement.md`: reuse the accepted scope and valid action grants for repairs, technical document synchronization, module replacement and retesting. Do not repeat approvals for unchanged decisions. Never infer external, destructive, publication or installation authority.
- A module that fails accepted requirements may be replaced inside its write scope; preserve required interfaces, unaffected requirements, data and recoverable history. Reverify dependent behavior rather than preserving bad code through patches.
- Use `delivery-harness/references/delivery-acceptance-contract.md` for isolated synthetic accounts, separate mock/real-auth tests and per-platform evidence. Never use production data or a test login bypass in production.
- Bound repair attempts; retain unresolved PRD/TEST gaps for the next round. Ending a round is not a delivery PASS, a descoped requirement, or authorization to launch another task.

### Keep It Simple (KISS / YAGNI)

- Only do what's asked. No unrequested features, fallbacks, or "future-proof" abstractions.
- Prefer the simplest thing that works. Don't over-engineer.
- Don't "improve" code you weren't asked to touch.

### Document Writing

Use the core writing rules of [ASD-STE100 Issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf) for new or changed project documentation. This is a STE-informed guideline, not a claim of full conformity.

- Give each sentence one main idea. Use active voice and name the actor when ownership matters.
- Give each procedure step one instruction, using the imperative form. Put necessary conditions before the instruction and state the expected result when needed.
- In English prose, use at most 20 words per procedural sentence and 25 per descriptive sentence. Split long sentences without removing necessary information.
- Use the same term for the same concept. Define new technical terms and reuse established project terminology.
- Preserve literal code, commands, paths, identifiers, error messages and quoted source text. Code blocks, structured examples and literal strings are outside this guideline's prose counts.
- Preserve requirement strength, technical meaning, approvals and history. PRDs and specifications still include all required details and edge cases.
- Apply clarity and consistent terminology to other languages, using natural local phrasing. English word-count and dictionary rules do not apply to them.
- Use the existing document review to check clarity and meaning. Style preferences alone do not block delivery or replace behavior checks.

### First Principles

- Reason from the problem's actual constraints, not from habit, inherited patterns, or how another project solved it.
- When a decision is non-obvious, derive it from what the product must do, then choose the simplest structure that satisfies it.

### Module Size Limit

- This rule governs the consuming project where this template is applied, not the Harness skill-source repository.
- New code modules, including tests, are limited to 500 physical lines.
- Split a module before it exceeds the limit. Give each module one clear responsibility and a small, explicit interface; do not compress lines or create arbitrary fragments to evade the cap.
- Record existing oversized modules for scoped follow-up. Applying this template does not authorize a whole-project refactor.
- Choose a bounded repair or replacement from the failing requirement and regression evidence. Preserve required compatibility, data and unrelated work; never delete and rewrite a module merely because it is problematic.

### Compatibility Changes

- Do not write speculative compatibility code or retain duplicate old/new implementations. Use one implementation for the accepted contract.
- Don't add hacks, shims, or dual-path logic unless a frozen product or repository contract requires compatibility.
- Don't remove or break an existing interface as unrelated cleanup. When an authorized contract change intentionally removes one, update its consumers and tests in the same scoped change.
- Remove code only when the requested change makes it dead and verification proves it is no longer used.

### Surgical Changes

- Make the smallest change possible. One goal per change.
- Only remove imports and variables your own edit orphaned.
- Avoid wide refactors unless you can prove they're safe.
- Keep diffs reviewable and easy to roll back.

### Think Before Coding

- For multi-step, high-risk, or ambiguous work, state a brief approach, acceptance criteria, and test plan before editing.
- Small bounded work may proceed directly after inspecting the relevant code and instructions.

### Verify First

- Every change must be verifiable (tests, scripts, output). If you can't verify it, don't ship it.
- For bug fixes, add or update a regression test when practical. If no reliable automated test fits, explain the verification used instead.

## Keep Product Contracts Current

- English `PRD.md` and `architecture.md` remain implementation authority. When drafting or updating them, maintain complete Chinese `PRD.zh-TW.md` and `architecture.zh-TW.md` review copies under the Product Definition bilingual-review contract; reconcile owner feedback into English first. Chinese copies never replace canonical inputs or grant separate approval. At task entry and change checkpoints, when an existing English PRD or architecture has no Chinese copy, create a complete same-directory `<source-stem>.zh-TW.md` translation under existing write authority, even without a full Harness flow. Preserve English bytes and approvals; validate each available pair and record the backfill in the matching Epic. Read-only tasks report the missing copy; do not overwrite existing translations or automatically rewrite archives.

- When `docs/product/PRD.md` exists, every product change updates the affected PRD requirements, acceptance criteria, and trace IDs in the same change, including small post-delivery fixes that do not use Product Delivery Harness PLAN/RUN.
- Before implementation, classify the change's UI impact as `none`, `structure`, `style`, or `both`. Adding a page, route, visible region, state, or responsive behavior is at least `structure`.
- First classify the work as initial design, enhancement, routine maintenance or explicit full redesign under `ui-design-builder/references/review-workflow.md`. Routine maintenance with UI impact `none` or `style` updates the actual product, effective PRD and accepted change record while retaining historical Wireframe/HiFi/token artifacts; do not treat accepted visual differences as failure. A structural impact (`structure` or `both`) follows affected design gates. New product or stack decisions return to `product-definition-builder`; new initial and explicit full-redesign work uses `ui-design/3`, while a retained `ui-design/2` package keeps its original rules and owner exception. UI work uses `ui-design-builder`, required `frontend-design`, PRD-to-HiFi completeness checks, independent HiFi review and consolidated Visual Approval. `ui-design/3` always requires `design-system/4` and its frozen derived HTML; retained `ui-design/2` compiles `design-system/3` only when the Need Gate requires it. Preserve unrelated pages and old approval semantics.
- Preserve unaffected requirements, IDs, pages, wireframes, and design decisions. A direct task may stay small, but it is not complete while implementation and the canonical product documents disagree.

## Monetization And Partner Channels

When pricing, paid access, purchase-gated features or outside sellers apply, read `delivery-harness/references/project-operating-rules.md#monetization-and-partner-channels` in full. These rules are mandatory only for that route; they grant no actions.

## Protect Local Data

- Preserve unrelated dirty files, branches, and worktrees.
- Confirm before deleting, overwriting, or moving important local data.

## Gitignore Hygiene

- Treat `.gitignore` as part of every direct and managed change. During the scope scan, decide whether the task introduces or retires a local secret file, generated output, dependency directory, cache, log, temporary file, editor state, or platform artifact.
- Add only patterns justified by the repository's observed toolchain. Ignore value-bearing local environment and credential files plus reproducible local artifacts; keep source, lockfiles, migrations, tests, fixtures, configuration examples and schemas, product documents, and required canonical artifacts tracked.
- Keep `.env.example` or the platform-native example tracked with placeholders only, and ignore the corresponding value-bearing local file. Never open a secret file to decide its ignore rule.
- Preserve existing entries and use the narrowest practical patterns. Never add an ignore rule just to hide a dirty worktree, and never untrack a tracked file, delete it, or rewrite Git history without explicit approval. If a likely secret file is already tracked, stop and report its path without reading its value.
- Update `.gitignore` in the same scoped change that introduces the artifact class. Verify representative ignored and tracked paths with `git check-ignore -v`, `git status --short --ignored`, and `git ls-files` before completion.

## Git Safety

- Before every authorized commit, read `delivery-harness/references/commit-convention.md`. Direct tasks use `<type>(<scope>): <imperative summary>`; managed task and mission trailers apply only inside managed runs.
- Managed Harness requires the default branch to be named `main`; archive and promotion tooling binds only `main` refs. Confirm the name from repository state at bootstrap. If it differs, stop before managed work and ask the owner.
- `main` is the persistent production branch and remains protected. In the ordinary dual-branch flow, `development` is also protected and is the observed remote base; hotfixes instead start from `main`. Never edit or commit directly on either protected branch.
- Resolve the complete non-default run-branch name from repository governance or the user's instruction. Freeze the matching observed remote head in PLAN `branch_policy`: `development` for ordinary work and `main` for a hotfix. Cut both `initial_delivery` and `enhancement` run branches from that frozen head. If the kind or name is unresolved, ask; never add a fixed prefix or invent a name.
- Harness 0.38+ RUNs close `local_only` and keep their push grant false. After archival, a separately authorized checkout-external request/attempt/receipt may publish exact archive candidate A to the run branch. It never authorizes `main` or `development`.
- Follow `delivery-harness/references/branch-promotion-contract.md`: verify A and any isolated non-production deployment. In the ordinary flow, separately authorize the exact-A landing on protected `development`, then separately authorize the exact-SHA promotion to protected `main`. A hotfix promotes exact A to `main`, then no-force forward-integrates A into current `development` and verifies the resulting SHA T with retained development work. Never force-push; stop on drift or divergence.
- Preserve unrelated dirty files, branches, and worktrees. Cleanup, worktree removal, task archival, and branch deletion require their own exact authorization.

## Deployment

The provider deploys manually from `main` to the existing Windows loopback service on port 32147. See `docs/DEPLOYMENT.md` for source identity, private state and verification. GitHub Actions tests source on three platforms; it does not deploy. Candidate tests use isolated synthetic state. Check active work and process identity before an authorized restart. This record grants no external action.

## Post-Delivery Activation

Before post-delivery setup, external activation actions or readiness claims, read `delivery-harness/references/project-operating-rules.md#post-delivery-activation` in full. These rules are mandatory only for that route; they grant no actions.

## Managed Product Delivery Harness Runs

Before creating or resuming a managed PLAN/RUN, read `delivery-harness/references/project-operating-rules.md#managed-product-delivery-harness-runs` in full. These rules are mandatory only for that route; they grant no actions.

## Review Guidelines

Treat authorization bypasses, direct edits or commits on protected branches, unverified or non-fast-forward promotion, stale review SHAs, data loss, scope escapes, missing behavior verification, and work that skipped the Required Reading rules as blocking findings. Do not report style preferences as blockers.

## Completion

Update affected live PRD, architecture, design and operational sources under existing authority. Preserve untouched pages, IDs, decisions and historical evidence. Report actual SHA/build, checks, independent review, release/installation state and unresolved obligations. Required failures, stale evidence or skipped checks prevent a complete delivery claim.
