// reflect-metadata MUST be imported before anything that uses tsyringe decorators
// (e.g. @injectable() in ./services). Without this, the extension crashes at load time.
import 'reflect-metadata';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import packageJson from '../package.json';
import { GoferMigrator } from './goferMigrator';
import { ProgressProvider } from './progressProvider';
import { ConstitutionProvider } from './constitutionProvider';
import { MemoryProvider } from './memoryProvider';
import { ContextWindowProvider } from './contextWindowProvider';
// AI Token Usage Tracking (Feature 025)
import { AIUsageMonitor } from './autonomous/AIUsageMonitor';
import { AIUsageProvider } from './ui/AIUsageProvider';
import { AIUsageStatusBar } from './ui/AIUsageStatusBar';
import { ResourceDiagnostics } from './autonomous/ResourceDiagnostics';
import { AutoUpdater } from './autoUpdater';
import { GoferLSPClient } from './lspClient';
import { MemoryManager } from './autonomous/MemoryManager';
import { ContextBuilder } from './autonomous/ContextBuilder';
import { HintLoader } from './autonomous/HintLoader';
import { SubAgentDispatcher } from './autonomous/SubAgentDispatcher';
import { MemoryLayerManager } from './autonomous/MemoryLayerManager';
import { ACCOrchestrator } from './autonomous/ACCOrchestrator';
import { ObservationBridge } from './autonomous/ObservationBridge';
import { ArchitectureDecisionGate } from './services/enterpriseai/governance/ArchitectureDecisionGate';
import { setSharedContextBuilder, setSharedMemoryManager } from './autonomousCommands';
import { registerMemoryCommands } from './commands/memoryCommands';
import { registerMigrateMemoriesCommand } from './commands/migrateMemories';
import { registerQueryMemoryUsageCommand } from './commands/queryMemoryUsage';
import { registerSpecCommands } from './commands/specCommands';
// Context Health Monitoring (Spec 012)
import { ContextHealthStatusBar } from './ui/ContextHealthStatusBar';
import { ScopeGuard } from './autonomous/ScopeGuard';
import { ToolAuditLogger } from './autonomous/ToolAuditLogger';
import { RunLedger } from './autonomous/RunLedger';
import { CostBudgetEnforcer } from './autonomous/CostBudgetEnforcer';
import { PipelineStateManager } from './autonomous/PipelineStateManager';
// Hook-based monitoring
// Context Window Accuracy (Feature 023)
// Dependency Injection (Phase 3 - Engineering Remediation)
import { registerServices, getContainer } from './di';
import {
  Logger,
  DisposalService,
  EventHandlers,
  InitializationService,
  CommandRegistry,
  OptionalToolInstaller,
  StateManager,
  type EventHandlerDependencies,
  type CommandDependencies,
} from './services';
import { Logger as LegacyLogger } from './utils/logger';

/**
 * Gofer Extension
 *
 * © 2025 Enterprise AI Pty Ltd
 *
 * Automatically detects, upgrades, and works with .specify folders
 * in any repository you open.
 *
 * Now with LSP + MCP integration for automated orchestration!
 */

// Phase 1 Engineering Remediation: Logger service (T011-T013)
// Keep logger as module-level for early initialization and convenience
let logger: Logger | undefined;

const ENTERPRISEAI_ONBOARDING_MESSAGE =
  'Gofer initialized. Use the core pipeline from Gofer Start through validation, with multi-platform workflows available across supported hosts.';

interface CopilotAvailabilityContext {
  available: boolean;
  viaDefaultCLI: boolean;
  viaPreferredAI: boolean;
  viaExtension: boolean;
  viaCliBinary: boolean;
  viaGitHubCliSubcommand: boolean;
}

// Module-level reference to EventHandler deps so initializeForWorkspace can
// mutate sharedContextBuilder after creation (enables auto-activate of config reload handlers)
let eventHandlerDeps: EventHandlerDependencies | undefined;

/**
 * Get StateManager singleton from DI container
 * Helper function for convenient access to state throughout the extension
 */
function getState(): StateManager {
  return getContainer().resolve(StateManager);
}

async function resolveCopilotAvailability(
  config: vscode.WorkspaceConfiguration,
  cliHealthChecker: {
    detectVersion(cliCommand: string): Promise<string | null>;
    supportsSubcommand(cliCommand: string, args: string[]): Promise<boolean>;
  }
): Promise<CopilotAvailabilityContext> {
  const defaultCLI = config.get<'claude' | 'copilot' | 'codex' | 'gemini' | 'auto'>(
    'defaultCLI',
    'auto'
  );
  const preferredAI = config.get<'ask' | 'claude' | 'copilot'>('preferredAI', 'ask');
  const viaExtension =
    vscode.extensions.getExtension('GitHub.copilot') !== undefined ||
    vscode.extensions.getExtension('GitHub.copilot-chat') !== undefined;
  const viaDefaultCLI = defaultCLI === 'copilot';
  const viaPreferredAI = preferredAI === 'copilot';
  const shouldCheckCopilotCli = !viaDefaultCLI && !viaPreferredAI && !viaExtension;
  const viaCliBinary =
    shouldCheckCopilotCli && (await cliHealthChecker.detectVersion('copilot')) !== null;
  const viaGitHubCliSubcommand =
    shouldCheckCopilotCli && !viaCliBinary
      ? await cliHealthChecker.supportsSubcommand('gh', ['copilot', '--help'])
      : false;

  return {
    available:
      viaDefaultCLI || viaPreferredAI || viaExtension || viaCliBinary || viaGitHubCliSubcommand,
    viaDefaultCLI,
    viaPreferredAI,
    viaExtension,
    viaCliBinary,
    viaGitHubCliSubcommand,
  };
}

