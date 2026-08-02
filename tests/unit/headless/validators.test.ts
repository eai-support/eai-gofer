import { describe, expect, it } from 'vitest';
import {
  GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
  validateArtifactFreshness,
  validateGenerationReadiness,
  validateGoferRun,
  validateStageApproval,
  validateStageTransition,
  type GoferArtifactRecord,
  type GoferRun,
} from '../../../src/headless/index.js';
import { createValidExportFixture, sha256 } from './fixtures.js';

describe('headless Gofer validators', () => {
  it('allows the canonical next stage after an approved predecessor', () => {
    const fixture = createValidExportFixture();
    const run: GoferRun = {
      ...fixture.run,
      status: 'running',
      currentStage: '1_research',
      stages: fixture.run.stages.map((stage) =>
        stage.stage === '2_specify' ? { ...stage, status: 'pending' } : stage
      ),
    };

    expect(validateStageTransition(run, '2_specify')).toEqual({ valid: true, errors: [] });
  });

  it('allows Stage 0a to be skipped but requires it to be approved when present', () => {
    const fixture = createValidExportFixture();
    const baseRun: GoferRun = {
      ...fixture.run,
      status: 'running',
      currentStage: '0_start',
      stages: fixture.run.stages.map((stage) =>
        stage.stage === '1_research' ? { ...stage, status: 'pending' } : stage
      ),
    };

    expect(validateStageTransition(baseRun, '1_research').valid).toBe(true);

    const withUnapprovedOptionalStage: GoferRun = {
      ...baseRun,
      stages: [
        ...baseRun.stages,
        { stage: '0a_problem_validation', status: 'stale', attempt: 1, artifactIds: [] },
      ],
    };
    expect(validateStageTransition(withUnapprovedOptionalStage, '1_research')).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Optional stage 0a_problem_validation must be approved when it is present.',
      ]),
    });
  });

  it('rejects out-of-order transitions and transitions from terminal runs', () => {
    const fixture = createValidExportFixture();
    expect(validateStageTransition(fixture.run, '2_specify')).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Run status approved does not allow another stage transition.',
        'Stage 4_tasks cannot transition directly to 2_specify.',
      ]),
    });
  });

  it('validates tenant-admin approval against the exact current stage artifacts', () => {
    const fixture = createValidExportFixture();
    const run: GoferRun = {
      ...fixture.run,
      status: 'awaiting_approval',
      stages: fixture.run.stages.map((stage) =>
        stage.stage === '4_tasks'
          ? { ...stage, status: 'awaiting_approval', approvalId: undefined }
          : stage
      ),
    };

    expect(validateStageApproval(run, fixture.approvals[0], fixture.artifacts)).toEqual({
      valid: true,
      errors: [],
    });

    const incompleteApproval = {
      ...fixture.approvals[0],
      artifactRefs: fixture.approvals[0].artifactRefs.slice(0, 1),
    };
    expect(validateStageApproval(run, incompleteApproval, fixture.artifacts)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Approval artifactRefs must match the exact current stage artifacts.',
      ]),
    });
  });

  it('marks downstream artifacts stale when an input has a newer version', () => {
    const fixture = createValidExportFixture();
    const researchV1 = fixture.artifacts.find((artifact) => artifact.artifactId === 'research')!;
    const specification = fixture.artifacts.find(
      (artifact) => artifact.artifactId === 'specification'
    )!;
    const researchV2: GoferArtifactRecord = {
      ...researchV1,
      version: 2,
      path: '.specify/specs/3171-admin-portal-gofer-stages/history/research-v2.md',
      sha256: sha256('# Research v2'),
      status: 'current',
      supersedesVersion: 1,
    };

    expect(
      validateArtifactFreshness(specification, [...fixture.artifacts, researchV2])
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.stringContaining('Input artifact research no longer matches version 1'),
      ]),
    });
  });

  it('requires a matching immutable approval for every approved stage', () => {
    const fixture = createValidExportFixture();
    expect(validateGenerationReadiness(fixture.run, fixture.artifacts, fixture.approvals)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateGenerationReadiness(fixture.run, fixture.artifacts, [])).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Approved stage 0_start requires its immutable approval record.',
        'Approved stage 4_tasks requires its immutable approval record.',
      ]),
    });
  });

  it('allows changes to be requested from an approved stage', () => {
    const fixture = createValidExportFixture();
    const approval = { ...fixture.approvals[0], decision: 'changes_requested' as const };

    expect(validateStageApproval(fixture.run, approval, fixture.artifacts)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects invalid run and stage enums, order, and execution providers', () => {
    const fixture = createValidExportFixture();
    const invalid = {
      ...fixture.run,
      status: 'unknown',
      stages: [
        { ...fixture.run.stages[1], status: 'unknown' },
        fixture.run.stages[0],
        ...fixture.run.stages.slice(2),
      ],
      executionReference: {
        provider: 'unknown',
        executionId: 'execution-1',
      },
    } as unknown as GoferRun;

    expect(validateGoferRun(invalid)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'status is invalid.',
        'Stage 1_research status is invalid.',
        'stages must follow the canonical Gofer pipeline order.',
        'executionReference.provider is invalid.',
      ]),
    });
  });

  it('rejects contract-version drift in run projections', () => {
    const fixture = createValidExportFixture();
    const drifted = {
      ...fixture.run,
      schemaVersion: 'eai.gofer.admin_portal.v2',
    } as unknown as GoferRun;

    expect(validateStageTransition(drifted, '0_start')).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        `schemaVersion must be ${GOFER_ADMIN_PORTAL_CONTRACT_VERSION}.`,
      ]),
    });
  });

  it('requires immutable app identity in run projections', () => {
    const fixture = createValidExportFixture();
    const invalid = { ...fixture.run, appKey: ' ' };

    expect(validateGoferRun(invalid)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(['appKey is required.']),
    });
  });

  it.each([
    ['tenantId', 'tenantId is required.'],
    ['appKey', 'appKey is required.'],
  ] as const)('fails closed when legacy run payloads omit %s', (field, expectedError) => {
    const fixture = createValidExportFixture();
    const legacyRun = { ...fixture.run } as Partial<GoferRun>;
    delete legacyRun[field];

    expect(validateGoferRun(legacyRun as GoferRun)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expectedError]),
    });
  });

  it('fails closed instead of throwing for an invalid runtime stage value', () => {
    const fixture = createValidExportFixture();
    const invalid = { ...fixture.run, currentStage: 'unknown' } as unknown as GoferRun;

    expect(validateStageTransition(invalid, '1_research')).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(['currentStage is invalid.']),
    });
  });

  it('rejects an approval that belongs to another run', () => {
    const fixture = createValidExportFixture();
    const approval = { ...fixture.approvals[0], runId: 'another-run' };
    const approvals = fixture.approvals.map((candidate) =>
      candidate.approvalId === approval.approvalId ? approval : candidate
    );

    expect(validateGenerationReadiness(fixture.run, fixture.artifacts, approvals)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(['Stage 4_tasks approval must belong to this run and stage.']),
    });
  });
});
