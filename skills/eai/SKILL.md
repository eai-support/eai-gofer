---
name: eai
description:
  'Run Gofer through one public entrypoint while preserving the full internal
  pipeline.'
---

# Eai

Version: 3.10.0

Use this skill when the user asks to run, install, update, or understand Gofer
without the VS Code extension UI.

## Clean Surface Contract

- User-facing command and skill pickers should expose only `eai`.
- Do not ask users to run numbered/helper stage commands such as
  `/0_gofer_start`, `/1_gofer_research`, or `/6_gofer_validate` unless they
  explicitly ask for low-level internals.
- Preserve all Gofer functions by routing internally through the stage contracts
  in `.specify/commands/*.md`.

## Workspace First

Before stage work, resolve the repository root and run
`node .specify/scripts/node/gofer-workspace-check.mjs --host auto --json` when
available. If the repo is missing or stale, ask before running
`node .specify/scripts/node/gofer-workspace-bootstrap.mjs --host auto --include-mirrors`,
then resume the original command.

## Controlled English Contract

Use ASD-STE100 Simplified Technical English as the target writing standard for
all Gofer-authored chat, documents, commands, summaries, PR notes, error
guidance, and validation artifacts. ASD-STE100 is copyright and a trademark of
ASD; do not bundle the protected ASD dictionary and do not claim ASD
certification.

Apply these rules before any user-facing output:

1. Use short sentences. Keep instructions to 20 words or fewer where possible.
2. Use one action per instruction.
3. Use active voice. Use passive voice only when the actor is unknown or not
   important.
4. Use simple present, simple past, simple future, infinitive, or imperative
   verb forms.
5. Use approved project terms and necessary technical nouns only. Define
   acronyms on first use.
6. Use direct words. Avoid idioms, marketing adjectives, vague praise, and
   hedging.
7. Use vertical lists for complex information.
8. Put one topic in each paragraph.
9. For errors, write: what happened, why it matters, what to do next, and the
   exact safe command when one exists.
10. Keep raw logs, stack traces, IDs, and secrets out of chat unless the user
    asks for technical detail.

## Business-Friendly Progress

- Keep user-facing progress short and business-level by default.
- Explain what is being connected, changed, checked, or fixed and why it
  matters.
- Use `.specify/specs/{feature}/build-map.md` as the shared picture of the build
  when app delivery applies.
- Keep technical detail, logs, tests, and security evidence in artifacts; show
  deeper detail when the user asks.

## App vs Non-App Routing

- Classify each request before EAI readiness as EAI app delivery,
  non-application work, or ambiguous.
- If the request is EAI app delivery or ambiguous, continue directly into the
  EAI app delivery path and run EAI readiness.
- If the request is clearly non-app work, confirm once: **"This looks like
  non-app work, so I will skip EAI tenant/app setup and continue the Gofer
  research/docs path. Is that right?"**
- If the user confirms non-app, do not run `eai whoami`, tenant selection,
  `eai init`, or first-run setup. Record the decision and continue the
  appropriate non-app path.
- If the user says it is app work, switch to EAI app delivery and run EAI app
  preflight.

## First EAI Platform App

If the user is starting a first EAI Platform app, use the public `eai`
entrypoint, then follow the first-run/setup contract in
`.specify/commands/gofer_eai_first_run.md` when it is present. It is allowed
before `.specify/` exists and checks Git, Node.js, npm, the scoped EAI registry,
EAI CLI, login, tenant, `eai init`, and Gofer scaffold readiness with user
approval gates.

## EAI App Template Gate

- Before app research or source changes, run
  `node .specify/scripts/node/eai-app-template-readiness.mjs --root . --json`
  when available.
- A missing checker or any status other than `ready` is a hard stop for app
  delivery.
- Complete `eai init`, enter the created app folder, then rerun the checker,
  `eai verify`, and `eai template check --format json`.
- Do not accept copied marker files, partial scaffolds, or custom templates as
  readiness evidence.
- Confirmed non-app work is exempt.

## First Conversation

When this is the first EAI conversation for a new app:

1. Start with the business outcome. Ask what the user needs to achieve, who it
   is for, and how success will be measured.
2. Explain EAI capabilities only when they help the next decision. Do not begin
   with platform architecture or a list of tools.
3. Use the repository and EAI CLI as sources of truth. Run `eai --describe`
   before assuming command syntax and explain known errors before recovery.
4. Keep numbered Gofer stages internal. Say what is being learned, designed,
   built, or checked in business language.
5. Explain why specification-led delivery improves AI quality: it creates a
   shared, testable statement of the outcome before code changes multiply.
6. Pause once for approval of the business specification. Then continue unless a
   material business, security, cost, deployment, or destructive decision needs
   approval.
7. Do not create a GitHub repository, deploy, publish, spend money, or change
   external systems without the relevant user approval.

## EAI CLI Discovery And Recovery

- Run `eai whoami` only for EAI app delivery work or explicit EAI CLI recovery,
  not for confirmed non-app research/docs/audit/planning.
- Run `eai update --check` before first EAI platform work when the CLI may be
  stale.
