import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

interface StageSeamContract {
  stageName: string;
  selectorPhrases: readonly string[];
  helperNames: readonly string[];
  artifactPaths: readonly string[];
  missingInputPhrases: readonly string[];
}

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

const STAGE_LOCAL_SEAMS: readonly StageSeamContract[] = [
  {
    stageName: '1_gofer_research',
    selectorPhrases: ['`vocabulary` selector', '`zoom-out` selector'],
    helperNames: ['gofer:vocabulary', 'gofer:zoom-out'],
    artifactPaths: [
      '.specify/specs/{feature}/glossary.md',
      '.specify/specs/{feature}/zoom-out-report.md',
    ],
    missingInputPhrases: [
      'If `research.md` is missing, continue the stage normally',
      'helper was not run.',
    ],
  },
  {
    stageName: '2_gofer_specify',
    selectorPhrases: ['`vocabulary` selector', '`spec-summary` selector'],
    helperNames: ['gofer:vocabulary', 'gofer:spec-summary'],
    artifactPaths: [
      '.specify/specs/{feature}/glossary.md',
      '.specify/specs/{feature}/spec-summary.md',
    ],
    missingInputPhrases: [
      'If `spec.md` is missing, continue the stage normally',
      'helper was not run.',
    ],
  },
  {
    stageName: '5_gofer_implement',
    selectorPhrases: ['`tdd-assist`', '`diagnose`'],
    helperNames: ['gofer:tdd', 'gofer:diagnose'],
    artifactPaths: [
      '.specify/specs/{feature}/tdd-session.md',
      '.specify/specs/{feature}/diagnose-report.md',
    ],
    missingInputPhrases: [
      'If the required inputs are missing, continue the stage normally',
      'helper was not run.',
    ],
  },
];

describe('stage-local helper seams', () => {
  for (const stage of STAGE_LOCAL_SEAMS) {
    it(`${stage.stageName} keeps optional helper seam contract across emitted surfaces`, (): void => {
      const sourceRelativePath = `.specify/commands/${stage.stageName}.md`;
      const sourceContent = readFile(sourceRelativePath);

      expect(sourceContent).toContain('## Optional Helpers');
      expect(sourceContent).toContain('do not change stage progress');
      expect(sourceContent).toContain('pipeline state');
      stage.selectorPhrases.forEach((phrase) => {
        expect(sourceContent).toContain(phrase);
      });
      stage.helperNames.forEach((helperName) => {
        expect(sourceContent).toContain(helperName);
      });
      stage.artifactPaths.forEach((artifactPath) => {
        expect(sourceContent).toContain(artifactPath);
      });
      stage.missingInputPhrases.forEach((phrase) => {
        expect(sourceContent).toContain(phrase);
      });

      const publicWrapper = readFile('.claude/commands/gofer.md');
      expect(publicWrapper).toContain(`\`${stage.stageName}\``);
      expect(fs.existsSync(path.join(REPO_ROOT, `.claude/commands/${stage.stageName}.md`))).toBe(
        false
      );
      expect(
        fs.existsSync(path.join(REPO_ROOT, `.gemini/commands/gofer/${stage.stageName}.toml`))
      ).toBe(false);
    });
  }
});
