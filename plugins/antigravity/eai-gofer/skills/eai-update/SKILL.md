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

Supported host targets are `claude`, `codex`, `copilot`, `antigravity` (CLI), `antigravity-desktop`, and `vscode`. Check the helper result for native validation limits.

Grok Build supports native plugins and repo skills, but Gofer automatic install/update is unverified. Diagnostic targets `grok` (CLI), `grok-bot` (official desktop), and `grok-desktop` (product not yet identified) remain blocked for install/update before writes. Do not treat CLI access as desktop support. Keep the existing Grok repository skill and full scaffold. Check the actual client and skill source before claiming `/eai` works; cross-loading Claude files does not change the active host.

Gemini CLI is retired as a Gofer surface. Use the Antigravity target for the actual client. Do not run Gemini extension commands, invent `agy plugin update`, or import all legacy settings. `agy update` updates the CLI, not Gofer. Retain `GEMINI.md` and preserve unrelated settings. Verify installed CLI help before plugin changes. Read `.specify/references/portable-orchestration.md` for model and account boundaries.

This command archives known stale Gofer entries and replaces only Gofer's managed instruction section. It does not remove unrelated user files or host-managed plugin caches. It does not create `.specify/`. After the host update, use `/eai add or refresh the Gofer scaffold for this repo` when a repository needs Gofer files.
