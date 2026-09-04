# Copilot Instructions

## Always-On EAI Contract

Apply Gofer to every request. Preserve the user prompt and do not add a visible
command prefix. Route internally and select the next stage. Check workspace
health only before meaningful repo work. Use the update path only for explicit
Gofer maintenance requests.

## Project Overview

**gofer** is a Unknown project.

## Gofer Pipeline

This project uses Gofer for spec-driven development. `#eai` is optional. Use the
same core pipeline for every request: Gofer Start -> research -> specify -> plan
-> tasks -> implement -> validate.

Gofer routes internally through `.specify/commands/*.md` contracts, so numbered
stage prompts stay hidden unless explicitly needed for internals. Before EAI
readiness, classify the request: app delivery continues directly, while clear
non-app work asks once before skipping EAI tenant/app setup. Validation is the
terminal quality gate and includes the final engineering review loop. Artifacts
live in `.specify/specs/{feature}/`.

## Token And Cost Policy

- Treat `.specify/memory/gofer-model-policy.yaml` as the repo-owned model
  policy. Use Copilot `Auto` for simple/default work unless the user explicitly
  chooses a specific model.
- Use the cheapest capable model first. Prefer compact Copilot prompts and
  built-in workspace context; only choose paid/high-tier chat models when the
  task is ambiguous, security-sensitive, release-critical, or a cheaper pass
  fails.
- Keep raw command and search output out of chat context. Save durable summaries
  to `.specify/specs/{feature}/context-bundle.md` and continue from artifacts.
- Reuse stable non-secret prefixes for provider caching where supported: Gofer
  scaffold, AGENTS/Copilot instructions, constitution, repo map, stage
  contracts, and validation rubric.
- After large research, planning, implementation, or validation bursts,
  checkpoint artifacts and compact/clear/resume context when the host supports
  it.

## Code Quality

### Code Conventions

- Follow existing code style and naming conventions in this project
- Write clear, self-documenting code with descriptive names
- Keep functions focused and small
- Add comments only where the logic is not self-evident
- Handle errors at appropriate boundaries

## Task Management

1. **Plan First**: Write plan with checkable items before starting
2. **Track Progress**: Mark items complete as you go
3. **Verify**: Run tests and demonstrate correctness before marking done
4. **Capture Lessons**: Update lessons file after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal
  code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer
  standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid
  introducing bugs.
