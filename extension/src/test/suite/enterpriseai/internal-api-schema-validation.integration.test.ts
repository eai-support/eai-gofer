import * as assert from 'assert';
import {
  INTERNAL_API_CONTRACT_IDS,
  type InternalApiContractId,
  validateInternalApiPayload,
} from '../../../services/enterpriseai/contracts/InternalApiSchemas';

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
      comment: 'Proceed with selected option.',
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
      canonicalSources: ['.specify/commands/0_gofer_start.md'],
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

suite('enterpriseai internal API schema validation (extension integration)', () => {
  test('validates IAP-001 through IAP-011 payload schemas', () => {
    const fixtures = createInternalApiPayloadFixtures();

    for (const contractId of INTERNAL_API_CONTRACT_IDS) {
      const result = validateInternalApiPayload(contractId, fixtures[contractId]);
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    }
  });

  test('fails validation when required internal API fields are missing', () => {
    const invalidPayload: Record<string, unknown> = {
      workflowProfile: 'enterpriseai',
      stage: 'planning',
      requestedBy: 'student@university.edu',
    };

    const result = validateInternalApiPayload('IAP-001', invalidPayload);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('Missing required field: runId')));
  });

  test('rejects IAP-011 payloads when stage is not implementation', () => {
    const fixtures = createInternalApiPayloadFixtures();
    const invalidDeploymentPayload = {
      ...fixtures['IAP-011'],
      stage: 'planning',
    };

    const result = validateInternalApiPayload('IAP-011', invalidDeploymentPayload);
    assert.strictEqual(result.valid, false);
    assert.ok(
      result.errors.some((error) => error.includes('stage must be one of: implementation.'))
    );
  });
});
