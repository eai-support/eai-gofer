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
  CUSTOMER_OWNED_DEPLOY_TASK_TEXT,
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
    expect(tasksCommand).toContain('Hosting- and source-specific deployment task');
    expect(tasksCommand).toContain('emit exactly one two-phase deployment task');
    expect(tasksCommand).toContain('[hosting:eai-managed]');
    expect(tasksCommand).toContain('--source eai-managed');
    expect(tasksCommand).toContain('--source customer-owned');
    expect(tasksCommand).toContain('belongs only to a verified');
    expect(tasksCommand).toContain('customer-owned repository next action');
    expect(tasksCommand).toContain('[hosting:customer-azure]');
    expect(tasksCommand).toContain('[hosting:local-only]');
    expect(tasksCommand).toContain('runtime contract must pass before any deploy command runs');
    expect(tasksCommand).toContain('only after the exact operation exists');
    expect(tasksCommand).toContain(
      'Run the selected initial command without marking the task complete'
    );
    expect(tasksCommand).toContain('same deployment task');
    expect(tasksCommand).toContain('that selected initial command with its');
    expect(tasksCommand).toContain('resolved `--source`');
    expect(tasksCommand).toContain('reads both commands as independent binding sources');
    expect(tasksCommand).toMatch(/separate dependent\s+post-deploy checkbox/);
    expect(tasksCommand).not.toContain('4. **EAI-managed post-deploy smoke gate');
    expect(tasksCommand).not.toContain(
      'runtime contract and\ndeploy-doctor evidence exist before any deploy command runs'
    );
    expect(tasksCommand).toContain(portableDoctorCommand);
    expect(tasksCommand).toContain(
      "Put that complete inline command on the same deployment task's"
    );
    expect(tasksCommand).toContain(
      'task with a placeholder or missing resolved command cannot pass'
    );
    expect(tasksCommand).not.toContain('mkdir -p .eai');
    expect(tasksCommand).not.toContain('> .eai/deploy-doctor.json');

    expect(implementCommand).toContain('EnterpriseAI Runtime Deployment Preflight Gate');
    expect(implementCommand).toContain('runtime contract and deploy');
    expect(implementCommand).toContain('eai.runtime.json');
    expect(implementCommand).toContain('.eai/deploy-doctor.json');
    expect(implementCommand).toContain(portableDoctorCommand);
    expect(implementCommand).toContain('eai.managed-deploy-doctor-evidence.v1');
    expect(implementCommand).toMatch(/stale,\s+malformed, failing/);
    expect(implementCommand).toContain(
      '[hosting:eai-managed]` uses the strict operation-bound receipt gate'
    );
    expect(implementCommand).toContain('retain the prior required-file');
    expect(implementCommand).toContain('optional `EVT-012` `evidenceIssues` field');
    expect(implementCommand).toContain('Recovery instructions must follow the reported condition');
    expect(implementCommand).toContain('inside one `[hosting:eai-managed]` task');
    expect(implementCommand).toMatch(/selected initial\s+command's source mode/);
    expect(implementCommand).toContain("receipt's source mode and four operation fields");
    expect(implementCommand).toMatch(/Do not create a later dependent\s+post-deploy checkbox/);
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
          receiptValidationMode: 'operation-bound',
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
            receiptValidationMode: 'operation-bound',
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

  it.each([
    [
      'EAI-maintained source',
      MANAGED_DEPLOY_TASK_TEXT,
      buildManagedDeployDoctorEvidence({ operation: { sourceMode: 'eai-managed' } }),
    ],
    [
      'customer-owned source',
      CUSTOMER_OWNED_DEPLOY_TASK_TEXT,
      buildManagedDeployDoctorEvidence({ operation: { sourceMode: 'customer-owned' } }),
    ],
  ])('allows an exact passing task-bound receipt for %s', async (label, taskText, evidence) => {
    const fixturesDir = createFixtureDir(
      `fixtures-deployment-evidence-exact-${label.replace(/[^a-z]+/gi, '-').toLowerCase()}`
    );
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(fixturesDir, '.eai'), { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
    fs.writeFileSync(
      path.join(fixturesDir, '.eai', 'deploy-doctor.json'),
      `${JSON.stringify(evidence, null, 2)}\n`
    );

    try {
      const result = await validateDeploymentReadiness(
        {
          runId: 'run_exact_receipt',
          stage: 'implementation',
          deploymentTaskId: 'task_exact_receipt',
          deploymentTaskText: taskText,
          receiptValidationMode: 'operation-bound',
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
      'source mode',
      buildManagedDeployDoctorEvidence({ operation: { sourceMode: 'customer-owned' } }),
      'DOCTOR_EVIDENCE_SOURCE_MODE_MISMATCH',
    ],
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
          receiptValidationMode: 'operation-bound',
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
          receiptValidationMode: 'operation-bound',
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

  it('rejects a symbolic-link deployment receipt', async () => {
    const fixturesDir = createFixtureDir('fixtures-deployment-evidence-symlink');
    const evidenceDir = path.join(fixturesDir, '.eai');
    const targetName = 'external-deploy-doctor.json';
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
    fs.writeFileSync(
      path.join(evidenceDir, targetName),
      `${JSON.stringify(buildManagedDeployDoctorEvidence())}\n`
    );
    fs.symlinkSync(targetName, path.join(evidenceDir, 'deploy-doctor.json'), 'file');

    try {
      const result = await validateDeploymentReadiness(
        {
          runId: 'run_symlink_receipt',
          stage: 'implementation',
          deploymentTaskId: 'task_symlink_receipt',
          deploymentTaskText: MANAGED_DEPLOY_TASK_TEXT,
          receiptValidationMode: 'operation-bound',
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
          blockCompletionOnFailure: true,
        },
        { workspaceRoot: fixturesDir }
      );

      expect(result.response.readinessPassed).toBe(false);
      expect(result.response.evidenceIssues).toEqual(['DOCTOR_EVIDENCE_FILE_INVALID']);
      expect(result.response.deploymentTaskCompletionAllowed).toBe(false);
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it('rejects a deployment receipt larger than one MiB', async () => {
    const fixturesDir = createFixtureDir('fixtures-deployment-evidence-oversized');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(fixturesDir, '.eai'), { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
    fs.writeFileSync(
      path.join(fixturesDir, '.eai', 'deploy-doctor.json'),
      'x'.repeat(1024 * 1024 + 1)
    );

    try {
      const result = await validateDeploymentReadiness(
        {
          runId: 'run_oversized_receipt',
          stage: 'implementation',
          deploymentTaskId: 'task_oversized_receipt',
          deploymentTaskText: MANAGED_DEPLOY_TASK_TEXT,
          receiptValidationMode: 'operation-bound',
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
          blockCompletionOnFailure: true,
        },
        { workspaceRoot: fixturesDir }
      );

      expect(result.response.readinessPassed).toBe(false);
      expect(result.response.evidenceIssues).toEqual(['DOCTOR_EVIDENCE_FILE_INVALID']);
      expect(result.response.deploymentTaskCompletionAllowed).toBe(false);
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it('rejects a non-regular deployment receipt', async () => {
    const fixturesDir = createFixtureDir('fixtures-deployment-evidence-directory');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(fixturesDir, '.eai', 'deploy-doctor.json'), { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');

    try {
      const result = await validateDeploymentReadiness(
        {
          runId: 'run_directory_receipt',
          stage: 'implementation',
          deploymentTaskId: 'task_directory_receipt',
          deploymentTaskText: MANAGED_DEPLOY_TASK_TEXT,
          receiptValidationMode: 'operation-bound',
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
          blockCompletionOnFailure: true,
        },
        { workspaceRoot: fixturesDir }
      );

      expect(result.response.readinessPassed).toBe(false);
      expect(result.response.evidenceIssues).toEqual(['DOCTOR_EVIDENCE_FILE_INVALID']);
      expect(result.response.deploymentTaskCompletionAllowed).toBe(false);
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it('preserves the default presence gate for non-managed deployment tasks', async () => {
    const fixturesDir = createFixtureDir('fixtures-deployment-evidence-presence');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(fixturesDir, '.eai'), { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'eai.runtime.json'), '{"schemaVersion":1}\n');
    fs.writeFileSync(path.join(fixturesDir, '.eai', 'deploy-doctor.json'), '{legacy-evidence');

    try {
      const result = await validateDeploymentReadiness(
        {
          runId: 'run_presence_receipt',
          stage: 'implementation',
          deploymentTaskId: 'task_presence_receipt',
          deploymentTaskText: '[hosting:customer-azure] Deploy to customer Azure',
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
          blockCompletionOnFailure: true,
        },
        { workspaceRoot: fixturesDir }
      );

      expect(result.response.readinessPassed).toBe(true);
      expect(result.response.evidenceIssues).toEqual([]);
      expect(result.response.deploymentTaskCompletionAllowed).toBe(true);
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it.each([
    [
      'legacy task text without a resolved operation binding',
      '[hosting:eai-managed] Deploy app to EnterpriseAI production',
      'DEPLOYMENT_TASK_BINDING_MISSING',
    ],
    [
      'task text with an unresolved initial source mode',
      MANAGED_DEPLOY_TASK_TEXT.replace('--source eai-managed', '--source <source-mode>'),
      'DEPLOYMENT_TASK_BINDING_INVALID',
    ],
  ])('fails %s', async (_label, taskText, expectedIssue) => {
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
          deploymentTaskText: taskText,
          receiptValidationMode: 'operation-bound',
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
          blockCompletionOnFailure: true,
        },
        { workspaceRoot: fixturesDir }
      );

      expect(result.response.readinessPassed).toBe(false);
      expect(result.response.evidenceIssues).toEqual([expectedIssue]);
      expect(result.response.deploymentTaskCompletionAllowed).toBe(false);
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });
});
