# Project Rules

This file is ready-to-use shared repository guidance. Resolve the repository's commands and protected paths from live project state; do not leave template placeholders or assume they are always the same across repositories. Managed Harness requires the default branch to be named `main` (see Mandatory Governance Routes).

## Runtime Boundary

- This file is the entry. It contains authority boundaries and routes, not complete procedures. Preserve the current host's effective instruction discovery and precedence.
- Apply `delivery-harness/references/delegation-contract.md` before direct or managed routing. Split independent substantive research/exploration questions into distinct authorized sibling instances, resolve mandatory frontend/reviewer roles against effective host policy, and verify actual launch/result identity. The actual frontend author reads the complete pinned `frontend-design` SKILL.md and applicable project design skills in its own context; verify the full-tree pin independently. Fresh independent review binds the exact candidate. One writer owns each checkout, including the parent. Required delegation never silently falls back to parent work.
- Use the general runtime adapter reference (`delivery-harness/references/runtime-adapters.md`) for observed capabilities, authorization, isolation and result contracts. Host policy supplies role/model and explicit bridge bindings; shared skills supply no provider-specific model default. External execution retains its own authorization and capability checks.
- Rules under **Managed Product Delivery Harness Runs** apply only after the Harness routes work into PLAN/RUN. Small direct work follows the shared principles, Git safety, and verification rules without creating Harness state, missions, workers, or worktrees unless the repository or user requires them.
- Preserve unrelated local work. Important local data needs explicit owner approval before deletion, overwrite, or move.
- Give every new child fresh context and a scoped packet. State `max_message_bytes` and check the complete UTF-8 message before launch.

## Required Reading

- Before any managed Product Delivery Harness work, the session reads the managed PLAN/RUN owners in **Mandatory Governance Routes** and the installed `delivery-harness` SKILL.md (the orchestration skill itself, loaded as a skill rather than a table slot); the Skill Bindings table below pins the stage-slot skills the harness dispatches, and their pinned SHA-256 hashes are verified by `delivery-harness/scripts/check_skill_bindings.py`.
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

## Deployment

The provider deploys manually from `main` to the existing Windows loopback service on port 32147. See `docs/DEPLOYMENT.md` for source identity, private state and verification. GitHub Actions tests source on three platforms; it does not deploy. Candidate tests use isolated synthetic state. Check active work and process identity before an authorized restart. This record grants no external action.


## Mandatory Governance Routes

Resolve `delivery-harness/` references against the observed installed delivery-harness skill root, not a presumed target-local `skills/` directory. Read the complete named section before the action named by its trigger. The route is mandatory; an owner file's rules cannot be widened by this entry.

| Trigger | Complete rule owner |
| --- | --- |
| First work in a session or every skill invocation | `delivery-harness/references/governance/task-and-handoff.md#project-entry-and-current-work` |
| Task start; significant edit, commit, merge, branch switch, or observed external change | `delivery-harness/references/governance/task-and-handoff.md#repository-change-checkpoints` |
| Completion or handoff | `delivery-harness/references/governance/task-and-handoff.md#handoff-documentation-audit` and `delivery-harness/references/governance/task-and-handoff.md#consumer-completion` |
| Local deletion, overwrite, or move | `delivery-harness/references/governance/development-rules.md#protect-local-data` |
| Implementation or repair | `delivery-harness/references/governance/development-rules.md#keep-changes-simple` and `delivery-harness/references/governance/development-rules.md#consumer-core-development-principles` |
| New or changed documentation | `delivery-harness/references/governance/development-rules.md#document-writing` |
| A task introduces or retires a local-only file class | `delivery-harness/references/gitignore-contract.md` |
| Product requirements, architecture, UI impact, redesign, pricing, or partner channel | `delivery-harness/references/governance/product-contracts.md#consumer-keep-product-contracts-current` |
| Pricing, paid access, purchase-gated features, or outside sellers | `delivery-harness/references/project-operating-rules.md#monetization-and-partner-channels` |
| Branch, commit, integration, archive, publication, cleanup, or protected-branch landing | `delivery-harness/references/governance/managed-delivery.md#git-safety` and `delivery-harness/references/commit-convention.md` |
| Managed PLAN/RUN | `delivery-harness/SKILL.md`, `delivery-harness/references/governance/managed-delivery.md#managed-product-delivery-harness-runs`, and `delivery-harness/references/project-operating-rules.md#managed-product-delivery-harness-runs` |
| Deployment model, verification, or platform move | `delivery-harness/references/deployment-contract.md#deployment-contract` |
| Post-delivery activation | `delivery-harness/references/project-operating-rules.md#post-delivery-activation` |
| Review or acceptance claim | `delivery-harness/references/governance/managed-delivery.md#review-guidelines` |

The Epic and index record observed work; neither record grants product approval, marks a test PASS without evidence, or authorizes a commit, branch, install, push, deployment, cleanup, publication, or external action.
