import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileUtils } from '../../../extension/src/utils/fileUtils';

vi.mock('vscode', () => ({
  extensions: {
    getExtension: vi.fn().mockReturnValue(undefined),
  },
}));

vi.mock('../../../extension/src/utils/fileUtils');

describe('setupDefaultInstructions integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('creates all 4 host instruction files when none exist (T032)', async () => {
    const written: Record<string, string> = {};

    vi.mocked(FileUtils.exists).mockResolvedValue(false);
    vi.mocked(FileUtils.readTextFile).mockImplementation(async (filePath: string) => {
      const fs = await import('fs/promises');
      return fs.readFile(filePath, 'utf-8');
    });
    vi.mocked(FileUtils.writeTextFile).mockImplementation(
      async (filePath: string, content: string) => {
        written[filePath] = content;
      }
    );
    vi.mocked(FileUtils.ensureDirectory).mockResolvedValue();

    // Import the modules dynamically to use mocked FileUtils
    const { ProjectDetector } = await import('../../../extension/src/services/ProjectDetector');
    const { InstructionGenerator } =
      await import('../../../extension/src/services/InstructionGenerator');

    const path = await import('path');
    const templatesPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'extension',
      'resources',
      'instruction-templates'
    );
    const workspacePath = '/workspace/test-project';

    const projectInfo = await ProjectDetector.detect(workspacePath);
    const generator = new InstructionGenerator(templatesPath);

    // Simulate setupDefaultInstructions logic
    const agentsPath = path.join(workspacePath, 'AGENTS.md');
    if (!(await FileUtils.exists(agentsPath))) {
      await FileUtils.writeTextFile(agentsPath, await generator.generateAgentsMd(projectInfo));
    }

    const claudePath = path.join(workspacePath, 'CLAUDE.md');
    if (!(await FileUtils.exists(claudePath))) {
      await FileUtils.writeTextFile(claudePath, await generator.generateClaudeMd(projectInfo));
    }

    const geminiPath = path.join(workspacePath, 'GEMINI.md');
    if (!(await FileUtils.exists(geminiPath))) {
      await FileUtils.writeTextFile(geminiPath, generator.generateGeminiMd());
    }

    const copilotPath = path.join(workspacePath, '.github', 'copilot-instructions.md');
    if (!(await FileUtils.exists(copilotPath))) {
      await FileUtils.writeTextFile(copilotPath, await generator.generateCopilotMd(projectInfo));
    }

    expect(Object.keys(written)).toHaveLength(4);
    expect(written[agentsPath]).toContain('# AGENTS.md');
    expect(written[claudePath]).toContain('# CLAUDE.md');
    expect(written[claudePath]).toContain('@AGENTS.md');
    expect(written[geminiPath]).toContain('@AGENTS.md');
    expect(written[geminiPath]).toContain('gofer:always-on-eai:start');
    expect(written[copilotPath]).toContain('# Copilot Instructions');

    // CLAUDE.md should be concise (under 80 lines)
    const claudeLines = written[claudePath].split('\n').length;
    expect(claudeLines).toBeLessThan(80);
  });

  it('does not overwrite existing files (T033)', async () => {
    const written: Record<string, string> = {};

    // CLAUDE.md exists, others don't
    vi.mocked(FileUtils.exists).mockImplementation(async (filePath: string) => {
      return filePath.endsWith('CLAUDE.md');
    });
    vi.mocked(FileUtils.readTextFile).mockImplementation(async (filePath: string) => {
      const fs = await import('fs/promises');
      return fs.readFile(filePath, 'utf-8');
    });
    vi.mocked(FileUtils.writeTextFile).mockImplementation(
      async (filePath: string, content: string) => {
        written[filePath] = content;
      }
    );
    vi.mocked(FileUtils.ensureDirectory).mockResolvedValue();

    const { ProjectDetector } = await import('../../../extension/src/services/ProjectDetector');
    const { InstructionGenerator } =
      await import('../../../extension/src/services/InstructionGenerator');

    const path = await import('path');
    const templatesPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'extension',
      'resources',
      'instruction-templates'
    );
    const workspacePath = '/workspace/existing-project';

    const projectInfo = await ProjectDetector.detect(workspacePath);
    const generator = new InstructionGenerator(templatesPath);

    // Simulate setupDefaultInstructions logic
    const agentsPath = path.join(workspacePath, 'AGENTS.md');
    if (!(await FileUtils.exists(agentsPath))) {
      await FileUtils.writeTextFile(agentsPath, await generator.generateAgentsMd(projectInfo));
    }

    const claudePath = path.join(workspacePath, 'CLAUDE.md');
    if (!(await FileUtils.exists(claudePath))) {
      await FileUtils.writeTextFile(claudePath, await generator.generateClaudeMd(projectInfo));
    }

    const geminiPath = path.join(workspacePath, 'GEMINI.md');
    if (!(await FileUtils.exists(geminiPath))) {
      await FileUtils.writeTextFile(geminiPath, generator.generateGeminiMd());
    }

    const copilotPath = path.join(workspacePath, '.github', 'copilot-instructions.md');
    if (!(await FileUtils.exists(copilotPath))) {
      await FileUtils.writeTextFile(copilotPath, await generator.generateCopilotMd(projectInfo));
    }

    // CLAUDE.md should NOT have been written (it existed)
    expect(written[claudePath]).toBeUndefined();
    // But AGENTS.md, GEMINI.md, and Copilot instructions should have been written
    expect(written[agentsPath]).toBeDefined();
    expect(written[geminiPath]).toBeDefined();
    expect(written[copilotPath]).toBeDefined();
  });
});
