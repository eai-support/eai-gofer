import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { generateEnterpriseAiPlanAndTasks } from '../../../services/enterpriseai/internalApi/GenerateEnterpriseAiPlanAndTasks';

function readRootCommandFile(fileName: string): string {
  const candidates = [process.cwd(), path.resolve(process.cwd(), '..')];
  const repoRoot = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, '.specify', 'commands'))
  );
  assert.ok(repoRoot, `Unable to resolve repo root from ${process.cwd()}`);
  return fs.readFileSync(path.join(repoRoot, '.specify', 'commands', fileName), 'utf8');
}

suite('enterpriseai plan/task generation (extension integration)', () => {
  test('requires integration map, deployment conventions, and ordered runnable guidance in canonical commands', () => {
    const specifyCommand = readRootCommandFile('2_gofer_specify.md');
    const planCommand = readRootCommandFile('3_gofer_plan.md');
    const tasksCommand = readRootCommandFile('4_gofer_tasks.md');

    assert.ok(/EnterpriseAI Integration Map Requirements/.test(specifyCommand));
    assert.ok(/App -> EAI Services -> Deployment Target/.test(specifyCommand));

    assert.ok(
      /EnterpriseAI Deployment Convention and EAI CLI Pinning Requirements/.test(planCommand)
    );
    assert.ok(/pin\s+guidance to `major\.minor`/.test(planCommand));

    assert.ok(/Ordered Runnable Task-Generation Guidance/.test(tasksCommand));
    assert.ok(/real EAI app gates before any claim of seeding/.test(tasksCommand));
    assert.ok(/App resource provisioning -> `eai app provision`/.test(tasksCommand));
    assert.ok(/pinned `eai major\.minor` deployment tasks/i.test(tasksCommand));
  });

  test('propagates market-analysis reference indicators and eai pin metadata for IAP-006 and EVT-006', () => {
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

    assert.strictEqual(result.response.deploymentConventionsIncluded, true);
    assert.strictEqual(result.response.recordedEaiCliMajorMinor, '2.7');
    assert.strictEqual(result.response.metadata.integrationMap.included, true);
    assert.strictEqual(result.response.metadata.marketAnalysis?.referencedInSpec, true);
    assert.strictEqual(result.response.metadata.marketAnalysis?.referencedInPlan, true);
    assert.deepStrictEqual(result.response.metadata.requiredReferenceIndicators, {
      eaiCli: true,
      verticalTemplate: true,
      eaiAppTemplate: true,
      deploymentRepo: true,
    });
    assert.strictEqual(result.emittedEvent.contractId, 'EVT-006');
    assert.strictEqual(result.emittedEvent.payload.eaiCliMajorMinor, '2.7');
  });
});
