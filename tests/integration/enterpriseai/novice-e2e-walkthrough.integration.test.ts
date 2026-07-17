import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { generateEnterpriseAiDiscoveryArtifact } from '../../../extension/src/services/enterpriseai/internalApi/GenerateEnterpriseAiDiscovery';
import { resolveEnterpriseAiReferences } from '../../../extension/src/services/enterpriseai/internalApi/ResolveEnterpriseAiReferences';
import { requestArchitectureDecision } from '../../../extension/src/services/enterpriseai/internalApi/RequestArchitectureDecision';
import { recordArchitectureDecisionApproval } from '../../../extension/src/services/enterpriseai/internalApi/RecordArchitectureDecisionApproval';
import { generateEnterpriseAiPlanAndTasks } from '../../../extension/src/services/enterpriseai/internalApi/GenerateEnterpriseAiPlanAndTasks';
import { generateBusinessAndMarketArtifacts } from '../../../extension/src/services/enterpriseai/internalApi/GenerateBusinessAndMarketArtifacts';
import { generateStakeholderArtifacts } from '../../../extension/src/services/enterpriseai/internalApi/GenerateStakeholderArtifacts';

const FEATURE_DIR = '.specify/specs/029-enterpriseai-student-vertical-builder';

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

function seedStakeholderInputs(workspaceRoot: string): void {
  const featureDirPath = path.join(workspaceRoot, FEATURE_DIR);
  fs.mkdirSync(featureDirPath, { recursive: true });
  fs.writeFileSync(
    path.join(featureDirPath, 'spec.md'),
    '# Spec\nEnterpriseAI solution overview with beginner-friendly milestones.\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(featureDirPath, 'plan.md'),
    '# Plan\nArchitecture and implementation sequencing with explicit checkpoints.\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(featureDirPath, 'implementation-summary.md'),
    '# Implementation\nDemo walkthrough complete with measurable outcomes.\n',
    'utf8'
  );
}

function seedFallbackReferences(workspaceRoot: string): void {
  const referencesDirPath = path.join(workspaceRoot, '.specify', 'references', 'platform');
  fs.mkdirSync(referencesDirPath, { recursive: true });
  fs.writeFileSync(path.join(referencesDirPath, 'eai.md'), '# eai reference\n', 'utf8');
  fs.writeFileSync(
    path.join(referencesDirPath, 'eai-app-template.md'),
    '# eai-app-template reference\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(referencesDirPath, 'deployment-repo.md'),
    '# deployment-repo reference\n',
    'utf8'
  );
}

