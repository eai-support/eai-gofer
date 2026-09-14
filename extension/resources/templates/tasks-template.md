---
description: 'Task list template for feature implementation'
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `.specify/specs/[###-feature-name]/`

**Prerequisites**: plan.md and spec.md (required), companion test-spec.md beside
spec.md (required for every app or feature specification), research.md,
goal-ledger.json, data-model.md, contracts/

**Note**: This template is filled in by `/4_gofer_tasks` (or legacy
`/4_gofer_tasks`). Recommended: Use `/0_gofer_start` to auto-chain the entire
pipeline.

> **EAI CLI Version Pin** (enterpriseai profile only): deployment tasks in this
> list inherit the `major.minor` pin recorded in `plan.md` so builds in CI and
> on developer machines use the same `eai` toolchain. Standard-profile runs
> ignore this section.

**Tests**: Executable tests for accepted feature behavior are mandatory during
authorized implementation. Every created or updated app or feature
specification, including non-app, tooling and documentation-only work, must have
`.specify/specs/[###-feature-name]/test-spec.md` beside `spec.md`, with stable
AC IDs, expected outcomes, exact test paths, format, collections and check
commands. Update it with each scope change. In specification/plan-only mode,
produce Markdown plans and leave runtime tasks open; do not create runtime tests
or claim implemented, collected or passing tests. Documentation-only ACs map to
document checks without inventing runtime features or tests. A QProcess handoff
preserves the required test-specification obligation.

**Priority protection**: Maintain `priority-plan.json` from its template. Record
the latest approved direction in `decisions.md`, the ordered critical path,
dependencies and `allowedEditScope` per task. Place the first outcome proof
after its minimum runtime prerequisites. Record approval for independent
parallel work. Use `.specify/references/priority-outcome-protection.md`; retain
all later release checks and do not add future auth or deployment requirements
to local MVP work.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Scope And Ownership

Gofer primarily delivers customer apps. Keep customer tests, Issues/PRs and
evidence in the owning customer repo. Never copy or push app tests to
`eai-testing-dev`. Using EAI SDKs or published APIs creates no dependency on
private repos, internal Issues2025, SRP or Infra2025.

Route actual internal platform changes to QProcess and its `.specify-pro/`
specifications. The internal owners group affected multi-repo Issue/PR/SRP,
harness and Infra work only when needed. Record the public contract and handoff
status in the app tasks; do not export private platform records. A reviewed
no-platform-change rationale is sufficient when app code alone meets the spec.

## Required Requirement-To-Test Tasks

Map every in-scope AC before implementation. Keep IDs stable across spec
updates. Assign explicit tasks to write/update tests, configure collection, run
selected checks and record outcomes. Reusing a test requires proof that it
covers the current outcome at the current source; naming an existing file is
insufficient.

| AC / test ID / expected outcome           | Owner repo / test path / format                | Collection or group | Collection command / exact case IDs / source revision                                      | Execution command / CI check | Write / collection / execution task IDs |
| ----------------------------------------- | ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------- |
| [AC-001 / TST-001 / observable assertion] | [owning repo / canonical path / runner format] | [stable group]      | [exact installed-runner command / named runner case IDs / exact source and test revisions] | [exact command / check name] | [task IDs]                              |

Collection proof maps exact named runner case IDs to stable test IDs and the
exact source/test revision. Compare expected and actual case identities for the
declared collection scope. Counts are supplemental: equal counts with different
cases fail verification.

Track `planned`, `written`, `collected`, `enabled`, `selected` and `executed`
separately, with source/run identity and verdict for execution. Planning is not
execution. Disabled, uncollected or unexecuted required cases cannot count as
passed; missing required evidence keeps implementation completion open.

After bounded review retries, unresolved blocking or required-stage test gaps
fail closed and stop implementation progression. Human planning-only artifact
approval does not change the blocked verdict or provide missing evidence.
Explicit scoped waivers apply only to truly advisory findings; they cannot turn
a required gate green.

## App-Delivery Preconditions

When the feature is classified as application delivery, tasks must preserve the
shared numbered stages **and** enforce these prerequisites before downstream
implementation:

- `goal-ledger.json` exists and records goals, metrics, delivery states, and
  re-loop triggers
- `ui-show-and-tell.md` exists and records what was shown to the user, where it
  opened, feedback received, and unresolved UX issues
- `service-fit-matrix.md` exists and distinguishes accessible now, purchasable,
  and unavailable platform capabilities
- normal build tasks use the EAI app template, EAI platform services, and
  Azure-compatible support services before any custom or third-party app
  substrate
- preview work stays inside selected EAI App Template blocks unless an exception
  task is recorded
