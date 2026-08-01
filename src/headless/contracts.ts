/** Version discriminator shared by Gofer and Admin Portal persistence adapters. */
export const GOFER_ADMIN_PORTAL_CONTRACT_VERSION = 'eai.gofer.admin_portal.v1' as const;
/** Schema discriminator for the generated-repository implementation handoff. */
export const GOFER_HANDOFF_SCHEMA_VERSION = 'eai.gofer.handoff.v1' as const;
/** Schema discriminator for the immutable artifact manifest. */
export const GOFER_ARTIFACT_MANIFEST_SCHEMA_VERSION = 'eai.gofer.artifacts.v1' as const;
/** Schema discriminator for exported source lineage. */
export const GOFER_SOURCE_MANIFEST_SCHEMA_VERSION = 'eai.gofer.sources.v1' as const;
/** Schema discriminator for ordered decision and execution history. */
export const GOFER_AUDIT_HISTORY_SCHEMA_VERSION = 'eai.gofer.audit_history.v1' as const;
/** Schema discriminator for the complete portable repository bundle. */
export const GOFER_EXPORT_BUNDLE_SCHEMA_VERSION = 'eai.gofer.export_bundle.v1' as const;
/** Schema discriminator shared with CLI-built and No-Code Builder applications. */
export const APP_CAPABILITY_SCHEMA_VERSION = 'eai.app_capabilities.v1' as const;

/** Ordered stages supported by the governed pre-implementation pipeline. */
export const GOFER_PIPELINE_STAGES = [
  '0_start',
  '0a_problem_validation',
  '1_research',
  '2_specify',
  '3_plan',
  '4_tasks',
] as const;

/** Stages that must be approved before repository generation can proceed. */
export const GOFER_REQUIRED_PIPELINE_STAGES = [
  '0_start',
  '1_research',
  '2_specify',
  '3_plan',
  '4_tasks',
] as const;

/** Canonical stage identifier persisted across Gofer and consumer adapters. */
export type GoferPipelineStage = (typeof GOFER_PIPELINE_STAGES)[number];
/** Stage that cannot be omitted when evaluating repository-generation readiness. */
export type GoferRequiredPipelineStage = (typeof GOFER_REQUIRED_PIPELINE_STAGES)[number];
/** First stage a generated repository may run after the governed handoff. */
export type GoferNextStage = '5_implement';

/** Canonical artifact-kind vocabulary accepted by the headless contract. */
export const GOFER_ARTIFACT_KINDS = [
  'discovery',
  'problem-brief',
  'assumptions',
  'research',
  'context-bundle',
  'reuse-scan',
  'service-fit-matrix',
  'business-analysis',
  'market-analysis',
  'goal-ledger',
  'loop-contract',
  'proposal-review',
  'specification',
  'requirements-checklist',
  'plan',
  'data-model',
  'contract',
  'tasks',
  'issues',
  'traceability',
  'business-owner-summary',
  'stakeholder-review-index',
  'working-backwards-prfaq',
  'audit-history',
  'pipeline-state',
  'other',
] as const;

/** Stable semantic category used by required-artifact and audit rules. */
export type GoferArtifactKind = (typeof GOFER_ARTIFACT_KINDS)[number];

/** Minimum portable evidence a successful executor must produce for each stage. */
export const GOFER_REQUIRED_ARTIFACT_KINDS_BY_STAGE: Readonly<
  Record<GoferPipelineStage, readonly GoferArtifactKind[]>
> = {
  '0_start': ['discovery'],
  '0a_problem_validation': ['problem-brief'],
  '1_research': ['research', 'goal-ledger', 'loop-contract'],
  '2_specify': ['specification', 'requirements-checklist'],
  '3_plan': ['plan', 'data-model', 'contract'],
  '4_tasks': ['tasks', 'traceability'],
};
/** Lifecycle state used to distinguish current evidence from stale or superseded evidence. */
export type GoferArtifactStatus =
  | 'draft'
  | 'current'
  | 'approved'
  | 'stale'
  | 'superseded'
  | 'blocked';
/** Stage projection state; immutable approvals remain separate records. */
export type GoferStageStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'changes_requested'
  | 'stale'
  | 'failed'
  | 'cancelled';
/** Aggregate execution state for the tenant-scoped Gofer run. */
export type GoferRunStatus =
  | 'initialized'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'completed'
  | 'failed'
  | 'cancelled';
/** Terminal outcome returned by an executor-neutral stage worker. */
export type GoferStageExecutionStatus = 'succeeded' | 'failed' | 'cancelled';
/** Immutable tenant-admin decision over exact artifact references. */
export type GoferApprovalDecision = 'approved' | 'changes_requested' | 'revoked';
/** Repository delivery mode; regeneration must use a branch and pull request. */
export type GoferRepositoryAction = 'generate' | 'regenerate';
/** Portable file encoding used before content hashing and GitHub delivery. */
export type GoferFileEncoding = 'utf8' | 'base64';

