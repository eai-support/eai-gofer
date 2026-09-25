import { constants as fsConstants, type Stats } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { validateEventPayload } from '../contracts/EventPayloadSchemas';
import { validateInternalApiPayload } from '../contracts/InternalApiSchemas';

export interface ValidateDeploymentReadinessRequest {
  runId: string;
  stage: string;
  deploymentTaskId: string;
  deploymentTaskText?: string;
  receiptValidationMode?: DeploymentReceiptValidationMode;
  requiredFiles: readonly string[];
  blockCompletionOnFailure: boolean;
}

export type DeploymentReceiptValidationMode = 'presence' | 'operation-bound';

export interface ValidateDeploymentReadinessResponse {
  status: 'completed';
  readinessPassed: boolean;
  missingFiles: readonly string[];
  evidenceIssues: readonly string[];
  validatedAt: string;
  deploymentTaskCompletionAllowed: boolean;
}

export interface DeploymentReadinessValidatedEventPayload {
  eventId: string;
  runId: string;
  deploymentTaskId: string;
  readinessPassed: boolean;
  missingFiles: readonly string[];
  evidenceIssues?: readonly string[];
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
const MANAGED_DEPLOY_DOCTOR_EVIDENCE_PATH = '.eai/deploy-doctor.json';
const MANAGED_DEPLOY_DOCTOR_SCHEMA = 'eai.managed-deploy-doctor-evidence.v1';
const MAX_MANAGED_DEPLOY_DOCTOR_EVIDENCE_BYTES = 1024 * 1024;
const MANAGED_DEPLOY_DOCTOR_READ_CHUNK_BYTES = 64 * 1024;
const MANAGED_DEPLOY_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/;

interface DeploymentEvidenceBinding {
  operationId: string;
  appKey: string;
  tenantId: string;
  targetTenantId: string;
  sourceMode: ManagedDeploySourceMode;
}

type ManagedDeploySourceMode = 'eai-managed' | 'customer-owned';

interface TaskBindingResult {
  binding: DeploymentEvidenceBinding | null;
  issues: readonly string[];
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeManagedDeployIdentifier(value: unknown): value is string {
  return typeof value === 'string' && MANAGED_DEPLOY_IDENTIFIER_PATTERN.test(value);
}

function isManagedDeploySourceMode(value: unknown): value is ManagedDeploySourceMode {
  return value === 'eai-managed' || value === 'customer-owned';
}

function parseDeploymentTaskBinding(deploymentTaskText: string): TaskBindingResult {
  const initialCommandMatches = Array.from(
    deploymentTaskText.matchAll(/`(eai\s+deploy\s+app(?:\s+[^`]*)?)`/g),
    (match: RegExpMatchArray): string => match[1].trim()
  );
  const doctorCommandMatches = Array.from(
    deploymentTaskText.matchAll(/`(eai\s+deploy\s+doctor(?:\s+[^`]*)?)`/g),
    (match: RegExpMatchArray): string => match[1].trim()
  );
  if (initialCommandMatches.length === 0 || doctorCommandMatches.length === 0) {
    return {
      binding: null,
      issues: ['DEPLOYMENT_TASK_BINDING_MISSING'],
    };
  }
  if (initialCommandMatches.length !== 1 || doctorCommandMatches.length !== 1) {
    return {
      binding: null,
      issues: ['DEPLOYMENT_TASK_BINDING_INVALID'],
    };
  }

  const initialTokens = initialCommandMatches[0].split(/\s+/);
  const sourceFlagPositions = initialTokens.reduce<number[]>(
    (positions: number[], token: string, index: number): number[] => {
      if (token === '--source') {
        positions.push(index);
      }
      return positions;
    },
    []
  );
  const sourceMode =
    sourceFlagPositions.length === 1 ? initialTokens[sourceFlagPositions[0] + 1] : undefined;
  if (
    initialTokens[0] !== 'eai' ||
    initialTokens[1] !== 'deploy' ||
    initialTokens[2] !== 'app' ||
    !isManagedDeploySourceMode(sourceMode)
  ) {
    return {
      binding: null,
      issues: ['DEPLOYMENT_TASK_BINDING_INVALID'],
    };
  }

  const tokens = doctorCommandMatches[0].split(/\s+/);
  const expectedFlagPositions = [
    [3, '--operation-id'],
    [5, '--app-key'],
    [7, '--tenant-id'],
    [9, '--target-tenant-id'],
    [11, '--evidence-out'],
    [13, '--format'],
  ] as const;
  if (
    tokens.length !== 15 ||
    tokens[0] !== 'eai' ||
    tokens[1] !== 'deploy' ||
    tokens[2] !== 'doctor' ||
    expectedFlagPositions.some(([index, flag]): boolean => tokens[index] !== flag)
  ) {
    return {
      binding: null,
      issues: ['DEPLOYMENT_TASK_BINDING_INVALID'],
    };
  }

  const operationId = tokens[4];
  const appKey = tokens[6];
  const tenantId = tokens[8];
  const targetTenantId = tokens[10];
  const evidenceOut = tokens[12];
  const format = tokens[14];
  const values = [operationId, appKey, tenantId, targetTenantId];

  if (
    values.some((value: string): boolean => !isSafeManagedDeployIdentifier(value)) ||
    evidenceOut !== MANAGED_DEPLOY_DOCTOR_EVIDENCE_PATH ||
    format !== 'json'
  ) {
    return {
      binding: null,
      issues: ['DEPLOYMENT_TASK_BINDING_INVALID'],
    };
  }

  return {
    binding: {
      operationId,
      appKey,
      tenantId,
      targetTenantId,
      sourceMode,
    },
    issues: [],
  };
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function hasValidSourceBinding(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const hasCommit = typeof value.commitSha === 'string' && COMMIT_SHA_PATTERN.test(value.commitSha);
  const hasBundle =
    typeof value.bundleSha256 === 'string' && SHA256_PATTERN.test(value.bundleSha256);
  return hasCommit || hasBundle;
}

function hasValidRuntimeIdentity(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.clientId) && isNonEmptyString(value.principalId);
}

function hasValidDoctorChecks(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 1) {
    return false;
  }

