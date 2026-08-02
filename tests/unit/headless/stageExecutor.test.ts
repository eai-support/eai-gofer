import { describe, expect, it } from 'vitest';
import {
  GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
  validateStageExecutionRequest,
  validateStageExecutionResult,
  type GoferArtifactReference,
  type GoferStageExecutionRequest,
  type GoferStageExecutionResult,
  type GoferStageExecutor,
} from '../../../src/headless/index.js';
import { createValidExportFixture } from './fixtures.js';

function createExecutionFixture(): {
  request: GoferStageExecutionRequest;
  result: GoferStageExecutionResult;
} {
  const fixture = createValidExportFixture();
  const tasks = fixture.artifacts.find((artifact) => artifact.artifactId === 'tasks')!;
  const traceability = fixture.artifacts.find(
    (artifact) => artifact.artifactId === 'traceability'
  )!;
  const outputArtifacts = [tasks, traceability].map((artifact) => ({
    ...artifact,
    status: 'current' as const,
    inputArtifacts: tasks.inputArtifacts,
    sourceIds: [],
  }));
  const outputFiles = outputArtifacts.map((artifact) => {
    const file = fixture.files.find((candidate) => candidate.path === artifact.path)!;
    return { ...file, sha256: artifact.sha256 };
  });
  const executionReference = {
    provider: 'eai-conversation' as const,
    executionId: 'conversation-execution-3171',
    workflowKey: 'gofer-stage-worker-v1',
  };
  return {
    request: {
      schemaVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
      tenantId: fixture.run.tenantId,
      appKey: fixture.run.appKey,
      runId: fixture.run.runId,
      featureSlug: fixture.run.featureSlug,
      stage: '4_tasks',
      inputArtifacts: tasks.inputArtifacts,
      sourceIds: [],
      executionReference,
      requestedAt: '2026-07-15T02:00:00.000Z',
    },
    result: {
      schemaVersion: GOFER_ADMIN_PORTAL_CONTRACT_VERSION,
      tenantId: fixture.run.tenantId,
      appKey: fixture.run.appKey,
      runId: fixture.run.runId,
      stage: '4_tasks',
      status: 'succeeded',
      executionReference,
      artifacts: outputArtifacts,
      files: outputFiles,
      startedAt: '2026-07-15T02:00:01.000Z',
      completedAt: '2026-07-15T02:00:02.000Z',
    },
  };
}

