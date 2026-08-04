import {
  GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
  GOFER_PIPELINE_STAGES,
  GOFER_REQUIRED_PIPELINE_STAGES,
  type GoferApprovalRecord,
  type GoferArtifactRecord,
  type GoferArtifactReference,
  type GoferPipelineStage,
  type GoferRun,
  type GoferValidationResult,
} from './contracts.js';
import { assertGoferReleaseDescriptor } from './releaseDescriptor.js';
import { isNonEmptyString } from './validationUtils.js';

const TERMINAL_RUN_STATUSES = new Set(['approved', 'completed', 'failed', 'cancelled']);
const RUN_STATUSES = new Set([
  'initialized',
  'running',
  'awaiting_approval',
  'approved',
  'completed',
  'failed',
  'cancelled',
]);
const STAGE_STATUSES = new Set([
  'pending',
  'running',
  'awaiting_approval',
  'approved',
  'changes_requested',
  'stale',
  'failed',
  'cancelled',
]);
const EXECUTION_REFERENCE_PROVIDERS = new Set([
  'eai-workflow',
  'eai-conversation',
  'local-cli',
  'vscode',
]);
const NON_CURRENT_ARTIFACT_STATUSES = new Set(['stale', 'superseded', 'blocked']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FEATURE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_STAGE_TRANSITIONS: Readonly<
  Record<GoferPipelineStage, readonly GoferPipelineStage[]>
> = {
  '0_start': ['0a_problem_validation', '1_research'],
  '0a_problem_validation': ['1_research'],
  '1_research': ['2_specify'],
  '2_specify': ['3_plan'],
  '3_plan': ['4_tasks'],
  '4_tasks': [],
};

function result(errors: string[]): GoferValidationResult {
  return { valid: errors.length === 0, errors };
}

function isIsoTimestamp(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function latestArtifactsById(
  artifacts: readonly GoferArtifactRecord[],
  runId?: string
): ReadonlyMap<string, GoferArtifactRecord> {
  const latest = new Map<string, GoferArtifactRecord>();
  for (const artifact of artifacts) {
    if (runId && artifact.runId !== runId) {
      continue;
    }
    const existing = latest.get(artifact.artifactId);
    if (!existing || artifact.version > existing.version) {
      latest.set(artifact.artifactId, artifact);
    }
  }
  return latest;
}

function sameArtifactReference(
  left: GoferArtifactReference,
  right: GoferArtifactReference
): boolean {
  return (
    left.artifactId === right.artifactId &&
    left.version === right.version &&
    left.sha256 === right.sha256
  );
}

function sortedReferenceKeys(refs: readonly GoferArtifactReference[]): string[] {
  return refs
    .map((ref) => `${ref.artifactId}:${ref.version}:${ref.sha256}`)
    .sort((left, right) => left.localeCompare(right));
}

function requiredPredecessors(stage: GoferPipelineStage): readonly GoferPipelineStage[] {
  if (stage === '0_start') {
    return [];
  }

  const targetIndex = GOFER_REQUIRED_PIPELINE_STAGES.indexOf(
    stage as (typeof GOFER_REQUIRED_PIPELINE_STAGES)[number]
  );
  if (targetIndex === -1) {
    return ['0_start'];
  }

  return GOFER_REQUIRED_PIPELINE_STAGES.slice(0, targetIndex);
}

/** Validates the portable run projection without consulting persistence. */
export function validateGoferRun(run: GoferRun): GoferValidationResult {
  const errors: string[] = [];

  if (run.schemaVersion !== GOFER_ADMIN_PORTAL_CONTRACT_VERSION) {
    errors.push(`schemaVersion must be ${GOFER_ADMIN_PORTAL_CONTRACT_VERSION}.`);
  }
  for (const [field, value] of [
    ['runId', run.runId],
    ['tenantId', run.tenantId],
    ['appKey', run.appKey],
    ['draftId', run.draftId],
  ] as const) {
    if (!isNonEmptyString(value)) {
      errors.push(`${field} is required.`);
    }
  }
  try {
    assertGoferReleaseDescriptor(run.goferRelease);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'goferRelease is invalid.');
  }
  if (!FEATURE_SLUG_PATTERN.test(run.featureSlug)) {
    errors.push('featureSlug must contain lowercase letters, numbers, and single hyphens only.');
  }
  if (!RUN_STATUSES.has(run.status)) {
    errors.push('status is invalid.');
  }
  if (!GOFER_PIPELINE_STAGES.includes(run.currentStage)) {
    errors.push('currentStage is invalid.');
  }
  if (!isIsoTimestamp(run.createdAt) || !isIsoTimestamp(run.updatedAt)) {
    errors.push('createdAt and updatedAt must be ISO8601 timestamps.');
  }
  if (Date.parse(run.updatedAt) < Date.parse(run.createdAt)) {
    errors.push('updatedAt cannot precede createdAt.');
  }

  const seenStages = new Set<GoferPipelineStage>();
  for (const stage of run.stages) {
    if (!GOFER_PIPELINE_STAGES.includes(stage.stage)) {
      errors.push(`Stage ${stage.stage} is invalid.`);
    }
    if (!STAGE_STATUSES.has(stage.status)) {
      errors.push(`Stage ${stage.stage} status is invalid.`);
    }
    if (seenStages.has(stage.stage)) {
      errors.push(`stages contains duplicate stage ${stage.stage}.`);
    }
    seenStages.add(stage.stage);
    if (!Number.isInteger(stage.attempt) || stage.attempt < 0) {
      errors.push(`Stage ${stage.stage} attempt must be a non-negative integer.`);
    }
  }
  if (!seenStages.has(run.currentStage)) {
    errors.push('currentStage must have a matching stages entry.');
  }
  const stageOrder = run.stages.map((stage) => stage.stage).join('|');
  const requiredOrder = GOFER_REQUIRED_PIPELINE_STAGES.join('|');
  const fullOrder = GOFER_PIPELINE_STAGES.join('|');
  if (stageOrder !== requiredOrder && stageOrder !== fullOrder) {
    errors.push('stages must follow the canonical Gofer pipeline order.');
  }
  if (run.executionReference) {
    if (!EXECUTION_REFERENCE_PROVIDERS.has(run.executionReference.provider)) {
      errors.push('executionReference.provider is invalid.');
    }
    if (
      typeof run.executionReference.executionId !== 'string' ||
      !run.executionReference.executionId.trim()
    ) {
      errors.push('executionReference.executionId is required when executionReference is present.');
    }
    if (
      run.executionReference.workflowKey !== undefined &&
      !run.executionReference.workflowKey.trim()
    ) {
      errors.push('executionReference.workflowKey must not be empty when present.');
    }
  }

  return result(errors);
}

/** Enforces the numbered Gofer order and tenant-admin approval gate between stages. */
export function validateStageTransition(
  run: GoferRun,
  nextStage: GoferPipelineStage
): GoferValidationResult {
  const errors = [...validateGoferRun(run).errors];
  const currentState = run.stages.find((stage) => stage.stage === run.currentStage);
  const nextState = run.stages.find((stage) => stage.stage === nextStage);

  if (TERMINAL_RUN_STATUSES.has(run.status)) {
    errors.push(`Run status ${run.status} does not allow another stage transition.`);
  }
  if (!GOFER_PIPELINE_STAGES.includes(nextStage)) {
    errors.push('nextStage is invalid.');
    return result(errors);
  }
  const allowedNextStages = ALLOWED_STAGE_TRANSITIONS[run.currentStage];
  if (!allowedNextStages) {
    return result(errors);
  }
  if (!allowedNextStages.includes(nextStage)) {
    errors.push(`Stage ${run.currentStage} cannot transition directly to ${nextStage}.`);
  }
  if (!currentState || currentState.status !== 'approved') {
    errors.push(`Current stage ${run.currentStage} must be approved before transition.`);
  }
  if (nextState && ['running', 'awaiting_approval', 'approved'].includes(nextState.status)) {
    errors.push(`Stage ${nextStage} is already ${nextState.status}.`);
  }

  for (const predecessor of requiredPredecessors(nextStage)) {
    const predecessorState = run.stages.find((stage) => stage.stage === predecessor);
    if (!predecessorState || predecessorState.status !== 'approved') {
      errors.push(`Required predecessor ${predecessor} must be approved.`);
    }
  }

  const problemValidation = run.stages.find((stage) => stage.stage === '0a_problem_validation');
  if (nextStage !== '0a_problem_validation' && problemValidation?.status !== undefined) {
    if (problemValidation.status !== 'approved') {
      errors.push('Optional stage 0a_problem_validation must be approved when it is present.');
    }
  }

  return result(errors);
}

/** Detects stale output when any consumed artifact is missing, replaced, or changed. */
export function validateArtifactFreshness(
  artifact: GoferArtifactRecord,
  allArtifacts: readonly GoferArtifactRecord[]
): GoferValidationResult {
  const errors: string[] = [];
  const latest = latestArtifactsById(allArtifacts, artifact.runId);
  const latestArtifact = latest.get(artifact.artifactId);

  if (artifact.schemaVersion !== GOFER_ADMIN_PORTAL_CONTRACT_VERSION) {
    errors.push(
      `Artifact ${artifact.artifactId} schemaVersion must be ${GOFER_ADMIN_PORTAL_CONTRACT_VERSION}.`
    );
  }
  if (!artifact.runId.trim()) {
    errors.push(`Artifact ${artifact.artifactId} runId is required.`);
  }
  if (!Number.isInteger(artifact.version) || artifact.version < 1) {
    errors.push(`Artifact ${artifact.artifactId} version must be a positive integer.`);
  }
  if (!SHA256_PATTERN.test(artifact.sha256)) {
    errors.push(`Artifact ${artifact.artifactId} sha256 is invalid.`);
  }
  if (NON_CURRENT_ARTIFACT_STATUSES.has(artifact.status)) {
    errors.push(`Artifact ${artifact.artifactId} is ${artifact.status}.`);
  }
  if (latestArtifact && latestArtifact.version !== artifact.version) {
    errors.push(
      `Artifact ${artifact.artifactId} version ${artifact.version} is superseded by version ${latestArtifact.version}.`
    );
  }

  for (const input of artifact.inputArtifacts) {
    const latestInput = latest.get(input.artifactId);
    if (!latestInput) {
      errors.push(`Input artifact ${input.artifactId} is missing.`);
      continue;
    }
    if (!sameArtifactReference(input, latestInput)) {
      errors.push(
        `Input artifact ${input.artifactId} no longer matches version ${input.version} and hash ${input.sha256}.`
      );
    }
    if (NON_CURRENT_ARTIFACT_STATUSES.has(latestInput.status)) {
      errors.push(`Input artifact ${input.artifactId} is ${latestInput.status}.`);
    }
  }

  return result(errors);
}

/** Validates that a decision covers the exact current artifact set for its stage. */
export function validateStageApproval(
  run: GoferRun,
  approval: GoferApprovalRecord,
  artifacts: readonly GoferArtifactRecord[]
): GoferValidationResult {
  const errors: string[] = [];
  const stage = run.stages.find((candidate) => candidate.stage === approval.stage);
  const latest = latestArtifactsById(artifacts, run.runId);

  if (approval.schemaVersion !== GOFER_ADMIN_PORTAL_CONTRACT_VERSION) {
    errors.push(`Approval schemaVersion must be ${GOFER_ADMIN_PORTAL_CONTRACT_VERSION}.`);
  }
  if (approval.runId !== run.runId) {
    errors.push('Approval runId must match the run.');
  }
  if (approval.actor.role !== 'tenant-admin' || !approval.actor.subjectId.trim()) {
    errors.push('Approval actor must be an identified tenant-admin.');
  }
  if (!isIsoTimestamp(approval.decidedAt)) {
    errors.push('Approval decidedAt must be an ISO8601 timestamp.');
  }
  if (!stage) {
    errors.push(`Approval stage ${approval.stage} is not present in the run.`);
    return result(errors);
  }

  if (approval.decision === 'approved' && stage.status !== 'awaiting_approval') {
    errors.push(`Stage ${approval.stage} must be awaiting_approval before approval.`);
  }
  if (
    approval.decision === 'changes_requested' &&
    !['awaiting_approval', 'approved'].includes(stage.status)
  ) {
    errors.push(
      `Stage ${approval.stage} must be awaiting_approval or approved before requesting changes.`
    );
  }
  if (approval.decision === 'revoked' && stage.status !== 'approved') {
    errors.push(`Stage ${approval.stage} must be approved before revocation.`);
  }

  const expectedRefs = stage.artifactIds
    .map((artifactId) => latest.get(artifactId))
    .filter((artifact): artifact is GoferArtifactRecord => artifact !== undefined)
    .map<GoferArtifactReference>((artifact) => ({
      artifactId: artifact.artifactId,
      version: artifact.version,
      sha256: artifact.sha256,
    }));

  if (expectedRefs.length !== stage.artifactIds.length) {
    errors.push(`Stage ${approval.stage} references missing artifacts.`);
  }
  if (
    sortedReferenceKeys(expectedRefs).join('|') !==
    sortedReferenceKeys(approval.artifactRefs).join('|')
  ) {
    errors.push('Approval artifactRefs must match the exact current stage artifacts.');
  }
  for (const artifactRef of approval.artifactRefs) {
    const artifact = latest.get(artifactRef.artifactId);
    if (artifact) {
      if (artifact.stage !== approval.stage) {
        errors.push(
          `Approval artifact ${artifact.artifactId} must belong to stage ${approval.stage}.`
        );
      }
      errors.push(...validateArtifactFreshness(artifact, artifacts).errors);
    }
  }

  return result([...new Set(errors)]);
}

/** Enforces current artifacts and exact immutable approvals for every approved stage. */
export function validateGenerationReadiness(
  run: GoferRun,
  artifacts: readonly GoferArtifactRecord[],
  approvals: readonly GoferApprovalRecord[]
): GoferValidationResult {
  const errors = [...validateGoferRun(run).errors];
  const latest = latestArtifactsById(artifacts, run.runId);

  for (const requiredStage of GOFER_REQUIRED_PIPELINE_STAGES) {
    const state = run.stages.find((stage) => stage.stage === requiredStage);
    if (!state || state.status !== 'approved') {
      errors.push(`Required stage ${requiredStage} must be approved.`);
    }
  }

  const optionalStage = run.stages.find((stage) => stage.stage === '0a_problem_validation');
  if (optionalStage && optionalStage.status !== 'approved') {
    errors.push('Optional stage 0a_problem_validation must be approved when present.');
  }

  for (const state of run.stages.filter((stage) => stage.status === 'approved')) {
    for (const artifactId of state.artifactIds) {
      const artifact = latest.get(artifactId);
      if (!artifact) {
        errors.push(`Approved stage ${state.stage} references missing artifact ${artifactId}.`);
      } else {
        if (artifact.stage !== state.stage) {
          errors.push(`Artifact ${artifactId} must belong to approved stage ${state.stage}.`);
        }
        errors.push(...validateArtifactFreshness(artifact, artifacts).errors);
      }
    }

    const approval = state.approvalId
      ? approvals.find((candidate) => candidate.approvalId === state.approvalId)
      : undefined;
    if (!approval || approval.decision !== 'approved') {
      errors.push(`Approved stage ${state.stage} requires its immutable approval record.`);
      continue;
    }
    if (approval.schemaVersion !== GOFER_ADMIN_PORTAL_CONTRACT_VERSION) {
      errors.push(
        `Stage ${state.stage} approval schemaVersion must be ${GOFER_ADMIN_PORTAL_CONTRACT_VERSION}.`
      );
    }
    if (approval.runId !== run.runId || approval.stage !== state.stage) {
      errors.push(`Stage ${state.stage} approval must belong to this run and stage.`);
    }
    if (approval.actor.role !== 'tenant-admin' || !approval.actor.subjectId.trim()) {
      errors.push(`Stage ${state.stage} approval must identify its tenant-admin actor.`);
    }
    if (!isIsoTimestamp(approval.decidedAt)) {
      errors.push(`Stage ${state.stage} approval decidedAt must be an ISO8601 timestamp.`);
    }
    const expectedRefs = state.artifactIds
      .map((artifactId) => latest.get(artifactId))
      .filter((artifact): artifact is GoferArtifactRecord => artifact !== undefined)
      .map((artifact) => `${artifact.artifactId}:${artifact.version}:${artifact.sha256}`)
      .sort();
    if (expectedRefs.join('|') !== sortedReferenceKeys(approval.artifactRefs).join('|')) {
      errors.push(`Stage ${state.stage} approval does not match its current artifacts.`);
    }
  }

  return result([...new Set(errors)]);
}

export {
  validateStageExecutionRequest,
  validateStageExecutionResult,
} from './stageExecutionValidators.js';
