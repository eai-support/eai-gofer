import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import { CommandMetadataExtractor } from '../../../extension/src/council/CommandMetadataExtractor';

vi.mock('fs', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('fs');
  return {
    ...actual,
    promises: {
      readFile: vi.fn(),
    },
    readFileSync: vi.fn(),
  };
});

describe('CommandMetadataExtractor', () => {
  let extractor: CommandMetadataExtractor;

  beforeEach(() => {
    vi.clearAllMocks();
    extractor = new CommandMetadataExtractor();
  });

  it.each(['/repo/.agents/skills/eai/SKILL.md', 'C:\\repo\\.agents\\skills\\eai\\SKILL.md'])(
    'derives Antigravity skill names from %s',
    async (filePath) => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('# EAI\n\nContinue the current task.');
      const metadata = await extractor.extractFromAntigravitySkill(filePath, 'antigravity');
      expect(metadata.name).toBe('eai');
      expect(metadata.platform).toBe('antigravity');
    }
  );

  describe('extractFromClaudeCommand', () => {
    it('extracts metadata from valid Claude command (async)', async () => {
      const content = `---
description: Run research stage
---

# Gofer Research

This command includes AUTO-CHAIN and Task tool references.
Task: subagent_type="research"
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(content as never);

      const metadata = await extractor.extractFromClaudeCommand(
        '/repo/.claude/commands/1_gofer_research.md'
      );

      expect(metadata.name).toBe('1_gofer_research');
      expect(metadata.description).toBe('Run research stage');
      expect(metadata.platform).toBe('claude');
      expect(metadata.supportsAutoChain).toBe(true);
      expect(metadata.supportsParallelAgents).toBe(true);
      expect(metadata.invocationSyntax.prefix).toBe('/');
    });

    it('falls back to body-derived description when frontmatter missing', () => {
      const content = `# Fallback Title\n\nBody text`;
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const metadata = extractor.extractFromClaudeCommandSync(
        '/repo/.claude/commands/2_gofer_specify.md'
      );

      expect(metadata.description).toBe('Fallback Title');
      expect(metadata.name).toBe('2_gofer_specify');
      expect(metadata.platform).toBe('claude');
    });

    it('derives command names from Windows paths when frontmatter is missing', () => {
      const content = `# Windows Path Title\n\nBody text`;
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const metadata = extractor.extractFromClaudeCommandSync(
        'C:\\repo\\.claude\\commands\\1_gofer_research.md'
      );

      expect(metadata.name).toBe('1_gofer_research');
      expect(metadata.description).toBe('Windows Path Title');
    });
  });

  describe('extractFromCopilotPrompt', () => {
    it('extracts metadata from valid Copilot prompt (sync)', () => {
      const content = `---
description: Plan stage prompt
---

Body with Next Command: #4_gofer_tasks
@agent spawn
`;
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const metadata = extractor.extractFromCopilotPromptSync(
        '/repo/.github/prompts/3_gofer_plan.prompt.md'
      );

      expect(metadata.name).toBe('3_gofer_plan');
      expect(metadata.description).toBe('Plan stage prompt');
      expect(metadata.platform).toBe('copilot');
      expect(metadata.supportsAutoChain).toBe(true);
      expect(metadata.supportsParallelAgents).toBe(true);
      expect(metadata.invocationSyntax.prefix).toBe('#');
    });
  });

  describe('extractFromCodexSkill', () => {
    it('extracts metadata from valid Codex skill', async () => {
      const content = `---
name: 4_gofer_tasks
description: Tasks stage skill
---

To continue the pipeline:
Run: /5_gofer_implement
Use separate Codex CLI sessions for parallel perspectives.
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(content as never);

      const metadata = await extractor.extractFromCodexSkill(
        '/repo/.system/skills/4_gofer_tasks/SKILL.md'
      );

      expect(metadata.name).toBe('4_gofer_tasks');
      expect(metadata.description).toBe('Tasks stage skill');
      expect(metadata.platform).toBe('codex');
      expect(metadata.supportsAutoChain).toBe(true);
      expect(metadata.supportsParallelAgents).toBe(true);
      expect(metadata.invocationSyntax.prefix).toBe('/');
    });

    it('normalizes gofer-prefixed Codex skill names back to command ids', async () => {
      const content = `---
name: gofer/gofer:diagnose
description: Diagnose helper
---

Run: /gofer:diagnose
`;
      vi.mocked(fs.promises.readFile).mockResolvedValue(content as never);

      const metadata = await extractor.extractFromCodexSkill(
        '/repo/.system/skills/gofer/gofer_diagnose/SKILL.md'
      );

      expect(metadata.name).toBe('gofer:diagnose');
      expect(metadata.invocationSyntax.example).toBe('/gofer:diagnose');
    });

    it('handles missing frontmatter name safely', () => {
      const content = `No frontmatter\n\nRun: /next`;
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const metadata = extractor.extractFromCodexSkillSync('/repo/.system/skills/x/SKILL.md');
      expect(metadata.name).toBe('unknown');
      expect(metadata.description).toBe('unknown');
      expect(metadata.platform).toBe('codex');
    });
  });

  describe('frontmatter parsing and error handling', () => {
    it('falls back gracefully on malformed YAML', () => {
      const malformed = `---
description: [unterminated
---

# Body Title
`;
      vi.mocked(fs.readFileSync).mockReturnValue(malformed);

      const metadata = extractor.extractFromClaudeCommandSync(
        '/repo/.claude/commands/0_gofer_start.md'
      );
      expect(metadata.description).toBe('Body Title');
      expect(metadata.platform).toBe('claude');
    });
  });

  describe('validateInvocationSyntax', () => {
    it('validates claude syntax', () => {
      expect(extractor.validateInvocationSyntax('/1_gofer_research', 'claude')).toBe(true);
      expect(extractor.validateInvocationSyntax('#1_gofer_research', 'claude')).toBe(false);
    });

    it('validates copilot syntax', () => {
      expect(extractor.validateInvocationSyntax('#1_gofer_research', 'copilot')).toBe(true);
      expect(extractor.validateInvocationSyntax('/1_gofer_research', 'copilot')).toBe(false);
    });

    it('validates codex syntax', () => {
      expect(extractor.validateInvocationSyntax('/1_gofer_research', 'codex')).toBe(true);
      expect(extractor.validateInvocationSyntax('$ $1_gofer_research', 'codex')).toBe(false);
      expect(extractor.validateInvocationSyntax('$ $ 1_gofer_research', 'codex')).toBe(false);
    });

    it('rejects retired Gemini metadata before reading legacy files', async () => {
      const content = `---
name: gofer:diagnose
description: Diagnose helper
---

Body`;
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      vi.mocked(fs.readFileSync).mockClear();
      expect(() =>
        extractor.extractFromGeminiCommandSync('/repo/.gemini/commands/gofer/gofer_diagnose.toml')
      ).toThrow('Gemini CLI is retired');
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });
});
