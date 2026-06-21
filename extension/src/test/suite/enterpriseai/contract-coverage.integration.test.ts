import * as assert from 'assert';
import {
  EVENT_PAYLOAD_CONTRACT_IDS,
  type EventContractId,
  validateEventPayload,
} from '../../../services/enterpriseai/contracts/EventPayloadSchemas';
import {
  INTERNAL_API_CONTRACT_IDS,
  type InternalApiContractId,
  validateInternalApiPayload,
} from '../../../services/enterpriseai/contracts/InternalApiSchemas';
import { createCapabilityRemovalEventHandlers } from '../../../services/enterpriseai/events/CapabilityRemovalEvents';
import { createCompatibilityParityEventHandlers } from '../../../services/enterpriseai/events/CompatibilityParityEvents';
import { createPositioningEventHandlers } from '../../../services/enterpriseai/events/PositioningEvents';

function createInternalApiPayloadFixtures(): Record<
  InternalApiContractId,
  Record<string, unknown>
> {
  return {
    'IAP-001': {
      runId: 'run_001',
      workflowProfile: 'enterpriseai',
      stage: 'planning',
      requestedBy: 'student@university.edu',
    },
    'IAP-002': {
      runId: 'run_001',
      decisionId: 'decision_001',
      title: 'Select deployment option',
      options: ['guided', 'manual', 'hybrid'],
      requiresExplicitApproval: true,
    },
    'IAP-003': {
      runId: 'run_001',
      approvalToken: 'approval_001',
      decisionId: 'decision_001',
      approved: true,
      approvedBy: 'student@university.edu',
    },
    'IAP-004': {
      runId: 'run_001',
      referenceTypes: ['eai_docs', 'eai_app_template_docs', 'deployment_repo_docs'],
      externalReferencesEnabled: false,
      fallbackPath: '.specify/references/platform/',
    },
    'IAP-005': {
      runId: 'run_001',
      workflowProfile: 'enterpriseai',
      includeCompetitiveAnalysis: true,
      minimumAlternativeCount: 3,
      requireSpecAndPlanReferences: true,
      discoveryArtifactPath:
        '.specify/specs/029-enterpriseai-student-vertical-builder/discovery.md',
    },
    'IAP-006': {
      runId: 'run_001',
      workflowProfile: 'enterpriseai',
      specPath: '.specify/specs/029-enterpriseai-student-vertical-builder/spec.md',
      resolvedReferences: {
        eaiCli: '.specify/references/platform/eai.md',
        eaiAppTemplate: '.specify/references/platform/eai-app-template.md',
        deploymentRepo: '.specify/references/platform/deployment-repo.md',
      },
      installedEaiCliVersion: '2.7.4',
    },
    'IAP-007': {
      runId: 'run_001',
      workflowProfile: 'enterpriseai',
      enableMarpDeck: true,
      inputArtifacts: {
        discovery: '.specify/specs/029-enterpriseai-student-vertical-builder/discovery.md',
        spec: '.specify/specs/029-enterpriseai-student-vertical-builder/spec.md',
        plan: '.specify/specs/029-enterpriseai-student-vertical-builder/plan.md',
        implementationSummary:
          '.specify/specs/029-enterpriseai-student-vertical-builder/implementation-summary.md',
      },
    },
    'IAP-008': {
      changeSetId: 'chg_001',
      canonicalSources: ['.specify/commands/0_business_scenario.md'],
      targetMirrors: ['copilot', 'codex', 'gemini'],
      runParityValidation: true,
    },
    'IAP-009': {
      releaseId: 'rel_001',
      surfaces: ['README.md', 'extension/README.md', 'extension/package.json'],
      primaryMessage: 'EnterpriseAI-first guidance with additive compatibility.',
      preserveMultiPlatformSection: true,
    },
    'IAP-010': {
      runId: 'run_001',
      checks: ['parity', 'regression', 'approval-audit'],
      requireZeroRegression: true,
      requireRemovalApprovalLog: true,
    },
    'IAP-011': {
      runId: 'run_001',
      stage: 'implementation',
      deploymentTaskId: 'task_deploy_001',
      requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json', '.env.example'],
      blockCompletionOnFailure: true,
    },
  };
}

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
      mirrors: ['copilot', 'codex', 'gemini'],
      filesChanged: 18,
      runtimeSyncCompleted: true,
    },
    'EVT-009': {
      eventId: 'evt_009',
      releaseId: 'rel_001',
      updatedSurfaces: ['README.md', 'extension/README.md', 'extension/package.json'],
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

suite('enterpriseai contract coverage (extension integration)', () => {
  test('validates all IAP and EVT schema contracts', () => {
    const iapFixtures = createInternalApiPayloadFixtures();
    const evtFixtures = createEventPayloadFixtures();

    for (const contractId of INTERNAL_API_CONTRACT_IDS) {
      const result = validateInternalApiPayload(contractId, iapFixtures[contractId]);
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    }

    for (const contractId of EVENT_PAYLOAD_CONTRACT_IDS) {
      const result = validateEventPayload(contractId, evtFixtures[contractId]);
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    }
  });

  test('enforces EVT-009/EVT-010/EVT-011 publish-consume gate behavior', () => {
    const positioningHandlers = createPositioningEventHandlers();
    let positioningSeen = 0;
    const unsubscribePositioning = positioningHandlers.consume((): void => {
      positioningSeen += 1;
    });

    const positioningResult = positioningHandlers.publish(
      {
        eventId: 'evt_009_ext',
        releaseId: 'rel_ext_009',
        updatedSurfaces: ['README.md'],
        multiPlatformSupportRetained: true,
      },
      () => true
    );

    assert.strictEqual(positioningSeen, 1);
    assert.strictEqual(positioningResult.positioningChecksQueued, true);
    unsubscribePositioning();

    const compatibilityHandlers = createCompatibilityParityEventHandlers();
    let compatibilitySeen = 0;
    const unsubscribeCompatibility = compatibilityHandlers.consume((): void => {
      compatibilitySeen += 1;
    });

    const compatibilityResult = compatibilityHandlers.publish(
      {
        eventId: 'evt_010_ext',
        runId: 'run_ext_010',
        parityResult: 'passed',
        regressionResult: 'passed',
        removedCapabilitiesDetected: 0,
      },
      () => ({ releaseAllowed: true, reasons: [] })
    );

    assert.strictEqual(compatibilitySeen, 1);
    assert.strictEqual(compatibilityResult.releaseAllowed, true);
    unsubscribeCompatibility();

    const capabilityHandlers = createCapabilityRemovalEventHandlers();
    const unsubscribeCapability = capabilityHandlers.consume((): boolean => true);

    capabilityHandlers.publish(
      {
        eventId: 'evt_011_ext',
        changeSetId: 'chg_ext_011',
        affectedCapability: 'provider-routing-codex',
        requiresExplicitApproval: true,
        blocking: true,
      },
      () => true
    );

    assert.throws(
      () =>
        capabilityHandlers.publish(
          {
            eventId: 'evt_011_ext_block',
            changeSetId: 'chg_ext_011_block',
            affectedCapability: 'provider-routing-codex',
            requiresExplicitApproval: true,
            blocking: true,
          },
          () => false
        ),
      /VAL_REMOVAL_APPROVAL_MISSING/
    );

    unsubscribeCapability();
  });
});
