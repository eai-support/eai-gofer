import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstructionGenerator } from '../../../extension/src/services/InstructionGenerator';
import { ProjectInfo } from '../../../extension/src/services/ProjectDetector';
import { FileUtils } from '../../../extension/src/utils/fileUtils';
import * as path from 'path';

// Mock vscode module
vi.mock('vscode', () => ({
  extensions: {
    getExtension: vi.fn().mockReturnValue(undefined),
  },
}));

vi.mock('../../../extension/src/utils/fileUtils');

const TEMPLATES_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'extension',
  'resources',
  'instruction-templates'
);

function makeProjectInfo(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name: 'test-project',
    language: 'typescript',
    framework: null,
    testRunner: 'vitest',
    testCommand: 'npm test',
    buildCommand: 'npm run build',
    lintCommand: 'npm run lint',
    formatCommand: 'npm run format',
    packageManager: 'npm',
    hasTypeScript: true,
    hasEslint: true,
    hasPrettier: true,
    eaiInitialized: false,
    ...overrides,
  };
}

describe('InstructionGenerator', () => {
  let generator: InstructionGenerator;

  beforeEach(() => {
    vi.resetAllMocks();
    // Use real template files
    generator = new InstructionGenerator(TEMPLATES_PATH);

    // Mock FileUtils.readTextFile to read actual template files
    vi.mocked(FileUtils.readTextFile).mockImplementation(async (filePath: string) => {
      const fs = await import('fs/promises');
      return fs.readFile(filePath, 'utf-8');
    });
  });

  describe('generateAgentsMd()', () => {
    it.each(['generateAgentsMd', 'generateClaudeMd', 'generateCopilotMd'] as const)(
      '%s includes the complete always-on scope and MVP rules without EAI setup',
      async (method) => {
        const content = await generator[method](makeProjectInfo());
        for (const file of [
          'spec.md',
          'plan.md',
          'tasks.md',
          'traceability.md',
          'validation-report.md',
        ]) {
          expect(content).toContain(file);
        }
        expect(content).toContain('before implementation continues');
        expect(content).toContain('mark affected old evidence pending');
        expect(content).toContain('A question alone does not authorize artifact edits');
        expect(content).toContain('no implemented or required authentication needs no login');
        expect(content).toContain('confirmed non-app work exempt');
        expect(content.match(/<!-- gofer:always-on-eai:start -->/g)).toHaveLength(1);
      }
    );

    it('generates AGENTS.md for TypeScript project', async () => {
      const info = makeProjectInfo({
        name: 'my-app',
        framework: 'React',
      });

      const content = await generator.generateAgentsMd(info);

      expect(content).toContain('# AGENTS.md');
      expect(content).toContain('**Project**: my-app');
      expect(content).toContain('**Language**: TypeScript');
      expect(content).toContain('**Framework**: React');
      expect(content).toContain('**Build**: `npm run build`');
      expect(content).toContain('**Test**: `npm test`');
      expect(content).toContain('**Lint**: `npm run lint`');
      expect(content).toContain('strict mode');
      expect(content).toContain('Simplicity First');
      expect(content).toContain('conventional commit');
    });

    it('generates AGENTS.md for Python project', async () => {
      const info = makeProjectInfo({
        name: 'django-api',
        language: 'python',
        framework: 'Django',
        testRunner: 'pytest',
        testCommand: null,
        buildCommand: null,
        lintCommand: null,
        formatCommand: null,
        packageManager: 'poetry',
        hasTypeScript: false,
        hasEslint: false,
        hasPrettier: false,
      });

      const content = await generator.generateAgentsMd(info);

      expect(content).toContain('**Language**: Python');
      expect(content).toContain('**Framework**: Django');
      expect(content).toContain('type hints');
      expect(content).toContain('**Test Runner**: pytest');
    });

    it('generates AGENTS.md for Go project without framework', async () => {
      const info = makeProjectInfo({
        name: 'go-service',
        language: 'go',
        framework: null,
        testRunner: null,
        testCommand: null,
        buildCommand: null,
        lintCommand: null,
        formatCommand: null,
        packageManager: null,
        hasTypeScript: false,
        hasEslint: false,
        hasPrettier: false,
      });

      const content = await generator.generateAgentsMd(info);

      expect(content).toContain('**Language**: Go');
      expect(content).not.toContain('**Framework**');
      expect(content).toContain('handle errors');
    });

    it('generates AGENTS.md for unknown project with generic fragment', async () => {
      const info = makeProjectInfo({
        name: 'mystery',
        language: 'unknown',
        framework: null,
        testRunner: null,
        testCommand: null,
        buildCommand: null,
        lintCommand: null,
        formatCommand: null,
        packageManager: null,
        hasTypeScript: false,
        hasEslint: false,
        hasPrettier: false,
      });

      const content = await generator.generateAgentsMd(info);

      expect(content).toContain('**Language**: Unknown');
      expect(content).toContain('Follow existing code style');
    });

    it('includes core principles and Gofer pipeline info', async () => {
      const info = makeProjectInfo();
      const content = await generator.generateAgentsMd(info);

      // Core principles (inline in agents-base.md)
      expect(content).toContain('Simplicity First');
      expect(content).toContain('No Laziness');
      expect(content).toContain('Minimal Impact');

      // Gofer pipeline mention
      expect(content).toContain('Gofer');
      expect(content).toContain('/eai');
      expect(content).not.toContain('/gofer');
      expect(content).toContain('.specify/commands/*.md');
      expect(content).not.toContain('/0_gofer_start');
    });
  });

  describe('generateClaudeMd()', () => {
    it('generates CLAUDE.md under 65 lines', async () => {
      const info = makeProjectInfo();
      const content = await generator.generateClaudeMd(info);
      const lineCount = content.split('\n').length;

      expect(lineCount).toBeLessThan(65);
      expect(content).toContain('# CLAUDE.md');
      expect(content).toContain('@AGENTS.md');
    });

    it('keeps CRLF templates under 65 lines without changing instruction content', async () => {
      const info = makeProjectInfo();
      const lf = await generator.generateClaudeMd(info);
      vi.mocked(FileUtils.readTextFile).mockImplementation(async (filePath: string) => {
        const fs = await import('fs/promises');
        return (await fs.readFile(filePath, 'utf-8')).replace(/\r?\n/g, '\r\n');
      });
      const crlf = await generator.generateClaudeMd(info);
      expect(crlf.split('\n').length).toBeLessThan(65);
      expect(crlf).not.toContain('\r');
      expect(crlf).toBe(lf);
    });

    it('includes Gofer pipeline commands', async () => {
      const info = makeProjectInfo();
      const content = await generator.generateClaudeMd(info);

      expect(content).toContain('/eai');
      expect(content).not.toContain('/gofer');
      expect(content).toContain('.specify/commands/*.md');
      expect(content).not.toContain('/7_gofer_save');
      expect(content).toContain('Gofer Pipeline');
    });

    it('includes workflow principles (brief form)', async () => {
      const info = makeProjectInfo();
      const content = await generator.generateClaudeMd(info);

      expect(content).toContain('Plan First');
      expect(content).toContain('Verification Before Done');
    });

    it('adds EAI repo contract guidance when the repo is EAI-initialized', async () => {
      const info = makeProjectInfo({ eaiInitialized: true });

      const agents = await generator.generateAgentsMd(info);
      const claude = await generator.generateClaudeMd(info);
      const copilot = await generator.generateCopilotMd(info);

      expect(agents).toContain('## EAI Repo Contract');
      expect(agents).toContain('public `eai` entrypoint');
      expect(agents).toContain('.specify/commands/gofer_eai_first_run.md');
      expect(agents).toContain('eai agent guide --format json');
      expect(agents).toContain('eai errors explain <code-or-reason> --format json');
      expect(agents).toContain(
        'eai user role set --tenant <tenant-id> --member-id <member-id> --role tenant-admin --format json'
      );
      expect(agents).toContain('sign out and sign back in');
      expect(agents).toContain('app_token_tenant_context_required');
      expect(agents).toContain('/v4/platform/tenants/<tenant-id>/...');
      expect(claude).toContain('## EAI Repo Contract');
      expect(claude).toContain('eai agent guide --format json');
      expect(claude).toContain('eai workflow readiness --format json');
      expect(copilot).toContain('## EAI Repo Contract');
      expect(copilot).toContain('.specify/references/platform/eai-repo-contract.md');
    });
  });

  describe('generateCopilotMd()', () => {
    it('generates copilot-instructions.md with project overview', async () => {
      const info = makeProjectInfo({
        name: 'my-react-app',
        framework: 'React',
      });

      const content = await generator.generateCopilotMd(info);

      expect(content).toContain('# Copilot Instructions');
      expect(content).toContain('my-react-app');
      expect(content).toContain('TypeScript');
      expect(content).toContain('React');
      expect(content).toContain('Gofer');
      expect(content).toContain('#eai');
      expect(content).not.toContain('#gofer');
      expect(content).not.toContain('Run `/0_gofer_start`');
    });

    it('includes language-specific code quality section', async () => {
      const info = makeProjectInfo();
      const content = await generator.generateCopilotMd(info);

      expect(content).toContain('strict mode');
      expect(content).toContain('ESM imports');
    });
  });

  describe('content partitioning', () => {
    it('AGENTS.md contains code quality guidelines and Gofer pipeline', async () => {
      const info = makeProjectInfo();
      const content = await generator.generateAgentsMd(info);

      // Core principles and Gofer info
      expect(content).toContain('Simplicity First');
      expect(content).toContain('Gofer Pipeline');
      expect(content).toContain('/eai');
      expect(content).not.toContain('/gofer');
      expect(content).not.toContain('/0_gofer_start');
    });

    it('CLAUDE.md contains workflow orchestration and references AGENTS.md', async () => {
      const info = makeProjectInfo();
      const content = await generator.generateClaudeMd(info);

      expect(content).toContain('@AGENTS.md');
      expect(content).toContain('/eai');
      expect(content).not.toContain('/gofer');
      expect(content).not.toContain('/0_gofer_start');
      expect(content).toContain('Workflow Orchestration');
    });
  });
});
