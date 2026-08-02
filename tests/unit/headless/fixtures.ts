import { createHash } from 'node:crypto';
import {
  GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
  GOFER_PORTABLE_SCAFFOLD_PATHS,
  type CreateGoferExportBundleRequest,
  type GoferApprovalRecord,
  type GoferArtifactKind,
  type GoferArtifactRecord,
  type GoferArtifactReference,
  type GoferPipelineStage,
  type GoferPortableFileInput,
  type GoferRun,
} from '../../../src/headless/index.js';

const RUN_ID = 'run-3171';
const CREATED_AT = '2026-07-15T00:00:00.000Z';

/** Hash fixture content using the canonical plain SHA-256 format. */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function artifact(
  artifactId: string,
  stage: GoferPipelineStage,
  kind: GoferArtifactKind,
  fileName: string,
  content: string,
  inputArtifacts: readonly GoferArtifactReference[] = []
): { record: GoferArtifactRecord; file: GoferPortableFileInput } {
  const hash = sha256(content);
  return {
    record: {
      schemaVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
      artifactId,
      runId: RUN_ID,
      stage,
      kind,
      path: `.specify/specs/3171-admin-portal-gofer-stages/${fileName}`,
      version: 1,
      status: 'approved',
      sha256: hash,
      inputArtifacts,
      sourceIds: [],
      createdBy: 'gofer',
      createdAt: CREATED_AT,
    },
    file: {
      path: `.specify/specs/3171-admin-portal-gofer-stages/${fileName}`,
      content,
      encoding: 'utf8',
    },
  };
}

function ref(record: GoferArtifactRecord): GoferArtifactReference {
  return {
    artifactId: record.artifactId,
    version: record.version,
    sha256: record.sha256,
  };
}

