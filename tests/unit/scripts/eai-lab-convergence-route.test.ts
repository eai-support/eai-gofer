import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const PUBLIC_SURFACES = [
  '.agents/skills/eai/SKILL.md',
  '.claude/commands/eai.md',
  '.claude/skills/eai/SKILL.md',
  '.gemini/commands/gofer/eai.md',
  '.github/prompts/eai.prompt.md',
  '.github/skills/eai/SKILL.md',
  '.grok/skills/eai/SKILL.md',
  '.system/skills/eai/SKILL.md',
  'extension/resources/claude-commands/eai.md',
  'extension/resources/claude-skills/eai/SKILL.md',
  'extension/resources/copilot-prompts/eai.prompt.md',
  'extension/resources/gemini/commands/gofer/eai.md',
  'extension/resources/github-skills/eai/SKILL.md',
  'extension/resources/grok-skills/eai/SKILL.md',
  'plugin-skills/eai/SKILL.md',
  'plugins/eai-gofer/.claude/skills/eai/SKILL.md',
  'plugins/eai-gofer/.gemini/commands/gofer/eai.md',
  'plugins/eai-gofer/.github/prompts/eai.prompt.md',
  'plugins/eai-gofer/.github/skills/eai/SKILL.md',
  'plugins/eai-gofer/commands/eai.md',
  'plugins/eai-gofer/plugin-skills/eai/SKILL.md',
  'plugins/eai-gofer/plugins/eai-gofer/.claude/skills/eai/SKILL.md',
  'plugins/eai-gofer/plugins/eai-gofer/.gemini/commands/gofer/eai.md',
  'plugins/eai-gofer/plugins/eai-gofer/.github/prompts/eai.prompt.md',
  'plugins/eai-gofer/plugins/eai-gofer/.github/skills/eai/SKILL.md',
  'plugins/eai-gofer/plugins/eai-gofer/commands/eai.md',
  'plugins/eai-gofer/plugins/eai-gofer/plugin-skills/eai/SKILL.md',
  'plugins/eai-gofer/plugins/eai-gofer/skills/eai/SKILL.md',
  'plugins/eai-gofer/skills/eai/SKILL.md',
  'skills/eai/SKILL.md',
];

describe('public /eai EAI Lab convergence route', () => {
  for (const relativePath of PUBLIC_SURFACES) {
    it(`keeps the complete controller contract on ${relativePath}`, () => {
      const content = readFileSync(join(ROOT, relativePath), 'utf8');

      expect(content).toContain('## EAI Lab Convergence Route');
      expect(content).toContain('./gas lab-test <issue-number> --robot');
      expect(content).toContain('user-level `EAI_LAB_TRUSTED_CONTROLLER_REPOS` allowlist');
      expect(content).toContain('Never source either value from repository files');
      expect(content).toContain('reject every other origin');
      expect(content).not.toContain('authenticated GitHub code search');
      expect(content).toContain('complete unchanged eai-testing-dev regression suite');
      expect(content).toContain('eai-testing-dev checkout is immutable evidence');
      expect(content).toContain('Orange means every test ran but the request is not fully passed');
      expect(content).toContain(
        'Do not merge, deploy, promote, weaken tests, or suppress failures'
      );
    });
  }
});
