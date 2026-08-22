import * as assert from 'assert';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  type StakeholderCommsGeneratedEventPayload,
  generateStakeholderArtifacts,
} from '../../../services/enterpriseai/internalApi/GenerateStakeholderArtifacts';
import { createStakeholderCommsEventHandlers } from '../../../services/enterpriseai/events/StakeholderCommsEvents';

const FEATURE_DIR = '.specify/specs/029-enterpriseai-student-vertical-builder';
const FEATURE_SPEC_PATH = `${FEATURE_DIR}/spec.md`;
const EXPECTED_RELEASE_NOTES = `${FEATURE_DIR}/release-notes.md`;
const EXPECTED_DEMO_SCRIPT = `${FEATURE_DIR}/demo-script.md`;
const EXPECTED_MARP_PATH = `${FEATURE_DIR}/presentation.marp.md`;

function resolveRepoRoot(): string {
  const candidates = [process.cwd(), path.resolve(process.cwd(), '..')];
  const repoRoot = candidates.find((candidate) =>
    fsSync.existsSync(path.join(candidate, '.specify', 'commands'))
  );
  assert.ok(repoRoot, `Unable to resolve repo root from ${process.cwd()}`);
  return repoRoot;
}

async function seedStakeholderInputs(workspaceRoot: string): Promise<void> {
  const featureDirPath = path.join(workspaceRoot, FEATURE_DIR);
  await fs.mkdir(featureDirPath, { recursive: true });
  await fs.writeFile(
    path.join(featureDirPath, 'discovery.md'),
    '# Discovery\nProblem statement for EnterpriseAI student delivery.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(featureDirPath, 'spec.md'),
    '# Spec\nEnterpriseAI solution overview with integration boundaries.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(featureDirPath, 'plan.md'),
    '# Plan\nArchitecture diagram reference and deployment sequencing.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(featureDirPath, 'implementation-summary.md'),
    '# Implementation\nDemo-ready implementation summary with measurable outcomes.\n',
    'utf8'
  );
}

suite('enterpriseai marp opt-in preservation (extension integration)', () => {
  const fixturesDir = path.join(__dirname, 'fixtures-marp-opt-in');

  setup(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
    await seedStakeholderInputs(fixturesDir);
  });

  teardown(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
  });

  test('supports Marp opt-in and preserves release-notes/demo-script outputs across opt-in states', async () => {
    const eventHandlers = createStakeholderCommsEventHandlers();
    const consumedPayloads: StakeholderCommsGeneratedEventPayload[] = [];
    const unsubscribe = eventHandlers.consume(
      (payload: StakeholderCommsGeneratedEventPayload): void => {
        consumedPayloads.push(payload);
      }
    );

    const marpOptInResult = await generateStakeholderArtifacts(
      {
        runId: 'run_029_0001',
        workflowProfile: 'enterpriseai',
        enableMarpDeck: true,
        inputArtifacts: {
          discovery: `${FEATURE_DIR}/discovery.md`,
          spec: FEATURE_SPEC_PATH,
          plan: `${FEATURE_DIR}/plan.md`,
          implementationSummary: `${FEATURE_DIR}/implementation-summary.md`,
        },
      },
      {
        workspaceRoot: fixturesDir,
        eventPublisher: (payload: StakeholderCommsGeneratedEventPayload): void => {
          eventHandlers.publish(payload);
        },
      }
    );

    const marpOptOutResult = await generateStakeholderArtifacts(
      {
        runId: 'run_029_0002',
        workflowProfile: 'enterpriseai',
        enableMarpDeck: false,
        inputArtifacts: {
          discovery: `${FEATURE_DIR}/discovery.md`,
          spec: FEATURE_SPEC_PATH,
          plan: `${FEATURE_DIR}/plan.md`,
          implementationSummary: `${FEATURE_DIR}/implementation-summary.md`,
        },
      },
      {
        workspaceRoot: fixturesDir,
        eventPublisher: (payload: StakeholderCommsGeneratedEventPayload): void => {
          eventHandlers.publish(payload);
        },
      }
    );

    unsubscribe();

    assert.strictEqual(marpOptInResult.response.marpEnabled, true);
    assert.strictEqual(marpOptInResult.response.marpDeckGenerated, true);
    assert.strictEqual(marpOptOutResult.response.marpEnabled, false);
    assert.strictEqual(marpOptOutResult.response.marpDeckGenerated, false);

    assert.strictEqual(marpOptInResult.response.releaseNotesPath, EXPECTED_RELEASE_NOTES);
    assert.strictEqual(marpOptOutResult.response.releaseNotesPath, EXPECTED_RELEASE_NOTES);
    assert.strictEqual(marpOptInResult.response.demoScriptPath, EXPECTED_DEMO_SCRIPT);
    assert.strictEqual(marpOptOutResult.response.demoScriptPath, EXPECTED_DEMO_SCRIPT);
    assert.strictEqual(marpOptInResult.response.marpDeckPath, EXPECTED_MARP_PATH);
    assert.strictEqual(marpOptOutResult.response.marpDeckPath, EXPECTED_MARP_PATH);

    const releaseNotesContent = await fs.readFile(
      path.join(fixturesDir, EXPECTED_RELEASE_NOTES),
      'utf8'
    );
    const demoScriptContent = await fs.readFile(
      path.join(fixturesDir, EXPECTED_DEMO_SCRIPT),
      'utf8'
    );
    assert.ok(releaseNotesContent.includes('Problem Statement'));
    assert.ok(demoScriptContent.includes('Demo Script Summary'));

    assert.strictEqual(consumedPayloads.length, 2);
    assert.strictEqual(consumedPayloads[0].marpEnabled, true);
    assert.strictEqual(consumedPayloads[1].marpEnabled, false);
    assert.strictEqual(eventHandlers.consumerCount(), 0);
  });

  test('documents Marp as opt-in and default-recommended for EnterpriseAI while preserving legacy outputs', async () => {
    const commandPath = path.join(
      resolveRepoRoot(),
      '.specify',
      'commands',
      '7a_stakeholder_comms.md'
    );
    const stakeholderCommand = await fs.readFile(commandPath, 'utf8');

    assert.ok(stakeholderCommand.includes('opt-in'));
    assert.ok(stakeholderCommand.includes('recommended only for `workflowProfile=enterpriseai`'));
    assert.ok(stakeholderCommand.includes('release-notes.md'));
    assert.ok(stakeholderCommand.includes('demo-script.md'));
  });
});