async function showOptionalToolPrompt(workspacePath: string): Promise<void> {
  try {
    const installer = getContainer().resolve(OptionalToolInstaller);
    await installer.promptForRecommendedTools(workspacePath);
  } catch (error) {
    logger?.warn('Extension', 'Failed to show optional tool prompt', {
      workspacePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Set the upgrade state (exported for use by goferMigrator)
 */
export function setUpgradeState(state: boolean): void {
  getState().isUpgrading = state;
}

/**
 * Check if an upgrade is in progress
 */
export function isUpgradeInProgress(): boolean {
  return getState().isUpgrading;
}

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize Dependency Injection container (Phase 3 - Engineering Remediation)
  registerServices();

  // Resolve Logger service and initialize with output channel
  logger = getContainer().resolve(Logger);
  const outputChannel = vscode.window.createOutputChannel('Gofer');
  logger.initialize(outputChannel);
  context.subscriptions.push(outputChannel);

  // Bridge the legacy Logger (utils/logger.ts) to use the same output channel
  // so all 16 autonomous/ modules log to the Gofer output panel
  LegacyLogger.bridgeOutputChannel(outputChannel);

  logger.info('Extension', 'Activating Gofer extension');

  // Reset Claude Code running context on startup (in case it was left true from a crash)
  await vscode.commands.executeCommand('setContext', 'gofer.claudeCodeRunning', false);

  // Setup auto-updater (using GitHub Pages API for private repo)
  const autoUpdater = new AutoUpdater(
    'eai-tools/eai-gofer', // GitHub repo
    packageJson.version, // Current version
    'eai-gofer' // Extension name for VSIX filename
  );

  // Start checking for updates using GitHub Pages API
  autoUpdater.startPeriodicChecks(context);

  // Store in state
  getState().autoUpdater = autoUpdater;

  // Setup Language Server (deferred to avoid blocking activation)
  const setupLSP = async (): Promise<void> => {
    try {
      const lspClient = new GoferLSPClient(context);
      await lspClient.start();
      getState().lspClient = lspClient;
      logger?.info('Extension', 'Language Server started');
    } catch (error) {
      logger?.error('Extension', error as Error, { operation: 'setupLSP' });
    }
  };

  // Start LSP in background (non-blocking)
  setupLSP();

  // Register tree views immediately
  registerTreeViews(context);

  // Register global commands (available even without workspace)
  registerGlobalCommands(context);

  // Get or create EventHandlers instance
  const eventHandlers = getContainer().resolve(EventHandlers);
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

  const state = getState();

  // Register event handlers (store deps at module level so initializeForWorkspace
  // can update sharedContextBuilder after creation — enables auto-activate of config reload handlers)
  eventHandlerDeps = {
    workspacePath,
    context,
    progressProvider: state.progressProvider,
    memoryProvider: state.memoryProvider,
    branchSpecManager: state.branchSpecManager,
    sharedContextBuilder: state.sharedContextBuilder,
    memoryManager: state.memoryManager,
    workspaceContextProvider: state.workspaceContextProvider,
    hookBridgeWatcher: state.hookBridgeWatcher,
    scopeGuard: state.scopeGuard,
    researchChunker: state.researchChunker,
    reinitializeExtension: () => reinitializeExtension(context),
    handleSpecModification: async () => {
      /* Spec modification handled by EventHandlers */
    },
    handleBranchChange: async () => {
      /* Branch change handled by EventHandlers */
    },
    isUpgrading: () => state.isUpgrading,
  };
  eventHandlers.registerAll(eventHandlerDeps);

  // Watch for CLI provider config changes (AC 4: Immediate provider switching)
  // R6: Watch all CLI-related settings per contracts/events.md:53-56
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (
        e.affectsConfiguration('gofer.cliProvider') ||
        e.affectsConfiguration('gofer.claudeCodeCommand') ||
        e.affectsConfiguration('gofer.codexCommand')
      ) {
        logger?.info('Extension', 'CLI provider setting changed - reloading extension');
        await reinitializeExtension(context);
        vscode.window.showInformationMessage('Gofer: CLI provider changed. Extension reloaded.');
      }
    })
  );

  // Initialize for the current workspace (if one is open)
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    logger.info('Extension', 'No workspace folder open yet, waiting for workspace...');
    // No workspace open yet, listener above will handle it when one is added
    return;
  }

  // Initialize workspace in background (non-blocking) to prevent activation timeout
  initializeForWorkspace(context).catch((error) => {
    logger?.warn('Extension', 'Workspace initialization failed (non-critical)', {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  logger.info('Extension', 'Gofer extension activated successfully');
}

/**
 * Register tree views immediately on activation
 * Views must be registered before commands that reference them
 */
function registerTreeViews(context: vscode.ExtensionContext): void {
  // Get workspace path (or use empty string if no workspace)
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

  // Create providers with empty/initial state
  // They will be properly initialized later when workspace is ready
  const progressProvider = new ProgressProvider(workspacePath, undefined);
  const constitutionProvider = new ConstitutionProvider(workspacePath);
  const memoryProvider = new MemoryProvider(workspacePath);
  const contextWindowProvider = new ContextWindowProvider(workspacePath);

  // AI Usage Provider (Feature 025) - replaces Context Window in sidebar
  const aiUsageProvider = new AIUsageProvider();

  // Store in state
  const state = getState();
  state.progressProvider = progressProvider;
  state.constitutionProvider = constitutionProvider;
  state.memoryProvider = memoryProvider;
  state.contextWindowProvider = contextWindowProvider;
  state.aiUsageProvider = aiUsageProvider;

  // Register tree data providers - MUST happen before commands are registered
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('goferProgress', progressProvider)
  );

  // AI Token Usage panel replaces Context Window (Feature 025)
  // Use createTreeView for visibility tracking (T032)
  const aiUsageTreeView = vscode.window.createTreeView('goferAIUsage', {
    treeDataProvider: aiUsageProvider,
  });
  aiUsageProvider.setTreeView(aiUsageTreeView);
  context.subscriptions.push(aiUsageTreeView);

  context.subscriptions.push(vscode.window.registerTreeDataProvider('goferMemory', memoryProvider));

  // Create context health status bar (Spec 012)
  // Created early so command is available, connected to monitor later
  const contextHealthStatusBar = new ContextHealthStatusBar(context);
  state.contextHealthStatusBar = contextHealthStatusBar;

  // Create AI usage status bar (Feature 025)
  // Created early so command is available, connected to monitor later
  const aiUsageStatusBar = new AIUsageStatusBar(context);
  state.aiUsageStatusBar = aiUsageStatusBar;
}

/**
 * Reinitialize extension when workspace changes
 * Uses DisposalService to clean up old resources and InitializationService to reinitialize
 */
async function reinitializeExtension(context: vscode.ExtensionContext): Promise<void> {
  const state = getState();

  // Prevent concurrent reinitializations
  if (state.isReinitializing) {
    logger?.debug('Extension', 'Reinitialize already in progress, skipping');
    return;
  }

  state.isReinitializing = true;
  try {
    logger?.info('Extension', 'Reinitializing extension for workspace change');

    // CRITICAL: Dispose all watchers and timers BEFORE reinitializing
    // to prevent memory leaks and resource exhaustion
    const disposalService = getContainer().resolve(DisposalService);
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    await disposalService.dispose(
      {
        sharedContextBuilder: state.sharedContextBuilder,
        cacheSaveTimer: state.cacheSaveTimer,
        consolidationTimer: state.consolidationTimer,
        workspaceContextProvider: state.workspaceContextProvider,
        contextHealthMonitor: state.contextHealthMonitor,
        autoHandoffTrigger: state.autoHandoffTrigger,
        contextHealthStatusBar: state.contextHealthStatusBar,
        continuousMemoryWriter: state.continuousMemoryWriter,
        hookBridgeWatcher: state.hookBridgeWatcher,
        multiSessionWatcher: state.multiSessionWatcher,
        goferActivityStatusBar: state.goferActivityStatusBar,
        contextUsageLogger: state.contextUsageLogger,
        accOrchestrator: state.accOrchestrator,
        observationBridge: state.observationBridge,
        aiUsageMonitor: state.aiUsageMonitor,
        aiUsageProvider: state.aiUsageProvider,
        aiUsageStatusBar: state.aiUsageStatusBar,
        resourceDiagnostics: state.resourceDiagnostics,
        progressProvider: state.progressProvider,
        constitutionProvider: state.constitutionProvider,
        memoryProvider: state.memoryProvider,
        branchSpecManager: state.branchSpecManager,
        memoryManager: state.memoryManager,
      },
      workspacePath
    );

    // Clear references after disposal
    state.sharedContextBuilder = undefined;
    state.memoryManager = undefined;
    state.clearTimers();
    state.clearMonitoringComponents();

    // Refresh the providers with new workspace data
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      // Update providers with new workspace
      state.progressProvider?.refresh();
      state.constitutionProvider?.refresh();
      state.memoryProvider?.refresh();
    }

    // Reinitialize for new workspace
    await initializeForWorkspace(context);

    logger?.info('Extension', 'Extension reinitialized successfully');
  } finally {
    state.resetReinitializationFlag();
  }
}

/**
 * Initialize extension for current workspace
 * Uses InitializationService and CommandRegistry
 */
async function initializeForWorkspace(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    logger?.debug('Extension', 'No workspace folder found for initialization');
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;
  logger?.info('Extension', 'Initializing workspace', { workspacePath });

  const state = getState();

  // Resolve InitializationService and initialize workspace
  const initService = getContainer().resolve(InitializationService);
  const components = await initService.initialize({
    context,
    progressProvider: state.progressProvider,
    contextHealthStatusBar: state.contextHealthStatusBar,
    contextWindowProvider: state.contextWindowProvider,
  });

  // Update state with initialized components
  state.contextHealthMonitor = components.contextHealthMonitor;
  state.autoHandoffTrigger = components.autoHandoffTrigger;
  state.contextUsageLogger = components.contextUsageLogger;
  state.workspaceContextProvider = components.workspaceContextProvider;
  state.multiSessionWatcher = components.multiSessionWatcher;
  state.hookBridgeWatcher = components.hookBridgeWatcher;
  state.goferActivityStatusBar = components.goferActivityStatusBar;
  state.contextScanner = components.contextScanner;
  state.branchSpecManager = components.branchSpecManager;
  const migrator = components.migrator;

  const resourceDiagnostics = new ResourceDiagnostics(workspacePath);
  resourceDiagnostics.start();
  resourceDiagnostics.captureSnapshot('workspace-initialized');
  state.resourceDiagnostics = resourceDiagnostics;

  // Initialize MemoryManager for memory commands (if not already initialized)
  if (!state.memoryManager && state.branchSpecManager) {
    state.memoryManager = new MemoryManager(context, workspacePath);
    setSharedMemoryManager(state.memoryManager);
    // Wire MemoryManager to MemoryProvider so the MEMORY panel can display stored memories
    state.memoryProvider?.setMemoryManager(state.memoryManager);
    // Register memory commands now that memoryManager is available
    // (can't register in registerGlobalCommands because memoryManager isn't ready yet)
    registerMemoryCommands(context, state.memoryManager);
    // T024: Register migration command (Feature 029 - Memory System v2)
    registerMigrateMemoriesCommand(context, state.memoryManager);
    // T094: Register queryMemoryUsage command (Feature 029 - Memory System v2)
    // contextBuilder is available after ContextBuilder wiring below
  }

  if (eventHandlerDeps) {
    eventHandlerDeps.memoryManager = state.memoryManager;
    eventHandlerDeps.memoryProvider = state.memoryProvider;
  }

  // Wire shared ContextBuilder (Feature 024) — activates ~3,700 LOC of dead code
  // Must be created AFTER MemoryManager and BEFORE CommandRegistry.registerAll()
  if (state.memoryManager) {
    const hintLoader = new HintLoader(workspacePath);
    const contextBuilder = new ContextBuilder(workspacePath, state.memoryManager, hintLoader);
    state.sharedContextBuilder = contextBuilder;
    setSharedContextBuilder(contextBuilder);
    // T094: Register queryMemoryUsage command now that contextBuilder is available
    registerQueryMemoryUsageCommand(context, contextBuilder, workspacePath);

    // Wire ContextUsageLogger (exists from InitializationService)
    if (state.contextUsageLogger) {
      contextBuilder.setUsageLogger(state.contextUsageLogger);
    }

    // Do not persist ContextBuilder telemetry as first-class memories by default.
    // The sidebar and AI retrieval paths should be driven by durable human-relevant
    // memories, not repeated loading/budget events.
    state.continuousMemoryWriter = undefined;

    // Wire AutoHandoffTrigger to ContextBuilder
    if (state.autoHandoffTrigger) {
      state.autoHandoffTrigger.setContextBuilder(contextBuilder);

      // Wire SlopReducer to AutoHandoffTrigger (enables auto-reduce before save/clear/continue)
      const { SlopReducer } = await import('./autonomous/SlopReducer');
      const slopReducer = new SlopReducer(workspacePath);
      state.autoHandoffTrigger.setSlopReducer(slopReducer);
    }

    // Update EventHandler deps so config reload handlers auto-activate
    if (eventHandlerDeps) {
      eventHandlerDeps.sharedContextBuilder = contextBuilder;
    }

    // Wire SubAgentDispatcher (Feature 024 - T037)
    const subAgentDispatcher = new SubAgentDispatcher(workspacePath);
    contextBuilder.setSubAgentDispatcher(subAgentDispatcher);

    // Subscribe to utilization updates from ContextHealthMonitor
    if (state.contextHealthMonitor) {
      state.contextHealthMonitor.on('status-change', (_from, _to, status) => {
        subAgentDispatcher.updateUtilization(status.utilizationPercent);
      });
    }

    // Wire MemoryLayerManager (Feature 024 - T038)
    const memoryLayerManager = new MemoryLayerManager(workspacePath);
    memoryLayerManager.setMemoryManager(state.memoryManager);
    const useLayered = vscode.workspace
      .getConfiguration('gofer')
      .get<boolean>('useLayeredMemory', false);
    contextBuilder.setMemoryLayerManager(memoryLayerManager, useLayered);

    // Wire ACCOrchestrator (Feature 024 - T031)
    const architectureDecisionGate = new ArchitectureDecisionGate();
    const accOrchestrator = new ACCOrchestrator(
      contextBuilder,
      contextBuilder.getObservationMasker(),
      subAgentDispatcher,
      null, // ContextCompactor wired later when autonomous session starts
      architectureDecisionGate
    );
    if (state.contextHealthMonitor) {
      accOrchestrator.connect(state.contextHealthMonitor);
    }
    state.accOrchestrator = accOrchestrator;

    // Wire ContextBridgeWriter to ACCOrchestrator (Feature 025 - Phase 4)
    try {
      const { ContextBridgeWriter } = await import('./autonomous/ContextBridgeWriter');
      const contextBridgeWriter = new ContextBridgeWriter(contextBuilder, workspacePath);
      accOrchestrator.setContextBridgeWriter(contextBridgeWriter);
      accOrchestrator.setCurrentTaskContext({
        taskId: 'current',
        specId: '',
        description: 'Active session',
      });
    } catch {
      // Non-fatal: enriched context refresh is optional
    }

    // Wire ObservationBridge (Feature 025 - Phase 1)
    const observationBridge = new ObservationBridge(contextBuilder, workspacePath);
    if (state.multiSessionWatcher) {
      observationBridge.connect(state.multiSessionWatcher);
    }
    state.observationBridge = observationBridge;

    // Reset state on session transitions (Feature 025 - Phase 3)
    if (state.multiSessionWatcher) {
      state.multiSessionWatcher.on('session-start', () => {
        contextBuilder.resetForNewSession();
        accOrchestrator.resetSessionState();
        state.contextHealthMonitor?.clearHistory();
      });
    }

    logger?.info('Extension', 'Shared ContextBuilder wired');
  }

  // Initialize ScopeGuard, RunLedger, and ToolAuditLogger
  const runLedger = new RunLedger(workspacePath);

  // 002 AC-3.3: Wire pipeline runId to RunLedger for correlation
  const pipelineStateManager = new PipelineStateManager(workspacePath);
  await tryWireRunId(pipelineStateManager, runLedger, workspacePath);

  const scopeGuard = new ScopeGuard(workspacePath);

  const toolAuditLogger = new ToolAuditLogger(workspacePath, runLedger);
  scopeGuard.setToolAuditLogger(toolAuditLogger);
  state.scopeGuard = scopeGuard;

  // Wire ScopeGuard to shared ContextBuilder (Feature 024)
  if (state.sharedContextBuilder) {
    state.sharedContextBuilder.setScopeGuard(scopeGuard);
  }

  const costBudgetEnforcer = new CostBudgetEnforcer({}, runLedger);
  state.costBudgetEnforcer = costBudgetEnforcer;

  // Wire CostBudgetEnforcer to shared ContextBuilder (Feature 024)
  if (state.sharedContextBuilder) {
    state.sharedContextBuilder.setCostBudgetEnforcer(costBudgetEnforcer);
  }

  // Wire RunLedger into existing loggers
  if (state.contextUsageLogger) {
    state.contextUsageLogger.setRunLedger(runLedger);
    // 002 AC-6.4: Wire CostBudgetEnforcer so logLLMCall() forwards to recordUsage()
    state.contextUsageLogger.setCostBudgetEnforcer(costBudgetEnforcer);
    // 002 AC-6.7: Wire ContextHealthStatusBar for budget snapshot display
    if (state.contextHealthStatusBar) {
      state.contextUsageLogger.setContextHealthStatusBar(state.contextHealthStatusBar);
    }
  }

  // Wire AIUsageMonitor to local CLI usage logs.
  // CRITICAL: Wrapped in try-catch so AI Usage Panel works even if other init steps fail
  try {
    const { getClaudeCodeAdapter } = await import('./autonomous/ClaudeCodeUsageAdapter');
    const dataSource: import('./types/aiUsage').UsageDataSource =
      getClaudeCodeAdapter(workspacePath);

    const aiUsageMonitor = new AIUsageMonitor(
      workspacePath,
      dataSource,
      costBudgetEnforcer,
      state.multiSessionWatcher ?? undefined
    );
    state.aiUsageMonitor = aiUsageMonitor;

    // Wire AIUsageProvider to monitor
    if (state.aiUsageProvider) {
      state.aiUsageProvider.setMonitor(aiUsageMonitor);
      logger?.info('Extension', '[AIUsage] setMonitor() called on AIUsageProvider');
    } else {
      logger?.warn('Extension', '[AIUsage] CRITICAL: state.aiUsageProvider is null!');
    }

    // Wire AIUsageStatusBar to monitor
    if (state.aiUsageStatusBar) {
      state.aiUsageStatusBar.connect(aiUsageMonitor);
    }

    // Start monitoring
    aiUsageMonitor.startMonitoring();
    context.subscriptions.push(aiUsageMonitor);

    logger?.info('Extension', 'AIUsageMonitor wired to local CLI usage and started successfully');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger?.error('Extension', err, {
      message: '[AIUsage] CRITICAL: Failed to initialize AIUsageMonitor',
    });
    vscode.window.showErrorMessage(
      `Gofer: AI Usage Panel initialization failed. Check Output > Gofer for details.`
    );
  }

  // Protected boundaries are loaded by ScopeGuard.loadFromSpec() when a spec is opened.
  // The EventHandlers' ScopeGuard diagnostics integration handles this via hookBridgeWatcher.

  // Initialize CrossPlatformCommandRouter for cross-platform command parity (Feature 028)
  const { CrossPlatformCommandRouter } = await import('./council/CrossPlatformCommandRouter');
  const crossPlatformCommandRouter = new CrossPlatformCommandRouter(workspacePath);
  state.crossPlatformCommandRouter = crossPlatformCommandRouter;

  // Register settings watcher for gofer.defaultCLI changes (clears router cache on change)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gofer.defaultCLI')) {
        crossPlatformCommandRouter.clearCache();
        logger?.debug(
          'Extension',
          'CrossPlatformCommandRouter cache cleared due to settings change'
        );
      }
    })
  );

  // Register workspace commands using CommandRegistry
  if (migrator) {
    const commandRegistry = getContainer().resolve(CommandRegistry);
    const commandDeps: CommandDependencies = {
      workspacePath,
      migrator,
      progressProvider: state.progressProvider,
      constitutionProvider: state.constitutionProvider,
      memoryProvider: state.memoryProvider,
      contextWindowProvider: state.contextWindowProvider,
      branchSpecManager: state.branchSpecManager,
      sharedContextBuilder: state.sharedContextBuilder,
      memoryManager: state.memoryManager,
      scopeGuard: state.scopeGuard,
      researchChunker: state.researchChunker,
      autoUpdater: state.autoUpdater,
      crossPlatformCommandRouter: state.crossPlatformCommandRouter,
      isUpgrading: () => state.isUpgrading,
      setUpgradeState,
    };
    commandRegistry.registerAll(context, commandDeps);
  }

  // T035: CLI Provider Health Check on Activation
  // Check selected CLI provider and show notifications for issues
  try {
    const { CLIHealthChecker } = await import('./council/providers/cli/CLIHealthChecker');
    const config = vscode.workspace.getConfiguration('gofer');
    const preference = config.get<'claude' | 'codex' | 'copilot' | 'gemini' | 'auto'>(
      'cliProvider',
      'auto'
    );
    const defaultCLI = config.get<'claude' | 'copilot' | 'codex' | 'gemini' | 'auto'>(
      'defaultCLI',
      'auto'
    );
    const copilotAvailability = await resolveCopilotAvailability(config, CLIHealthChecker);

    if (preference === 'copilot' || preference === 'gemini') {
      logger?.debug(
        'Extension',
        `Skipping autonomous CLI health check for gofer.cliProvider=${preference}`
      );
    } else if (preference === 'auto' && (defaultCLI === 'copilot' || defaultCLI === 'gemini')) {
      logger?.debug(
        'Extension',
        `Skipping autonomous CLI health check for gofer.defaultCLI=${defaultCLI}`
      );
    } else if (preference === 'auto') {
      // Auto-detect to show helpful errors for both CLIs
      const claudeCommand = config.get<string>('claudeCodeCommand', 'claude');
      const claudeResult = await CLIHealthChecker.check('claude', claudeCommand);

      if (!claudeResult.available || !claudeResult.authenticated) {
        if (copilotAvailability.available) {
          logger?.info(
            'Extension',
            'Skipping autonomous CLI missing-provider warning because Copilot is available for command routing',
            { ...copilotAvailability }
          );
        } else {
          // Try Codex as fallback
          const codexCommand = config.get<string>('codexCommand', 'codex');
          const codexResult = await CLIHealthChecker.check('codex', codexCommand);

          if (!codexResult.available) {
            // Neither CLI is available - show comprehensive error
            const message =
              'No CLI provider found for autonomous mode. Install one:\n' +
              '• Claude Code CLI: npm install -g @anthropic/claude-code\n' +
              '• Codex CLI: npm install -g @openai/codex-cli';

            vscode.window
              .showWarningMessage(message, 'View Settings', 'Install Guide')
              .then((selection) => {
                if (selection === 'View Settings') {
                  vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'gofer.cliProvider'
                  );
                } else if (selection === 'Install Guide') {
                  vscode.env.openExternal(vscode.Uri.parse('https://docs.gofer.dev/setup'));
                }
              });
          } else if (!codexResult.authenticated) {
            // Codex found but not authenticated
            vscode.window
              .showWarningMessage(
                `Codex CLI found but not authenticated. ${codexResult.authInstructions}`,
                'View Settings'
              )
              .then((selection) => {
                if (selection === 'View Settings') {
                  vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'gofer.cliProvider'
                  );
                }
              });
          }
        }
      }
      // Note: Claude authentication check is already handled by line 706 condition
    } else {
      // Specific provider selected - check only that one
      const cliType: 'claude' | 'codex' = preference;
      const cliCommand = config.get<string>(
        cliType === 'claude' ? 'claudeCodeCommand' : 'codexCommand',
        cliType === 'claude' ? 'claude' : 'codex'
      );

      const result = await CLIHealthChecker.check(cliType, cliCommand);

      if (!result.available) {
        vscode.window
          .showErrorMessage(
            `${cliType} CLI not found. ${result.installInstructions}`,
            'View Settings'
          )
          .then((selection) => {
            if (selection === 'View Settings') {
              vscode.commands.executeCommand('workbench.action.openSettings', 'gofer.cliProvider');
            }
          });
      } else if (!result.authenticated) {
        vscode.window
          .showWarningMessage(
            `${cliType} CLI found but not authenticated. ${result.authInstructions}`,
            'View Settings'
          )
          .then((selection) => {
            if (selection === 'View Settings') {
              vscode.commands.executeCommand('workbench.action.openSettings', 'gofer.cliProvider');
            }
          });
      } else if (!result.compatible) {
        vscode.window.showWarningMessage(
          `${cliType} version incompatible. ${result.installInstructions}`
        );
      }
    }
  } catch (error) {
    // Non-fatal: CLI health check is optional
    logger?.debug('Extension', 'CLI health check failed (non-critical)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // T035: Show persistent provider status in status bar (US3: Settings UI shows ✓/✗ status)
  try {
    const config = vscode.workspace.getConfiguration('gofer');
    const preference = config.get<'claude' | 'codex' | 'copilot' | 'gemini' | 'auto'>(
      'cliProvider',
      'auto'
    );
    const defaultCLI = config.get<'claude' | 'copilot' | 'codex' | 'gemini' | 'auto'>(
      'defaultCLI',
      'auto'
    );
    const { CLIHealthChecker } = await import('./council/providers/cli/CLIHealthChecker');
    const copilotAvailability = await resolveCopilotAvailability(config, CLIHealthChecker);

    let statusIcon = '$(warning)';
    let statusText = 'No CLI';
    let statusTooltip = 'No AI CLI provider found. Open settings to configure.';

    if (preference === 'copilot' || preference === 'gemini') {
      statusIcon = '$(check)';
      statusText = preference === 'copilot' ? 'Copilot' : 'Gemini';
      statusTooltip =
        `${statusText} selected for command routing. ` +
        'Autonomous mode uses Claude/Codex fallback when required.';
    } else if (preference !== 'auto') {
      const cmd = config.get<string>(
        preference === 'claude' ? 'claudeCodeCommand' : 'codexCommand',
        preference
      );
      const result = await CLIHealthChecker.check(preference, cmd);
      if (result.available && result.authenticated) {
        statusIcon = '$(check)';
        statusText = preference === 'claude' ? 'Claude' : 'Codex';
        statusTooltip = `${statusText} CLI ready`;
      } else if (result.available) {
        statusIcon = '$(warning)';
        statusText = preference === 'claude' ? 'Claude' : 'Codex';
        statusTooltip = `${statusText} CLI found but not authenticated`;
      }
    } else if (defaultCLI === 'copilot' || defaultCLI === 'gemini') {
      statusIcon = '$(check)';
      statusText = defaultCLI === 'copilot' ? 'Copilot' : 'Gemini';
      statusTooltip =
        `${statusText} selected via gofer.defaultCLI. ` +
        'Autonomous mode uses Claude/Codex fallback when required.';
    } else {
      const claudeCmd = config.get<string>('claudeCodeCommand', 'claude');
      const claudeResult = await CLIHealthChecker.check('claude', claudeCmd);
      if (claudeResult.available && claudeResult.authenticated) {
        statusIcon = '$(check)';
        statusText = 'Claude';
        statusTooltip = 'Claude CLI ready (auto-detected)';
      } else {
        const codexCmd = config.get<string>('codexCommand', 'codex');
        const codexResult = await CLIHealthChecker.check('codex', codexCmd);
        if (codexResult.available && codexResult.authenticated) {
          statusIcon = '$(check)';
          statusText = 'Codex';
          statusTooltip = 'Codex CLI ready (auto-detected)';
        } else if (copilotAvailability.available) {
          statusIcon = '$(check)';
          statusText = 'Copilot';
          statusTooltip =
            'Copilot detected for command routing. Autonomous mode uses Claude/Codex when required.';
        }
      }
    }

    const providerStatusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    providerStatusBar.text = `${statusIcon} ${statusText}`;
    providerStatusBar.tooltip = statusTooltip;
    providerStatusBar.command = 'workbench.action.openSettings';
    providerStatusBar.show();
    context.subscriptions.push(providerStatusBar);
  } catch {
    // Non-fatal: status bar is cosmetic
  }

  logger?.info('Extension', 'Workspace initialization complete');
}

/**
 * Register global commands (available even without workspace)
 * These commands are registered early before workspace detection
 */
async function runPublicGoferEntrypoint(label: 'Gofer' | 'EAI Gofer'): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showInformationMessage(`${label}: open a folder first, then run Gofer again.`);
    return;
  }

  const workspacePath = workspaceFolder.uri.fsPath;
  const specifyPath = path.join(workspacePath, '.specify');

  if (!fs.existsSync(specifyPath)) {
    const choice = await vscode.window.showInformationMessage(
      `${label}: this folder is not set up for Gofer yet. Initialize it now?`,
      'Initialize Gofer',
      'Not now'
    );

    if (choice === 'Initialize Gofer') {
      await vscode.commands.executeCommand('gofer.initialize');
    }
    return;
  }

  try {
    await vscode.commands.executeCommand('goferProgress.focus');
  } catch {
    // The view command is optional during early activation; the user guidance is still useful.
  }

  vscode.window.showInformationMessage(
    `${label} is ready. In your AI app, run /gofer or /eai-gofer. Use #gofer in Copilot or $gofer in hosts that use dollar-prefixed skills.`
  );
}

