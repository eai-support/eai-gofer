# Business Language Regression

- [x] Trace the policy through source, generated hosts, and workspace
      instructions.
- [x] Add a mandatory response check to the canonical policy.
- [x] Add the policy to generated workspace instructions.
- [x] Add regression coverage for all published surfaces.
- [x] Regenerate outputs and run focused and full validation.

## Review

- Generation parity passed.
- Release layout passed.
- Type checks, lint, and build passed.
- Focused response-policy tests passed: 28 tests.
- Full test suite passed: 3,432 tests across 275 files.

# Object Type Seed Compatibility Gate

- [x] Require the CLI's machine-readable safe-negotiation capability before
      Gofer permits Object Type publication.
- [x] Require dry-run evidence for the exact declared name/slug pairs without
      treating a local dry run as deployed receiver proof.
- [x] Require the mutating result to record the request shape actually used.
- [x] Require an approval-gated CLI update before retrying a manifest failure
      when the installed CLI reports `upgrade_required`.
- [x] Regenerate all published Gofer resources and mirrors.
- [x] Run focused and full validation, then record the review result.

## Review

- Source and generated-resource parity passed.
- Focused Object Type compatibility and routing checks passed: 59 tests.
- Review recovery guidance now updates an outdated CLI before validation and
  seed are retried.
- Full Gofer suite passed: 3,443 tests across 276 files.
- Typecheck, lint, format, build, and generation checks passed.

# EAI Lab Repair-To-Green Convergence

- [x] Define the Issues2025 EAI Lab route before normal app readiness.
- [x] Require a clean current eai-stack controller and one Gas command.
- [x] Require complete unchanged eai-testing-dev and external contracts.
- [x] Require Copilot repair, PR push, rebuild, and full retest convergence.
- [x] Keep Green, Orange, Red, and Blocked semantics explicit.
- [x] Regenerate every public /eai surface.
- [x] Run focused and full Gofer validation.

## Review

- Canonical generation and extension-resource parity passed.
- The focused convergence-route contract passed on all 10 public `/eai`
  surfaces.
- Unit, integration, VS Code extension E2E, and performance suites passed.
- Quality passed with 3,447 tests across 278 files; lint, format, typecheck,
  build, and the V4 resource contract passed.
