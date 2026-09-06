import * as assert from 'assert';
import {
  EVENT_PAYLOAD_CONTRACT_IDS,
  type EventContractId,
} from '../../../services/enterpriseai/contracts/EventPayloadSchemas';
import { validateProducerConsumerEventPayloads } from '../../../services/enterpriseai/contracts/EventPayloadValidator';

function createEventPayloadFixtures(): Record<EventContractId, Record<string, unknown>> {
  return {
    'EVT-001': {
      eventId: 'evt_001',
      runId: 'run_001',
      workflowProfile: 'enterpriseai',
      activatedAt: '2026-04-09T00:02:00Z',
    },
    'EVT-002': {
      eventId: 'evt_002',
      runId: 'run_001',
      decisionId: 'arch-dec-03',
      title: 'Select deployment strategy',
      options: ['feature-flagged', 'strangler', 'big-bang'],
      requiresExplicitApproval: true,
    },
    'EVT-003': {
      eventId: 'evt_003',
      runId: 'run_001',
      decisionId: 'arch-dec-03',
      approvalState: 'approved',
      approvedBy: 'student@university.edu',
      recordedAt: '2026-04-09T00:04:00Z',
    },
    'EVT-004': {
      eventId: 'evt_004',
      runId: 'run_001',
      fallbackPath: '.specify/references/platform/',
      unavailableExternalReferences: ['eai-docs'],
      userNoticeRequired: true,
    },
    'EVT-005': {
      eventId: 'evt_005',
      runId: 'run_001',
      workflowProfile: 'enterpriseai',
      businessAnalysisPath: 'business-analysis.md',
      marketAnalysisPath: 'market-analysis.md',
      competitiveAnalysisEnabled: true,
    },
    'EVT-006': {
      eventId: 'evt_006',
      runId: 'run_001',
      planPath: 'plan.md',
      tasksPath: 'tasks.md',
      eaiCliMajorMinor: '2.7',
      deploymentConventionsIncluded: true,
    },
    'EVT-007': {
      eventId: 'evt_007',
      runId: 'run_001',
      releaseNotesPath: 'release-notes.md',
      demoScriptPath: 'demo-script.md',
      marpDeckPath: 'presentation.marp.md',
      marpEnabled: true,
    },
    'EVT-008': {
      eventId: 'evt_008',
      changeSetId: 'chg_001',
      mirrors: ['copilot', 'codex', 'antigravity', 'antigravity-desktop'],
      filesChanged: 18,
      runtimeSyncCompleted: true,
    },
    'EVT-009': {
      eventId: 'evt_009',
      releaseId: '1.28.0-enterpriseai',
      updatedSurfaces: ['extension/package.json', 'README.md'],
      multiPlatformSupportRetained: true,
    },
    'EVT-010': {
      eventId: 'evt_010',
      runId: 'run_001',
      parityResult: 'passed',
      regressionResult: 'passed',
      removedCapabilitiesDetected: 0,
    },
    'EVT-011': {
      eventId: 'evt_011',
      changeSetId: 'chg_001',
      affectedCapability: 'provider-routing-codex',
      requiresExplicitApproval: true,
      blocking: true,
    },
    'EVT-012': {
      eventId: 'evt_012',
      runId: 'run_001',
      deploymentTaskId: 'task_deploy_01',
      readinessPassed: false,
      missingFiles: ['eai.runtime.json', '.eai/deploy-doctor.json'],
      validatedAt: '2026-04-09T00:25:00Z',
    },
  };
}

suite('enterpriseai EVT payload compatibility (extension integration)', () => {
  test('validates EVT-001 through EVT-012 producer/consumer payload compatibility', () => {
    const fixtures = createEventPayloadFixtures();

    for (const contractId of EVENT_PAYLOAD_CONTRACT_IDS) {
      const payload = fixtures[contractId];
      const result = validateProducerConsumerEventPayloads(contractId, payload, payload);
      assert.strictEqual(result.compatible, true);
      assert.deepStrictEqual(result.errors, []);
    }
  });

  test('fails compatibility when a required EVT field is missing', () => {
    const invalidProducerPayload: Record<string, unknown> = {
      runId: 'run_001',
      workflowProfile: 'enterpriseai',
      activatedAt: '2026-04-09T00:02:00Z',
    };

    const validConsumerPayload = createEventPayloadFixtures()['EVT-001'];
    const result = validateProducerConsumerEventPayloads(
      'EVT-001',
      invalidProducerPayload,
      validConsumerPayload
    );

    assert.strictEqual(result.compatible, false);
    assert.ok(result.errors.some((error) => error.includes('Missing required field: eventId')));
  });
});
