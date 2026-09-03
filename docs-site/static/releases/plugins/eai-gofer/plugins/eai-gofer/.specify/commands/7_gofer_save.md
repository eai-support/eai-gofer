---
name: 7_gofer_save
description: "Save session state and create a handoff checkpoint for resumption in a new context."
title: "Gofer Save"
category: utility
surfaces:
  - claude
  - claude-mirror
  - copilot
  - vscode
  - codex
  - gemini
  - github-prompts
  - agents-skills
  - system-skills
aliases: [gofer:save]
---
---
description: Save session progress with comprehensive checkpoint for resumption
---

# Gofer Save

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

## Application Classification And EAI Preflight

Before any EAI CLI, login, tenant, template, or app-enrollment action:

1. Classify the request as **EAI app delivery** or **non-application work** using the application signals in `.specify/commands/0_gofer_start.md`.
2. Create `.specify/specs/{feature}/` and record the active delivery scope before app or operator-tool source work.
3. If the request is clearly non-app work, confirm once: **"This looks like non-app work, so I will skip EAI tenant/app setup and continue the Gofer research/docs path. Is that right?"**
4. If the user confirms non-app, record the decision and mark app-only capabilities `not_applicable`. Do not run `eai whoami`, `eai tenant select`, `eai init`, or `/gofer:eai-first-run`.
5. For local MVP app work, validate the implemented user journey, repo runner, and preview evidence. Do not require EAI setup, authentication, or deployment when the active specification does not require them.
6. When the feature uses EAI Platform services, requires a tenant, or prepares deployment, run `eai whoami` and record the EAI readiness evidence in `eai-preflight.md`.
7. When the feature creates, changes, or validates an EAI Platform app integration, run `node .specify/scripts/node/eai-app-template-readiness.mjs --root . --json`. A missing checker or status other than `ready` blocks that EAI capability. It does not block unrelated local MVP work.
8. When authentication is implemented or required, validate provider, callback, sign-in, session, first protected API call, and safe denied access.
9. When deployment is requested or claimed, require the relevant EAI template, security, configuration, and deployment evidence before completion.
10. For durable app delivery, use EAI Platform first, Azure second, and every other stack only by explicit exception.
11. If the user changes scope, update `spec.md`, `plan.md`, `tasks.md`, `traceability.md`, and validation scope before continuing. Explain the business effect and evidence change.
12. Do not accept copied marker files, partial scaffolds, or custom templates as readiness evidence for an EAI capability.
13. Do not write tokens, secrets, private tenant IDs, or local `.env` values into Gofer artifacts; record only product-safe readiness status and evidence.

## Token And Cost Policy
<!-- gofer:token-cost-policy:start -->

Before spawning agents, calling tools, or loading large files:

1. Treat `.specify/memory/gofer-model-policy.yaml` as the repo-owned source of truth for simple, medium, hard, and arbiter model routing. If it is missing, run `/gofer:bootstrap-workspace` before continuing.
2. Use the cheapest capable model first.
   - Claude: Haiku for scouting/extraction; Sonnet for normal implementation, synthesis, validation, and security; Opus for high-risk arbitration or release-critical failures.
   - Codex/OpenAI: GPT mini for simple coding; GPT nano only for locate/classify/summarize/mechanical work; GPT-5.3-Codex or flagship GPT for tool-heavy coding, architecture, and release-critical validation.
   - Gemini: Flash-Lite for cheap large-context scan/summarize; Flash for default research synthesis; Pro for large-context architecture or high-risk arbitration.
   - Copilot: prefer Auto for simple and default work; ask the user before choosing a paid/high-tier picker model for hard security, architecture, or release gates.