  return value.every(
    (check: unknown): boolean =>
      isRecord(check) &&
      isNonEmptyString(check.name) &&
      isNonEmptyString(check.method) &&
      isNonEmptyString(check.path) &&
      isNonEmptyString(check.url) &&
      isNonEmptyString(check.category) &&
      isNonEmptyString(check.message) &&
      typeof check.status === 'string' &&
      ['pass', 'fail', 'warning', 'skip'].includes(check.status)
  );
}

function hasValidDoctorSummary(value: unknown, checks: readonly unknown[]): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const statuses = ['pass', 'fail', 'warning', 'skip'] as const;
  return statuses.every((status): boolean => {
    const expected = checks.filter(
      (check: unknown): boolean => isRecord(check) && check.status === status
    ).length;
    return Number.isInteger(value[status]) && value[status] === expected;
  });
}

function validateManagedDeployDoctorEvidence(
  evidence: unknown,
  expected?: DeploymentEvidenceBinding
): readonly string[] {
  if (!isRecord(evidence) || evidence.schemaVersion !== MANAGED_DEPLOY_DOCTOR_SCHEMA) {
    return ['DOCTOR_EVIDENCE_SCHEMA_INVALID'];
  }

  const operation = evidence.operation;
  const deployment = evidence.deployment;
  const doctor = evidence.doctor;
  if (!isRecord(operation) || !isRecord(deployment) || !isRecord(doctor)) {
    return ['DOCTOR_EVIDENCE_SCHEMA_INVALID'];
  }

  const checks = doctor.checks;
  const observedAt = evidence.observedAt;
  const pointersAreValid =
    Number.isSafeInteger(deployment.latestPointerVersion) &&
    Number.isSafeInteger(deployment.expectedLatestVersion) &&
    Number(deployment.latestPointerVersion) >= 0 &&
    Number(deployment.expectedLatestVersion) >= 0 &&
    deployment.latestPointerVersion === deployment.expectedLatestVersion;
  const structureIsValid =
    isManagedDeploySourceMode(operation.sourceMode) &&
    typeof operation.configHash === 'string' &&
    SHA256_PATTERN.test(operation.configHash) &&
    hasValidSourceBinding(evidence.sourceBinding) &&
    isNonEmptyString(deployment.deploymentId) &&
    isHttpsUrl(deployment.activeUrl) &&
    hasValidRuntimeIdentity(deployment.runtimeIdentity) &&
    deployment.requiresTenantInfra === false &&
    pointersAreValid &&
    isNonEmptyString(doctor.contract) &&
    isHttpsUrl(doctor.url) &&
    normalizeUrl(doctor.url) === normalizeUrl(deployment.activeUrl) &&
    hasValidDoctorChecks(checks) &&
    hasValidDoctorSummary(doctor.summary, Array.isArray(checks) ? checks : []) &&
    isIsoTimestamp(observedAt);

  if (!structureIsValid) {
    return ['DOCTOR_EVIDENCE_SCHEMA_INVALID'];
  }

  const issues: string[] = [];
  if (evidence.status !== 'pass' || operation.status !== 'active' || doctor.status !== 'pass') {
    issues.push('DOCTOR_EVIDENCE_STATUS_NOT_PASS');
  }
  if (
    evidence.authenticatedReadiness !== true ||
    doctor.authenticatedReadiness !== true ||
    !(checks as readonly unknown[]).some(
      (check: unknown): boolean =>
        isRecord(check) && check.status === 'pass' && check.authenticated === true
    )
  ) {
    issues.push('DOCTOR_EVIDENCE_AUTHENTICATED_READINESS_NOT_PASS');
  }
  if (
    (checks as readonly unknown[]).some(
      (check: unknown): boolean => isRecord(check) && check.status !== 'pass'
    )
  ) {
    issues.push('DOCTOR_EVIDENCE_CHECKS_NOT_PASS');
  }

  const bindingChecks: ReadonlyArray<{
    actual: unknown;
    expected?: string;
    issue: string;
  }> = [
    {
      actual: operation.sourceMode,
      expected: expected?.sourceMode,
      issue: 'DOCTOR_EVIDENCE_SOURCE_MODE_MISMATCH',
    },
    {
      actual: operation.operationId,
      expected: expected?.operationId,
      issue: 'DOCTOR_EVIDENCE_OPERATION_ID_MISMATCH',
    },
    {
      actual: operation.appKey,
      expected: expected?.appKey,
      issue: 'DOCTOR_EVIDENCE_APP_KEY_MISMATCH',
    },
    {
      actual: operation.tenantId,
      expected: expected?.tenantId,
      issue: 'DOCTOR_EVIDENCE_APP_TENANT_MISMATCH',
    },
    {
      actual: operation.targetTenantId,
      expected: expected?.targetTenantId,
      issue: 'DOCTOR_EVIDENCE_RUNTIME_TENANT_MISMATCH',
    },
  ];
  for (const bindingCheck of bindingChecks) {
    if (!isSafeManagedDeployIdentifier(bindingCheck.actual)) {
      issues.push('DOCTOR_EVIDENCE_SCHEMA_INVALID');
    } else if (
      bindingCheck.expected !== undefined &&
      bindingCheck.actual !== bindingCheck.expected
    ) {
      issues.push(bindingCheck.issue);
    }
  }

  return Array.from(new Set(issues));
}

