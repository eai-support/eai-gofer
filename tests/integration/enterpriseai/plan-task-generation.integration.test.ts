import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { workflowActivateProfile } from '../../../extension/src/services/enterpriseai/internalApi/WorkflowActivateProfile';
import { requestArchitectureDecision } from '../../../extension/src/services/enterpriseai/internalApi/RequestArchitectureDecision';
import { recordArchitectureDecisionApproval } from '../../../extension/src/services/enterpriseai/internalApi/RecordArchitectureDecisionApproval';
import { generateEnterpriseAiPlanAndTasks } from '../../../extension/src/services/enterpriseai/internalApi/GenerateEnterpriseAiPlanAndTasks';

function readCommandFile(fileName: string): string {
  return fs.readFileSync(path.join(process.cwd(), '.claude', 'commands', fileName), 'utf8');
}

describe('enterpriseai plan/task generation (root integration)', () => {
  it('adds integration-map, deployment conventions, and ordered runnable guidance to canonical commands', () => {
    const specifyCommand = readCommandFile('2_gofer_specify.md');
    const planCommand = readCommandFile('3_gofer_plan.md');
    const tasksCommand = readCommandFile('4_gofer_tasks.md');

    expect(specifyCommand).toContain('EnterpriseAI Integration Map Requirements');
    expect(specifyCommand).toContain('Vertical App -> EAI Services -> Deployment Target');

    expect(planCommand).toContain(
      'EnterpriseAI Deployment Convention and EAI CLI Pinning Requirements'
    );
    expect(planCommand).toMatch(/pin\s+guidance to `major\.minor`/);

    expect(tasksCommand).toContain('Ordered Runnable Task-Generation Guidance');
    expect(tasksCommand).toContain('real EAI app gates before any claim of seeding');
    expect(tasksCommand).toContain('App resource provisioning -> `eai vertical provision`');
    expect(tasksCommand).toMatch(/Pinned `eai major\.minor` deployment tasks/i);
  });

  it('wires IAP-001, IAP-002, and IAP-003 through EVT-001/002/003 payload emission', () => {
    const activationResult = workflowActivateProfile({
      runId: 'run_029_0001',
      workflowProfile: 'enterpriseai',
      stage: 'planning',
      requestedBy: 'student@university.edu',
    });
    expect(activationResult.emittedEvent.contractId).toBe('EVT-001');
    expect(activationResult.response.defaultsApplied.enterpriseAiGuidance).toBe(true);

    const decisionResult = requestArchitectureDecision({
      runId: 'run_029_0001',
      decisionId: 'arch-dec-03',
      title: 'Select deployment strategy',
      options: ['feature-flagged', 'strangler', 'big-bang'],
      requiresExplicitApproval: true,
    });
    const secondDecisionResult = requestArchitectureDecision({
      runId: 'run_029_0001',
      decisionId: 'arch-dec-03',
      title: 'Select deployment strategy',
      options: ['feature-flagged', 'strangler', 'big-bang'],
      requiresExplicitApproval: true,
    });
    expect(decisionResult.emittedEvent.contractId).toBe('EVT-002');
    expect(decisionResult.response.status).toBe('pending_approval');
    expect(decisionResult.response.approvalToken).toMatch(/^appr_[a-f0-9]{32}_[a-f0-9]{32}$/);
    expect(secondDecisionResult.response.approvalToken).toMatch(/^appr_[a-f0-9]{32}_[a-f0-9]{32}$/);
    expect(secondDecisionResult.response.approvalToken).not.toBe(
      decisionResult.response.approvalToken
    );

    const approvalResult = recordArchitectureDecisionApproval({
      runId: 'run_029_0001',
      approvalToken: decisionResult.response.approvalToken,
      decisionId: 'arch-dec-03',
      approved: true,
      approvedBy: 'student@university.edu',
      comment: 'Use feature-flagged rollout.',
    });
    expect(approvalResult.emittedEvent.contractId).toBe('EVT-003');
    expect(approvalResult.response.approvalState).toBe('approved');
    expect(approvalResult.response.pipelineMayProceed).toBe(true);
  });

  it('generates IAP-006 and EVT-006 metadata with integration map, deployment conventions, market analysis references, and pinned eai major.minor', () => {
    const result = generateEnterpriseAiPlanAndTasks({
      runId: 'run_029_0001',
      workflowProfile: 'enterpriseai',
      specPath: '.specify/specs/029-enterpriseai-student-vertical-builder/spec.md',
      resolvedReferences: {
        eaiCli: '.specify/references/platform/eai.md',
        verticalTemplate: '.specify/references/platform/vertical-template.md',
        deploymentRepo: '.specify/references/platform/deployment-repo.md',
      },
      installedEaiCliVersion: '2.7.4',
      competitiveAnalysisEnabled: true,
      marketAnalysisPath:
        '.specify/specs/029-enterpriseai-student-vertical-builder/market-analysis.md',
      marketAnalysisSummary: {
        alternativeCount: 3,
        referencedInSpec: true,
        referencedInPlan: true,
      },
    });

    expect(result.response.status).toBe('completed');
    expect(result.response.recordedEaiCliMajorMinor).toBe('2.7');
    expect(result.response.deploymentConventionsIncluded).toBe(true);

    expect(result.response.metadata.integrationMap.included).toBe(true);
    expect(result.response.metadata.integrationMap.components).toEqual([
      'vertical-app',
      'eai-services',
      'deployment-target',
    ]);

    expect(result.response.metadata.deploymentConventions.included).toBe(true);
    expect(result.response.metadata.requiredReferenceIndicators).toEqual({
      eaiCli: true,
      verticalTemplate: true,
      eaiAppTemplate: true,
      deploymentRepo: true,
    });

    expect(result.response.metadata.marketAnalysis?.attached).toBe(true);
    expect(result.response.metadata.marketAnalysis?.referencedInSpec).toBe(true);
    expect(result.response.metadata.marketAnalysis?.referencedInPlan).toBe(true);

    expect(result.emittedEvent.contractId).toBe('EVT-006');
    expect(result.emittedEvent.payload.eaiCliMajorMinor).toBe('2.7');
    expect(result.emittedEvent.payload.metadata.pinnedEaiCli.majorMinor).toBe('2.7');
  });
});
