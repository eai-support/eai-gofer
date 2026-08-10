import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CrossPlatformCommandRouter } from '../../../extension/src/council/CrossPlatformCommandRouter';
import { normalizeWorkflowProfile } from '../../../extension/src/config/workflowProfile';
import { generateEnterpriseAiPlanAndTasks } from '../../../extension/src/services/enterpriseai/internalApi/GenerateEnterpriseAiPlanAndTasks';
import { generateStakeholderArtifacts } from '../../../extension/src/services/enterpriseai/internalApi/GenerateStakeholderArtifacts';
import { workflowActivateProfile } from '../../../extension/src/services/enterpriseai/internalApi/WorkflowActivateProfile';

const FEATURE_DIR = '.specify/specs/029-enterpriseai-student-vertical-builder';

interface BaselineProvenance {
  baselineId: string;
  fixtureChecksums: Record<string, string>;
}

function readCommandFile(fileName: string): string {
  return fs.readFileSync(path.join(process.cwd(), '.specify', 'commands', fileName), 'utf8');
}

function readStandardBaselineArtifact(fileName: string): string {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      'tests',
      'fixtures',
      'enterpriseai',
      'non-eai-standard-baseline',
      fileName
    ),
    'utf8'
  );
}

function readStandardBaselineJson<T>(fileName: string): T {
  return JSON.parse(readStandardBaselineArtifact(fileName)) as T;
}

function readStandardBaselineProvenance(): BaselineProvenance {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        'tests',
        'fixtures',
        'enterpriseai',
        'non-eai-standard-baseline',
        'provenance.json'
      ),
      'utf8'
    )
  ) as BaselineProvenance;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertBaselineChecksums(provenance: BaselineProvenance): void {
  for (const [fileName, expectedChecksum] of Object.entries(provenance.fixtureChecksums)) {
    const fileContent = readStandardBaselineArtifact(fileName);
    expect(sha256(fileContent)).toBe(expectedChecksum);
  }
}

function normalizeForBaseline<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry: unknown): unknown => normalizeForBaseline(entry)) as T;
  }

  if (value !== null && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (entryValue === undefined) {
        continue;
      }
      normalized[key] = normalizeForBaseline(entryValue);
    }
    return normalized as T;
  }

  return value;
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
    '# Discovery\nStandard baseline context.\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(featureDirPath, 'spec.md'),
    '# Spec\nStandard baseline behavior.\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(featureDirPath, 'plan.md'),
    '# Plan\nStandard planning flow.\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(featureDirPath, 'implementation-summary.md'),
    '# Implementation\nStandard implementation outcomes.\n',
    'utf8'
  );
}

