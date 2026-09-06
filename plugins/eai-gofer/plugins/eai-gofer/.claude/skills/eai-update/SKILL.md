---
name: eai-update
description: "Install or update EAI Gofer for this AI coding app."
---

# Eai Update

Version: 3.12.4
Host: Claude Code

## Update EAI Gofer

Use this command to install or update EAI Gofer for the current AI coding app. This command works without an EAI project, a Gofer scaffold, or EAI sign-in.

## Update Contract



1. Do not run workspace checks, `eai init`, `eai whoami`, or pipeline stages.
2. Verify the actual product and client before using the host-specific command below. Antigravity is not Gemini CLI. For Antigravity CLI, desktop, IDE, or Gemini desktop, use the explicit diagnostic targets listed below instead. Check the current host first:
   `node <plugin-root>/.specify/scripts/node/gofer-surface-update.mjs --action inspect --host claude --json`
3. If the plugin root is not known, identify the installed plugin bundle before you run the helper.
4. State whether EAI Gofer is installed and whether the host command is available.
5. Explain the planned user-level change and ask for approval before any install or update command.
6. After approval, run one of these commands from the bundled helper:
   - Install: `node <plugin-root>/.specify/scripts/node/gofer-surface-update.mjs --action install --host claude --execute --json`
   - Update: `node <plugin-root>/.specify/scripts/node/gofer-surface-update.mjs --action update --host claude --execute --json`
7. After an actual install or update, the helper archives stale Gofer command and skill entries. It also adds a small managed always-on instruction to the selected host. It keeps the current `eai` and `eai-update` entries. For Codex, a clean official local marketplace on `main` fast-forwards safely. A dirty, non-main, or unrecognised local marketplace remains unchanged and reports that its plugin update is incomplete while it still refreshes the always-on instruction. If the Codex marketplace source is unknown, it stops without changes.
8. Run only the selected host by default. Use `--host all` only when the user explicitly asks to install or update every detected host.
9. Show the required reload step from the helper output. Do not claim the command is ready until the host reloads.

## Supported Hosts

- Claude Code: refresh the marketplace and plugin, then run `/reload-plugins`.
- Codex: refresh a confirmed Git marketplace and apply the plugin, then start a new task or restart Codex. A clean official local `main` checkout fast-forwards and applies the plugin. Other local checkouts keep their work unchanged, refresh the always-on instruction, and report what needs attention. An unknown source stops the update to protect local work.
- GitHub Copilot: refresh the marketplace and plugin, then restart the CLI session or start a new app chat.
- Gemini CLI is retired. Migrate to Antigravity CLI or desktop; do not install or update the old Gemini extension.
- VS Code: install or update `EnterpriseAI.gofer`, then run **Developer: Reload Window**.

## Other Google Apps

Use `antigravity` for CLI and `antigravity-desktop` for desktop. Both use the shared workspace `.agents/skills/eai/` and `.agents/skills/eai-update/`; keep `GEMINI.md`. Follow the helper's explicit plan and stop if it reports blocked. Do not infer native loading from generated files, run Gemini extension commands, invent `agy plugin update`, or change global instructions. `agy update` updates the CLI, not Gofer. IDE extensions and Gemini desktop are separate targets. Read `.specify/references/portable-orchestration.md` for product and account boundaries.

## Limits

- This command updates user-level plugins and extensions. It archives known stale Gofer entries and replaces only Gofer's managed instruction section. It does not remove unrelated user files or host-managed plugin caches. It does not add the repo-owned `.specify/` scaffold.
- For a repository scaffold, use `/eai add or refresh the Gofer scaffold for this repo` after the host update.
- Grok Build supports native plugins, but Gofer's automatic install/update integration is not verified. Keep its existing repository skill path. Grok Bot desktop is a separate, unverified integration; do not infer support from the CLI.
- Keep the full Gofer delivery pipeline unchanged. This command only manages its host installation.
