/**
 * Gofer Migrator - Facade for Migration Services
 *
 * Refactored from 2499 LOC to <600 LOC by delegating to specialized services.
 * Preserves public API for backward compatibility.
 *
 * Engineering Remediation Phase 4 - T030
 */

import * as vscode from 'vscode';
import { Logger } from './services/Logger';
import { getContainer } from './di/container';
import {
  VersionDetector,
  UpgradeService,
  ResourceSyncer,
  PathMigrator,
  type FormatType,
} from './services/migration';

/**
 * Gofer Migrator
 *
 * Facade class that orchestrates migration services.
 * Maintains public API for backward compatibility with existing code.
 *
 * Delegates to:
 * - VersionDetector: Format detection and version comparison
 * - UpgradeService: Upgrade orchestration
 * - ResourceSyncer: Resource synchronization
 * - PathMigrator: Path migration
 */
export class GoferMigrator {
  private readonly workspacePath: string;
  private readonly specifyPath: string;
  private readonly logger: Logger;
  private instructionPromptDeclined = false;

  // Injected migration services
  private readonly versionDetector: VersionDetector;
  private readonly upgradeService: UpgradeService;
  private readonly resourceSyncer: ResourceSyncer;
  private readonly pathMigrator: PathMigrator;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.specifyPath = require('path').join(workspacePath, '.specify');

    // Resolve services from DI container
    const container = getContainer();
    this.logger = container.resolve(Logger);
    this.versionDetector = container.resolve(VersionDetector);
    this.upgradeService = container.resolve(UpgradeService);
    this.resourceSyncer = container.resolve(ResourceSyncer);
    this.pathMigrator = container.resolve(PathMigrator);

