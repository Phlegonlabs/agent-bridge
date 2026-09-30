# Role, stage and dependency routing

Select the project's saved workflow `role-auto-route` and set **Sub Agent Model** to **Cursor Bridge / workflow-auto**, reasoning **default**. Supply `task` with your goal and authorized scope. Leave `jobs` empty to let its planning actor build the task graph. This workflow currently runs from the bridge repository because its profile-loading command is relative to this project.

The planner reads the existing personal profiles from `%USERPROFILE%\.zcode\agents`. It uses their descriptions and instructions to choose roles, stages and dependencies. This is reading saved instructions, not training a model. It does not edit those profiles. The router separately reads the current profile catalog when choosing or reselecting a model.

The current roles include `code_explorer`, `code_architect`, `frontend_worker`, `backend_worker`, `implementer`, `test_runner`, `reviewer` and `market_researcher`. Only needed roles are scheduled. A typical graph is exploration → architecture → independent implementation tasks → tests → review. The planner is instructed to assign file ownership before parallel implementation.

Each actor receives its role instructions and completed upstream results. The router receives its role, actual stage, dependency status, task context, profile model preferences and current model capacity. It freely chooses among the existing allowlisted models; a profile's model is a preference, not a forced selection. A healthy choice persists through that actor task's tool loop. With the owner-approved `capacityRouting: true`, a full or cooling provider triggers reselection at the next request. The new model receives the full incoming conversation and tool results; already executed host tools are not replayed by the bridge. A different actor, task or declared stage gets a separate routing decision.

New tasks also prefer capacity pools with available local slots. Every exposed route uses the Cursor pool. If all eligible pools are busy, the task queues; if all are cooling down, it returns a rate-limit error. The bridge cannot measure slots consumed by other desktop sessions or accounts. Capacity can change during routing, so the worker still uses the bounded queue before execution. Real rate-limit responses still trigger cooldown and temporary backoff in the affected pool.

The workflow runs ready tasks in batches of at most 14 and waits for a batch before starting the next. The provider also enforces its shared CLI ceiling of 14, with Cursor capped at 12. Graph cycles and invalid dependencies fail before workers start. A failed batch prevents downstream tasks from starting. Successful completion means the actor returned; it does not independently certify its claims or test results.

This workflow copies role instructions into native workflow actors; it does not load the complete native Agent profile. Profile tool restrictions, skills configuration, reasoning levels and `bypassPermissions` are not imported as runtime settings. ZCode's current host permissions and available tools still apply. Existing approval requirements remain in effect.

For a preplanned graph, supply `jobs` as an array:

```json
[
  {"id":"explore","role":"code_explorer","stage":"exploration","task":"Inspect the relevant files without edits.","dependsOn":[]},
  {"id":"review","role":"reviewer","stage":"review","task":"Review the exploration evidence without edits.","dependsOn":["explore"]}
]
```

There may be 1–24 tasks and at most eight dependencies per task. Upstream routing summaries are capped at 1,000 characters; actor evidence excerpts at 8,000 characters each. Truncation is marked, and workers are instructed to check referenced files. ZCode requires static graph phase labels, so the visual graph uses planning/execution labels; each job's actual stage appears in routing evidence and reports.

## Existing Default workflows

Selecting `workflow-auto` on an existing Default workflow enables routing from the actor conversation and saved role catalog. It cannot reveal dependency information that the workflow does not send. Missing role, stage or dependency fields are recorded as missing; inferred classifications are marked separately. Use `role-auto-route` for explicit graph scheduling, or add a standalone line to each native actor's ask:

```text
<workflow-routing>{"workflowId":"unique-run-id","actorId":"review","taskId":"review","role":"reviewer","stage":"review","dependencies":[{"id":"tests","status":"completed","summary":"Actual test results"}]}</workflow-routing>
```

Direct API clients may supply the same object as `routing_context`. Any declared dependency that is pending, running, failed, cancelled or unknown blocks auto dispatch. Tool results cannot supply this metadata. Metadata is caller-provided context, not proof that an external task really succeeded.

Routing evidence stays private under `.bridge/provider/requests/<id>/routing.json`, including chosen route, role, stage, declared/inferred basis, dependency statuses and the profile catalog hash. A capacity switch records `previousRoute`, `switchReason` (`provider-full` or `provider-cooldown`) and the observed pool snapshot. `result.json` records the actual runtime model after verified execution. Do not publish these files; requests and logs may contain private project context.

Generic same-request fallback remains disabled; capacity-triggered reselection on a later request is enabled. A route is pinned before execution, so an ordinary failure no longer randomly changes the model on retry. `WRONG_DISPATCH`, protocol failures and timeouts are not treated as evidence of exhausted capacity. GLM's model-protocol relay still has an unresolved exact-dispatch failure (`WRONG_DISPATCH`); this extension does not fix that adapter. Earlier GLM saved-workflow successes are a different execution path. Current native role-routing validation uses Cursor. See `docs/epics/native-provider.md` for the verification record.