async function readManagedDeployDoctorEvidence(
  workspaceRoot: string,
  expected?: DeploymentEvidenceBinding
): Promise<ManagedDeployDoctorReadResult> {
  const evidencePath = resolveAbsolutePath(workspaceRoot, MANAGED_DEPLOY_DOCTOR_EVIDENCE_PATH);
  const noFollowFlag = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
  let evidenceFile: fs.FileHandle;
  try {
    evidenceFile = await fs.open(
      evidencePath,
      fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | noFollowFlag
    );
  } catch (error) {
    if (isNodeErrorWithCode(error) && ['ENOENT', 'ENOTDIR'].includes(error.code ?? '')) {
      return { missing: true, issues: [] };
    }
    if (
      isNodeErrorWithCode(error) &&
      ['EISDIR', 'ELOOP', 'EMLINK', 'ENODEV', 'ENXIO'].includes(error.code ?? '')
    ) {
      return { missing: false, issues: ['DOCTOR_EVIDENCE_FILE_INVALID'] };
    }
    return { missing: false, issues: ['DOCTOR_EVIDENCE_UNREADABLE'] };
  }

  let evidenceText: string;
  try {
    const [openedStats, pathStats] = await Promise.all([
      evidenceFile.stat(),
      fs.lstat(evidencePath),
    ]);
    if (!isSameRegularEvidenceFile(pathStats, openedStats)) {
      return { missing: false, issues: ['DOCTOR_EVIDENCE_FILE_INVALID'] };
    }
    if (openedStats.size > MAX_MANAGED_DEPLOY_DOCTOR_EVIDENCE_BYTES) {
      return { missing: false, issues: ['DOCTOR_EVIDENCE_FILE_INVALID'] };
    }

    const boundedRead = await readBoundedEvidenceFile(evidenceFile);
    if (boundedRead.exceededLimit) {
      return { missing: false, issues: ['DOCTOR_EVIDENCE_FILE_INVALID'] };
    }

    const [finalOpenedStats, finalPathStats] = await Promise.all([
      evidenceFile.stat(),
      fs.lstat(evidencePath),
    ]);
    if (
      !isSameRegularEvidenceFile(finalPathStats, finalOpenedStats) ||
      !hasStableEvidenceFileContents(openedStats, finalOpenedStats, boundedRead.bytesRead)
    ) {
      return { missing: false, issues: ['DOCTOR_EVIDENCE_FILE_INVALID'] };
    }
    evidenceText = boundedRead.text;
  } catch {
    return { missing: false, issues: ['DOCTOR_EVIDENCE_UNREADABLE'] };
  } finally {
    await evidenceFile.close();
  }

  let evidence: unknown;
  try {
    evidence = JSON.parse(evidenceText) as unknown;
  } catch {
    return { missing: false, issues: ['DOCTOR_EVIDENCE_INVALID_JSON'] };
  }

  return {
    missing: false,
    issues: validateManagedDeployDoctorEvidence(evidence, expected),
  };
}

