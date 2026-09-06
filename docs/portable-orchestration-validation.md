# Portable Orchestration Validation

For the current publication scope and accepted limits, see
[model routing release scope](portable-orchestration-release-status.md). The
earlier snapshots below remain historical evidence, not current release status.

## Stage Execution Follow-Up

The candidate now adds an execution bridge and all-stage `/eai` instructions.
See [extra model help through EAI](stage-execution.md). The historical results
below describe the earlier decision-only implementation. They do not validate
the new bridge or prove automatic behavior in each coding app.

Date: 2026-09-05. Baseline: `74dc92000a9309d4735945b45227d1bcb4356f83` (3.12.4).
Branch: `feat/portable-orchestration-baseline`.

Follow-up on 2026-09-06: see
[surface model discovery validation](model-discovery-validation.md) for the
revised candidate and fresh results after a Codex CLI startup rejection. The
results below describe the prior decision-helper candidate, not the new
discovery changes. See [test instructions](testing-model-routing.md) to test a
client.

## Decision

The local implementation passes the checks below. Keep new orchestration **off
by default**. Live model quality, response time, and every installed host still
need separate evidence. This is not an all-surface or 100-percent certification.

The [18-gate rubric](portable-orchestration-rubric.md) covers app delivery and
non-app work. The implementation adds an optional decision helper, not another
execution engine. It cannot call providers, change permissions, or declare work
complete. Native HydraFusion integration remains outside this first phase.

## Preserved Behaviour

The preservation check confirms all 26 internal stages/helpers, 100 recorded
wrapper paths, 44 VS Code command IDs, and 13 configuration contracts remain. It
also compares 11 protected implementation files and all stage instructions with
the fixed baseline. Only declared model-role and shared policy changes are
allowed in stage text. Historical published snapshots remain historical.

App specifications, MVP-aware gates, authentication rules, EAI-first choices,
early UI previews, approved runners, release evidence, and scope-change loops
remain in place. Non-app work retains its exemption from EAI app setup.
Stakeholder documents, diagrams, branding, memory, and context controls remain.

Provider-specific model aliases now map to roles. The host must resolve those
roles to verified available models. An absent arbiter setting uses the hard
tier, not medium. Unsupported hosts retain their existing execution path.

## Executed Checks

| Check                                                 | Result                                           | Evidence limit                                                            |
| ----------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| Root suite, retries disabled                          | 3,693 passed in 286 files                        | Existing root exclusions unchanged; not every live host.                  |
| New routing, preservation, export and overhead gate   | 222 passed                                       | Included within the root count, not additional tests.                     |
| Native VS Code 1.127.0, macOS                         | 131 passed; 11 pending                           | Same pending cases before and after; short temporary profile required.    |
| Playwright, Chromium/Firefox/WebKit, retries disabled | 27 passed; 3 skipped                             | Browser fixture and resource checks, not real Copilot or other host apps. |
| Build, TypeScript, lint and source formatting         | Passed                                           | Existing command scope retained.                                          |
| Generated surfaces and release-surface contract       | Passed                                           | Generated assets are not proof of installation or reload.                 |
| EAI refresh layout and language-server build/sync     | Passed                                           | No live EAI tenant used.                                                  |
| VSIX packaging                                        | Passed; 1,685 files, about 8.57 MB               | Archive contents checked; not published.                                  |
| Independent review                                    | No remaining findings                            | Planner, inventory and cleanup contracts; no live-model verdict.          |
| Gofer goal, traceability and loop audits              | Healthy/pass; all 16 feature requirements linked | Local scope only; not a product-wide completion score.                    |

Independent checks included 10 critic-history probes, 39 headless-inventory
probes, and three cleanup failure-ordering probes. These are separate review
evidence, not additions to the automated suite count.

## Findings Fixed

1. Adding mandatory export files broke historical release descriptors. Keep the
   original 178-path inventory; require all four new files under a new digest.
2. A worker could be relabelled as a critic. Bind the critic to the approved
   identity, independent model family, work revision and preceding worker.
3. A same-model escalation provided no distinct escalation. Reject that route.
   Do not wrap a compound model in another compound orchestration loop.
4. Test cleanup could remove folders while real background writes were active.
   Isolate each test, await every write, and retain write and cleanup errors.
5. An existing browser resource test expected the obsolete `gofer.md` alias.
   Baseline main already contains `eai.md` and `eai-update.md`; test that exact
   set.

## Failure History

Unchanged baseline root tests had 3,467 passes and one file-watch timeout. The
focused file-watch rerun passed 2/2. The later full pass does not erase that
original failure or guarantee timing tests cannot recur.

Intermediate implementation runs caught export-descriptor and golden-file
newline regressions. Both were fixed without removing old assertions. Another
run overlapped packaging with tests, temporarily removing the bundled
language-server manifest. Packaging and the final full suite ran sequentially.

The first browser run had six failures: three missing browser executables and
three occurrences of the stale command-name assertion. After installing test
browsers and correcting that baseline mismatch, all non-skipped cases passed. No
test exclusions, retries, existing skips, or coverage thresholds were relaxed.

## Speed And Cost

The optional helper does not run on every chat turn. Its disabled path makes no
provider calls. Seven local batches of 10,000 disabled decisions stayed below
one millisecond average per decision. This measures the local helper only.

Canonical stage text is 2,925 bytes smaller than baseline. The shared public
guidance adds fewer than 800 bytes per entrypoint. Neither result proves lower
billed tokens or faster real model responses.

Enabled routes require explicit approval, current capabilities, a complete
attempt history and bounded time/attempts. A configured spend limit stops on
unknown spent cost. Reported cached tokens are not double-counted. The host must
enforce execution limits, permissions and read-only critic isolation.

## Blast Radius And Remaining Proof

Production changes affect delegation guidance, a new pure planner, packaging,
and additive headless inventory validation. There are no new provider SDKs,
credentials, account changes, mandatory app migrations or extension commands.
Release validation adds checks without removing existing gates.

Generated contracts cover Claude, Codex, Copilot, Gemini, Grok and VS Code
resources. Windows/Linux/macOS CI jobs are defined, but have not run remotely.
Grok resource parity does not establish native Grok plugin support. Existing
root exclusions, native pending cases and browser skips remain visible.

Before default activation, run paired existing/new workflows on each supported
real desktop and CLI host. Verify installed discovery, update/reload,
permissions, cancellation, MVP and non-app behaviour, UI previews, required
review, and release evidence. Compare equal accepted outcomes, model quality,
first-result time, total time, p50/p95 latency, tokens, cache use and cost. Keep
the existing path where support or evidence is missing. Do not claim a faster or
better model outcome from synthetic checks.

No PR, remote CI run, merge or release was performed in this change. Installed
user-level plugins and the original working copy remain unchanged.

## Reproduce Local Checks

Run package generation before tests, not concurrently with them. Use the
existing scripts: `npm run gofer:generate:check`,
`npm run gofer:orchestration:check`, `npm run gofer:orchestration:test`,
`npm test -- --retry=0`, and
`npm run test:e2e:playwright -- --retries=0 --reporter=line`.

The native extension suite remains `npm --prefix extension test`. Long macOS
worktree paths need a short temporary VS Code user-data path to avoid the
operating-system socket-path limit. This workaround changes the test profile
path only, not the test suite.