function registerGlobalCommands(context: vscode.ExtensionContext): void {
  logger?.debug('Extension', 'Registering global commands');

  context.subscriptions.push(
    vscode.commands.registerCommand('gofer.run', async () => {
      await runPublicGoferEntrypoint('Gofer');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gofer.eaiGofer', async () => {
      await runPublicGoferEntrypoint('EAI Gofer');
    })
  );

  // gofer.initialize - Initialize .specify structure
  context.subscriptions.push(
    vscode.commands.registerCommand('gofer.initialize', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const workspacePath = workspaceFolder.uri.fsPath;
      const migrator = new GoferMigrator(workspacePath);

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Initializing Gofer...',
            cancellable: false,
          },
          async () => {
            // Use upgrade with skipConfirmation to initialize fresh structure
            await migrator.upgrade({ skipConfirmation: true });
            await migrator.syncMissingResources();
            // Trigger workspace reinitialization to activate all features
            await reinitializeExtension(context);
            vscode.window.showInformationMessage(ENTERPRISEAI_ONBOARDING_MESSAGE);
            await showOptionalToolPrompt(workspacePath);
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to initialize Gofer: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gofer.installOptionalTools', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const workspacePath = workspaceFolder.uri.fsPath;
      const migrator = new GoferMigrator(workspacePath);

      try {
        const format = await migrator.detectFormat();
        if (format === 'none') {
          vscode.window.showWarningMessage(
            'Initialize Gofer before installing optional developer tools.'
          );
          return;
        }

        await migrator.syncMissingResources();

        const installer = getContainer().resolve(OptionalToolInstaller);
        await installer.promptForToolSelection(workspacePath);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to launch optional tools installer: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  // gofer.showConstitution - Show project constitution
  context.subscriptions.push(
    vscode.commands.registerCommand('gofer.showConstitution', async () => {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const constitutionPath = path.join(workspacePath, '.specify', 'memory', 'constitution.md');
      try {
        const doc = await vscode.workspace.openTextDocument(constitutionPath);
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showWarningMessage(
          'No constitution.md found. Run /gofer_constitution to create one.'
        );
      }
    })
  );

  const state = getState();

  // gofer.checkForUpdates - Manual update check (must be global for Command Palette)
  context.subscriptions.push(
    vscode.commands.registerCommand('gofer.checkForUpdates', async () => {
      if (state.autoUpdater) {
        await state.autoUpdater.manualCheck();
      } else {
        vscode.window.showErrorMessage('Auto-updater not initialized');
      }
    })
  );

  // gofer.updateNow - Update now (must be global - referenced in view/title menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('gofer.updateNow', async () => {
      if (state.autoUpdater) {
        await state.autoUpdater.manualCheck();
      } else {
        vscode.window.showErrorMessage('Auto-updater not initialized');
      }
    })
  );

  // gofer.refreshAIUsage - Refresh AI usage panel (must be global - referenced in view/title menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('gofer.refreshAIUsage', async () => {
      if (state.aiUsageProvider) {
        await state.aiUsageProvider.manualRefresh();
      }
    })
  );

  // gofer.debugAIUsage - Debug AI usage auto-discovery
  context.subscriptions.push(
    vscode.commands.registerCommand('gofer.debugAIUsage', async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }
      const { debugAIUsageCommand } = await import('./commands/debugAIUsage');
      await debugAIUsageCommand(workspaceFolders[0].uri.fsPath);
    })
  );

  // Memory commands are registered in initializeForWorkspace() after memoryManager is created
  // (state.memoryManager is always null at this point in the activation flow)

  // Register spec commands (deferred until progressProvider is initialized)
  if (state.progressProvider) {
    registerSpecCommands(context, state.progressProvider);
  }

  logger?.debug('Extension', 'Global commands registered');
}

