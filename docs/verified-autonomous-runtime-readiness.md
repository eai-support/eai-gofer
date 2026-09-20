# Verified autonomous runtime: readiness assessment

Assessed 2026-09-20 at `main` head `44dd8832`. **Score: 73 out of 100.** This is
a self-assessment made by the team that built the work. It has not been scored
by an independent party, and an independent scorer may differ.

## How it was scored

The baseline rubric rated eight capabilities and gave a holistic **43/100**. It
did not publish weights. This assessment keeps the same eight rows and the same
rating words. Each row is worth 12.5 points. The words map to points as Failing
about 1, Partial about 5, Good about 7, Strong about 10. That map reproduces the
baseline as 44, so the scale is close to the original. Points above 10 need
evidence that leaves no obvious gap in the row.

| Capability                  | Baseline | Now    | Points   | Main evidence                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | -------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface contract            | Partial  | Strong | 11       | Antigravity is the only current host. A release verifier fails on drift or a missing runtime asset: `scripts/verify-surface-release-contract.mjs`, `tests/unit/release/surface-release-contract.test.ts`.                                                                                                                                                                                                                           |
| Model drift                 | Failing  | Good   | 7.5      | Signed, expiring receipts from the live Codex catalogue: `.specify/scripts/node/gofer-host-capability.mjs`, `gofer-local-capability-issuer.mjs`. The gate refuses without a fresh receipt and a signed benchmark: `gofer-live-routing.mjs`. Static policy is advisory in every command file. Gap: only Codex has a qualified runtime.                                                                                               |
| Goal-led runtime ledger     | Good     | Strong | 11       | Every dispatch binds revision, scope, receipt hash, budget, lease, approval. Live chain: reserve, lease, authorize, native-authorize, commit-authorize: `gofer-runtime-ledger.mjs`, `gofer-verified-execution.mjs`.                                                                                                                                                                                                                 |
| Executable graph            | Partial  | Good   | 8.5      | Real worker in a verified isolated worktree, cancellation confirmed, resume reconciled, live on Codex 0.155.1 (see live proof below). Gaps: one host, one OS, one smoke task, no live multi-task dependency invalidation.                                                                                                                                                                                                           |
| Context continuity          | Partial  | Good   | 7        | Compact revisioned state and a journal, with resume proven live: `gofer-execution-recovery.mjs`. Gap: resume restarts the task in a fresh session. It does not carry model context.                                                                                                                                                                                                                                                 |
| Agent roles                 | Strong   | Strong | 10       | Roles stay advisory. The benchmark reviewer is a separate model on its own ledger and never sees the verdict: `gofer-independent-reviewer.mjs`.                                                                                                                                                                                                                                                                                     |
| Benchmarking                | Failing  | Good   | 8        | Four-category corpus, three runs each, independent sandbox check, model review, provenance, Wilson confidence interval, durable receipts and snapshots, human-gated signature: `gofer-benchmark-executor.mjs`, `gofer-benchmark-signer.mjs`, `gofer-trusted-benchmark.mjs`. Gaps: the corpus is project-authored, the regression gate and ablation report exist but were never run against a second configuration or wired into CI. |
| Test and release discipline | Strong   | Strong | 10.5     | 4,683 tests, typecheck, lint, release parity, all hosted checks green at the previous head (17 checks). Gap: no CI job runs a live model.                                                                                                                                                                                                                                                                                           |
| **Total**                   | **43**   |        | **73.5** |                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Live proof (one macOS machine)

| Claim                                       | Evidence                                                                                                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation report from the installed EAI CLI | `eai start <worktree> --isolation-check --surface codex-cli --format json` returned `eai.local-isolation/v2`, status ready (EAI CLI 3.16.0).                                                                          |
| Signed sandbox, shared git store read-only  | Codex is signed by OpenAI (team 2DC432GLL2). The real sandbox allowed a worktree write and denied a sibling write and a shared-git-store write.                                                                       |
| Independent benchmark                       | Two runs of 4 cases x 3 runs, both 12/12. Worker `gpt-5.6-terra`, reviewer `gpt-5.6-sol`. A separate sandbox re-check reproduced 12/12.                                                                               |
| Routing by the signed benchmark             | The gate refused without it, chose `gpt-5.6-terra` with it, and refused a tampered verdict and an altered lifetime.                                                                                                   |
| Ledger-backed native task                   | Production runtime. Ledger chain complete. Worker exit 0. Task `T001` verified.                                                                                                                                       |
| Cancellation and resume                     | Worker cancelled by `SIGTERM`, process group gone. `cancel-reconciled` recorded against a distinct clean replacement worktree. New lease. Only the new lease was commit-authorized. Cancelled attempt never replayed. |

How to repeat any of this by hand:
[verified-autonomous-runtime.md](verified-autonomous-runtime.md).

## What blocks 100

1. **More hosts (about 4 points).** Claude and Grok have execution adapters with
   live-proven sandbox boundaries, but neither is in the routed chain (no
   receipt, and the EAI CLI does not qualify them). Copilot, Antigravity and VS
   Code have no adapter. Linux and Windows fail closed.
2. **Benchmark independence and reach (about 5 points).** A corpus written
   outside the project, run against at least two models, with the regression
   gate and ablation report run for real and enforced in CI.
3. **Key custody (about 4 points).** The capability key is plaintext and
   readable by a worker. The 2026-09-20 check on Codex 0.155.1 with the
   `gofer-isolated` profile confirmed a sandboxed process can read files in
   `~/.eai-gofer-trust` (staged and active plaintext keys, and the encrypted
   verifier envelope). It cannot write there. Encrypting the capability key like
   the verifier key closes the plaintext exposure.
4. **Live evidence in CI (about 4 points).** CI cannot run a model. A scheduled
   job with a spend cap and a stored, human-signed attestation could.
5. **Independent review (about 3 points).** The work was reviewed and merged by
   the same person's accounts. A second person has not reviewed it.
6. **Deeper live runs (about 3 points).** A multi-task graph with dependency
   invalidation and a cancel during a dependent task, on a real repository task
   rather than a smoke file.
7. **Small defects.** A verified run leaves its temporary worktree behind. The
   runtime's `nativeQualification` field is a fixed value, not a measurement.

## What this score is not

It is not a code-quality score. It measures production capability for
long-running autonomous coding against the target operating model. It is not a
claim of 100/100. The earlier request for a 100/100 assessment cannot be met
honestly from this evidence.
