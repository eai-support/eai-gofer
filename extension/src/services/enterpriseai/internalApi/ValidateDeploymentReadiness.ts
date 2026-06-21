import * as fs from 'fs/promises';
import * as path from 'path';
import { validateEventPayload } from '../contracts/EventPayloadSchemas';
import { validateInternalApiPayload } from '../contracts/InternalApiSchemas';

export interface ValidateDeploymentReadinessRequest {
  runId: string;
  stage: string;
  deploymentTaskId: string;
  requiredFiles: readonly string[];
  blockCompletionOnFailure: boolean;
}

export interface ValidateDeploymentReadinessResponse {
  status: 'completed';
  readinessPassed: boolean;
  missingFiles: readonly string[];
  validatedAt: string;
  deploymentTaskCompletionAllowed: boolean;
}

export interface DeploymentReadinessValidatedEventPayload {
  eventId: string;
  runId: string;
  deploymentTaskId: string;
  readinessPassed: boolean;
  missingFiles: readonly string[];
  validatedAt: string;
}

export interface ValidateDeploymentReadinessEvent {
  contractId: 'EVT-012';
  eventName: 'deployment.readiness.validated.v1';
  payload: DeploymentReadinessValidatedEventPayload;
}

export interface ValidateDeploymentReadinessResult {
  contractId: 'IAP-011';
  operationName: 'implementation.validateDeploymentReadiness';
  response: ValidateDeploymentReadinessResponse;
  emittedEvent: ValidateDeploymentReadinessEvent;
}

export interface ValidateDeploymentReadinessOptions {
  eventId?: string;
  validatedAt?: string;
  workspaceRoot?: string;
  eventPublisher?: (payload: DeploymentReadinessValidatedEventPayload) => void;
}

const ALLOWED_REQUIRED_DEPLOYMENT_FILES = new Set<string>([
  'eai.runtime.json',
  '.env.example',
  'deployment/.env.example',
  '.eai/deploy-doctor.json',
  '.eai/runtime-doctor.json',
  'deployment/deploy-doctor.json',
  'deployment/runtime-doctor.json',
]);

function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

function buildEventId(prefix: string, isoTimestamp: string): string {
  return `${prefix}_${isoTimestamp.replace(/[-:.TZ]/g, '')}`;
}

function assertImplementationStage(stage: string): void {
  if (stage !== 'implementation') {
    throw new Error(
      'IMPL_DEPLOYMENT_VALIDATION_FAILED: deployment readiness validation requires stage=implementation.'
    );
  }
}

function normalizeRequiredFiles(requiredFiles: readonly string[]): readonly string[] {
  return Array.from(
    new Set(
      requiredFiles
        .map((requiredFile: string): string => normalizeRequiredFile(requiredFile))
        .filter(Boolean)
    )
  );
}

function normalizeRequiredFile(requiredFile: string): string {
  const normalized = path.posix.normalize(requiredFile.trim().replace(/\\/g, '/'));
  if (!normalized || normalized === '.') {
    throw new Error(
      'IMPL_DEPLOYMENT_REQUIRED_FILES_MISSING: requiredFiles must contain non-empty file paths.'
    );
  }

  if (path.isAbsolute(requiredFile) || normalized.startsWith('/')) {
    throw new Error(
      `IMPL_DEPLOYMENT_PATH_INVALID: absolute requiredFiles are not allowed (${requiredFile}).`
    );
  }

  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(
      `IMPL_DEPLOYMENT_PATH_INVALID: requiredFiles must stay inside workspace (${requiredFile}).`
    );
  }

  if (!ALLOWED_REQUIRED_DEPLOYMENT_FILES.has(normalized)) {
    throw new Error(
      `IMPL_DEPLOYMENT_PATH_INVALID: requiredFiles must use allowlisted runtime contract or deploy doctor evidence paths. Received: ${requiredFile}`
    );
  }

  return normalized;
}

function resolveAbsolutePath(workspaceRoot: string, filePath: string): string {
  return path.resolve(workspaceRoot, filePath);
}

function isNodeErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

async function fileMissing(absolutePath: string): Promise<boolean> {
  try {
    await fs.access(absolutePath);
    return false;
  } catch (error) {
    if (
      isNodeErrorWithCode(error) &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES')
    ) {
      return true;
    }
    throw error;
  }
}

async function findMissingFiles(
  requiredFiles: readonly string[],
  workspaceRoot: string
): Promise<readonly string[]> {
  const checks = await Promise.all(
    requiredFiles.map(async (requiredFile: string): Promise<string | null> => {
      const absolutePath = resolveAbsolutePath(workspaceRoot, requiredFile);
      return (await fileMissing(absolutePath)) ? requiredFile : null;
    })
  );
  return checks.filter((entry: string | null): entry is string => entry !== null);
}

function assertValidInternalApiPayload(payload: ValidateDeploymentReadinessRequest): void {
  const validation = validateInternalApiPayload('IAP-011', payload);
  if (!validation.valid) {
    throw new Error(`IAP-011 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

function assertValidEventPayload(payload: DeploymentReadinessValidatedEventPayload): void {
  const validation = validateEventPayload('EVT-012', payload);
  if (!validation.valid) {
    throw new Error(`EVT-012 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

export async function validateDeploymentReadiness(
  request: ValidateDeploymentReadinessRequest,
  options: ValidateDeploymentReadinessOptions = {}
): Promise<ValidateDeploymentReadinessResult> {
  assertValidInternalApiPayload(request);
  assertImplementationStage(request.stage);

  const requiredFiles = normalizeRequiredFiles(request.requiredFiles);
  if (requiredFiles.length < 1) {
    throw new Error(
      'IMPL_DEPLOYMENT_REQUIRED_FILES_MISSING: requiredFiles must include at least one runtime contract or deploy doctor evidence file.'
    );
  }

  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const missingFiles = await findMissingFiles(requiredFiles, workspaceRoot);
  const readinessPassed = missingFiles.length === 0;
  const deploymentTaskCompletionAllowed = readinessPassed || !request.blockCompletionOnFailure;
  const validatedAt = options.validatedAt ?? toIsoTimestamp();

  const response: ValidateDeploymentReadinessResponse = {
    status: 'completed',
    readinessPassed,
    missingFiles,
    validatedAt,
    deploymentTaskCompletionAllowed,
  };

  const eventPayload: DeploymentReadinessValidatedEventPayload = {
    eventId: options.eventId ?? buildEventId('evt_012', validatedAt),
    runId: request.runId,
    deploymentTaskId: request.deploymentTaskId,
    readinessPassed,
    missingFiles,
    validatedAt,
  };
  assertValidEventPayload(eventPayload);
  options.eventPublisher?.(eventPayload);

  return {
    contractId: 'IAP-011',
    operationName: 'implementation.validateDeploymentReadiness',
    response,
    emittedEvent: {
      contractId: 'EVT-012',
      eventName: 'deployment.readiness.validated.v1',
      payload: eventPayload,
    },
  };
}