/** Build a generation-ready fixture with an exact approval for every stage. */
export function createValidExportFixture(): CreateGoferExportBundleRequest {
  const discovery = artifact('discovery', '0_start', 'discovery', 'discovery.md', '# Discovery');
  const research = artifact('research', '1_research', 'research', 'research.md', '# Research', [
    ref(discovery.record),
  ]);
  const goalLedger = artifact(
    'goal-ledger',
    '1_research',
    'goal-ledger',
    'goal-ledger.json',
    '{"goals":[]}',
    [ref(discovery.record)]
  );
  const loopContract = artifact(
    'loop-contract',
    '1_research',
    'loop-contract',
    'loop-contract.json',
    '{"maxIterations":3}',
    [ref(discovery.record)]
  );
  const specification = artifact(
    'specification',
    '2_specify',
    'specification',
    'spec.md',
    '# Specification',
    [ref(research.record), ref(goalLedger.record)]
  );
  const checklist = artifact(
    'requirements-checklist',
    '2_specify',
    'requirements-checklist',
    'checklists/requirements.md',
    '# Requirements checklist',
    [ref(specification.record)]
  );
  const plan = artifact('plan', '3_plan', 'plan', 'plan.md', '# Plan', [ref(specification.record)]);
  const dataModel = artifact('data-model', '3_plan', 'data-model', 'data-model.md', '# Data', [
    ref(specification.record),
  ]);
  const contract = artifact(
    'contract',
    '3_plan',
    'contract',
    'contracts/headless.md',
    '# Contract',
    [ref(specification.record)]
  );
  const tasks = artifact('tasks', '4_tasks', 'tasks', 'tasks.md', '# Tasks', [
    ref(plan.record),
    ref(dataModel.record),
    ref(contract.record),
  ]);
  const traceability = artifact(
    'traceability',
    '4_tasks',
    'traceability',
    'traceability.md',
    '# Traceability',
    [ref(specification.record), ref(tasks.record)]
  );

  const created = [
    discovery,
    research,
    goalLedger,
    loopContract,
    specification,
    checklist,
    plan,
    dataModel,
    contract,
    tasks,
    traceability,
  ];

  const run: GoferRun = {
    schemaVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
    runId: RUN_ID,
    tenantId: 'tenant-1',
    appKey: 'sample-app',
    draftId: 'draft-1',
    appId: 'app-1',
    featureSlug: '3171-admin-portal-gofer-stages',
    goferVersion: '3.7.21',
    scaffoldVersion: '3.7.21',
    status: 'approved',
    currentStage: '4_tasks',
    stages: [
      {
        stage: '0_start',
        status: 'approved',
        attempt: 1,
        artifactIds: ['discovery'],
        approvalId: 'approval-0-start',
      },
      {
        stage: '1_research',
        status: 'approved',
        attempt: 1,
        artifactIds: ['research', 'goal-ledger', 'loop-contract'],
        approvalId: 'approval-1-research',
      },
      {
        stage: '2_specify',
        status: 'approved',
        attempt: 1,
        artifactIds: ['specification', 'requirements-checklist'],
        approvalId: 'approval-2-specify',
      },
      {
        stage: '3_plan',
        status: 'approved',
        attempt: 1,
        artifactIds: ['plan', 'data-model', 'contract'],
        approvalId: 'approval-3-plan',
      },
      {
        stage: '4_tasks',
        status: 'approved',
        attempt: 1,
        artifactIds: ['tasks', 'traceability'],
        approvalId: 'approval-tasks',
      },
    ],
    executionReference: {
      provider: 'eai-workflow',
      executionId: 'execution-1',
      workflowKey: 'gofer-stages-v1',
    },
    createdAt: CREATED_AT,
    updatedAt: '2026-07-15T01:00:00.000Z',
  };

  const tasksApproval: GoferApprovalRecord = {
    schemaVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
    approvalId: 'approval-tasks',
    runId: RUN_ID,
    stage: '4_tasks',
    artifactRefs: [ref(tasks.record), ref(traceability.record)],
    decision: 'approved',
    actor: { subjectId: 'tenant-admin-1', role: 'tenant-admin' },
    decidedAt: '2026-07-15T00:59:00.000Z',
  };
  const predecessorApprovals: GoferApprovalRecord[] = run.stages
    .filter((stage) => stage.stage !== '4_tasks')
    .map((stage) => ({
      schemaVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
      approvalId: stage.approvalId!,
      runId: RUN_ID,
      stage: stage.stage,
      artifactRefs: stage.artifactIds.map((artifactId) => {
        const record = created.find((item) => item.record.artifactId === artifactId)!.record;
        return ref(record);
      }),
      decision: 'approved',
      actor: { subjectId: 'tenant-admin-1', role: 'tenant-admin' },
      decidedAt: '2026-07-15T00:59:00.000Z',
    }));

  const sourceContent = 'approved source content';
  return {
    run,
    repositoryAction: 'generate',
    exportedAt: '2026-07-15T02:00:00.000Z',
    artifacts: created.map((item) => item.record),
    approvals: [tasksApproval, ...predecessorApprovals],
    events: [
      {
        schemaVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
        tenantId: 'tenant-1',
        runId: RUN_ID,
        sequence: 1,
        type: 'run_created',
        actorUserId: 'tenant-admin-1',
        createdAt: CREATED_AT,
      },
      {
        schemaVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
        tenantId: 'tenant-1',
        runId: RUN_ID,
        sequence: 2,
        type: 'stage_submitted',
        actorUserId: 'tenant-admin-1',
        stage: '4_tasks',
        createdAt: '2026-07-15T00:30:00.000Z',
      },
      {
        schemaVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
        tenantId: 'tenant-1',
        runId: RUN_ID,
        sequence: 3,
        type: 'stage_approved',
        actorUserId: 'tenant-admin-1',
        stage: '4_tasks',
        createdAt: '2026-07-15T00:59:00.000Z',
        metadata: { approvalId: 'approval-tasks' },
      },
    ],
    sources: [
      {
        schemaVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
        sourceId: 'source-1',
        runId: RUN_ID,
        fileName: 'process.txt',
        mediaType: 'text/plain',
        byteLength: Buffer.byteLength(sourceContent),
        sha256: sha256(sourceContent),
        originalPath: '.specify/sources/originals/process.txt',
        extractedPaths: ['.specify/sources/extracted/process.txt'],
        classification: 'tenant-provided',
        uploadedBy: 'tenant-admin-1',
        uploadedAt: CREATED_AT,
        usedByArtifactIds: ['research'],
        scan: {
          status: 'passed',
          scannedAt: '2026-07-15T00:01:00.000Z',
          violations: [],
        },
      },
    ],
    omissions: [],
    files: [
      ...GOFER_PORTABLE_SCAFFOLD_PATHS.map((path) => ({
        path,
        content: path === '.specify/.gofer-version' ? '3.7.21\n' : `${path}\n`,
        encoding: 'utf8' as const,
      })),
      ...created.map((item) => item.file),
      {
        path: '.specify/sources/originals/process.txt',
        content: sourceContent,
        encoding: 'utf8',
      },
      {
        path: '.specify/sources/extracted/process.txt',
        content: sourceContent,
        encoding: 'utf8',
      },
    ],
  };
}
