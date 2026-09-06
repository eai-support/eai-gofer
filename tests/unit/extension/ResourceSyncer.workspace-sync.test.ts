import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vscode from 'vscode';
import { cleanupTestWorkspace, createTestWorkspace } from '../../helpers/workspace';
import { Logger } from '../../../extension/src/services/Logger';
import { ResourceSyncer } from '../../../extension/src/services/migration/ResourceSyncer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const EXTENSION_PATH = path.join(REPO_ROOT, 'extension');

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findFiles(root: string): Promise<string[]> {
  if (!(await pathExists(root))) {
    return [];
  }

  const results: string[] = [];
  async function visit(current: string): Promise<void> {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  await visit(root);
  return results;
}

async function createDirectorySymlink(targetPath: string, symlinkPath: string): Promise<boolean> {
  try {
    await fs.rm(symlinkPath, { recursive: true, force: true });
    await fs.symlink(targetPath, symlinkPath, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch (error) {
    console.warn('Skipping symlink-protection test:', error);
    return false;
  }
}

describe('ResourceSyncer workspace sync', () => {
  let workspace: string;
  let syncer: ResourceSyncer;

  beforeEach(async (): Promise<void> => {
    workspace = await createTestWorkspace();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      extensionPath: EXTENSION_PATH,
      packageJSON: { version: '0.0.0-test' },
    } as unknown as vscode.Extension<unknown>);

    syncer = new ResourceSyncer(new Logger());
    syncer.setWorkspacePath(workspace);
  });

  afterEach(async (): Promise<void> => {
    vi.clearAllMocks();
    await cleanupTestWorkspace(workspace);
  });

  it('installGoferCLI provisions canonical command sources', async (): Promise<void> => {
    await syncer.installGoferCLI();

    const commandPath = path.join(workspace, '.specify', 'commands', '6_gofer_validate.md');
    expect(await pathExists(commandPath)).toBe(true);
    expect(await fs.readFile(commandPath, 'utf8')).toContain('name: 6_gofer_validate');
  });

  it('installGoferCLI provisions the immutable object-type routing contract, config, and audit schemas', async (): Promise<void> => {
    await syncer.installGoferCLI();

    const contractPath = path.join(
      workspace,
      '.specify',
      'contracts',
      'object-type-routing-v1.json'
    );
    const configPath = path.join(workspace, '.specify', 'config', 'object-type-routing.json');
    const auditSchemaPath = path.join(
      workspace,
      '.specify',
      'schemas',
      'object-type-identifier-audit-v1.schema.json'
    );

    expect(JSON.parse(await fs.readFile(contractPath, 'utf8'))).toMatchObject({
      contractVersion: 'eai.object-type-routing/v1',
      authoritativeTransportIdentifier: 'slug',
    });
    expect(JSON.parse(await fs.readFile(configPath, 'utf8'))).toMatchObject({
      contractVersion: 'eai.object-type-routing/v1',
      soleOwner: 'front/eai-app-template/packages/platform-sdk/src/resource-routing.ts',
    });
    expect(await pathExists(auditSchemaPath)).toBe(true);
  });

  it('rejects the retired Gemini setup API without any writes', async () => {
    const before = await findFiles(workspace);
    await expect(syncer.setupGeminiCommands()).rejects.toThrow('Gemini CLI is retired');
    expect(await findFiles(workspace)).toEqual(before);
  });

  it('creates shared Antigravity/Codex skills without Gemini TOML or context changes', async () => {
    const context = '# Existing GEMINI.md rules\\n';
    await fs.writeFile(path.join(workspace, 'GEMINI.md'), context);
    await syncer.setupClaudeCommands();
    await syncer.setupCodexSkills();
    expect(await pathExists(path.join(workspace, '.agents/skills/eai/SKILL.md'))).toBe(true);
    expect(await pathExists(path.join(workspace, '.agents/skills/eai-update/SKILL.md'))).toBe(true);
    expect(await pathExists(path.join(workspace, '.specify/commands/6_gofer_validate.md'))).toBe(
      true
    );
    expect(await pathExists(path.join(workspace, '.gemini/commands/gofer/eai.toml'))).toBe(false);
    expect(await fs.readFile(path.join(workspace, 'GEMINI.md'), 'utf8')).toBe(context);
  });

  it('archives legacy command entrypoints instead of deleting custom files', async (): Promise<void> => {
    const legacyPromptPath = path.join(
      workspace,
      '.github',
      'prompts',
      '0_business_scenario.prompt.md'
    );
    const customPrompt = '# Custom legacy Copilot prompt\n\nKeep my local migration note.\n';
    await fs.mkdir(path.dirname(legacyPromptPath), { recursive: true });
    await fs.writeFile(legacyPromptPath, customPrompt, 'utf8');

    await syncer.setupCopilotPrompts();

    expect(await pathExists(legacyPromptPath)).toBe(false);
    const archiveRoot = path.join(workspace, '.specify', 'logs', 'legacy-command-backups');
    const archivedFiles = await findFiles(archiveRoot);
    const archivedPromptPath = archivedFiles.find((filePath) =>
      filePath.endsWith(path.join('.github', 'prompts', '0_business_scenario.prompt.md'))
    );

    expect(archivedPromptPath, 'expected archived legacy Copilot prompt').toBeTruthy();
    expect(await fs.readFile(String(archivedPromptPath), 'utf8')).toBe(customPrompt);
  });

  it('archives stale public aliases and stage mirrors during resource sync', async (): Promise<void> => {
    const staleFiles = new Map([
      ['.claude/commands/gofer.md', '# Custom stale Gofer alias\n'],
      ['.claude/commands/1_gofer_research.md', '# Custom stale research command\n'],
      ['.github/prompts/gofer.prompt.md', '# Custom stale Gofer prompt\n'],
      ['.agents/skills/gofer/SKILL.md', '# Custom stale Gofer skill\n'],
      ['.system/skills/1_gofer_research/SKILL.md', '# Custom stale research skill\n'],
      ['.gemini/commands/gofer/gofer.toml', 'prompt = "{{include: ./gofer.md}}"\n'],
      ['.gemini/commands/gofer/1_gofer_research.md', '# Custom stale Gemini command\n'],
    ]);

    for (const [relativePath, content] of staleFiles) {
      const filePath = path.join(workspace, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
    }

    await syncer.setupClaudeCommands();
    await syncer.setupCopilotPrompts();
    await syncer.setupCodexSkills();

    for (const relativePath of staleFiles.keys()) {
      if (relativePath.startsWith('.gemini/')) {
        expect(await fs.readFile(path.join(workspace, relativePath), 'utf8')).toBe(
          staleFiles.get(relativePath)
        );
        continue;
      }
      expect(await pathExists(path.join(workspace, relativePath)), relativePath).toBe(false);
    }
    expect(await pathExists(path.join(workspace, '.claude/commands/eai.md'))).toBe(true);
    expect(await pathExists(path.join(workspace, '.github/prompts/eai.prompt.md'))).toBe(true);
    expect(await pathExists(path.join(workspace, '.agents/skills/eai/SKILL.md'))).toBe(true);
    expect(await pathExists(path.join(workspace, '.gemini/commands/gofer/eai.toml'))).toBe(false);

    const archiveRoot = path.join(workspace, '.specify', 'logs', 'legacy-command-backups');
    const archivedFiles = await findFiles(archiveRoot);
    for (const relativePath of staleFiles.keys()) {
      if (relativePath.startsWith('.gemini/')) {
        expect(await fs.readFile(path.join(workspace, relativePath), 'utf8')).toBe(
          staleFiles.get(relativePath)
        );
        continue;
      }
      const archived = archivedFiles.find((filePath) => filePath.endsWith(relativePath));
      expect(archived, `${relativePath} should be archived`).toBeTruthy();
    }
  });

  it('createNodeScripts syncs entrypoints and helper libraries', async (): Promise<void> => {
    await syncer.createNodeScripts();

    const requiredScripts = [
      path.join(workspace, '.specify', 'scripts', 'node', 'generate-commands.mjs'),
      path.join(workspace, '.specify', 'scripts', 'node', 'parse-stage-command.mjs'),
      path.join(workspace, '.specify', 'scripts', 'node', 'lib', 'visual-pass-pipeline.mjs'),
      path.join(workspace, '.specify', 'scripts', 'node', 'lib', 'assemble-stakeholder-pack.mjs'),
    ];

    for (const scriptPath of requiredScripts) {
      expect(await pathExists(scriptPath), `expected bundled node script ${scriptPath}`).toBe(true);
    }
  });

  it('syncCanonicalCommands rejects symlinked managed directories', async (): Promise<void> => {
    const outsideDir = `${workspace}-outside-commands`;
    const symlinkPath = path.join(workspace, '.specify', 'commands');

    try {
      await fs.mkdir(outsideDir, { recursive: true });
      await fs.mkdir(path.join(workspace, '.specify'), { recursive: true });

      if (!(await createDirectorySymlink(outsideDir, symlinkPath))) {
        return;
      }

      await expect(syncer.syncCanonicalCommands()).rejects.toThrow(/symlinked managed path/i);
      expect(await pathExists(path.join(outsideDir, '6_gofer_validate.md'))).toBe(false);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('createReadme rejects symlinked managed root directories', async (): Promise<void> => {
    const outsideDir = `${workspace}-outside-specify`;
    const symlinkPath = path.join(workspace, '.specify');

    try {
      await fs.mkdir(outsideDir, { recursive: true });

      if (!(await createDirectorySymlink(outsideDir, symlinkPath))) {
        return;
      }

      await expect(syncer.createReadme()).rejects.toThrow(/symlinked managed path/i);
      expect(await pathExists(path.join(outsideDir, 'README.md'))).toBe(false);
    } finally {
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });
});