- package lane, coupling status, Storybook story IDs, theme override points,
  custom-block exceptions, and external/internal/hybrid profile choice are
  recorded before UI implementation tasks begin

External and hybrid profiles must include first-class public-readiness,
block-porting, and source-platform decoupling tasks before user-story
implementation.

For explicit non-app work, mark this section "Not applicable" and continue with
the shared stages without app-only show-and-tell/service-fit prerequisites.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Independent selected task; different files, no unmet dependencies,
  nonconflicting resource claims and bounded runner/team capacity
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Source examples assume a single project; use the actual source layout from
  plan.md. All new executable tests stay in the owning repo's `tests/` target
  family, even when source code or legacy tests use another layout.

| Family                              | Canonical repo-relative target                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Backend unit                        | `tests/suite/unit/backend/`                                                      |
| Frontend unit/component             | `tests/suite/unit/frontend/`                                                     |
| Integration                         | `tests/suite/integration/`                                                       |
| API contract                        | `tests/suite/contracts/api/`                                                     |
| App/browser end-to-end              | `tests/suite/e2e/`                                                               |
| Performance                         | `tests/suite/performance/`                                                       |
| Node helper unit                    | `tests/helpers/*.test.ts`                                                        |
| Deployed smoke/contract             | `tests/cross-service/{smoke,contracts}/<surface>/`                               |
| Direct deployed PublicAPI lifecycle | `tests/cross-service/contracts/publicapi-blackbox/<domain>/<run>/<name>.spec.ts` |

Choose the family that tests the requirement; do not put every test in black-box
folders. Declare the installed runner and filename format for each collection.
If discovery does not support these paths, add an explicit adapter/migration
task before collection or completion credit. A legacy runner is not permission
to put new tests elsewhere. No private EAI repo is required to run app checks.

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.

  The /4_gofer_tasks command (or legacy /4_gofer_tasks) MUST replace these
  with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/

  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize [language] project with [framework] dependencies
- [ ] T003 [P] Configure linting and formatting tools
- [ ] T004 Reconcile spec.md and companion test-spec.md: stable AC/test IDs,
      expected outcomes, owned test paths, formats, exact runner case IDs,
      source/test revision and exact check commands
- [ ] T005 Configure collection for target family paths; implement the planned
      adapter/migration when discovery is unsupported; prove the exact case
      identities at the recorded source/test revision before claiming collection

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can
be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T006 Setup database schema and migrations framework
- [ ] T007 [P] Implement authentication/authorization framework
- [ ] T008 [P] Setup API routing and middleware structure
- [ ] T009 Create base models/entities that all stories depend on
- [ ] T010 Configure error handling and logging infrastructure
- [ ] T011 Setup environment configuration management
- [ ] T012 Lock external/internal/hybrid package profile and package lane from
      `ui-preview-brief.md`
- [ ] T013 Run `eai --describe`, `eai blocks list`, `eai blocks describe <id>`,
      and `eai resources schema`; record block IDs, resource bindings, coupling
      status, Storybook story IDs, theme override points, and custom-block
      exceptions
- [ ] T014 Update `goal-ledger.json` with planned requirement, task, code, and
      test links plus any new delivery-state promotion criteria
- [ ] T015 Add block-porting, source-platform decoupling, and public-readiness
      work for external or hybrid package lanes

**Checkpoint**: Foundation ready - authorized independent story tasks may begin
within the declared dependency, resource-claim and concurrency limits.

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Required Tests for User Story 1

> During authorized implementation, write failing regression tests first for new
> or changed behavior. Existing covered behavior must retain passing assertions.

- [ ] T016 [P] [US1] Add AC-linked backend unit tests for [rule] in
      `tests/suite/unit/backend/test_[name].py`
- [ ] T017 [P] [US1] Add AC-linked API contract tests for [endpoint] in
      `tests/suite/contracts/api/test_[name].py`
- [ ] T018 [P] [US1] Add AC-linked integration tests for [user journey] in
      `tests/suite/integration/test_[name].py`

### Implementation for User Story 1

- [ ] T019 [P] [US1] Create [Entity1] model in src/models/[entity1].py
- [ ] T020 [P] [US1] Create [Entity2] model in src/models/[entity2].py
- [ ] T021 [US1] Implement [Service] in src/services/[service].py (depends on
      T019, T020)
- [ ] T022 [US1] Implement [endpoint/feature] in src/[location]/[file].py
- [ ] T023 [US1] Add validation and error handling
- [ ] T024 [US1] Add logging for user story 1 operations
- [ ] T025 [US1] Verify exact test collection, enable/select required groups,
      run declared checks and record AC outcomes and execution evidence

