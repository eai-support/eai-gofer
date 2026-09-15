# Verified Harness Test Specification

## Purpose

Prove truthful task completion and bounded coordination without claiming
native agent qualification from file checks or simulations.

## Coverage

| Requirement | Test source | Required assertion |
| --- | --- | --- |
| Current outcome evidence | gofer-verified-execution.test.ts | Worker success cannot bypass missing, failed, wrong-input or stale checks. |
| Bounded repair | gofer-verified-execution.test.ts | Each retry reserves an attempt. Failed checks stop at the limit. |
| Shared controls | gofer-verified-execution.test.ts | Calls cannot overdraw. Cancellation and deadline prevent success. |
| Stable work | gofer-verified-execution.test.ts | Existing journal blocks replay; changed direction invalidates work. |
| Dependency graph | gofer-verified-execution.test.ts | Real local processes overlap only when independent; shared writes serialize. |
| All mandatory checks | gofer-verified-execution.test.ts | One failed required check blocks completion, regardless of other passes. |
| Preserved entrypoints | verified-harness-surfaces.test.ts | Shared guidance reaches existing skills and stages; no extra public agents. |
| Release coverage | verified-harness-surfaces.test.ts | release.sh invokes regression checks without test retries. |
| Distributed package | agent-plugin-package.test.ts | Built archive contains role catalogue and execution helpers. |

## Exclusions And Release Gates

Local fixture adapters do not qualify native AI hosts. Native Claude, Codex,
Copilot, VS Code, Grok and Antigravity execution, isolation and cancellation
need separate exact-version evidence. Matched product performance is unverified.
Tests must not be renamed or counted as those missing categories.
