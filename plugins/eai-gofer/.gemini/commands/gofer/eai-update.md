## Legacy Gemini File-Format Compatibility

This file remains only so existing Gemini CLI repositories can read the generated Gofer command format. Gemini is not a current Gofer host. Google Antigravity and its `agy` CLI are the current Google surface.

## What To Do

1. Install or update EAI Gofer from Google Antigravity with `agy plugin install https://github.com/eai-support/eai-gofer`.
2. Use `--host antigravity` with `gofer-surface-update.mjs`.
3. Start a new Antigravity session after installation.

Existing automation that passes `--host gemini` is mapped to `antigravity` as a hidden compatibility alias. New commands and documentation must use `antigravity`. The updater reports exactly these current hosts: claude, codex, copilot, antigravity, grok, vscode.
