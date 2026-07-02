# EAI Gofer VS Code Extension

EAI Gofer brings the business specification-driven workflow into VS Code. It
keeps repository work visible from Gofer Start through validation, mirrors the
repo-owned `.specify/` scaffold, and packages the resources needed by the EAI
Gofer pipeline.

## What It Does

- helps everyone, not just coders, write good code, that delivers a business
  outcome
- Work with AI to generate what you need whether it is business case, executive
  summary, technical diagram of otherwise for you and your stakeholders to know
  what will be built, not find out it is wrong later
- initializes the repo-owned EAI Gofer scaffold
- surfaces specs, memory, and progress inside VS Code
- helps launch and monitor supported AI CLI workflows
- keeps the VS Code surface aligned with the portable
  Claude/Codex/Copilot/Gemini bundle

## Quick Start

1. Open the Command Palette and run **Gofer: Initialize Repository**.
2. Optional: run **Gofer: Install Optional Developer Tools**.
3. Start with `/0_gofer_start` in slash-command CLIs or `#0_gofer_start` in
   Copilot Chat.
4. Progress through the core pipeline:
   `Gofer Start -> research -> specify -> plan -> tasks -> implement -> validate`.

## Common Commands

- `Gofer: Initialize Repository`
- `Gofer: Install Optional Developer Tools`
- `Gofer: Upgrade to Gofer Format`
- `Gofer: Show Progress Panel`
- `Gofer: Check for Updates`
- `Gofer: Update Now`

The authoritative command and settings contract lives in
[`extension/package.json`](./package.json).

## Configuration

```json
{
  "gofer.markdownViewer": "preview",
  "gofer.preferredAI": "ask",
  "gofer.claudeCodeCommand": "claude",
  "gofer.defaultCLI": "auto"
}
```

For the broader project documentation, see:

- [README.md](../README.md)
- [Technical Docs Overview](../.tech-docs/overview.md)
- [Configuration Reference](../.tech-docs/configuration.md)
