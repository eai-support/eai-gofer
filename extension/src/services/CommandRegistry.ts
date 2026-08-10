/**
 * Command Registry Service
 *
 * Centralized command registration for all Gofer VSCode commands.
 * Extracted from extension.ts:registerCommands() (1156 LOC → <600 LOC).
 *
 * Engineering Remediation Phase 3 - T020
 */

import { injectable } from 'tsyringe';
import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from './Logger';
import { GoferMigrator } from '../goferMigrator';
import { validateFeatureName } from '../utils/commandInputValidator';
import type { Spec } from '../goferParser';
import type { ProgressProvider } from '../progressProvider';
import type { ConstitutionProvider } from '../constitutionProvider';
import type { MemoryProvider } from '../memoryProvider';
import type { ContextWindowProvider } from '../contextWindowProvider';
import type { BranchSpecManager } from '../branchSpecManager';
import type { ContextBuilder } from '../autonomous/ContextBuilder';
import type { MemoryManager } from '../autonomous/MemoryManager';
import type { ScopeGuard } from '../autonomous/ScopeGuard';
import type { ResearchChunker } from '../autonomous/ResearchChunker';
import type { AutoUpdater } from '../autoUpdater';
import type { ClaudeCodeContextScanner } from '../autonomous/ClaudeCodeContextScanner';
import type { MultiSessionBridgeWatcher } from '../autonomous/MultiSessionBridgeWatcher';

/**
 * Dependencies required for command registration
 *
 * These are module-level globals from extension.ts that commands need access to.
 * In T025, these will be converted to injectable services.
 */
export interface CommandDependencies {
  workspacePath: string;
  migrator: GoferMigrator;
  progressProvider?: ProgressProvider;
  constitutionProvider?: ConstitutionProvider;
  memoryProvider?: MemoryProvider;
  contextWindowProvider?: ContextWindowProvider;
  branchSpecManager?: BranchSpecManager;
  sharedContextBuilder?: ContextBuilder;
  memoryManager?: MemoryManager;
  scopeGuard?: ScopeGuard;
  researchChunker?: ResearchChunker;
  autoUpdater?: AutoUpdater;
  contextScanner?: ClaudeCodeContextScanner;
  multiSessionWatcher?: MultiSessionBridgeWatcher;
  crossPlatformCommandRouter?: import('../council/CrossPlatformCommandRouter').CrossPlatformCommandRouter;
  isUpgrading: () => boolean;
  setUpgradeState: (state: boolean) => void;
}

interface TreeViewCommandItem {
  uri?: vscode.Uri;
  id?: string;
  path?: string;
}

interface ConstitutionArticleCommand {
  number: string | number;
  title: string;
}

interface ConstitutionSectionCommand {
  number: string | number;
  title: string;
  content?: string;
  line: number;
}

interface MemoryDocumentCommand {
  path: string;
}

interface MemoryContentCommand {
  content: string;
  notePath?: string;
  category?: string;
  created?: string;
  tags?: string[];
  usedCount?: number;
  learnedFrom?: string;
  path?: string;
}

/**
 * Command Registry Service
 *
 * Registers all Gofer commands with VSCode.
 * Preserves all existing command IDs for backward compatibility.
 */
@injectable()
export class CommandRegistry {
  private workspaceCommandsRegistered = false;

  constructor(private readonly logger: Logger) {}

  /**
   * Register all workspace-specific commands
   *
   * @param context - VSCode extension context
   * @param deps - Command dependencies
   */
  public registerAll(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    // Guard against duplicate registration
    if (this.workspaceCommandsRegistered) {
      this.logger.warn('CommandRegistry', 'Commands already registered, skipping');
      return;
    }

    this.workspaceCommandsRegistered = true;
    this.logger.info('CommandRegistry', 'Registering workspace commands');

    // Register command groups
    this.registerUpgradeCommands(context, deps);
    this.registerSpecCommands(context, deps);
    this.registerMemoryCommands(context, deps);
    this.registerClaudeCodeCommands(context, deps);
    this.registerViewCommands(context, deps);
    this.registerCheckpointCommands(context, deps);
    this.registerSlopCommands(context, deps);

    this.logger.info('CommandRegistry', 'All workspace commands registered successfully');
  }

