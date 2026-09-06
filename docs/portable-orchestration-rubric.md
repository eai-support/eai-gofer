# Gofer Portable Orchestration Preservation Rubric

## Purpose and boundary

Add opt-in portable model routing, evidence-based escalation and independent
critique without removing Gofer capabilities or silently slowing existing work.
This is Gofer product maintenance, not customer application delivery. Do not
authenticate, select tenants, initialize apps, provision EAI, publish releases
or change external systems under this task.

The machine-readable source is
[portable-orchestration-baseline.json](../tests/fixtures/portable-orchestration-baseline.json).
It contains public project names and repository-relative paths only. No private
feature specifications, customer artifacts, credentials or account IDs belong in
either artifact.

## Fixed baseline and evidence

Baseline: `74dc92000a9309d4735945b45227d1bcb4356f83`, Gofer **3.12.4**.
Inventories come from Git baseline blobs, not the changing worktree. The 11
preservation hashes use `git show origin/main:<path>` content, with line endings
normalized for Windows checkout parity. `origin/main` resolved to this exact
commit when captured. Stage hashes allow only the declared model-role and shared
policy replacements; other stage guidance must remain unchanged.

These baseline results were captured before implementation. The separate
[validation report](portable-orchestration-validation.md) records final results
and limits. A passing rerun does not erase an earlier failed run.

