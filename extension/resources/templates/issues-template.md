---
description: 'GitHub issues template - ready to convert to actual GitHub issues'
---

# GitHub Issues: [FEATURE NAME]

**Generated from**: tasks.md **Feature ID**: [###-feature-name] **Total
Issues**: [COUNT]

This file contains proposed issue definitions for the owning customer repo.
Gofer primarily delivers customer apps; use that repo's Issue/PR conventions and
owners. Writing this Markdown does not publish issues or prove implementation.

Each app or feature specification created or updated through Gofer, including
non-app, tooling and documentation-only work, must have a companion
`test-spec.md` beside `spec.md` under `.specify/specs/[###-feature-name]/`. Link
both documents and carry their stable AC/test IDs into each issue. Executable
tests are required during authorized implementation, even when the request did
not mention tests. Specification/plan-only work records planned tests and open
runtime tasks. Documentation-only ACs map to document checks without inventing
runtime features or tests. Internal platform handoff to QProcess preserves
test-spec obligations.

Customer tests stay in the customer repo. Do not copy/push them to
`eai-testing-dev` or require private EAI repositories for app checks. EAI
SDK/API consumption alone does not require Issues2025, SRP or Infra2025 work.
Actual platform-impact changes go to QProcess, with platform specs under
`.specify-pro/` and the affected internal multi-repo Issue/PR/SRP bundle. Keep
customer-facing scope at published API contracts; internal owners retain private
delivery records.

---

## Issue #1: [Task ID] - [Task Title]

**Labels**: `enhancement`, `phase-1-setup`, `[story-label]` **Assignees**:
[@owner-in-customer-repo] **Title**: [Feature]: [Task Description]

**Owning repository**: [customer repository] **Spec / companion test spec**:
[repo-relative spec.md / test-spec.md links] **Scope mode**:
[specification/plan-only | authorized implementation]

### Screen Or Behavior

[Description of the UI/functionality this task creates or modifies. If
backend-only, describe the API/service behavior.]

### Business Rationale

**Problem**: [What problem does this task solve?]

**Value**: [What value does completing this task provide?]

**Impact**: [How does this contribute to the overall feature goal?]

**Priority**: [P1/P2/P3] - [Reason for priority level]

### Fields Required

| Field        | Type                        | Source                      | Validation         |
| ------------ | --------------------------- | --------------------------- | ------------------ |
| [field-name] | [string/number/boolean/etc] | [where the data comes from] | [validation rules] |

[If no fields: "N/A - This is a backend/infrastructure task"]

### Acceptance Criteria

- [ ] **AC-001**: [Stable ID from spec; exact observable success outcome]
- [ ] **AC-002**: [Stable ID from spec; relevant error/denial and unchanged
      state]
- [ ] [Further stable AC IDs and expected outcomes within this issue's scope]

### Required Test Specification And Checks

Map every in-scope AC to its companion test specification. Do not replace stable
IDs when descriptions change. All new executable tests belong under the owning
repo's `tests/` in the appropriate family:

- `tests/suite/unit/backend/` or `tests/suite/unit/frontend/` for unit/component
  tests.
- `tests/suite/integration/`, `tests/suite/contracts/api/`, `tests/suite/e2e/`
  or `tests/suite/performance/` for the corresponding family.
- `tests/helpers/*.test.ts` for Node helper unit tests.
- `tests/cross-service/{smoke,contracts}/<surface>/` for deployed checks.
- `tests/cross-service/contracts/publicapi-blackbox/<domain>/<run>/<name>.spec.ts`
  only for direct deployed PublicAPI lifecycle tests, not every app test.

These are repo-relative paths within the customer repo, not locations in a
private test repository. Declare the actual runner and file format. Unsupported
discovery requires an explicit adapter/migration task before collection credit;
legacy paths do not exempt new tests from the target family layout.

| AC / test ID       | Expected outcome / fixture and cleanup   | Repo-relative test path / format           | Collection or group | Collection command / exact case IDs / source revision                     | Execution command / CI check | Required task IDs                            |
| ------------------ | ---------------------------------------- | ------------------------------------------ | ------------------- | ------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| [AC-001 / TST-001] | [exact result and independent assertion] | [canonical path / installed runner format] | [stable group]      | [exact command / named runner case IDs / exact source and test revisions] | [exact command / check name] | [write, adapter if needed, collect, execute] |

Collection proof maps exact named runner case IDs to stable test IDs and the
exact source/test revision. Compare expected and actual case identities for the
declared collection scope. Counts are supplemental: equal counts with different
cases fail verification. Planning-only issues record this evidence as pending.

Resolve command names from the customer repo's installed tooling. Record
`planned`, `written`, `collected`, `enabled`, `selected` and `executed`
separately, with source/run identity, verdict and evidence path. A folder, a
generated issue, or an unrelated green run does not prove completion. Disabled
required tests cannot count as passed.

Unresolved blocking or required-stage test gaps fail closed after bounded review
retries and stop implementation progression. Human planning-only artifact
approval does not change that verdict or replace missing evidence. Explicit
scoped waivers are limited to truly advisory findings and cannot turn a required
gate green.

**Required parallel capability**: Assign implementation and verification tasks
for overlapping execution of an independent selected pair, bounded lanes,
fixture/claim isolation, cleanup and serialization of conflicts. Require timing
and worker/lane evidence; `[P]` labels are not proof. Serial fallback leaves the
parallel requirement unverified. Planning-only issues record the proof needed.

**Selection and rollout**: [affected dependency closure, reviewed pilot groups,
environment/region, enablement owner, worker/lane cap, resource claims,
timeouts, cleanup and stop criteria]. Run independent selected groups in
parallel only with proven isolation and enforced bounds. Keep
dependent/conflicting groups serial. Expand gradually; missing required coverage
remains a gap unless mapped baseline evidence satisfies the same obligation.

### Scope Ownership And Companion PRs

| Scope / AC IDs | Owner and repository  | Issue / companion PR(s)                    | Required tests / evidence | Dependency or no-platform-change rationale  |
| -------------- | --------------------- | ------------------------------------------ | ------------------------- | ------------------------------------------- |
| [customer app] | [customer owner/repo] | [local links, including merged companions] | [test IDs/checks]         | [public API dependency or no change needed] |

Record multiple companion PRs separately and verify source inclusion when making
delivery claims. Only actual platform-impact work needs the QProcess handoff;
its internal owners reconcile affected source, harness, Infra and SRP scope. Do
not turn that handoff into a private dependency for ordinary app development.

### Data Needed

[What data entities, sources, and APIs does this task require?]

**Entities**: [Entity name and description]

**Sources**: [System/API name and what data it provides]

### Integrations Needed

[External or internal systems this task must integrate with]

[If no integrations: "N/A - Standalone implementation"]

### Navigation

[How users reach this functionality, or how this code is accessed]

### Blocks Needed

**New Components**: [List components to build]

**Reusable Components**: [List components to reuse]

### Definition of Ready

- [ ] Applicable screen/content requirements understood by the customer owner
      and team
- [ ] Requirements documented: data, integrations, navigation, fields and blocks
- [ ] Dependencies Identified
- [ ] Stable AC IDs and observable expected outcomes agreed
- [ ] Companion test-spec.md updated with paths, runner formats, collections,
      exact case IDs, source/test revision and commands
- [ ] Required executable-test, collection/adapter and execution tasks are
      assigned
- [ ] Customer ownership and platform-impact/no-change decision recorded
- [ ] Identify reusable components
- [ ] Effort is sized and prioritised

### Definition of Done

For an authorized implementation issue:

For documentation-only scope, apply these checks to the specified document
outcomes and named document checks; do not create runtime features or tests.

- [ ] Functional: Works as described in acceptance criteria
- [ ] Tested: Required AC-linked executable tests are written/updated in the
      owning repo
- [ ] Collected: Installed runner discovers exact canonical paths and named case
      IDs at the exact source/test revision; counts alone do not qualify
- [ ] Executed: Required selected checks passed at the recorded source/run
      identity
- [ ] Evidence: Expected outcomes, failures, cleanup and remaining gaps are
      recorded
- [ ] Documented: Architecture changes and implementation documented
- [ ] Demonstrated: Can show it working
- [ ] Stable: No critical bugs
- [ ] Reviewed: PO confirmed

For a specification/plan-only issue, completion means the Markdown scope, test
specification and implementation backlog are reviewed. Keep runtime tasks open;
do not create executable tests or claim runtime collection, execution or passing
results. Later implementation must satisfy the executable-test checks above.

**File Path**: `[file-path-from-task]` **Estimated Effort**: [S/M/L or hours]

---

## Notes

- `.specify/scripts/node/generate-issues.js` is the existing issue generation
  entrypoint.
- Run after creating tasks.md:
  `node .specify/scripts/node/generate-issues.js <feature-dir>`
- Review generated output against this authoring contract; this template does
  not claim the generator enforces the fields or that issues have been
  published.
- Use customer repo ownership and links. Internal platform work uses QProcess
  conventions only after an actual platform-impact decision.
- See tasks.md for complete task definitions
