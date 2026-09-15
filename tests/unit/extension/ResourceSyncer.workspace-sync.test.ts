import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vscode from 'vscode';
import { cleanupTestWorkspace, createTestWorkspace } from '../../helpers/workspace';
import { Logger } from '../../../extension/src/services/Logger';
import { ResourceSyncer } from '../../../extension/src/services/migration/ResourceSyncer';
import { UpgradeService } from '../../../extension/src/services/migration/UpgradeService';
import type { VersionDetector } from '../../../extension/src/services/migration/VersionDetector';
import { InstructionGenerator } from '../../../extension/src/services/InstructionGenerator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const EXTENSION_PATH = path.join(REPO_ROOT, 'extension');

function extractGeminiInclude(content: string): string {
  const match = content.match(/^prompt = "\{\{include: ([^"]+)\}\}"/m);
  if (!match) {
    throw new Error('Missing Gemini include');
  }

  return match[1];
}

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

  it('setupGeminiCommands keeps include targets resolvable', async (): Promise<void> => {
    await syncer.setupGeminiCommands();

    const geminiCommandPath = path.join(workspace, '.gemini', 'commands', 'gofer', 'eai.toml');
    const canonicalCommandPath = path.join(
      workspace,
      '.specify',
      'commands',
      '6_gofer_validate.md'
    );
    const geminiContent = await fs.readFile(geminiCommandPath, 'utf8');
    const includeTarget = extractGeminiInclude(geminiContent);

    expect(path.resolve(path.dirname(geminiCommandPath), includeTarget)).toBe(
      path.join(workspace, '.gemini', 'commands', 'gofer', 'eai.md')
    );
    expect(await pathExists(canonicalCommandPath)).toBe(true);
  });

  it('provisions Grok skills and the Antigravity GEMINI.md instruction bridge from VSIX resources', async (): Promise<void> => {
    await syncer.setupGrokSkills();
    await syncer.setupDefaultInstructions();

    const grokSkillPath = path.join(workspace, '.grok', 'skills', 'eai', 'SKILL.md');
    const geminiPath = path.join(workspace, 'GEMINI.md');

    expect(await fs.readFile(grokSkillPath, 'utf8')).toContain('Host: Grok Build');
    expect(await fs.readFile(geminiPath, 'utf8')).toContain('See @AGENTS.md');
    expect(await fs.readFile(geminiPath, 'utf8')).toContain('gofer:always-on-eai:start');
  });

  it('refreshes only the bounded Gofer section in an existing GEMINI.md', async (): Promise<void> => {
    const geminiPath = path.join(workspace, 'GEMINI.md');
    const customPrefix = '# Team Antigravity instructions\n\nKeep this project-specific rule.\n\n';
    const customSuffix = '\n\n## Team Notes\n\nKeep this note too.\n';
    await fs.writeFile(
      geminiPath,
      `${customPrefix}<!-- gofer:always-on-eai:start -->\n\nstale managed text\n\n` +
        `<!-- gofer:always-on-eai:end -->${customSuffix}`,
      'utf8'
    );

    await syncer.setupDefaultInstructions();

    const refreshed = await fs.readFile(geminiPath, 'utf8');
    expect(refreshed.startsWith(customPrefix)).toBe(true);
    expect(refreshed.endsWith(customSuffix)).toBe(true);
    expect(refreshed).not.toContain('stale managed text');
    expect(refreshed).toContain('See @AGENTS.md');
    expect(refreshed).toContain('Apply Gofer to every request');
    expect(refreshed.match(/gofer:always-on-eai:start/g)).toHaveLength(1);
    expect(refreshed.match(/gofer:always-on-eai:end/g)).toHaveLength(1);
  });

  it('adds a bounded Gofer section without replacing unrelated GEMINI.md content', async (): Promise<void> => {
    const geminiPath = path.join(workspace, 'GEMINI.md');
    const customContent = '# Existing Antigravity instructions\n\nNever replace this content.\n';
    await fs.writeFile(geminiPath, customContent, 'utf8');

    await syncer.setupDefaultInstructions();

    const refreshed = await fs.readFile(geminiPath, 'utf8');
    expect(refreshed).toContain(customContent.trim());
    expect(refreshed).toContain('## Always-On EAI Contract');
    expect(refreshed).toContain('gofer:always-on-eai:start');
  });

  it('rejects malformed managed markers without changing GEMINI.md', async (): Promise<void> => {
    const geminiPath = path.join(workspace, 'GEMINI.md');
    const malformed =
      '# Existing instructions\n\n<!-- gofer:always-on-eai:start -->\nunterminated\n';
    await fs.writeFile(geminiPath, malformed, 'utf8');

    await expect(syncer.setupDefaultInstructions()).rejects.toThrow(/malformed.*markers/i);
    expect(await fs.readFile(geminiPath, 'utf8')).toBe(malformed);
  });

  it('refuses to refresh GEMINI.md through a symlink', async (): Promise<void> => {
    const geminiPath = path.join(workspace, 'GEMINI.md');
    const outsidePath = `${workspace}-outside-gemini.md`;
    const outsideContent = '# Outside instructions\n';

    try {
      await fs.writeFile(outsidePath, outsideContent, 'utf8');
      try {
        await fs.symlink(outsidePath, geminiPath, 'file');
      } catch (error) {
        console.warn('Skipping GEMINI.md symlink-protection test:', error);
        return;
      }

      await expect(syncer.setupDefaultInstructions()).rejects.toThrow(/symlinked managed file/i);
      expect(await fs.readFile(outsidePath, 'utf8')).toBe(outsideContent);
    } finally {
      await fs.rm(outsidePath, { force: true });
    }
  });

  it('completes a real packaged-resource upgrade in an empty workspace before recording its version', async (): Promise<void> => {
    await fs.rm(path.join(workspace, '.specify'), { recursive: true, force: true });
    (vscode.window as unknown as { withProgress: ReturnType<typeof vi.fn> }).withProgress = vi.fn(
      async (_options, callback) => callback({ report: vi.fn() })
    );
    const versionDetector = {
      detectFormat: vi.fn().mockResolvedValue('none'),
    } as unknown as VersionDetector;
    const upgradeService = new UpgradeService(new Logger(), versionDetector);

    expect(await pathExists(path.join(workspace, '.specify', '.gofer-version'))).toBe(false);
    await upgradeService.upgrade(workspace, syncer, { skipConfirmation: true });

    expect(
      await fs.readFile(path.join(workspace, '.grok', 'skills', 'eai', 'SKILL.md'), 'utf8')
    ).toContain('Host: Grok Build');
    expect(await fs.readFile(path.join(workspace, 'GEMINI.md'), 'utf8')).toContain(
      'gofer:always-on-eai:start'
    );
    expect(await fs.readFile(path.join(workspace, '.specify', '.gofer-version'), 'utf8')).toBe(
      '0.0.0-test'
    );
  });

  it('propagates required instruction generation failures instead of reporting false success', async (): Promise<void> => {
    const failure = new Error('required Antigravity instruction failed');
    const generatorFailure = vi
      .spyOn(InstructionGenerator.prototype, 'generateGeminiMd')
      .mockImplementation(() => {
        throw failure;
      });

    try {
      await expect(syncer.setupDefaultInstructions()).rejects.toBe(failure);
      expect(await pathExists(path.join(workspace, '.github', 'copilot-instructions.md'))).toBe(
        false
      );
    } finally {
      generatorFailure.mockRestore();
    }
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
      ['.grok/skills/gofer/SKILL.md', '# Custom stale Grok alias\n'],
      ['.grok/skills/1_gofer_research/SKILL.md', '# Custom stale Grok stage\n'],
    ]);

    for (const [relativePath, content] of staleFiles) {
      const filePath = path.join(workspace, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
    }

    await syncer.setupClaudeCommands();
    await syncer.setupCopilotPrompts();
    await syncer.setupGeminiCommands();
    await syncer.setupGrokSkills();

    for (const relativePath of staleFiles.keys()) {
      expect(await pathExists(path.join(workspace, relativePath)), relativePath).toBe(false);
    }
    expect(await pathExists(path.join(workspace, '.claude/commands/eai.md'))).toBe(true);
    expect(await pathExists(path.join(workspace, '.github/prompts/eai.prompt.md'))).toBe(true);
    expect(await pathExists(path.join(workspace, '.gemini/commands/gofer/eai.toml'))).toBe(true);
    expect(await pathExists(path.join(workspace, '.grok/skills/eai/SKILL.md'))).toBe(true);

    const archiveRoot = path.join(workspace, '.specify', 'logs', 'legacy-command-backups');
    const archivedFiles = await findFiles(archiveRoot);
    for (const relativePath of staleFiles.keys()) {
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