- Run `eai --describe` before assuming command syntax.
- If advertised, run `eai agent guide --format json` before planning or fixing
  EAI workflows.
- After any `eai` error, run `eai errors explain <code-or-reason> --format json`
  before guessing remediation.
- If `eai errors explain` is unavailable, match
  `.specify/references/platform/eai-error-catalog.yaml`, run read-only
  diagnostics before mutating fixes, and stop at the retry or escalation
  condition.
- For `eai user invite` 5xx or `EXTERNAL_SERVICE_ERROR`, check existing members
  with `eai user list --tenant <tenant-id> --search <email> --format json`; use
  `eai user role set --tenant <tenant-id> --member-id <member-id> --role tenant-admin --format json`
  only after verification and user approval, then tell the app user to sign out
  and sign back in.
- For `MISSING_TENANT`, `app_token_tenant_context_required`, or "Tenant context
  required for app tokens" on platform user lookup or membership prerequisites,
  run `eai errors explain app_token_tenant_context_required --format json`,
  confirm tenant context, and retry `/v4/platform/tenants/<tenant-id>/...`
  routes before changing tenant members, Entra, role definitions, databases, or
  cloud portals.
- Use `eai publicapi` only for authorized PublicAPI `/v4/...` routes.

## Token And Cost Policy

- Treat `.specify/memory/gofer-model-policy.yaml` as the repo-owned source of
  truth for simple, medium, hard, and arbiter model routing. Run the internal
  bootstrap contract if it is missing.
- Use the cheapest capable model first. Escalate only when a cheaper pass is
  low-confidence, contradictory, security-sensitive, release-critical, or
  blocking quality.
- Keep raw search, build, and test output out of the main chat context. Write
  stable findings to `.specify/specs/{feature}/context-bundle.md` and continue
  from summaries.
- Prefer provider prompt/context caching for stable non-secret prefixes: Gofer
  scaffold, repository instructions, constitution, repo map, stage contracts,
  and validation rubric.
- After large research, planning, implementation, or validation bursts,
  checkpoint artifacts and compact/clear/resume context when the host supports
  it.

## Internal Pipeline And Helper Contracts

- `0_gofer_start` - Start Gofer, confirm EAI readiness, and route the delivery
  pipeline.
- `0a_problem_validation` - Validate the business problem using 5 Whys
  root-cause analysis and stakeholder mapping.
- `1_gofer_research` - Research codebase, CLI integrations, and technology
  landscape for the target feature.
- `2_gofer_specify` - Generate a feature specification from research findings
  and any supporting review context.
- `3_gofer_plan` - Create a detailed technical implementation plan with
  architecture, data model, and contracts.
- `4_gofer_tasks` - Break down the implementation plan into dependency-ordered,
  parallelisable tasks.
- `5_gofer_implement` - Execute all tasks from tasks.md phase by phase with
  feedback loops and engineering review.
- `6_gofer_validate` - Validate implemented work with evidence-backed scoring,
  blast-radius analysis, and engineering review.
- `7_gofer_save` - Save session state and create a handoff checkpoint for
  resumption in a new context.
- `7a_stakeholder_comms` - Generate stakeholder-facing communications: release
  notes, demo scripts, and change briefs.
- `8_gofer_branding` - Brand Gofer templates and stakeholder documents for a
  company or consulting-firm look and feel.
- `9_gofer_tests` - Generate comprehensive test suites from four testing
  perspectives for a target component.
- `10_gofer_cloud` - Deploy and configure the Gofer cloud integration for remote
  pipeline execution.
- `gofer_bootstrap_workspace` - Create or update the repo-owned Gofer scaffold
  for the current workspace.
- `gofer_check_workspace` - Check whether this repo is initialized for Gofer and
  explain any missing or stale scaffold.
- `gofer_constitution` - Create or update project constitution with coding
  principles and guidelines.
- `gofer_diagnose` - Run a reproduce-minimize-instrument-fix loop for bugs and
  failing tests.
- `gofer_eai_first_run` - Prepare a new machine or repo for the first EAI Gofer
  app build.
- `gofer_hydrate` - Reverse-engineer specification from existing code
  (Hydration).
- `gofer_personality` - Set the assistant personality for this Gofer session:
  friendly, pragmatic, or none (default).
- `gofer_plan` - Toggle plan mode in the active CLI session for the next user
  prompt; non-pipeline control command.
- `gofer_side` - Open a side conversation in the active CLI without disturbing
  the main pipeline state; resumable.
- `gofer_spec_summary` - Generate a business-friendly summary of feature value
  and scope.
- `gofer_tdd` - Guide a red-green-refactor loop tied to spec acceptance
  criteria.
- `gofer_vocabulary` - Extract domain terminology into a canonical feature
  glossary.
- `gofer_zoom_out` - Show how the current feature connects to broader system
  boundaries.

## Stable Local Install Path

Install or update this plugin by replacing the stable local folder:

```text
~/plugins/eai-gofer
```

The public release feed is available at:

```text
https://eai-support.github.io/eai-gofer/releases.json
```

Gemini CLI users can also copy the bundled `.gemini/` directory into a
repository root to activate the same public command set there.
