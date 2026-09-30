# Saved workflow execution settings

The owner asked to select a reusable workflow execution setup, retain model assignments, limit parallel workers, and configure fallback. The owner explicitly chose automatic fallback off by default.

Small direct enhancement, one writer, same local `multi-model-bridge` branch. No commits exist. Existing bridge files are untracked and retained. This extends the [bridge](bridge.md), with no installation replacement, native UI patch, publication, or profile overwrite.

## Acceptance

- A project saved workflow takes a task and uses a persistent default preset. The current ZCode main model remains the orchestrator.
- Each worker has an explicit native route. Model selection is stored once, not guessed for each run.
- A bounded queue enforces 1..14 active jobs per batch, including fallback and cleanup. Default 14, as clarified by the owner. Separate workflow runs have separate limits.
- The main model freely assigns tasks to workers in the saved allowlist. It can provide jobs directly. With only a task supplied, a native workflow planning actor proposes the jobs; its model follows ZCode's native actor settings, not a forced bridge override.
- Fallback defaults off; candidates are explicitly ordered, with at most two per worker. Cancellation, protocol failures, model mismatches and unconfirmed cleanup cannot trigger fallback.
- Native saved parameters expose the preset, parallel limit and fallback mode. Upstream schema lacks enum/dropdown options; no native model-dropdown extension is claimed.
- Offline tests cover concurrency, fallback, invalid input and cancellation. One native parameterized saved-workflow run verifies actual models and a parallel-limit override.

## Change log

- Implementation started: new preset configuration, batch scheduler, CLI entry and saved workflow. Existing read-only worker restrictions and model audits remain in force. Native desktop UI interaction is outside the verified evidence so far.
- Owner clarification: changed the default/maximum parallel limit from the initial proposal to 14; selected free main-model routing within the allowlist. Direct job assignments skip the native planner. Task-only launches use the planner with the existing native model setting. No fixed stage-to-model rules were added.
- Verification: all 41 tests passed. The three-model native auto-routing run completed with an override of 2 and a measured peak of 2. The direct-assignment native run completed, inherited 14, and created no planning actor. Full IDs, observed native rate-limit backoff and evidence boundaries are in `docs/compatibility.md` and `docs/verification/workflow-presets.json`.
- Final review: configuration, queue, cancellation, fallback, CLI inputs and native output limits reviewed. The repository remains uncommitted on the original branch, with no publication or installed-app modification. No fixed-SHA security or delivery acceptance PASS is claimed. Document inventory still lacks a loaded-skill identity and prior baseline; live documentation was reviewed directly for consistency.
