/**
 * Resource Syncer Service
 *
 * Manages resource synchronization during upgrades and migrations.
 * Extracted from goferMigrator.ts (2499 LOC → focused service).
 *
 * Engineering Remediation Phase 4 - T028
 */

import { injectable } from 'tsyringe';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { Logger } from '../Logger';
import { FileUtils } from '../../utils/fileUtils';
import { IResourceOperations } from './UpgradeService';
import { getWorkflowProfile } from '../../config/workflowProfile';
import * as yaml from 'yaml';

interface LegacyJsonTask {
  id?: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  status?: string;
}

interface LegacyAcceptanceCriterion {
  description?: string;
}

interface LegacyJsonSpec {
  title?: string;
  status?: string;
  priority?: string;
  description?: string;
  userStories?: string[];
  tasks?: LegacyJsonTask[];
  acceptanceCriteria?: LegacyAcceptanceCriterion[];
}

interface NonDestructiveSyncSummary {
  copied: number;
  updated: number;
  unchanged: number;
}

interface CodexConfigRepairResult {
  content: string;
  changedEntries: number;
}

interface ManagedFileState {
  exists: boolean;
  executable: boolean;
}

const LEGACY_GOFER_COMMAND_PATHS = [
  path.join('.specify', 'commands', '0_business_scenario.md'),
  path.join('.claude', 'commands', '0_business_scenario.md'),
  path.join('.github', 'prompts', '0_business_scenario.prompt.md'),
  path.join('.agents', 'skills', '0_business_scenario'),
  path.join('.system', 'skills', '0_business_scenario'),
  path.join('.gemini', 'commands', 'gofer', '0_business_scenario.md'),
  path.join('.gemini', 'commands', 'gofer', '0_business_scenario.toml'),
];
const LEGACY_GOFER_COMMAND_ARCHIVE_ROOT = path.join('.specify', 'logs', 'legacy-command-backups');

function isNodeErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isAbsolutePathAcrossPlatforms(candidatePath: string): boolean {
  return path.posix.isAbsolute(candidatePath) || path.win32.isAbsolute(candidatePath);
}

export function resolveResourceTargetPath(specifyPath: string, targetSubdir: string): string {
  return isAbsolutePathAcrossPlatforms(targetSubdir)
    ? targetSubdir
    : path.join(specifyPath, targetSubdir);
}

