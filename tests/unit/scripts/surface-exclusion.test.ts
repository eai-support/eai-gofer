import { describe, it, expect, beforeAll } from 'vitest';
import { FULL_COMMAND_NAMES } from '../../helpers/goferCommandSet';

const generateCommandsUrl = new URL(
  '../../../.specify/scripts/node/generate-commands.mjs',
  import.meta.url
);

const ALL_SURFACES = [
  'claude',
  'claude-mirror',
  'copilot',
  'codex',
  'antigravity',
  'github-prompts',
  'agents-skills',
  'system-skills',
  'agents-md',
  'codex-config',
  'unknown-surface',
] as const;

describe('surface-exclusion parity', () => {
  let shouldExclude: (stageName: string, surface: string) => boolean;
  let CLAUDE_ONLY_STAGES: string[];

  beforeAll(async () => {
    const mod = await import(generateCommandsUrl.href);
    shouldExclude = mod.shouldExclude;
    CLAUDE_ONLY_STAGES = mod.CLAUDE_ONLY_STAGES;
  });

  it('has no Claude-only exclusions', () => {
    expect(CLAUDE_ONLY_STAGES).toEqual([]);
  });

  it('does not exclude any Gofer stage from any surface', () => {
    for (const stage of FULL_COMMAND_NAMES) {
      for (const surface of ALL_SURFACES) {
        expect(shouldExclude(stage, surface), `${stage} on ${surface}`).toBe(false);
      }
    }
  });

  it('never excludes unknown or empty stage names', () => {
    for (const surface of ALL_SURFACES) {
      expect(shouldExclude('unknown_stage', surface)).toBe(false);
      expect(shouldExclude('', surface)).toBe(false);
    }
  });
});
