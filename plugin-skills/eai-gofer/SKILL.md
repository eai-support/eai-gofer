---
name: eai-gofer
description: "Run the public Gofer core pipeline and helper commands in Claude, Gemini, Codex, or Copilot."
---

# Gofer

Version: 3.7.19

Use this skill when the user asks to run, install, update, or understand Gofer without the VS Code extension UI.

## Workspace First

Before stage work, resolve the repository root and run `node .specify/scripts/node/gofer-workspace-check.mjs --host auto --json` when available. If the repo is missing or stale, ask before running `node .specify/scripts/node/gofer-workspace-bootstrap.mjs --host auto --include-mirrors`, then resume the original command.

## First EAI Platform App

If the user is starting a first EAI Platform app, run `/gofer:eai-first-run` before `/0_gofer_start`. It is allowed to run before `.specify/` exists and checks Git, Node.js, npm, the scoped EAI registry, EAI CLI, login, tenant, `eai init`, and Gofer scaffold readiness with user approval gates.

## EAI CLI Discovery And Recovery

- Run `eai whoami` before Gofer pipeline work and require a valid login plus an active tenant.
- Run `eai update --check` before first EAI platform work when the CLI may be stale.
- Run `eai --describe` before assuming command syntax.
- If advertised, run `eai agent guide --format json` before planning or fixing EAI workflows.
- After any `eai` error, run `eai errors explain <code-or-reason> --format json` before guessing remediation.
- If `eai errors explain` is unavailable, match `.specify/references/platform/eai-error-catalog.yaml`, run read-only diagnostics before mutating fixes, and stop at the retry or escalation condition.
- For `eai user invite` 5xx or `EXTERNAL_SERVICE_ERROR`, check existing members with `eai user list --tenant <tenant-id> --search <email> --format json`; use `eai user role set --tenant <tenant-id> --member-id <member-id> --role tenant-admin --format json` only after verification and user approval, then tell the app user to sign out and sign back in.
- For `MISSING_TENANT`, `app_token_tenant_context_required`, or "Tenant context required for app tokens" on platform user lookup or membership prerequisites, run `eai errors explain app_token_tenant_context_required --format json`, confirm tenant context, and retry `/v4/platform/tenants/<tenant-id>/...` routes before changing tenant members, Entra, role definitions, databases, or cloud portals.
- Use `eai publicapi` only for authorized PublicAPI `/v4/...` routes.

## Token And Cost Policy

- Treat `.specify/memory/gofer-model-policy.yaml` as the repo-owned source of truth for simple, medium, hard, and arbiter model routing. Run `/gofer:bootstrap-workspace` if it is missing.
- Use the cheapest capable model first. Escalate only when a cheaper pass is low-confidence, contradictory, security-sensitive, release-critical, or blocking quality.
- Keep raw search, build, and test output out of the main chat context. Write stable findings to `.specify/specs/{feature}/context-bundle.md` and continue from summaries.
- Prefer provider prompt/context caching for stable non-secret prefixes: Gofer scaffold, repository instructions, constitution, repo map, stage contracts, and validation rubric.
- After large research, planning, implementation, or validation bursts, checkpoint artifacts and compact/clear/resume context when the host supports it.

## Core Pipeline And Helpers

- `0_gofer_start` - Start Gofer, confirm EAI readiness, and route the delivery pipeline.
- `0a_problem_validation` - Validate the business problem using 5 Whys root-cause analysis and stakeholder mapping.
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
- `10_gofer_cloud` - Deploy and configure the Gofer cloud integration for remote pipeline execution.
- `gofer:bootstrap-workspace` - Create or update the repo-owned Gofer scaffold for the current workspace.
- `gofer:check-workspace` - Check whether this repo is initialized for Gofer and explain any missing or stale scaffold.
- `gofer_constitution` - Create or update project constitution with coding principles and guidelines.
- `gofer:diagnose` - Run a reproduce-minimize-instrument-fix loop for bugs and failing tests.
- `gofer:eai-first-run` - Prepare a new machine or repo for the first EAI Gofer app build.
- `gofer_hydrate` - Reverse-engineer specification from existing code (Hydration).
- `gofer:personality` - Set the assistant personality for this Gofer session: friendly, pragmatic, or none (default).
- `gofer:plan` - Toggle plan mode in the active CLI session for the next user prompt; non-pipeline control command.
- `gofer:side` - Open a side conversation in the active CLI without disturbing the main pipeline state; resumable.
- `gofer:spec-summary` - Generate a business-friendly summary of feature value and scope.
- `gofer:tdd` - Guide a red-green-refactor loop tied to spec acceptance criteria.
- `gofer:vocabulary` - Extract domain terminology into a canonical feature glossary.
- `gofer:zoom-out` - Show how the current feature connects to broader system boundaries.

## Stable Local Install Path

Install or update this plugin by replacing the stable local folder:

```text
~/plugins/eai-gofer
```

The public release feed is available at:

```text
https://eai-tools.github.io/eai-gofer/releases.json
```

Gemini CLI users can also copy the bundled `.gemini/` directory into a repository root to activate the same command set there.