/** Durable reference to the existing execution surface that ran a Gofer stage. */
export interface GoferExecutionReference {
  provider: 'eai-workflow' | 'eai-conversation' | 'local-cli' | 'vscode';
  executionId: string;
  workflowKey?: string;
}

/** Exact immutable artifact version consumed by a downstream artifact or approval. */
export interface GoferArtifactReference {
  artifactId: string;
  version: number;
  sha256: string;
}

/** Tenant-admin decision retained independently from mutable stage state. */
export interface GoferApprovalRecord {
  schemaVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  approvalId: string;
  runId: string;
  stage: GoferPipelineStage;
  artifactRefs: readonly GoferArtifactReference[];
  decision: GoferApprovalDecision;
  actor: {
    subjectId: string;
    role: 'tenant-admin';
  };
  rationale?: string;
  decidedAt: string;
}

/** Versioned metadata for every durable file produced by stages 0 through 4. */
export interface GoferArtifactRecord {
  schemaVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  artifactId: string;
  runId: string;
  stage: GoferPipelineStage;
  kind: GoferArtifactKind;
  path: string;
  version: number;
  status: GoferArtifactStatus;
  sha256: string;
  inputArtifacts: readonly GoferArtifactReference[];
  sourceIds: readonly string[];
  createdBy: string;
  createdAt: string;
  supersedesVersion?: number;
}

/** Current stage projection for a run; immutable approval records remain authoritative. */
export interface GoferStageState {
  stage: GoferPipelineStage;
  status: GoferStageStatus;
  attempt: number;
  artifactIds: readonly string[];
  inputHash?: string;
  approvalId?: string;
  startedAt?: string;
  completedAt?: string;
}

/** Versioned durable stage projection used by ResourceAPI-backed adapters. */
export interface PersistedGoferStageState extends GoferStageState {
  schemaVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  tenantId: string;
  runId: string;
  workflowKey?: string;
  executionReference?: GoferExecutionReference;
  updatedAt: string;
}

/** Versioned run state shared by Admin Portal and the existing EAI workflow executor. */
export interface GoferRun {
  schemaVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  runId: string;
  tenantId: string;
  draftId: string;
  appId?: string;
  featureSlug: string;
  goferVersion: string;
  scaffoldVersion: string;
  status: GoferRunStatus;
  currentStage: GoferPipelineStage;
  stages: readonly GoferStageState[];
  executionReference?: GoferExecutionReference;
  createdAt: string;
  updatedAt: string;
}

