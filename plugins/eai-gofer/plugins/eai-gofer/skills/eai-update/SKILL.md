---
name: eai-update
description: "Install or update EAI Gofer for this AI coding app."
---

# Eai Update

Version: 3.12.4

Use this skill to install or update the user-level EAI Gofer plugin or extension. It works before a repository has Gofer files.

1. Do not run a workspace check, `eai init`, `eai whoami`, or a delivery stage.
2. Use `.specify/scripts/node/gofer-surface-update.mjs` from this plugin bundle.
3. Check status first with `--action inspect --host <current-host> --json`.
4. Show the user the planned user-level install or update. Ask for approval before `--execute`.
5. Run `--action install` when Gofer is missing. Run `--action update` when it is installed.
6. After an actual install or update, the helper archives stale Gofer command and skill entries. It also adds a small managed always-on instruction to the selected host. It keeps the current `eai` and `eai-update` entries. A clean official Codex local marketplace on `main` fast-forwards safely. A dirty, non-main, or unrecognised local marketplace remains unchanged and reports that its plugin update is incomplete while it still refreshes the always-on instruction. An unknown Codex marketplace source stops the update without changes.
7. Update only the current host unless the user explicitly asks for `--host all`.
8. Complete the host reload step from the helper result before saying the update is ready.

Supported hosts are `claude`, `codex`, `copilot`, `gemini`, and `vscode`.

This command archives known stale Gofer entries and replaces only Gofer's managed instruction section. It does not remove unrelated user files or host-managed plugin caches. It does not create `.specify/`. After the host update, use `/eai add or refresh the Gofer scaffold for this repo` when a repository needs Gofer files.
