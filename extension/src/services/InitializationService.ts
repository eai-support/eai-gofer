/**
 * Initialization Service
 *
 * Centralized initialization logic for workspace setup, provider initialization,
 * context health monitoring, and MCP configuration.
 *
 * Engineering Remediation Phase 3 - T022
 */

import { injectable } from 'tsyringe';
import * as vscode from 'vscode';
import { Logger } from './Logger';
import { ConfigManager } from '../config';
import { GoferMigrator } from '../goferMigrator';
import { BranchSpecManager } from '../branchSpecManager';
import { MCPConfigHelper } from '../mcpConfig';
import { ContextHealthMonitor, type ContextHealthStatus } from '../autonomous/ContextHealthMonitor';
import { AutoHandoffTrigger } from '../autonomous/AutoHandoffTrigger';
import { ContextUsageLogger } from '../autonomous/ContextUsageLogger';
import { WorkspaceContextProvider } from '../autonomous/WorkspaceContextProvider';
import { ClaudeSessionReader } from '../autonomous/ClaudeSessionReader';
import { HookBridgeWatcher } from '../autonomous/HookBridgeWatcher';
import { MultiSessionBridgeWatcher } from '../autonomous/MultiSessionBridgeWatcher';
import { ClaudeCodeContextScanner } from '../autonomous/ClaudeCodeContextScanner';
import { GoferActivityStatusBar } from '../ui/GoferActivityStatusBar';
import { setAutoHandoffTrigger } from '../autoHandoffBridge';
import { ConfigValidator } from '../utils/ConfigValidator';
import type { ProgressProvider } from '../progressProvider';
import type { ContextHealthStatusBar } from '../ui/ContextHealthStatusBar';
import type { ContextWindowProvider } from '../contextWindowProvider';

/**
 * Dependencies required by InitializationService
 */
export interface InitializationDependencies {
  context: vscode.ExtensionContext;
  progressProvider?: ProgressProvider;
  contextHealthStatusBar?: ContextHealthStatusBar;
  contextWindowProvider?: ContextWindowProvider;
}

/**
 * Initialized components returned from initialization
 */
export interface InitializedComponents {
  contextHealthMonitor?: ContextHealthMonitor;
  autoHandoffTrigger?: AutoHandoffTrigger;
  contextUsageLogger?: ContextUsageLogger;
  workspaceContextProvider?: WorkspaceContextProvider;
  multiSessionWatcher?: MultiSessionBridgeWatcher;
  hookBridgeWatcher?: HookBridgeWatcher;
  goferActivityStatusBar?: GoferActivityStatusBar;
  contextScanner?: ClaudeCodeContextScanner;
  branchSpecManager?: BranchSpecManager;
  migrator?: GoferMigrator;
}

/**
 * Initialization Service
 *
 * Manages workspace initialization, format detection, and component setup.
 */
@injectable()
export class InitializationService {
  constructor(private readonly logger: Logger) {}

