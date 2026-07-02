import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  INTERNAL_API_CONTRACT_IDS,
  type InternalApiContractId,
  validateInternalApiPayload,
} from '../../../extension/src/services/enterpriseai/contracts/InternalApiSchemas';
import {
  assertNoExternalApiEndpoints,
  buildNoExternalApiPostureResponse,
} from '../../../extension/src/services/enterpriseai/contracts/ExternalApiPosture';
import { generateBusinessAndMarketArtifacts } from '../../../extension/src/services/enterpriseai/internalApi/GenerateBusinessAndMarketArtifacts';
import { generateEnterpriseAiPlanAndTasks } from '../../../extension/src/services/enterpriseai/internalApi/GenerateEnterpriseAiPlanAndTasks';
import { generateStakeholderArtifacts } from '../../../extension/src/services/enterpriseai/internalApi/GenerateStakeholderArtifacts';
import { propagateCanonicalMirrors } from '../../../extension/src/services/enterpriseai/internalApi/PropagateCanonicalMirrors';
import { recordArchitectureDecisionApproval } from '../../../extension/src/services/enterpriseai/internalApi/RecordArchitectureDecisionApproval';
import { requestArchitectureDecision } from '../../../extension/src/services/enterpriseai/internalApi/RequestArchitectureDecision';
import { resolveEnterpriseAiReferences } from '../../../extension/src/services/enterpriseai/internalApi/ResolveEnterpriseAiReferences';
import { runCompatibilityAndParityGate } from '../../../extension/src/services/enterpriseai/internalApi/RunCompatibilityAndParityGate';
import { updateExtensionMessaging } from '../../../extension/src/services/enterpriseai/internalApi/UpdateExtensionMessaging';
import { validateDeploymentReadiness } from '../../../extension/src/services/enterpriseai/internalApi/ValidateDeploymentReadiness';
import { workflowActivateProfile } from '../../../extension/src/services/enterpriseai/internalApi/WorkflowActivateProfile';

function createFixtureDir(prefix: string): string {
  return path.join(
    process.cwd(),
    'tests',
    'integration',
    'enterpriseai',
    `${prefix}-${process.pid}-${Date.now()}`
  );
}

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

