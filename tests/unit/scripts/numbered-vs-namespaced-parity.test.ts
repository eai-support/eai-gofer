import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import {
  CONTROL_COMMANDS as EXPECTED_CONTROL_COMMANDS,
  CONTROL_COMMAND_COUNT,
} from '../../helpers/goferCommandSet';

const COMMANDS_DIR = path.resolve(__dirname, '../../../.specify/commands');

const parseModuleUrl = new URL(
  '../../../.specify/scripts/node/parse-stage-command.mjs',
  import.meta.url
);

interface ParseResult {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * The 15 pipeline stage files (canonical numbered/named identifier -> expected alias).
 *
 * Both the numbered name and the `gofer:*` alias resolve to the same
 * source-of-truth file, so byte-equivalence is trivially the same file.
 * We verify by reading once and asserting the frontmatter exposes both forms.
 *
 * Pipeline stages: filename and `name` field match (e.g. `3_gofer_plan`).
 *
 * Frontmatter `category` is either 'pipeline' (core auto-chained phases)
 * or 'utility' (interactive stages and orchestration tools). Both kinds
 * are part of the 15-stage pipeline lineup; only `control` commands are
 * outside it.
 */
const PIPELINE_STAGES: Array<{ file: string; name: string; alias: string; category: string }> = [
  {
    file: '0_gofer_start.md',
    name: '0_gofer_start',
    alias: 'gofer:start',
    category: 'pipeline',
  },
  {
    file: '0a_problem_validation.md',
    name: '0a_problem_validation',
    alias: 'gofer:validate-problem',
    category: 'pipeline',
  },
  {
    file: '1_gofer_research.md',
    name: '1_gofer_research',
    alias: 'gofer:research',
    category: 'pipeline',
  },
  {
    file: '2_gofer_specify.md',
    name: '2_gofer_specify',
    alias: 'gofer:specify',
    category: 'pipeline',
  },
  {
    file: '3_gofer_plan.md',
    name: '3_gofer_plan',
    alias: 'gofer:plan-stage',
    category: 'pipeline',
  },
  { file: '4_gofer_tasks.md', name: '4_gofer_tasks', alias: 'gofer:tasks', category: 'pipeline' },
  {
    file: '5_gofer_implement.md',
    name: '5_gofer_implement',
    alias: 'gofer:implement',
    category: 'pipeline',
  },
  {
    file: '6_gofer_validate.md',
    name: '6_gofer_validate',
    alias: 'gofer:validate',
    category: 'pipeline',
  },
  { file: '7_gofer_save.md', name: '7_gofer_save', alias: 'gofer:save', category: 'utility' },
  {
    file: '7a_stakeholder_comms.md',
    name: '7a_stakeholder_comms',
    alias: 'gofer:comms',
    category: 'utility',
  },
  {
    file: '8_gofer_branding.md',
    name: '8_gofer_branding',
    alias: 'gofer:branding',
    category: 'utility',
  },
  { file: '9_gofer_tests.md', name: '9_gofer_tests', alias: 'gofer:tests', category: 'utility' },
  { file: '10_gofer_cloud.md', name: '10_gofer_cloud', alias: 'gofer:cloud', category: 'utility' },
  {
    file: 'gofer_constitution.md',
    name: 'gofer_constitution',
    alias: 'gofer:constitution',
    category: 'utility',
  },
  { file: 'gofer_hydrate.md', name: 'gofer_hydrate', alias: 'gofer:hydrate', category: 'utility' },
];

/**
 * The 3 control commands. Filename uses underscore (`gofer_plan.md`),
 * but the canonical `name` is the namespaced form (`gofer:plan`). The
 * file IS the canonical surface; there is no separate aliases array
 * required for control commands (parity is namespaced-only).
 */
const PIPELINE_STAGE_COUNT = 15;

describe('numbered vs namespaced stage parity', () => {
  let parseStageCommand: (filePath: string) => Promise<ParseResult>;

  beforeAll(async () => {
    const mod = await import(parseModuleUrl.href);
    parseStageCommand = mod.parseStageCommand;
  });

  it(`has exactly ${PIPELINE_STAGE_COUNT} pipeline stages in the parity matrix`, () => {
    expect(PIPELINE_STAGES.length).toBe(PIPELINE_STAGE_COUNT);
  });

  it(`has exactly ${CONTROL_COMMAND_COUNT} control commands in the parity matrix`, () => {
    expect(EXPECTED_CONTROL_COMMANDS.length).toBe(CONTROL_COMMAND_COUNT);
  });

  for (const stage of PIPELINE_STAGES) {
    it(`${stage.name} resolves to canonical name '${stage.name}' with alias '${stage.alias}'`, async () => {
      const filePath = path.join(COMMANDS_DIR, stage.file);
      const { frontmatter, body } = await parseStageCommand(filePath);

      // Canonical name match
      expect(frontmatter.name).toBe(stage.name);

      // Category check: pipeline stages
      expect(frontmatter.category).toBe(stage.category);

      // Aliases include the namespaced form
      expect(Array.isArray(frontmatter.aliases)).toBe(true);
      expect(frontmatter.aliases as string[]).toContain(stage.alias);

      // Body is non-empty (parity is meaningless if there's no content to compare)
      expect(typeof body).toBe('string');
      expect(body.trim().length).toBeGreaterThan(0);
    });
  }

  for (const ctrl of EXPECTED_CONTROL_COMMANDS) {
    it(`${ctrl.file}.md is a control command with namespaced name '${ctrl.name}'`, async () => {
      const filePath = path.join(COMMANDS_DIR, `${ctrl.file}.md`);
      const { frontmatter, body } = await parseStageCommand(filePath);

      // Control commands declare the namespaced form as canonical name.
      expect(frontmatter.name).toBe(ctrl.name);
      expect(frontmatter.category).toBe('control');

      // Body is non-empty.
      expect(typeof body).toBe('string');
      expect(body.trim().length).toBeGreaterThan(0);
    });
  }

  it('builds a real name-and-alias index that resolves numbered and namespaced ids to the same file', async () => {
    const index = new Map<string, string>();

    for (const stage of PIPELINE_STAGES) {
      const filePath = path.join(COMMANDS_DIR, stage.file);
      const { frontmatter } = await parseStageCommand(filePath);
      const ids = [
        String(frontmatter.name),
        ...((Array.isArray(frontmatter.aliases) ? frontmatter.aliases : []) as string[]),
      ];

      ids.forEach((id) => index.set(id, filePath));
    }

    for (const ctrl of EXPECTED_CONTROL_COMMANDS) {
      const filePath = path.join(COMMANDS_DIR, `${ctrl.file}.md`);
      const { frontmatter } = await parseStageCommand(filePath);
      const ids = [
        String(frontmatter.name),
        ...((Array.isArray(frontmatter.aliases) ? frontmatter.aliases : []) as string[]),
      ];

      ids.forEach((id) => index.set(id, filePath));
    }

    for (const stage of PIPELINE_STAGES) {
      const expectedPath = path.join(COMMANDS_DIR, stage.file);
      expect(index.get(stage.name)).toBe(expectedPath);
      expect(index.get(stage.alias)).toBe(expectedPath);
    }

    for (const ctrl of EXPECTED_CONTROL_COMMANDS) {
      const expectedPath = path.join(COMMANDS_DIR, `${ctrl.file}.md`);
      expect(index.get(ctrl.name)).toBe(expectedPath);
    }
  });
});
