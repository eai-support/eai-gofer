import { createHash } from 'node:crypto';
import {
  GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
  GOFER_ARTIFACT_KINDS,
  GOFER_PIPELINE_STAGES,
  GOFER_REQUIRED_ARTIFACT_KINDS_BY_STAGE,
  type GoferArtifactReference,
  type GoferPortableFile,
  type GoferStageExecutionRequest,
  type GoferStageExecutionResult,
  type GoferValidationResult,
} from './contracts.js';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FEATURE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STAGE_EXECUTION_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;
const EXECUTION_REFERENCE_PROVIDERS = new Set([
  'eai-workflow',
  'eai-conversation',
  'local-cli',
  'vscode',
]);
const STAGE_EXECUTION_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function result(errors: string[]): GoferValidationResult {
  return { valid: errors.length === 0, errors };
}

function isIsoTimestamp(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sortedReferenceKeys(refs: readonly GoferArtifactReference[]): string[] {
  return refs
    .map((ref) => `${ref.artifactId}:${ref.version}:${ref.sha256}`)
    .sort((left, right) => left.localeCompare(right));
}

function validateArtifactReferences(
  refs: readonly GoferArtifactReference[],
  label: string
): string[] {
  const errors: string[] = [];
  const artifactIds = new Set<string>();
  for (const ref of refs) {
    if (!ref.artifactId.trim()) {
      errors.push(`${label} artifactId is required.`);
    } else if (artifactIds.has(ref.artifactId)) {
      errors.push(`${label} contains duplicate artifactId ${ref.artifactId}.`);
    }
    artifactIds.add(ref.artifactId);
    if (!Number.isInteger(ref.version) || ref.version < 1) {
      errors.push(`${label} ${ref.artifactId} version must be a positive integer.`);
    }
    if (!SHA256_PATTERN.test(ref.sha256)) {
      errors.push(`${label} ${ref.artifactId} sha256 is invalid.`);
    }
  }
  return errors;
}

function validateExecutionReference(
  reference: GoferStageExecutionRequest['executionReference'],
  label: string
): string[] {
  const errors: string[] = [];
  if (!EXECUTION_REFERENCE_PROVIDERS.has(reference.provider)) {
    errors.push(`${label}.provider is invalid.`);
  }
  if (!reference.executionId.trim()) {
    errors.push(`${label}.executionId is required.`);
  }
  if (reference.workflowKey !== undefined && !reference.workflowKey.trim()) {
    errors.push(`${label}.workflowKey must not be empty when present.`);
  }
  return errors;
}

function executionReferenceKey(
  reference: GoferStageExecutionRequest['executionReference']
): string {
  return `${reference.provider}:${reference.executionId}:${reference.workflowKey ?? ''}`;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

function isConfinedStageOutputPath(path: string, featureSlug: string): boolean {
  const featureRoot = `.specify/specs/${featureSlug}/`;
  return (
    path.startsWith(featureRoot) &&
    !path.includes('\\') &&
    !hasControlCharacter(path) &&
    !path.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')
  );
}

function contentHash(file: GoferPortableFile, errors: string[]): string | undefined {
  let bytes: Buffer;
  if (file.encoding === 'utf8') {
    bytes = Buffer.from(file.content, 'utf8');
  } else if (file.encoding === 'base64') {
    if (!BASE64_PATTERN.test(file.content)) {
      errors.push(`Stage result file ${file.path} contains invalid base64 content.`);
      return undefined;
    }
    bytes = Buffer.from(file.content, 'base64');
  } else {
    errors.push(`Stage result file ${file.path} encoding must be utf8 or base64.`);
    return undefined;
  }
  return createHash('sha256').update(bytes).digest('hex');
}

/** Validates a stage request before any executor adapter receives it. */
export function validateStageExecutionRequest(
  request: GoferStageExecutionRequest
): GoferValidationResult {
  const errors: string[] = [];
  if (request.schemaVersion !== GOFER_ADMIN_PORTAL_CONTRACT_VERSION) {
    errors.push(`Stage request schemaVersion must be ${GOFER_ADMIN_PORTAL_CONTRACT_VERSION}.`);
  }
  if (!isNonEmptyString(request.tenantId)) {
    errors.push('Stage request tenantId is required.');
  }
  if (!isNonEmptyString(request.appKey)) {
    errors.push('Stage request appKey is required.');
  }
  if (!isNonEmptyString(request.runId)) {
    errors.push('Stage request runId is required.');
  }
  if (!FEATURE_SLUG_PATTERN.test(request.featureSlug)) {
    errors.push(
      'Stage request featureSlug must contain lowercase letters, numbers, and single hyphens only.'
    );
  }
  if (!GOFER_PIPELINE_STAGES.includes(request.stage)) {
    errors.push('Stage request stage is invalid.');
  }
  if (!isIsoTimestamp(request.requestedAt)) {
    errors.push('Stage request requestedAt must be an ISO8601 timestamp.');
  }
  errors.push(
    ...validateArtifactReferences(request.inputArtifacts, 'Stage request inputArtifacts')
  );

  const sourceIds = new Set<string>();
  for (const sourceId of request.sourceIds) {
    if (!sourceId.trim()) {
      errors.push('Stage request sourceIds must not contain an empty value.');
    } else if (sourceIds.has(sourceId)) {
      errors.push(`Stage request sourceIds contains duplicate sourceId ${sourceId}.`);
    }
    sourceIds.add(sourceId);
  }
  errors.push(
    ...validateExecutionReference(request.executionReference, 'Stage request executionReference')
  );
  return result([...new Set(errors)]);
}

/** Validates terminal worker output against the exact request ownership and lineage. */
export function validateStageExecutionResult(
  request: GoferStageExecutionRequest,
  executionResult: GoferStageExecutionResult
): GoferValidationResult {
  const errors = [...validateStageExecutionRequest(request).errors];
  if (executionResult.schemaVersion !== GOFER_ADMIN_PORTAL_CONTRACT_VERSION) {
    errors.push(`Stage result schemaVersion must be ${GOFER_ADMIN_PORTAL_CONTRACT_VERSION}.`);
  }
  if (
    executionResult.tenantId !== request.tenantId ||
    executionResult.appKey !== request.appKey ||
    executionResult.runId !== request.runId ||
    executionResult.stage !== request.stage
  ) {
    errors.push('Stage result tenantId, appKey, runId, and stage must match the request.');
  }
  if (!GOFER_PIPELINE_STAGES.includes(executionResult.stage)) {
    errors.push('Stage result stage is invalid.');
  }
  if (!STAGE_EXECUTION_STATUSES.has(executionResult.status)) {
    errors.push('Stage result status must be succeeded, failed, or cancelled.');
  }
  errors.push(
    ...validateExecutionReference(
      executionResult.executionReference,
      'Stage result executionReference'
    )
  );
  if (
    executionReferenceKey(executionResult.executionReference) !==
    executionReferenceKey(request.executionReference)
  ) {
    errors.push('Stage result executionReference must match the request.');
  }
  if (!isIsoTimestamp(executionResult.completedAt)) {
    errors.push('Stage result completedAt must be an ISO8601 timestamp.');
  }
  if (executionResult.startedAt && !isIsoTimestamp(executionResult.startedAt)) {
    errors.push('Stage result startedAt must be an ISO8601 timestamp when present.');
  }
  const requestedAt = Date.parse(request.requestedAt);
  const startedAt = executionResult.startedAt ? Date.parse(executionResult.startedAt) : requestedAt;
  const completedAt = Date.parse(executionResult.completedAt);
  if (startedAt < requestedAt || completedAt < startedAt) {
    errors.push('Stage result timestamps must follow requestedAt, startedAt, then completedAt.');
  }

  if (executionResult.status === 'succeeded') {
    validateSuccessfulOutput(request, executionResult, errors);
  } else if (executionResult.artifacts.length > 0 || executionResult.files.length > 0) {
    errors.push('A failed or cancelled stage result must not return artifacts or files.');
  }

  if (executionResult.status === 'failed' && !executionResult.error) {
    errors.push('A failed stage result must contain a bounded error.');
  }
  if (executionResult.error) {
    if (!STAGE_EXECUTION_ERROR_CODE_PATTERN.test(executionResult.error.code)) {
      errors.push('Stage result error.code must be an uppercase controlled code.');
    }
    if (!executionResult.error.message.trim() || executionResult.error.message.length > 1024) {
      errors.push('Stage result error.message must contain 1 to 1024 characters.');
    }
    if (typeof executionResult.error.retryable !== 'boolean') {
      errors.push('Stage result error.retryable must be boolean.');
    }
  }

  return result([...new Set(errors)]);
}

function validateSuccessfulOutput(
  request: GoferStageExecutionRequest,
  executionResult: GoferStageExecutionResult,
  errors: string[]
): void {
  if (executionResult.error) {
    errors.push('A succeeded stage result must not contain an error.');
  }
  if (executionResult.artifacts.length === 0) {
    errors.push('A succeeded stage result must contain at least one artifact.');
  }
  if (executionResult.files.length === 0) {
    errors.push('A succeeded stage result must contain at least one portable file.');
  }

  const artifactIds = new Set<string>();
  const artifactPaths = new Set<string>();
  const artifactKinds = new Set<string>();
  for (const artifact of executionResult.artifacts) {
    if (artifactIds.has(artifact.artifactId)) {
      errors.push(`Stage result contains duplicate artifactId ${artifact.artifactId}.`);
    }
    artifactIds.add(artifact.artifactId);
    if (artifactPaths.has(artifact.path)) {
      errors.push(`Stage result contains duplicate artifact path ${artifact.path}.`);
    }
    artifactPaths.add(artifact.path);
    artifactKinds.add(artifact.kind);
    if (
      artifact.schemaVersion !== GOFER_ADMIN_PORTAL_CONTRACT_VERSION ||
      artifact.runId !== request.runId ||
      artifact.stage !== request.stage
    ) {
      errors.push(
        `Stage result artifact ${artifact.artifactId} must belong to the request run and stage.`
      );
    }
    if (!Number.isInteger(artifact.version) || artifact.version < 1) {
      errors.push(`Stage result artifact ${artifact.artifactId} version must be positive.`);
    }
    if (!SHA256_PATTERN.test(artifact.sha256)) {
      errors.push(`Stage result artifact ${artifact.artifactId} sha256 is invalid.`);
    }
    if (!GOFER_ARTIFACT_KINDS.includes(artifact.kind)) {
      errors.push(`Stage result artifact ${artifact.artifactId} kind is invalid.`);
    }
    if (artifact.status !== 'current') {
      errors.push(`Stage result artifact ${artifact.artifactId} status must be current.`);
    }
    if (!isConfinedStageOutputPath(artifact.path, request.featureSlug)) {
      errors.push(
        `Stage result artifact ${artifact.artifactId} path must be confined to .specify/specs/${request.featureSlug}/.`
      );
    }
    if (!artifact.createdBy.trim()) {
      errors.push(`Stage result artifact ${artifact.artifactId} createdBy is required.`);
    }
    if (!isIsoTimestamp(artifact.createdAt)) {
      errors.push(`Stage result artifact ${artifact.artifactId} createdAt must be ISO8601.`);
    }
    errors.push(
      ...validateArtifactReferences(
        artifact.inputArtifacts,
        `Stage result artifact ${artifact.artifactId} inputArtifacts`
      )
    );
    const artifactSourceIds = new Set<string>();
    for (const sourceId of artifact.sourceIds) {
      if (!sourceId.trim()) {
        errors.push(
          `Stage result artifact ${artifact.artifactId} sourceIds must not contain an empty value.`
        );
      } else if (artifactSourceIds.has(sourceId)) {
        errors.push(
          `Stage result artifact ${artifact.artifactId} sourceIds contains duplicate sourceId ${sourceId}.`
        );
      }
      artifactSourceIds.add(sourceId);
    }
    if (
      sortedReferenceKeys(artifact.inputArtifacts).join('|') !==
      sortedReferenceKeys(request.inputArtifacts).join('|')
    ) {
      errors.push(
        `Stage result artifact ${artifact.artifactId} inputArtifacts must match the exact request inputArtifacts.`
      );
    }
    if ([...artifactSourceIds].sort().join('|') !== [...request.sourceIds].sort().join('|')) {
      errors.push(
        `Stage result artifact ${artifact.artifactId} sourceIds must match the exact request sourceIds.`
      );
    }
  }

  if (GOFER_PIPELINE_STAGES.includes(request.stage)) {
    for (const requiredKind of GOFER_REQUIRED_ARTIFACT_KINDS_BY_STAGE[request.stage]) {
      if (!artifactKinds.has(requiredKind)) {
        errors.push(
          `Stage result for ${request.stage} requires current artifact kind ${requiredKind}.`
        );
      }
    }
  }

  const filesByPath = new Map<string, GoferPortableFile>();
  for (const file of executionResult.files) {
    if (filesByPath.has(file.path)) {
      errors.push(`Stage result contains duplicate file path ${file.path}.`);
    }
    filesByPath.set(file.path, file);
    if (!isConfinedStageOutputPath(file.path, request.featureSlug)) {
      errors.push(
        `Stage result file path must be confined to .specify/specs/${request.featureSlug}/: ${file.path}.`
      );
    }
    if (!SHA256_PATTERN.test(file.sha256)) {
      errors.push(`Stage result file ${file.path} sha256 is invalid.`);
    }
    const actualHash = contentHash(file, errors);
    if (actualHash && actualHash !== file.sha256) {
      errors.push(`Stage result file ${file.path} content does not match sha256.`);
    }
  }

  for (const artifact of executionResult.artifacts) {
    const file = filesByPath.get(artifact.path);
    if (!file) {
      errors.push(`Stage result artifact ${artifact.artifactId} has no matching portable file.`);
    } else if (file.sha256 !== artifact.sha256) {
      errors.push(
        `Stage result artifact ${artifact.artifactId} sha256 must match its portable file.`
      );
    }
  }
  for (const file of executionResult.files) {
    if (!artifactPaths.has(file.path)) {
      errors.push(`Stage result file ${file.path} has no matching artifact record.`);
    }
  }
}
