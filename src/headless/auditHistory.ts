import {
  GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
  GOFER_AUDIT_HISTORY_SCHEMA_VERSION,
  GOFER_PIPELINE_STAGES,
  type GoferApprovalRecord,
  type GoferAuditHistory,
  type GoferRun,
  type GoferRunEvent,
} from './contracts.js';

const STAGE_EVENT_TYPES = new Set(['stage_submitted', 'stage_approved', 'changes_requested']);
const RUN_EVENT_TYPES = new Set([
  'run_created',
  'stage_submitted',
  'stage_approved',
  'changes_requested',
  'run_cancelled',
]);
const PIPELINE_STAGES = new Set<string>(GOFER_PIPELINE_STAGES);

/** Enforces the append-only tenant/run event stream before repository export. */
export function assertCanonicalGoferRunEvents(
  run: GoferRun,
  events: readonly GoferRunEvent[]
): void {
  if (events.length === 0) {
    throw new Error('Gofer audit history requires at least one run event.');
  }

  let previousCreatedAt = Number.NEGATIVE_INFINITY;
  for (const [index, event] of events.entries()) {
    const expectedSequence = index + 1;
    if (event.schemaVersion !== GOFER_ADMIN_PORTAL_CONTRACT_VERSION) {
      throw new Error(`Gofer event sequence ${event.sequence} has an unsupported schemaVersion.`);
    }
    if (event.tenantId !== run.tenantId || event.runId !== run.runId) {
      throw new Error(`Gofer event sequence ${event.sequence} belongs to another tenant or run.`);
    }
    if (!Number.isSafeInteger(event.sequence) || event.sequence !== expectedSequence) {
      throw new Error(
        `Gofer event at index ${index} must have contiguous sequence ${expectedSequence}.`
      );
    }
    if (!RUN_EVENT_TYPES.has(event.type)) {
      throw new Error(`Gofer event sequence ${event.sequence} has an unsupported type.`);
    }
    if (index === 0 && event.type !== 'run_created') {
      throw new Error('Gofer audit history must begin with run_created.');
    }
    if (index > 0 && event.type === 'run_created') {
      throw new Error('Gofer audit history can contain run_created only at sequence 1.');
    }
    if (!event.actorUserId.trim()) {
      throw new Error(`Gofer event sequence ${event.sequence} requires actorUserId.`);
    }
    if (STAGE_EVENT_TYPES.has(event.type) && !event.stage) {
      throw new Error(`Gofer event sequence ${event.sequence} requires a stage.`);
    }
    if (event.stage && !PIPELINE_STAGES.has(event.stage)) {
      throw new Error(`Gofer event sequence ${event.sequence} has an unsupported stage.`);
    }

    const createdAt = Date.parse(event.createdAt);
    if (Number.isNaN(createdAt)) {
      throw new Error(`Gofer event sequence ${event.sequence} has an invalid createdAt.`);
    }
    if (createdAt < previousCreatedAt) {
      throw new Error('Gofer events must be ordered by sequence and nondecreasing createdAt.');
    }
    previousCreatedAt = createdAt;
  }
}

/** Builds the canonical audit manifest after ordered event validation. */
export function createGoferAuditHistory(args: {
  run: GoferRun;
  approvals: readonly GoferApprovalRecord[];
  events: readonly GoferRunEvent[];
}): GoferAuditHistory {
  assertCanonicalGoferRunEvents(args.run, args.events);
  return {
    schemaVersion: GOFER_AUDIT_HISTORY_SCHEMA_VERSION,
    contractVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
    tenantId: args.run.tenantId,
    runId: args.run.runId,
    approvals: args.approvals,
    events: args.events.map((event) => ({
      ...event,
      ...(event.metadata ? { metadata: { ...event.metadata } } : {}),
    })),
  };
}
