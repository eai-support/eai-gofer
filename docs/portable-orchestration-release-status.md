# Model Routing Release Scope

## Included

Gofer can discover models in the current coding tool and request bounded,
read-only help through its stage bridge. Existing specifications, acceptance
checks, previews, app readiness and non-app routing remain in place.

The optional routing policy remains off by default. Enabled routing still
requires an approved route, available models and verified host support. A model
answer is a proposal, not proof that the feature works.

## Validation

The final 2026-09-07 local full run passed 4,737 tests with retries disabled.
One opt-in native qualification test was not run by that suite. Run separately,
the Codex qualification test failed. It remains a release blocker.

Type checking, lint, source formatting, generated assets and the preservation
contract passed. The preservation check covers 26 internal stages, 100 recorded
surface paths and 11 protected contracts. Native VS Code extension tests passed
135 checks, with 11 existing pending tests. The fresh VSIX package check passed;
package contents alone do not prove activation or a complete user journey.

Earlier native bridge checks ran on Codex, Claude, Copilot and Grok CLI. A
normal Copilot Chat `/eai` session in VS Code completed two separate model
calls. These are bounded scenarios, not full customer delivery journeys.

## Known Limits

- The latest security review found a Codex delegate isolation gap. Native
  read-only mode can still read outside the supplied review context. Earlier
  successful model calls do not prove that boundary. This is a release blocker,
  not part of the accepted Antigravity exception. Discovery reports this limit,
  and new Codex delegation stops before execution. Ordinary Gofer work in the
  main session remains available.
- Antigravity extra-model execution remains blocked. Its read-only boundary is
  unverified, and the latest native probe stopped on exhausted account quota.
  The user accepted this limitation for release; no permission bypass is added.
- Complete automatic `/eai` app and non-app journeys are not proven on every
  desktop and CLI client. CLI evidence is not desktop evidence.
- No measured improvement in model quality, delivery speed or cost is claimed.
- Existing native extension pending tests and root test exclusions remain.

This is a scoped, guarded release candidate, not a claim of 100% coverage.
Remote CI, review, merge and publication must be verified separately.

See [stage execution](stage-execution.md), the
[preservation rubric](portable-orchestration-rubric.md), and
[historical validation](portable-orchestration-validation.md).
