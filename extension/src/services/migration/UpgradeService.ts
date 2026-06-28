/**
 * Upgrade Service
 *
 * Orchestrates the upgrade process for .specify folder migrations.
 * Extracted from goferMigrator.ts (2499 LOC → focused service).
 *
 * Engineering Remediation Phase 4 - T027
 */

import { injectable } from 'tsyringe';
import * as vscode from 'vscode';
import { Logger } from '../Logger';
import { VersionDetector, type FormatType } from './VersionDetector';

/**
 * Operations interface for resource management
 * Will be implemented by ResourceSyncer (T028) and PathMigrator (T029)
 */
export interface IResourceOperations {
  /**
   * Install Gofer CLI resources (templates, scripts, commands)
   */
  installGoferCLI(): Promise<void>;

  /**
   * Create Gofer folder structure
   */
  createGoferStructure(): Promise<void>;

  /**
   * Migrate JSON specs to Markdown format
   */
  migrateJsonSpecs(): Promise<void>;

  /**
   * Setup Claude commands from bundled resources
   */
  setupClaudeCommands(): Promise<void>;

  /**
   * Setup Claude agents from bundled resources
   */
  setupClaudeAgents(): Promise<void>;

  /**
   * Setup Claude app/plugin skills from bundled resources
   */
  setupClaudeSkills(): Promise<void>;

  /**
   * Setup VS Code/GitHub Copilot custom agents
   */
  setupCopilotAgents(): Promise<void>;

  /**
   * Setup GitHub Copilot prompts
   */
  setupCopilotPrompts(): Promise<void>;

  /**
   * Setup GitHub Copilot instructions
   */
  setupCopilotInstructions(): Promise<void>;

  /**
   * Setup GitHub Copilot agent skills
   */
  setupCopilotSkills(): Promise<void>;

  /**
   * Setup Gemini CLI extension commands
   */
  setupGeminiCommands(): Promise<void>;

  /**
   * Setup Codex CLI skills (generated from Claude commands)
   */
  setupCodexSkills(): Promise<void>;

  /**
   * Setup default AI instruction files (AGENTS.md, CLAUDE.md, copilot-instructions.md)
   */
  setupDefaultInstructions(): Promise<void>;

  /**
   * Create bash scripts from bundled resources
   */
  createBashScripts(): Promise<void>;

  /**
   * Create PowerShell scripts from bundled resources
   */
  createPowerShellScripts(): Promise<void>;

  /**
   * Create Node.js scripts from bundled resources
   */
  createNodeScripts(): Promise<void>;

  /**
   * Create VSCode settings
   */
  createVSCodeSettings(): Promise<void>;

  /**
   * Fix existing spec.md and tasks.md files
   */
  fixExistingSpecs(): Promise<void>;

  /**
   * Fix spec path references (specs/ → .specify/specs/)
   */
  fixSpecPathReferences(): Promise<void>;

  /**
   * Fix Claude command format
   */
  fixClaudeCommands(): Promise<void>;

  /**
   * Create README.md in .specify/
   */
  createReadme(): Promise<void>;

  /**
   * Update .gitignore with Gofer patterns
   */
  updateGitignore(): Promise<void>;

  /**
   * Install hooks configuration
   */
  installHooksConfig(): Promise<void>;

  /**
   * Copy bundled templates
   */
  copyBundledTemplates(): Promise<void>;

  /**
   * Copy bundled public references
   */
  copyBundledReferences(): Promise<void>;
}

/**
 * Upgrade Service
 *
 * Responsible for orchestrating the upgrade process from legacy formats
 * to the current Gofer Markdown format.
 *
 * Coordinates with ResourceSyncer and PathMigrator to perform the actual
 * resource operations.
 */
@injectable()
export class UpgradeService {
  constructor(
    private readonly logger: Logger,
    private readonly versionDetector: VersionDetector
  ) {}