interface ManagedDeployDoctorReadResult {
  missing: boolean;
  issues: readonly string[];
}

function isSameRegularEvidenceFile(pathStats: Stats, openedStats: Stats): boolean {
  return (
    pathStats.isFile() &&
    !pathStats.isSymbolicLink() &&
    openedStats.isFile() &&
    pathStats.dev === openedStats.dev &&
    pathStats.ino === openedStats.ino
  );
}

function hasStableEvidenceFileContents(
  initialStats: Stats,
  finalStats: Stats,
  bytesRead: number
): boolean {
  return (
    initialStats.size === finalStats.size &&
    finalStats.size === bytesRead &&
    initialStats.mtimeMs === finalStats.mtimeMs &&
    initialStats.ctimeMs === finalStats.ctimeMs
  );
}

interface BoundedEvidenceRead {
  bytesRead: number;
  exceededLimit: boolean;
  text: string;
}

async function readBoundedEvidenceFile(evidenceFile: fs.FileHandle): Promise<BoundedEvidenceRead> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (totalBytes <= MAX_MANAGED_DEPLOY_DOCTOR_EVIDENCE_BYTES) {
    const remainingBytes = MAX_MANAGED_DEPLOY_DOCTOR_EVIDENCE_BYTES + 1 - totalBytes;
    const buffer = Buffer.allocUnsafe(
      Math.min(MANAGED_DEPLOY_DOCTOR_READ_CHUNK_BYTES, remainingBytes)
    );
    const { bytesRead } = await evidenceFile.read(buffer, 0, buffer.length, totalBytes);
    if (bytesRead === 0) {
      break;
    }
    chunks.push(buffer.subarray(0, bytesRead));
    totalBytes += bytesRead;
  }

  return {
    bytesRead: totalBytes,
    exceededLimit: totalBytes > MAX_MANAGED_DEPLOY_DOCTOR_EVIDENCE_BYTES,
    text: Buffer.concat(chunks, totalBytes).toString('utf8'),
  };
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

  const receiptValidationMode = request.receiptValidationMode ?? 'presence';
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const filesForPresenceCheck =
    receiptValidationMode === 'operation-bound'
      ? requiredFiles.filter(
          (requiredFile: string): boolean => requiredFile !== MANAGED_DEPLOY_DOCTOR_EVIDENCE_PATH
        )
      : requiredFiles;
  const missingFiles = [...(await findMissingFiles(filesForPresenceCheck, workspaceRoot))];
  const evidenceIssues: string[] = [];
  if (receiptValidationMode === 'operation-bound') {
    const taskBinding = parseDeploymentTaskBinding(request.deploymentTaskText ?? '');
    evidenceIssues.push(...taskBinding.issues);
    if (requiredFiles.includes(MANAGED_DEPLOY_DOCTOR_EVIDENCE_PATH)) {
      const doctorEvidence = await readManagedDeployDoctorEvidence(
        workspaceRoot,
        taskBinding.binding ?? undefined
      );
      if (doctorEvidence.missing) {
        missingFiles.push(MANAGED_DEPLOY_DOCTOR_EVIDENCE_PATH);
      } else {
        evidenceIssues.push(...doctorEvidence.issues);
      }
    } else {
      evidenceIssues.push('DOCTOR_EVIDENCE_FILE_NOT_REQUIRED');
    }
  }

  const normalizedEvidenceIssues = Array.from(new Set(evidenceIssues));
  const readinessPassed = missingFiles.length === 0 && normalizedEvidenceIssues.length === 0;
  const deploymentTaskCompletionAllowed = readinessPassed || !request.blockCompletionOnFailure;
  const validatedAt = options.validatedAt ?? toIsoTimestamp();

  const response: ValidateDeploymentReadinessResponse = {
    status: 'completed',
    readinessPassed,
    missingFiles,
    evidenceIssues: normalizedEvidenceIssues,
    validatedAt,
    deploymentTaskCompletionAllowed,
  };

  const eventPayload: DeploymentReadinessValidatedEventPayload = {
    eventId: options.eventId ?? buildEventId('evt_012', validatedAt),
    runId: request.runId,
    deploymentTaskId: request.deploymentTaskId,
    readinessPassed,
    missingFiles,
    evidenceIssues: normalizedEvidenceIssues,
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
