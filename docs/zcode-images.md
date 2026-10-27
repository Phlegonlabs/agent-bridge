# ZCode chat images

For ordinary new-image requests, load `codex-imagegen` and use the existing Codex login.
The selected text model does not change the image route.
An explicit image-provider or model choice takes priority.
Reference-image edits remain unsupported by this entry. Report that limit and stop without generating.
Failed or unsupported requests never switch to a paid backend automatically.

The existing `~/.zcode/skills/codex-imagegen/SKILL.md` must contain the real bridge path.
Keep that path when updating its trigger description. Do not rerun provider setup for this routing change.
Add this ZCode-specific section to `~/.zcode/AGENTS.md`, preserving its other instructions:

```markdown
## Image generation in ZCode chats

- For a new image, picture, illustration, poster, or cover, use `codex-imagegen` by default, even when the user does not name Codex.
- Read `~/.zcode/skills/codex-imagegen/SKILL.md` and follow its existing bridge command. The selected text model does not change this route.
- Honor an explicitly selected image provider or model. Do not override that choice with Codex.
- The Codex entry supports new images only. When references are required, report the limit and stop without generating; do not silently switch providers.
- Report generation failures without automatic fallback or regeneration. Display only the verified `image.path` from an `ok: true` result.
```

Open a new ZCode chat after changing these instructions so its context can load them.
For example: `幫我生成一張深藍色科技感封面。`
An existing chat may still retain its earlier skill description and instructions.