describe('enterpriseai internal API + external posture contract coverage (root integration)', () => {
  it('validates schema coverage for IAP-001 through IAP-011', () => {
    const fixtures = createInternalApiPayloadFixtures();

    for (const contractId of INTERNAL_API_CONTRACT_IDS) {
      const validation = validateInternalApiPayload(contractId, fixtures[contractId]);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    }
  });

  it('covers runtime operation contracts for IAP-001 through IAP-011 and EXT-001 posture', async () => {
    const coveredContracts = new Set<InternalApiContractId>();
    const fallbackFixtureDir = createFixtureDir('fixtures-iap004-fallback');
    const deploymentFixtureDir = createFixtureDir('fixtures-iap011-readiness');

    fs.rmSync(fallbackFixtureDir, { recursive: true, force: true });
    fs.rmSync(deploymentFixtureDir, { recursive: true, force: true });

    try {
      const fallbackDir = path.join(fallbackFixtureDir, '.specify', 'references', 'platform');
      const featureDir = path.join(
        fallbackFixtureDir,
        '.specify',
        'specs',
        '029-enterpriseai-student-vertical-builder'
      );
      fs.mkdirSync(fallbackDir, { recursive: true });
      fs.mkdirSync(featureDir, { recursive: true });
      fs.writeFileSync(path.join(fallbackDir, 'eai.md'), '# eai cli fallback\n', 'utf8');
      fs.writeFileSync(
        path.join(fallbackDir, 'eai-app-template.md'),
        '# eai app template fallback\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(fallbackDir, 'deployment-repo.md'),
        '# deployment fallback\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(featureDir, 'discovery.md'),
        '# Discovery\nEnterpriseAI business need and persona context.\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(featureDir, 'spec.md'),
        '# Spec\nEnterpriseAI solution overview for contract coverage.\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(featureDir, 'plan.md'),
        '# Plan\nArchitecture and deployment sequencing for contract coverage.\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(featureDir, 'implementation-summary.md'),
        '# Implementation\nExecution summary and measurable outcomes.\n',
        'utf8'
      );

      fs.mkdirSync(deploymentFixtureDir, { recursive: true });
      fs.writeFileSync(
        path.join(deploymentFixtureDir, 'eai.runtime.json'),
        '{"schemaVersion":1}\n',
        'utf8'
      );
      fs.mkdirSync(path.join(deploymentFixtureDir, '.eai'), { recursive: true });
      fs.writeFileSync(
        path.join(deploymentFixtureDir, '.eai', 'deploy-doctor.json'),
        '{"status":"pass"}\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(deploymentFixtureDir, '.env.example'),
        'API_URL=https://example.com\n',
        'utf8'
      );

      const iap001 = workflowActivateProfile({
        runId: 'run_coverage_001',
        workflowProfile: 'enterpriseai',
        stage: 'planning',
        requestedBy: 'student@university.edu',
      });
      coveredContracts.add(iap001.contractId);

      const iap002 = requestArchitectureDecision({
        runId: 'run_coverage_001',
        decisionId: 'decision_coverage_01',
        title: 'Select deployment strategy',
        options: ['feature-flagged', 'strangler', 'big-bang'],
        requiresExplicitApproval: true,
      });
      coveredContracts.add(iap002.contractId);

      const iap003 = recordArchitectureDecisionApproval({
        runId: 'run_coverage_001',
        approvalToken: iap002.response.approvalToken,
        decisionId: 'decision_coverage_01',
        approved: true,
        approvedBy: 'student@university.edu',
      });
      coveredContracts.add(iap003.contractId);

      const iap004 = await resolveEnterpriseAiReferences(
        {
          runId: 'run_coverage_001',
          referenceTypes: ['eai_docs', 'eai_app_template_docs', 'deployment_repo_docs'],
          externalReferencesEnabled: false,
          fallbackPath: '.specify/references/platform/',
        },
        {
          workspaceRoot: fallbackFixtureDir,
        }
      );
      coveredContracts.add(iap004.contractId);

      const iap005 = await generateBusinessAndMarketArtifacts(
        {
          runId: 'run_coverage_001',
          workflowProfile: 'enterpriseai',
          includeCompetitiveAnalysis: true,
          minimumAlternativeCount: 3,
          requireSpecAndPlanReferences: true,
          discoveryArtifactPath:
            '.specify/specs/029-enterpriseai-student-vertical-builder/discovery.md',
          competitiveAlternatives: ['alt-1', 'alt-2', 'alt-3'],
        },
        {
          workspaceRoot: fallbackFixtureDir,
        }
      );
      coveredContracts.add(iap005.contractId);

      const iap006 = generateEnterpriseAiPlanAndTasks({
        runId: 'run_coverage_001',
        workflowProfile: 'enterpriseai',
        specPath: '.specify/specs/029-enterpriseai-student-vertical-builder/spec.md',
        resolvedReferences: {
          eaiCli: '.specify/references/platform/eai.md',
          eaiAppTemplate: '.specify/references/platform/eai-app-template.md',
          deploymentRepo: '.specify/references/platform/deployment-repo.md',
        },
        installedEaiCliVersion: '2.7.4',
      });
      coveredContracts.add(iap006.contractId);

      const iap007 = await generateStakeholderArtifacts(
        {
          runId: 'run_coverage_001',
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
        {
          workspaceRoot: fallbackFixtureDir,
        }
      );
      coveredContracts.add(iap007.contractId);

      const iap008 = await propagateCanonicalMirrors(
        {
          changeSetId: 'chg_coverage_001',
          canonicalSources: ['.specify/commands/0_gofer_start.md'],
          targetMirrors: ['copilot', 'codex', 'gemini'],
          runParityValidation: true,
        },
        {
          workspaceRoot: process.cwd(),
        }
      );
      coveredContracts.add(iap008.contractId);

      const iap009 = await updateExtensionMessaging(
        {
          releaseId: 'rel_coverage_001',
          surfaces: ['README.md', 'extension/README.md', 'extension/package.json'],
          primaryMessage: 'EnterpriseAI-first app delivery',
          preserveMultiPlatformSection: true,
        },
        {
          workspaceRoot: process.cwd(),
        }
      );
      coveredContracts.add(iap009.contractId);

      const iap010 = await runCompatibilityAndParityGate({
        runId: 'run_coverage_001',
        checks: ['parity', 'unit', 'integration'],
        requireZeroRegression: true,
        requireRemovalApprovalLog: false,
      });
      coveredContracts.add(iap010.contractId);

      const iap011 = await validateDeploymentReadiness(
        {
          runId: 'run_coverage_001',
          stage: 'implementation',
          deploymentTaskId: 'task_deploy_coverage',
          requiredFiles: ['eai.runtime.json', '.eai/deploy-doctor.json', '.env.example'],
          blockCompletionOnFailure: true,
        },
        {
          workspaceRoot: deploymentFixtureDir,
        }
      );
      coveredContracts.add(iap011.contractId);

      expect(Array.from(coveredContracts).sort()).toEqual([...INTERNAL_API_CONTRACT_IDS].sort());

      const externalPostureValidation = assertNoExternalApiEndpoints({
        featureId: '029-enterpriseai-student-vertical-builder',
        requestedAt: new Date().toISOString(),
        scope: 'internal-gofer-pipeline-only',
        publicConsumers: [],
      });
      expect(externalPostureValidation.valid).toBe(true);
      expect(buildNoExternalApiPostureResponse().decision).toBe('no_external_api_endpoints');
    } finally {
      fs.rmSync(fallbackFixtureDir, { recursive: true, force: true });
      fs.rmSync(deploymentFixtureDir, { recursive: true, force: true });
    }
  });
});