describe('enterpriseai non-eai output regression (root integration)', () => {
  it('preserves standard profile activation defaults and non-EAI planning metadata outputs', () => {
    const baselineProvenance = readStandardBaselineProvenance();
    expect(baselineProvenance.baselineId).toBe('pre-enterpriseai-standard-profile-v1');
    assertBaselineChecksums(baselineProvenance);

    expect(normalizeWorkflowProfile(undefined)).toBe('standard');
    expect(normalizeWorkflowProfile('unrecognized-profile')).toBe('standard');

    const activation = workflowActivateProfile(
      {
        runId: 'run_standard_001',
        workflowProfile: 'standard',
        stage: 'planning',
        requestedBy: 'student@university.edu',
      },
      {
        eventId: 'evt_001_standard_baseline',
        activatedAt: '2026-01-01T00:00:00.000Z',
      }
    );
    const expectedActivation = readStandardBaselineJson<Record<string, unknown>>(
      'workflow-activation.json'
    );
    expect(activation).toEqual(expectedActivation);

    const planResult = generateEnterpriseAiPlanAndTasks(
      {
        runId: 'run_standard_001',
        workflowProfile: 'standard',
        specPath: '.specify/specs/029-enterpriseai-student-vertical-builder/spec.md',
        resolvedReferences: {
          eaiCli: '.specify/references/platform/eai.md',
          eaiAppTemplate: '.specify/references/platform/eai-app-template.md',
          deploymentRepo: '.specify/references/platform/deployment-repo.md',
        },
        installedEaiCliVersion: '2.7.4',
      },
      {
        eventId: 'evt_006_standard_baseline',
      }
    );
    const expectedPlanResult =
      readStandardBaselineJson<Record<string, unknown>>('plan-generation.json');
    expect(normalizeForBaseline(planResult)).toEqual(expectedPlanResult);
  });

  it('keeps command routing and standard-profile stakeholder artifacts stable for non-EAI workflows', async () => {
    const baselineProvenance = readStandardBaselineProvenance();
    expect(baselineProvenance.baselineId).toBe('pre-enterpriseai-standard-profile-v1');
    assertBaselineChecksums(baselineProvenance);

    const expectedRoutingSnapshot =
      readStandardBaselineJson<Record<string, unknown>>('routing-snapshot.json');
    const expectedReleaseNotes = readStandardBaselineArtifact('release-notes.md');
    const expectedDemoScript = readStandardBaselineArtifact('demo-script.md');

    const router = new CrossPlatformCommandRouter(process.cwd());

    const standardClaude = await router.routeCommand('eai', 'claude', 'standard');
    const enterpriseClaude = await router.routeCommand('eai', 'claude', 'enterpriseai');
    const standardCopilot = await router.routeCommand('eai', 'copilot', 'standard');
    const standardCodex = await router.routeCommand('eai', 'codex', 'standard');

    const routingSnapshot = {
      claudeSyntax: standardClaude.syntax,
      copilotSyntax: standardCopilot.syntax,
      codexSyntax: standardCodex.syntax,
      sameClaudePathAcrossProfiles: standardClaude.filePath === enterpriseClaude.filePath,
      standardProfileMatched: standardClaude.profileMatched,
    };
    expect(routingSnapshot).toEqual(expectedRoutingSnapshot);

    const fixturesDir = createFixtureDir('fixtures-non-eai-output-regression');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    seedStakeholderInputs(fixturesDir);

    try {
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
          eventId: 'evt_007_standard_baseline',
          generatedAt: '2026-01-01T00:00:00.000Z',
        }
      );

      expect(artifactResult).toEqual({
        contractId: 'IAP-007',
        operationName: 'comms.generateStakeholderArtifacts',
        response: {
          status: 'completed',
          releaseNotesPath: `${FEATURE_DIR}/release-notes.md`,
          demoScriptPath: `${FEATURE_DIR}/demo-script.md`,
          marpDeckPath: `${FEATURE_DIR}/presentation.marp.md`,
          marpEnabled: false,
          marpDeckGenerated: false,
          marpRecommendedByDefault: false,
        },
        emittedEvent: {
          contractId: 'EVT-007',
          eventName: 'artifacts.stakeholder-comms.generated.v1',
          payload: {
            eventId: 'evt_007_standard_baseline',
            runId: 'run_standard_artifacts',
            releaseNotesPath: `${FEATURE_DIR}/release-notes.md`,
            demoScriptPath: `${FEATURE_DIR}/demo-script.md`,
            marpDeckPath: `${FEATURE_DIR}/presentation.marp.md`,
            marpEnabled: false,
          },
        },
      });

      expect(fs.existsSync(path.join(fixturesDir, artifactResult.response.releaseNotesPath))).toBe(
        true
      );
      expect(fs.existsSync(path.join(fixturesDir, artifactResult.response.demoScriptPath))).toBe(
        true
      );
      expect(fs.existsSync(path.join(fixturesDir, artifactResult.response.marpDeckPath))).toBe(
        false
      );

      const releaseNotesContent = fs.readFileSync(
        path.join(fixturesDir, artifactResult.response.releaseNotesPath),
        'utf8'
      );
      const demoScriptContent = fs.readFileSync(
        path.join(fixturesDir, artifactResult.response.demoScriptPath),
        'utf8'
      );
      expect(releaseNotesContent).toBe(expectedReleaseNotes);
      expect(demoScriptContent).toBe(expectedDemoScript);
      expect(sha256(releaseNotesContent)).toBe(
        baselineProvenance.fixtureChecksums['release-notes.md']
      );
      expect(sha256(demoScriptContent)).toBe(baselineProvenance.fixtureChecksums['demo-script.md']);
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }

    const planCommand = readCommandFile('3_gofer_plan.md');
    expect(planCommand).toContain('standard profile outputs remain unchanged');
  });
});
