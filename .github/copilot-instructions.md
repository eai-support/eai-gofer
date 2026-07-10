# Copilot Instructions

## Project Overview

**gofer** is a Unknown project.

## Gofer Pipeline

This project uses Gofer for spec-driven development. In GitHub Copilot Chat, run
`#0_gofer_start` to start the core pipeline: Gofer Start -> research -> specify
-> plan -> tasks -> implement -> validate.

Key prompts: `#1_gofer_research`, `#2_gofer_specify`, `#3_gofer_plan`,
`#4_gofer_tasks`, `#5_gofer_implement`, `#6_gofer_validate`. `#6_gofer_validate`
is the terminal quality gate and includes the final engineering review loop. Use
`#7_gofer_save` for checkpoints and `#8_gofer_branding` for branded
document/deck templates. Optional helpers like `#0a_problem_validation`,
`/gofer:check-workspace`, and `/gofer:bootstrap-workspace` support the workflow
without adding extra core stages. Artifacts in `.specify/specs/{feature}/`.

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