3. Keep raw tool output out of the main conversation context. Save stable findings to `.specify/specs/{feature}/context-bundle.md`, then work from summaries.
4. Use provider prompt/context caching only for stable, non-secret prefixes: Gofer scaffold, AGENTS/CLAUDE/Copilot instructions, constitution, repo map, stage contracts, and validation rubric.
5. Before continuing after large research, planning, implementation, or validation bursts, checkpoint the durable artifacts and compact/clear/resume context when the host supports it.
6. Escalate model tier only when a cheaper pass is low-confidence, contradictory, security-sensitive, or blocking release quality.
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

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

---

## When to Use This Command

- User needs to stop mid-implementation
- Switching to another task/feature
- End of work session
- Before a break or context switch
- **Context window approaching limits (>50% usage)**
- **Context health check returns WARNING or CRITICAL**
- Before risky operations

### Context-Triggered Saves (2025-2026 Best Practice)

Run context health check periodically during long sessions:

```bash
.specify/scripts/bash/check-context-health.sh --json
```

| Status   | Token Usage | Action                                  |
| -------- | ----------- | --------------------------------------- |
| Healthy  | < 50%       | Continue normally                       |
| Warning  | 50-70%      | Consider checkpoint, use sub-agents     |
| Critical | > 70%       | **Save immediately**, start new session |

**Why this matters**: Research shows LLMs lose accuracy as context grows.
Effective context for Claude is ~60-120k tokens, not the advertised 200k.

---

## Step 1: Assess Current State

### 1.1 Context Window Health

```bash
.specify/scripts/bash/check-context-health.sh
```

Document current context usage - this informs how much detail to include in
handoff.

### 1.2 Gather Session State

1. **Review conversation history** to understand what was being worked on
2. **Check git status** for uncommitted changes
3. **Identify the active feature** from `.specify/specs/*/`
4. **Review TodoWrite list** for current tasks
5. **Check pipeline stage** - which Gofer command was last run

```bash
# Git state
git status
git log --oneline -5

# Find active feature
ls -la .specify/specs/
```

---

## Step 2: Save Code Progress

### 2.1 Commit Meaningful Work

```bash
git status
git diff --stat

# Create WIP commit if appropriate
git add [specific files]
git commit -m "WIP: [Feature] - [Current state description]

Checkpoint created by /7_gofer_save
Stage: [current pipeline stage]
Next: [what needs to happen next]"
```

### 2.2 Document Uncommitted Changes

If changes shouldn't be committed yet:

- List files with unsaved changes
- Explain why they weren't committed
- Document what needs to be done before committing

---

## Step 3: Create Session Checkpoint

Write to `{FEATURE_DIR}/session-checkpoint.md`:

````markdown
---
feature: [Feature Name]
created: [ISO timestamp]
stage: [1_research|2_specify|3_plan|4_tasks|5_implement|6_validate]
status: paused
context_usage: [percentage from health check]
last_commit: [git hash]
branch: [current branch]
---

# Session Checkpoint: [Feature Name]

## Current State

### Pipeline Progress

| Stage             | Status      | Artifact                 |
| ----------------- | ----------- | ------------------------ |
| 1_gofer_research  | [done/skip] | research.md              |
| 2_gofer_specify   | [done/skip] | spec.md                  |
| 3_gofer_plan      | [done/skip] | plan.md, data-model.md   |
| 4_gofer_tasks     | [done/skip] | tasks.md                 |
| 5_gofer_implement | [current]   | [files created/modified] |
| 6_gofer_validate  | pending     | -                        |

### Active Task

- **Current Task**: [Task ID and description from tasks.md]
- **File Being Modified**: `path/to/file.ts:line`
- **What Was Happening**: [Detailed description]

### Task Completion Status

From tasks.md:

- Completed: [X]/[Total] tasks
- Current phase: [Phase name]
- Next task: [Task ID and description]

## Code Changes

### Committed This Session

```bash
git log --oneline [session_start_commit]..HEAD
```
````

### Uncommitted Changes

| File           | Status   | Description                |
| -------------- | -------- | -------------------------- |
| `path/to/file` | Modified | [What was changed and why] |
| `path/other`   | New      | [Purpose of new file]      |

### Files NOT to Modify (Protected)