    // Initialize services with workspace path
    this.resourceSyncer.setWorkspacePath(workspacePath);
    this.pathMigrator.setWorkspacePath(workspacePath);
  }

  /**
   * Check if .specify folder exists
   *
   * @returns True if .specify folder exists
   */
  public async exists(): Promise<boolean> {
    return this.versionDetector.exists(this.workspacePath);
  }

  /**
   * Detect the format of .specify folder
   *
   * @returns Format type: 'none', 'legacy-json', 'gofer', or 'mixed'
   */
  public async detectFormat(): Promise<FormatType> {
    return this.versionDetector.detectFormat(this.workspacePath);
  }

  /**
   * Get version info from .specify folder
   *
   * @returns Version information including format, upgrade status, and details
   */
  public async getVersionInfo(): Promise<{
    format: string;
    needsUpgrade: boolean;
    details: string;
  }> {
    return this.versionDetector.getVersionInfo(this.workspacePath);
  }

  /**
   * Get current version as a string
   *
   * @returns Version string (format type)
   */
  public async detectCurrentVersion(): Promise<string> {
    return this.versionDetector.detectCurrentVersion(this.workspacePath);
  }

  /**
   * Compare two semantic versions
   *
   * @param a - First version string
   * @param b - Second version string
   * @returns Comparison result (-1, 0, or 1)
   */
  public compareVersions(a: string, b: string): number {
    return this.versionDetector.compareVersions(a, b);
  }

  /**
   * Perform upgrade from legacy format to Gofer format
   *
   * Main entry point for upgrade process. Delegates to UpgradeService
   * which orchestrates ResourceSyncer and PathMigrator.
   *
   * @param options - Upgrade options
   */
  public async upgrade(options?: { skipConfirmation?: boolean }): Promise<void> {
    this.logger.info('GoferMigrator', 'Starting upgrade process', {
      workspacePath: this.workspacePath,
    });

    await this.upgradeService.upgrade(this.workspacePath, this.resourceSyncer, options);
  }

  /**
   * Update Gofer templates for existing installation
   *
   * @param skipConfirmation - Skip user confirmation dialog
   */
  public async updateGoferTemplates(skipConfirmation: boolean = false): Promise<void> {
    this.logger.info('GoferMigrator', 'Updating Gofer templates', {
      workspacePath: this.workspacePath,
      skipConfirmation,
    });

    await this.upgradeService.updateGoferTemplates(
      this.workspacePath,
      this.resourceSyncer,
      skipConfirmation
    );
  }

  /**
   * Install Gofer CLI resources (templates, scripts, commands)
   */
  public async installGoferCLI(): Promise<void> {
    await this.resourceSyncer.installGoferCLI();
  }

  /**
   * Create Gofer folder structure
   */
  public async createGoferStructure(): Promise<void> {
    await this.resourceSyncer.createGoferStructure();
  }

  /**
   * Migrate JSON specs to Markdown format
   */
  public async migrateJsonSpecs(): Promise<void> {
    await this.resourceSyncer.migrateJsonSpecs();
  }

  /**
   * Setup Claude commands from bundled resources
   */
  public async setupClaudeCommands(): Promise<void> {
    await this.resourceSyncer.setupClaudeCommands();
  }

  /**
   * Setup Claude agents from bundled resources
   */
  public async setupClaudeAgents(): Promise<void> {
    await this.resourceSyncer.setupClaudeAgents();
  }

  /**
   * Setup Claude skills from bundled resources
   */
  public async setupClaudeSkills(): Promise<void> {
    await this.resourceSyncer.setupClaudeSkills();
  }

  /**
   * Setup GitHub Copilot custom agents
   */
  public async setupCopilotAgents(): Promise<void> {
    await this.resourceSyncer.setupCopilotAgents();
  }

  /**
   * Setup GitHub Copilot prompts
   */
  public async setupCopilotPrompts(): Promise<void> {
    await this.resourceSyncer.setupCopilotPrompts();
  }

  /**
   * Setup GitHub Copilot instructions
   */
  public async setupCopilotInstructions(): Promise<void> {
    await this.resourceSyncer.setupCopilotInstructions();
  }

  /**
   * Setup GitHub Copilot agent skills
   */
  public async setupCopilotSkills(): Promise<void> {
    await this.resourceSyncer.setupCopilotSkills();
  }

  /**
   * Retired Gemini CLI entrypoint. Reports migration guidance without changing files.
   */
  public async setupGeminiCommands(): Promise<void> {
    await this.resourceSyncer.setupGeminiCommands();
  }

  /**
   * Setup Codex CLI skills (generated from Claude commands)
   */
  public async setupCodexSkills(): Promise<void> {
    await this.resourceSyncer.setupCodexSkills();
  }

  /**
   * Legacy compatibility helper for older Codex installs that still relied on
   * ~/.codex/skills. Normal Gofer installs now use repo-local .agents/skills.
   */
  public async setupCodexGlobalSymlink(): Promise<void> {
    await this.resourceSyncer.setupCodexGlobalSymlink();
  }

  /**
   * Setup default AI instruction files (AGENTS.md, CLAUDE.md, copilot-instructions.md)
   */
  public async setupDefaultInstructions(): Promise<void> {
    await this.resourceSyncer.setupDefaultInstructions();
  }

  /**
   * Create bash scripts from bundled resources
   */
  public async createBashScripts(): Promise<void> {
    await this.resourceSyncer.createBashScripts();
  }

  /**
   * Create PowerShell scripts from bundled resources
   */
  public async createPowerShellScripts(): Promise<void> {
    await this.resourceSyncer.createPowerShellScripts();
  }

  /**
   * Create Node.js scripts from bundled resources
   */
  public async createNodeScripts(): Promise<void> {
    await this.resourceSyncer.createNodeScripts();
  }

  /**
   * Create or update VSCode settings
   */
  public async createVSCodeSettings(): Promise<void> {
    await this.resourceSyncer.createVSCodeSettings();
  }

  /**
   * Fix existing spec.md and tasks.md files
   */
  public async fixExistingSpecs(): Promise<void> {
    await this.resourceSyncer.fixExistingSpecs();
  }

  /**
   * Fix spec path references (specs/ → .specify/specs/)
   */
  public async fixSpecPathReferences(): Promise<void> {
    await this.pathMigrator.migratePaths();
  }

  /**
   * Fix Claude command format
   */
  public async fixClaudeCommands(): Promise<void> {
    await this.resourceSyncer.fixClaudeCommands();
  }

  /**
   * Create README.md in .specify/
   */
  public async createReadme(): Promise<void> {
    await this.resourceSyncer.createReadme();
  }

  /**
   * Update .gitignore with Gofer patterns
   */
  public async updateGitignore(): Promise<void> {
    await this.resourceSyncer.updateGitignore();
  }

  /**
   * Install hooks configuration
   */
  public async installHooksConfig(): Promise<void> {
    await this.resourceSyncer.installHooksConfig();
  }

  /**
   * Copy bundled templates
   */
  public async copyBundledTemplates(): Promise<void> {
    await this.resourceSyncer.copyBundledTemplates();
  }

  /**
   * Copy bundled public references
   */
  public async copyBundledReferences(): Promise<void> {
    await this.resourceSyncer.copyBundledReferences();
  }

  /**
   * Verify path migration was successful
   *
   * @returns True if all paths have been migrated correctly
   */
  public async verifyPathMigration(): Promise<boolean> {
    return this.pathMigrator.verifyMigration();
  }

  /**
   * Rollback path migration (revert .specify/specs/ back to specs/)
   *
   * Use with caution as it modifies many files.
   */
  public async rollbackPathMigration(): Promise<void> {
    await this.pathMigrator.rollbackMigration();
  }

  /**
   * Get upgrade recommendation for workspace
   *
   * @returns Upgrade recommendation with format info
   */
  public async getUpgradeRecommendation(): Promise<{
    needsUpgrade: boolean;
    currentFormat: FormatType;
    details: string;
    recommendedAction: string;
  }> {
    return this.upgradeService.getUpgradeRecommendation(this.workspacePath);
  }

  /**
   * Create Gofer structure manually (for fresh installations)
   *
   * This method creates the full Gofer structure from scratch,
   * including all folders, templates, scripts, and configuration.
   */
  public async createGoferStructureManually(): Promise<void> {
    this.logger.info('GoferMigrator', 'Creating Gofer structure manually');

    // Create folder structure
    await this.resourceSyncer.createGoferStructure();

    // Copy all resources
    await this.resourceSyncer.copyBundledTemplates();
    await this.resourceSyncer.copyBundledReferences();
    await this.resourceSyncer.ensureDefaultModelPolicy();
    await this.resourceSyncer.setupClaudeCommands();
    await this.resourceSyncer.setupClaudeAgents();
    await this.resourceSyncer.setupClaudeSkills();
    await this.resourceSyncer.setupCopilotAgents();
    await this.resourceSyncer.setupCopilotPrompts();
    await this.resourceSyncer.setupCopilotInstructions();
    await this.resourceSyncer.setupCopilotSkills();
    await this.resourceSyncer.setupCodexSkills(); // Shared .agents skills for Codex and Antigravity
    await this.resourceSyncer.createBashScripts();
    await this.resourceSyncer.createPowerShellScripts();
    await this.resourceSyncer.createNodeScripts();
    await this.resourceSyncer.createVSCodeSettings();

    // Fix paths and commands
    await this.pathMigrator.migratePaths();
    await this.resourceSyncer.fixClaudeCommands();

    // Create documentation
    await this.resourceSyncer.createReadme();
    await this.resourceSyncer.updateGitignore();

    this.logger.info('GoferMigrator', 'Manual structure creation complete');
  }

  /**
   * Initialize Gofer for a fresh workspace
   *
   * This is the main entry point for setting up Gofer in a new project.
   */
  public async initialize(): Promise<void> {
    this.logger.info('GoferMigrator', 'Initializing Gofer for workspace', {
      workspacePath: this.workspacePath,
    });

    const format = await this.detectFormat();

    if (format === 'gofer') {
      vscode.window.showInformationMessage('Gofer is already initialized in this workspace.');
      return;
    }

    if (format === 'legacy-json' || format === 'mixed') {
      // Existing installation needs upgrade
      await this.upgrade({ skipConfirmation: false });
    } else {
      // Fresh installation
      await this.createGoferStructureManually();
      vscode.window.showInformationMessage('✅ Gofer initialized successfully!');
    }
  }

  /**
   * Check for missing critical resources
   *
   * @returns Object with hasMissingResources flag and array of missing resource names
   */
  private async checkMissingResources(): Promise<{
    hasMissingResources: boolean;
    missing: string[];
  }> {
    const path = require('path');
    const fs = require('fs').promises;
    const missing: string[] = [];

    const criticalPaths = [
      { path: path.join(this.workspacePath, '.claude', 'commands'), name: 'Claude commands' },
      { path: path.join(this.workspacePath, '.claude', 'agents'), name: 'Claude agents' },
      { path: path.join(this.workspacePath, '.claude', 'skills'), name: 'Claude skills' },
      { path: path.join(this.workspacePath, '.github', 'agents'), name: 'Copilot agents' },
      { path: path.join(this.workspacePath, '.github', 'prompts'), name: 'Copilot prompts' },
      {
        path: path.join(this.workspacePath, '.github', 'instructions'),
        name: 'Copilot instructions',
      },
      { path: path.join(this.workspacePath, '.github', 'skills'), name: 'Copilot skills' },
      { path: path.join(this.workspacePath, '.agents', 'skills'), name: 'Codex skills' },
      {
        path: path.join(this.specifyPath, 'commands', '6_gofer_validate.md'),
        name: 'Canonical commands',
      },
      {
        path: path.join(this.specifyPath, 'scripts', 'node', 'lib', 'visual-pass-pipeline.mjs'),
        name: 'Node.js scripts',
      },
      { path: path.join(this.specifyPath, 'scripts', 'bash'), name: 'Bash scripts' },
      {
        path: path.join(this.specifyPath, 'scripts', 'powershell', 'install-optional-tools.ps1'),
        name: 'PowerShell scripts',
      },
      {
        path: path.join(this.specifyPath, 'scripts', 'hooks', 'post-tool-use.mjs'),
        name: 'Hook scripts',
      },
      { path: path.join(this.specifyPath, 'templates'), name: 'Templates' },
      { path: path.join(this.specifyPath, 'references', 'platform'), name: 'Public references' },
      { path: path.join(this.workspacePath, 'AGENTS.md'), name: 'AI instructions' },
      { path: path.join(this.workspacePath, 'CLAUDE.md'), name: 'AI instructions' },
    ];

    for (const { path: resourcePath, name } of criticalPaths) {
      try {
        const stats = await fs.stat(resourcePath);

        // If it's a directory, check if it's empty
        if (stats.isDirectory()) {
          const files = await fs.readdir(resourcePath);
          if (files.length === 0) {
            missing.push(name);
          }
        }
        // If it's a file, it exists (post-tool-use.mjs)
      } catch (_error) {
        // Path doesn't exist
        missing.push(name);
      }
    }

    return {
      hasMissingResources: missing.length > 0,
      missing,
    };
  }

  /**
   * Sync only missing critical resources
   *
   * This is lighter than a full upgrade - it only syncs resources that are missing.
   * Useful when some bundled resources were deleted or corrupted.
   */
  public async syncMissingResources(): Promise<void> {
    const { hasMissingResources, missing } = await this.checkMissingResources();

    if (!hasMissingResources) {
      this.logger.info('GoferMigrator', 'All critical resources present, no sync needed');
      return;
    }

    this.logger.info('GoferMigrator', 'Syncing missing resources', { missing });

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Syncing missing Gofer resources',
        cancellable: false,
      },
      async (progress) => {
        const totalSteps = missing.length;
        let currentStep = 0;

        const reportProgress = (message: string): void => {
          currentStep++;
          progress.report({
            increment: 100 / totalSteps,
            message: `${message} (${currentStep}/${totalSteps})`,
          });
        };

        // Sync only the missing resources
        if (missing.includes('Claude commands')) {
          reportProgress('Syncing Claude commands');
          await this.resourceSyncer.setupClaudeCommands();
          // Also regenerate Codex skills when Claude commands are synced
          reportProgress('Generating Codex skills');
          await this.resourceSyncer.setupCodexSkills();
        }

        if (missing.includes('Codex skills')) {
          reportProgress('Generating Codex skills');
          await this.resourceSyncer.setupCodexSkills();
        }

        if (missing.includes('Claude agents')) {
          reportProgress('Syncing Claude agents');
          await this.resourceSyncer.setupClaudeAgents();
        }

        if (missing.includes('Claude skills')) {
          reportProgress('Syncing Claude skills');
          await this.resourceSyncer.setupClaudeSkills();
        }

        if (missing.includes('Copilot agents')) {
          reportProgress('Syncing Copilot agents');
          await this.resourceSyncer.setupCopilotAgents();
        }

        if (missing.includes('Copilot prompts')) {
          reportProgress('Syncing Copilot prompts');
          await this.resourceSyncer.setupCopilotPrompts();
        }

        if (missing.includes('Copilot instructions')) {
          reportProgress('Syncing Copilot instructions');
          await this.resourceSyncer.setupCopilotInstructions();
        }

        if (missing.includes('Copilot skills')) {
          reportProgress('Syncing Copilot skills');
          await this.resourceSyncer.setupCopilotSkills();
        }

        if (missing.includes('Canonical commands')) {
          reportProgress('Syncing canonical commands');
          await this.resourceSyncer.syncCanonicalCommands();
        }

        if (missing.includes('Node.js scripts')) {
          reportProgress('Syncing Node.js scripts');
          await this.resourceSyncer.createNodeScripts();
        }

        if (missing.includes('Bash scripts')) {
          reportProgress('Syncing Bash scripts');
          await this.resourceSyncer.createBashScripts();
        }

        if (missing.includes('PowerShell scripts')) {
          reportProgress('Syncing PowerShell scripts');
          await this.resourceSyncer.createPowerShellScripts();
        }

        if (missing.includes('Hook scripts')) {
          reportProgress('Syncing Hook scripts');
          await this.resourceSyncer.installHooksConfig();
        }

        if (missing.includes('Templates')) {
          reportProgress('Syncing Templates');
          await this.resourceSyncer.copyBundledTemplates();
        }

        if (missing.includes('Public references')) {
          reportProgress('Syncing Public references');
          await this.resourceSyncer.copyBundledReferences();
        }

        if (missing.includes('AI instructions')) {
          if (!this.instructionPromptDeclined) {
            const response = await vscode.window.showInformationMessage(
              'Missing AI instruction files (AGENTS.md, CLAUDE.md). Generate them?',
              'Yes',
              'No'
            );
            if (response === 'Yes') {
              reportProgress('Generating AI instruction files');
              await this.resourceSyncer.setupDefaultInstructions();
            } else if (response === 'No') {
              this.instructionPromptDeclined = true;
            }
            // If dismissed (undefined), skip this invocation but do NOT set decline flag
          }
        }

        this.logger.info('GoferMigrator', 'Missing resources synced successfully');
      }
    );

    vscode.window.showInformationMessage('✅ Missing Gofer resources synced successfully!');
  }
}