export function enableManagedCodexSkillConfigEntries(
  configContent: string,
  managedSkillPaths: ReadonlySet<string>
): CodexConfigRepairResult {
  let changedEntries = 0;
  const blockPattern = /\[\[skills\.config\]\][\s\S]*?(?=\n\[\[|\n\[(?!\[)|$)/g;

  const content = configContent.replace(blockPattern, (block) => {
    const pathMatch = block.match(/^\s*path\s*=\s*"((?:\\"|[^"])*)"\s*$/m);
    if (!pathMatch) {
      return block;
    }

    const configuredPath = pathMatch[1].replace(/\\"/g, '"');
    const normalizedPath = path.resolve(configuredPath).replace(/\\/g, '/');
    if (!managedSkillPaths.has(normalizedPath)) {
      return block;
    }

    if (!/^\s*enabled\s*=\s*false\s*$/m.test(block)) {
      return block;
    }

    changedEntries++;
    return block.replace(/^(\s*enabled\s*=\s*)false\s*$/m, '$1true');
  });

  return { content, changedEntries };
}

/**
 * Resource Syncer Service
 *
 * Responsible for syncing resources from the extension bundle to the workspace:
 * - Templates, scripts, commands, agents
 * - Configuration files
 * - Documentation
 *
 * This service implements IResourceOperations interface.
 */
@injectable()
export class ResourceSyncer implements IResourceOperations {
  private workspacePath: string = '';
  private specifyPath: string = '';

  constructor(private readonly logger: Logger) {}

  private buildLegacyArchiveStamp(): string {
    return `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  }

  private async movePathPreservingAcrossDevices(
    sourcePath: string,
    targetPath: string
  ): Promise<void> {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    try {
      await fs.rename(sourcePath, targetPath);
    } catch (error) {
      if (!isNodeErrorWithCode(error) || error.code !== 'EXDEV') {
        throw error;
      }

      await fs.cp(sourcePath, targetPath, {
        recursive: true,
        force: true,
        dereference: false,
      });
      await fs.rm(sourcePath, { recursive: true, force: true });
    }
  }

  private async archiveLegacyGoferCommandPath(
    relativePath: string,
    archiveStamp: string
  ): Promise<string> {
    const archiveRelativePath = path.join(
      LEGACY_GOFER_COMMAND_ARCHIVE_ROOT,
      archiveStamp,
      relativePath
    );

    await this.movePathPreservingAcrossDevices(
      path.join(this.workspacePath, relativePath),
      path.join(this.workspacePath, archiveRelativePath)
    );

    return archiveRelativePath;
  }

  private async cleanupLegacyGoferCommandFiles(): Promise<void> {
    if (!this.workspacePath) {
      return;
    }

    const archiveStamp = this.buildLegacyArchiveStamp();
    for (const relativePath of LEGACY_GOFER_COMMAND_PATHS) {
      const targetPath = path.join(this.workspacePath, relativePath);
      try {
        if (!(await FileUtils.exists(targetPath))) {
          continue;
        }

        const archivePath = await this.archiveLegacyGoferCommandPath(relativePath, archiveStamp);
        this.logger.info('ResourceSyncer', 'Archived legacy Gofer command path', {
          from: relativePath,
          to: archivePath,
        });
      } catch (error) {
        this.logger.warn(
          'ResourceSyncer',
          `Failed to archive legacy Gofer command path ${relativePath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  /**
   * Initialize with workspace paths
   */
  public setWorkspacePath(workspacePath: string): void {
    this.workspacePath = workspacePath;
    this.specifyPath = path.join(workspacePath, '.specify');
  }

  /**
   * Get extension path with fallbacks
   */
  private getExtensionPath(): string {
    let extensionPath = vscode.extensions.getExtension('EnterpriseAI.gofer')?.extensionPath;

    // Fallback: derive from __dirname (dist/extension.js -> extension root)
    if (!extensionPath) {
      extensionPath = path.resolve(__dirname, '..');
      this.logger.debug('ResourceSyncer', 'Using __dirname fallback', { extensionPath });
    }

    return extensionPath || '';
  }

  /**
   * Resolve extension version without relying on CommonJS require().
   */
  private async getExtensionVersion(): Promise<string> {
    const extensionVersion =
      vscode.extensions.getExtension('EnterpriseAI.gofer')?.packageJSON?.version;

    if (typeof extensionVersion === 'string' && extensionVersion.length > 0) {
      return extensionVersion;
    }

    const packageJsonPath = path.join(this.getExtensionPath(), 'package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent) as { version?: string };

    return packageJson.version ?? 'unknown';
  }

  /**
   * Copy bundled resources from extension to workspace
   */
  private async copyBundledResources(
    resourceType: string,
    sourceSubdir: string,
    targetSubdir: string,
    filePatterns: string[],
    makeExecutable: boolean = false
  ): Promise<void> {
    try {
      this.logger.info('ResourceSyncer', `Copying ${resourceType}`, {
        sourceSubdir,
        targetSubdir,
      });

      const extensionPath = this.getExtensionPath();
      if (!extensionPath) {
        this.logger.warn('ResourceSyncer', `Could not find extension path for ${resourceType}`);
        return;
      }

      const sourcePath = path.join(extensionPath, 'resources', sourceSubdir);
      const targetPath = resolveResourceTargetPath(this.specifyPath, targetSubdir);

      this.logger.debug('ResourceSyncer', 'Resource paths', { sourcePath, targetPath });

      await this.ensureManagedDirectory(targetPath);

      try {
        const files = await fs.readdir(sourcePath);
        let copiedCount = 0;
        let updatedCount = 0;
        let unchangedCount = 0;

        for (const file of files) {
          // Check if file matches any pattern
          const matches = filePatterns.some((pattern) => {
            if (pattern.startsWith('*.')) {
              return file.endsWith(pattern.slice(1));
            }
            return file === pattern;
          });

          if (matches) {
            const source = path.join(sourcePath, file);
            const target = path.join(targetPath, file);
            const action = await this.upsertFileFromSource(source, target, makeExecutable);

            if (action === 'copied') {
              copiedCount++;
            } else if (action === 'updated') {
              updatedCount++;
            } else {
              unchangedCount++;
            }
            this.logger.debug('ResourceSyncer', `${action}: ${file}`);
          }
        }

        this.logger.info('ResourceSyncer', `Successfully synced ${resourceType} files`, {
          copied: copiedCount,
          updated: updatedCount,
          unchanged: unchangedCount,
        });
      } catch (error: unknown) {
        if (isNodeErrorWithCode(error) && error.code === 'ENOENT') {
          this.logger.warn('ResourceSyncer', `No bundled ${resourceType} found, skipping`);
          return;
        }

        this.logger.error('ResourceSyncer', error as Error, {
          operation: `copy ${resourceType}`,
          sourcePath,
        });
        throw error;
      }
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, {
        operation: `copyBundledResources for ${resourceType}`,
      });
      throw error;
    }
  }

  private async syncBundledDirectory(
    resourceType: string,
    sourceSubdir: string,
    targetPath: string,
    makeExecutableExtensions: readonly string[] = []
  ): Promise<void> {
    try {
      this.logger.info('ResourceSyncer', `Syncing ${resourceType}`, {
        sourceSubdir,
        targetPath,
      });

      const extensionPath = this.getExtensionPath();
      if (!extensionPath) {
        this.logger.warn('ResourceSyncer', `Could not find extension path for ${resourceType}`);
        return;
      }

      const sourcePath = path.join(extensionPath, 'resources', sourceSubdir);
      if (!(await FileUtils.exists(sourcePath))) {
        this.logger.warn('ResourceSyncer', `No bundled ${resourceType} found, skipping`, {
          sourcePath,
        });
        return;
      }

      const summary = await this.syncDirectoryNonDestructive(
        sourcePath,
        targetPath,
        makeExecutableExtensions
      );
      this.logger.info('ResourceSyncer', `Successfully synced ${resourceType}`, {
        source: sourcePath,
        target: targetPath,
        summary,
      });
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, {
        operation: `syncBundledDirectory for ${resourceType}`,
      });
      throw error;
    }
  }

  public async installGoferCLI(): Promise<void> {
    this.logger.info('ResourceSyncer', 'Installing Gofer CLI resources');

    // Backup existing constitution before creating structure
    const constitutionPath = path.join(this.specifyPath, 'memory', 'constitution.md');
    let existingConstitution: string | null = null;

    try {
      existingConstitution = await fs.readFile(constitutionPath, 'utf-8');
      this.logger.debug('ResourceSyncer', 'Backed up existing constitution');
    } catch (error: unknown) {
      if (isNodeErrorWithCode(error) && error.code === 'ENOENT') {
        this.logger.debug('ResourceSyncer', 'No existing constitution found to preserve');
      } else {
        this.logger.error('ResourceSyncer', error as Error, {
          operation: 'installGoferCLI.readExistingConstitution',
        });
        throw error;
      }
    }

    // Create structure and resources
    await this.createGoferStructure();
    await this.syncCanonicalCommands();
    await this.copyBundledTemplates();
    await this.copyBundledReferences();
    await this.ensureDefaultModelPolicy();

    // Restore constitution if it existed
    if (existingConstitution) {
      await this.writeManagedFile(constitutionPath, existingConstitution);
      this.logger.debug('ResourceSyncer', 'Restored existing constitution');
    }

    // Save version
    const versionFilePath = path.join(this.specifyPath, '.gofer-version');
    await this.writeManagedFile(versionFilePath, await this.getExtensionVersion());

    this.logger.info('ResourceSyncer', 'Gofer CLI resources installed successfully');
  }

  public async createGoferStructure(): Promise<void> {
    this.logger.info('ResourceSyncer', 'Creating Gofer folder structure');

    const folders = [
      'commands',
      'memory',
      'references',
      'scripts/bash',
      'scripts/hooks',
      'scripts/node',
      'scripts/powershell',
      'specs',
      'templates',
    ];

    for (const folder of folders) {
      const folderPath = path.join(this.specifyPath, folder);
      await this.ensureManagedDirectory(folderPath);
    }

    this.logger.debug('ResourceSyncer', 'Created all Gofer folders');
  }

  public async migrateJsonSpecs(): Promise<void> {
    this.logger.info('ResourceSyncer', 'Migrating JSON specs to Markdown');

    try {
      let specNumber = 1;
      let migratedCount = 0;
      const backupDir = path.join(this.specifyPath, '_backup');
      await this.ensureManagedDirectory(backupDir);

      const rootBundlePath = path.join(this.workspacePath, 'specs.json');
      if (await FileUtils.exists(rootBundlePath)) {
        const bundleContent = await fs.readFile(rootBundlePath, 'utf-8');
        const bundle = JSON.parse(bundleContent);
        const bundledSpecs = Array.isArray(bundle?.specs) ? bundle.specs : [];

        for (const spec of bundledSpecs) {
          const specId = this.resolveLegacySpecId(spec, specNumber);
          await this.writeMigratedSpec(spec, specId);
          specNumber++;
          migratedCount++;
        }

        await fs.copyFile(rootBundlePath, path.join(backupDir, 'specs.json'));
        await fs.unlink(rootBundlePath);
      }

      const files = await fs.readdir(this.specifyPath);
      const jsonFiles = files.filter((f) => f.endsWith('.json') && f !== 'spec-schema.json');

      for (const jsonFile of jsonFiles) {
        const jsonPath = path.join(this.specifyPath, jsonFile);
        const content = await fs.readFile(jsonPath, 'utf-8');
        const parsed = JSON.parse(content);

        await fs.copyFile(jsonPath, path.join(backupDir, jsonFile));

        if (this.isLegacySpecDocument(parsed)) {
          const specId = this.resolveLegacySpecId(parsed, specNumber);
          await this.writeMigratedSpec(parsed, specId);
          specNumber++;
          migratedCount++;
        }

        await fs.unlink(jsonPath);
      }

      if (migratedCount === 0) {
        this.logger.debug('ResourceSyncer', 'No JSON specs found to migrate');
        return;
      }

      this.logger.info('ResourceSyncer', `Migrated ${migratedCount} JSON specs to Markdown`);
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, { operation: 'migrateJsonSpecs' });
    }
  }

  public async setupClaudeCommands(): Promise<void> {
    await this.cleanupLegacyGoferCommandFiles();
    await this.copyBundledResources(
      'Claude commands',
      'claude-commands',
      path.join(this.workspacePath, '.claude', 'commands'),
      ['*.md'],
      false
    );
  }

  public async setupClaudeAgents(): Promise<void> {
    await this.copyBundledResources(
      'Claude agents',
      'claude-agents',
      path.join(this.workspacePath, '.claude', 'agents'),
      ['*.md'],
      false
    );
  }

  public async setupClaudeSkills(): Promise<void> {
    await this.syncBundledDirectory(
      'Claude skills',
      'claude-skills',
      path.join(this.workspacePath, '.claude', 'skills')
    );
  }

  public async setupCopilotAgents(): Promise<void> {
    await this.copyBundledResources(
      'VS Code/GitHub Copilot agents',
      'github-agents',
      path.join(this.workspacePath, '.github', 'agents'),
      ['*.agent.md'],
      false
    );
  }

  public async setupCopilotPrompts(): Promise<void> {
    const promptsDir = path.join(this.workspacePath, '.github', 'prompts');

    await this.cleanupLegacyGoferCommandFiles();

    // Migration safety: audit deprecated prompts but do not delete user files.
    await this.cleanupOldCopilotPrompts(promptsDir, false);

    await this.copyBundledResources(
      'Copilot prompts',
      'copilot-prompts',
      promptsDir,
      ['*.prompt.md'],
      false
    );
  }

  public async setupCopilotInstructions(): Promise<void> {
    await this.copyBundledResources(
      'Copilot instructions',
      'copilot-instructions',
      path.join(this.workspacePath, '.github', 'instructions'),
      ['*.instructions.md'],
      false
    );
  }

  public async setupCopilotSkills(): Promise<void> {
    await this.syncBundledDirectory(
      'GitHub Copilot skills',
      'github-skills',
      path.join(this.workspacePath, '.github', 'skills')
    );
  }

  public async setupGeminiCommands(): Promise<void> {
    this.logger.info('ResourceSyncer', 'Copying Gemini CLI extension commands');
    await this.cleanupLegacyGoferCommandFiles();
    await this.syncCanonicalCommands();
    await this.syncBundledDirectory(
      'Gemini CLI commands',
      'gemini',
      path.join(this.workspacePath, '.gemini')
    );
  }

  public async setupCodexSkills(): Promise<void> {
    this.logger.info(
      'ResourceSyncer',
      'Generating Codex skills into the canonical .agents/skills workspace path'
    );

    try {
      await this.cleanupLegacyGoferCommandFiles();
      const { CommandGenerator } = await import('../../council/CommandGenerator');
      const generator = new CommandGenerator(this.workspacePath);
      const workflowProfile = this.resolveWorkflowProfileForGeneration();

      // Generate all Codex skills into the canonical repo-local .agents/skills tree.
      const generatedPaths = await generator.generateCommands('codex', false, {
        workflowProfileOverride: workflowProfile,
        metadataSource: 'extension/src/services/migration/ResourceSyncer.ts',
      });

      this.logger.info('ResourceSyncer', `Generated ${generatedPaths.length} Codex skills`, {
        paths: generatedPaths,
        workflowProfile,
      });
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, {
        operation: 'setupCodexSkills',
      });
      throw error;
    }
  }

  private resolveWorkflowProfileForGeneration(): 'standard' | 'enterpriseai' {
    try {
      return getWorkflowProfile();
    } catch (error: unknown) {
      this.logger.warn(
        'ResourceSyncer',
        `Unable to read workflow profile from configuration, defaulting to standard: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return 'standard';
    }
  }

  private getWorkspaceRoot(): string {
    if (this.workspacePath.trim().length === 0) {
      throw new Error('Workspace path has not been configured');
    }

    return path.resolve(this.workspacePath);
  }

  private isPathWithinWorkspace(targetPath: string): boolean {
    const workspaceRoot = this.getWorkspaceRoot();
    const relativePath = path.relative(workspaceRoot, targetPath);
    return (
      relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
    );
  }

  private resolveManagedWorkspacePath(targetPath: string): string {
    const resolvedTargetPath = path.resolve(targetPath);
    if (!this.isPathWithinWorkspace(resolvedTargetPath)) {
      throw new Error(
        `Managed path escapes workspace root: ${resolvedTargetPath} is outside ${this.getWorkspaceRoot()}`
      );
    }

    return resolvedTargetPath;
  }

  private async ensureManagedDirectory(directoryPath: string): Promise<void> {
    const workspaceRoot = this.getWorkspaceRoot();
    const resolvedDirectoryPath = this.resolveManagedWorkspacePath(directoryPath);
    const relativePath = path.relative(workspaceRoot, resolvedDirectoryPath);

    if (relativePath === '') {
      return;
    }

    let currentPath = workspaceRoot;
    for (const segment of relativePath.split(path.sep)) {
      currentPath = path.join(currentPath, segment);
      try {
        const stats = await fs.lstat(currentPath);
        if (stats.isSymbolicLink()) {
          throw new Error(`Refusing to traverse symlinked managed path: ${currentPath}`);
        }
        if (!stats.isDirectory()) {
          throw new Error(`Managed directory path is occupied by a non-directory: ${currentPath}`);
        }
      } catch (error: unknown) {
        if (isNodeErrorWithCode(error) && error.code === 'ENOENT') {
          await fs.mkdir(currentPath);
          continue;
        }
        throw error;
      }
    }
  }

  private async getManagedFileState(targetPath: string): Promise<ManagedFileState> {
    const resolvedTargetPath = this.resolveManagedWorkspacePath(targetPath);
    await this.ensureManagedDirectory(path.dirname(resolvedTargetPath));

    try {
      const stats = await fs.lstat(resolvedTargetPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`Refusing to write through symlinked managed file: ${resolvedTargetPath}`);
      }
      if (!stats.isFile()) {
        throw new Error(`Managed file path is occupied by a non-file: ${resolvedTargetPath}`);
      }

      return {
        exists: true,
        executable: (stats.mode & 0o111) === 0o111,
      };
    } catch (error: unknown) {
      if (isNodeErrorWithCode(error) && error.code === 'ENOENT') {
        return { exists: false, executable: false };
      }
      throw error;
    }
  }

  private async writeManagedFile(
    targetPath: string,
    content: string | Buffer,
    makeExecutable: boolean = false
  ): Promise<void> {
    const resolvedTargetPath = this.resolveManagedWorkspacePath(targetPath);
    const parentDirectory = path.dirname(resolvedTargetPath);
    await this.ensureManagedDirectory(parentDirectory);

    try {
      const existingStats = await fs.lstat(resolvedTargetPath);
      if (existingStats.isSymbolicLink()) {
        throw new Error(`Refusing to write through symlinked managed file: ${resolvedTargetPath}`);
      }
      if (!existingStats.isFile()) {
        throw new Error(`Managed file path is occupied by a non-file: ${resolvedTargetPath}`);
      }
    } catch (error: unknown) {
      if (!(isNodeErrorWithCode(error) && error.code === 'ENOENT')) {
        throw error;
      }
    }

    const temporaryPath = path.join(
      parentDirectory,
      `.gofer-sync-${path.basename(resolvedTargetPath)}-${process.pid}-${Date.now()}.tmp`
    );
    let tempWritten = false;

    try {
      await fs.writeFile(temporaryPath, content);
      tempWritten = true;
      if (makeExecutable) {
        await fs.chmod(temporaryPath, 0o755);
      }
      await fs.rename(temporaryPath, resolvedTargetPath);
    } catch (error) {
      if (tempWritten) {
        try {
          await fs.rm(temporaryPath, { force: true });
        } catch (cleanupError) {
          this.logger.warn(
            'ResourceSyncer',
            `Failed to clean up temporary managed file ${temporaryPath}: ${
              cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            }`
          );
        }
      }
      throw error;
    }
  }

  private async upsertFileFromSource(
    sourcePath: string,
    targetPath: string,
    makeExecutable: boolean = false
  ): Promise<'copied' | 'updated' | 'unchanged'> {
    const sourceContent = await fs.readFile(sourcePath);
    const targetState = await this.getManagedFileState(targetPath);

    if (targetState.exists) {
      const targetContent = await fs.readFile(targetPath);
      if (Buffer.compare(sourceContent, targetContent) === 0) {
        if (makeExecutable && !targetState.executable) {
          await this.writeManagedFile(targetPath, sourceContent, true);
          return 'updated';
        }
        return 'unchanged';
      }
    }

    await this.writeManagedFile(targetPath, sourceContent, makeExecutable);

    return targetState.exists ? 'updated' : 'copied';
  }

  private async syncDirectoryNonDestructive(
    sourcePath: string,
    targetPath: string,
    makeExecutableExtensions: readonly string[] = []
  ): Promise<NonDestructiveSyncSummary> {
    const summary: NonDestructiveSyncSummary = {
      copied: 0,
      updated: 0,
      unchanged: 0,
    };

    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    await this.ensureManagedDirectory(targetPath);

    for (const entry of entries) {
      const sourceEntryPath = path.join(sourcePath, entry.name);
      const targetEntryPath = path.join(targetPath, entry.name);

      if (entry.isDirectory()) {
        const childSummary = await this.syncDirectoryNonDestructive(
          sourceEntryPath,
          targetEntryPath,
          makeExecutableExtensions
        );
        summary.copied += childSummary.copied;
        summary.updated += childSummary.updated;
        summary.unchanged += childSummary.unchanged;
        continue;
      }

      const makeExecutable = makeExecutableExtensions.some((extension) =>
        entry.name.endsWith(extension)
      );
      const action = await this.upsertFileFromSource(
        sourceEntryPath,
        targetEntryPath,
        makeExecutable
      );
      if (action === 'copied') {
        summary.copied++;
      } else if (action === 'updated') {
        summary.updated++;
      } else {
        summary.unchanged++;
      }
    }

    return summary;
  }

  /**
   * Setup global Codex symlink for CLI access from any directory
   *
   * Creates symlink: ~/.codex/skills/{project-name} -> {workspace}/.agents/skills
   * This enables Codex CLI to discover Gofer skills globally without needing
   * to be run from the workspace directory.
   */
  public async setupCodexGlobalSymlink(): Promise<void> {
    this.logger.info('ResourceSyncer', 'Setting up global Codex CLI symlink');

    try {
      const homeDir = os.homedir();
      const codexSkillsDir = path.join(homeDir, '.codex', 'skills');
      const targetPath = path.join(this.workspacePath, '.agents', 'skills');
      const symlinkPath = await this.resolveCodexGlobalSymlinkPath(codexSkillsDir, targetPath);

      // Check if source directory exists
      const sourceExists = await FileUtils.exists(targetPath);
      if (!sourceExists) {
        this.logger.warn('ResourceSyncer', 'Codex skills directory does not exist yet', {
          path: targetPath,
        });
        return;
      }

      // Ensure ~/.codex/skills directory exists
      await fs.mkdir(codexSkillsDir, { recursive: true });

      let needsCreation = true;
      try {
        const stats = await fs.lstat(symlinkPath);
        if (stats.isSymbolicLink()) {
          const currentTarget = await fs.readlink(symlinkPath);
          const resolvedCurrent = path.resolve(path.dirname(symlinkPath), currentTarget);
          const resolvedTarget = path.resolve(targetPath);

          if (resolvedCurrent === resolvedTarget) {
            this.logger.info(
              'ResourceSyncer',
              'Codex global symlink already exists and is correct',
              {
                symlink: symlinkPath,
                target: targetPath,
              }
            );
            needsCreation = false;
          } else {
            this.logger.warn('ResourceSyncer', 'Resolved Codex symlink path is occupied', {
              symlink: symlinkPath,
              current: currentTarget,
              target: targetPath,
            });
            return;
          }
        } else {
          this.logger.warn('ResourceSyncer', 'Resolved Codex symlink path is not a symlink', {
            path: symlinkPath,
          });
          return;
        }
      } catch (error: unknown) {
        // Symlink doesn't exist, which is fine
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // Create symlink if needed
      if (needsCreation) {
        // Windows requires 'junction' type for directories without admin privileges
        // Unix systems use default 'dir' symlink
        const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';

        await fs.symlink(targetPath, symlinkPath, symlinkType);

        this.logger.info('ResourceSyncer', 'Created global Codex CLI symlink', {
          symlink: symlinkPath,
          target: targetPath,
          type: symlinkType,
        });
      }

      const repairedEntries = await this.repairDisabledCodexSkillConfigEntries(
        symlinkPath,
        targetPath
      );

      const linkName = path.basename(symlinkPath);
      const repairSuffix =
        repairedEntries > 0 ? ` Re-enabled ${repairedEntries} disabled skill config entries.` : '';

      void vscode.window.showInformationMessage(
        `Codex CLI access enabled for "${linkName}". Restart Codex to refresh skills.${repairSuffix}`,
        'Dismiss'
      );
    } catch (error) {
      // Non-blocking error: Log but don't throw
      // Users can still use Codex from the workspace directory
      this.logger.error('ResourceSyncer', error as Error, {
        operation: 'setupCodexGlobalSymlink',
        note: 'Codex CLI will still work from workspace directory',
      });

      // Show user-friendly error (Windows admin rights, permission issues, etc.)
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error creating symlink';

      void vscode.window.showWarningMessage(
        `Could not enable Codex CLI global access: ${errorMessage}. You can still use Codex from the workspace directory.`,
        'Dismiss'
      );
    }
  }

  public async isCodexGlobalSymlinkCurrent(): Promise<boolean> {
    const targetPath = path.join(this.workspacePath, '.agents', 'skills');
    if (!(await FileUtils.exists(targetPath))) {
      return false;
    }

    const codexSkillsDir = path.join(os.homedir(), '.codex', 'skills');
    const symlinkPath = await this.resolveCodexGlobalSymlinkPath(codexSkillsDir, targetPath);

    try {
      const stats = await fs.lstat(symlinkPath);
      if (!stats.isSymbolicLink()) {
        return false;
      }

      const currentTarget = await fs.readlink(symlinkPath);
      const resolvedCurrent = path.resolve(path.dirname(symlinkPath), currentTarget);
      return resolvedCurrent === path.resolve(targetPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  public async hasDisabledCodexSkillEntries(): Promise<boolean> {
    const targetPath = path.join(this.workspacePath, '.agents', 'skills');
    if (!(await FileUtils.exists(targetPath))) {
      return false;
    }

    const codexSkillsDir = path.join(os.homedir(), '.codex', 'skills');
    const symlinkPath = await this.resolveCodexGlobalSymlinkPath(codexSkillsDir, targetPath);
    const managedSkillPaths = await this.collectManagedCodexSkillPaths(symlinkPath, targetPath);
    if (managedSkillPaths.size === 0) {
      return false;
    }

    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const result = enableManagedCodexSkillConfigEntries(configContent, managedSkillPaths);
      return result.changedEntries > 0;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  private async resolveCodexGlobalSymlinkPath(
    codexSkillsDir: string,
    targetPath: string
  ): Promise<string> {
    const existingPath = await this.findExistingCodexSymlinkToTarget(codexSkillsDir, targetPath);
    if (existingPath) {
      return existingPath;
    }

    const workspaceName = this.sanitizeCodexBundleName(path.basename(this.workspacePath));
    const parentName = this.sanitizeCodexBundleName(
      path.basename(path.dirname(this.workspacePath))
    );
    const hash = createHash('sha256')
      .update(path.resolve(this.workspacePath))
      .digest('hex')
      .slice(0, 8);
    const candidateNames = [
      workspaceName,
      parentName ? `${parentName}-${workspaceName}` : workspaceName,
      `${workspaceName}-${hash}`,
    ];

    for (const candidateName of candidateNames) {
      const candidatePath = path.join(codexSkillsDir, candidateName);
      if (await this.isCodexSymlinkCandidateAvailable(candidatePath, targetPath)) {
        return candidatePath;
      }
    }

    return path.join(codexSkillsDir, `${workspaceName}-${hash}`);
  }

  private async findExistingCodexSymlinkToTarget(
    codexSkillsDir: string,
    targetPath: string
  ): Promise<string | null> {
    try {
      const entries = await fs.readdir(codexSkillsDir);
      for (const entry of entries) {
        const candidatePath = path.join(codexSkillsDir, entry);
        try {
          const stats = await fs.lstat(candidatePath);
          if (!stats.isSymbolicLink()) {
            continue;
          }

          const currentTarget = await fs.readlink(candidatePath);
          const resolvedCurrent = path.resolve(path.dirname(candidatePath), currentTarget);
          if (resolvedCurrent === path.resolve(targetPath)) {
            return candidatePath;
          }
        } catch {
          continue;
        }
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return null;
  }

  private async isCodexSymlinkCandidateAvailable(
    candidatePath: string,
    targetPath: string
  ): Promise<boolean> {
    try {
      const stats = await fs.lstat(candidatePath);
      if (!stats.isSymbolicLink()) {
        return false;
      }

      const currentTarget = await fs.readlink(candidatePath);
      const resolvedCurrent = path.resolve(path.dirname(candidatePath), currentTarget);
      return resolvedCurrent === path.resolve(targetPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return true;
      }
      throw error;
    }
  }

  private sanitizeCodexBundleName(name: string): string {
    const sanitized = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return sanitized || 'gofer';
  }

  private async repairDisabledCodexSkillConfigEntries(
    symlinkPath: string,
    targetPath: string
  ): Promise<number> {
    const managedSkillPaths = await this.collectManagedCodexSkillPaths(symlinkPath, targetPath);
    if (managedSkillPaths.size === 0) {
      return 0;
    }

    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const result = enableManagedCodexSkillConfigEntries(configContent, managedSkillPaths);
      if (result.changedEntries === 0) {
        return 0;
      }

      await fs.writeFile(configPath, result.content, 'utf-8');
      this.logger.info('ResourceSyncer', 'Re-enabled disabled Codex skill config entries', {
        configPath,
        changedEntries: result.changedEntries,
      });
      return result.changedEntries;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 0;
      }
      throw error;
    }
  }

  private async collectManagedCodexSkillPaths(
    symlinkPath: string,
    targetPath: string
  ): Promise<Set<string>> {
    const relativeSkillPaths = await this.collectSkillRelativePaths(targetPath);
    const managedPaths = new Set<string>();

    for (const relativeSkillPath of relativeSkillPaths) {
      managedPaths.add(path.resolve(symlinkPath, relativeSkillPath).replace(/\\/g, '/'));
      managedPaths.add(path.resolve(targetPath, relativeSkillPath).replace(/\\/g, '/'));
    }

    return managedPaths;
  }

  private async collectSkillRelativePaths(rootPath: string): Promise<string[]> {
    const skillPaths: string[] = [];

    const walk = async (directoryPath: string, relativePath: string): Promise<void> => {
      const entries = await fs.readdir(directoryPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryRelativePath = path.join(relativePath, entry.name);
        const entryPath = path.join(directoryPath, entry.name);

        if (entry.isDirectory()) {
          await walk(entryPath, entryRelativePath);
          continue;
        }

        if (entry.isFile() && entry.name === 'SKILL.md') {
          skillPaths.push(entryRelativePath);
        }
      }
    };

    await walk(rootPath, '');
    return skillPaths;
  }

  public async setupDefaultInstructions(): Promise<void> {
    try {
      const { ProjectDetector } = await import('../ProjectDetector');
      const { InstructionGenerator } = await import('../InstructionGenerator');

      const projectInfo = await ProjectDetector.detect(this.workspacePath);
      const generator = new InstructionGenerator();

      // AGENTS.md at workspace root
      const agentsPath = path.join(this.workspacePath, 'AGENTS.md');
      if (!(await FileUtils.exists(agentsPath))) {
        const agentsContent = await generator.generateAgentsMd(projectInfo);
        await this.writeManagedFile(agentsPath, agentsContent);
        this.logger.info('ResourceSyncer', 'Created AGENTS.md');
      }

      // CLAUDE.md at workspace root
      const claudePath = path.join(this.workspacePath, 'CLAUDE.md');
      if (!(await FileUtils.exists(claudePath))) {
        const claudeContent = await generator.generateClaudeMd(projectInfo);
        await this.writeManagedFile(claudePath, claudeContent);
        this.logger.info('ResourceSyncer', 'Created CLAUDE.md');
      }

      // .github/copilot-instructions.md
      const copilotPath = path.join(this.workspacePath, '.github', 'copilot-instructions.md');
      if (!(await FileUtils.exists(copilotPath))) {
        await this.ensureManagedDirectory(path.join(this.workspacePath, '.github'));
        const copilotContent = await generator.generateCopilotMd(projectInfo);
        await this.writeManagedFile(copilotPath, copilotContent);
        this.logger.info('ResourceSyncer', 'Created .github/copilot-instructions.md');
      }
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, {
        operation: 'setupDefaultInstructions',
      });
    }
  }

  public async createBashScripts(): Promise<void> {
    await this.copyBundledResources('bash scripts', 'bash-scripts', 'scripts/bash', ['*.sh'], true);
  }

  public async createNodeScripts(): Promise<void> {
    await this.syncBundledDirectory(
      'Node.js scripts',
      'node-scripts',
      path.join(this.specifyPath, 'scripts', 'node'),
      ['.js', '.mjs']
    );
  }

  public async createPowerShellScripts(): Promise<void> {
    await this.copyBundledResources(
      'PowerShell scripts',
      'powershell-scripts',
      'scripts/powershell',
      ['*.ps1'],
      false
    );
  }

  public async createVSCodeSettings(): Promise<void> {
    try {
      this.logger.info('ResourceSyncer', 'Creating VSCode settings');

      const vscodeDir = path.join(this.workspacePath, '.vscode');
      const settingsPath = path.join(vscodeDir, 'settings.json');

      await this.ensureManagedDirectory(vscodeDir);

      // Read existing settings or start with empty object
      let settings: Record<string, unknown> = {};
      try {
        const existingContent = await fs.readFile(settingsPath, 'utf-8');
        settings = JSON.parse(existingContent);
        this.logger.debug('ResourceSyncer', 'Loaded existing settings');
      } catch (error: unknown) {
        if (isNodeErrorWithCode(error) && error.code === 'ENOENT') {
          this.logger.info('ResourceSyncer', 'No existing settings found, creating new');
        } else if (error instanceof SyntaxError) {
          this.logger.warn(
            'ResourceSyncer',
            `Existing settings.json is invalid JSON, recreating defaults: ${error.message}`
          );
        } else {
          this.logger.error('ResourceSyncer', error as Error, {
            operation: 'createVSCodeSettings.readExistingSettings',
          });
          throw error;
        }
      }

      // Add Gofer specific settings
      const goferSettings: Record<string, Record<string, unknown>> = {
        'files.associations': {
          '**/.specify/**/*.md': 'markdown',
          '**/.claude/commands/*.md': 'markdown',
        },
        'search.exclude': {
          '**/.specify/_backup/**': true,
          '**/.specify/_archive/**': true,
        },
        'files.exclude': {
          '**/.specify/_backup/**': true,
        },
      };

      // Merge settings (don't overwrite existing)
      for (const [key, value] of Object.entries(goferSettings)) {
        if (!settings[key]) {
          settings[key] = value;
          this.logger.debug('ResourceSyncer', `Added setting: ${key}`);
        } else {
          // Merge nested objects
          settings[key] = { ...value, ...(settings[key] as Record<string, unknown>) };
          this.logger.debug('ResourceSyncer', `Merged setting: ${key}`);
        }
      }

      // Write back to file
      await this.writeManagedFile(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      this.logger.info('ResourceSyncer', 'Successfully updated .vscode/settings.json');
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, { operation: 'createVSCodeSettings' });
    }
  }

  public async fixExistingSpecs(): Promise<void> {
    const specsDir = path.join(this.specifyPath, 'specs');

    try {
      const entries = await fs.readdir(specsDir, { withFileTypes: true });
      const specDirs = entries.filter((e) => e.isDirectory());

      for (const specDir of specDirs) {
        const specPath = path.join(specsDir, specDir.name);
        const specFile = path.join(specPath, 'spec.md');
        const tasksFile = path.join(specPath, 'tasks.md');

        // Fix spec.md - add or update YAML frontmatter to modern format
        try {
          let specContent = await fs.readFile(specFile, 'utf-8');
          let needsUpdate = false;
          let title = specDir.name;
          let status = 'draft';
          let created = new Date().toISOString().split('T')[0];
          let updated = new Date().toISOString().split('T')[0];
          let priority = 'medium';
          let assignee = 'engineer-agent';

          // Check if it has YAML frontmatter
          const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
          const frontmatterMatch = specContent.match(frontmatterRegex);

          if (frontmatterMatch) {
            const existingYaml = frontmatterMatch[1];
            const bodyContent = frontmatterMatch[2];
            const existingData = yaml.parse(existingYaml);

            // Check if using old format (feature: instead of id: and title:)
            if (existingData.feature && (!existingData.id || !existingData.title)) {
              this.logger.debug(
                'ResourceSyncer',
                `Converting ${specDir.name}/spec.md from old format to modern format`
              );
              needsUpdate = true;

              const titleMatch = bodyContent.match(/^#\s+(?:Feature Overview:\s*)?(.+)$/m);
              title = titleMatch
                ? titleMatch[1].replace('Feature Specification:', '').trim()
                : existingData.feature;

              status = existingData.status || status;
              created = existingData.created || created;
              updated = new Date().toISOString().split('T')[0];
              priority = existingData.priority || priority;
              assignee = existingData.assignee || assignee;

              const newFrontmatter = `---\nid: "${specDir.name}"\ntitle: "${title}"\nstatus: "${status}"\ncreated: "${created}"\nupdated: "${updated}"\npriority: "${priority}"\nassignee: "${assignee}"\n---\n\n`;
              specContent = newFrontmatter + bodyContent;
            } else if (existingData.id && existingData.title) {
              const existingUpdated = existingData.updated || '';
              const today = new Date().toISOString().split('T')[0];

              if (existingUpdated !== today) {
                this.logger.info('ResourceSyncer', `Updating timestamp in ${specDir.name}/spec.md`);
                needsUpdate = true;

                title = existingData.title;
                status = existingData.status || status;
                created = existingData.created || created;
                updated = today;
                priority = existingData.priority || priority;
                assignee = existingData.assignee || assignee;

                const newFrontmatter = `---\nid: "${specDir.name}"\ntitle: "${title}"\nstatus: "${status}"\ncreated: "${created}"\nupdated: "${updated}"\npriority: "${priority}"\nassignee: "${assignee}"\n---\n\n`;
                specContent = newFrontmatter + bodyContent;
              }
            }
          } else {
            // No YAML frontmatter - add it
            this.logger.debug(
              'ResourceSyncer',
              `Adding YAML frontmatter to ${specDir.name}/spec.md`
            );
            needsUpdate = true;

            const titleMatch = specContent.match(/^#\s+(?:Feature Specification:\s*)?(.+)$/m);
            if (titleMatch) {
              title = titleMatch[1].replace('Feature Specification:', '').trim();
            }

            const statusMatch = specContent.match(/\*\*Status\*\*:\s*(\w+)/i);
            if (statusMatch) {
              status = statusMatch[1].toLowerCase();
            }

            const createdMatch = specContent.match(/\*\*Created\*\*:\s*(\d{4}-\d{2}-\d{2})/i);
            if (createdMatch) {
              created = createdMatch[1];
            }

            const frontmatter = `---\nid: "${specDir.name}"\ntitle: "${title}"\nstatus: "${status}"\ncreated: "${created}"\nupdated: "${updated}"\npriority: "${priority}"\nassignee: "${assignee}"\n---\n\n`;
            specContent = frontmatter + specContent;
          }

          if (needsUpdate) {
            await this.writeManagedFile(specFile, specContent);
            this.logger.debug('ResourceSyncer', `Updated ${specDir.name}/spec.md`);
          }
        } catch (error: unknown) {
          if (isNodeErrorWithCode(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
            this.logger.debug('ResourceSyncer', `No spec.md found for ${specDir.name}`);
          } else {
            this.logger.error('ResourceSyncer', error as Error, {
              operation: 'fixExistingSpecs.readSpec',
              spec: specDir.name,
            });
          }
        }

        // Fix tasks.md - ensure it has checkbox task list
        try {
          let tasksContent = await fs.readFile(tasksFile, 'utf-8');
          const hasCheckboxes = /^-\s+\[[xX ]\]\s+T\d+/m.test(tasksContent);

          if (!hasCheckboxes) {
            this.logger.debug(
              'ResourceSyncer',
              `Adding checkbox task list to ${specDir.name}/tasks.md`
            );

            const taskMatches = tasksContent.matchAll(
              /###\s+(T\d+)[^\n]*\n[^\n]*\n\*\*Status\*\*:\s*([^*\n]+)/g
            );
            const tasks: Array<{ id: string; completed: boolean }> = [];

            for (const match of taskMatches) {
              const id = match[1];
              const statusStr = match[2].toLowerCase();
              const completed = statusStr.includes('complet') || statusStr.includes('\u2705');
              tasks.push({ id, completed });
            }

            if (tasks.length > 0) {
              let checkboxList = '\n## Task List\n\n';
              for (const task of tasks) {
                const checkbox = task.completed ? '[x]' : '[ ]';
                checkboxList += `- ${checkbox} ${task.id}\n`;
              }
              checkboxList += '\n';

              const headingMatch = tasksContent.match(/^(#[^\n]+\n)/);
              if (headingMatch) {
                tasksContent = tasksContent.replace(
                  headingMatch[0],
                  headingMatch[0] + checkboxList
                );
                await this.writeManagedFile(tasksFile, tasksContent);
              }
            }
          }
        } catch (error: unknown) {
          if (isNodeErrorWithCode(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
            this.logger.debug('ResourceSyncer', `No tasks.md found for ${specDir.name}`);
          } else {
            this.logger.error('ResourceSyncer', error as Error, {
              operation: 'fixExistingSpecs.readTasks',
              spec: specDir.name,
            });
          }
        }
      }

      this.logger.debug('ResourceSyncer', 'All existing specs have been reviewed and fixed');
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, { operation: 'fixExistingSpecs' });
    }
  }

  public async fixSpecPathReferences(): Promise<void> {
    // This will be handled by PathMigrator (T029)
    this.logger.debug('ResourceSyncer', 'Path fixing delegated to PathMigrator');
  }

  public async fixClaudeCommands(): Promise<void> {
    try {
      this.logger.debug('ResourceSyncer', 'Checking Claude commands for updates...');

      const claudeCommandsDir = path.join(this.workspacePath, '.claude', 'commands');
      const tasksCommandPath = path.join(claudeCommandsDir, 'gofer.tasks.md');

      let content: string;
      try {
        content = await fs.readFile(tasksCommandPath, 'utf-8');
      } catch (error: unknown) {
        if (isNodeErrorWithCode(error) && error.code === 'ENOENT') {
          this.logger.debug('ResourceSyncer', 'gofer.tasks.md not found, skipping check');
          return;
        }
        throw error;
      }

      const originalContent = content;
      let needsUpdate = false;

      // Check if it includes the issues.md generation step
      if (!content.includes('generate-issues.js')) {
        this.logger.debug('ResourceSyncer', 'gofer.tasks.md is missing issues.md generation step');
        needsUpdate = true;

        const reportSectionRegex = /(\d+)\.\s+\*\*Report\*\*:/;
        const reportMatch = content.match(reportSectionRegex);

        if (reportMatch) {
          const reportNumber = parseInt(reportMatch[1]);
          const issuesNumber = reportNumber;
          const newReportNumber = reportNumber + 1;

          const issuesSection = `${issuesNumber}. **Generate issues.md**: After creating tasks.md, run the issues generator:

   \`\`\`bash
   node .specify/scripts/node/generate-issues.js "$FEATURE_DIR"
   \`\`\`

   This will create issues.md with GitHub-ready issue definitions for each task.

${newReportNumber}. **Report**: Output path to generated tasks.md and issues.md with summary:
   - Total task count
   - Task count per user story
   - Parallel opportunities identified
   - Independent test criteria for each story
   - Suggested MVP scope (typically just User Story 1)
   - Format validation: Confirm ALL tasks follow the checklist format (checkbox, ID, labels, file paths)
   - Issues.md confirmation: Number of GitHub issues generated`;

          content = content.replace(
            /\d+\.\s+\*\*Report\*\*:[^\n]*\n(?:   - [^\n]*\n)*/,
            issuesSection
          );
          this.logger.debug('ResourceSyncer', 'Added issues.md generation step to gofer.tasks.md');
        } else {
          this.logger.warn('ResourceSyncer', 'Could not find Report section to update');
          needsUpdate = false;
        }
      }

      if (needsUpdate && content !== originalContent) {
        await this.writeManagedFile(tasksCommandPath, content);
        this.logger.debug('ResourceSyncer', 'Updated gofer.tasks.md with issues generation');
      } else if (content.includes('generate-issues.js')) {
        this.logger.debug('ResourceSyncer', 'gofer.tasks.md already includes issues generation');
      }
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, { operation: 'fixClaudeCommands' });
    }
  }

  public async createReadme(): Promise<void> {
    const readme = `# Gofer - Specification Directory

This folder contains all project specifications for AI-driven feature development.

## Structure

- **memory/** - Constitution, decisions, and project principles
- **specs/** - Feature specifications (numbered: 001-feature-name/)
- **templates/** - Templates for specs, plans, and tasks
- **scripts/** - Helper scripts for workflow automation
- **logs/** - Execution logs (council usage, etc.)

## Quick Start

### Using VSCode Extension

1. Open Command Palette (\`Cmd/Ctrl+Shift+P\`)
2. Run: **"Gofer: Create New Specification"**
3. Follow the prompts to create your feature spec

### Using Claude Code (Recommended)

Run the unified Gofer pipeline with a single command:

\`\`\`
/0_gofer_start Add user authentication with OAuth2 and JWT
\`\`\`

This automatically chains through all stages:
1. **Research** → Explores codebase and technology
2. **Specify** → Creates spec.md from requirements
3. **Plan** → Generates architecture and design
4. **Tasks** → Breaks down into executable tasks
5. **Implement** → Executes tasks phase by phase
6. **Validate** → Runs the terminal quality gate, including engineering review

## Core Gofer Pipeline

| Stage | Command | Output |
|-------|---------|--------|
| 0. Business scenario | \`/0_gofer_start\` | Pipeline kickoff |
| 1. Research | \`/1_gofer_research\` | research.md |
| 2. Specify | \`/2_gofer_specify\` | spec.md |
| 3. Plan | \`/3_gofer_plan\` | plan.md, data-model.md, contracts/ |
| 4. Tasks | \`/4_gofer_tasks\` | tasks.md, traceability.md, issues.md |
| 5. Implement | \`/5_gofer_implement\` | Source code |
| 6. Validate | \`/6_gofer_validate\` | Validation artifacts |

All artifacts are stored in: \`.specify/specs/{feature}/\`

Optional helpers such as \`/0a_problem_validation\`, \`/7_gofer_save\`,
\`/8_gofer_branding\`, and \`/7a_stakeholder_comms\` support the workflow without
adding extra core pipeline stages.

## Model Policy

Gofer creates a user-owned model policy at
\`.specify/memory/gofer-model-policy.yaml\` from the shipped
\`.specify/templates/gofer-model-policy.yaml\` template. Edit the memory copy to
tune simple, medium, hard, and arbiter model routes for Claude, Codex/OpenAI,
Gemini, and Copilot. Bootstrap should not overwrite local edits.

## Constitution

Define your project principles in \`memory/constitution.md\`:
- Coding standards and patterns
- Technology choices
- Security requirements
- Testing policies

AI agents validate code against the constitution before and during the final
\`/6_gofer_validate\` quality gate.

## Learn More

- **Full Documentation**: https://github.com/eai-tools/eai-gofer
- **AI Agent Guidelines**: See AGENTS.md in your project root
- **Gofer Extension**: View specs and progress in VSCode sidebar
`;

    await this.writeManagedFile(path.join(this.specifyPath, 'README.md'), readme);
    this.logger.info('ResourceSyncer', 'Created README.md');
  }

  public async updateGitignore(): Promise<void> {
    try {
      this.logger.info('ResourceSyncer', 'Updating .gitignore');

      const gitignorePath = path.join(this.workspacePath, '.gitignore');

      const requiredEntries = [
        '.specify/hooks/',
        '.specify/memory/local.json',
        '.specify/memory/dependency-graph.json',
        '.specify/specs/*/.branch-info.json',
        '.specify/logs/',
        '.specify/memory/checkpoints/',
        '.specify/memory/context-health-state.json',
        '.specify/memory/observation-cache/',
        '.specify/specs/*/research-index.json',
      ];

      let gitignoreContent = '';
      try {
        gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
        this.logger.debug('ResourceSyncer', 'Found existing .gitignore');
      } catch (error: unknown) {
        if (isNodeErrorWithCode(error) && error.code === 'ENOENT') {
          this.logger.info('ResourceSyncer', 'No .gitignore found, creating new one');
        } else {
          this.logger.error('ResourceSyncer', error as Error, {
            operation: 'updateGitignore.readExisting',
          });
          throw error;
        }
      }

      const missingEntries = requiredEntries.filter((entry) => !gitignoreContent.includes(entry));

      if (missingEntries.length === 0) {
        this.logger.debug(
          'ResourceSyncer',
          '.gitignore already contains all Gofer runtime entries'
        );
        return;
      }

      let updatedContent = gitignoreContent;

      if (updatedContent.length > 0 && !updatedContent.endsWith('\n')) {
        updatedContent += '\n';
      }

      const hasOldHeader = updatedContent.includes('# Gofer state files');
      const hasNewHeader = updatedContent.includes('# Gofer runtime files');

      if (!hasOldHeader && !hasNewHeader) {
        updatedContent += '\n# Gofer runtime files (auto-generated, should not be committed)\n';
        for (const entry of missingEntries) {
          updatedContent += entry + '\n';
        }
        this.logger.debug(
          'ResourceSyncer',
          `Added Gofer runtime section with ${missingEntries.length} entries`
        );
      } else {
        for (const entry of missingEntries) {
          updatedContent += entry + '\n';
          this.logger.debug('ResourceSyncer', `Added missing entry: ${entry}`);
        }
      }

      await this.writeManagedFile(gitignorePath, updatedContent);
      this.logger.info('ResourceSyncer', 'Successfully updated .gitignore');
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, { operation: 'updateGitignore' });
    }
  }

  public async installHooksConfig(): Promise<void> {
    try {
      this.logger.info('ResourceSyncer', 'Installing hooks configuration');

      const claudeDir = path.join(this.workspacePath, '.claude');
      const settingsPath = path.join(claudeDir, 'settings.json');

      await this.ensureManagedDirectory(claudeDir);

      const hooksConfig: Record<string, unknown[]> = {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node "$CLAUDE_PROJECT_DIR/.specify/scripts/hooks/user-prompt-submit.mjs"',
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: 'node "$CLAUDE_PROJECT_DIR/.specify/scripts/hooks/post-tool-use.mjs"',
              },
            ],
          },
        ],
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node "$CLAUDE_PROJECT_DIR/.specify/scripts/hooks/agent-stop.mjs"',
              },
            ],
          },
        ],
      };

      let settings: Record<string, unknown> = {};
      try {
        const existing = await fs.readFile(settingsPath, 'utf-8');
        settings = JSON.parse(existing);
        this.logger.debug('ResourceSyncer', 'Loaded existing settings.json');
      } catch (error: unknown) {
        if (isNodeErrorWithCode(error) && error.code === 'ENOENT') {
          this.logger.info('ResourceSyncer', 'No existing settings.json, creating new');
        } else if (error instanceof SyntaxError) {
          this.logger.warn(
            'ResourceSyncer',
            `Existing .claude/settings.json is invalid JSON, recreating hooks config: ${error.message}`
          );
        } else {
          this.logger.error('ResourceSyncer', error as Error, {
            operation: 'installHooksConfig.readSettings',
          });
          throw error;
        }
      }

      // Always overwrite hooks to ensure latest format
      const existingHooks = (settings.hooks as Record<string, unknown>) || {};

      for (const [hookName, hookConfig] of Object.entries(hooksConfig)) {
        existingHooks[hookName] = hookConfig;
        this.logger.debug('ResourceSyncer', `Set ${hookName} hook`);
      }

      settings.hooks = existingHooks;
      await this.writeManagedFile(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      this.logger.info('ResourceSyncer', 'Successfully wrote .claude/settings.json');

      // Ensure hook scripts directory exists and copy scripts
      const hooksScriptDir = path.join(this.specifyPath, 'scripts', 'hooks');
      await this.ensureManagedDirectory(hooksScriptDir);

      await this.copyHookScripts();
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, { operation: 'installHooksConfig' });
    }
  }

  /**
   * Copy hook scripts from bundled extension resources to .specify/scripts/hooks/
   */
  private async copyHookScripts(): Promise<void> {
    try {
      const extensionPath = this.getExtensionPath();
      if (!extensionPath) {
        this.logger.warn('ResourceSyncer', 'Could not find extension path for hook scripts');
        return;
      }

      const bundledHooksPath = path.join(extensionPath, 'resources', 'hook-scripts');
      const targetHooksPath = path.join(this.specifyPath, 'scripts', 'hooks');

      this.logger.debug('ResourceSyncer', 'Hook script paths', {
        source: bundledHooksPath,
        target: targetHooksPath,
      });

      await this.ensureManagedDirectory(targetHooksPath);

      try {
        const files = await fs.readdir(bundledHooksPath);
        let copiedCount = 0;
        for (const file of files) {
          if (file.endsWith('.mjs')) {
            const source = path.join(bundledHooksPath, file);
            const target = path.join(targetHooksPath, file);
            await this.upsertFileFromSource(source, target);
            copiedCount++;
            this.logger.debug('ResourceSyncer', `Copied: ${file}`);
          }
        }
        this.logger.info('ResourceSyncer', `Successfully copied ${copiedCount} hook scripts`);
      } catch (error: unknown) {
        if (isNodeErrorWithCode(error) && error.code === 'ENOENT') {
          this.logger.debug(
            'ResourceSyncer',
            `No bundled hook scripts found at ${bundledHooksPath}`
          );
        } else {
          this.logger.error('ResourceSyncer', error as Error, {
            operation: 'copyHookScripts.readBundledHooks',
            source: bundledHooksPath,
          });
          throw error;
        }
      }
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, { operation: 'copyHookScripts' });
    }
  }

  public async copyBundledTemplates(): Promise<void> {
    await this.copyBundledResources(
      'templates',
      'templates',
      'templates',
      ['*.md', '*.yaml'],
      false
    );
  }

  public async copyBundledReferences(): Promise<void> {
    await this.syncBundledDirectory(
      'public references',
      'references',
      path.join(this.specifyPath, 'references')
    );
  }

  public async ensureDefaultModelPolicy(): Promise<void> {
    try {
      const targetPath = path.join(this.specifyPath, 'memory', 'gofer-model-policy.yaml');
      if (await FileUtils.exists(targetPath)) {
        this.logger.debug('ResourceSyncer', 'Preserving existing gofer-model-policy.yaml');
        return;
      }

      const sourcePath = path.join(
        this.getExtensionPath(),
        'resources',
        'templates',
        'gofer-model-policy.yaml'
      );
      const policy = await fs.readFile(sourcePath, 'utf-8');
      await this.writeManagedFile(targetPath, policy);
      this.logger.info('ResourceSyncer', 'Created default gofer-model-policy.yaml');
    } catch (error) {
      this.logger.warn(
        'ResourceSyncer',
        `Failed to create default model policy: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  public async syncCanonicalCommands(): Promise<void> {
    await this.cleanupLegacyGoferCommandFiles();
    await this.syncBundledDirectory(
      'canonical Gofer commands',
      'specify-commands',
      path.join(this.specifyPath, 'commands')
    );
  }

  /**
   * Clean up old deprecated Copilot prompt files
   */
  private async cleanupOldCopilotPrompts(
    promptsDir: string,
    deleteDeprecated: boolean = false
  ): Promise<void> {
    try {
      this.logger.info('ResourceSyncer', 'Checking for deprecated prompts');

      const deprecatedPatterns = [
        'gofer.specify.prompt.md',
        'gofer.plan.prompt.md',
        'gofer.tasks.prompt.md',
        'gofer.implement.prompt.md',
        'gofer.analyze.prompt.md',
        'gofer.clarify.prompt.md',
        'gofer.constitution.prompt.md',
        'gofer.checklist.prompt.md',
        'gofer.taskstoissues.prompt.md',
        'gofer.prompt.md',
      ];

      let impactedCount = 0;
      for (const file of deprecatedPatterns) {
        const filePath = path.join(promptsDir, file);
        const exists = await FileUtils.exists(filePath);
        if (!exists) {
          continue;
        }

        if (deleteDeprecated) {
          await fs.unlink(filePath);
          impactedCount++;
          this.logger.debug('ResourceSyncer', `Deleted deprecated: ${file}`);
        } else {
          impactedCount++;
          this.logger.warn(
            'ResourceSyncer',
            `Deprecated prompt retained for migration safety: ${file}`
          );
        }
      }

      if (impactedCount > 0) {
        this.logger.info(
          'ResourceSyncer',
          `${deleteDeprecated ? 'Deleted' : 'Detected'} ${impactedCount} deprecated prompt files`,
          {
            destructive: deleteDeprecated,
          }
        );
      }
    } catch (error) {
      this.logger.error('ResourceSyncer', error as Error, {
        operation: 'cleanupOldCopilotPrompts',
      });
    }
  }

  /**
   * Convert JSON spec to Markdown with YAML frontmatter
   */
  private convertJsonToMarkdown(spec: LegacyJsonSpec, specId: string): string {
    const now = new Date().toISOString().split('T')[0];
    const title = spec.title || specId;
    const frontmatterLines = [
      '---',
      `id: "${this.escapeYamlString(specId)}"`,
      `title: "${this.escapeYamlString(title)}"`,
      `status: "${this.escapeYamlString(spec.status || 'draft')}"`,
      `created: "${now}"`,
      `updated: "${now}"`,
      `priority: "${this.escapeYamlString(spec.priority || 'medium')}"`,
      'assignee: "engineer-agent"',
      '---',
      '',
    ];

    let markdown = `${frontmatterLines.join('\n')}`;

    markdown += `# ${title}\n\n`;
    markdown += `## Feature Overview\n\n${spec.description || title}\n\n`;

    if (spec.userStories && spec.userStories.length > 0) {
      markdown += `## User Stories\n\n`;
      spec.userStories.forEach((story: string) => {
        markdown += `- ${story}\n`;
      });
      markdown += `\n`;
    }

    if (spec.tasks && spec.tasks.length > 0) {
      markdown += `## Functional Requirements\n\n`;
      spec.tasks.forEach((task: LegacyJsonTask, i: number) => {
        markdown += `${i + 1}. **FR-${(i + 1).toString().padStart(3, '0')}**: ${task.description}\n`;
      });
      markdown += `\n`;
    }

    if (spec.acceptanceCriteria && spec.acceptanceCriteria.length > 0) {
      markdown += `## Success Criteria\n\n`;
      spec.acceptanceCriteria.forEach((ac: LegacyAcceptanceCriterion) => {
        markdown += `- ${ac.description}\n`;
      });
      markdown += `\n`;
    }

    return markdown;
  }

  /**
   * Write migrated spec artifacts.
   */
  private async writeMigratedSpec(spec: LegacyJsonSpec, specId: string): Promise<void> {
    const specDir = path.join(this.specifyPath, 'specs', specId);
    await this.ensureManagedDirectory(specDir);
    await this.writeManagedFile(
      path.join(specDir, 'spec.md'),
      this.convertJsonToMarkdown(spec, specId)
    );

    if (Array.isArray(spec.tasks) && spec.tasks.length > 0) {
      await this.writeManagedFile(
        path.join(specDir, 'tasks.md'),
        this.convertJsonTasksToMarkdown(spec.tasks)
      );
    }
  }

  /**
   * Convert legacy JSON tasks to Gofer tasks.md format.
   */
  private convertJsonTasksToMarkdown(tasks: LegacyJsonTask[]): string {
    const lines = ['# Tasks', ''];

    tasks.forEach((task, index) => {
      const taskId = task.id || `T${(index + 1).toString().padStart(3, '0')}`;
      const description = task.description || task.title || `Task ${index + 1}`;
      const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];
      const dependencyText = dependencies.length > 0 ? dependencies.join(', ') : 'none';
      const checkbox = this.mapTaskStatusToCheckbox(task.status);

      lines.push(`- [${checkbox}] #${taskId} ${description} (deps: ${dependencyText})`);
    });

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Determine whether a parsed JSON document represents a legacy spec.
   */
  private isLegacySpecDocument(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    return (
      'id' in value ||
      'title' in value ||
      'description' in value ||
      'tasks' in value ||
      'acceptanceCriteria' in value
    );
  }

  /**
   * Resolve a stable spec ID for a legacy JSON document.
   */
  private resolveLegacySpecId(spec: Record<string, unknown>, specNumber: number): string {
    const id = typeof spec.id === 'string' ? spec.id : null;
    if (id && id.length > 0) {
      return id;
    }

    const title = typeof spec.title === 'string' ? spec.title : `spec-${specNumber}`;
    return `${specNumber.toString().padStart(3, '0')}-${this.slugify(title)}`;
  }

  /**
   * Escape a YAML double-quoted scalar.
   */
  private escapeYamlString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Map legacy task status to Gofer checkbox syntax.
   */
  private mapTaskStatusToCheckbox(status: unknown): string {
    if (typeof status !== 'string') {
      return ' ';
    }

    switch (status.toLowerCase()) {
      case 'completed':
        return 'x';
      case 'in_progress':
      case 'in-progress':
      case 'in progress':
        return '-';
      case 'testing':
        return '>';
      case 'failed':
        return '!';
      case 'blocked':
        return 'b';
      default:
        return ' ';
    }
  }

  /**
   * Convert string to URL-safe slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
