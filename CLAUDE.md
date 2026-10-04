# Project Instructions

@AGENTS.md

## Runtime Boundary

- On each skill invocation, follow the shared document-sync and bounded-enhancement rules in `AGENTS.md`; keep runtime-specific instructions here. Preserve existing owner text when an authorized pointer correction is needed, and never copy one runtime's instructions over another's.

- Treat `AGENTS.md` as the shared repository governance imported above. Preserve the current host's effective context discovery.
- Use the general runtime adapter reference (`delivery-harness/references/runtime-adapters.md`) to map observed native tools to the shared capability contract. The parent retains authorization; host names do not choose launch APIs, roles or models.

The rules below apply only when this session is executing a managed Product Delivery Harness PLAN/RUN mission. Direct work follows `AGENTS.md` and the user's request without creating Harness state or worker topology.

## Managed Harness Missions

- A mission worker is one bounded writer. It never delegates, edits parent-owned PLAN/RUN state, integrates, pushes, or cleans up. Authorization for those actions remains with the Harness parent and does not transfer to the worker.
- Explorers, mission writers, and reviewers are parent-dispatched siblings. Each writer has explicit file ownership and a separate clean exact-base worktree.
- After serial integration, the parent starts fresh reviewers on the unified head, including the required read-only `code-security-review` sibling, and runs one broad final validation only after those reviewers pass.
- Harness 0.38+ RUNs close locally. Only the parent may later archive candidate C, commit and reverify archive-only A, and—under separate action-time authorization—publish A through the checkout-external request/attempt/receipt protocol. No Claude worker receives that authority.
- Return the exact worktree, branch, head SHA, changed files, verifier evidence, and blocking state through the completion channel supplied by the Harness parent.
