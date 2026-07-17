import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  type DeploymentReadinessValidatedEventPayload,
  validateDeploymentReadiness,
} from '../../../extension/src/services/enterpriseai/internalApi/ValidateDeploymentReadiness';
import { createDeploymentReadinessEventHandlers } from '../../../extension/src/services/enterpriseai/events/DeploymentReadinessEvents';

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

    expect(tasksCommand).toContain('Ordered Runnable Task-Generation Guidance');
    expect(tasksCommand).toContain('EAI App Template scaffolding -> `eai init`');
    expect(tasksCommand).toContain('eai init <app-name>');
    expect(tasksCommand).toContain('eai runtime validate');
    expect(tasksCommand).toContain('eai verify');
    expect(tasksCommand).toContain('eai deploy trigger --repo <org/repo>');
    expect(tasksCommand).toContain('eai deploy doctor --url <deployed-url> --format json');

    expect(implementCommand).toContain('EnterpriseAI Runtime Deployment Preflight Gate');
    expect(implementCommand).toContain('runtime contract and deploy');
    expect(implementCommand).toContain('eai.runtime.json');
    expect(implementCommand).toContain('.eai/deploy-doctor.json');
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
});
