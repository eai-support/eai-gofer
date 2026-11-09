import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  generateStakeholderArtifacts,
  STAKEHOLDER_PERSONAS,
} from '../../../extension/src/services/enterpriseai/internalApi/GenerateStakeholderArtifacts';

const FEATURE_DIR = '.specify/specs/029-enterpriseai-student-vertical-builder';
const FEATURE_SPEC_PATH = `${FEATURE_DIR}/spec.md`;

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

describe('enterpriseai persona marp deck pack (root integration)', () => {
  it('generates decision-rights Marp decks for all enterprise personas by default', async () => {
    const fixturesDir = createFixtureDir('fixtures-persona-marp-decks');
    fs.rmSync(fixturesDir, { recursive: true, force: true });
    seedStakeholderInputs(fixturesDir);

    try {
      const result = await generateStakeholderArtifacts(
        {
          runId: 'run_029_persona_pack',
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

      expect(result.response.personaDeckPaths).toHaveLength(STAKEHOLDER_PERSONAS.length);
      expect(result.emittedEvent.payload.personaDeckPaths).toHaveLength(
        STAKEHOLDER_PERSONAS.length
      );
      expect(result.emittedEvent.payload.personaDeckPersonas).toEqual([...STAKEHOLDER_PERSONAS]);

      for (const persona of STAKEHOLDER_PERSONAS) {
        const deckPath = `${FEATURE_DIR}/presentations/${persona}.marp.md`;
        const absoluteDeckPath = path.join(fixturesDir, deckPath);
        expect(fs.existsSync(absoluteDeckPath), `${persona} deck exists`).toBe(true);

        const content = fs.readFileSync(absoluteDeckPath, 'utf8');
        expect(content).toContain('marp: true');
        expect(content).toContain('Executive Summary');
        expect(content).toContain('Decision Focus');
        expect(content).toContain('Problem Statement');
        expect(content).toContain('EnterpriseAI Solution Overview');
        expect(content).toContain('AI-Augmented 4-Step Journey');
        expect(content).toContain('Architecture Diagram Reference');
        expect(content).toContain('```mermaid');
        expect(content).toContain('Context Bundle');
        expect(content).toContain('Contract Pack');
        expect(content).toContain('Reuse-Before-Create');
        expect(content).toContain('workspace assumptions');
        expect(content).toContain('Permissions and workspace boundaries');
        expect(content).not.toContain('tenant assumptions');
        expect(content).not.toContain('tenant boundary');
        expect(content).toContain('Audit History');
        expect(content).toContain('Red/Green Validation Loop');
        expect(content).toContain('Success Metrics');

        if (persona === 'ciso') {
          expect(content).toContain(
            'Identity, workspace boundary, data protection, control evidence, and residual risk.'
          );
          expect(content).toContain('Workspace["Workspace boundary"]');
          expect(content).toContain('Actors, permissions, workspace boundary');
        }
      }
    } finally {
      fs.rmSync(fixturesDir, { recursive: true, force: true });
    }
  });
});