describe('GoferStageExecutor headless contract', () => {
  it('validates and executes an executor-neutral stage request and result', async () => {
    const fixture = createExecutionFixture();
    const executor: GoferStageExecutor = {
      executeStage: async (request) => ({
        ...fixture.result,
        executionReference: request.executionReference,
      }),
    };

    expect(validateStageExecutionRequest(fixture.request)).toEqual({ valid: true, errors: [] });
    const result = await executor.executeStage(fixture.request);
    expect(validateStageExecutionResult(fixture.request, result)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects non-canonical stages, duplicate inputs, and invalid hashes', () => {
    const fixture = createExecutionFixture();
    const firstRef = fixture.request.inputArtifacts[0];
    const invalidRef: GoferArtifactReference = { ...firstRef, sha256: 'not-a-sha256' };
    const invalidRequest = {
      ...fixture.request,
      stage: '5_implement',
      inputArtifacts: [invalidRef, invalidRef],
      sourceIds: ['source-1', 'source-1'],
    } as unknown as GoferStageExecutionRequest;

    expect(validateStageExecutionRequest(invalidRequest)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Stage request stage is invalid.',
        expect.stringContaining('contains duplicate artifactId'),
        expect.stringContaining('sha256 is invalid'),
        'Stage request sourceIds contains duplicate sourceId source-1.',
      ]),
    });
  });

  it('rejects result ownership, stage, and execution-reference drift', () => {
    const fixture = createExecutionFixture();
    const drifted = {
      ...fixture.result,
      tenantId: 'another-tenant',
      appKey: 'another-app',
      runId: 'another-run',
      stage: '3_plan',
      executionReference: {
        ...fixture.result.executionReference,
        executionId: 'another-execution',
      },
      artifacts: fixture.result.artifacts.map((artifact) => ({
        ...artifact,
        runId: 'another-run',
        stage: '3_plan',
      })),
    } as GoferStageExecutionResult;

    expect(validateStageExecutionResult(fixture.request, drifted)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Stage result tenantId, appKey, runId, and stage must match the request.',
        'Stage result executionReference must match the request.',
        expect.stringContaining('must belong to the request run and stage'),
      ]),
    });
  });

  it('requires app identity and rejects cross-app stage results', () => {
    const fixture = createExecutionFixture();

    expect(validateStageExecutionRequest({ ...fixture.request, appKey: ' ' })).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(['Stage request appKey is required.']),
    });
    expect(
      validateStageExecutionResult(fixture.request, {
        ...fixture.result,
        appKey: 'another-app',
      })
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Stage result tenantId, appKey, runId, and stage must match the request.',
      ]),
    });
  });

  it.each([
    ['tenantId', 'Stage request tenantId is required.'],
    ['appKey', 'Stage request appKey is required.'],
  ] as const)('fails closed when legacy stage requests omit %s', (field, expectedError) => {
    const fixture = createExecutionFixture();
    const legacyRequest = { ...fixture.request } as Partial<GoferStageExecutionRequest>;
    delete legacyRequest[field];

    expect(
      validateStageExecutionRequest(legacyRequest as GoferStageExecutionRequest)
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expectedError]),
    });
  });

  it('rejects hostile and cross-feature output paths', () => {
    const fixture = createExecutionFixture();
    const hostilePath = `.specify/specs/${fixture.request.featureSlug}/../secret.md`;
    const hostile: GoferStageExecutionResult = {
      ...fixture.result,
      artifacts: fixture.result.artifacts.map((artifact, index) =>
        index === 0 ? { ...artifact, path: hostilePath } : artifact
      ),
      files: fixture.result.files.map((file, index) =>
        index === 0 ? { ...file, path: hostilePath } : file
      ),
    };

    expect(validateStageExecutionResult(fixture.request, hostile)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.stringContaining('path must be confined to .specify/specs/'),
        expect.stringContaining('file path must be confined to .specify/specs/'),
      ]),
    });
  });

  it('rejects duplicate output paths and content or artifact hash drift', () => {
    const fixture = createExecutionFixture();
    const firstArtifact = fixture.result.artifacts[0];
    const firstFile = fixture.result.files[0];
    const invalid: GoferStageExecutionResult = {
      ...fixture.result,
      artifacts: fixture.result.artifacts.map((artifact, index) =>
        index === 1 ? { ...artifact, path: firstArtifact.path, sha256: 'b'.repeat(64) } : artifact
      ),
      files: [firstFile, firstFile],
    };

    expect(validateStageExecutionResult(fixture.request, invalid)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.stringContaining('duplicate artifact path'),
        expect.stringContaining('duplicate file path'),
        expect.stringContaining('sha256 must match its portable file'),
      ]),
    });

    expect(
      validateStageExecutionResult(fixture.request, {
        ...fixture.result,
        files: fixture.result.files.map((file, index) =>
          index === 0 ? { ...file, content: `${file.content}\nchanged` } : file
        ),
      })
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([expect.stringContaining('content does not match sha256')]),
    });
  });

  it('requires every stage kind and canonical auditable artifacts', () => {
    const fixture = createExecutionFixture();
    const tasksOnly: GoferStageExecutionResult = {
      ...fixture.result,
      artifacts: [{ ...fixture.result.artifacts[0], createdBy: '', createdAt: '' }],
      files: [fixture.result.files[0]],
    };

    expect(validateStageExecutionResult(fixture.request, tasksOnly)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Stage result for 4_tasks requires current artifact kind traceability.',
        expect.stringContaining('createdBy is required'),
        expect.stringContaining('createdAt must be ISO8601'),
      ]),
    });
  });

  it('requires exact artifact and source lineage on successful results', () => {
    const fixture = createExecutionFixture();
    const withSources: GoferStageExecutionRequest = {
      ...fixture.request,
      sourceIds: ['source-1'],
    };
    const distributedLineage: GoferStageExecutionResult = {
      ...fixture.result,
      artifacts: fixture.result.artifacts.map((artifact, index) => ({
        ...artifact,
        inputArtifacts: index === 0 ? withSources.inputArtifacts : [],
        sourceIds: index === 0 ? ['source-1'] : [],
      })),
    };

    expect(validateStageExecutionResult(withSources, distributedLineage)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Stage result artifact traceability inputArtifacts must match the exact request inputArtifacts.',
        'Stage result artifact traceability sourceIds must match the exact request sourceIds.',
      ]),
    });
  });

  it('enforces bounded terminal result shapes', () => {
    const fixture = createExecutionFixture();
    expect(
      validateStageExecutionResult(fixture.request, {
        ...fixture.result,
        status: 'failed',
        artifacts: [],
        files: [],
        error: undefined,
      })
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(['A failed stage result must contain a bounded error.']),
    });

    expect(
      validateStageExecutionResult(fixture.request, {
        ...fixture.result,
        status: 'failed',
        artifacts: [],
        files: [],
        error: { code: 'WORKER_FAILED', message: 'Stage execution failed.', retryable: true },
      })
    ).toEqual({ valid: true, errors: [] });

    expect(
      validateStageExecutionResult(fixture.request, {
        ...fixture.result,
        status: 'cancelled',
      })
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'A failed or cancelled stage result must not return artifacts or files.',
      ]),
    });
  });

  it('rejects invalid error and timestamp bounds', () => {
    const fixture = createExecutionFixture();
    const invalid: GoferStageExecutionResult = {
      ...fixture.result,
      status: 'failed',
      artifacts: [],
      files: [],
      startedAt: '2026-07-15T01:59:00.000Z',
      error: { code: 'bad-code', message: '', retryable: true },
    };

    expect(validateStageExecutionResult(fixture.request, invalid)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Stage result timestamps must follow requestedAt, startedAt, then completedAt.',
        'Stage result error.code must be an uppercase controlled code.',
        'Stage result error.message must contain 1 to 1024 characters.',
      ]),
    });
  });
});
