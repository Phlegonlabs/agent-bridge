# Compatibility evidence

## Claude long-task repair — 2026-10-05

Source candidate: `3b3d576ebbfa5ec2787ca3ef3445f5b690c6f5a2`.
The repair separates session-identified Claude execution from HTTP connections.
Claude defaults to 75-minute attempts and 90-minute requests, including queueing.

| Check | Evidence and limit |
| --- | --- |
| Windows Node 24.19.0 | All 191 offline tests passed against this candidate. |
| Reconnect ownership | 300 registry detachments and 20 HTTP disconnects retained one synthetic worker. The HTTP fixture recorded one side effect. |
| Deadlines and shutdown | Short controlled deadlines did not reset on retries. Shutdown waited for detached worker cleanup. |
| Session safety | Interrupted writes remained uncertain. Legacy automatic resumption required inspection. PID evidence survived result validation failures. |
| Queue recovery | An identical request retried after a certified pre-spawn queue rejection. Unknown and post-spawn failures remained protected. |
| Independent source review | Native reviewer accepted this candidate after two bounded follow-up fixes. The reviewer ran no tests. |
| Windows authenticated long task | A real 60-minute Claude task and desktop reconnect behavior remain unverified. |
| Three-platform CI | Windows, macOS and Linux each passed 191 tests at `c20157413a6bbf628d910e4857a892a541d609b2`. See [CI run](https://github.com/Phlegonlabs/agent-bridge/actions/runs/37278766985). Its source matches the reviewed candidate. Authenticated macOS/Linux requests remain unverified. |
| Running service | The owner authorized publication and restart on 2026-10-05. The replacement provider loaded `c201574` on port 32147. Health, authenticated status, model listing and the new session-header gate passed. A real 60-minute task remains unverified. |

Private test evidence: `.bridge/claude-release-regression-1791184952379/stdout.log`.
The [repair record](epics/EPIC-claude-long-task-reliability.md) retains checkpoints and remaining obligations.
The public branch is `codex/harness-refresh-0.61.0`; it has not been merged into `main`.
Shutdown cancelled an active Codex request because the host kept submitting work.
The old provider and its recorded worker exited before replacement startup.
The replacement remains running until the owner stops it.

## Public setup verification — 2026-10-04

The public CLI now supports per-provider setup/login/doctor/models, local configuration precedence, one registration flow and foreground startup with port/identity checks. Runtime discovery covers Windows, macOS and Linux. The model IDs and reasoning levels in the tracked legacy configuration are examples from the tested environment; setup uses the selected local catalogs instead.

| Check | Evidence and limit |
| --- | --- |
| Node 24 offline suite | 166 tests passed locally and in the [Windows / macOS / Linux CI matrix](https://github.com/Phlegonlabs/agent-bridge/actions/runs/37193690843). Clean runners have no provider accounts or personal agents. The first CI run exposed installed-CLI test dependencies, premature process-cleanup reporting and macOS system-link handling; the corrected matrix passed all three jobs. |
| Fresh setup | Isolated fixture with no personal profiles: selected Codex/Claude routes, both registrations, unrelated provider preservation, repeated setup, backups and cancellation passed. This uses simulated catalogs, not new account logins. |
| Windows Claude request | Native `claude-opus-5-5` returned `BRIDGE_PROBE_OK`; model/session/result evidence passed. A harmless `system/ui_invalidate` notice initially failed the old audit; the corrected audit passed the real retry and regression checks. |
| Windows Codex request | Native `gpt-6.1-sol` returned `BRIDGE_PROBE_OK` with rollout model and completion evidence. |
| Windows Cursor request | Native `composer-2.5` returned `BRIDGE_PROBE_OK` with init/result evidence. |
| Current GLM workflow | Not revalidated live: the current account's five personal profiles do not satisfy the legacy read-only adapter, and the old `code_explorer` profile no longer exists. Generic `bridge-explorer` / `bridge-reviewer` samples now provide a non-overwriting setup path. Earlier successful trials below remain historical evidence. |
| macOS / Linux | Offline tests pass in the Node 24 GitHub Actions matrix. Authenticated model requests and desktop UI round trips on macOS/Linux remain unverified. |
| ZCode desktop round trip | Not revalidated during this change. A native CLI marker does not certify the UI integration. The README includes the manual first-request check. |

Private command logs and session receipts stay under `.bridge/` and are excluded from publication. Existing account settings, provider routing and sessions were not migrated or restarted for these checks.

## Earlier Windows trials

Checked on Windows on 2026-09-22.

| Item | Observation |
| --- | --- |
| Installed app | ZCode 3.14.3.7762 |
| Bundled CLI | 0.16.9 at `resources/glm/zcode.cjs` |
| Node | 24.19.0 |
| Custom profiles | Eight discovered without edits |
| Native dispatch | CLI called the requested `code_explorer` Agent |
| Original GLM trial | Failed with `provider_not_found` for `account:zai-individual-coding-plan` |
| CLI exit behavior | The failed Agent invocation still produced CLI exit code 0 |
| Official isolated CLI login | Succeeded; default `account:zai-individual-coding-plan/GLM-5.3` |
| Successful GLM trial | `code_explorer` used `GLM-5.3-Flash`, returned `BRIDGE_PROBE_OK` |
| Two real models in parallel | Passed: `code_explorer` on Flash and `reviewer` on GLM-5.3; both returned `BRIDGE_PROBE_OK` |
| Native Dynamic Workflow engine | Saved project workflow compiled and completed through the official CLI |
| Desktop UI launch | Not tested |

The bridge audits native events because the parent response can describe a failed delegation while the CLI exits normally. Offline fixtures exercise this case, child-session correlation, actual-model checks, exact task forwarding, malformed or incomplete evidence, deadlines, cancellation, and parallel independence. Offline tests do not prove account access.

Parallel execution evidence: explorer run `32375fe3-3f08-4c32-b801-47c7a2b6ba7c` took 28.1 seconds; reviewer run `e0865818-4863-4d03-a9a2-cac7658d4d59` took 43.3 seconds. Their CLI processes started 197 ms apart. Both results have native child-session and model-request evidence. The bridge also replayed the earlier 475-event failed CLI trial and correctly returned `PROVIDER_UNAVAILABLE` despite the original exit code 0. Raw evidence remains in ignored `.bridge` files.

Native workflow evidence: `dwfrun-a69e5fc8-95d1-4df9-a006-0148ec04f0e5`. `CreateWorkflow` loaded the saved project definition. Native `workflow.run.progress` events show both `world-run` nodes dispatched before either settled, both settled with `outcome: ok`, two reports with the expected agent/model pairs and `BRIDGE_PROBE_OK`, and `run-settled` with `status: completed`. The bridge worker runs were `c3244fe6-090e-4a34-a963-179ec3cef09a` and `804fdbfb-44b0-443b-8a3c-0c352691d1d4`. Both have their own verified child model-request evidence.

The first native compile rejected untyped `JSON.parse` values in `report`. Both examples now declare the returned fields and validate them before reporting. The corrected project workflow passed the native compile and execution. The probe launcher allowed the known native workflow tools and used CLI `yolo` mode for that bounded orchestration test; the actual bridge workers still ran in `plan` mode. This verifies the engine, not the desktop UI approval flow.

## Account connection

The user chose to retain GLM and connect the CLI. The official CLI's standalone account provider requires a standalone account identity and Coding Plan key. A desktop login alone did not supply that provider in the observed trial.

The bridge invokes official `login zai` with independent account and personal-provider-config paths. It creates an empty provider config on first use so the CLI does not import a legacy personal config. The CLI handles browser authorization and writes its own credentials. Existing desktop credentials and agent definitions are not copied or rewritten.

## Source references

Source investigation uses upstream commit `872ad960de7ec172591f7e1952f7849229f94521`. The installed bundle was checked separately for the CLI interface and the account path environment variables.

- [Workflow facade](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/dynamic-workflow/src/facade/dts.ts): command execution and concurrency.
- [Standalone account runtime](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/bootstrap/src/app/standalone-account-provider-runtime.ts): account eligibility and request credentials.
- [CLI login](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/bootstrap/src/auth-login.ts): browser login and model-default persistence.
- [Child runtime events](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts): native child event forwarding.

## Cursor extension

The owner selected Composer 2.5. The official Windows x64 Cursor CLI package `2026.09.18-9a7762b` was downloaded from the official release URL, unpacked locally, and checked with native help, account status and model-list commands. Its existing Cursor account was authenticated. The package archive SHA-256 is `9C1FBCDA9F0A39667689A6A3146B549FFEC465CAF47723E0A7BB345142D5BDE4`.

Single Cursor run `70abab10-ada9-4d21-ae92-e63d7cdcde7d` passed in 17.6 seconds. Native `system/init` reported `Composer 2.5`; the terminal result belonged to the same session and returned `BRIDGE_PROBE_OK` with `is_error: false`. A prior untrusted-workspace attempt failed without starting a model session. The mixed project example explicitly passes `--trust-workspace` for this project.

The first mixed native workflow, `dwfrun-eaae406a-c04d-4125-a53b-78484b144f4a`, dispatched all three command nodes. Cursor and GLM Flash completed, but the GLM reviewer hit the original 60-second deadline. Its owned process tree was terminated and the survivor check was empty. The workflow correctly settled as `errored`; a command node settling normally did not hide its nonzero bridge exit. The example now gives the reviewer 120 seconds and its outer command 150 seconds.

The corrected mixed workflow passed as `dwfrun-1bb9035e-ecba-4674-95a7-cd04276bb1f1`. Native event sequence 4/6/8 dispatched all three nodes before the first completion at sequence 9. Sequences 12/13/14 reported the expected Flash, GLM-5.3 and Cursor Composer 2.5 models with `BRIDGE_PROBE_OK`. Sequence 15 settled the workflow as `completed`. The official CLI host exited 0 after 66.5 seconds. This validates native orchestration through the official CLI; the desktop UI launch remains untested.

The 28-test offline suite passes, including the original GLM/process tests and seven Cursor tests covering catalog parsing, model/session evidence, stream failures, write-tool detection and explicit-model requirements. Cursor's model evidence is its native init event, not per-request backend telemetry. See `cursor.md` for setup and limitations.

## Saved settings and auto route

On 2026-09-22, the expanded offline suite passed all 41 tests. New tests cover the actual scheduling queue with 20 synthetic jobs and a peak of 14, task and allowlist validation, CLI argument rejection, ordered fallback, cancellation, deadlines, unconfirmed cleanup, immutable per-run overrides and bounded native command output.

Native run `dwfrun-8daea4ed-1b76-4d7e-abc8-617899b3d39b` loaded `model-bridge` with only a task and `parallelLimit: 2`. It compiled, created the `bridge-router` actor, planned three jobs, ran all three selected models and settled as `completed`. Batch `d87ba01c-fb54-462a-87d4-87e7e85f77ed` verified GLM-5.3-Flash, GLM-5.3 and Cursor Composer 2.5, each returning `BRIDGE_PROBE_OK`. Attempt timestamps show two jobs started first; the third started only after one finished. Peak parallel jobs was 2; fallback remained false.

The native planning actor encountered a rate limit and ZCode applied its own backoff, reducing its native concurrency cap from 14 to 10. It then completed. This is ZCode's internal behavior; the bridge did not switch models. A bridge parallel limit is a ceiling on jobs, not a guarantee of provider capacity or a replacement for native throttling.

Native run `dwfrun-e7a1e467-f8b6-4cd9-ad54-a6b6277fa841` supplied a main-model job assignment directly. It completed with no planning actor created. Batch `19352c8e-6ae6-4958-979f-c8c22e659880` inherited the saved parallel limit of 14, ran its one assigned Cursor job, verified `cursor/composer-2.5`, returned `BRIDGE_PROBE_OK`, and left fallback off.

These are one successful native trial per path, not reliability or load-test claims. Fourteen simultaneous live model sessions, automatic live fallback, desktop UI launch and writable workers have not been validated. The fallback tests inject failures without switching live providers. Redacted assertions are in `docs/verification/workflow-presets.json`; raw native events and per-worker evidence remain ignored under `.bridge`.