| Evidence                                                 | Reported result                                          | What remains open                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --retry=0` on unchanged baseline source     | 3,467 passed; one existing timeout; 280/281 files passed | Original failing file: `tests/integration/file-change-performance.test.ts`. This original full run remains a failure record. |
| Focused file-watch rerun                                 | 2/2 passed                                               | This does not replace a complete full-suite rerun or prove the timeout cannot recur.                                         |
| Native VS Code 1.127.0 on macOS                          | 131 passed; 11 pending                                   | A short temporary user-data path avoided the UNIX socket length limit. Pending cases remain pending.                         |
| Other desktop and CLI hosts                              | Not proven                                               | Installed discovery, real commands, updates, previews and recovery need host-specific evidence.                              |
| Real model quality, critique usefulness, speed and spend | Not proven                                               | Contract and simulated performance tests cannot establish these outcomes.                                                    |

[vitest.config.ts](../vitest.config.ts) excludes end-to-end, extension,
language-server and several unfinished/context cases from root discovery.
Coverage thresholds are 40%, not a completeness measure. The fixture records the
relevant exclusions. Named tests below locate existing coverage; their presence
is not an individually verified passing verdict.

## Gate accounting

All **18** rows below are must-preserve gates. No weighted percentage is
assigned.

- If reporting a gate count, use all 18 as the denominator, not only checks run.
- Keep failed, pending, skipped, excluded, unavailable and unrun evidence
  visible.
- Separate automated contract checks, executable behavior, native host results,
  real-model quality and measured speed/cost. One layer cannot stand in for
  another.
- A capability may be `not_applicable` to one early MVP while its Gofer product
  preservation gate remains required. This maintenance uses synthetic app cases;
  it does not authorize real EAI authentication or provisioning.
- Keep original failures, focused reruns and complete reruns as separate
  records. Do not change retries, exclusions or fixtures to hide the original
  timeout.
- A row is verified only when its applicable acceptance and evidence obligations
  are met. Missing runtime/model evidence means a limited contract result, not
  blanket feature readiness.
- Inventory/hash preservation is necessary but not sufficient. A removed gate
  cannot be compensated for by extra tests elsewhere. No blanket "100%" claim.

## Required gates

The fixture's `rubric` records the full acceptance statements, source paths,
existing tests and additional evidence for each row. The table gives concise
representative test references, not a list of every test in the repository.

| Gate                                | Must preserve                                                                                       | Existing automated evidence                                                                                                                                                                                                                                                                                                | Baseline limit / further proof                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| PO-001: Opt-in routing              | Off preserves current behavior and settings; on is explicit, with safe fallback.                    | [modelPolicy.test.ts](../tests/unit/config/modelPolicy.test.ts) (automated behavior); [ResourceSyncer.workspace-sync.test.ts](../tests/unit/extension/ResourceSyncer.workspace-sync.test.ts) (automated behavior)                                                                                                          | Defaults are tested; portable route execution and off/on parity need proof.     |
| PO-002: Public entrypoints          | Keep eai, eai-update, managed instructions and maintenance separate from app setup.                 | [cross-platform-parity.test.ts](../tests/integration/cross-platform-parity.test.ts) (automated behavior); [workspace-preflight-surfaces.test.ts](../tests/unit/scripts/workspace-preflight-surfaces.test.ts) (automated contract)                                                                                          | Wrapper presence is not installed picker or real host execution evidence.       |
| PO-003: Stages and helpers          | Keep all 26 commands and aliases; optional helpers never advance the main stage.                    | [stage-manifest.test.ts](../tests/unit/scripts/stage-manifest.test.ts) (automated contract); [helper-commands-cross-cli-parity.test.ts](../tests/unit/scripts/helper-commands-cross-cli-parity.test.ts) (automated contract)                                                                                               | Helper seam coverage is mainly contract text.                                   |
| PO-004: VS Code behavior            | Keep 44 commands, 13 setting contracts, panels, memory, usage and checkpoint actions.               | [command-registration.test.ts](../tests/integration/command-registration.test.ts) (automated behavior); [reinitializable-memory-commands.test.ts](../tests/unit/extension/reinitializable-memory-commands.test.ts) (automated behavior)                                                                                    | Native result: 131 passed, 11 pending; no all-host inference.                   |
| PO-005: Specs and traceability      | Block missing/template specs; retain acceptance links and unrelated feature files.                  | [spec-artifact-guard.test.ts](../tests/unit/scripts/spec-artifact-guard.test.ts) (automated behavior); [traceability-fr-coverage.test.ts](../tests/unit/scripts/traceability-fr-coverage.test.ts) (automated contract)                                                                                                     | Public traceability fixtures do not prove a new feature's requirements.         |
| PO-006: Non-app maintenance         | Research/docs/audit and Gofer maintenance must not authenticate or provision EAI.                   | [non-eai-output-regression.integration.test.ts](../tests/integration/enterpriseai/non-eai-output-regression.integration.test.ts) (automated behavior); [plan-standard-profile-regression.integration.test.ts](../tests/integration/enterpriseai/plan-standard-profile-regression.integration.test.ts) (automated behavior) | Add tool-spy coverage proving zero EAI setup calls.                             |
| PO-007: MVP capability gates        | Keep five states and validate only implemented/currently required capabilities.                     | [mvp-capability-validation.integration.test.ts](../tests/integration/enterpriseai/mvp-capability-validation.integration.test.ts) (automated contract); [validation-evidence-gates.test.ts](../tests/unit/scripts/validation-evidence-gates.test.ts) (automated contract)                                                   | Text assertions do not execute the capability-state matrix.                     |
| PO-008: EAI-first and auth          | Keep EAI-first/Azure-second, approved exceptions, scoped auth and approval gates.                   | [eai-app-template-readiness.integration.test.ts](../tests/integration/enterpriseai/eai-app-template-readiness.integration.test.ts) (automated behavior); [eai-app-preflight.integration.test.ts](../tests/integration/enterpriseai/eai-app-preflight.integration.test.ts) (automated contract)                             | Synthetic template/approval tests are not live sign-in evidence.                |
| PO-009: UI preview                  | Keep repo runners, business scenarios, screenshots, show-and-tell and stale/failure handling.       | [gofer-ui-preview.test.ts](../tests/unit/scripts/gofer-ui-preview.test.ts) (automated behavior); [ui-first-app-delivery-guidance.integration.test.ts](../tests/integration/enterpriseai/ui-first-app-delivery-guidance.integration.test.ts) (automated contract)                                                           | Dedicated preview coverage has two runner-selection cases only.                 |
| PO-010: Release completeness        | Require capability-to-test/PR/commit/release/deployed evidence; retain removal approvals.           | [mvp-capability-validation.integration.test.ts](../tests/integration/enterpriseai/mvp-capability-validation.integration.test.ts) (automated contract); [capability-removal-approval.integration.test.ts](../tests/integration/enterpriseai/capability-removal-approval.integration.test.ts) (automated behavior)           | Release-ledger wording does not verify real merge or deployed state.            |
| PO-011: Loops and resume            | Keep goal/drift checks, bounded retries, failure history and checkpoint continuity.                 | [gofer-loop-audit.test.ts](../tests/unit/scripts/gofer-loop-audit.test.ts) (automated behavior); [gofer-closed-loop-audit.test.ts](../tests/unit/scripts/gofer-closed-loop-audit.test.ts) (automated behavior)                                                                                                             | Ledger validation is not proof every claimed evaluation ran.                    |
| PO-012: Memory, budget and privacy  | Keep memory/hints/compaction/usage and advisory/blocking budgets across model handoffs.             | [memoryIntegration.test.ts](../tests/integration/memoryIntegration.test.ts) (automated behavior); [hintIntegration.test.ts](../tests/integration/hintIntegration.test.ts) (automated behavior)                                                                                                                             | Excluded context cases and new provider-boundary behavior remain gaps.          |
| PO-013: Evidence-based escalation   | Require failure, contradiction or material risk evidence; retain cost/approval boundaries.          | [modelPolicy.test.ts](../tests/unit/config/modelPolicy.test.ts) (automated behavior); [ErrorRecovery.test.ts](../tests/unit/autonomous/ErrorRecovery.test.ts) (automated behavior)                                                                                                                                         | Model defaults and generic retries do not prove routing decisions.              |
| PO-014: Independent critique        | Keep six review roles and required quality gates; separate critic execution must affect acceptance. | [cross-platform-parity.test.ts](../tests/integration/cross-platform-parity.test.ts) (automated contract); [validation-evidence-gates.test.ts](../tests/unit/scripts/validation-evidence-gates.test.ts) (automated contract)                                                                                                | Prompt roles do not prove independent execution or useful findings.             |
| PO-015: Profiles, speed and quality | Keep fast/standard/full/dynamic; compare equal outcomes using paired real workloads.                | [picker-time-to-stage.test.ts](../tests/unit/cli/picker-time-to-stage.test.ts) (automated behavior); [log-stage-launch-time.test.ts](../tests/unit/scripts/log-stage-launch-time.test.ts) (automated behavior)                                                                                                             | Parallel tests are simulated; no real-model quality/speed baseline.             |
| PO-016: Documents and branding      | Keep business outputs, PR/FAQ, personas, visuals and branding without scope/evidence changes.       | [gofer-command-guidance.test.ts](../tests/unit/scripts/gofer-command-guidance.test.ts) (automated contract); [market-business-always-emitted.test.ts](../tests/unit/scripts/market-business-always-emitted.test.ts) (automated contract)                                                                                   | No dedicated branding-behavior test; real viewer/readability proof is separate. |
| PO-017: Headless portability        | Keep identities, immutable approvals, hashes, safe paths, deterministic exports and lineage.        | [stageExecutor.test.ts](../tests/unit/headless/stageExecutor.test.ts) (automated behavior); [validators.test.ts](../tests/unit/headless/validators.test.ts) (automated behavior)                                                                                                                                           | Portable exports do not prove portable model routing.                           |
| PO-018: Packaging and release       | Keep host assets, versions, offline use and safe updates; record deliberate migrations.             | [agent-plugin-package.test.ts](../tests/unit/scripts/agent-plugin-package.test.ts) (automated behavior); [vsix-packaging.test.ts](../tests/unit/scripts/vsix-packaging.test.ts) (automated contract)                                                                                                                       | Nested release snapshots are inventory, not freshness or runtime proof.         |

### Surface Discovery Follow-Up

The Codex startup failure adds four checks. They extend the baseline, not
replace it.

| Check                         | Required result                                                                                                                     | Evidence                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Account and surface isolation | Reject stale, wrong-client and wrong-account catalogues. Never infer access from a public model name.                               | Model discovery and model policy tests; separate live Codex diagnostic. |
| Startup diagnosis             | Diagnose an unsupported configured model outside the chat without sending a model prompt.                                           | Read-only app-server protocol tests and live account-scoped read-back.  |
| Native defaults               | New policies omit fixed model IDs; preserve user policy and all tier roles. Explicit choices require available-model evidence.      | Model policy, CLI provider, factory and bootstrap tests.                |
| Honest coverage               | Generated rules reach each surface. Other clients use their native picker; simulated evidence does not certify installed operation. | Mirror checks and per-client test report.                               |

The original model-policy template hash stays in the baseline. Its intentional
replacement is recorded in
`tests/fixtures/orchestration-approved-migrations.json`. All ten other protected
contracts must remain byte-equivalent after line-ending normalisation. Existing
export inventories remain valid; discovery adds a third, complete inventory
rather than changing earlier release descriptors.

For PO-014, preserve correctness, security, performance, test quality,
integration and standards roles, plus applicable blast-radius and release
checks. A distinct role label does not establish independent critique. Record a
separate execution, actual model/provider identity, source evidence, findings
and their disposition. Unavailable or timed-out critique stays unverified; an
author's own output must not be relabelled as independent review.

For PO-015, freeze the comparison workload, accepted outcome, machine, host,
model versions and permitted tolerance before measurement. Use repeated paired
routing-off/on runs. Report time to first useful result, total time, cold/warm
p50/p95, calls, tokens and cost. Keep `fast`, `standard`, `full` and `dynamic`
profiles distinct. Do not force broad fanout into small tasks, or remove
required safety checks to obtain a speed result. Baseline validation guidance
contains both risk profiles and unconditional six-agent wording; test profile
behavior rather than resolving that tension by silently discarding either
requirement.

## Complete command inventory

### Stage Execution Integration

The
[canonical bridge contract](../.specify/references/portable-orchestration.md#stage-execution-bridge)
defines how `/eai` invokes approved stage delegation. The pure
`gofer-orchestration.mjs` planner remains planning-only. CLI execution uses
`node .specify/scripts/node/gofer-stage-execute.mjs --input <relative request.json> --execute --output <new .specify/specs/feature/...json>`;
`--help` supplies the exact request instructions. VS Code uses native
`gofer_execute_stage` with `{request}`, never a CLI substitute. Neither bridge
is a public picker entry. The public delivery and maintenance entries remain
`eai` and `eai-update`.

Apply the following integration checks across all 26 stages/helpers, both `app`
and `non-app`, and each claimed execution host/surface. They extend the 18 gates
above; they do not redefine the baseline or prove untested surfaces.

| Existing gates                 | Bridge acceptance obligation                                                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PO-001, PO-002, PO-003         | Inspect the route at meaningful stage boundaries through `/eai`. Ordinary chat, no useful delegation and explicit disable cause no bridge discovery/inference. No internal stage is removed or added to the picker; helpers stay optional and controls do not advance the pipeline.                 |
| PO-004, PO-017                 | Use `cli` or native `vscode-extension` with the same request fields. Discover the native current-account catalogue before execution; reject wrong-account/surface, stale evidence and unsupported selectors. No fixed model IDs, guessed rankings or silent provider changes.                       |
| PO-005, PO-012, PO-013         | Carry relative `spec`, `acceptance`, `platform`, `language`, and `permissions` files. Reuse approved task model/route and remaining time, attempt and cost budgets without fresh stage-by-stage prompts or budget resets. Keep all mandatory approvals and current-revision failure evidence.       |
| PO-006, PO-007, PO-008         | Reuse earlier confirmed non-app classification and make zero tenant/app setup calls. Keep every stage. App/MVP requirements remain capability-scoped; delegation does not create or remove authentication, template or deployment obligations.                                                      |
| PO-009, PO-010, PO-014, PO-016 | Delegates return read-only proposals. The controller applies only authorized, current, verified changes and still runs all original tests, quality gates, previews, diagrams, documentation and stakeholder outputs. Routing success cannot certify delivery.                                       |
| PO-011, PO-013, PO-014, PO-015 | `GOFER_STAGE_DELEGATE=1` and a no-recursion prompt prevent nested dispatch. Do not add a nested wrapper around native compound orchestration. Same-family different-model peer-review must NEVER replace required different-family critique; missing qualified critique remains blocked/unverified. |
| PO-001, PO-014, PO-018         | Antigravity hard read-only execution remains unproved: retain the safe legacy path until its adapter supports and verifies isolation. Model listing or generated files are not a native execution pass.                                                                                             |

Before applying a proposal, the controller must recheck every returned
`inputFiles` entry (`{ref, sha256}`), including the stage contract. A missing
file or changed hash invalidates the proposal. Curate a feature context bundle:
combined input content is limited to 64 KiB and each delegate output to 64 KiB.
An illustrative `maxAttempts: 3` permits worker plus critic and return to
controller validation under the existing planner bound, not three fresh attempts
at every stage. Include `maxCostUsd` only with native hard-dollar enforcement;
`hard_cost_limit_unavailable` is safe legacy behavior, never a cost-compliance
pass. Do not guess pricing or remove a required budget ceiling.

### Separate Evidence Layers

| Evidence layer                 | Required proof                                                                                                                                                                                                                                                                                    | What it does not prove                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Generated contract integration | In-memory public `/eai` instructions contain the bridge; all 26 canonical stage identities, aliases and preserved bodies remain; only the existing public picker entries are exposed.                                                                                                             | Generated/installed asset freshness, native model execution or automatic pipeline behavior.       |
| Native execution validation    | On the exact claimed host/surface/account, show discovery, resolved actual model, enforced read-only execution, proposal/evidence and bounded usage; record blocked and unsupported cases.                                                                                                        | A direct bridge invocation does not show `/eai` automatically uses it.                            |
| Automatic pipeline validation  | Start through `/eai`; show stage selection, policy reuse, actual bridge invocation for useful approved work, no discovery/inference on ordinary/disabled paths, controller application, and original stage tests/gates/preview/docs. Include app/non-app, failure/review and resumed-stage cases. | One native surface or one stage does not establish all-host/all-stage execution or model quality. |
| Outcome validation             | Compare accepted outcomes, independent critique findings, total time and cost on paired real tasks without weakening the 18 gates.                                                                                                                                                                | Mocked adapters, route plans, call counts or process success cannot establish quality or savings. |

[stage-execution-contract.test.ts](../tests/unit/scripts/stage-execution-contract.test.ts)
checks the shared contract, in-memory public skill rendering, request guidance,
public picker inventory and all 26 preserved stage bodies. These are automated
contract checks, not a claim that the bridge executed a native model. The test
does not invoke generator entrypoints or write generated artifacts. Generated
mirrors and packaged instructions must be refreshed by the integration owner and
checked separately before any installed-delivery claim.

Keep automatic pipeline validation separate from native execution validation in
every report. Mark unavailable or unrun combinations unverified. Do not turn
safe legacy fallback into a successful isolated-delegation result.

### Stage Inventory

`stageFiles` means **all** canonical command filenames, not only the seven core
stages. The baseline has seven core stages, eight optional stages, eight helpers
and three session controls. All 26 carry the nine canonical surface names listed
in the fixture. The seven core stages run from start through validation;
branding, comms, save, cloud and other helpers do not become mandatory stages.

| Internal ID                 | Filename under `.specify/commands/` | Role            | Baseline aliases                          |
| --------------------------- | ----------------------------------- | --------------- | ----------------------------------------- |
| `0_gofer_start`             | `0_gofer_start.md`                  | core stage      | `gofer:start`, `0_business_scenario`      |
| `0a_problem_validation`     | `0a_problem_validation.md`          | optional stage  | `gofer:validate-problem`                  |
| `10_gofer_cloud`            | `10_gofer_cloud.md`                 | optional stage  | `gofer:cloud`                             |
| `1_gofer_research`          | `1_gofer_research.md`               | core stage      | `gofer:research`                          |
| `2_gofer_specify`           | `2_gofer_specify.md`                | core stage      | `gofer:specify`                           |
| `3_gofer_plan`              | `3_gofer_plan.md`                   | core stage      | `gofer:plan-stage`                        |
| `4_gofer_tasks`             | `4_gofer_tasks.md`                  | core stage      | `gofer:tasks`                             |
| `5_gofer_implement`         | `5_gofer_implement.md`              | core stage      | `gofer:implement`                         |
| `6_gofer_validate`          | `6_gofer_validate.md`               | core stage      | `gofer:validate`                          |
| `7_gofer_save`              | `7_gofer_save.md`                   | optional stage  | `gofer:save`                              |
| `7a_stakeholder_comms`      | `7a_stakeholder_comms.md`           | optional stage  | `gofer:comms`                             |
| `8_gofer_branding`          | `8_gofer_branding.md`               | optional stage  | `gofer:branding`, `gofer:brand-templates` |
| `9_gofer_tests`             | `9_gofer_tests.md`                  | optional stage  | `gofer:tests`                             |
| `gofer:bootstrap-workspace` | `gofer_bootstrap_workspace.md`      | helper          | None                                      |
| `gofer:check-workspace`     | `gofer_check_workspace.md`          | helper          | None                                      |
| `gofer_constitution`        | `gofer_constitution.md`             | optional stage  | `gofer:constitution`                      |
| `gofer:diagnose`            | `gofer_diagnose.md`                 | helper          | None                                      |
| `gofer:eai-first-run`       | `gofer_eai_first_run.md`            | helper          | `gofer:first-run`, `gofer:eai-setup`      |
| `gofer_hydrate`             | `gofer_hydrate.md`                  | optional stage  | `gofer:hydrate`                           |
| `gofer:personality`         | `gofer_personality.md`              | session control | None                                      |
| `gofer:plan`                | `gofer_plan.md`                     | session control | None                                      |
| `gofer:side`                | `gofer_side.md`                     | session control | None                                      |
| `gofer:spec-summary`        | `gofer_spec_summary.md`             | helper          | None                                      |
| `gofer:tdd`                 | `gofer_tdd.md`                      | helper          | None                                      |
| `gofer:vocabulary`          | `gofer_vocabulary.md`               | helper          | None                                      |
| `gofer:zoom-out`            | `gofer_zoom_out.md`                 | helper          | None                                      |

The public delivery name is `eai`; `eai-update` is the support-only maintenance
entrypoint. Preserve internal availability without republishing the numbered
stage/helper set into public command pickers. Existing VS Code workbench command
IDs are a separate inventory and must not be removed in pursuit of a clean
two-entrypoint prompt surface.

## Complete surface inventory

The fixture's flat `surfaceEntrypoints` array contains all **100 exact paths**.
`surfaceEntrypointGroups` contains the same set grouped below. It includes both
`eai` and `eai-update` paths on every recorded wrapper surface.

| Fixture group                   | Paths | Meaning                                                      |
| ------------------------------- | ----- | ------------------------------------------------------------ |
| `canonical`                     | 4     | Authoritative public skill wrappers                          |
| `repositoryGenerated`           | 18    | Repository host wrappers                                     |
| `extensionResources`            | 14    | VS Code packaged resources                                   |
| `pluginPackage`                 | 16    | Committed plugin package                                     |
| `nestedPluginSnapshot`          | 16    | Observed release/nested snapshot; migration must be explicit |
| `publishedPluginSnapshot`       | 16    | Observed release/nested snapshot; migration must be explicit |
| `publishedNestedPluginSnapshot` | 16    | Observed release/nested snapshot; migration must be explicit |

Maintained repository surfaces include Claude commands/skills, Codex
`.agents`/`.system` skills, Copilot prompts/GitHub skills, Gemini Markdown/TOML
commands, Grok skills, canonical plugin skills and extension resources. The
fixture separately inventories 19 documentation-skill paths and 10
GitHub/extension supporting-agent paths. These are support assets, not extra
numbered public entrypoints.

Nested and published copies are captured because they exist at the baseline, not
because recursive packaging is a desired design. For an intentional removal or
migration, record the old path, replacement, reason and installed-equivalence
evidence. Do not silently delete entries from the preservation denominator. The
generation/packaging regression tests must distinguish current maintained
outputs from historical published snapshots.

## VS Code inventory

The authoritative source is [extension/package.json](../extension/package.json).
The fixture contains every ID below plus setting type/default/enum/bounds
snapshots in `vscodeConfigurationContracts`. Additions may be additive; existing
IDs must not be silently removed, renamed or repurposed.

### Commands: 44

```text
gofer.run
gofer.eai
gofer.initialize
gofer.installOptionalTools
gofer.upgrade
gofer.showProgress
gofer.showDeliveryLineage
gofer.refreshSpecs
gofer.checkForUpdates
gofer.updateNow
gofer.refreshConstitution
gofer.refreshContextWindow
gofer.refreshAIUsage
gofer.showAIUsage
gofer.showContextCategoryContent
gofer.refreshMemory
gofer.remember
gofer.searchMemory
gofer.forgetMemory
gofer.clearMemory
gofer.viewMemories
gofer.migrateMemoriesToLayered
gofer.queryMemoryUsage
gofer.viewCompactionHistory
gofer.createHintFile
gofer.showConstitution
gofer.updateTemplates
gofer.fixSpecPaths
gofer.openSpec
gofer.createSpec
gofer.showSpecDetails
gofer.showSectionDetails
gofer.showArticleDetails
gofer.showMemoryDocument
gofer.showMemorySection
gofer.openWithPreview
gofer.openWithMarkSharp
gofer.openWithMarkdownEditor
gofer.openWithMarkdownWYSIWYG
gofer.executeAllPendingSpecs
gofer.debugAIUsage
gofer.checkForSlop
gofer.resumeSession
gofer.regenerateInstructions
```

### Configuration keys: 13

```text
gofer.autoInitialize
gofer.preferredAI
gofer.claudeCodeCommand
gofer.cliProvider
gofer.defaultCLI
gofer.workflowProfile
gofer.codexCommand
gofer.markdownViewer
gofer.observationPreservePatterns
gofer.useLayeredMemory
gofer.stageDetectionStalenessMinutes
gofer.aiUsage.statusBar.enabled
gofer.aiUsage.polling.interval
```

Native VS Code evidence does not establish real execution on Claude, Codex,
Copilot CLI, Gemini or Grok. Conversely, native pending cases are not resolved
by manifest equality or mocked VS Code tests.

## Fixture schema and parent handoff

| Key                         | Shape / meaning                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `baselineCommit`, `version` | Fixed public baseline commit and product version.                                       |
| `stageFiles`                | Flat array of 26 filenames including `.md`, relative to `.specify/commands/`.           |
| `publicEntrypoints`         | Flat array: `eai`, `eai-update`.                                                        |
| `surfaceEntrypoints`        | Flat array of 100 repository-relative public wrapper paths.                             |
| `vscodeCommandIds`          | Flat array of all 44 `contributes.commands[].command` values.                           |
| `vscodeConfigurationKeys`   | Flat array of all 13 `contributes.configuration.properties` keys.                       |
| `preservationHashes`        | Flat path-to-lowercase-SHA-256 object for the 11 requested unchanged files.             |
| `internalCommands`          | Full IDs, paths, role, category and aliases.                                            |
| `baselineEvidence`          | Captured baseline results, original failure, rerun, native pending and unproven layers. |
| `rubric`                    | 18 public gate IDs with explicit acceptance, references, gaps and required evidence.    |

Hash checks must fail on missing files or byte differences. Do not hash edited
worktree files to redefine the baseline. Generator and packager changes are
deliberately not in the requested unchanged-file hash set; test their output
against the inventories and preserved contracts.

This document and its fixture define the baseline. They do not certify live host
execution. See the validation report for implemented changes, tested behaviour,
unchanged exclusions, and remaining activation requirements.