From tasks.md Protected Files section:

- [List protected files]

## Context for Resumption

### Key Decisions Made

1. [Decision]: [Why and implications]
2. [Decision]: [Why and implications]

### Blockers Encountered

- [Blocker]: [Status and workaround if any]

### Gotchas Discovered

- [Gotcha]: [How to handle]

### Open Questions

- [ ] [Question requiring user input]
- [ ] [Question requiring research]

## Resumption Instructions

### Quick Resume

```bash
cd [repo path]
git checkout [branch]
# Read .specify/specs/[feature]/session-checkpoint.md
# Continue with /5_gofer_implement or the stage recorded in the checkpoint
```

### Manual Resume Steps

1. Read this checkpoint file
2. Check `tasks.md` for current task
3. Review `plan.md` for architecture context
4. Continue with `/5_gofer_implement`

### Context to Load First

1. `{FEATURE_DIR}/tasks.md` - Current task list
2. `{FEATURE_DIR}/plan.md` - Architecture decisions
3. `[Current file being edited]` - Continue from here

## Test Status

- [ ] Build passes: `npm run build`
- [ ] Tests pass: `npm test`
- [ ] Lint passes: `npm run lint`

## Notes

[Any additional context that would help future you or another agent]

````

---

## Step 4: Update Tasks.md

Add checkpoint marker to tasks.md:

```markdown
## Checkpoint: [ISO timestamp]

Progress saved at task [TaskID]. Resume by reading
`session-checkpoint.md` in a fresh session and continuing from the recorded
stage.
````

---

## Step 5: Present Summary

```
================================================================
  SESSION SAVED: [Feature Name]
================================================================

  Branch: [branch name]
  Stage: [pipeline stage]
  Tasks: [X]/[Total] complete

  Checkpoint: {FEATURE_DIR}/session-checkpoint.md

  Code Status:
  - Committed: [X] files
  - Uncommitted: [Y] files (documented)
  - Tests: [passing/failing/not run]

  To resume:
  Read {FEATURE_DIR}/session-checkpoint.md in a fresh session

  Or manually:
  cd [repo] && git checkout [branch]
  Read: {FEATURE_DIR}/session-checkpoint.md
  Continue: /5_gofer_implement

================================================================
```

---

## Step 6: Observability Logging

```bash
.specify/scripts/bash/log-stage.sh 7_save --complete --tokens [N] --compactions [N]
```

---

## Best Practices for Checkpoints

### Always Capture

- Exact file and line number being edited
- Why you stopped (not just what you were doing)
- Any mental model or context not in artifacts
- Test status at time of save

### Machine-Readable State

The YAML frontmatter allows automated tools to:

- Detect where to resume
- Calculate time between sessions
- Track feature velocity

### Human-Readable Context

The markdown body ensures:

- Any agent (or human) can understand the state
- No context is lost between sessions
- Resumption is fast and accurate

---

## Context Management Best Practices (2025-2026 Research)

### What to Preserve (High Value)

- **Key decisions and rationale** - These are hard to reconstruct
- **Blockers and workarounds** - Prevent repeated dead ends
- **Exact file:line being edited** - Enables precise resumption
- **Mental model context** - Insights not captured in artifacts

### What to Summarize (Medium Value)

- Tool outputs and exploration results
- Code snippets that are in committed files
- Error messages (keep only the key ones)

### What to Omit (Low Value / High Cost)

- Full file contents (can be re-read)
- Repetitive conversation history
- Superseded attempts or dead ends
- Verbose tool outputs

### Handoff Size Target

Aim for session-checkpoint.md to be:

- **< 2,000 tokens** for critical information
- **< 5,000 tokens** total including context

This ensures the resume session starts with clean context.

---

## Integration

This command works with:

- `/5_gofer_implement` - Can resume implementation
- `/6_gofer_validate` - Can validate partial progress
- `/0_gofer_start` - Detects saved sessions
- `check-context-health.sh` - Triggers save at thresholds

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