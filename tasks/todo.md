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

# Consultant Toolkit: 50 Portable Agent Skills

- [x] Define a MECE taxonomy: 7 engagement phases, one owned output per skill,
      explicit hand-offs and "not for" boundaries.
- [x] Write 50 `SKILL.md` files in `consultant-toolkit/skills/` that use only
      the open Agent Skills fields (`name`, `description`) and plain Markdown.
- [x] Keep descriptions short, ASCII, and front-loaded so all 50 fit the Codex
      8,000-character skill-list budget.
- [x] Write the catalog, MECE map, and install steps for Claude and OpenAI
      surfaces in `consultant-toolkit/README.md`.
- [x] Add `scripts/verify-consultant-toolkit.mjs` and unit tests for format,
      budget, portability, unique ownership, and valid cross-references.
- [x] Keep the pack outside Gofer's generated host folders so the `eai`-only
      picker and release mirrors do not change.
- [x] Run the validator, focused tests, and an independent overlap review.

## Review

- Validator passed: 50 skills; names and descriptions total 7,670 of 8,000
  bytes; longest description 153 bytes; largest `SKILL.md` 2,130 bytes.
- All 50 frontmatter blocks parse as YAML with only `name` and `description`.
- Focused tests passed: 11 tests, including rejection cases for each rule.
- Independent review found 12 overlap clusters, 6 broken hand-offs, and 6 method
  errors. All were fixed. Shared elements now have one owner each.
- Shared rule now forbids invented sources and labels unchecked knowledge
  `[Unverified]`, so skills stay safe on models without web access.
- Gofer generation parity is unchanged. Full suite: 4,945 passed, 1 failed. The
  failure (`gofer-verifier-key-custody`, root-ownership check) also fails on an
  untouched `main` checkout because this container runs as root.

# Consultant Toolkit: Business Consulting Extensions

- [x] Add `engagement-proposal`, `process-mapping`, and `status-report` as
      business consulting skills, each with one owned output.
- [x] Route neighbors to the new owners: proposal scope and fees, single-process
      maps, and the issue, action, and decision log.
- [x] Reject software delivery vocabulary in every skill, so the pack stays
      business consulting, not app development.
- [x] Trim descriptions so 53 skills fit the 8,000-byte Codex list budget.
- [x] Run the validator, tests, linters, and an independent review.

## Review

- Independent review found no software delivery wording. It found overlaps on
  engagement scope, workplan, decisions, and RAG thresholds, plus weak
  hand-offs. All were fixed: the proposal reuses the key question, the status
  report uses measurable RAG rules and `kpi-dashboard` thresholds, and process
  maps hand off to the roadmap, RACI, and change plan.
- Validator and 12 focused tests passed after the fixes.

# Consulting Route Through `/eai`

- [x] Move the pack to `.specify/references/consulting/`, so workspace
      bootstrap, the VS Code extension, and plugin bundles ship it unchanged.
- [x] Add one shared `Business Consulting Route` section to the `eai` entry on
      every surface and to the plugin umbrella skill.
- [x] Split stage 0 non-app work into business consulting and technical non-app
      routes, checked before the app default.
- [x] Guard stages 1 to 6 so the consulting route skips software steps and
      follows the stage map.
- [x] Write `routing.md`: route test, owner table against Gofer functions, stage
      map for all 53 skills, and requests with no owner.
- [x] Validate routing owners, surface coverage, and the portable inventory.
- [x] Independent MECE check of realistic requests against the routing.

## Review

- An independent check routed 24 realistic requests. It found two leaks where
  stage 0 could run software steps on consulting work, plus ordering and wording
  overlaps. All were fixed: stage 0 applies the route test first, every guard
  says exactly what stays, single outputs skip the pipeline, and each
  owner-table cell names one owner.
- Lint, format, typecheck, generation parity, and the plugin bundle passed. Full
  suite: one pre-existing failure (`gofer-verifier-key-custody`) that also fails
  on `main` because this container runs as root.

# Consultant Toolkit: AI Value Skills (Wave 1)

- [x] Add six AI value skills, each with one owned output:
      `ai-readiness-assessment`, `ai-opportunity-scan`, `ai-bootcamp-design`,
      `ai-workflow-redesign`, `ai-value-capture-plan`, and `ai-value-tracker`.
- [x] Add catalog phase 8, owner-table rows, and one stage per skill in
      `routing.md`.
- [x] Route neighbors to the new owners: `process-mapping`, `business-case`,
      `kpi-dashboard`, and `portfolio-matrix`.
- [x] Shorten descriptions so 59 skills fit the 8,000-byte Codex list budget.
- [x] Regenerate extension resources and plugin bundles, and update the pinned
      portable inventory count.
- [ ] Independent review of overlaps, hand-offs, and methods.
