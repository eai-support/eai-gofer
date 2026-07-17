import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { existsSync } from 'fs';
import {
  CONTROL_COMMANDS,
  CROSS_CLI_SURFACES,
  getGeneratedCommandFileStem,
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

describe('control commands — surfaces and category', () => {
  let parseStageCommand: (filePath: string) => Promise<ParseResult>;

  beforeAll(async () => {
    const mod = await import(parseModuleUrl.href);
    parseStageCommand = mod.parseStageCommand;
  });

  it('all control and helper command files exist on disk', () => {
    for (const { file } of CONTROL_COMMANDS) {
      const fileName = `${file}.md`;
      const filePath = path.join(COMMANDS_DIR, fileName);
      expect(existsSync(filePath), `${fileName} should exist`).toBe(true);
    }
  });

  for (const { file } of CONTROL_COMMANDS) {
    const fileName = `${file}.md`;

    describe(fileName, () => {
      it('has all cross-CLI surfaces', async () => {
        const filePath = path.join(COMMANDS_DIR, fileName);
        const { frontmatter } = await parseStageCommand(filePath);

        const surfaces = frontmatter.surfaces as string[];
        expect(Array.isArray(surfaces)).toBe(true);

        // Same set, no extras, no missing
        const sortedActual = [...surfaces].sort();
        const sortedExpected = [...CROSS_CLI_SURFACES].sort();
        expect(sortedActual).toEqual(sortedExpected);

        expect(surfaces.length).toBe(CROSS_CLI_SURFACES.length);
      });

      it('has category=control', async () => {
        const filePath = path.join(COMMANDS_DIR, fileName);
        const { frontmatter } = await parseStageCommand(filePath);
        expect(frontmatter.category).toBe('control');
      });

      it('keeps filesystem-safe names but hides generated public surfaces', () => {
        const command = CONTROL_COMMANDS.find((entry) => entry.file === file)!;
        const generatedStem = getGeneratedCommandFileStem(command.name);

        expect(
          existsSync(path.resolve(__dirname, `../../../.claude/commands/${generatedStem}.md`))
        ).toBe(false);
        expect(
          existsSync(path.resolve(__dirname, `../../../.github/prompts/${generatedStem}.prompt.md`))
        ).toBe(false);
        expect(
          existsSync(
            path.resolve(__dirname, `../../../.gemini/commands/gofer/${generatedStem}.toml`)
          )
        ).toBe(false);
        expect(
          existsSync(path.resolve(__dirname, `../../../.agents/skills/${generatedStem}/SKILL.md`))
        ).toBe(false);
        expect(
          existsSync(path.resolve(__dirname, `../../../.system/skills/${generatedStem}/SKILL.md`))
        ).toBe(false);

        expect(
          existsSync(path.resolve(__dirname, `../../../.claude/commands/${command.name}.md`))
        ).toBe(false);
        expect(
          existsSync(path.resolve(__dirname, `../../../.github/prompts/${command.name}.prompt.md`))
        ).toBe(false);
        expect(
          existsSync(
            path.resolve(__dirname, `../../../.gemini/commands/gofer/${command.name}.toml`)
          )
        ).toBe(false);
      });
    });
  }
});
