import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { validateEventPayload } from '../contracts/EventPayloadSchemas';
import { validateInternalApiPayload } from '../contracts/InternalApiSchemas';
import {
  type MirrorPropagationRecord,
  type SyncStatus,
  type TargetPlatform,
  validateMirrorPropagationRecord,
} from '../models/Propagation';

export interface PropagateCanonicalMirrorsRequest {
  changeSetId: string;
  canonicalSources: readonly string[];
  targetMirrors: readonly string[];
  runParityValidation: boolean;
}

export interface PropagateCanonicalMirrorsResponse {
  status: 'completed';
  mirrorsUpdated: number;
  filesChanged: number;
  parityValidation: 'passed' | 'skipped';
  runtimeSyncCompleted: boolean;
  records: readonly MirrorPropagationRecord[];
}

export interface MirrorPropagationCompletedEventPayload {
  eventId: string;
  changeSetId: string;
  mirrors: readonly string[];
  filesChanged: number;
  runtimeSyncCompleted: boolean;
}

export interface PropagateCanonicalMirrorsEvent {
  contractId: 'EVT-008';
  eventName: 'artifacts.mirror-propagation.completed.v1';
  payload: MirrorPropagationCompletedEventPayload;
}

export interface PropagateCanonicalMirrorsResult {
  contractId: 'IAP-008';
  operationName: 'artifacts.propagateCanonicalMirrors';
  response: PropagateCanonicalMirrorsResponse;
  emittedEvent: PropagateCanonicalMirrorsEvent;
}

export interface PropagateCanonicalMirrorsOptions {
  eventId?: string;
  propagatedAt?: string;
  workspaceRoot?: string;
  filesChangedOverride?: number;
  runtimeSyncCompleted?: boolean;
  parityDiffCountByMirror?: Readonly<Record<string, number>>;
  eventPublisher?: (payload: MirrorPropagationCompletedEventPayload) => void;
}

interface ResolvedMirrorTarget {
  mirrorInput: string;
  targetPlatform: TargetPlatform;
  targetPath: string;
}

function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

function buildEventId(prefix: string, isoTimestamp: string): string {
  return `${prefix}_${isoTimestamp.replace(/[-:.TZ]/g, '')}`;
}

