import { createHash } from 'node:crypto';

import type { GoferPortableFileInput } from './contracts.js';

export const GOFER_PORTABLE_SCAFFOLD_VERSION = '3.7.21' as const;
export const GOFER_PORTABLE_SCAFFOLD_REF = 'v3.7.21' as const;
export const GOFER_PORTABLE_SCAFFOLD_COMMIT_SHA =
  '9695a1d85bc7698d6c6eb3c76a3d24efcdcfcc79' as const;
export const GOFER_PORTABLE_SCAFFOLD_INVENTORY_DIGEST =
  '639e7c169336cb3ac6c74c62252b4daeea90787a32ecf0d9b90f26a5c7ac4eb8' as const;

const COMMAND_FILES = [
  '.gitkeep',
  '0_gofer_start.md',
  '0a_problem_validation.md',
  '10_gofer_cloud.md',
  '1_gofer_research.md',
  '2_gofer_specify.md',
  '3_gofer_plan.md',
  '4_gofer_tasks.md',
  '5_gofer_implement.md',
  '6_gofer_validate.md',
  '7_gofer_save.md',
  '7a_stakeholder_comms.md',
  '8_gofer_branding.md',
  '9_gofer_tests.md',
  'gofer_bootstrap_workspace.md',
  'gofer_check_workspace.md',
  'gofer_constitution.md',
  'gofer_diagnose.md',
  'gofer_eai_first_run.md',
  'gofer_hydrate.md',
  'gofer_personality.md',
  'gofer_plan.md',
  'gofer_side.md',
  'gofer_spec_summary.md',
  'gofer_tdd.md',
  'gofer_vocabulary.md',
  'gofer_zoom_out.md',
] as const;

const HINT_FILES = [
  'README.md',
  'examples/README.md',
  'examples/error-handling.yaml',
  'examples/logging-pattern.yaml',
  'examples/testing-pattern.yaml',
  'examples/typescript-patterns.yaml',
  'global.md',
] as const;

const MEMORY_FILES = [
  'constitution.md',
  'context-profiles.yaml',
  'decisions/000-use-adr-for-decisions.md',
  'decisions/001-di-framework.md',
  'decisions/002-module-extraction.md',
  'decisions/003-error-handling.md',
  'decisions/004-cache-eviction.md',
  'decisions/005-constants-management.md',
  'decisions/README.md',
  'diagrams/di-container.mmd',
  'diagrams/extension-activation.mmd',
  'diagrams/module-dependencies.mmd',
  'gofer-model-policy.yaml',
  'lessons.md',
] as const;

const OUTPUT_FILES = ['.gitkeep', 'codex-config-fragment.toml'] as const;

const REFERENCE_FILES = [
  'platform/README.md',
  'platform/deployment-repo.md',
  'platform/eai-app-template.md',
  'platform/eai-config-driven-ui.md',
  'platform/eai-error-catalog.yaml',
  'platform/eai-repo-contract.md',
  'platform/eai-service-patterns.md',
  'platform/eai.md',
  'platform/vertical-template.md',
] as const;

const SCRIPT_FILES = [
  'bash/check-context-health.sh',
  'bash/check-persona-pack.sh',
  'bash/check-prerequisites.sh',
  'bash/common.sh',
  'bash/create-new-feature.sh',
  'bash/install-optional-tools.sh',
  'bash/log-stage.sh',
  'bash/mark-task-complete.sh',
  'bash/pipeline-state.sh',
  'bash/read-failed-approaches.sh',
  'bash/read-session-memories.sh',
  'bash/save-checkpoint.sh',
  'bash/setup-plan.sh',
  'bash/sync-implementation-status.sh',
  'bash/update-agent-context.sh',
  'bash/validate-artifact.sh',
  'bash/verify-task.sh',
  'bash/write-failed-approach.sh',
  'bash/write-periodic-checkpoint.sh',
  'bash/write-session-memory.sh',
  'hooks/agent-stop.mjs',
  'hooks/log-stage-launch-time.mjs',
  'hooks/post-tool-use.mjs',
  'hooks/queued-input.mjs',
  'hooks/session-lifecycle.mjs',
  'hooks/user-prompt-submit.mjs',
  'node/canonical-descriptions.mjs',
  'node/check-version-alignment.mjs',
  'node/codex-doctor.mjs',
  'node/generate-commands.mjs',
  'node/generate-issues.js',
  'node/gofer-closed-loop-audit.mjs',
  'node/gofer-loop-audit.mjs',
  'node/gofer-performance-report.mjs',
  'node/gofer-ui-preview.mjs',
  'node/gofer-workspace-bootstrap.mjs',
  'node/gofer-workspace-check.mjs',
  'node/lib/ai-leverage-tagger.mjs',
  'node/lib/assemble-stakeholder-pack.mjs',
  'node/lib/marp-deck.mjs',
  'node/lib/mermaid-tabular-fallback.mjs',
  'node/lib/render-visual.mjs',
  'node/lib/validate-aliases.mjs',
  'node/lib/visual-counts.mjs',
  'node/lib/visual-pass-pipeline.mjs',
  'node/mermaid-export.mjs',
  'node/package-agent-plugin.mjs',
  'node/parse-stage-command.mjs',
  'node/schemas/.gitkeep',
  'node/schemas/stage-command.schema.json',
  'node/sync-extension-resources.mjs',
  'node/workspace-bootstrap-lib.mjs',
  'powershell/install-optional-tools.ps1',
] as const;