/** Versioned ordered audit event retained outside mutable run projections. */
export interface GoferRunEvent {
  schemaVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  tenantId: string;
  runId: string;
  sequence: number;
  type:
    | 'run_created'
    | 'stage_submitted'
    | 'stage_approved'
    | 'changes_requested'
    | 'run_cancelled';
  actorUserId: string;
  stage?: GoferPipelineStage;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/** Executor-neutral request for one canonical stage using exact immutable inputs. */
export interface GoferStageExecutionRequest {
  schemaVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  tenantId: string;
  runId: string;
  featureSlug: string;
  stage: GoferPipelineStage;
  inputArtifacts: readonly GoferArtifactReference[];
  sourceIds: readonly string[];
  executionReference: GoferExecutionReference;
  requestedAt: string;
}

/** Bounded, safe failure information returned by a stage executor. */
export interface GoferStageExecutionError {
  code: string;
  message: string;
  retryable: boolean;
}

/** Terminal result from one executor-neutral stage invocation. */
export interface GoferStageExecutionResult {
  schemaVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  tenantId: string;
  runId: string;
  stage: GoferPipelineStage;
  status: GoferStageExecutionStatus;
  executionReference: GoferExecutionReference;
  artifacts: readonly GoferArtifactRecord[];
  files: readonly GoferPortableFile[];
  startedAt?: string;
  completedAt: string;
  error?: GoferStageExecutionError;
}

/** Adapter seam implemented by existing workflows or a future separately deployed worker. */
export interface GoferStageExecutor {
  executeStage(request: GoferStageExecutionRequest): Promise<GoferStageExecutionResult>;
}

/** Data-handling classification retained with each uploaded source. */
export type GoferSourceClassification =
  | 'tenant-provided'
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted';

/** Safety finding that prevents a source original from being committed. */
export interface GoferSourceScanViolation {
  ruleId: string;
  description: string;
}

/** Audit metadata for an uploaded source, including deliberate export omissions. */
export interface GoferSourceDocument {
  schemaVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  sourceId: string;
  runId: string;
  fileName: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
  originalPath: string;
  extractedPaths: readonly string[];
  classification: GoferSourceClassification;
  uploadedBy: string;
  uploadedAt: string;
  usedByArtifactIds: readonly string[];
  scan: {
    status: 'passed' | 'blocked';
    scannedAt: string;
    violations: readonly GoferSourceScanViolation[];
  };
}

/** Explicit record of content excluded from an otherwise complete audit export. */
export interface GoferExportOmission {
  path: string;
  reasonCode: 'secret_detected' | 'credential_detected' | 'private_key_detected' | 'malware';
  sourceId?: string;
  detail: string;
}

/** File payload accepted by the deterministic export builder. */
export interface GoferPortableFileInput {
  path: string;
  content: string;
  encoding: GoferFileEncoding;
}

/** Content-addressed file ready for the generated-repository GitHub adapter. */
export interface GoferPortableFile extends GoferPortableFileInput {
  sha256: string;
}

/** Logical control-plane dependency resolved to a tenant-owned binding after export. */
export interface AppCapabilityRequirement {
  alias: string;
  capability: string;
  required: boolean;
  description: string;
}

/** Environment-neutral capability requirements emitted by governed app delivery. */
export interface AppCapabilityRequirements {
  schemaVersion: typeof APP_CAPABILITY_SCHEMA_VERSION;
  appKey: string;
  requirements: readonly AppCapabilityRequirement[];
}

/** Portable audit handoff that allows a generated repository to resume at stage 5. */
export interface GoferHandoff {
  schemaVersion: typeof GOFER_HANDOFF_SCHEMA_VERSION;
  contractVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  runId: string;
  draftId: string;
  appId?: string;
  featureSlug: string;
  repositoryAction: GoferRepositoryAction;
  goferVersion: string;
  scaffoldVersion: string;
  completedStages: readonly GoferPipelineStage[];
  approvedArtifacts: readonly GoferArtifactReference[];
  executionReference?: GoferExecutionReference;
  exportedAt: string;
  nextAllowedStage: GoferNextStage;
  artifactManifestPath: string;
  sourceManifestPath: string;
  auditHistoryPath: string;
  capabilityManifestPath: string;
  omissions: readonly GoferExportOmission[];
}

/** Complete versioned artifact and approval history committed with an app repository. */
export interface GoferArtifactManifest {
  schemaVersion: typeof GOFER_ARTIFACT_MANIFEST_SCHEMA_VERSION;
  contractVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  runId: string;
  featureSlug: string;
  artifacts: readonly GoferArtifactRecord[];
  approvals: readonly GoferApprovalRecord[];
}

/** Complete source lineage, including blocked-original audit entries. */
export interface GoferSourceManifest {
  schemaVersion: typeof GOFER_SOURCE_MANIFEST_SCHEMA_VERSION;
  contractVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  runId: string;
  sources: readonly GoferSourceDocument[];
  omissions: readonly GoferExportOmission[];
}

/** Ordered immutable decisions and run events committed with the generated repository. */
export interface GoferAuditHistory {
  schemaVersion: typeof GOFER_AUDIT_HISTORY_SCHEMA_VERSION;
  contractVersion: typeof GOFER_ADMIN_PORTAL_CONTRACT_VERSION;
  tenantId: string;
  runId: string;
  approvals: readonly GoferApprovalRecord[];
  events: readonly GoferRunEvent[];
}

/** Inputs required to produce a complete portable `.specify` snapshot. */
export interface CreateGoferExportBundleRequest {
  run: GoferRun;
  repositoryAction: GoferRepositoryAction;
  exportedAt: string;
  artifacts: readonly GoferArtifactRecord[];
  approvals: readonly GoferApprovalRecord[];
  events: readonly GoferRunEvent[];
  sources: readonly GoferSourceDocument[];
  omissions: readonly GoferExportOmission[];
  capabilityRequirements: AppCapabilityRequirements;
  files: readonly GoferPortableFileInput[];
}

/** Deterministic export result consumed by repository generation and regeneration. */
export interface GoferExportBundle {
  schemaVersion: typeof GOFER_EXPORT_BUNDLE_SCHEMA_VERSION;
  handoff: GoferHandoff;
  artifactManifest: GoferArtifactManifest;
  sourceManifest: GoferSourceManifest;
  auditHistory: GoferAuditHistory;
  capabilityRequirements: AppCapabilityRequirements;
  files: readonly GoferPortableFile[];
}

/** Shared validator result used by BFF, CLI, VSIX, and tests. */
export interface GoferValidationResult {
  valid: boolean;
  errors: readonly string[];
}