/**
 * Extension deactivation
 * Uses DisposalService for proper cleanup
 */
export async function deactivate(): Promise<void> {
  logger?.info('Extension', 'Deactivating Gofer extension');

  const state = getState();

  // Resolve DisposalService for cleanup
  const disposalService = getContainer().resolve(DisposalService);
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

  // Dispose all managed resources
  await disposalService.dispose(
    {
      sharedContextBuilder: state.sharedContextBuilder,
      cacheSaveTimer: state.cacheSaveTimer,
      consolidationTimer: state.consolidationTimer,
      workspaceContextProvider: state.workspaceContextProvider,
      contextHealthMonitor: state.contextHealthMonitor,
      autoHandoffTrigger: state.autoHandoffTrigger,
      contextHealthStatusBar: state.contextHealthStatusBar,
      continuousMemoryWriter: state.continuousMemoryWriter,
      hookBridgeWatcher: state.hookBridgeWatcher,
      multiSessionWatcher: state.multiSessionWatcher,
      goferActivityStatusBar: state.goferActivityStatusBar,
      contextUsageLogger: state.contextUsageLogger,
      progressProvider: state.progressProvider,
      constitutionProvider: state.constitutionProvider,
      memoryProvider: state.memoryProvider,
      branchSpecManager: state.branchSpecManager,
      memoryManager: state.memoryManager,
      autoUpdater: state.autoUpdater,
      resourceDiagnostics: state.resourceDiagnostics,
    },
    workspacePath
  );

  // Dispose rate limiter cleanup interval
  try {
    const { globalRateLimiter } = await import('./utils/rateLimiter');
    globalRateLimiter.dispose();
  } catch {
    // Rate limiter may not have been imported
  }

  // Dispose performance monitor timer
  try {
    const { PerformanceMonitor } = await import('./utils/performance');
    PerformanceMonitor.getInstance().dispose();
  } catch {
    // Performance monitor may not have been imported
  }

  // Stop Language Server
  if (state.lspClient) {
    await state.lspClient.stop();
    state.lspClient = undefined;
  }

  logger?.info('Extension', 'Gofer extension deactivated');
}