  /**
   * Register upgrade and migration commands
   */
  private registerUpgradeCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
  ): void {
    // gofer.upgrade - Upgrade .specify format
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.upgrade', async () => {
        await deps.migrator.upgrade();
        deps.progressProvider?.refresh();
      })
    );

    // gofer.checkVersion - Show version info
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.checkVersion', async () => {
        const versionInfo = await deps.migrator.getVersionInfo();
        const choice = await vscode.window.showInformationMessage(
          `Gofer Status:\n\nFormat: ${versionInfo.format}\n${versionInfo.details}`,
          versionInfo.needsUpgrade ? 'Upgrade' : 'OK'
        );
        if (choice === 'Upgrade') {
          vscode.commands.executeCommand('gofer.upgrade');
        }
      })
    );

    // gofer.fixSpecPaths - Fix path references
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.fixSpecPaths', async () => {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Fixing spec path references...',
            cancellable: false,
          },
          async () => {
            await deps.migrator.fixSpecPathReferences();
            vscode.window.showInformationMessage(
              'Spec paths fixed! All scripts now use .specify/specs/ instead of specs/',
              'OK'
            );
          }
        );
      })
    );

    // gofer.updateTemplates - Update templates
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.updateTemplates', async () => {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspacePath) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Updating Gofer Templates',
            cancellable: false,
          },
          async (progress) => {
            try {
              const { TemplateDownloader } = await import('../templateDownloader');
              const cacheDir = path.join(context.globalStorageUri.fsPath, 'templates');
              const downloader = TemplateDownloader.getInstance(cacheDir);

              const manifest = await downloader.downloadLatestTemplates(workspacePath, {
                force: true,
                progress: (update) => {
                  progress.report({
                    message: update.message,
                    increment: update.progress ? update.progress / 5 : undefined,
                  });
                },
              });

              vscode.window.showInformationMessage(
                `✅ Templates updated to version ${manifest.version}`
              );
              deps.progressProvider?.refresh();
            } catch (error) {
              vscode.window.showErrorMessage(
                `Failed to update templates: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        );
      })
    );

    // gofer.regenerateInstructions - Regenerate AI instruction files
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.regenerateInstructions', async () => {
        try {
          const { ProjectDetector } = await import('./ProjectDetector');
          const { InstructionGenerator } = await import('./InstructionGenerator');
          const { FileUtils } = await import('../utils/fileUtils');
          const path = await import('path');

          const projectInfo = await ProjectDetector.detect(deps.workspacePath);
          const generator = new InstructionGenerator();

          const files = [
            {
              path: path.join(deps.workspacePath, 'AGENTS.md'),
              generate: () => generator.generateAgentsMd(projectInfo),
              label: 'AGENTS.md',
            },
            {
              path: path.join(deps.workspacePath, 'CLAUDE.md'),
              generate: () => generator.generateClaudeMd(projectInfo),
              label: 'CLAUDE.md',
            },
            {
              path: path.join(deps.workspacePath, '.github', 'copilot-instructions.md'),
              generate: () => generator.generateCopilotMd(projectInfo),
              label: 'copilot-instructions.md',
            },
          ];

          let created = 0;
          let skipped = 0;
          let overwritten = 0;

          for (const file of files) {
            const exists = await FileUtils.exists(file.path);
            if (exists) {
              const choice = await vscode.window.showWarningMessage(
                `${file.label} already exists. What would you like to do?`,
                'Overwrite',
                'Skip',
                'Backup & Replace'
              );
              if (choice === 'Skip' || !choice) {
                skipped++;
                continue;
              }
              if (choice === 'Backup & Replace') {
                const backupPath = file.path + '.bak';
                const content = await FileUtils.readTextFile(file.path);
                await FileUtils.writeTextFile(backupPath, content);
              }
              overwritten++;
            } else {
              created++;
            }

            const dir = path.dirname(file.path);
            await FileUtils.ensureDirectory(dir);
            const content = await file.generate();
            await FileUtils.writeTextFile(file.path, content);
          }

          const parts = [];
          if (created > 0) {
            parts.push(`${created} created`);
          }
          if (overwritten > 0) {
            parts.push(`${overwritten} overwritten`);
          }
          if (skipped > 0) {
            parts.push(`${skipped} skipped`);
          }
          vscode.window.showInformationMessage(`AI Instructions regenerated: ${parts.join(', ')}.`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to regenerate instructions: ${error}`);
        }
      })
    );

    // NOTE: gofer.checkForUpdates and gofer.updateNow are registered in
    // registerGlobalCommands() (extension.ts) because they're referenced in
    // view/title menus and must be available immediately on activation.
  }

  /**
   * Register spec-related commands
   */
  private registerSpecCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    // gofer.createSpec - Create new specification
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.createSpec', async () => {
        const specName = await vscode.window.showInputBox({
          prompt: 'Enter specification name (e.g., "user-authentication")',
          placeHolder: 'my-feature',
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Specification name is required';
            }
            if (!/^[a-z0-9-]+$/.test(value.trim())) {
              return 'Name must be lowercase with dashes only (a-z, 0-9, -)';
            }
            const validation = validateFeatureName(value.trim());
            if (!validation.valid) {
              return validation.error || 'Invalid feature name';
            }
            return null;
          },
        });

        if (!specName) {
          return;
        }

        const specsPath = path.join(deps.workspacePath, '.specify', 'specs', specName.trim());
        const specFile = path.join(specsPath, 'spec.md');

        try {
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(specsPath));

          const specTitle = specName
            .trim()
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (l: string) => l.toUpperCase());

          const specTemplate = this.generateSpecTemplate(specName.trim(), specTitle);
          await vscode.workspace.fs.writeFile(vscode.Uri.file(specFile), Buffer.from(specTemplate));

          const doc = await vscode.workspace.openTextDocument(specFile);
          await vscode.window.showTextDocument(doc);

          deps.progressProvider?.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to create spec: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })
    );

    // gofer.openSpec - Open spec file
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.openSpec', async (uri?: vscode.Uri) => {
        const specFile = uri?.fsPath || '';
        if (!specFile) {
          return;
        }

        try {
          const doc = await vscode.workspace.openTextDocument(specFile);
          await vscode.window.showTextDocument(doc);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to open spec: ${error}`);
        }
      })
    );
  }

  /**
   * Register memory-related commands
   */
  private registerMemoryCommands(
    _context: vscode.ExtensionContext,
    _deps: CommandDependencies
  ): void {
    // Memory commands are registered separately in registerMemoryCommands
    // This is a placeholder for future consolidation
  }

  /**
   * Register autonomous execution commands.
   *
   * The old VS Code Play-button terminal launcher was removed because it used
   * direct API-key automation and did not reliably drive Claude Code. The
   * supported path is the CLI provider-backed autonomous driver below.
   */
  private registerClaudeCodeCommands(
    context: vscode.ExtensionContext,
    _deps: CommandDependencies
  ): void {
    // gofer.startAutonomous - Start autonomous execution for a spec
    // Called by specCommands.ts:executeSpec() and autonomousCommands.ts dependency cascade
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.startAutonomous', async (spec: Spec) => {
        try {
          const { startAutonomousExecution } = await import('../autonomousCommands');
          await startAutonomousExecution(context, spec, _deps.progressProvider);
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to start autonomous execution: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.stopAutonomous', async () => {
        const { stopAutonomousExecution } = await import('../autonomousCommands');
        await stopAutonomousExecution();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.pauseAutonomous', async () => {
        const { pauseAutonomousExecution } = await import('../autonomousCommands');
        await pauseAutonomousExecution();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.resumeAutonomous', async () => {
        const { resumeAutonomousExecution } = await import('../autonomousCommands');
        await resumeAutonomousExecution();
      })
    );
  }

  /**
   * Register view-related commands (show details, refresh, etc.)
   */
  private registerViewCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    // gofer.refreshSpecs
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.refreshSpecs', () => {
        deps.progressProvider?.refresh();
      })
    );

    // gofer.refreshConstitution
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.refreshConstitution', () => {
        deps.constitutionProvider?.refresh();
      })
    );

    // gofer.refreshMemory
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.refreshMemory', () => {
        deps.memoryProvider?.refresh();
      })
    );

    // gofer.refreshContextWindow
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.refreshContextWindow', () => {
        deps.contextWindowProvider?.refresh();
      })
    );

    // gofer.showProgress - Focus progress panel
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.showProgress', () => {
        vscode.commands.executeCommand('goferProgress.focus');
      })
    );

    // gofer.showContextCategoryContent - Context Window category click handler
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gofer.showContextCategoryContent',
        async (sessionId: string, categoryName: string) => {
          const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!workspacePath) {
            return;
          }

          const { ContextContentPanel } = await import('../ui/ContextContentPanel');
          const panel = ContextContentPanel.createOrShow(context.extensionUri, workspacePath);

          if (deps.contextScanner) {
            panel.setScanner(deps.contextScanner);
          }

          const bridgeData = deps.multiSessionWatcher?.getSessions().get(sessionId);
          await panel.showCategory(sessionId, categoryName, bridgeData);
        }
      )
    );

    // Show details commands
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gofer.showSpecDetails',
        async (item?: TreeViewCommandItem) => {
          if (item?.uri) {
            const doc = await vscode.workspace.openTextDocument(item.uri);
            await vscode.window.showTextDocument(doc);
          }
        }
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gofer.showTaskDetails',
        async (item?: TreeViewCommandItem) => {
          if (item?.uri) {
            const doc = await vscode.workspace.openTextDocument(item.uri);
            await vscode.window.showTextDocument(doc);
          }
        }
      )
    );

    // gofer.showSectionDetails - Constitution section view
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gofer.showSectionDetails',
        async (section: ConstitutionSectionCommand, article: ConstitutionArticleCommand) => {
          const { showSectionDetailsWebview } = await import('../webviewHelpers');
          await showSectionDetailsWebview(context, section, article);
        }
      )
    );

    // gofer.showArticleDetails - Constitution article view
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gofer.showArticleDetails',
        async (article: ConstitutionArticleCommand) => {
          const { showArticleDetailsWebview } = await import('../webviewHelpers');
          await showArticleDetailsWebview(context, article);
        }
      )
    );

    // gofer.showMemoryDocument - Memory document view
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gofer.showMemoryDocument',
        async (document: MemoryContentCommand | MemoryDocumentCommand) => {
          const { showMemoryDocumentWebview } = await import('../webviewHelpers');
          await showMemoryDocumentWebview(context, document);
        }
      )
    );

    // gofer.showMemorySection - Memory section view
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gofer.showMemorySection',
        async (section: ConstitutionSectionCommand, document: MemoryDocumentCommand) => {
          const { showMemorySectionWebview } = await import('../webviewHelpers');
          await showMemorySectionWebview(context, section, document);
        }
      )
    );

    // Open With... context menu commands
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gofer.openWithPreview',
        async (item: TreeViewCommandItem) => {
          const { openWithPreview } = await import('../webviewHelpers');
          await openWithPreview(item);
        }
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gofer.openWithMarkSharp',
        async (item: TreeViewCommandItem) => {
          const { openWithMarkSharp } = await import('../webviewHelpers');
          await openWithMarkSharp(item);
        }
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gofer.openWithMarkdownEditor',
        async (item: TreeViewCommandItem) => {
          const { openWithMarkdownEditor } = await import('../webviewHelpers');
          await openWithMarkdownEditor(item);
        }
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        'gofer.openWithMarkdownWYSIWYG',
        async (item: TreeViewCommandItem) => {
          const { openWithMarkdownWYSIWYG } = await import('../webviewHelpers');
          await openWithMarkdownWYSIWYG(item);
        }
      )
    );
  }

  /**
   * Register checkpoint and rollback commands
   */
  private registerCheckpointCommands(
    context: vscode.ExtensionContext,
    deps: CommandDependencies
  ): void {
    // gofer.createPreOpCheckpoint
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.createPreOpCheckpoint', async () => {
        vscode.window.showInformationMessage('Checkpoint feature coming soon!');
      })
    );

    // gofer.rollbackToCheckpoint
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.rollbackToCheckpoint', async () => {
        vscode.window.showInformationMessage('Rollback feature coming soon!');
      })
    );

    // gofer.viewCompactionHistory
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.viewCompactionHistory', async () => {
        const historyPath = path.join(
          deps.workspacePath,
          '.specify',
          'logs',
          'compaction-history.jsonl'
        );
        try {
          const doc = await vscode.workspace.openTextDocument(historyPath);
          await vscode.window.showTextDocument(doc);
        } catch {
          vscode.window.showWarningMessage('No compaction history found');
        }
      })
    );

    // gofer.resumeSession
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.resumeSession', async () => {
        vscode.window.showInformationMessage('Resume session feature coming soon!');
      })
    );
  }

  /**
   * Register slop detection and reduction commands
   */
  private registerSlopCommands(context: vscode.ExtensionContext, deps: CommandDependencies): void {
    // gofer.checkForSlop
    context.subscriptions.push(
      vscode.commands.registerCommand('gofer.checkForSlop', async () => {
        if (!deps.scopeGuard) {
          vscode.window.showWarningMessage('ScopeGuard not initialized');
          return;
        }

        const violations = deps.scopeGuard.getViolations();
        if (violations.length === 0) {
          vscode.window.showInformationMessage('✅ No slop patterns detected');
        } else {
          vscode.window.showWarningMessage(
            `⚠️ Found ${violations.length} slop violations. Check Problems panel.`
          );
        }
      })
    );
  }

  /**
   * Generate spec template content
   */
  private generateSpecTemplate(specName: string, specTitle: string): string {
    return `---
id: "${specName}"
title: "${specTitle}"
status: "draft"
created: "${new Date().toISOString().split('T')[0]}"
priority: "P1"
---

# Feature Specification: ${specTitle}

<!--
  To generate a complete implementation, use the public Gofer entrypoint:
  /eai ${specTitle}

  Use /eai, #eai, or $eai where that syntax fits the host.
  Gofer routes internally through .specify/commands/*.md:
  1_gofer_research  → Creates research.md
  2_gofer_specify   → Updates this spec.md
  3_gofer_plan      → Creates plan.md, data-model.md, contracts/
  4_gofer_tasks     → Creates tasks.md
  5_gofer_implement → Implements the code
  6_gofer_validate  → Validates implementation
-->

## User Scenarios & Testing

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST [specific capability]
- **FR-002**: System MUST [specific capability]

### Non-Functional Requirements

- **NFR-001**: Performance - [requirement]
- **NFR-002**: Security - [requirement]

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| [Metric 1] | [Target] | [How measured] |

## Assumptions

- [Assumption 1]
- [Assumption 2]

## Out of Scope

- [What this feature does NOT include]
`;
  }
}