**Checkpoint**: US1 is complete only when its required AC-linked checks execute
and pass. A plan, discovered file or disabled required test is not a pass.

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Required Tests for User Story 2

- [ ] T026 [P] [US2] Add AC-linked frontend component tests in
      `tests/suite/unit/frontend/[name].test.tsx`
- [ ] T027 [P] [US2] Add AC-linked integration tests for [user journey] in
      `tests/suite/integration/test_[name].py`

### Implementation for User Story 2

- [ ] T028 [P] [US2] Create [Entity] model in src/models/[entity].py
- [ ] T029 [US2] Implement [Service] in src/services/[service].py
- [ ] T030 [US2] Implement [endpoint/feature] in src/[location]/[file].py
- [ ] T031 [US2] Integrate with User Story 1 components (if needed)
- [ ] T032 [US2] Verify collection and required selected checks; record current
      AC outcomes, cleanup and unchanged US1 regression evidence

**Checkpoint**: US1 and US2 work independently with passing required evidence
for their current scope; unresolved required checks remain open.

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Required Tests for User Story 3

- [ ] T033 [P] [US3] Add AC-linked API contract tests for [endpoint] in
      `tests/suite/contracts/api/test_[name].py`
- [ ] T034 [P] [US3] Add AC-linked browser journey tests in
      `tests/suite/e2e/[name].spec.ts`

### Implementation for User Story 3

- [ ] T035 [P] [US3] Create [Entity] model in src/models/[entity].py
- [ ] T036 [US3] Implement [Service] in src/services/[service].py
- [ ] T037 [US3] Implement [endpoint/feature] in src/[location]/[file].py
- [ ] T038 [US3] Verify collection and required selected checks; record current
      AC outcomes and dependency regression evidence

**Checkpoint**: Every implemented story has passing required AC-linked evidence;
deferred stories and their unexecuted tests remain explicitly planned.

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in docs/
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization across all stories
- [ ] TXXX [P] Add required cross-cutting regression tests in
      `tests/suite/unit/backend/` or `tests/suite/unit/frontend/`, selected by
      scope
- [ ] TXXX Security hardening
- [ ] TXXX Run quickstart.md validation
- [ ] TXXX Reconcile all ACs against test-spec.md and actual collected, enabled,
      selected and executed checks; report required evidence gaps before
      completion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user
  stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - Independent selected stories can proceed in parallel within bounded capacity
    and nonconflicting claims
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No
  dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate
  with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate
  with US1/US2 but should be independently testable

### Within Each User Story

- Reference the supporting goal IDs, requirement IDs, and planned code/test
  files in `traceability.md`
- Keep `goal-ledger.json` current whenever a task changes the target metric,
  owner, delivery state, or re-loop trigger

- Write executable tests first for new/changed behavior during authorized
  implementation; verify expected failures before the fix and passing outcomes
  after it. Preserve already passing tests for unchanged behavior.
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Required Parallel Capability And Selective Enablement

Parallel execution of independent selected groups is required. Add explicit
implementation and verification tasks for bounded lanes, overlap timestamps,
worker/lane identity, fixture/claim isolation and conflict serialization. Verify
an independent pair with equal assertions and complete cleanup; `[P]` labels
alone do not prove this capability. Serial fallback is safe but leaves the
parallel requirement unverified. Plan-only work records these tasks unexecuted.

- Select required groups from the affected dependency closure, not the full
  suite by default. Keep broader scheduled/manual coverage distinct from pilot
  evidence.
- Enable reviewed groups gradually for their declared environment/region.
  Passing pilots do not compensate for disabled required groups without mapped
  baseline coverage that satisfies the same acceptance obligations.
- Only independent selected [P] tasks/groups may run in parallel. Record lane
  and worker caps, fixture/auth/provider limits, claims, timeouts and cleanup
  duties.
- Keep dependent CRUD phases and conflicting tenant/principal/resource mutations
  serial. Use serial execution until isolation and claim enforcement are proven.
- Retain the first product failure and cleanup result; a passing diagnostic
  retry does not erase failed evidence. Compare speed on equivalent assertions
  and work.

---

## Parallel Example: User Story 1

```text
# During authorized implementation, select independent US1 groups within limits:
Task: "Contract test for [endpoint] in tests/suite/contracts/api/test_[name].py"
Task: "Integration test for [user journey] in tests/suite/integration/test_[name].py"

# Launch all models for User Story 1 together:
Task: "Create [Entity1] model in src/models/[entity1].py"
Task: "Create [Entity2] model in src/models/[entity2].py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = independent selected work within dependency, claim and capacity
  limits
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify expected regression failures before implementing new/changed behavior
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break
  independence