/**
 * 002 AC-3.3: Try to find the most recent pipeline-state.json and set its runId on RunLedger.
 * Best-effort: if no pipeline state exists, RunLedger uses '' as fallback.
 */
async function tryWireRunId(
  pipelineStateManager: PipelineStateManager,
  runLedger: RunLedger,
  workspacePath: string
): Promise<void> {
  try {
    const specsDir = path.join(workspacePath, '.specify', 'specs');
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(specsDir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }

    let latestRunId = '';
    let latestTime = 0;

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) {
        continue;
      }
      const statePath = path.join(specsDir, entry.name, 'pipeline-state.json');
      try {
        const content = await fs.promises.readFile(statePath, 'utf-8');
        const stat = await fs.promises.stat(statePath);
        if (stat.mtimeMs > latestTime) {
          const state = JSON.parse(content);
          if (state.runId) {
            latestRunId = state.runId;
            latestTime = stat.mtimeMs;
          }
        }
      } catch {
        // pipeline-state.json doesn't exist for this feature
      }
    }

    if (latestRunId) {
      runLedger.setRunId(latestRunId);
      logger?.debug('Extension', `Wired RunLedger with runId: ${latestRunId.substring(0, 8)}...`);
    }
  } catch {
    // Non-fatal: RunLedger will use '' as runId
  }
}
