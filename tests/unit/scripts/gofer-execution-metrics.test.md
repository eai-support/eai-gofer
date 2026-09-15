# Matched Execution Metrics Contract

## Scope And Evidence

T011; FR-011; AC-030, AC-032, AC-037; descriptive inputs for SC-005. All tests
in `gofer-execution-metrics.test.ts` are synthetic. They test reporting, not
native host execution, isolation, measured product speed or feature readiness.
No rubric score or native qualification is manufactured by the reporter.

## API And Input

`generateExecutionMetrics(input)` is synchronous, dependency-free and read-only.
`summarizeUsage(usage)` and `formatMarkdown(report)` are also exported. CLI:
`node .specify/scripts/node/gofer-execution-metrics.mjs --input trials.json --json`.
Use `--input -` for stdin, omit `--json` for Markdown, or use `--help`.
Malformed, oversized or unmatched data fails with a nonzero exit, never a
partial successful report. No commands, models, writes or network calls are
executed.

Input schema version 1 contains `revisions: { baseline, candidate }` and
`trials`. Each trial declares `trialId`, `pairId`, `variant`
(baseline/candidate), `caseId`, `requirementsRevision`, `inputRevision`,
`implementationRevision`, `environmentRevision`, `surface`, `measurementClass`,
`requiredChecks`, `status`, `elapsedMs`, `checks` and optional `usage`.

Each pair has exactly one baseline and candidate. Case, requirements revision,
input revision, environment revision, surface, evidence class and required check
set must match. Implementation revisions intentionally differ between arms but
must match the corresponding declared revision. Revision tokens are caller-owned
identities, not proof of filesystem freshness. The environment revision must
bind host/version, hardware, model policy, limits, fixture setup and cache
policy. The caller must retain the full predeclared trial population; the
reporter cannot detect a trial that was omitted before input was supplied.

Evidence classes are `synthetic`, `local-process` and `native-host`. Cohorts
keep different cases, revisions, environments, surfaces and classes separate. A
native label is only a declaration: no JSON flag authenticates host execution or
proves genuine parallel overlap. Product speed claims always remain unsupported
here; trusted native qualification and the existing release gates remain
mandatory.

Statuses: `verified`, `failed`, `blocked`, `timed-out`, `cancelled`, `stale`,
`incomplete`. Every trial stays in outcome, time and usage accounting.
Acceptance requires `verified` plus every named check passed with a nonempty
receipt and matching requirements/input/implementation revisions. A check has
`id`, `status` (passed, failed, blocked, missing or timed-out), `receipt`,
`requirementsRevision`, `inputRevision`, `implementationRevision`. Receipts
remain references, not authenticated evidence. Missing or stale checks produce
acceptance issues rather than silently accepting a completion label.

## Usage And Unknowns

Usage is `{ complete: boolean, entries: [...] }`. Each non-overlapping entry has
a globally unique `executionId`, `role` (worker/reviewer/controller/check),
positive integer `attempt`, and optional `calls`, `inputTokens`, `outputTokens`,
`costUsd`. Retry executions have their own ID and attempt. Include all failed
calls and reviewer calls; never supply a parent aggregate alongside its child
entries. Duplicate execution IDs fail rather than being counted twice or
deduplicated. All supplied entries are counted regardless of role, attempt or
trial outcome.

Each metric is null unless the ledger is declared complete, nonempty and every
entry supplies that metric. Partial known sums appear only under `reported`, not
as total usage or savings. An empty ledger is unknown, not a free run. Explicit
measured zero values remain zero. Missing costs never use inferred pricing.
Negative, nonfinite, nonnumeric or fractional token/call values are rejected.

## Statistics And Acceptance Tests

Each cohort reports both-arm median, nearest-rank p95, mean, min/max, sample
standard deviation and standard error, plus paired candidate-minus-baseline
elapsed statistics. Unknown duration prevents complete-cohort timing statistics;
it is not dropped from the sample. Failure durations are elapsed observation
time, not time to accepted success. Time statistics are descriptive, not
significance tests. Fewer than two observations have unknown sample
deviation/error.

Quality includes all-trial acceptance rates and paired regressions/improvements.
An improvement elsewhere cannot cancel a paired regression. Observed target
means at least 20% lower median elapsed, no worse p95, and every trial accepted
in both arms. It is not SC-005 certification. A zero baseline makes the
reduction ratio unknown. Small samples, declared evidence and missing data
cannot support a universal or native gain. Empty input produces no cohorts and
no supported claim.

Tests assert hand-calculated paired statistics, accounting for all terminal
outcomes, mismatch/duplicate rejection, incomplete costs, stale/missing checks,
cross-class separation, unknown durations, slow-case and quality regressions,
CLI errors, bounded stdin and explicit Markdown unknowns.

Run:
`npm test -- tests/unit/scripts/gofer-execution-metrics.test.ts --retry 0 --reporter=default`.
Package manifests, mirror generation, CI/release wiring and actual product
trials are intentionally outside these three files and remain integration
obligations.
