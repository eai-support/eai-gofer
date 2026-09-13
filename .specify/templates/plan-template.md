# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from
`.specify/specs/[###-feature-name]/spec.md` and its required companion
`test-spec.md` for every app or feature, including non-app, tooling and
documentation-only specifications. Map documentation-only ACs to document
checks; do not invent runtime features or tests.

**Note**: This template is filled in by `/3_gofer_plan` (or legacy
`/3_gofer_plan`). Recommended: Use `/0_gofer_start` to auto-chain the entire
pipeline.

## Executive Summary

[Three to five plain-language bullets covering what will be built, the chosen
architecture, why it fits EAI Platform/Azure, the largest delivery risk, and the
next decision or validation gate.]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS
CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**App Stack Policy**: [For app delivery: EAI Platform including app template
first, Azure second, all other technology only as an approved exception]  
**Project Type**: [single/web/mobile - determines source structure]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps
or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory,
offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS
CLARIFICATION] **Brand Profile**: [`.specify/memory/brand-profile.json` path,
`/8_gofer_branding` needed, or N/A]

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

[Gates determined based on constitution file]

## Project Structure

### Documentation (this feature)

```text
.specify/specs/[###-feature]/
├── goal-ledger.json      # Machine-readable goals, metrics, and re-loop triggers
├── spec.md              # Feature specification (/2_gofer_specify)
├── test-spec.md         # Required for every feature: AC -> outcomes -> tests/checks
├── research.md          # Codebase research (/1_gofer_research)
├── journeys/
│   └── base-journey.md  # AI-augmented app journey when app delivery applies
├── build-map.md         # Plain-language picture of the build and current status
├── ui-preview-brief.md  # App-delivery preview brief when app delivery applies
├── ui-review-log.md     # App-delivery preview evidence and iteration log
├── ui-show-and-tell.md  # App-delivery show-and-tell and user feedback record
├── service-fit-matrix.md # App-delivery capability selection evidence
├── plan.md              # This file (/3_gofer_plan)
├── data-model.md        # Data model design (/3_gofer_plan)
├── quickstart.md        # Quick start guide (/3_gofer_plan)
├── contracts/           # API contracts (/3_gofer_plan)
├── tasks.md             # Task breakdown (/4_gofer_tasks)
├── traceability.md      # Spec -> task -> code -> test coverage (/4,/6)
├── validation-report.md # Objective/rubric quality gate (/6_gofer_validate)
├── goal-rebaseline-report.md # Closed-loop drift report (/6 or CI)
└── issues.md            # GitHub issues (/4_gofer_tasks)
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
└── src/
    ├── models/
    ├── services/
    └── api/

frontend/
└── src/
    ├── components/
    ├── pages/
    └── services/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

### Required Test Layout And Collection Plan

Keep customer tests in the customer repo, using the same repo-relative family
paths below. Choose the families needed for the accepted behavior; do not create
every family or put all tests into PublicAPI black-box folders.

| Test family                          | Common repo-relative collection path                                             | Format to declare against the installed runner                |
| ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Backend unit                         | `tests/suite/unit/backend/`                                                      | [e.g. pytest `test_*.py`]                                     |
| Frontend unit/component              | `tests/suite/unit/frontend/`                                                     | [e.g. Vitest `*.test.ts` / `*.test.tsx`]                      |
| Integration with controlled fixtures | `tests/suite/integration/`                                                       | [runner and file pattern]                                     |
| API contract                         | `tests/suite/contracts/api/`                                                     | [runner and file pattern]                                     |
| App/browser end-to-end               | `tests/suite/e2e/`                                                               | [e.g. Playwright `*.spec.ts`]                                 |
| Performance                          | `tests/suite/performance/`                                                       | [runner, file pattern and measurement budget]                 |
| Node helper unit                     | `tests/helpers/*.test.ts`                                                        | [Node test runner and TypeScript loader]                      |
| Deployed smoke/contract              | `tests/cross-service/{smoke,contracts}/<surface>/`                               | [runner and file pattern; choose smoke or contracts]          |
| Direct deployed PublicAPI lifecycle  | `tests/cross-service/contracts/publicapi-blackbox/<domain>/<run>/<name>.spec.ts` | [Playwright-compatible TypeScript or explicit runner adapter] |

Paths are an authoring convention, not proof of runner discovery. Existing
customer runners, including mobile/native runners, need an explicit adapter or
migration plan with source paths, target collection, owner and verification
commands and a prerequisite task before claiming collection. All new executable
tests must use the owning repo's `tests/` target family paths above; a legacy
runner is not an exception. The adapter must collect those paths. Preserve
existing coverage during migration. Customer checks must run without private EAI
repos. Never transfer customer tests to `eai-testing-dev` to satisfy this
layout.

### Requirement-To-Test Execution Plan

Carry stable AC/test IDs and expected outcomes from `test-spec.md`. Resolve each
command from the owning repo's installed runner/configuration; placeholders are
unready planning inputs, never commands claimed as verified.

| AC / test IDs      | Expected outcome / exact test paths         | Group / runner and format           | Collection command / exact case IDs / source revision                     | Execution command / CI check / evidence path   |
| ------------------ | ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| [AC-001 / TST-001] | [observable assertion / repo-relative file] | [stable group / runner and pattern] | [exact command / named runner case IDs / exact source and test revisions] | [exact command / check name / result artifact] |

Collection proof maps exact named runner case IDs to stable test IDs and the
exact source/test revision. Compare expected and actual case identities for the
declared collection scope. Counts are supplemental: equal counts with different
cases fail verification. Record future proof as pending in planning-only work.

| Selected group | Environment / region             | Prerequisites and resource claims                 | Worker/lane cap and timeout | Enablement wave / stop criteria                      |
| -------------- | -------------------------------- | ------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| [group ID]     | [local or approved target cells] | [fixtures/auth/provider limits; exclusive claims] | [bounded values]            | [reviewed pilot scope and evidence needed to expand] |

Parallel execution is a required capability. Plan tasks to configure bounded
parallel groups and prove overlapping start/end times for an independent pair,
worker/lane identity, fixture/claim isolation and complete cleanup. Add a check
that conflicting groups serialize. A `[P]` label or two sequential passes is not
parallel evidence. Safe serial fallback leaves this capability unverified.

Select the full affected dependency closure, deduplicate tests, and enable only
reviewed groups gradually. Run independent selected groups in parallel within
runner capacity and enforced resource claims. Keep dependent lifecycle phases
and shared/conflicting fixtures serial. If isolation or claim enforcement is
unproven, stay serial. Folder separation alone does not establish independence.

Record `planned`, `written`, `collected`, `enabled`, `selected` and `executed`
separately for each required group. Retain baseline coverage until replacement
parity is proved. A disabled or uncollected required test is an evidence gap,
even when enabled pilots pass. Record verdict, source/run identity, cleanup and
timing for executed checks; compare speed only on equivalent coverage and work.

During authorized implementation of feature behavior, tasks must create/update
executable tests, verify discovery, execute required selected checks and record
actual outcomes. Documentation-only scope uses its specified document checks.
During specification/plan-only work, produce the companion Markdown test plan
and leave those runtime tasks unexecuted. Planning approval is not test
evidence.

QProcess handoff does not make companion test specifications optional.
Documentation-only delivery runs its specified document checks without creating
runtime behavior. After bounded review retries, unresolved blocking or
required-stage test gaps stop implementation progression. Planning-only artifact
approval cannot override them or supply missing evidence. Only truly advisory
findings may have an explicit scoped waiver; no waiver turns a required gate
green.

### Scope Ownership And Platform Handoff

Gofer primarily owns customer app delivery. App Issues/PRs, tests and evidence
stay in that customer repository. SDK/API consumption alone requires no internal
Issues2025, SRP, Infra2025 or `eai-testing-dev` access or changes.

Route actual internal platform work to QProcess. Its owners group affected
multi-repo Issues, companion PRs, harness/Infra changes and SRP evidence as
applicable, with platform specs under `.specify-pro/`. Record the published API
dependency and handoff status in the app plan, without copying private internal
delivery records into customer artifacts. Use a reasoned no-platform-change
decision when no platform change is needed.

| Scope / AC IDs | Owning repo and reviewer | Required tests / local Issue or PR | Platform handoff or no-change rationale                |
| -------------- | ------------------------ | ---------------------------------- | ------------------------------------------------------ |
| [app scope]    | [customer repo / owner]  | [paths, check names, local links]  | [published API contract / handoff status or rationale] |

## AI-Augmented App Journey

For application delivery, the plan must preserve the four-step-or-fewer
AI-augmented journey from `journeys/base-journey.md`. For non-app work, state
why no app journey is required.

| Step | Business Goal | AI Assistance | Architecture Implication | Validation |
| ---- | ------------- | ------------- | ------------------------ | ---------- |
| 1    | [goal]        | [assist]      | [component/API/data]     | [test]     |
| 2    | [goal]        | [assist]      | [component/API/data]     | [test]     |
| 3    | [goal]        | [assist]      | [component/API/data]     | [test]     |
| 4    | [goal]        | [assist]      | [component/API/data]     | [test]     |

## Branded Deliverables Plan

For stakeholder-facing app delivery, describe how approved brand choices affect
documents, diagrams, decks, UI preview notes, headers, footers, confidentiality
labels, and logo usage. If `/8_gofer_branding` has not run and branding matters,
add it as a prerequisite before `/7a_stakeholder_comms`.

## Visual Documentation Plan

Use visuals to explain the plan, not to decorate it. Prefer Mermaid for
Markdown-native diagrams, Marp for stakeholder slide decks, D2 for compact
process/system sketches when Mermaid becomes noisy, and Structurizr/C4 when the
architecture needs model-as-code consistency.

| Visual             | Tool / format                | Audience               | Question answered                      | Evidence                      |
| ------------------ | ---------------------------- | ---------------------- | -------------------------------------- | ----------------------------- |
| Context boundary   | Mermaid C4 or Structurizr/C4 | CTO / delivery         | What is inside and outside the system? | `visuals/c4-context.md`       |
| Runtime containers | Mermaid C4 or Structurizr/C4 | CTO / engineers        | What deployable parts exist?           | `visuals/c4-container.md`     |
| User/process flow  | Mermaid sequence/state or D2 | Business / delivery    | What happens in what order?            | [path]                        |
| Stakeholder slides | Marp                         | Executives / reviewers | What is the simple review story?       | `presentation.marp.md` or N/A |

## UI Preview And Service-Fit Gate

For application delivery, the plan must lock the preview/show-and-tell loop and
service selection before downstream implementation is treated as complete. For
non-app work, state why this review is not applicable.

| Review Area       | Required Artifact                              | Validation                                                                                               |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Preview scope     | `ui-preview-brief.md`                          | [how the MVP preview scope is defined]                                                                   |
| Platform describe | `eai --describe`                               | [CLI version, tenant/platform capability notes, package lane]                                            |
| Block catalog     | `eai blocks list` / `eai blocks describe <id>` | [selected IDs, Storybook story IDs, theme override points, coupling status, and custom-block exceptions] |
| Resource bindings | `eai resources schema`                         | [object fields/actions/events feeding selected blocks]                                                   |
| Preview evidence  | `ui-review-log.md`                             | [screenshot, local render, or Playwright-style proof]                                                    |
| UI show-and-tell  | `ui-show-and-tell.md`                          | [what was shown, where it opened, user feedback, accepted revisions, and open UX issues]                 |
| Service fit       | `service-fit-matrix.md`                        | [how accessible vs purchasable vs unavailable is proved]                                                 |

## AI-Readable Blocks Bridge

| Workstream                 | Required Decision                                            | Plan Reference                            |
| -------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Package profile            | [external / internal / hybrid]                               | [where tasks will enforce profile choice] |
| Package lane               | [public package / internal app / hybrid adapter / app-local] | [package/export path]                     |
| Block porting              | [reuse / port / custom-block exception]                      | [block IDs and story IDs]                 |
| source-platform decoupling | [coupled / decoupled / adapter boundary]                     | [eai resources schema or adapter path]    |
| Public-readiness           | [required / deferred / not applicable]                       | [consumer-facing checks]                  |

## Dual-State Delivery Discipline

Track capabilities that move from mock-safe behavior to hybrid or live
integration. This table should match `goal-ledger.json`.

| Capability | Current State (mock/hybrid/live) | Target State | Promotion Criteria | Validation Owner |
| ---------- | -------------------------------- | ------------ | ------------------ | ---------------- |
| [name]     | [mock]                           | [live]       | [evidence]         | [owner]          |

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |

## EnterpriseAI Profile Metadata

> Populated by default for EnterpriseAI runs. Standard-profile runs leave this
> section empty only when the user explicitly opts out.

- **EAI CLI Version Pin**: `[major.minor, e.g. 2.0]` — the installed `eai`
  version is recorded here at plan generation time. Deployment tasks reference
  this pin to prevent drift between local and CI environments.
- **EAI App Template Reference**: `[eai-app-template tag or SHA]`
- **Deployment Repo Reference**: `[deployment-repo tag or SHA]`
- **Package Profile Choice**: `[external | internal | hybrid]`
- **Package Lane**:
  `[public-package | internal-app | hybrid-adapter | app-local]`
- **Coupling Status**:
  `[source-platform-coupled | source-platform-decoupled | hybrid-adapter]`
- **Public-Readiness Target**: `[required | deferred | not-applicable]`
