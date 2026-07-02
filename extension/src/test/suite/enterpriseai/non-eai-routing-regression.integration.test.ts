import * as assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CrossPlatformCommandRouter } from '../../../council/CrossPlatformCommandRouter';
import { normalizeWorkflowProfile } from '../../../config/workflowProfile';
import { generateStakeholderArtifacts } from '../../../services/enterpriseai/internalApi/GenerateStakeholderArtifacts';

const FEATURE_DIR = '.specify/specs/029-enterpriseai-student-vertical-builder';

interface BaselineProvenance {
  baselineId: string;
  fixtureChecksums: Record<string, string>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function seedStakeholderInputs(workspaceRoot: string): Promise<void> {
  const featureDirPath = path.join(workspaceRoot, FEATURE_DIR);
  await fs.mkdir(featureDirPath, { recursive: true });
  await fs.writeFile(
    path.join(featureDirPath, 'discovery.md'),
    '# Discovery\nStandard baseline context.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(featureDirPath, 'spec.md'),
    '# Spec\nStandard baseline behavior.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(featureDirPath, 'plan.md'),
    '# Plan\nStandard planning flow.\n',
    'utf8'
  );
  await fs.writeFile(
    path.join(featureDirPath, 'implementation-summary.md'),
    '# Implementation\nStandard implementation outcomes.\n',
    'utf8'
  );
}

suite('enterpriseai non-eai routing regression (extension integration)', () => {
  const fixturesDir = path.join(__dirname, 'fixtures-non-eai-routing-regression');

  setup(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
    await seedStakeholderInputs(fixturesDir);
  });

  teardown(async () => {
    await fs.rm(fixturesDir, { recursive: true, force: true });
  });

  test('preserves provider routing syntaxes and baseline standard artifact behavior', async () => {
    const workspaceRoot = path.resolve(process.cwd(), '..');
    const router = new CrossPlatformCommandRouter(workspaceRoot);

    const standardClaude = await router.routeCommand('0_gofer_start', 'claude', 'standard');
    const enterpriseClaude = await router.routeCommand('0_gofer_start', 'claude', 'enterpriseai');
    const standardCodex = await router.routeCommand('0_gofer_start', 'codex', 'standard');
    const standardCopilot = await router.routeCommand('0_gofer_start', 'copilot', 'standard');

    assert.strictEqual(normalizeWorkflowProfile(undefined), 'standard');
    assert.strictEqual(normalizeWorkflowProfile('unexpected-value'), 'standard');

    assert.strictEqual(standardClaude.syntax, '/0_gofer_start');
    assert.strictEqual(standardCodex.syntax, '/0_gofer_start');
    assert.strictEqual(standardCopilot.syntax, '#0_gofer_start');
    assert.strictEqual(standardClaude.filePath, enterpriseClaude.filePath);
    assert.strictEqual(standardClaude.profileMatched, true);

    const artifactResult = await generateStakeholderArtifacts(
      {
        runId: 'run_standard_artifacts',
        workflowProfile: 'standard',
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
        generatedAt: '2026-01-01T00:00:00.000Z',
      }
    );

    assert.strictEqual(artifactResult.response.marpEnabled, false);
    assert.strictEqual(artifactResult.response.marpDeckGenerated, false);

    const releaseNotesPath = path.join(fixturesDir, artifactResult.response.releaseNotesPath);
    const demoScriptPath = path.join(fixturesDir, artifactResult.response.demoScriptPath);
    const baselineDir = path.resolve(
      workspaceRoot,
      'tests',
      'fixtures',
      'enterpriseai',
      'non-eai-standard-baseline'
    );
    await assert.doesNotReject(() => fs.access(releaseNotesPath));
    await assert.doesNotReject(() => fs.access(demoScriptPath));
    await assert.rejects(() =>
      fs.access(path.join(fixturesDir, artifactResult.response.marpDeckPath))
    );

    const [
      releaseNotesContent,
      demoScriptContent,
      expectedReleaseNotesContent,
      expectedDemoScriptContent,
      provenanceContent,
    ] = await Promise.all([
      fs.readFile(releaseNotesPath, 'utf8'),
      fs.readFile(demoScriptPath, 'utf8'),
      fs.readFile(path.join(baselineDir, 'release-notes.md'), 'utf8'),
      fs.readFile(path.join(baselineDir, 'demo-script.md'), 'utf8'),
      fs.readFile(path.join(baselineDir, 'provenance.json'), 'utf8'),
    ]);
    const provenance = JSON.parse(provenanceContent) as BaselineProvenance;
    assert.strictEqual(provenance.baselineId, 'pre-enterpriseai-standard-profile-v1');
    for (const [fileName, expectedChecksum] of Object.entries(provenance.fixtureChecksums)) {
      const baselineContent = await fs.readFile(path.join(baselineDir, fileName), 'utf8');
      assert.strictEqual(sha256(baselineContent), expectedChecksum);
    }
    assert.strictEqual(releaseNotesContent, expectedReleaseNotesContent);
    assert.strictEqual(demoScriptContent, expectedDemoScriptContent);
    assert.strictEqual(
      sha256(releaseNotesContent),
      provenance.fixtureChecksums['release-notes.md']
    );
    assert.strictEqual(sha256(demoScriptContent), provenance.fixtureChecksums['demo-script.md']);
  });
});
