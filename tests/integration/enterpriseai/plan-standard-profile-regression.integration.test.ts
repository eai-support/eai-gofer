import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { workflowActivateProfile } from '../../../extension/src/services/enterpriseai/internalApi/WorkflowActivateProfile';
import { generateEnterpriseAiPlanAndTasks } from '../../../extension/src/services/enterpriseai/internalApi/GenerateEnterpriseAiPlanAndTasks';

function readCommandFile(fileName: string): string {
  return fs.readFileSync(path.join(process.cwd(), '.specify', 'commands', fileName), 'utf8');
}

describe('enterpriseai plan standard profile regression (root integration)', () => {
  it('keeps enterprise-only planning guidance additive and profile-gated', () => {
    const planCommand = readCommandFile('3_gofer_plan.md');

    expect(planCommand).toContain('When `gofer.workflowProfile=enterpriseai`');
    expect(planCommand).toContain('standard profile outputs remain unchanged');
  });

  it('preserves standard profile activation defaults and non-enterprise plan metadata behavior', () => {
    const activation = workflowActivateProfile({
      runId: 'run_standard_0001',
      workflowProfile: 'standard',
      stage: 'planning',
      requestedBy: 'student@university.edu',
    });

    expect(activation.response.activeProfile).toBe('standard');
    expect(activation.response.defaultsApplied).toEqual({
      enterpriseAiGuidance: false,
      marpRecommended: false,
      competitiveAnalysisDefault: false,
    });

    const planGeneration = generateEnterpriseAiPlanAndTasks({
      runId: 'run_standard_0001',
      workflowProfile: 'standard',
      specPath: '.specify/specs/029-enterpriseai-student-vertical-builder/spec.md',
      resolvedReferences: {
        eaiCli: '.specify/references/platform/eai.md',
        eaiAppTemplate: '.specify/references/platform/eai-app-template.md',
        deploymentRepo: '.specify/references/platform/deployment-repo.md',
      },
      installedEaiCliVersion: '1.9.2',
    });

    expect(planGeneration.response.deploymentConventionsIncluded).toBe(false);
    expect(planGeneration.response.metadata.integrationMap.included).toBe(false);
    expect(planGeneration.response.metadata.marketAnalysis).toBeUndefined();
    expect(planGeneration.response.recordedEaiCliMajorMinor).toBe('1.9');
    expect(planGeneration.emittedEvent.payload.deploymentConventionsIncluded).toBe(false);
  });
});
