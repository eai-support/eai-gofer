import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { generateStakeholderArtifacts } from '../../../extension/src/services/enterpriseai/internalApi/GenerateStakeholderArtifacts';

const FEATURE_DIR = '.specify/specs/029-enterpriseai-student-vertical-builder';
const FEATURE_SPEC_PATH = `${FEATURE_DIR}/spec.md`;
const EXPECTED_RELEASE_NOTES = `${FEATURE_DIR}/release-notes.md`;
const EXPECTED_DEMO_SCRIPT = `${FEATURE_DIR}/demo-script.md`;

const REQUIRED_SECTION_TITLES: readonly string[] = [
  'Problem Statement',
  'EnterpriseAI Solution Overview',
  'Architecture Diagram Reference',
  'Demo Script Summary',
  'Success Metrics',
];

function readFromRepo(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
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
    path.join(featureDirPath, 'discovery.md'),
    '# Discovery\nProblem statement for EnterpriseAI student delivery.\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(featureDirPath, 'spec.md'),
    '# Spec\nEnterpriseAI solution overview with integration boundaries.\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(featureDirPath, 'plan.md'),
    '# Plan\nArchitecture diagram reference and deployment sequencing.\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(featureDirPath, 'implementation-summary.md'),
    '# Implementation\nDemo-ready implementation summary with measurable outcomes.\n',
    'utf8'
  );
}

describe('enterpriseai marp content completeness (root integration)', () => {
  it('includes Marp frontmatter and all required sections in stakeholder comms template and command guidance', () => {
    const stakeholderTemplate = readFromRepo('.specify/templates/stakeholder-comms-template.md');
    const stakeholderCommand = readFromRepo('.specify/commands/7a_stakeholder_comms.md');

    expect(stakeholderTemplate).toContain('presentation.marp.md');
    expect(stakeholderTemplate).toContain('marp: true');
    expect(stakeholderCommand).toContain('presentation.marp.md');
    expect(stakeholderCommand).toContain('marp: true');

    for (const sectionTitle of REQUIRED_SECTION_TITLES) {
      expect(stakeholderTemplate).toContain(sectionTitle);
      expect(stakeholderCommand).toContain(sectionTitle);
    }
  });

  it('preserves release notes and demo script outputs for Marp-enabled and Marp-disabled runs', async () => {
    const fixturesDir = createFixtureDir('fixtures-marp-content');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    seedStakeholderInputs(fixturesDir);

    try {
      const marpEnabled = await generateStakeholderArtifacts(
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
        }
      );

      const marpDisabled = await generateStakeholderArtifacts(
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
        }
      );

      expect(marpEnabled.response.releaseNotesPath).toBe(EXPECTED_RELEASE_NOTES);
      expect(marpEnabled.response.demoScriptPath).toBe(EXPECTED_DEMO_SCRIPT);
      expect(marpEnabled.response.marpEnabled).toBe(true);
      expect(marpEnabled.response.marpDeckGenerated).toBe(true);

      expect(marpDisabled.response.releaseNotesPath).toBe(EXPECTED_RELEASE_NOTES);
      expect(marpDisabled.response.demoScriptPath).toBe(EXPECTED_DEMO_SCRIPT);
      expect(marpDisabled.response.marpEnabled).toBe(false);
      expect(marpDisabled.response.marpDeckGenerated).toBe(false);

      const releaseNotesContent = fs.readFileSync(
        path.join(fixturesDir, EXPECTED_RELEASE_NOTES),
        'utf8'
      );
      const demoScriptContent = fs.readFileSync(
        path.join(fixturesDir, EXPECTED_DEMO_SCRIPT),
        'utf8'
      );
      expect(releaseNotesContent).toContain('Problem Statement');
      expect(demoScriptContent).toContain('Demo Script Summary');
      expect(releaseNotesContent).toContain('Problem statement for EnterpriseAI student delivery.');
      expect(releaseNotesContent).toContain(
        'EnterpriseAI solution overview with integration boundaries.'
      );
      expect(releaseNotesContent).toContain(
        'Architecture diagram reference and deployment sequencing.'
      );
      expect(demoScriptContent).toContain(
        'Demo-ready implementation summary with measurable outcomes.'
      );
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });
});