function normalizeUniqueStrings(values: readonly string[]): readonly string[] {
  const normalized = values
    .map((value: string): string => value.trim())
    .filter((value: string): boolean => value.length > 0);

  return Array.from(new Set(normalized));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function resolveWorkspaceRelativePath(
  workspaceRoot: string,
  relativePath: string,
  label: 'canonicalSources' | 'targetMirrors'
): string {
  const normalizedInput = relativePath.trim().replace(/\\/g, '/');
  if (!normalizedInput) {
    throw new Error(`PROP_MIRROR_WRITE_FAILED: ${label} entries must be non-empty.`);
  }
  if (path.isAbsolute(normalizedInput)) {
    throw new Error(
      `PROP_MIRROR_WRITE_FAILED: ${label} entries must be workspace-relative paths. Received absolute path: ${relativePath}`
    );
  }

  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const resolvedPath = path.resolve(resolvedWorkspaceRoot, normalizedInput);
  const relativeToWorkspace = path.relative(resolvedWorkspaceRoot, resolvedPath);
  if (
    relativeToWorkspace.startsWith('..') ||
    relativeToWorkspace.includes(`..${path.sep}`) ||
    path.isAbsolute(relativeToWorkspace)
  ) {
    throw new Error(
      `PROP_MIRROR_WRITE_FAILED: ${label} entries must resolve inside workspace root. Received: ${relativePath}`
    );
  }

  return normalizePath(resolvedPath);
}

function resolveCanonicalSourcePath(canonicalSource: string, workspaceRoot: string): string {
  return resolveWorkspaceRelativePath(workspaceRoot, canonicalSource, 'canonicalSources');
}

function resolveTargetPlatform(targetMirror: string): TargetPlatform {
  const normalizedTarget = targetMirror.toLowerCase();
  if (normalizedTarget === 'claude' || normalizedTarget.includes('.claude/commands')) {
    return 'claude';
  }
  if (normalizedTarget === 'copilot' || normalizedTarget.includes('.github/prompts')) {
    return 'copilot';
  }
  if (normalizedTarget === 'codex' || normalizedTarget.includes('.agents/skills')) {
    return 'codex';
  }
  if (normalizedTarget === 'antigravity' || normalizedTarget === 'antigravity-desktop') {
    return normalizedTarget;
  }

  // Compatibility fallback for generic mirror roots like extension/resources.
  return 'claude';
}

function resolveTargetPath(targetMirror: string, workspaceRoot: string): string {
  if (targetMirror === 'claude') {
    return normalizePath(path.resolve(workspaceRoot, '.claude', 'commands'));
  }
  if (targetMirror === 'copilot') {
    return normalizePath(path.resolve(workspaceRoot, '.github', 'prompts'));
  }
  if (targetMirror === 'codex') {
    return normalizePath(path.resolve(workspaceRoot, '.agents', 'skills'));
  }
  if (targetMirror === 'antigravity' || targetMirror === 'antigravity-desktop') {
    return normalizePath(path.resolve(workspaceRoot, '.agents', 'skills'));
  }

  return resolveWorkspaceRelativePath(workspaceRoot, targetMirror, 'targetMirrors');
}

function assertValidInternalApiPayload(payload: PropagateCanonicalMirrorsRequest): void {
  const validation = validateInternalApiPayload('IAP-008', payload);
  if (!validation.valid) {
    throw new Error(`IAP-008 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

function assertValidEventPayload(payload: MirrorPropagationCompletedEventPayload): void {
  const validation = validateEventPayload('EVT-008', payload);
  if (!validation.valid) {
    throw new Error(`EVT-008 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

function isNodeErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (
      isNodeErrorWithCode(error) &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES')
    ) {
      return false;
    }
    throw error;
  }
}

async function assertCanonicalSourcesExist(
  canonicalSources: readonly string[],
  workspaceRoot: string
): Promise<readonly string[]> {
  const resolvedSources = canonicalSources.map((canonicalSource: string): string =>
    resolveCanonicalSourcePath(canonicalSource, workspaceRoot)
  );
  const existenceChecks = await Promise.all(
    resolvedSources.map((canonicalSource: string): Promise<boolean> => pathExists(canonicalSource))
  );
  const missingSource = resolvedSources.find((_canonicalSource: string, index: number): boolean => {
    return !existenceChecks[index];
  });

  if (missingSource) {
    throw new Error(`PROP_CANONICAL_SOURCE_MISSING: ${missingSource}`);
  }

  return resolvedSources;
}

function resolveMirrorTargets(
  targetMirrors: readonly string[],
  workspaceRoot: string
): readonly ResolvedMirrorTarget[] {
  return targetMirrors.map((targetMirror: string): ResolvedMirrorTarget => {
    return {
      mirrorInput: targetMirror,
      targetPlatform: resolveTargetPlatform(targetMirror),
      targetPath: resolveTargetPath(targetMirror, workspaceRoot),
    };
  });
}

function resolveParityDiffCount(
  parityDiffCountByMirror: Readonly<Record<string, number>> | undefined,
  mirrorInput: string,
  targetPlatform: TargetPlatform
): number {
  if (!parityDiffCountByMirror) {
    return 0;
  }

  const byInput = parityDiffCountByMirror[mirrorInput];
  if (Number.isInteger(byInput) && byInput >= 0) {
    return byInput;
  }

  const byPlatform = parityDiffCountByMirror[targetPlatform];
  if (Number.isInteger(byPlatform) && byPlatform >= 0) {
    return byPlatform;
  }

  return 0;
}

function resolveSyncStatus(
  runtimeSyncCompleted: boolean,
  runParityValidation: boolean,
  parityDiffCount: number
): SyncStatus {
  if (!runtimeSyncCompleted) {
    return 'sync_failed';
  }
  if (runParityValidation && parityDiffCount > 0) {
    return 'parity_failed';
  }
  return 'synced';
}

function buildArtifactId(changeSetId: string, canonicalSourcePath: string): string {
  const checksum = createHash('sha1').update(`${changeSetId}:${canonicalSourcePath}`).digest('hex');
  return `artifact_${checksum.slice(0, 16)}`;
}

function buildPropagationId(
  changeSetId: string,
  canonicalSourcePath: string,
  targetPath: string
): string {
  const checksum = createHash('sha1')
    .update(`${changeSetId}:${canonicalSourcePath}:${targetPath}`)
    .digest('hex');
  return `prop_${checksum.slice(0, 16)}`;
}

function buildMirrorRecords(
  request: PropagateCanonicalMirrorsRequest,
  canonicalSources: readonly string[],
  mirrorTargets: readonly ResolvedMirrorTarget[],
  propagatedAt: string,
  runtimeSyncCompleted: boolean,
  parityDiffCountByMirror?: Readonly<Record<string, number>>
): readonly MirrorPropagationRecord[] {
  return canonicalSources.flatMap(
    (canonicalSourcePath: string): readonly MirrorPropagationRecord[] => {
      return mirrorTargets.map((mirrorTarget: ResolvedMirrorTarget): MirrorPropagationRecord => {
        const parityDiffCount = resolveParityDiffCount(
          parityDiffCountByMirror,
          mirrorTarget.mirrorInput,
          mirrorTarget.targetPlatform
        );
        const syncStatus = resolveSyncStatus(
          runtimeSyncCompleted,
          request.runParityValidation,
          parityDiffCount
        );
        const record: MirrorPropagationRecord = {
          propagationId: buildPropagationId(
            request.changeSetId,
            canonicalSourcePath,
            mirrorTarget.targetPlatform.startsWith('antigravity')
              ? `${mirrorTarget.targetPath}#${mirrorTarget.targetPlatform}`
              : mirrorTarget.targetPath
          ),
          artifactId: buildArtifactId(request.changeSetId, canonicalSourcePath),
          canonicalSourcePath,
          targetPlatform: mirrorTarget.targetPlatform,
          targetPath: mirrorTarget.targetPath,
          syncStatus,
          parityDiffCount,
          syncedAt: syncStatus === 'synced' ? propagatedAt : undefined,
        };
        const validation = validateMirrorPropagationRecord(record);
        if (!validation.valid) {
          throw new Error(`PROP_MIRROR_WRITE_FAILED: ${validation.errors.join(' ')}`);
        }
        return record;
      });
    }
  );
}

function assertParityValidationPassed(
  records: readonly MirrorPropagationRecord[],
  runParityValidation: boolean
): void {
  if (!runParityValidation) {
    return;
  }

  const parityFailure = records.some((record: MirrorPropagationRecord): boolean => {
    return record.syncStatus === 'parity_failed';
  });

  if (parityFailure) {
    throw new Error('PROP_PARITY_VALIDATION_FAILED: parity diffs detected in mirror propagation.');
  }
}

export async function propagateCanonicalMirrors(
  request: PropagateCanonicalMirrorsRequest,
  options: PropagateCanonicalMirrorsOptions = {}
): Promise<PropagateCanonicalMirrorsResult> {
  assertValidInternalApiPayload(request);

  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const propagatedAt = options.propagatedAt ?? toIsoTimestamp();
  const runtimeSyncCompleted = options.runtimeSyncCompleted ?? true;
  if (!runtimeSyncCompleted) {
    throw new Error('PROP_MIRROR_WRITE_FAILED: runtime resource sync did not complete.');
  }

  const canonicalSources = normalizeUniqueStrings(request.canonicalSources);
  const targetMirrors = normalizeUniqueStrings(request.targetMirrors);

  const resolvedCanonicalSources = await assertCanonicalSourcesExist(
    canonicalSources,
    workspaceRoot
  );
  const mirrorTargets = resolveMirrorTargets(targetMirrors, workspaceRoot);

  const records = buildMirrorRecords(
    request,
    resolvedCanonicalSources,
    mirrorTargets,
    propagatedAt,
    runtimeSyncCompleted,
    options.parityDiffCountByMirror
  );

  assertParityValidationPassed(records, request.runParityValidation);

  const filesChanged = options.filesChangedOverride ?? records.length;
  const mirrors = Array.from(
    new Set(records.map((record: MirrorPropagationRecord): string => record.targetPlatform))
  );

  const response: PropagateCanonicalMirrorsResponse = {
    status: 'completed',
    mirrorsUpdated: mirrors.length,
    filesChanged,
    parityValidation: request.runParityValidation ? 'passed' : 'skipped',
    runtimeSyncCompleted,
    records,
  };

  const eventPayload: MirrorPropagationCompletedEventPayload = {
    eventId: options.eventId ?? buildEventId('evt_008', propagatedAt),
    changeSetId: request.changeSetId,
    mirrors,
    filesChanged,
    runtimeSyncCompleted,
  };
  assertValidEventPayload(eventPayload);
  options.eventPublisher?.(eventPayload);

  return {
    contractId: 'IAP-008',
    operationName: 'artifacts.propagateCanonicalMirrors',
    response,
    emittedEvent: {
      contractId: 'EVT-008',
      eventName: 'artifacts.mirror-propagation.completed.v1',
      payload: eventPayload,
    },
  };
}
