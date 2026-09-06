import { RUNTIME_SURFACES, GEMINI_CLI_MIGRATION_MESSAGE } from '../../../config/runtimeSurface';

export const TARGET_PLATFORMS = RUNTIME_SURFACES;

/** Legacy mirror paths are not active targets; do not fall back to Claude. */
export function validateActiveMirrorTargets(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.some(
    (value) =>
      typeof value === 'string' &&
      (/^gemini(?:-cli)?$/i.test(value.trim()) ||
        /(?:^|\/)\.gemini\/commands\/gofer(?:\/|$)/i.test(value.replace(/\\/g, '/')))
  )
    ? [GEMINI_CLI_MIGRATION_MESSAGE]
    : [];
}

export type TargetPlatform = (typeof TARGET_PLATFORMS)[number];

export const SYNC_STATUSES = [
  'pending',
  'generated',
  'synced',
  'parity_failed',
  'sync_failed',
] as const;

export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const CAPABILITY_APPROVAL_DECISIONS = ['approved', 'rejected'] as const;

export type CapabilityApprovalDecision = (typeof CAPABILITY_APPROVAL_DECISIONS)[number];

export interface MirrorPropagationRecord {
  propagationId: string;
  artifactId: string;
  canonicalSourcePath: string;
  targetPlatform: TargetPlatform;
  targetPath: string;
  syncStatus: SyncStatus;
  parityDiffCount: number;
  syncedAt?: string;
}

export interface CapabilityRemovalApprovalRecord {
  approvalRecordId: string;
  runId: string;
  changeSetId: string;
  capabilityAffected: string;
  decision: CapabilityApprovalDecision;
  approver: string;
  decisionAt: string;
  changeSetSummary: string;
  decisionRationale?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function isTargetPlatform(value: unknown): value is TargetPlatform {
  return typeof value === 'string' && TARGET_PLATFORMS.includes(value as TargetPlatform);
}

export function isSyncStatus(value: unknown): value is SyncStatus {
  return typeof value === 'string' && SYNC_STATUSES.includes(value as SyncStatus);
}

export function isCapabilityApprovalDecision(value: unknown): value is CapabilityApprovalDecision {
  return (
    typeof value === 'string' &&
    CAPABILITY_APPROVAL_DECISIONS.includes(value as CapabilityApprovalDecision)
  );
}

export function validateMirrorPropagationRecord(record: MirrorPropagationRecord): ValidationResult {
  const errors: string[] = [];

  if (!record.propagationId.trim()) {
    errors.push('propagationId is required.');
  }

  if (!record.artifactId.trim()) {
    errors.push('artifactId is required.');
  }

  if (!record.canonicalSourcePath.trim()) {
    errors.push('canonicalSourcePath is required.');
  }

  if (!record.targetPath.trim()) {
    errors.push('targetPath is required.');
  }

  if (!isTargetPlatform(record.targetPlatform)) {
    errors.push('targetPlatform is invalid.');
  }

  if (!isSyncStatus(record.syncStatus)) {
    errors.push('syncStatus is invalid.');
  }

  if (!Number.isInteger(record.parityDiffCount) || record.parityDiffCount < 0) {
    errors.push('parityDiffCount must be a non-negative integer.');
  }

  if (record.syncStatus === 'synced' && record.parityDiffCount !== 0) {
    errors.push('syncStatus=synced requires parityDiffCount=0.');
  }

  if (record.syncStatus === 'parity_failed' && record.parityDiffCount <= 0) {
    errors.push('syncStatus=parity_failed requires parityDiffCount>0.');
  }

  if (record.syncedAt && !isIsoTimestamp(record.syncedAt)) {
    errors.push('syncedAt must be an ISO8601 timestamp when provided.');
  }

  if (record.syncStatus === 'synced' && !record.syncedAt) {
    errors.push('syncStatus=synced requires syncedAt timestamp.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateCapabilityRemovalApprovalRecord(
  record: CapabilityRemovalApprovalRecord
): ValidationResult {
  const errors: string[] = [];

  if (!record.approvalRecordId.trim()) {
    errors.push('approvalRecordId is required.');
  }

  if (!record.runId.trim()) {
    errors.push('runId is required.');
  }

  if (!record.changeSetId.trim()) {
    errors.push('changeSetId is required.');
  }

  if (!record.capabilityAffected.trim()) {
    errors.push('capabilityAffected is required.');
  }

  if (!isCapabilityApprovalDecision(record.decision)) {
    errors.push('decision must be approved or rejected.');
  }

  if (!record.approver.trim()) {
    errors.push('approver is required.');
  }

  if (!record.changeSetSummary.trim()) {
    errors.push('changeSetSummary is required.');
  }

  if (!isIsoTimestamp(record.decisionAt)) {
    errors.push('decisionAt must be an ISO8601 timestamp.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildCapabilityRemovalApprovalKey(
  changeSetId: string,
  capabilityAffected: string
): string {
  return `${changeSetId}::${capabilityAffected}`;
}