  /**
   * Perform upgrade from legacy format to Gofer format
   *
   * @param workspacePath - Root path of the workspace
   * @param resourceOps - Resource operations implementation
   * @param options - Upgrade options
   */
  public async upgrade(
    workspacePath: string,
    resourceOps: IResourceOperations,
    options?: { skipConfirmation?: boolean }
  ): Promise<void> {
    this.logger.info('UpgradeService', 'Starting upgrade process', { workspacePath });

    // Detect current format
    const format = await this.versionDetector.detectFormat(workspacePath);
    this.logger.debug('UpgradeService', 'Detected format', { format });

    // If already Gofer format, just update templates
    if (format === 'gofer') {
      this.logger.info('UpgradeService', 'Already Gofer format, updating templates');
      await this.updateGoferTemplates(workspacePath, resourceOps, true);
      return;
    }

    // Show confirmation dialog unless skipConfirmation
    if (!options?.skipConfirmation) {
      const versionInfo = await this.versionDetector.getVersionInfo(workspacePath);
      const choice = await vscode.window.showWarningMessage(
        `Upgrade detected: ${versionInfo.details}\n\n` +
          'This will:\n' +
          '• Create .specify folder structure\n' +
          '• Migrate JSON specs to Markdown\n' +
          '• Install templates and scripts\n' +
          '• Preserve your existing data\n\n' +
          'Continue?',
        'Upgrade',
        'Cancel'
      );

      if (choice !== 'Upgrade') {
        this.logger.info('UpgradeService', 'Upgrade cancelled by user');
        return;
      }
    }

    // Perform upgrade with progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Upgrading Gofer Structure',
        cancellable: false,
      },
      async (progress) => {
        // Install CLI and create structure
        progress.report({ message: 'Installing Gofer resources...' });
        this.logger.info('UpgradeService', 'Installing Gofer CLI');
        await resourceOps.installGoferCLI();

        progress.report({ message: 'Creating folder structure...' });
        this.logger.info('UpgradeService', 'Creating Gofer structure');
        await resourceOps.createGoferStructure();

        // Migrate data
        progress.report({ message: 'Migrating JSON specs...' });
        this.logger.info('UpgradeService', 'Migrating JSON specs to Markdown');
        await resourceOps.migrateJsonSpecs();

        // Setup Claude and Copilot integration
        progress.report({ message: 'Copying bundled templates...' });
        this.logger.info('UpgradeService', 'Copying bundled templates');
        await resourceOps.copyBundledTemplates();

        progress.report({ message: 'Copying public references...' });
        this.logger.info('UpgradeService', 'Copying public references');
        await resourceOps.copyBundledReferences();

        progress.report({ message: 'Updating Claude commands...' });
        this.logger.info('UpgradeService', 'Setting up Claude commands');
        await resourceOps.setupClaudeCommands();

        progress.report({ message: 'Updating Claude agents...' });
        this.logger.info('UpgradeService', 'Setting up Claude agents');
        await resourceOps.setupClaudeAgents();

        progress.report({ message: 'Updating Claude skills...' });
        this.logger.info('UpgradeService', 'Setting up Claude skills');
        await resourceOps.setupClaudeSkills();

        progress.report({ message: 'Updating VS Code agents...' });
        this.logger.info('UpgradeService', 'Setting up VS Code/GitHub Copilot agents');
        await resourceOps.setupCopilotAgents();

        progress.report({ message: 'Updating GitHub Copilot prompts...' });
        this.logger.info('UpgradeService', 'Setting up GitHub Copilot prompts');
        await resourceOps.setupCopilotPrompts();

        progress.report({ message: 'Updating GitHub Copilot instructions...' });
        this.logger.info('UpgradeService', 'Setting up GitHub Copilot instructions');
        await resourceOps.setupCopilotInstructions();

        progress.report({ message: 'Updating GitHub Copilot skills...' });
        this.logger.info('UpgradeService', 'Setting up GitHub Copilot skills');
        await resourceOps.setupCopilotSkills();

        progress.report({ message: 'Updating Gemini commands...' });
        this.logger.info('UpgradeService', 'Setting up Gemini commands');
        await resourceOps.setupGeminiCommands();

        progress.report({ message: 'Generating Codex CLI skills...' });
        this.logger.info('UpgradeService', 'Generating Codex CLI skills from Claude commands');
        await resourceOps.setupCodexSkills();

        progress.report({ message: 'Setting up AI instruction files...' });
        this.logger.info('UpgradeService', 'Setting up default AI instructions');
        await resourceOps.setupDefaultInstructions();

        // Create scripts and configuration
        progress.report({ message: 'Updating bash scripts...' });
        this.logger.info('UpgradeService', 'Creating bash scripts');
        await resourceOps.createBashScripts();

        progress.report({ message: 'Updating PowerShell scripts...' });
        this.logger.info('UpgradeService', 'Creating PowerShell scripts');
        await resourceOps.createPowerShellScripts();

        progress.report({ message: 'Updating Node.js scripts...' });
        this.logger.info('UpgradeService', 'Creating Node.js scripts');
        await resourceOps.createNodeScripts();

        progress.report({ message: 'Updating VSCode settings...' });
        this.logger.info('UpgradeService', 'Configuring VSCode settings');
        await resourceOps.createVSCodeSettings();

        // Fix existing content
        progress.report({ message: 'Fixing existing specs and tasks...' });
        this.logger.info('UpgradeService', 'Fixing spec.md and tasks.md files');
        await resourceOps.fixExistingSpecs();

        progress.report({ message: 'Fixing spec path references...' });
        this.logger.info('UpgradeService', 'Ensuring all scripts use .specify/specs/');
        await resourceOps.fixSpecPathReferences();

        progress.report({ message: 'Checking Claude commands format...' });
        this.logger.info('UpgradeService', 'Ensuring gofer commands are up to date');
        await resourceOps.fixClaudeCommands();

        // Finalize
        progress.report({ message: 'Updating .gitignore...' });
        this.logger.info('UpgradeService', 'Updating .gitignore with state files');
        await resourceOps.updateGitignore();

        progress.report({ message: 'Installing hooks config...' });
        this.logger.info('UpgradeService', 'Installing Claude Code hooks');
        await resourceOps.installHooksConfig();

        progress.report({ message: 'Updating README...' });
        this.logger.info('UpgradeService', 'Updating .specify/README.md');
        await resourceOps.createReadme();

        this.logger.info('UpgradeService', 'Upgrade complete');
      }
    );

    vscode.window.showInformationMessage(
      '✅ Upgrade complete! Your workspace is now using Gofer format.'
    );
  }

  /**
   * Update Gofer templates for existing installation
   *
   * @param workspacePath - Root path of the workspace
   * @param resourceOps - Resource operations implementation
   * @param skipConfirmation - Skip user confirmation dialog
   */
  public async updateGoferTemplates(
    workspacePath: string,
    resourceOps: IResourceOperations,
    skipConfirmation: boolean = false
  ): Promise<void> {
    this.logger.info('UpgradeService', 'Starting template update', {
      workspacePath,
      skipConfirmation,
    });

    if (!skipConfirmation) {
      const choice = await vscode.window.showInformationMessage(
        'Update Gofer templates to latest version?\n\n' +
          'This will:\n' +
          '• Update templates, scripts, and commands\n' +
          '• Fix existing specs and tasks format\n' +
          '• Preserve your custom content\n\n' +
          'Continue?',
        'Update',
        'Cancel'
      );

      if (choice !== 'Update') {
        this.logger.info('UpgradeService', 'Template update cancelled by user');
        return;
      }
    }

    // Perform update with progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Updating Gofer Templates',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Copying bundled templates...' });
        this.logger.info('UpgradeService', 'Copying bundled templates');
        await resourceOps.copyBundledTemplates();

        progress.report({ message: 'Copying public references...' });
        this.logger.info('UpgradeService', 'Copying public references');
        await resourceOps.copyBundledReferences();

        progress.report({ message: 'Updating Claude commands...' });
        this.logger.info('UpgradeService', 'Setting up Claude commands');
        await resourceOps.setupClaudeCommands();

        progress.report({ message: 'Updating Claude agents...' });
        this.logger.info('UpgradeService', 'Setting up Claude agents');
        await resourceOps.setupClaudeAgents();

        progress.report({ message: 'Updating Claude skills...' });
        this.logger.info('UpgradeService', 'Setting up Claude skills');
        await resourceOps.setupClaudeSkills();

        progress.report({ message: 'Updating VS Code agents...' });
        this.logger.info('UpgradeService', 'Setting up VS Code/GitHub Copilot agents');
        await resourceOps.setupCopilotAgents();

        progress.report({ message: 'Updating GitHub Copilot prompts...' });
        this.logger.info('UpgradeService', 'Setting up GitHub Copilot prompts');
        await resourceOps.setupCopilotPrompts();

        progress.report({ message: 'Updating GitHub Copilot instructions...' });
        this.logger.info('UpgradeService', 'Setting up GitHub Copilot instructions');
        await resourceOps.setupCopilotInstructions();

        progress.report({ message: 'Updating GitHub Copilot skills...' });
        this.logger.info('UpgradeService', 'Setting up GitHub Copilot skills');
        await resourceOps.setupCopilotSkills();

        progress.report({ message: 'Updating Gemini commands...' });
        this.logger.info('UpgradeService', 'Setting up Gemini commands');
        await resourceOps.setupGeminiCommands();

        progress.report({ message: 'Generating Codex CLI skills...' });
        this.logger.info('UpgradeService', 'Generating Codex CLI skills from Claude commands');
        await resourceOps.setupCodexSkills();

        progress.report({ message: 'Setting up AI instruction files...' });
        this.logger.info('UpgradeService', 'Setting up default AI instructions');
        await resourceOps.setupDefaultInstructions();

        progress.report({ message: 'Updating bash scripts...' });
        this.logger.info('UpgradeService', 'Creating bash scripts');
        await resourceOps.createBashScripts();

        progress.report({ message: 'Updating PowerShell scripts...' });
        this.logger.info('UpgradeService', 'Creating PowerShell scripts');
        await resourceOps.createPowerShellScripts();

        progress.report({ message: 'Updating Node.js scripts...' });
        this.logger.info('UpgradeService', 'Creating Node.js scripts');
        await resourceOps.createNodeScripts();

        progress.report({ message: 'Updating VSCode settings...' });
        this.logger.info('UpgradeService', 'Configuring VSCode settings');
        await resourceOps.createVSCodeSettings();

        progress.report({ message: 'Fixing existing specs and tasks...' });
        this.logger.info('UpgradeService', 'Fixing spec.md and tasks.md files');
        await resourceOps.fixExistingSpecs();

        progress.report({ message: 'Fixing spec path references...' });
        this.logger.info('UpgradeService', 'Ensuring all scripts use .specify/specs/');
        await resourceOps.fixSpecPathReferences();

        progress.report({ message: 'Checking Claude commands format...' });
        this.logger.info('UpgradeService', 'Ensuring gofer commands are up to date');
        await resourceOps.fixClaudeCommands();

        progress.report({ message: 'Updating .gitignore...' });
        this.logger.info('UpgradeService', 'Updating .gitignore with state files');
        await resourceOps.updateGitignore();

        progress.report({ message: 'Installing hooks config...' });
        this.logger.info('UpgradeService', 'Installing Claude Code hooks');
        await resourceOps.installHooksConfig();

        progress.report({ message: 'Updating README...' });
        this.logger.info('UpgradeService', 'Updating .specify/README.md');
        await resourceOps.createReadme();

        this.logger.info('UpgradeService', 'Update complete');
      }
    );

    vscode.window.showInformationMessage(
      '✅ Templates updated and existing specs fixed successfully!'
    );
  }

  /**
   * Get upgrade recommendation for a workspace
   *
   * @param workspacePath - Root path of the workspace
   * @returns Upgrade recommendation with format info
   */
  public async getUpgradeRecommendation(workspacePath: string): Promise<{
    needsUpgrade: boolean;
    currentFormat: FormatType;
    details: string;
    recommendedAction: string;
  }> {
    const versionInfo = await this.versionDetector.getVersionInfo(workspacePath);

    let recommendedAction = 'No action needed';
    if (versionInfo.format === 'none') {
      recommendedAction = 'Initialize Gofer structure';
    } else if (versionInfo.needsUpgrade) {
      recommendedAction = 'Upgrade to latest Gofer format';
    } else if (versionInfo.format === 'gofer') {
      recommendedAction = 'Templates are up to date';
    }

    return {
      needsUpgrade: versionInfo.needsUpgrade,
      currentFormat: versionInfo.format,
      details: versionInfo.details,
      recommendedAction,
    };
  }
}
