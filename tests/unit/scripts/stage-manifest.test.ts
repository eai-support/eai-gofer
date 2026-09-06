/**
 * T061 — Stage manifest test.
 *
 * Verifies the .specify/commands/ directory:
 * 1. Contains the full command set (excluding .gitkeep) — 16 pipeline/utility
 *    stages plus 8 control/helper commands.
 * 2. Each file has valid YAML frontmatter (parseable by parseStageCommand)
 * 3. Each frontmatter has: name, description, title, category, surfaces (all required)
 * 4. Each description is ≤ 140 chars
 * 5. The `name` field matches the filename (without .md), except for control
 *    commands which use the `gofer:<slug>` namespaced form. For control
 *    commands the filename is `gofer_<slug>` and the `name` is `gofer:<slug>`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  CONTROL_COMMANDS,
  CONTROL_COMMAND_COUNT,
  FULL_COMMAND_COUNT,
  PIPELINE_STAGE_COUNT,
  PIPELINE_STAGE_FILES,
} from '../../helpers/goferCommandSet';

const parseStageCommandUrl = new URL(
  '../../../.specify/scripts/node/parse-stage-command.mjs',
  import.meta.url
);

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const SPECIFY_COMMANDS_DIR = path.join(PROJECT_ROOT, '.specify', 'commands');

const REQUIRED_FRONTMATTER_FIELDS = [
  'name',
  'description',
  'title',
  'category',
  'surfaces',
] as const;

const EXPECTED_PIPELINE_STAGES = [...PIPELINE_STAGE_FILES];
const EXPECTED_CONTROL_COMMANDS = [...CONTROL_COMMANDS];

const EXPECTED_STAGES = [
  ...EXPECTED_PIPELINE_STAGES,
  ...EXPECTED_CONTROL_COMMANDS.map((c) => c.file),
] as const;

interface ParsedStage {
  fileName: string;
  stageName: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

describe('stage-manifest (T061)', () => {
  let stages: ParsedStage[];
  let mdFiles: string[];

  beforeAll(async () => {
    const { parseStageCommand } = (await import(parseStageCommandUrl.href)) as {
      parseStageCommand: (filePath: string) => Promise<{
        frontmatter: Record<string, unknown>;
        body: string;
      }>;
    };

    const entries = await fs.readdir(SPECIFY_COMMANDS_DIR);
    mdFiles = entries.filter((e) => e.endsWith('.md') && e !== '.gitkeep').sort();

    stages = [];
    for (const fileName of mdFiles) {
      const filePath = path.join(SPECIFY_COMMANDS_DIR, fileName);
      const parsed = await parseStageCommand(filePath);
      stages.push({
        fileName,
        stageName: fileName.replace(/\.md$/, ''),
        frontmatter: parsed.frontmatter,
        body: parsed.body,
      });
    }
  });

  // -------------------------------------------------------------------------
  // File count
  // -------------------------------------------------------------------------

  it(`contains exactly ${FULL_COMMAND_COUNT} .md files (excluding .gitkeep)`, () => {
    expect(mdFiles).toHaveLength(FULL_COMMAND_COUNT);
  });

  it(`contains exactly ${PIPELINE_STAGE_COUNT} pipeline-or-utility stage files (the 16 pipeline stages)`, () => {
    const pipelineStages = stages.filter(
      (s) => s.frontmatter.category === 'pipeline' || s.frontmatter.category === 'utility'
    );
    expect(pipelineStages).toHaveLength(PIPELINE_STAGE_COUNT);
  });

  it(`contains exactly ${CONTROL_COMMAND_COUNT} control-category command files`, () => {
    const controlCommands = stages.filter((s) => s.frontmatter.category === 'control');
    expect(controlCommands).toHaveLength(CONTROL_COMMAND_COUNT);
  });

  it(`contains all ${FULL_COMMAND_COUNT} expected stage and control files`, () => {
    const foundNames = mdFiles.map((f) => f.replace(/\.md$/, ''));
    for (const expected of EXPECTED_STAGES) {
      expect(foundNames, `Missing .specify/commands/${expected}.md`).toContain(expected);
    }
  });

  // -------------------------------------------------------------------------
  // Parseable frontmatter
  // -------------------------------------------------------------------------

  it(`all ${FULL_COMMAND_COUNT} stage files parse without error`, () => {
    expect(stages).toHaveLength(FULL_COMMAND_COUNT);
  });

  // -------------------------------------------------------------------------
  // Required frontmatter fields
  // -------------------------------------------------------------------------

  describe('required frontmatter fields', () => {
    for (const field of REQUIRED_FRONTMATTER_FIELDS) {
      it(`all stages have '${field}' field`, () => {
        for (const stage of stages) {
          expect(
            stage.frontmatter[field],
            `Stage '${stage.stageName}' is missing frontmatter field '${field}'`
          ).toBeTruthy();
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // Per-stage frontmatter validation (dynamic tests over known stage names)
  // -------------------------------------------------------------------------

  /**
   * Returns the expected `name` value for a given stage filename.
   * For pipeline stages, name === filename. For control commands the
   * filename `gofer_<slug>` maps to namespaced name `gofer:<slug>`.
   */
  function expectedNameFor(stageFile: string): string {
    const ctrl = EXPECTED_CONTROL_COMMANDS.find((c) => c.file === stageFile);
    if (ctrl) return ctrl.name;
    return stageFile;
  }

  describe('per-stage frontmatter validation', () => {
    for (const expectedStage of EXPECTED_STAGES) {
      describe(`stage: ${expectedStage}`, () => {
        it('has valid frontmatter with all required fields', () => {
          const stage = stages.find((s) => s.stageName === expectedStage);
          expect(stage, `Stage '${expectedStage}' not loaded`).toBeDefined();
          if (!stage) return;

          for (const field of REQUIRED_FRONTMATTER_FIELDS) {
            expect(
              stage.frontmatter[field],
              `'${expectedStage}' missing field '${field}'`
            ).toBeTruthy();
          }
        });

        it('name field matches filename (or namespaced for control commands)', () => {
          const stage = stages.find((s) => s.stageName === expectedStage);
          if (!stage) return;
          expect(stage.frontmatter.name).toBe(expectedNameFor(expectedStage));
        });

        it('description is ≤ 140 chars', () => {
          const stage = stages.find((s) => s.stageName === expectedStage);
          if (!stage) return;
          const desc = stage.frontmatter.description as string;
          expect(
            desc.length,
            `Stage '${expectedStage}' description is ${desc.length} chars (max 140): "${desc}"`
          ).toBeLessThanOrEqual(140);
        });

        it('surfaces is a non-empty array', () => {
          const stage = stages.find((s) => s.stageName === expectedStage);
          if (!stage) return;
          expect(Array.isArray(stage.frontmatter.surfaces)).toBe(true);
          expect((stage.frontmatter.surfaces as unknown[]).length).toBeGreaterThan(0);
        });

        it('category is a valid value', () => {
          const stage = stages.find((s) => s.stageName === expectedStage);
          if (!stage) return;
          const validCategories = ['pipeline', 'utility', 'diagnostic', 'control'];
          expect(
            validCategories,
            `Stage '${expectedStage}' has invalid category: '${stage.frontmatter.category}'`
          ).toContain(stage.frontmatter.category);
        });
      });
    }
  });

  // -------------------------------------------------------------------------
  // Name–filename alignment
  // -------------------------------------------------------------------------

  it('name field in every frontmatter matches its filename (or namespaced control name)', () => {
    for (const stage of stages) {
      const expected = expectedNameFor(stage.stageName);
      expect(
        stage.frontmatter.name,
        `Stage file '${stage.fileName}' has name='${stage.frontmatter.name}' but expected '${expected}'`
      ).toBe(expected);
    }
  });

  // -------------------------------------------------------------------------
  // Surfaces contain only valid values
  // -------------------------------------------------------------------------

  it('all surfaces values are from the allowed set', () => {
    const validSurfaces = new Set([
      'claude',
      'claude-mirror',
      'copilot',
      'vscode',
      'codex',
      'antigravity',
      'github-prompts',
      'agents-skills',
      'system-skills',
    ]);

    for (const stage of stages) {
      const surfaces = stage.frontmatter.surfaces as string[];
      for (const surface of surfaces) {
        expect(
          validSurfaces.has(surface),
          `Stage '${stage.stageName}' has invalid surface: '${surface}'`
        ).toBe(true);
      }
    }
  });

  // -------------------------------------------------------------------------
  // All descriptions within byte budget
  // -------------------------------------------------------------------------

  it('all descriptions are ≤ 140 UTF-8 bytes', () => {
    for (const stage of stages) {
      const desc = stage.frontmatter.description as string;
      const bytes = Buffer.byteLength(desc, 'utf8');
      expect(
        bytes,
        `Stage '${stage.stageName}' description is ${bytes} bytes (max 140)`
      ).toBeLessThanOrEqual(140);
    }
  });
});
