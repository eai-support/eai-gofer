# Gofer Agent Commands

This file documents the public Gofer command surface and internal pipeline contracts.

Generated: 2026-09-25T04:39:31.355Z

## Public Entrypoints

- `eai` - Start or continue Gofer from one user-facing command.

Do not expose numbered or helper stage commands in user-facing pickers. They remain available as internal contracts under `.specify/commands/`.

## User-Facing Response Gate

Before each user-facing reply, check the draft against these rules:

1. Lead with the business outcome, effect, risk, or decision.
2. Use concise, simple language.
3. Include technical detail only when it supports a decision or the user asks for it.
4. If any check fails, rewrite the reply before sending it.

**Business Updates And Goal Checks**

For every material code or contract change, keep `spec.md`, `plan.md`, `tasks.md`, `test-spec.md`, `change-manifest.json`, `blast-radius-report.md`, and `traceability.md` current before more implementation work. Keep executable feature tests in the owning repository. Add an `eai-testing-dev` contract only for a deployed canary, route/config contract, authentication smoke, tenant smoke, or release-evidence surface.

Use `.specify/references/business-updates-and-goal-checks.md`. Before each reply, explain the result, business effect, and next action in plain language. For progress, use two or three short sentences. Run `node .specify/scripts/node/gofer-response-check.mjs --input <private-draft-file>` before sending a drafted progress update; rewrite failed drafts. Use `--kind answer` for answers and `--technical` only when technical detail was requested. Do not repeat unchanged progress. This helper cannot intercept messages that the host sends directly.

Before each work batch, read the current goal, specification, tasks, and latest findings. Make ordinary design, sequencing, diagnosis, repair, and verification decisions that advance the goal. Record material decisions and update affected feature documents when new evidence changes the path. Never weaken acceptance criteria to match failing code. Do not invent approval where approval is required. Mark a task complete only after its linked checks pass; reopen affected tasks when evidence is stale. For app and non-app features with a spec and tasks, enable `requireDeliveryCheckpoint` in `loop-contract.json` and run `node .specify/scripts/node/gofer-delivery-check.mjs --feature-dir <feature-dir>` before advancing or claiming completion. Follow the reference to capture a reviewed checkpoint, not merely to clear a failure. Keep existing MVP exemptions, reviews, loops, and release gates. Conversation-only requests need no feature files.

**Priority And Outcome Protection**

Jev must judge goal alignment, specification currency, executable test coverage, and blast-radius completeness at every configured checkpoint. Missing evidence, a conflict, partial alignment, low confidence, or an unavailable verdict blocks the affected task. Update the records and rerun the checkpoint. Never ignore the result, edit the receipt, or complete work with an unresolved verdict.

Follow `.specify/references/priority-outcome-protection.md`. Treat the stated goal as authority for ordinary delivery decisions. Record material user direction and Gofer decisions in decisions.md. Maintain priority-plan.json with ordered tasks, dependencies, allowedEditScope and the current outcome. Enable requirePriorityPlan for new feature contracts. Run `node .specify/scripts/node/gofer-priority-check.mjs --feature-dir <feature-dir> --task T001` before the action, and include --workspace <repo-root> plus --changed-file for each proposed or actual changed repo-relative path. Follow its nextTask; recorded independent work may run in parallel. Do not switch to unrelated work when blocked. Ask only when a decision changes the goal, needs missing authority or access, causes irreversible loss, creates external cost or commitment, changes production or public exposure, or conflicts with an explicit user constraint. On resume, state the agreed outcome and next task in plain language after reading the last recorded direction. Keep routine conversation free of feature paperwork.

Before technical escalation, attach fresh diagnosis through the blocker helper's ask event verification field. Check the exact command, route, environment, own mistake and existing authority. Do not invent a tenant, ask for login without checking it, require an unsafe alternative, or equate administrator access with permission. Business decisions need no failing command. At completion, run the priority checker with --finish; a missing or stale outcome receipt means unverified, regardless of test scores. Use --completion for the final gofer-closed-loop-audit.mjs run; a routine drift audit alone does not prove completion. When TypeSafe semantic review is enabled for the feature, run `node .specify/scripts/node/gofer-semantic-drift.mjs --workspace <repo-root> --feature-dir <feature-dir> --event <resume|before_task_batch|after_material_finding|before_validation>` at resume, before a material task batch, after a material finding, and before validation. A TypeSafe conflict or uncertain result requires Gofer reconciliation; it cannot edit artefacts, bypass scope controls, or complete work. Preserve detailed test results, early local MVP scope, non-app work, independent approved tasks and all release/security checks.

## Always-On EAI Contract
<!-- gofer:always-on-eai:start -->

Apply this contract to every request after Gofer is installed for this repo or AI coding app. The user does not need to type `/eai` or `$eai`.

1. Preserve the user's request. Do not rewrite it or add a visible command prefix.
2. Treat an explicit `/eai` (Claude, Copilot, Antigravity, Grok, or VS Code) or `$eai` (Codex) prefix as an idempotent request for the same contract.
3. Apply the Controlled English Contract to every Gofer-authored message and artifact.
4. Keep the reply short unless the user asks for detail.
5. Explain the business effect first.
6. Put technical evidence in durable artifacts.
7. Do not make the user choose pipeline stages. Select the next internal stage yourself.
8. Do not repeat workspace setup on every message. Check it before meaningful repo work, tool use, or a pipeline stage.
9. Keep the update and installation path separate. When the user explicitly asks to update Gofer, run only its maintenance contract.
10. When a new app conversation starts with `Get started with EAI`, send the Required First-Run Response before workspace preflight, EAI readiness, setup, tool calls, or stage routing.
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

