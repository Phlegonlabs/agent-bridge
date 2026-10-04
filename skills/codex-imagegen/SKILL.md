---
name: codex-imagegen
description: Generate images using this machine's existing Codex login and built-in image generation. Use when the user asks for Codex images, included Codex image generation, or shared Codex image capability from ZCode.
user-invocable: true
---

# Codex image generation

Use this skill when the user wants to generate images through Codex from ZCode.
This uses Codex's built-in `image_gen.imagegen` tool and included Codex usage.

1. Write the user's image description to a new UTF-8 text file in the current workspace. Preserve requested subjects, style, layout, and text. Use a unique filename; keep existing files.
2. Run this command through ZCode's Bash tool. Replace `BRIDGE_DIRECTORY` with the installed agent-bridge checkout, and replace the workspace and prompt file paths. Use the local Node.js executable. Allow up to six minutes for the command, and wait for it to finish. Do not rerun while it is still active.

```bash
node "BRIDGE_DIRECTORY/bin/codex-image.mjs" --cwd "WORKSPACE" --prompt-file "PROMPT_FILE"
```

3. Parse the JSON result. Only `ok: true` confirms completion. The verified PNG is at `image.path` under the workspace's `generated-images` directory. Display it using `![Generated image](ABSOLUTE_IMAGE_PATH)` and give its saved path. Keep the image when adding it to the project.
4. On failure, report the returned code. Do not substitute ZCode's backend image generator, another model/provider, or a paid Image API. Do not read or copy Codex credentials.

If ZCode refuses Write or Bash permission, stop and report the refusal. In the desktop app the user can approve these actions. A headless CLI without a permission client cannot perform them; do not change modes or disable its sandbox to bypass that refusal.

Each call creates one image. For several images, use one prompt file and one completed call per image. This entry currently handles new images; do not claim reference-image editing is supported.
