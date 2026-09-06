---
name: eai-update
description: "Install or update EAI Gofer for this AI coding app."
---

# Eai Update

Version: 3.12.4
Host: Grok Build

## Update EAI Gofer

Grok Build now supports native plugins and marketplaces. Gofer has not verified its own native install/update integration here. This command must not claim an update succeeded.

## What To Do

1. Confirm this is Grok Build CLI, not Grok Bot desktop or a third-party wrapper.
2. Resolve the Gofer repository or installed bundle root. Use `node <resolved-gofer-root>/.specify/scripts/node/gofer-surface-update.mjs --action inspect --host grok --json` for status. Replace the placeholder with that verified root; the helper is not a command on PATH. Install/update actions remain blocked before writes.
3. Keep the existing repository `.grok/skills/eai/SKILL.md` and full Gofer scaffold. Read current `grok inspect --help` before using `grok inspect --json` to verify discovery. Treat its output as private; do not paste raw config or MCP details into chat.
4. Check the `/eai` picker and a harmless task in the actual client before claiming the skill works. Existing generated files are not native evidence.

Grok reads some Claude and AGENTS files too. Verify the selected skill source instead of deleting other hosts' files. Keep all internal stages. Skill model/effort metadata does not select a model; allowed-tools does not enforce read-only review. Use host-enforced permissions.

Grok Bot desktop is a separate target (`grok-bot`). Its Plugins settings and skills do not prove that this CLI bundle loads there. Read `.specify/references/portable-orchestration.md` for limits. Do not invent a plugin update command or change user settings.
