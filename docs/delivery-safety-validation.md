# Delivery Safety Review

## Scope

This change strengthens Gofer's instructions and local checks. It preserves the
existing pipeline, internal commands, app and non-app paths, early previews,
model routing and existing release checks.

## Acceptance Rubric

Each row must pass its named test before merge. A source or package test does
not prove native chat behaviour or a deployed customer app.

| Requirement                                                                                  | Evidence                                                                                                                        | Local result |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Confirm workspace access separately from company sign-in; no silent widening                 | auth-access-decision.integration.test.ts                                                                                        | PASS         |
| Keep business updates concise and flag repetitive or technical drafts                        | business-delivery-checks.test.ts                                                                                                | PASS         |
| Tie completed tasks to requirements and current evidence; detect changed artifacts           | business-delivery-checks.test.ts                                                                                                | PASS         |
| Persist blockers and ask once; bound investigation and recovery                              | blocker-control.test.ts                                                                                                         | PASS         |
| Reject stale evidence, unsafe paths and concurrent reservations                              | blocker-control.test.ts                                                                                                         | PASS         |
| Keep independent tasks available while blocking premature feature completion                 | blocker-control.test.ts and strict loop audit                                                                                   | PASS         |
| Preserve contracts across generated surfaces, packages and internal stages                   | business-delivery-surfaces.integration.test.ts, blocker-surfaces.integration.test.ts, safe-preview-surfaces.integration.test.ts | PASS         |
| Leave an occupied preview port alone; never select another app as fallback                   | safe-ui-preview.test.ts with real local listeners                                                                               | PASS         |
| Do not claim readiness from a dry run, HTTP error, empty page, script error or skipped tests | safe-ui-preview.test.ts and safe-preview.spec.ts                                                                                | PASS         |
| Verify a real browser journey before reporting a checked preview                             | safe-preview.spec.ts, Chromium Save-button journey                                                                              | PASS         |
| Preserve existing automated checks and include preview tests before release                  | Full root suite and release-gate assertions                                                                                     | PASS         |

Local verification: 3943 root tests across 298 files and five Chromium checks
passed with retries disabled. Typecheck, generator consistency, shell syntax and
patch checks passed. GitHub CI must independently pass on the PR commit before
merge.

## Architecture And Blast Radius

The shared generators carry the rules to existing surfaces. The new helpers use
local files, hashes and bounded state. They do not call model APIs, provision
resources, alter customer app permissions, or reset user settings. Strict loop
checks inspect recorded blockers and task evidence. Legacy contracts keep their
prior validation behaviour unless the new checks apply.

Preview checks use only the selected local address. The helper does not
terminate processes. An occupied or unverifiable port blocks runner startup. The
agent must establish exact app ownership before a separate scoped restart.
Runners in customer repositories still need inspection; the port preflight is
not an atomic operating-system ownership lock.

The intentional behaviour changes are stricter completion claims and bounded
repeated work. A dry run is planned, incomplete checks are unverified, and
skipped scenarios are not passed. These statuses may require callers to handle a
blocked or unverified result instead of assuming success.

## Limits

- Instructions cannot intercept every native message or tool call. Each host
  still controls execution and permissions.
- File hashes detect changed evidence; they cannot prove that a hand-written
  receipt or approval claim is truthful.
- These checks do not certify ASD-STE100 compliance, deployed SSO, native
  desktop behaviour, or zero regressions on every operating system.
- Early MVP checks cover implemented behaviour only. Drafts can still be shown
  with their limits stated; no new preview approval stop is introduced.
- No customer credentials, private feature packs or tenant-specific evidence
  belong in this review or public release assets.