  /**
   * Initialize extension for the current workspace
   *
   * @param deps - Initialization dependencies
   * @returns Initialized components
   */
  public async initialize(deps: InitializationDependencies): Promise<InitializedComponents> {
    this.logger.info('InitializationService', 'Starting workspace initialization');

    // Validate configuration (T039 - Security)
    const config = vscode.workspace.getConfiguration();
    const configValidator = new ConfigValidator(this.logger);
    const validationResult = configValidator.validateConfiguration(config);

    configValidator.logValidationResult(validationResult, 'workspace initialization');

    if (!validationResult.valid) {
      // Non-blocking: Log errors and continue with defaults
      this.logger.warn('InitializationService', 'Configuration validation failed, using defaults', {
        errors: validationResult.errors,
        warnings: validationResult.warnings,
      });
      // Show errors to user (non-blocking)
      void configValidator.showValidationErrors(validationResult);
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this.logger.warn('InitializationService', 'No workspace folder found');
      return {};
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const migrator = new GoferMigrator(workspacePath);

    // Detect .specify format
    const versionInfo = await migrator.getVersionInfo();
    this.logger.info('InitializationService', `Detected format: ${versionInfo.format}`);

    // Handle different scenarios
    let reinitTriggered = false;
    switch (versionInfo.format) {
      case 'none':
        reinitTriggered = await this.handleNoGofer(deps.context, workspacePath);
        break;

      case 'legacy-json':
        await this.handleLegacyFormat(deps.context, workspacePath, migrator);
        break;

      case 'gofer':
        await this.handleGoferFormat(deps, workspacePath, migrator);
        break;

      case 'mixed':
        await this.handleMixedFormat(deps.context, workspacePath, migrator);
        break;
    }

    // If gofer.initialize was triggered, reinitializeExtension() already created
    // all components via a second initializeForWorkspace() call. Skip component
    // creation to avoid duplicate command registration (gofer.showActivityDetails).
    if (reinitTriggered) {
      this.logger.info(
        'InitializationService',
        'Workspace initialization complete (via reinitialize)'
      );
      return { migrator };
    }

    // Initialize context health monitoring
    const components = this.initializeContextHealthMonitoring(deps, workspacePath);

    // Initialize branch spec manager
    const branchSpecManager = new BranchSpecManager(workspacePath);
    await branchSpecManager.initializeBranchStructure();

    this.logger.info('InitializationService', 'Workspace initialization complete');

    return {
      ...components,
      branchSpecManager,
      migrator,
    };
  }

  /**
   * Handle workspace with no .specify folder
   *
   * @returns true if gofer.initialize was triggered (which calls reinitializeExtension
   *          and creates all components), so the caller should skip component creation
   */
  private async handleNoGofer(
    _context: vscode.ExtensionContext,
    _workspacePath: string
  ): Promise<boolean> {
    const autoInit = ConfigManager.getInstance().getAutoInitialize();

    if (autoInit) {
      const choice = await vscode.window.showInformationMessage(
        'No Gofer structure found in this workspace. Initialize now?',
        'Yes',
        'No',
        "Don't ask again"
      );

      if (choice === 'Yes') {
        await vscode.commands.executeCommand('gofer.initialize');
        return true; // reinitializeExtension() already created all components
      } else if (choice === "Don't ask again") {
        const config = vscode.workspace.getConfiguration('gofer');
        await config.update('autoInitialize', false, vscode.ConfigurationTarget.Global);
      }
    }

    return false;
  }

  /**
   * Handle legacy JSON format
   */
  private async handleLegacyFormat(
    context: vscode.ExtensionContext,
    workspacePath: string,
    migrator: GoferMigrator
  ): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      '📦 Old .specify format detected (JSON)\n\nUpgrade to GitHub Gofer format (Markdown)?',
      { modal: false },
      'Upgrade Now',
      'Later',
      'Learn More'
    );

