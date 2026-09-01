---
name: eai-update
description: "Install or update EAI Gofer for this AI coding app."
---

# Eai Update

Version: 3.12.0
Host: Claude Code

## Update EAI Gofer

Use this command to install or update EAI Gofer for the current AI coding app. This command works without an EAI project, a Gofer scaffold, or EAI sign-in.

## Update Contract

1. Do not run workspace checks, `eai init`, `eai whoami`, or pipeline stages.
2. Check the current host first:
   `node <plugin-root>/.specify/scripts/node/gofer-surface-update.mjs --action inspect --host claude --json`
3. If the plugin root is not known, identify the installed plugin bundle before you run the helper.
4. State whether EAI Gofer is installed and whether the host command is available.
5. Explain the planned user-level change and ask for approval before any install or update command.
6. After approval, run one of these commands from the bundled helper:
   - Install: `node <plugin-root>/.specify/scripts/node/gofer-surface-update.mjs --action install --host claude --execute --json`
   - Update: `node <plugin-root>/.specify/scripts/node/gofer-surface-update.mjs --action update --host claude --execute --json`
7. After an actual install or update, the helper archives stale Gofer command and skill entries. It keeps the current `eai` and `eai-update` entries. For a Codex local marketplace, it reports the local source and makes no changes to that checkout or its settings. If the Codex marketplace source is unknown, it stops without changes.
8. Run only the selected host by default. Use `--host all` only when the user explicitly asks to install or update every detected host.
9. Show the required reload step from the helper output. Do not claim the command is ready until the host reloads.

## Supported Hosts

- Claude Code: refresh the marketplace and plugin, then run `/reload-plugins`.
- Codex: refresh a confirmed Git marketplace and apply the plugin, then start a new task or restart Codex. A local marketplace is inspected only, so local work remains unchanged. An unknown source stops the update to protect local work.
- GitHub Copilot: refresh the marketplace and plugin, then restart the CLI session or start a new app chat.
- Gemini CLI: update the extension, then start a new Gemini CLI session.
- VS Code: install or update `EnterpriseAI.gofer`, then run **Developer: Reload Window**.

## Limits

- This command updates user-level plugins and extensions. It archives known stale Gofer entries, but does not remove unrelated user files or host-managed plugin caches. It does not add the repo-owned `.specify/` scaffold.
- For a repository scaffold, use `/eai add or refresh the Gofer scaffold for this repo` after the host update.
- Grok Build has no supported user-level plugin installer. Use its repository skill path after Gofer is added to that repository.
- Keep the full Gofer delivery pipeline unchanged. This command only manages its host installation.
