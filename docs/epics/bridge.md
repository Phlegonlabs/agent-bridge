# Multi-model workflow bridge

## Scope and authority

The owner requested a new repository and authorized implementation of the local bridge discussed in the task. The owner selected branch `multi-model-bridge`. No remote publication, installed-app replacement, profile overwrite, or data cleanup is included.

Project size: small. Intent: execute-ready-plan. Route: direct. Host adapter: none. Landing: local only. Upstream inputs: task conversation. Gitignore impact: update for dependencies and private runtime output.

One writer owns this bounded initial implementation. Use Node.js with built-in process and test tools. Keep external dependencies minimal. No UI is in scope.

## Required behavior

- Discover existing user agent definitions without modifying them.
- Preserve actual model, reasoning and tool restrictions through the host's agent runtime.
- Reject unsupported routing or unverified delegation; never claim a model from response text.
- Bound process duration and output. Stop only owned processes and their descendants.
- Return structured success/failure data for `world.run()` and check exit codes in examples.
- Keep credentials, personal profiles, prompts and transcripts out of Git.
- Preserve the installed official app and its Computer Use.

## Verification contract

1. Offline fixtures prove profile handling, malformed output rejection, routing verification, timeout, cancellation, and parallel independence.
2. Installed-runtime preflight must observe the actual CLI version and interface.
3. One live read-only trial per selected profile must show host-confirmed agent and model. Record failures as failures; a mock does not satisfy this obligation.
4. A native Dynamic Workflow example must check both command exits before consuming results. End-to-end native UI execution is a separate evidence item.

## Checkpoints

- Start: created a new empty repository on `multi-model-bridge`; no existing repository files were overwritten.
- Observed Windows installation: ZCode 3.14.3.7762. Source investigation is based on upstream snapshot 872ad960de7ec172591f7e1952f7849229f94521 (package version 3.14.0), so installed-runtime checks are required.
- Existing user profiles include `code_explorer` and `reviewer`, with distinct explicitly configured models. Personal profile contents remain outside this repository.

## Open compatibility questions

- The stock CLI has no `--model` or `--agent` flag. Verify native agent dispatch and provenance before choosing the execution adapter.
- Workflow actors do not load named custom profiles and cannot recursively spawn ordinary agents. Integration uses `world.run()`.
- External workers do not automatically receive desktop Computer Use.

## Implementation checkpoint

Local CLI commands: `profiles`, `doctor`, `login`, and `run`. The execution adapter uses native Agent dispatch and rejects results without correlated child model-request evidence. Only plan-mode profiles with explicit read tools are enabled in this first milestone.

The first actual native dispatch reached `code_explorer`, but its GLM account provider was unavailable to the standalone CLI. That failure was not treated as completion. The owner chose to retain GLM and establish CLI access. A separate bridge account directory and official browser login were added without changing desktop profiles or credentials.

The offline suite passes 21 tests, including actual process termination and descendant termination on Windows. Official isolated CLI login succeeded. Single-agent and parallel two-model GLM trials passed with native model-request evidence. The project-scoped `glm-parallel-probe` saved workflow compiled and completed through the official CLI's native Dynamic Workflow engine. Desktop UI launch and writable workers are not covered. See `docs/compatibility.md` for the evidence boundary. No commit, remote push, release, or installation replacement has been performed.

The completion document review reconciled README, document index, this Epic, and compatibility evidence. The document inventory's unknown loaded skill identity is recorded as a review finding, not a delivery PASS. This local working-tree prototype has no fixed commit SHA for a release or fixed-SHA security assessment.

## Cursor extension checkpoint

The owner requested Cursor Agent CLI as another worker invoked by ZCode Dynamic Workflow. This is a small direct change on the same branch; the existing uncommitted GLM implementation remains in place. Cursor uses its own native account, model selection, and ask mode. ZCode profile permissions are not translated into Cursor settings.

The installed `cursor` command launches the editor; the global `agent` executable belongs to another installation. The official Windows Cursor CLI package was unpacked into a new ignored repository-local directory, without running the global installer. Cursor's native status reports an existing authenticated account. The owner chose Composer 2.5. Its single-worker trial and the three-worker `glm-cursor-probe` native workflow passed. All 28 offline tests pass.

The first mixed run correctly failed on the GLM reviewer's 60-second timeout, with its owned process tree terminated and no observed survivors. The mixed example's reviewer deadline was raised to 120 seconds; the corrected native run settled as completed. Cursor uses ask mode and explicit workspace trust for this project, without force mode. No writable-worker or desktop UI launch claim is made. The working tree remains uncommitted on `multi-model-bridge`.
