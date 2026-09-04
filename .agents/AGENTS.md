# Gofer Agent Commands

This file documents the public Gofer command surface and internal pipeline contracts.

Generated: 2026-09-04T07:36:39.055Z

## Public Entrypoints

- `eai` - Start or continue Gofer from one user-facing command.

Do not expose numbered or helper stage commands in user-facing pickers. They remain available as internal contracts under `.specify/commands/`.

## User-Facing Response Gate

Before each user-facing reply, check the draft against these rules:

1. Lead with the business outcome, effect, risk, or decision.
2. Use concise, simple language.
3. Include technical detail only when it supports a decision or the user asks for it.
4. If any check fails, rewrite the reply before sending it.

## Always-On EAI Contract
<!-- gofer:always-on-eai:start -->

Apply this contract to every request after Gofer is installed for this repo or AI coding app. The user does not need to type `/eai`, `$eai`, or `#eai`.

1. Preserve the user's request. Do not rewrite it or add a visible command prefix.
2. Treat an explicit `/eai`, `$eai`, or `#eai` prefix as an idempotent request for the same contract.
3. Apply the Controlled English Contract to every Gofer-authored message and artifact.
4. Keep the reply short unless the user asks for detail.
5. Explain the business effect first.
6. Put technical evidence in durable artifacts.
7. Do not make the user choose pipeline stages. Select the next internal stage yourself.
8. Do not repeat workspace setup on every message. Check it before meaningful repo work, tool use, or a pipeline stage.
9. Keep the update and installation path separate. When the user explicitly asks to update Gofer, run only its maintenance contract.
<!-- gofer:always-on-eai:end -->

## Verified EAI CLI Command Contract

Do not invent, guess, or complete EAI CLI commands from memory.

1. Before you suggest or run an `eai ...` command, verify the exact command from the installed CLI.
2. Start with `eai --describe` and use its command map as the source of truth.
3. For a specific command, run `eai <command> --help` or the CLI-described equivalent before using flags, subcommands, or examples.
4. Use `eai agent guide --format json` when the CLI advertises it.
5. Use `eai errors explain <code-or-reason> --format json` after errors when the CLI advertises it.
6. If the command is not listed or help fails, do not run it. Say the installed EAI CLI does not expose that command, then choose a safe listed command or ask the user to update EAI CLI.
7. Record the verified command and source in `eai-preflight.md`, `service-fit-matrix.md`, or the active feature notes before the command changes files or external systems.
8. For commands that create, deploy, publish, mutate tenants, change Entra, or spend money, confirm with the user after verification and before execution.

## EAI CLI Discovery And Recovery

- Classify work before EAI readiness: app delivery continues directly; clear non-app work asks once before skipping EAI tenant/app setup.
- Run `eai update --check` before first EAI platform work when the CLI may be stale.
- Run `eai --describe` before assuming command syntax.
- If advertised, run `eai agent guide --format json` before planning or fixing EAI workflows.
- After any `eai` error, run `eai errors explain <code-or-reason> --format json` before guessing remediation.
- If `eai errors explain` is unavailable, match `.specify/references/platform/eai-error-catalog.yaml`, run read-only diagnostics before mutating fixes, and stop at the retry or escalation condition.
- For `eai user invite` 5xx or `EXTERNAL_SERVICE_ERROR`, check existing members with `eai user list --tenant <tenant-id> --search <email> --format json`; use `eai user role set --tenant <tenant-id> --member-id <member-id> --role tenant-admin --format json` only after verification and user approval, then tell the app user to sign out and sign back in.
- For `MISSING_TENANT`, `app_token_tenant_context_required`, or "Tenant context required for app tokens" on platform user lookup or membership prerequisites, run `eai errors explain app_token_tenant_context_required --format json`, confirm tenant context, and retry `/v4/platform/tenants/<tenant-id>/...` routes before changing tenant members, Entra, role definitions, databases, or cloud portals.
- Use `eai publicapi` only for authorized PublicAPI `/v4/...` routes.

## Commands

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
