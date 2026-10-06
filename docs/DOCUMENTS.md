# Documents

- `README.md`: complete setup, model catalog, provider and CLI usage, workflows, image generation, recovery and limitations.
- `README.zh-TW.md`: the same public setup guide in Traditional Chinese.
- [Local deployment](DEPLOYMENT.md): source identity, running provider, verification and safe restart.
- `examples/agents/`: generic read-only GLM profiles; the example installer refuses overwrites.
- `docs/epics/bridge.md`: historical scope, checkpoints and verification obligations.
- `docs/compatibility.md`: installed-version evidence and live test status.
- `docs/cursor.md`: Cursor CLI setup, model selection, evidence and mixed workflow.
- `docs/workflow-presets.md`: saved settings, auto routing, 14-slot queue, fallback and usage.
- `docs/epics/workflow-presets.md`: owner decisions and verification for reusable execution settings.
- `docs/verification/workflow-presets.json`: redacted assertions from native runs and offline tests.
- `docs/native-provider.md`: native dropdown provider, connection settings and current verification limits.
- [Claude long-task reliability](epics/EPIC-claude-long-task-reliability.md): interrupted-request repair, reconnect lifetime and verification.
- [Delegate observability](epics/EPIC-delegate-observability.md): per-task lifecycle, native activity, inline Claude status and workflow/subagent checks.
- [Sol connection and streaming](epics/EPIC-sol-streaming.md): upstream rejection diagnosis, native answer streaming and verification.
- `skills/codex-imagegen/SKILL.md`: ZCode instructions for native Codex image generation; set the bridge path for your checkout before installing.
- `docs/epics/native-provider.md`: implementation scope and native protocol evidence.


## Harness context maintenance

- [Harness 0.61.0 context sync](epics/EPIC-harness-0.61-context-sync.md) — local governance and binding maintenance; no product or release approval.
