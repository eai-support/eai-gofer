import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  type DeploymentReadinessValidatedEventPayload,
  validateDeploymentReadiness,
} from '../../../extension/src/services/enterpriseai/internalApi/ValidateDeploymentReadiness';
import { createDeploymentReadinessEventHandlers } from '../../../extension/src/services/enterpriseai/events/DeploymentReadinessEvents';
import {
  buildManagedDeployDoctorEvidence,
  MANAGED_DEPLOY_TASK_TEXT,
} from '../../fixtures/enterpriseai/managed-deploy-doctor-evidence';

function readCommandFile(fileName: string): string {
  return fs.readFileSync(path.join(process.cwd(), '.specify', 'commands', fileName), 'utf8');
}

function createFixtureDir(prefix: string): string {
  return path.join(
    process.cwd(),
    'tests',
    'integration',
    'enterpriseai',
    `${prefix}-${process.pid}-${Date.now()}`
  );
}

describe('enterpriseai deployment guidance ordering (root integration)', () => {
  it('documents scaffold-before-deploy ordering, EAI CLI syntax, and runtime deploy-doctor gating', () => {
    const tasksCommand = readCommandFile('4_gofer_tasks.md');
    const implementCommand = readCommandFile('5_gofer_implement.md');
    const portableDoctorCommand =
      'eai deploy doctor --operation-id <operation-id> --app-key <app-key> --tenant-id <app-scope-tenant> --target-tenant-id <runtime-tenant> --evidence-out .eai/deploy-doctor.json --format json';

    expect(tasksCommand).toContain('Ordered Runnable Task-Generation Guidance');
    expect(tasksCommand).toContain('EAI App Template scaffolding -> `eai init`');
    expect(tasksCommand).toContain('eai init <app-name>');
    expect(tasksCommand).toContain('eai runtime validate');
    expect(tasksCommand).toContain('eai verify');
    expect(tasksCommand).toContain('eai deploy trigger --repo <org/repo>');
    expect(tasksCommand).toContain(portableDoctorCommand);
    expect(tasksCommand).toContain('Put that complete inline command on the post-deploy task');
    expect(tasksCommand).toContain('legacy generic deployment task cannot pass');
    expect(tasksCommand).not.toContain('mkdir -p .eai');
    expect(tasksCommand).not.toContain('> .eai/deploy-doctor.json');

    expect(implementCommand).toContain('EnterpriseAI Runtime Deployment Preflight Gate');
    expect(implementCommand).toContain('runtime contract and deploy');
    expect(implementCommand).toContain('eai.runtime.json');
    expect(implementCommand).toContain('.eai/deploy-doctor.json');
    expect(implementCommand).toContain(portableDoctorCommand);
    expect(implementCommand).toContain('eai.managed-deploy-doctor-evidence.v1');
    expect(implementCommand).toContain('stale, malformed, failing');
    expect(implementCommand).not.toContain('mkdir -p .eai');
    expect(implementCommand).not.toContain('> .eai/deploy-doctor.json');
  });

  it('enforces required-file readiness gating before deployment task completion and emits EVT-012', async () => {
    const fixturesDir = createFixtureDir('fixtures-deployment-guidance-ordering');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(fixturesDir, { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'eai.runtime.json'), '{"schemaVersion":1}\n', 'utf8');

    try {
      const eventHandlers = createDeploymentReadinessEventHandlers();
      const consumedPayloads: DeploymentReadinessValidatedEventPayload[] = [];
      const unsubscribe = eventHandlers.consume(
        (payload: DeploymentReadinessValidatedEventPayload): void => {
          consumedPayloads.push(payload);
        }
      );

      const result = await validateDeploymentReadiness(
        {
          runId: 'run_029_0001',
          stage: 'implementation',
          deploymentTaskId: 'task_deploy_01',
          deploymentTaskText: MANAGED_DEPLOY_TASK_TEXT,
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
          blockCompletionOnFailure: true,
        },
        {
          workspaceRoot: fixturesDir,
          validatedAt: '2026-04-09T00:25:00Z',
          eventPublisher: (payload: DeploymentReadinessValidatedEventPayload): void => {
            eventHandlers.publish(payload);
          },
        }
      );

      unsubscribe();

      expect(result.contractId).toBe('IAP-011');
      expect(result.response.readinessPassed).toBe(false);
      expect(result.response.missingFiles).toEqual(['.eai/deploy-doctor.json']);
      expect(result.response.deploymentTaskCompletionAllowed).toBe(false);
      expect(result.emittedEvent.contractId).toBe('EVT-012');
      expect(consumedPayloads).toHaveLength(1);
      expect(consumedPayloads[0].deploymentTaskId).toBe('task_deploy_01');
      expect(consumedPayloads[0].missingFiles).toEqual(['.eai/deploy-doctor.json']);
      expect(eventHandlers.consumerCount()).toBe(0);

      await expect(
        validateDeploymentReadiness(
          {
            runId: 'run_029_unsafe',
            stage: 'implementation',
            deploymentTaskId: 'task_deploy_unsafe',
            deploymentTaskText: MANAGED_DEPLOY_TASK_TEXT,
            requiredFiles: ['/etc/passwd'],
            blockCompletionOnFailure: true,
          },
          {
            workspaceRoot: fixturesDir,
          }
        )
      ).rejects.toThrow(/IMPL_DEPLOYMENT_PATH_INVALID/);
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it('allows only an exact passing task-bound managed deployment receipt', async () => {
    const fixturesDir = createFixtureDir('fixtures-deployment-evidence-exact');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(fixturesDir, '.eai'), { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
    fs.writeFileSync(
      path.join(fixturesDir, '.eai', 'deploy-doctor.json'),
      `${JSON.stringify(buildManagedDeployDoctorEvidence(), null, 2)}\n`
    );

    try {
      const result = await validateDeploymentReadiness(
        {
          runId: 'run_exact_receipt',
          stage: 'implementation',
          deploymentTaskId: 'task_exact_receipt',
          deploymentTaskText: MANAGED_DEPLOY_TASK_TEXT,
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
          blockCompletionOnFailure: true,
        },
        { workspaceRoot: fixturesDir, validatedAt: '2026-09-25T05:01:00.000Z' }
      );

      expect(result.response.readinessPassed).toBe(true);
      expect(result.response.evidenceIssues).toEqual([]);
      expect(result.response.deploymentTaskCompletionAllowed).toBe(true);
      expect(result.emittedEvent.payload.evidenceIssues).toEqual([]);
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it.each([
    [
      'operation ID',
      buildManagedDeployDoctorEvidence({ operation: { operationId: 'operation-other' } }),
      'DOCTOR_EVIDENCE_OPERATION_ID_MISMATCH',
    ],
    [
      'app key',
      buildManagedDeployDoctorEvidence({ operation: { appKey: 'another-app' } }),
      'DOCTOR_EVIDENCE_APP_KEY_MISMATCH',
    ],
    [
      'app-scope tenant',
      buildManagedDeployDoctorEvidence({ operation: { tenantId: 'another-tenant' } }),
      'DOCTOR_EVIDENCE_APP_TENANT_MISMATCH',
    ],
    [
      'runtime tenant',
      buildManagedDeployDoctorEvidence({ operation: { targetTenantId: 'another-runtime' } }),
      'DOCTOR_EVIDENCE_RUNTIME_TENANT_MISMATCH',
    ],
  ])('rejects a receipt with a mismatched %s', async (_label, evidence, expectedIssue) => {
    const fixturesDir = createFixtureDir('fixtures-deployment-evidence-mismatch');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(fixturesDir, '.eai'), { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
    fs.writeFileSync(
      path.join(fixturesDir, '.eai', 'deploy-doctor.json'),
      `${JSON.stringify(evidence)}\n`
    );

    try {
      const result = await validateDeploymentReadiness(
        {
          runId: 'run_mismatched_receipt',
          stage: 'implementation',
          deploymentTaskId: 'task_mismatched_receipt',
          deploymentTaskText: MANAGED_DEPLOY_TASK_TEXT,
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
          blockCompletionOnFailure: true,
        },
        { workspaceRoot: fixturesDir }
      );

      expect(result.response.readinessPassed).toBe(false);
      expect(result.response.evidenceIssues).toContain(expectedIssue);
      expect(result.response.deploymentTaskCompletionAllowed).toBe(false);
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it.each([
    ['malformed JSON', '{not-json', 'DOCTOR_EVIDENCE_INVALID_JSON'],
    [
      'wrong schema',
      JSON.stringify(buildManagedDeployDoctorEvidence({ schemaVersion: 'legacy.v0' })),
      'DOCTOR_EVIDENCE_SCHEMA_INVALID',
    ],
    [
      'failing evidence status',
      JSON.stringify(buildManagedDeployDoctorEvidence({ status: 'fail' })),
      'DOCTOR_EVIDENCE_STATUS_NOT_PASS',
    ],
    [
      'failing doctor status',
      JSON.stringify(buildManagedDeployDoctorEvidence({ doctor: { status: 'fail' } })),
      'DOCTOR_EVIDENCE_STATUS_NOT_PASS',
    ],
    [
      'failing recorded check',
      JSON.stringify(
        buildManagedDeployDoctorEvidence({
          doctor: {
            checks: [
              {
                name: 'authenticated-readiness',
                method: 'GET',
                path: '/api/eai/readiness',
                url: 'https://planning.example.com/api/eai/readiness',
                category: 'app_code_runtime_error',
                status: 'fail',
                message: 'Authenticated readiness failed.',
                authenticated: true,
              },
            ],
            summary: { pass: 0, fail: 1, warning: 0, skip: 0 },
          },
        })
      ),
      'DOCTOR_EVIDENCE_CHECKS_NOT_PASS',
    ],
  ])('rejects %s', async (_label, evidenceText, expectedIssue) => {
    const fixturesDir = createFixtureDir('fixtures-deployment-evidence-invalid');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(fixturesDir, '.eai'), { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
    fs.writeFileSync(path.join(fixturesDir, '.eai', 'deploy-doctor.json'), evidenceText);

    try {
      const result = await validateDeploymentReadiness(
        {
          runId: 'run_invalid_receipt',
          stage: 'implementation',
          deploymentTaskId: 'task_invalid_receipt',
          deploymentTaskText: MANAGED_DEPLOY_TASK_TEXT,
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
          blockCompletionOnFailure: true,
        },
        { workspaceRoot: fixturesDir }
      );

      expect(result.response.readinessPassed).toBe(false);
      expect(result.response.evidenceIssues).toContain(expectedIssue);
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it('fails legacy task text without a resolved operation binding', async () => {
    const fixturesDir = createFixtureDir('fixtures-deployment-evidence-legacy-task');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(fixturesDir, '.eai'), { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
    fs.writeFileSync(
      path.join(fixturesDir, '.eai', 'deploy-doctor.json'),
      JSON.stringify(buildManagedDeployDoctorEvidence())
    );

    try {
      const result = await validateDeploymentReadiness(
        {
          runId: 'run_legacy_task',
          stage: 'implementation',
          deploymentTaskId: 'task_legacy_task',
          deploymentTaskText: 'Deploy app to EnterpriseAI production',
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
          blockCompletionOnFailure: true,
        },
        { workspaceRoot: fixturesDir }
      );

      expect(result.response.readinessPassed).toBe(false);
      expect(result.response.evidenceIssues).toEqual(['DEPLOYMENT_TASK_BINDING_MISSING']);
      expect(result.response.deploymentTaskCompletionAllowed).toBe(false);
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });
});
