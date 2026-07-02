import { describe, it, expect, beforeAll } from 'vitest';

const moduleUrl = new URL('../../../.specify/scripts/node/generate-commands.mjs', import.meta.url);

describe('shouldExclude', () => {
  let shouldExclude: (stageName: string, surface: string) => boolean;
  let CLAUDE_ONLY_STAGES: string[];

  beforeAll(async () => {
    const mod = await import(moduleUrl.href);
    shouldExclude = mod.shouldExclude;
    CLAUDE_ONLY_STAGES = mod.CLAUDE_ONLY_STAGES;
  });

  it('keeps the legacy exclusion list empty', () => {
    expect(CLAUDE_ONLY_STAGES).toEqual([]);
  });

  it.each([
    ['0_gofer_start', 'codex'],
    ['gofer_constitution', 'gemini'],
    ['gofer_hydrate', 'codex'],
    ['7_gofer_save', 'copilot'],
    ['8_gofer_branding', 'github-prompts'],
    ['1_gofer_research', 'gemini'],
    ['6_gofer_validate', 'agents-skills'],
  ])('does not exclude %s from %s', (stageName, surface) => {
    expect(shouldExclude(stageName, surface)).toBe(false);
  });
});