describe('enterpriseai novice e2e walkthrough (root integration)', () => {
  it('keeps novice guardrails and auto-chain guidance across discovery and research entrypoints', () => {
    const scenarioCommand = readCommandFile('0_gofer_start.md');
    const researchCommand = readCommandFile('1_gofer_research.md');

    expect(scenarioCommand).toMatch(/Novice Walkthrough Guardrail \(MANDATORY\)/);
    expect(scenarioCommand).toMatch(
      /Provide recommended options and plain-language implications for every/
    );
    expect(scenarioCommand).toMatch(/Pipeline auto-chains from there/);

    expect(researchCommand).toMatch(/Novice Walkthrough Guardrail \(MANDATORY\)/);
    expect(researchCommand).toMatch(
      /Do not require external docs to understand or act on research output\./
    );
    expect(researchCommand).toMatch(
      /Explain terms and recommendations in plain language before advanced details\./
    );
  });

  it('preserves end-to-end walkthrough artifacts for stakeholder communication stage', async () => {
    const stakeholderCommand = readCommandFile('7a_stakeholder_comms.md');

    expect(stakeholderCommand).toContain('Demo Script (5-minute walkthrough)');
    expect(stakeholderCommand).toContain('presentation.marp.md');
    expect(stakeholderCommand).toContain('Release Notes');

    const fixturesDir = createFixtureDir('fixtures-novice-e2e');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    seedStakeholderInputs(fixturesDir);

    try {
      const discoveryResult = await generateEnterpriseAiDiscoveryArtifact(
        {
          runId: 'run_029_novice',
          workflowProfile: 'enterpriseai',
          challengeSummary: 'Novice learners need plain-language EnterpriseAI workflow guidance.',
          targetPersona: 'University students with no prior EnterpriseAI platform experience',
          expectedValue:
            'a clear problem statement, persona framing, and stepwise plan they can execute safely',
          outputPath: `${FEATURE_DIR}/discovery.md`,
        },
        {
          workspaceRoot: fixturesDir,
        }
      );

      const result = await generateStakeholderArtifacts(
        {
          runId: 'run_029_novice',
          workflowProfile: 'enterpriseai',
          enableMarpDeck: true,
          inputArtifacts: {
            discovery: `${FEATURE_DIR}/discovery.md`,
            spec: `${FEATURE_DIR}/spec.md`,
            plan: `${FEATURE_DIR}/plan.md`,
            implementationSummary: `${FEATURE_DIR}/implementation-summary.md`,
          },
        },
        {
          workspaceRoot: fixturesDir,
        }
      );

      const discoveryContent = fs.readFileSync(
        path.join(fixturesDir, discoveryResult.response.discoveryPath),
        'utf8'
      );

      const releaseNotesContent = fs.readFileSync(
        path.join(fixturesDir, result.response.releaseNotesPath),
        'utf8'
      );
      const demoScriptContent = fs.readFileSync(
        path.join(fixturesDir, result.response.demoScriptPath),
        'utf8'
      );
      const marpDeckContent = fs.readFileSync(
        path.join(fixturesDir, result.response.marpDeckPath),
        'utf8'
      );

      expect(result.response.marpDeckGenerated).toBe(true);
      expect(discoveryContent).toContain('Problem Statement');
      expect(discoveryContent).toContain('Persona');
      expect(discoveryContent).toContain('Value Proposition');
      expect(releaseNotesContent).toContain('Problem Statement');
      expect(demoScriptContent).toContain('Demo Script Summary');
      expect(marpDeckContent).toContain('Success Metrics');
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });

  it('executes a novice-safe discovery-to-planning flow using only local fallback references', async () => {
    const fixturesDir = createFixtureDir('fixtures-novice-flow');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    seedStakeholderInputs(fixturesDir);
    seedFallbackReferences(fixturesDir);

    try {
      const discoveryResult = await generateEnterpriseAiDiscoveryArtifact(
        {
          runId: 'run_029_novice_flow',
          workflowProfile: 'enterpriseai',
          challengeSummary:
            'Students need to discover a business problem and define an EnterpriseAI-ready solution path.',
          targetPersona: 'University students and business students',
          expectedValue:
            'a structured problem statement, persona profile, and value proposition that can drive planning',
          outputPath: `${FEATURE_DIR}/discovery.md`,
        },
        {
          workspaceRoot: fixturesDir,
        }
      );

      const referencesResult = await resolveEnterpriseAiReferences(
        {
          runId: 'run_029_novice_flow',
          referenceTypes: ['eai', 'eai-app-template', 'deployment-repo'],
          externalReferencesEnabled: false,
          fallbackPath: '.specify/references/platform/',
        },
        {
          workspaceRoot: fixturesDir,
        }
      );

      const decisionRequest = requestArchitectureDecision({
        runId: 'run_029_novice_flow',
        decisionId: 'decision_novice_profile',
        title: 'Choose the EnterpriseAI workflow profile',
        options: ['enterpriseai'],
        requiresExplicitApproval: true,
      });

      const decisionApproval = recordArchitectureDecisionApproval({
        runId: 'run_029_novice_flow',
        approvalToken: decisionRequest.response.approvalToken,
        decisionId: 'decision_novice_profile',
        approved: true,
        approvedBy: 'student.user',
      });

      const resolvedReferenceMap = referencesResult.response.resolvedReferences.reduce(
        (
          acc: {
            eaiCli: string;
            eaiAppTemplate: string;
            deploymentRepo: string;
          },
          reference
        ) => {
          if (reference.type === 'eai') {
            acc.eaiCli = reference.path;
          } else if (reference.type === 'eai-app-template') {
            acc.eaiAppTemplate = reference.path;
          } else if (reference.type === 'deployment-repo') {
            acc.deploymentRepo = reference.path;
          }
          return acc;
        },
        {
          eaiCli: '',
          eaiAppTemplate: '',
          deploymentRepo: '',
        }
      );

      const planResult = generateEnterpriseAiPlanAndTasks({
        runId: 'run_029_novice_flow',
        workflowProfile: 'enterpriseai',
        specPath: `${FEATURE_DIR}/spec.md`,
        resolvedReferences: resolvedReferenceMap,
        installedEaiCliVersion: '2.7.4',
      });

      const marketResult = await generateBusinessAndMarketArtifacts(
        {
          runId: 'run_029_novice_flow',
          workflowProfile: 'enterpriseai',
          includeCompetitiveAnalysis: true,
          minimumAlternativeCount: 3,
          requireSpecAndPlanReferences: true,
          discoveryArtifactPath: `${FEATURE_DIR}/discovery.md`,
          competitiveAlternatives: ['alt-one', 'alt-two', 'alt-three'],
        },
        {
          workspaceRoot: fixturesDir,
        }
      );

      const businessAnalysisContent = fs.readFileSync(
        path.join(fixturesDir, marketResult.response.businessAnalysisPath),
        'utf8'
      );
      const generatedDiscoveryContent = fs.readFileSync(
        path.join(fixturesDir, discoveryResult.response.discoveryPath),
        'utf8'
      );

      expect(referencesResult.response.userNoticeRequired).toBe(true);
      expect(referencesResult.response.resolvedReferences).toHaveLength(3);
      expect(decisionApproval.response.pipelineMayProceed).toBe(true);
      expect(planResult.response.metadata.integrationMap.included).toBe(true);
      expect(marketResult.response.competitiveAnalysisEnabled).toBe(true);
      expect(generatedDiscoveryContent).toContain('Problem Statement');
      expect(generatedDiscoveryContent).toContain('EnterpriseAI-ready Direction');
      expect(businessAnalysisContent).toContain('Problem Statement');
      expect(businessAnalysisContent).toContain('EnterpriseAI-selected direction rationale');
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });
});
