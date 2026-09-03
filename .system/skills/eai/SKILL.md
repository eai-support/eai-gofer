---
name: eai
description: "Start or continue the EAI delivery pipeline."
---

# Eai

Version: 3.12.1
Host: Codex

# Eai

Use this as the single user-facing Gofer command. Users should run `/eai`, `$eai`, or `#eai` depending on the host. Do not ask users to run numbered stage commands unless they explicitly request low-level internals.

## User-Facing Contract

- Keep the command window simple: expose `eai` only.
- Treat `.specify/commands/*.md` as internal stage contracts, not user-facing commands.
- Keep all Gofer functions available by routing internally to the right stage contract.
- Explain progress in business language first; provide technical details when the user asks.

## Controlled English Contract

Use ASD-STE100 Simplified Technical English as the target writing standard for all Gofer-authored chat, documents, commands, summaries, PR notes, error guidance, and validation artifacts. ASD-STE100 is copyright and a trademark of ASD; do not bundle the protected ASD dictionary and do not claim ASD certification.

Apply these rules before any user-facing output:

1. Use short sentences. Keep instructions to 20 words or fewer where possible.
2. Use one action per instruction.
3. Use active voice. Use passive voice only when the actor is unknown or not important.
4. Use simple present, simple past, simple future, infinitive, or imperative verb forms.
5. Use approved project terms and necessary technical nouns only. Define acronyms on first use.
6. Use direct words. Avoid idioms, marketing adjectives, vague praise, and hedging.
7. Use vertical lists for complex information.
8. Put one topic in each paragraph.
9. For errors, write: what happened, why it matters, what to do next, and the exact safe command when one exists.
10. Keep raw logs, stack traces, IDs, and secrets out of chat unless the user asks for technical detail.

## User-Facing Response Gate

Before each user-facing reply, check the draft against these rules:

1. Lead with the business outcome, effect, risk, or decision.
2. Use concise, simple language.
3. Include technical detail only when it supports a decision or the user asks for it.
4. If any check fails, rewrite the reply before sending it.

## Always-On EAI Contract

Users usually start every request with `/eai`, `$eai`, or `#eai`. Treat that prefix as activation for this contract, not as business content.

1. Apply the Controlled English Contract to every Gofer-authored message and artifact.
2. Keep the reply short unless the user asks for detail.
3. Explain the business effect first.
4. Put technical evidence in durable artifacts.
5. Do not make the user choose pipeline stages. Select the next internal stage yourself.

## EAI Lab Convergence Route

Handle this route before normal workspace preflight or app readiness when the user names an Issues2025 issue and asks for EAI Lab, full E2E, regression, fix, or retest work.

1. Treat this as a platform delivery control request. Do not ask the non-app confirmation and do not run `eai whoami`, tenant selection, or app initialization.
2. Extract exactly one Issues2025 issue number. Require it to match `^[1-9][0-9]*$`, reject every other value, and pass it as one quoted argument. Do not infer or substitute a different issue, use `eval`, or build an unquoted shell command.
3. Verify `gh auth status -h github.com`. The active user needs repository, workflow, Codespaces, and package-read access. Report the exact missing permission when preflight fails.
4. Read the canonical controller slug from the user-level `EAI_LAB_CONTROLLER_REPO` setting and require it to be an exact member of the user-level `EAI_LAB_TRUSTED_CONTROLLER_REPOS` allowlist. Never source either value from repository files. Authenticate the controller with non-executing Git metadata first. Accept only `https://github.com/<owner>/<repo>[.git]` or `git@github.com:<owner>/<repo>[.git]`, require the host to be exactly `github.com`, and require the normalized owner/repository slug to equal the approved slug. Reject alternate hosts, user information, query strings, fragments, local paths, `file:` URLs, and every other origin. Fetch and verify current `origin/main`. A current or parent workspace is eligible only when that origin is approved, the checkout is clean, and `HEAD` equals the freshly fetched `origin/main` commit. Otherwise clone only the approved slug or create a disposable clean checkout at that exact commit. Do not use generic GitHub code search to select executable code. Never switch, reset, stash, or overwrite a dirty caller workspace. Do not execute repository files before those checks pass. Only after those checks pass, run `./gas --help` and require it to list `lab-test`. If trusted configuration, provenance, or capability resolution is missing, report Blocked.
5. From that checkout run exactly `./gas lab-test <issue-number> --robot`. Do not add `--no-wait` unless the user explicitly asks only to dispatch.
6. Let Gas compose every currently owned linked PR, including approved non-submodule integrations, against latest main. Let the lab run the complete unchanged eai-testing-dev regression suite plus each external repository-owned contract.
7. Stay attached while the isolated Codespace worker runs read-only validation. The worker must not receive a credential capable of commenting or pushing, mutate any PR branch, or edit eai-testing-dev evidence. The trusted Actions controller alone publishes the request-bound result. If the robot security gate is not explicitly approved, report Blocked and do not launch a credential-bearing worker.
8. Interpret terminal states exactly: Green means every required test passed; Orange means every test ran but the request is not fully passed; Red means product failures remain; Blocked means setup or infrastructure prevented valid completion.
9. Report the Issues2025 status-comment URL, exact tested PR SHAs, validation cycle, and first blocker. A workflow dispatch, running Codespace, or Orange result is not a completion claim.
10. Do not mutate or push PR branches, merge, deploy, promote, weaken tests, or suppress failures as part of this route.