const TEMPLATE_FILES = [
  'agent-file-template.md',
  'assumptions-template.md',
  'audit-history-template.md',
  'brand/brand-profile-template.json',
  'brand/document-style-template.md',
  'brand/marp-theme-template.css',
  'brownfield-analysis.md',
  'business-metrics-template.md',
  'business-owner-summary-template.md',
  'checklist-template.md',
  'ciso-security-summary-template.md',
  'context-bundle-template.md',
  'contract-pack-template.md',
  'cto-architecture-summary-template.md',
  'discovery-template.md',
  'eai-preflight-template.md',
  'goal-ledger-template.json',
  'gofer-model-policy.yaml',
  'issues-template.md',
  'journey/base-journey.md',
  'journey/industry-variants.yaml',
  'loop-contract-template.json',
  'plan-template.md',
  'problem-brief-template.md',
  'proposal-review-template.md',
  'research-template.md',
  'reuse-scan-template.md',
  'sequence-diagrams/option-spectrum.yaml',
  'service-fit-matrix-template.md',
  'session-handoff-template.md',
  'spec-summary-template.md',
  'spec-template.md',
  'stakeholder-comms-template.md',
  'stakeholder-review-index-template.md',
  'tasks-template.md',
  'ui-preview-brief-template.md',
  'ui-review-log-template.md',
  'ui-show-and-tell-template.md',
  'visuals/.gitkeep',
  'visuals/bounded-context-map.md',
  'visuals/bounded-context-template.md',
  'visuals/c4-container-template.md',
  'visuals/c4-container.md',
  'visuals/c4-context-template.md',
  'visuals/capability-heatmap-template.md',
  'visuals/data-model-erd-template.md',
  'visuals/erd.md',
  'visuals/impact-canvas.md',
  'visuals/risk-heatmap-template.md',
  'visuals/roi-projection.md',
  'visuals/value-stream-asis.md',
  'visuals/value-stream-tobe.md',
  'working-backwards-prfaq-template.md',
] as const;

function under(root: string, files: readonly string[]): string[] {
  return files.map((file) => `.specify/${root}/${file}`);
}

/** Exact repository-owned scaffold files shipped by the v3.7.21 release. */
export const GOFER_PORTABLE_SCAFFOLD_PATHS: readonly string[] = Object.freeze(
  [
    '.specify/.gofer-version',
    '.specify/README.md',
    '.specify/spec-schema.json',
    '.specify/specs/.gitkeep',
    '.specify/state/.gitkeep',
    ...under('commands', COMMAND_FILES),
    ...under('hints', HINT_FILES),
    ...under('memory', MEMORY_FILES),
    ...under('outputs', OUTPUT_FILES),
    ...under('references', REFERENCE_FILES),
    ...under('scripts', SCRIPT_FILES),
    ...under('templates', TEMPLATE_FILES),
  ].sort()
);

const PORTABLE_PATHS = new Set(GOFER_PORTABLE_SCAFFOLD_PATHS);

/** Hash the sorted newline-delimited path inventory used by scaffold consumers. */
export function createGoferScaffoldInventoryDigest(paths: readonly string[]): string {
  return createHash('sha256')
    .update(`${[...paths].sort().join('\n')}\n`)
    .digest('hex');
}

/** Distinguishes release-owned scaffold files from feature and runtime state. */
export function isPortableGoferScaffoldPath(path: string): boolean {
  return PORTABLE_PATHS.has(path);
}

/** Rejects runtime state and feature files that are not declared export evidence. */
export function assertPortableOrDeclaredGoferFiles(
  files: readonly GoferPortableFileInput[],
  declaredEvidencePaths: ReadonlySet<string>
): void {
  for (const file of files) {
    if (!isPortableGoferScaffoldPath(file.path) && !declaredEvidencePaths.has(file.path)) {
      throw new Error(`Gofer export contains undeclared runtime file: ${file.path}`);
    }
  }
}

/** Requires the exact pinned release inventory and matching root version marker. */
export function assertPortableGoferScaffold(
  files: readonly GoferPortableFileInput[],
  scaffoldVersion: string
): void {
  const normalizedVersion = scaffoldVersion.replace(/^v/, '');
  if (normalizedVersion !== GOFER_PORTABLE_SCAFFOLD_VERSION) {
    throw new Error(`Unsupported portable Gofer scaffold version: ${scaffoldVersion}`);
  }

  const filesByPath = new Map(files.map((file) => [file.path, file]));
  for (const path of GOFER_PORTABLE_SCAFFOLD_PATHS) {
    if (!filesByPath.has(path)) {
      throw new Error(
        `Pinned Gofer v${GOFER_PORTABLE_SCAFFOLD_VERSION} scaffold is missing ${path}`
      );
    }
  }

  const inventoryDigest = createGoferScaffoldInventoryDigest(GOFER_PORTABLE_SCAFFOLD_PATHS);
  if (inventoryDigest !== GOFER_PORTABLE_SCAFFOLD_INVENTORY_DIGEST) {
    throw new Error(
      `Pinned Gofer v${GOFER_PORTABLE_SCAFFOLD_VERSION} inventory digest does not match its canonical contract.`
    );
  }

  const marker = filesByPath.get('.specify/.gofer-version');
  if (marker?.encoding !== 'utf8' || marker.content.trim() !== GOFER_PORTABLE_SCAFFOLD_VERSION) {
    throw new Error(`.specify/.gofer-version must contain ${GOFER_PORTABLE_SCAFFOLD_VERSION}.`);
  }
}
