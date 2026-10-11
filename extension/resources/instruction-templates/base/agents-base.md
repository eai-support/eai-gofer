# AGENTS.md

**Project**: {{projectName}} | **Language**: {{language}}{{frameworkLine}} |
**Package Manager**: {{packageManager}}

## Commands

{{commands}}

## Code Style

{{codeStyle}}

## Testing

{{testing}}

## Issue and pull request titles

Say what changes, who or what benefits, and the outcome or risk it addresses.

Keep titles concise and in business language. Use a prefix such as `CURATE:` only when it helps identify a programme. The prefix should not replace the outcome.

An issue describes the outcome needed:

`Prevent [risk] for [user or system] by [needed capability]`

Example from Issues2025 #3375: Prevent broken EAI app data links caused by inconsistent Object Type slugs.

A pull request describes the change delivered and the outcome it enables:

`Enable [outcome] for [user or system] by [change made]`

## Git Workflow

{{gitWorkflow}}

## Gofer Pipeline

This project uses Gofer for spec-driven development. Run `/eai` on Claude,
Copilot, Antigravity, Grok, or VS Code to start or continue the core pipeline
(Gofer Start -> research -> specify -> plan -> tasks -> implement -> validate).
Use `$eai` on Codex. Gofer routes internally through
`.specify/commands/*.md` contracts; validation is the
terminal quality gate and includes the final engineering review loop. Before EAI
readiness, classify the request: app delivery continues directly, while clear
non-app work asks once before skipping EAI tenant/app setup. Artifacts in
`.specify/specs/{feature}/`.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal
  code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer
  standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid
  introducing bugs.
