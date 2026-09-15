# Priority And Outcome Protection Review

## Business Result

Gofer now has executable checks for the agreed priority, verified blocker
diagnosis and evidence-backed completion. A blocked task does not authorize
unrelated work. A passing process check does not mean the requested result
happened.

## Preservation Rubric

| Requirement                                                                   | Evidence                                                                                                       | Result |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| Keep ordered priority and required prerequisites                              | priority-outcome.test.ts                                                                                       | PASS   |
| Preserve approved parallel work and read-only tasks                           | priority-outcome.test.ts                                                                                       | PASS   |
| Reject unknown tasks, dependency cycles and out-of-scope paths                | priority-outcome.test.ts                                                                                       | PASS   |
| Retain material direction after resume and detect plan drift                  | priority-outcome.test.ts, business-delivery-checks.test.ts                                                     | PASS   |
| Require fresh, blocker-bound diagnostic output before technical escalation    | priority-outcome.test.ts, blocker-control.test.ts                                                              | PASS   |
| Preserve business questions, bounded retries and ask-once history             | blocker-control.test.ts                                                                                        | PASS   |
| Require current outcome and named task receipts                               | priority-outcome.test.ts, business-delivery-checks.test.ts                                                     | PASS   |
| Preserve early MVP and non-app scope; separate routine audits from completion | priority-outcome.test.ts, existing closed-loop tests                                                           | PASS   |
| Carry rules through generated surfaces and execute packaged helpers           | business-delivery-surfaces.integration.test.ts, blocker-surfaces.integration.test.ts, priority-outcome.test.ts | PASS   |
| Preserve checked previews                                                     | 15 real browser checks across Chromium, Firefox and WebKit                                                     | PASS   |

The full root suite passed: **4,106 tests in 303 files**, with retries disabled.
Build, typecheck, source/test lint and generated-resource checks passed.
Existing byte-for-byte command assertions remain; their expected documents were
updated for the reviewed instruction changes. No test was skipped or removed to
pass.

Seven real language-server protocol checks also passed. The final test cycle
found an existing hint-test teardown race: a background audit write could still
be running when its folder was removed. The test now uses an isolated folder and
waits for real pending writes, with a new real-write assertion. No production
memory behaviour or retry setting changed. A fresh full-suite run passed after
this bounded test-only repair.

Independent reviews found and led to repairs for binary evidence, file aliases,
private error text, legacy decisions, deep task chains, malformed receipt links,
invalid stage names, headless exports and the publication commit. New tests
prove that otherwise-passing audits fail when only the required outcome is
missing. They also check failed background writes, not only successful cleanup.

The final independent reviews found no remaining blocking findings in their
reviewed scope. The local 110-point rubric passed, including current outcome
evidence. This is not a score for untested native chats or future deployments.

The existing release.sh full-suite gate includes the new tests automatically.
Its preview gate and required security/release checks remain unchanged.

## Architecture And Limits

The new checker is a dependency-free, read-only Node script. It validates local
records; it does not provision services, change roles, install software or
modify customer applications. The existing blocker register and retry budget
remain in use. Diagnosis adds a hash-checked output file, not another retry
loop.

New loop contracts require a priority plan from the tasks stage. Earlier stages
do not need final outcome evidence. Legacy contracts retain routine behaviour
with a coverage limitation. Explicit completion requires migration to the new
plan. Incomplete proof remains unverified, while individual passing tests remain
visible. This is an intentional stronger completion rule, not removed
capability.

Source changes are made in .specify and shared generators, then copied into
extension and plugin packages. No new slash command or model routing is added.

```text
Agreed goal -> ordered tasks -> scoped work -> recorded outcome checks
Shared rules -> generated commands -> extension and plugin packages
```

Older pinned headless inventories remain valid. The current inventory adds the
new checkers and their dependencies. Publication now requires the tested commit
to match fetched GitHub main immediately before tagging.

Mutation testing is unavailable on this machine: the cached Stryker executable
fails to load a dependency. No mutation score is claimed. This optional check
does not replace the real execution and failure-path tests above.

## Recovery Boundary

After new diagnostic records exist, a direct downgrade is unsupported. A newer
recovery release must retain the record readers and completion arguments. Tests
prove those retained readers accept new and legacy records without changing
them, and still reject altered evidence. They do not prove a future recovery
package has been built or released.

The release-preparation merge starts Pages rollout. Marketplace publication is a
separate step. Verify both channels before announcing completion; repair a
failed publication for the same version rather than silently creating another.

These tests do not prove every native desktop conversation or a live customer
deployment. Hosts control tool execution. Agents must call the checks and
inspect the actual diff, process ownership, user permissions and deployed
revision. Recorded hashes cannot authenticate user approval or prove an agent's
claim is true. A matching target is recorded evidence, not an independent live
lookup.

This review covers the local candidate. GitHub CI, merge and publication are
separate steps; this document does not claim they have happened.
