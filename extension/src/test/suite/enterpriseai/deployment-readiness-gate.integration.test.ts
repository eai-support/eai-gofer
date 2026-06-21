import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  type DeploymentReadinessValidatedEventPayload,
  validateDeploymentReadiness,
} from '../../../services/enterpriseai/internalApi/ValidateDeploymentReadiness';
import { createDeploymentReadinessEventHandlers } from '../../../services/enterpriseai/events/DeploymentReadinessEvents';

suite('enterpriseai deployment readiness gate (extension integration)', () => {
  const fixturesDir = path.join(__dirname, 'fixtures-deployment-readiness-gate');

  setup(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
    await fs.mkdir(fixturesDir, { recursive: true });
    await fs.writeFile(path.join(fixturesDir, 'eai.runtime.json'), '{"schemaVersion":1}\n', 'utf8');
  });

  teardown(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
  });

  test('blocks deployment completion when required deployment files are missing and emits EVT-012', async () => {
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

    assert.strictEqual(result.contractId, 'IAP-011');
    assert.strictEqual(result.operationName, 'implementation.validateDeploymentReadiness');
    assert.strictEqual(result.response.status, 'completed');
    assert.strictEqual(result.response.readinessPassed, false);
    assert.deepStrictEqual(result.response.missingFiles, ['.eai/deploy-doctor.json']);
    assert.strictEqual(result.response.deploymentTaskCompletionAllowed, false);
    assert.strictEqual(result.emittedEvent.contractId, 'EVT-012');
    assert.strictEqual(consumedPayloads.length, 1);
    assert.deepStrictEqual(consumedPayloads[0].missingFiles, ['.eai/deploy-doctor.json']);
    assert.strictEqual(eventHandlers.consumerCount(), 0);
  });

  test('rejects absolute required file paths to prevent probing', async () => {
    await assert.rejects(
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
      ),
      /IMPL_DEPLOYMENT_PATH_INVALID/
    );
  });
});
