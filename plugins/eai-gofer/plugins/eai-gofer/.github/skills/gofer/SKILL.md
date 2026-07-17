---
name: gofer
description: "Start or continue the Gofer delivery pipeline."
---

# Gofer

Version: 3.7.25
Host: VS Code and GitHub Copilot

# Gofer

Use this as the single user-facing Gofer command. Users should run `/gofer`, `$gofer`, or `#gofer` depending on the host. Do not ask users to run numbered stage commands unless they explicitly request low-level internals.

## User-Facing Contract

- Keep the command window simple: expose `gofer` and `eai` only.
- Treat `.specify/commands/*.md` as internal stage contracts, not user-facing commands.
- Keep all Gofer functions available by routing internally to the right stage contract.
- Explain progress in business language first; provide technical details when the user asks.

## Workspace Preflight

1. Resolve the repository root.
2. Run `node .specify/scripts/node/gofer-workspace-check.mjs --host copilot --json` when available.
3. If the repo is missing or stale, ask exactly: **"This repo is missing or stale for Gofer. Initialize/update it now?"**
4. If the user says yes, run `node .specify/scripts/node/gofer-workspace-bootstrap.mjs --host copilot --include-mirrors`, then resume this command.
5. If the user says no, stop and explain that Gofer needs the repo scaffold before it can safely continue.

## EAI Platform Readiness

1. Run `eai whoami` before EAI app delivery work.
2. Confirm the user is logged in, an active tenant is available, and the repo is ready for the EAI app template.
3. If EAI CLI, login, tenant, or template readiness is missing, run the first-run/setup path from `.specify/commands/gofer_eai_first_run.md` when present.
4. After any `eai` error, run `eai errors explain <code-or-reason> --format json` when available before guessing remediation.
5. Do not write tokens, secrets, private tenant IDs, or local `.env` values into artifacts.

## Route The Pipeline

1. Read existing feature state from `.specify/specs/`, pipeline state files, checkpoints, validation artifacts, and loop evidence.
2. Decide the next internal stage contract needed to move the feature toward completion.
3. If no feature state exists yet, start from `.specify/commands/0_gofer_start.md`.
4. Execute the selected stage by following the matching file in `.specify/commands/`.
5. Continue through research, specify, plan, tasks, implement, and validate unless a real business, security, release, or user-approval decision blocks progress.
6. When app UI is involved, show the user the working UI as early and as often as practical.
7. Keep stakeholder summaries, build maps, diagrams, loop evidence, tests, and validation artifacts current.

## Internal Function Contracts

- `0_gofer_start` - Start Gofer, confirm EAI readiness, and route the delivery pipeline.
- `0a_problem_validation` - Validate the business problem using 5 Whys root-cause analysis and stakeholder mapping.
- `10_gofer_cloud` - Deploy and configure the Gofer cloud integration for remote pipeline execution.
- `1_gofer_research` - Research codebase, CLI integrations, and technology landscape for the target feature.
- `2_gofer_specify` - Generate a feature specification from research findings and any supporting review context.
- `3_gofer_plan` - Create a detailed technical implementation plan with architecture, data model, and contracts.
- `4_gofer_tasks` - Break down the implementation plan into dependency-ordered, parallelisable tasks.
- `5_gofer_implement` - Execute all tasks from tasks.md phase by phase with feedback loops and engineering review.
- `6_gofer_validate` - Validate implemented work with evidence-backed scoring, blast-radius analysis, and engineering review.
- `7_gofer_save` - Save session state and create a handoff checkpoint for resumption in a new context.
- `7a_stakeholder_comms` - Generate stakeholder-facing communications: release notes, demo scripts, and change briefs.
- `8_gofer_branding` - Brand Gofer templates and stakeholder documents for a company or consulting-firm look and feel.
- `9_gofer_tests` - Generate comprehensive test suites from four testing perspectives for a target component.
- `gofer_bootstrap_workspace` - Create or update the repo-owned Gofer scaffold for the current workspace.
- `gofer_check_workspace` - Check whether this repo is initialized for Gofer and explain any missing or stale scaffold.
- `gofer_constitution` - Create or update project constitution with coding principles and guidelines.
- `gofer_diagnose` - Run a reproduce-minimize-instrument-fix loop for bugs and failing tests.
- `gofer_eai_first_run` - Prepare a new machine or repo for the first EAI Gofer app build.
- `gofer_hydrate` - Reverse-engineer specification from existing code (Hydration).
- `gofer_personality` - Set the assistant personality for this Gofer session: friendly, pragmatic, or none (default).
- `gofer_plan` - Toggle plan mode in the active CLI session for the next user prompt; non-pipeline control command.
- `gofer_side` - Open a side conversation in the active CLI without disturbing the main pipeline state; resumable.
- `gofer_spec_summary` - Generate a business-friendly summary of feature value and scope.
- `gofer_tdd` - Guide a red-green-refactor loop tied to spec acceptance criteria.
- `gofer_vocabulary` - Extract domain terminology into a canonical feature glossary.
- `gofer_zoom_out` - Show how the current feature connects to broader system boundaries.
