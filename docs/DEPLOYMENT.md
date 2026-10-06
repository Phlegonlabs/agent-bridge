# Local deployment

Platform: Windows. Mode: manual. The repository serves a local provider, with no hosted deployment pipeline.
Production source follows `main`. GitHub Actions tests source on Windows, macOS and Linux; it does not deploy.
No development branch exists. Offline candidate tests use isolated synthetic state and temporary test servers.

## Observed deployment — 2026-10-06

- Source SHA: `7d7710a42a12a8e0249a851db7d39445f989dd05`.
- Target: `http://127.0.0.1:32147/v1`, bound to loopback only.
- Runtime PID: `8820`; start: `2026-10-06T08:43:45.9946970Z`.
- Source checkout: `C:\Users\mps19\Documents\GitHub\agent-bridge`.
- Artifact: Node.js runs the checkout directly; there is no separate compiled bundle.
- Lifetime: persistent, until owner shutdown. Stop with `node scripts/stop-provider.mjs` from the checkout.
- Startup: `pwsh -NoProfile -NonInteractive -File scripts/start-provider.ps1`.
- Identity receipt: `.bridge/release-deploy-48eae08d-684d-41e6-af0b-46be791dea60/deployment.json`.

The old provider and its captured console child exited before startup. Port 32147 closed before replacement.
Health is ready. Configuration identity and all 17 model routes are unchanged.
Unauthenticated model lookup returned 401; authenticated model and task lookups returned 200.
A benign Sol/low request completed with verified `codex/gpt-6.1-sol`, SSE termination and the expected response marker.
It returned one 177-byte content delta and three status frames in 13,176 ms. Service counts returned to zero.
The first checker expected an unqualified model name and exited 1. Validation of the retained receipt corrected that fixture error.
Validated evidence: `.bridge/release-validated-smoke-5db161ba-d02a-4c31-a9e0-525dd0ad5437.json`.

Candidate CI: [37437571697](https://github.com/Phlegonlabs/agent-bridge/actions/runs/37437571697).
Main CI: [37437955854](https://github.com/Phlegonlabs/agent-bridge/actions/runs/37437955854).
Both passed on all three platforms at the deployed SHA. Independent source review accepted that same candidate.

## Required secrets and variables

The deployment adds no environment keys. Existing local credentials remain private and unchanged.
The provider reads its local bearer token from `.bridge/provider/token`; authenticated checks verified it without printing its value.
The selected CLIs retain their own account sign-ins. This deployment verified Codex access, not every configured model's entitlement.

## External console setup

None. Deployment changed no account, provider registration, scheduled task, domain or hosted resource.

## State and recovery

Existing `.bridge/` sessions, account state and private logs are preserved. Synthetic fixtures have separate directories and tokens.
Before another restart, inspect authenticated status, listener identity and child processes. Wait for idle work before shutdown.
Rollback requires a deliberate source selection and another idle restart. No rollback was executed or certified here.
Desktop rendering, long Claude execution and multiple live content chunks remain unverified.
Later receipt-only commits do not change the deployed executable source; verify source parity before reusing this observation.
