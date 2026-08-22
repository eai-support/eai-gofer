import * as assert from 'assert';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { generateStakeholderArtifacts } from '../../../services/enterpriseai/internalApi/GenerateStakeholderArtifacts';

const FEATURE_DIR = '.specify/specs/029-enterpriseai-student-vertical-builder';

async function readRootCommandFile(fileName: string): Promise<string> {
  const candidates = [process.cwd(), path.resolve(process.cwd(), '..')];
  const repoRoot = candidates.find((candidate) =>
    fsSync.existsSync(path.join(candidate, '.specify', 'commands'))
  );
  assert.ok(repoRoot, `Unable to resolve repo root from ${process.cwd()}`);
  return fs.readFile(path.join(repoRoot, '.specify', 'commands', fileName), 'utf8');
}

async function seedStakeholderInputs(workspaceRoot: string): Promise<void> {
  const featureDirPath = path.join(workspaceRoot, FEATURE_DIR);
  await fs.mkdir(featureDirPath, { recursive: true });
  await fs.writeFile(
    path.join(featureDirPath, 'discovery.md'),
    '# Discovery\nNovice learners need plain-language EnterpriseAI workflow guidance.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(featureDirPath, 'spec.md'),
    '# Spec\nEnterpriseAI solution overview with beginner-friendly milestones.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(featureDirPath, 'plan.md'),
    '# Plan\nArchitecture and implementation sequencing with explicit checkpoints.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(featureDirPath, 'implementation-summary.md'),
    '# Implementation\nDemo walkthrough complete with measurable outcomes.\n',
    'utf8'
  );
}

suite('enterpriseai novice e2e walkthrough (extension integration)', () => {
  const fixturesDir = path.join(__dirname, 'fixtures-novice-e2e-walkthrough');

  setup(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
    await seedStakeholderInputs(fixturesDir);
  });

  teardown(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
  });

  test('keeps novice guardrails and auto-chain walkthrough expectations in discovery/research entrypoints', async () => {
    const scenarioCommand = await readRootCommandFile('0_gofer_start.md');
    const researchCommand = await readRootCommandFile('1_gofer_research.md');

    assert.ok(/Novice Walkthrough Guardrail \(MANDATORY\)/.test(scenarioCommand));
    assert.ok(
      /Provide recommended options and plain-language implications for every/.test(scenarioCommand)
    );
    assert.ok(/Pipeline auto-chains from there/.test(scenarioCommand));

    assert.ok(/Novice Walkthrough Guardrail \(MANDATORY\)/.test(researchCommand));
    assert.ok(
      /Do not require external docs to understand or act on research output\./.test(researchCommand)
    );
    assert.ok(
      /Explain terms and recommendations in plain language before advanced details\./.test(
        researchCommand
      )
    );
  });

  test('retains end-to-end walkthrough outputs in stakeholder comms stage with real artifacts', async () => {
    const stakeholderCommand = await readRootCommandFile('7a_stakeholder_comms.md');

    assert.ok(stakeholderCommand.includes('Demo Script (5-minute walkthrough)'));
    assert.ok(stakeholderCommand.includes('presentation.marp.md'));
    assert.ok(stakeholderCommand.includes('Release Notes'));

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

    const releaseNotesContent = await fs.readFile(
      path.join(fixturesDir, result.response.releaseNotesPath),
      'utf8'
    );
    const demoScriptContent = await fs.readFile(
      path.join(fixturesDir, result.response.demoScriptPath),
      'utf8'
    );
    const marpDeckContent = await fs.readFile(
      path.join(fixturesDir, result.response.marpDeckPath),
      'utf8'
    );

    assert.strictEqual(result.response.marpDeckGenerated, true);
    assert.ok(releaseNotesContent.includes('Problem Statement'));
    assert.ok(demoScriptContent.includes('Demo Script Summary'));
    assert.ok(marpDeckContent.includes('Success Metrics'));
  });
});