    if (choice === 'Upgrade Now') {
      await migrator.upgrade();
      // After upgrade, handled in handleGoferFormat path
    } else if (choice === 'Learn More') {
      vscode.env.openExternal(vscode.Uri.parse('https://github.com/eai-support/eai-gofer'));
    }
  }

  /**
   * Handle mixed format (both JSON and Markdown)
   */
  private async handleMixedFormat(
    context: vscode.ExtensionContext,
    workspacePath: string,
    migrator: GoferMigrator
  ): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      '⚠️ Mixed .specify formats detected\n\nClean up to use only Gofer format?',
      { modal: false },
      'Clean Up',
      'Later'
    );

    if (choice === 'Clean Up') {
      await migrator.upgrade();
    }
  }

  /**
   * Handle Gofer markdown format
   */
  private async handleGoferFormat(
    deps: InitializationDependencies,
    workspacePath: string,
    migrator: GoferMigrator
  ): Promise<void> {
    // T042: Auto-setup MCP configuration only if provider supports it
    const config = vscode.workspace.getConfiguration('gofer');
    const cliProvider = config.get<string>('cliProvider', 'auto');

    // Only setup MCP for Claude CLI or auto mode (Claude is preferred)
    if (cliProvider === 'claude' || cliProvider === 'auto') {
      const mcpConfigHelper = new MCPConfigHelper(workspacePath, deps.context);
      await mcpConfigHelper.autoSetup();
    }

    // Check if extension version was upgraded
    const versionUpgraded = await this.checkForTemplateUpdates(workspacePath, deps.context);

    if (versionUpgraded) {
      // Full resource sync: copies all commands, agents, prompts, scripts, templates
      await migrator.upgrade({ skipConfirmation: true });
      // Write version file only after successful upgrade to ensure retry on failure
      await this.writeVersionFile(workspacePath);
    } else {
      // Only sync resources that are missing (empty/absent directories)
      await migrator.syncMissingResources();
    }

    vscode.window.setStatusBarMessage('$(notebook) Gofer ready', 3000);
  }

  /**
   * Check if the extension version was upgraded since last activation.
   *
   * @returns true when the extension version is newer than the stored version
   */
  private async checkForTemplateUpdates(
    workspacePath: string,
    _context: vscode.ExtensionContext
  ): Promise<boolean> {
    const fs = require('fs/promises');
    const path = require('path');

    const packageJson = require('../../package.json');
    const currentVersion = packageJson.version;
    const versionFilePath = path.join(workspacePath, '.specify', '.gofer-version');

    try {
      let storedVersion = '0.0.0';
      try {
        storedVersion = await fs.readFile(versionFilePath, 'utf-8');
        storedVersion = storedVersion.trim();
      } catch {
        // File doesn't exist - first run
      }

      // Compare versions using semver comparison
      if (this.compareVersions(currentVersion, storedVersion) > 0) {
        this.logger.info('InitializationService', 'Extension version updated', {
          from: storedVersion,
          to: currentVersion,
        });
        return true;
      }
    } catch (error) {
      this.logger.warn('InitializationService', 'Failed to check template versions', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return false;
  }

  /**
   * Write the current extension version to .gofer-version file.
   * Called after successful resource sync to make the update transactional.
   */
  private async writeVersionFile(workspacePath: string): Promise<void> {
    const fs = require('fs/promises');
    const path = require('path');
    const packageJson = require('../../package.json');

    try {
      const versionFilePath = path.join(workspacePath, '.specify', '.gofer-version');
      await fs.writeFile(versionFilePath, packageJson.version, 'utf-8');
    } catch (error) {
      this.logger.warn('InitializationService', 'Failed to write version file', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Initialize context health monitoring components
   */
  private initializeContextHealthMonitoring(
    deps: InitializationDependencies,
    workspacePath: string
  ): InitializedComponents {
    try {
      // Create components
      const contextUsageLogger = new ContextUsageLogger(workspacePath);

      const contextHealthMonitor = new ContextHealthMonitor();
      contextHealthMonitor.setWorkspaceRoot(workspacePath);

      const autoHandoffTrigger = new AutoHandoffTrigger(undefined, workspacePath);
      setAutoHandoffTrigger(autoHandoffTrigger);

      // Wire status bar
      if (deps.contextHealthStatusBar) {
        deps.contextHealthStatusBar.connect(contextHealthMonitor);
        deps.contextHealthStatusBar.show();
      }

      // Wire auto-handoff
      autoHandoffTrigger.connect(contextHealthMonitor);
      autoHandoffTrigger.setUsageLogger(contextUsageLogger);

      // Wire workspace context provider
      const contextProvider = new WorkspaceContextProvider(workspacePath);
      const sessionReader = new ClaudeSessionReader(workspacePath);
      contextProvider.setSessionReader(sessionReader);

      // Wire multi-session watcher
      const multiSessionWatcher = new MultiSessionBridgeWatcher(workspacePath);
      contextProvider.setHookBridgeWatcher(multiSessionWatcher);
      multiSessionWatcher.start();

      // Wire legacy hook bridge watcher for activity status bar
      const hookBridgeWatcher = new HookBridgeWatcher(workspacePath);
      hookBridgeWatcher.start();

      const goferActivityStatusBar = new GoferActivityStatusBar(hookBridgeWatcher);
      goferActivityStatusBar.show();

      // Wire context window provider
      if (deps.contextWindowProvider) {
        deps.contextWindowProvider.setWatcher(multiSessionWatcher);
      }

      // Wire context scanner
      const contextScanner = new ClaudeCodeContextScanner(workspacePath);
      if (deps.contextWindowProvider) {
        deps.contextWindowProvider.setScanner(contextScanner);
      }

      // Wire session events
      this.wireSessionEvents(
        multiSessionWatcher,
        contextHealthMonitor,
        deps.contextHealthStatusBar,
        contextScanner
      );

      // Wire context provider
      contextHealthMonitor.setContextProvider(() => contextProvider.getContextAnalysis());

      // Wire logger events
      this.wireLoggerEvents(contextHealthMonitor, contextUsageLogger);

      // Start monitoring
      const hookDataAvailable = multiSessionWatcher.isHookDataAvailable();
      const activeSession = sessionReader.findActiveSession();
      const pollingInterval = hookDataAvailable ? 60000 : activeSession ? 10000 : 30000;

      contextHealthMonitor.checkHealth();
      contextHealthMonitor.startMonitoring(pollingInterval);

      this.logger.info('InitializationService', 'Context health monitoring initialized', {
        pollingInterval: pollingInterval / 1000 + 's',
        hookDataAvailable,
        activeSession: !!activeSession,
      });

      return {
        contextHealthMonitor,
        autoHandoffTrigger,
        contextUsageLogger,
        workspaceContextProvider: contextProvider,
        multiSessionWatcher,
        hookBridgeWatcher,
        goferActivityStatusBar,
        contextScanner,
      };
    } catch (error) {
      this.logger.error('InitializationService', error as Error, {
        operation: 'initializeContextHealthMonitoring',
      });
      return {};
    }
  }

  /**
   * Wire session event handlers
   */
  private wireSessionEvents(
    multiSessionWatcher: MultiSessionBridgeWatcher,
    contextHealthMonitor: ContextHealthMonitor,
    contextHealthStatusBar: ContextHealthStatusBar | undefined,
    contextScanner: ClaudeCodeContextScanner
  ): void {
    // Update session count on events
    const updateSessionCount = () => {
      if (contextHealthStatusBar && multiSessionWatcher) {
        contextHealthStatusBar.setSessionCount(multiSessionWatcher.getSessionCount());
      }
    };

    multiSessionWatcher.on('session-update', () => {
      updateSessionCount();
      contextScanner.invalidate();
    });

    multiSessionWatcher.on('session-added', updateSessionCount);
    multiSessionWatcher.on('session-removed', updateSessionCount);

    // Session limit reached notification
    multiSessionWatcher.on(
      'session-limit-reached',
      (payload: { evictedSessionId: string; newSessionId: string }) => {
        vscode.window.showInformationMessage(
          `Gofer tracks up to 3 Claude Code sessions. Session ${payload.evictedSessionId.substring(0, 8)} was evicted to make room for ${payload.newSessionId.substring(0, 8)}.`
        );
      }
    );

    // Bridge update → health check
    multiSessionWatcher.on('bridge-update', () => {
      contextHealthMonitor.checkHealth();
    });

    // Session start → set base polling to 60s
    multiSessionWatcher.on('session-start', () => {
      contextHealthMonitor.setBasePollingInterval(60000);
    });

    // Session stale → set base polling to 10s
    multiSessionWatcher.on('session-stale', () => {
      contextHealthMonitor.setBasePollingInterval(10000);
    });
  }

  /**
   * Wire logger event handlers (only log on status transitions)
   */
  private wireLoggerEvents(
    contextHealthMonitor: ContextHealthMonitor,
    contextUsageLogger: ContextUsageLogger
  ): void {
    let lastLoggedStatus: string | undefined;

    const logIfStatusChanged = (status: ContextHealthStatus, action?: string) => {
      if (status.status === lastLoggedStatus) {
        return;
      }
      lastLoggedStatus = status.status;
      contextUsageLogger.logHealthCheck({
        sessionId: status.sessionId || 'unknown',
        stage: 'unknown',
        status: status.status,
        tokensUsed: status.tokensUsed,
        tokensLimit: status.tokensLimit,
        utilizationPercent: status.utilizationPercent,
        breakdown: status.breakdown,
        action,
      });
    };

    contextHealthMonitor.on('healthy', (status) => {
      logIfStatusChanged(status);
    });

    contextHealthMonitor.on('warning', (status) => {
      logIfStatusChanged(status, 'Consider saving progress');
    });

    contextHealthMonitor.on('critical', (status) => {
      logIfStatusChanged(status, 'Handoff recommended');
    });
  }

  /**
   * Compare semantic versions
   *
   * @param a - Version A
   * @param b - Version B
   * @returns -1 if a < b, 0 if a == b, 1 if a > b
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) {
        return 1;
      }
      if (aPart < bPart) {
        return -1;
      }
    }

    return 0;
  }
}
