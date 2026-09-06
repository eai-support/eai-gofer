---
name: gofer:plan
description: "Toggle plan mode in the active CLI session for the next user prompt; non-pipeline control command."
title: 'Gofer Plan Mode Toggle'
category: control
surfaces:
  - claude
  - claude-mirror
  - copilot
  - vscode
  - codex
  - antigravity
  - github-prompts
  - agents-skills
  - system-skills
---

# Gofer Plan Mode Toggle

## Token And Cost Policy
<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-policy.yaml` as repo-owned tier preferences, not proof of model access. If missing, use the bootstrap contract. Before any model override, discover the current host/client/account/profile catalogue as described in `.specify/references/portable-orchestration.md`. Never reuse API or other-surface model IDs. Preserve user files; reject unadvertised preferences.
2. Use the cheapest capable model first.
   - Resolve simple, medium, hard, and arbiter roles from the repo policy and verified host capabilities.
   - Treat delegation examples as role descriptions, not literal host commands or model IDs.
   - Keep Copilot Auto preferences and existing high-risk review. Ask before paid or provider changes.
3. Keep raw tool output out of the main conversation context. Save stable findings to `.specify/specs/{feature}/context-bundle.md`, then work from summaries.
4. Use provider prompt/context caching only for stable, non-secret prefixes: Gofer scaffold, AGENTS/CLAUDE/Copilot instructions, constitution, repo map, stage contracts, and validation rubric.
5. Before continuing after large research, planning, implementation, or validation bursts, checkpoint the durable artifacts and compact/clear/resume context when the host supports it.
6. Escalate model tier only when a cheaper pass is low-confidence, contradictory, security-sensitive, or blocking release quality.
7. At each meaningful stage, inspect the approved task route. Follow the Stage Execution Bridge in `.specify/references/portable-orchestration.md`: `/eai` calls `gofer-stage-execute.mjs` on CLI or native `gofer_execute_stage` with `{request}` in VS Code, never a CLI substitute. Ordinary chat or no useful delegation stays native without discovery/inference. Preserve explicit disable, reuse approved task model/budget, and keep mandatory approvals. `GOFER_STAGE_DELEGATE=1` forbids recursive dispatch. Delegates return read-only proposals; the controller retains all original tests, gates, previews and docs. Cascade needs current failed-check evidence, not confidence alone; same-family peer-review never replaces required different-family critique.
<!-- gofer:token-cost-policy:end -->

## Business-Friendly Progress Contract
<!-- gofer:business-progress:start -->

Default user-facing updates must be concise, business-level, and easy to scan.
Keep the technical work rigorous in artifacts, tests, logs, and code, but do
not lead with implementation jargon unless the user asks for it.

Use ASD-STE100 Simplified Technical English as the target writing standard for
all Gofer-authored chat, documents, commands, summaries, PR notes, error
guidance, and validation artifacts. ASD-STE100 is copyright and a trademark of
ASD; do not bundle the protected ASD dictionary and do not claim ASD
certification.

1. Explain progress as what is being connected, changed, checked, or fixed and
   why it matters to the business outcome.
2. Use the running build map: create or update
   `.specify/specs/{feature}/build-map.md` from
   `.specify/templates/build-map-template.md` for application delivery, and
   refer to its plain-language areas in progress updates.
3. When there is a problem, translate it into business impact, current status,
   next action, and what input or approval is needed. Keep raw stack traces,
   command logs, IDs, and acronyms out of chat unless asked.
4. If the user asks for technical depth, provide it on request and point to the
   durable artifact that contains the evidence.
5. Prefer a compact update shape:
   - `Working on`: the build-map area or stakeholder outcome
   - `Why it matters`: user/business impact
   - `Status`: done, checking, fixing, blocked, or needs decision
6. Use one action per instruction.
7. Keep instructions to 20 words or fewer where possible.
8. Use active voice unless the actor is unknown or not important.
9. Use simple verb forms: simple present, simple past, simple future,
   infinitive, or imperative.
10. Define acronyms on first use and use approved project terms.
11. Avoid idioms, marketing adjectives, vague praise, and hedging.
12. Use vertical lists for complex information and one topic per paragraph.
13. For errors, state what happened, why it matters, what to do next, and the
    exact safe command when one exists.
14. Do not remove technical validation, security checks, EAI preflights, tests,
   or loop evidence. This contract changes presentation, not engineering
   standards.
15. Before each user-facing reply, check that it leads with the business effect,
    uses concise simple language, and includes only useful technical detail.
16. If any check fails, rewrite the reply before sending it.
<!-- gofer:business-progress:end -->

When invoked, this command signals the host CLI to enter plan mode for the next
user prompt, requesting a structured plan instead of immediate execution. Use it
before complex changes to align on approach.

This control command is distinct from `/gofer:plan-stage`, which runs the full
plan stage of the Gofer pipeline (the `3_gofer_plan` source-of-truth file).
`gofer:plan` is a session-level toggle: it does not load Gofer specs, dispatch
planning subagents, or write `plan.md` artifacts. It simply asks the active CLI
host (Claude Code, Copilot CLI, or the VSCode extension) to surface its native
plan-mode UX so you can review the plan before any tools run.

The toggle is one-shot: it applies to the next prompt only, then auto-clears.
Re-invoke `gofer:plan` whenever you want plan-mode behavior again. If the host
CLI does not support plan mode, this command is a no-op and the next prompt
proceeds as normal.

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
