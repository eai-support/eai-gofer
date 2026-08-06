# EAI Gofer - Specification Directory

This folder contains all project specifications for AI-driven feature
development.

## Structure

- **memory/** - Constitution, decisions, and project principles
- **specs/** - Feature specifications (numbered: 001-feature-name/)
- **templates/** - Templates for specs, plans, and tasks
- **scripts/** - Helper scripts for workflow automation
- **logs/** - Execution logs (council usage, etc.)

## Quick Start

### Using VSCode Extension

1. Open Command Palette (`Cmd/Ctrl+Shift+P`)
2. Run: **"Gofer: Create New Specification"**
3. Follow the prompts to create your feature spec

### Using Your AI Coding App

Run the unified EAI Gofer pipeline with a single command:

```
/eai Add user authentication with OAuth2 and JWT
```

Use `/eai` again for every follow-up statement. Gofer automatically routes
through the right internal stage:

1. **Gofer Start** → Frames the business problem and kickoff
2. **Research** → Explores codebase, platform, and technology
3. **Specify** → Creates spec.md from requirements
4. **Plan** → Generates architecture and design
5. **Tasks** → Breaks down into executable tasks
6. **Implement** → Executes tasks phase by phase
7. **Validate** → Verifies against spec, goals, loops, and constitution

## Unified EAI Gofer Pipeline

| Internal stage | Output                                      |
| -------------- | ------------------------------------------- |
| Gofer Start    | Full pipeline kickoff                       |
| Research       | research.md                                 |
| Specify        | spec.md                                     |
| Plan           | plan.md, data-model.md, contracts/          |
| Tasks          | tasks.md, traceability.md, issues.md        |
| Implement      | Source code and documentation changes       |
| Validate       | validation-report.md and final review gates |

Numbered command files in `.specify/commands/` are internal contracts. Users
should keep using `/eai ...`; Gofer decides which contract to run.

All artifacts are stored in: `.specify/specs/{feature}/`

Each feature should include a bounded loop contract:

- `loop-contract.json` - trigger policy, max cycles, stop conditions, and change
  budget.
- `loop-ledger.jsonl` - append-only record of stage re-loops.
- `goal-ledger.json` - business goals, metrics, owners, and drift triggers.
- `loop-audit-report.md` - strict validation audit from the internal validation
  contract.

Each feature should also keep a running stakeholder review pack:

- `working-backwards-prfaq.md` - product release PR/FAQ that starts as a
  launch-day fiction and becomes evidence-backed across stages.
- `prfaq-history/` - immutable stage snapshots of the PR/FAQ.
- `business-owner-summary.md` - business scenario, process, value case, success
  metrics, and assumptions.
- `cto-architecture-summary.md` - EAI Platform/Azure architecture, auth,
  tenancy, data, integration, and platform-fit evidence.
- `ciso-security-summary.md` - security posture, controls, residual risks, and
  validation evidence.
- `stakeholder-review-index.md` - what is ready for review and who must approve,
  revise, or defer.

## Constitution

Define your project principles in `memory/constitution.md`:

- Coding standards and patterns
- Technology choices
- Security requirements
- Testing policies

AI agents validate code against the constitution before implementation.

## Learn More

- **Full Documentation**: https://github.com/eai-support/eai-gofer
- **AI Agent Guidelines**: See AGENTS.md in your project root
- **EAI Gofer Extension**: View specs and progress in VSCode sidebar