## EAI Hosting And Deployment Contract

When an app reaches a deployment decision, ask once: **"Where should this app run: EAI-managed Azure, your Azure, or local only?"**

Explain the choices before the user decides:

- **EAI-managed Azure**: use the current local app as source, choose who maintains its GitHub repository, and deploy its verified commit through TenantInfra.
- **Your Azure**: keep the existing customer-owned Azure deployment path and credentials.
- **Local only**: stop after local validation. Do not create cloud resources.

For EAI-managed Azure:

1. Verify `eai deploy app --help` and `eai deploy doctor --help` from the installed CLI. The doctor command must advertise `--operation-id`, `--app-key`, `--tenant-id`, `--target-tenant-id`, and `--evidence-out`. If it does not, stop and ask the user to update the CLI. Do not reproduce its API, GitHub, workflow, or TenantInfra logic in Gofer.
2. Verify EAI login, the selected tenant, and app access. The CLI must verify a GitHub identity linked to that same EAI actor through its browser handoff. Guide the user to link an existing GitHub account or create one if needed. Matching email text or a local `gh` login does not prove this association.
3. Ask **"Who should maintain the app source: EAI-maintained or My GitHub?"** after identity verification. Keep this choice separate from EAI Azure hosting. EAI-maintained means a server-owned bot repository; My GitHub means the customer's repository.
4. For **EAI-maintained**, use `eai deploy app <app-key> --target eai --tenant-id <app-scope-tenant> --source eai-managed --target-tenant-id <runtime-tenant> [--environment preview] [--wait] --format json`. The CLI packages the exact bounded local source. EAI derives the repository, creates and validates the bot PR, merges it, and dispatches the exact merged commit. Do not require an origin remote, a customer push, customer write access to the EAI repository, or customer PR merging. Never treat an accepted bundle or `pending_review` receipt as deployment success.
5. For **My GitHub**, use `eai deploy app <app-key> --target eai --tenant-id <app-scope-tenant> --source customer-owned --repo <owner/name> --installation-id <positive-id> --target-tenant-id <runtime-tenant> [--branch main] [--environment preview] [--workflow .github/workflows/eai-app.yml] [--wait] --format json`. The customer commits, pushes, reviews, and merges under that repository's rules. If the CLI installs or updates its workflow, stop at its commit-and-push instruction and continue only after that exact commit is available remotely.
6. Use the app-scope tenant for `--tenant-id`. Record the approved runtime tenant from `targetTenantId`; initial deployment, resume, and retry must always pass it explicitly with `--target-tenant-id`, including same-tenant deployments. Persist the selected source mode and returned operation ID in the active feature notes. Read, resume, and retry only that exact operation using the CLI's returned next action.
7. For the customer-owned source operation, resume with `eai deploy app <app-key> --target eai --tenant-id <app-scope-tenant> --target-tenant-id <runtime-tenant> --resume <operation-id> [--wait] --format json`. Retry with the same tenant flags and `--retry <operation-id>`. Never omit the target tenant or substitute the latest operation. For EAI-maintained publication, follow its own exact-operation next action; do not substitute the customer-owned dispatch path.
8. Treat the CLI JSON as the deployment authority. Record its target tenant, source mode, source binding, bundle digest when present, bot PR and merged commit when present, deployment ID, runtime identity, active URL, pointer versions, status, and next action without copying tokens or secrets.
9. Claim deployment complete only when the CLI reports `classification: succeeded`, `status: active`, `requiresTenantInfra: false`, an HTTPS `activeUrl`, a deployment ID, and runtime identity. Run `eai deploy doctor --operation-id <operation-id> --app-key <app-key> --tenant-id <app-scope-tenant> --target-tenant-id <runtime-tenant> --evidence-out .eai/deploy-doctor.json --format json`. The CLI must derive the active URL from the exact PublicAPI operation, verify the deployment, runtime, source, and configuration bindings, run authenticated readiness, and atomically write the receipt. Require the saved receipt to bind the operation, app, both tenants, source and configuration digests, deployment, runtime identity, readiness checks, and timestamp. Every recorded check must pass before the shared readiness gate can pass. When a Gofer deployment task is present, replace every command placeholder with the returned values and retain that complete inline command on the task's checkbox line before completion; the gate rejects placeholder, legacy, stale, malformed, failing, or unrelated evidence. Do not replace `--evidence-out` with shell-specific directory creation or output redirection.

If deployment stops, use the CLI reason and `nextAction`. Then run `eai errors explain <code-or-reason> --format json` when advertised. Explain what happened, why it matters, and the exact safe resume action. Keep these causes separate:

- EAI login, selected account, tenant membership, or app access;
- missing or incorrectly linked GitHub identity for the signed-in EAI actor;
- customer-repository GitHub login or wrong GitHub account;
- missing tenant repository connection for customer-owned source;
- missing or incorrect GitHub App installation or repository grant;
- protected repository or workflow update that needs a commit and push;
- rejected local source, unapproved template pin, pending bot PR checks, or publication failure;
- OpenID Connect (OIDC), workflow permission, evidence, or run failure;
- TenantInfra acceptance, progress, or deployment failure.

Never ask the user for a GitHub App private key, personal access token, Azure credential, or platform service token. Keep customer Azure and local deployment behavior unchanged.

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
