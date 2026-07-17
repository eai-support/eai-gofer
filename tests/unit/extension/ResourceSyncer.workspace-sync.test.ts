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

  it('setupGeminiCommands keeps include targets resolvable', async (): Promise<void> => {
    await syncer.setupGeminiCommands();

    const geminiCommandPath = path.join(workspace, '.gemini', 'commands', 'gofer', 'gofer.toml');
    const canonicalCommandPath = path.join(
      workspace,
      '.specify',
      'commands',
      '6_gofer_validate.md'
    );
    const geminiContent = await fs.readFile(geminiCommandPath, 'utf8');
    const includeTarget = extractGeminiInclude(geminiContent);

    expect(path.resolve(path.dirname(geminiCommandPath), includeTarget)).toBe(
      path.join(workspace, '.gemini', 'commands', 'gofer', 'gofer.md')
    );
    expect(await pathExists(canonicalCommandPath)).toBe(true);
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