## Workspace Preflight

1. Resolve the repository root.
2. Run `node .specify/scripts/node/gofer-workspace-check.mjs --host codex --json` when available.
3. If the repo is missing or stale, ask exactly: **"This repo is missing or stale for Gofer. Initialize/update it now?"**
4. If the user says yes, run `node .specify/scripts/node/gofer-workspace-bootstrap.mjs --host codex --include-mirrors`, then resume this command.
5. If the user says no, stop and explain that Gofer needs the repo scaffold before it can safely continue.

## Local Settings Cleanup Contract
<!-- gofer:local-settings-cleanup:start -->

After any Gofer install, update, release refresh, or workspace bootstrap:

1. Archive stale Gofer command and skill entries before continuing.
2. Prefer the repo helper:
   - `node .specify/scripts/node/gofer-local-settings-cleanup.mjs --workspace . --apply --json`
3. If the repo helper is missing, use the stable plugin bundle helper:
   - macOS/Linux: `node ~/plugins/eai-gofer/.specify/scripts/node/gofer-local-settings-cleanup.mjs --workspace . --apply --json`
   - Windows: `node %USERPROFILE%\plugins\eai-gofer\.specify\scripts\node\gofer-local-settings-cleanup.mjs --workspace . --apply --json`
4. This cleanup covers old Claude, Codex, Copilot, Gemini, Grok, VS Code, desktop, and CLI command surfaces.
5. Do not remove the current public `eai` entrypoint.
6. Ask the user to refresh or restart the host command picker only after cleanup completes.
<!-- gofer:local-settings-cleanup:end -->

## App Preview Runner Contract
<!-- gofer:app-preview-runner:start -->

For EAI app delivery, every UI preview must use the repo runner when it exists.

1. Use `./run.sh dev 3001` on macOS, Linux, and GitHub Codespaces.
2. Use `run.bat dev 3001` on Windows.
3. Use a different port only when the feature notes record the reason.
4. The runner must stop any process on the selected port before it restarts the app.
5. Do not use direct `npm run dev`, `next dev`, or package-manager preview commands when `run.sh`, `run.bat`, or `run.ps1` exists.
6. After every UI-facing change, run:
   - `node .specify/scripts/node/gofer-ui-preview.mjs --feature-dir {FEATURE_DIR} --command "./run.sh dev 3001" --open auto --screenshot --change "<change summary>"`
7. On Windows, use:
   - `node .specify/scripts/node/gofer-ui-preview.mjs --feature-dir {FEATURE_DIR} --command "run.bat dev 3001" --open auto --screenshot --change "<change summary>"`
8. If the runner is missing in an EAI app template repo, refresh the template before preview work continues.
<!-- gofer:app-preview-runner:end -->

## Journey State

Before routing work, decide where the user is now.

1. Read current feature state from `.specify/specs/`, `goal-ledger.json`, `eai-preflight.md`, `research.md`, `spec.md`, `plan.md`, `tasks.md`, validation reports, loop evidence, and handoff notes when they exist.
2. Classify the request as conversation, research/docs/audit, EAI app delivery, or ambiguous.
3. For conversation or research/docs/audit, continue the non-app Gofer path after the one required non-app confirmation.
4. For EAI app delivery or ambiguous app work, continue directly into EAI readiness.
5. Find the earliest missing pipeline artifact or blocked EAI gate.
6. Run that internal stage next, then continue forward.
7. Keep the user-facing explanation at the business level.

## MVP Capability-Based Validation

Use `.specify/references/mvp-capability-validation.md` as the source of
truth. Validate the work that the active feature specification requires now.
Do not apply later delivery requirements to an early MVP.

1. Create `.specify/specs/{feature}/` before app or operator-tool source work.
2. Keep `spec.md`, `plan.md`, `tasks.md`, `traceability.md`, and the validation scope aligned.
3. Mark each relevant capability as `not_applicable`, `planned`, `implemented`, `verified`, or `blocked`.
4. Require evidence only for an implemented capability or a capability required by the current delivery decision.
5. Treat `run.sh`, `run.bat`, and `run.ps1` as launch evidence only. They do not prove authentication, sessions, EAI access, or deployment readiness.
6. For a user-facing change, store the local HTTP check, screenshot, and review outcome in the feature validation report.
7. If browser validation is blocked, mark that user journey `unverified`. Do not call it complete.
8. If the user changes scope, update the feature artifacts before continuing. Explain what changed, what remains valid, and what now needs evidence.
9. Use truthful completion language. For example: `The server runs. Authentication is not in the current MVP scope.`
10. When the feature claims a release or deployed outcome, create `release-capability-ledger.md` from `.specify/templates/release-capability-ledger-template.md`.
11. Do not report a release complete or score 100% when a required capability is missing from traceability, remains on an open PR, is absent from the release branch, or lacks required deployed evidence.

## App vs Non-App Routing

1. Classify the request before EAI readiness: EAI app delivery, non-application work, or ambiguous.
2. If the request is EAI app delivery or ambiguous, continue directly into the EAI app delivery path; do not ask for confirmation just because app delivery is inferred.
3. If the request is clearly non-app work, confirm once: **"This looks like non-app work, so I will skip EAI tenant/app setup and continue the Gofer research/docs path. Is that right?"**
4. When the user confirms non-app, do not run `eai whoami`, tenant selection, `eai init`, or first-run setup. Record the decision and continue the appropriate Gofer research, documentation, audit, migration, or planning path.
5. If the user says it is app work, switch to EAI app delivery and run EAI readiness.

## EAI Platform Readiness

1. Run `eai whoami` only when the current feature uses EAI Platform services, the user asks for EAI setup, or EAI CLI recovery is needed.
2. Require `eai-app-template-readiness`, `eai verify`, and `eai template check --format json` only when the feature creates, changes, or validates an EAI Platform app integration.
3. Require the authentication journey only when the specification includes sign-in, protected content, user roles, or a deployment target that requires identity.
4. For a local MVP with no EAI or authentication capability, record those states as `not_applicable` or `planned` and continue with local feature validation.
5. When an EAI capability becomes required, run the first-run/setup path from `.specify/commands/gofer_eai_first_run.md`, then require canonical template evidence before that capability can complete.
6. Do not accept copied marker files, a partial scaffold, or a custom template as proof that `eai init` completed.
7. After any `eai` error, run `eai errors explain <code-or-reason> --format json` when available before guessing remediation.
8. Do not write tokens, secrets, private tenant IDs, or local `.env` values into artifacts.

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

## EAI Platform Decision Contract

For app delivery, make EAI Platform choices for the business user.

1. Read `.specify/references/platform/eai-service-patterns.md`, `.specify/references/platform/eai-repo-contract.md`, and `.specify/references/platform/eai.md` before architecture or storage decisions.
2. Run `eai --describe` before assuming current CLI syntax.
3. Run `eai agent guide --format json` when the CLI advertises it.
4. Run `eai resources schema --format json` and `eai workflow readiness --format json` when advertised and relevant.
5. Create or update `.specify/specs/{feature}/service-fit-matrix.md`.
6. Prefer the EAI app template, PublicAPI, ResourceAPI, object types, workflows, goals, targets, platform AI services, and tenant identity.
7. Prefer PostgreSQL for relational, transactional, reporting, and workflow state.
8. Prefer DocumentDB for flexible JSON documents, nested records, and high-change document models.
9. Prefer Blob Storage for large files and binary content behind API-mediated access.
10. Prefer AI Search as a derived search projection, not as the source of record.
11. Prefer EAI content understanding and document services for classification, extraction, summarization, and Retrieval-Augmented Generation.
12. Prefer EAI workflows, goals, and targets for approvals, long-running work, service goals, operating targets, and auditable process state.
13. Use Azure second when the EAI Platform does not yet expose the needed capability.
14. Use any other platform only as an explicit exception with rationale, owner, expiry, and validation evidence.
15. Ask the user only for material business, security, cost, deployment, destructive, or external-system decisions.

## First Conversation

When this is the first EAI conversation for a new app:

1. Start with the business outcome. Ask what the user needs to achieve, who it is for, and how success will be measured.
2. Explain EAI capabilities only when they help the next decision. Do not begin with platform architecture or a list of tools.
3. Use the repository and EAI CLI as sources of truth. Run `eai --describe` before assuming command syntax and explain known errors before recovery.
4. Keep numbered Gofer stages internal. Say what is being learned, designed, built, or checked in business language.
5. Explain why specification-led delivery improves AI quality: it creates a shared, testable statement of the outcome before code changes multiply.
6. Pause once for approval of the business specification. After approval, continue automatically unless a material business, security, cost, deployment, or destructive decision needs approval.
7. Do not create a GitHub repository, deploy, publish, spend money, or change external systems without the relevant user approval.

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
