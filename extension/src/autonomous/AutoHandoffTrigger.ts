/**
 * AutoHandoffTrigger - Automatic Context Reduction at Critical Thresholds
 *
 * Monitors context health and automatically reduces AI slop when context
 * usage exceeds 70% (critical threshold). Runs SlopReducer on the entire
 * workspace and shows a summary notification.
 *
 * Key Features:
 * - Listens for critical health events from ContextHealthMonitor
 * - Automatically runs SlopReducer.reduceWorkspace() at 70%
 * - Shows summary of what was cleaned up
 * - Falls back to save/reseed options if no slop found
 *
 * @see .specify/specs/011-context-health-recursive-memory/tasks.md T030-T033
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ContextHealthMonitor, type ContextHealthStatus } from './ContextHealthMonitor';
import { ContextUsageLogger } from './ContextUsageLogger';
import type { ContextBuilder } from './ContextBuilder';
import type { TaskContext } from './ContextBuilder';
import { Logger } from '../utils/logger';
import { CheckpointValidator } from './CheckpointValidator';
import type { SlopReducer } from './SlopReducer';

/**
 * Configuration for auto-handoff trigger.
 */
export interface AutoHandoffConfig {
  /** Enable auto-handoff notifications (default: true) */
  enabled: boolean;
  /** Cooldown between notifications in milliseconds (default: 5 minutes) */
  notificationCooldownMs: number;
  /** Auto-dismiss notification after milliseconds (default: none) */
  autoDismissMs?: number;
  /** Show notification at warning level too (default: false) */
  notifyAtWarning: boolean;
  /** Auto-execute session save at threshold (default: false) */
  autoExecuteSave: boolean;
  /** Threshold for auto-save trigger (default: 0.65 = 65%) */
  autoSaveThreshold: number;
  /** Continue from the saved checkpoint after clear completes (default: true) */
  autoResumeAfterSave: boolean;
  /** Enable continuous slop reduction (default: true) */
  enableContinuousSlopReduction: boolean;
  /** Interval for periodic slop scanning in milliseconds (default: 2 minutes) */
  slopScanIntervalMs: number;
}

/**
 * Default configuration.
 */
const DEFAULT_CONFIG: AutoHandoffConfig = {
  enabled: true,
  notificationCooldownMs: 5 * 60 * 1000, // 5 minutes
  autoDismissMs: undefined,
  notifyAtWarning: false,
  autoExecuteSave: true,
  autoSaveThreshold: 0.65,
  autoResumeAfterSave: true,
  enableContinuousSlopReduction: false,
  slopScanIntervalMs: 2 * 60 * 1000, // 2 minutes
};

/**
 * Handoff document generation options.
 */
export interface HandoffDocumentOptions {
  /** Current session ID */
  sessionId: string;
  /** Current Gofer stage */
  currentStage: string;
  /** Current task being worked on */
  currentTask?: string;
  /** Additional context to include */
  additionalContext?: string;
  /** Key decisions made during session */
  keyDecisions?: string[];
  /** Blockers or issues encountered */
  blockers?: string[];
}

/**
 * Result of handoff trigger action.
 */
export interface HandoffTriggerResult {
  /** Whether handoff was triggered */
  triggered: boolean;
  /** User's selected action */
  action: 'save' | 'dismiss' | 'remind-later' | 'reseed' | 'auto-dismissed' | 'disabled';
  /** Timestamp of the action */
  timestamp: number;
  /** Health status that triggered the handoff */
  healthStatus?: ContextHealthStatus;
}

/**
 * AutoHandoffTrigger manages automatic session handoff at critical thresholds.
 */
export class AutoHandoffTrigger implements vscode.Disposable {
  private readonly config: AutoHandoffConfig;
  private readonly logger: Logger;
  private readonly disposables: vscode.Disposable[] = [];
  private monitor: ContextHealthMonitor | null = null;
  private usageLogger: ContextUsageLogger | null = null;
  private contextBuilder: ContextBuilder | null = null;
  private slopReducer: SlopReducer | null = null;
  private claudeVscodeTerminal: vscode.Terminal | null = null;
  private lastNotificationTime: number = 0;
  private currentSessionId: string = '';
  private currentStage: string = 'implement';
  private currentTask: string = '';
  private pendingNotification: boolean = false;
  private workspaceRoot: string = '';
  private slopScanTimer: NodeJS.Timeout | null = null;
  private lastSlopScanTime: number = 0;

  /**
   * Creates a new AutoHandoffTrigger instance.
   *
   * @param config - Optional partial configuration
   */
  // T006: CheckpointValidator for handoff document validation
  private readonly checkpointValidator = new CheckpointValidator();

  constructor(config?: Partial<AutoHandoffConfig>, workspaceRoot?: string) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.workspaceRoot = workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    this.logger = Logger.for('AutoHandoffTrigger');
    this.logger.debug('AutoHandoffTrigger initialized', { config: this.config });
  }

  /**
   * Connects to a ContextHealthMonitor for event handling.
   *
   * @param monitor - ContextHealthMonitor instance
   */
  connect(monitor: ContextHealthMonitor): void {
    this.monitor = monitor;

    // Listen for auto-save threshold events (65% by default)
    const autoSaveHandler = (status: ContextHealthStatus): void => {
      this.handleAutoSaveThreshold(status);
    };

    // Listen for critical events
    const criticalHandler = (status: ContextHealthStatus): void => {
      this.handleCriticalStatus(status);
    };

    // Listen for handoff-recommended events
    const handoffHandler = (status: ContextHealthStatus): void => {
      this.handleHandoffRecommended(status);
    };

    // Optionally listen for warning events
    if (this.config.notifyAtWarning) {
      const warningHandler = (status: ContextHealthStatus): void => {
        this.handleWarningStatus(status);
      };
      monitor.on('warning', warningHandler);
      this.disposables.push({
        dispose: () => monitor.off('warning', warningHandler),
      });
    }

    monitor.on('auto-save', autoSaveHandler);
    monitor.on('critical', criticalHandler);
    monitor.on('handoff-recommended', handoffHandler);

    this.disposables.push({
      dispose: () => {
        monitor.off('auto-save', autoSaveHandler);
        monitor.off('critical', criticalHandler);
        monitor.off('handoff-recommended', handoffHandler);
      },
    });

    // Set up file watcher for on-save slop scanning
    if (this.config.enableContinuousSlopReduction) {
      const fileWatcher = vscode.workspace.onDidSaveTextDocument((document) => {
        // Only scan TypeScript/JavaScript files
        if (document.languageId === 'typescript' || document.languageId === 'javascript') {
          this.logger.debug('File saved, triggering slop scan', { file: document.fileName });
          this.runContinuousSlopScan();
        }
      });

      this.disposables.push(fileWatcher);
      this.logger.debug('File watcher for slop scanning enabled');
    }

    this.logger.debug('Connected to ContextHealthMonitor');
  }

  /**
   * Sets the usage logger for tracking handoff events.
   *
   * @param logger - ContextUsageLogger instance
   */
  setUsageLogger(logger: ContextUsageLogger): void {
    this.usageLogger = logger;
  }

  /**
   * Sets the ContextBuilder for reseed support (T035).
   *
   * @param builder - ContextBuilder instance
   */
  setContextBuilder(builder: ContextBuilder): void {
    this.contextBuilder = builder;
  }

  /**
   * Sets the SlopReducer for automatic workspace reduction at critical threshold.
   * Also starts continuous slop scanning if enabled.
   */
  setSlopReducer(reducer: SlopReducer): void {
    this.slopReducer = reducer;

    // Start continuous scanning now that we have a reducer
    this.startContinuousSlopScanning();
  }

  /**
   * Sets the Claude Code VSCode terminal for automated commands.
   */
  setClaudeVscodeTerminal(terminal: vscode.Terminal | null): void {
    this.claudeVscodeTerminal = terminal;
  }

  /**
   * Returns true if VSCode terminal is available.
   */
  private hasActiveTerminal(): boolean {
    return this.claudeVscodeTerminal !== null;
  }

  /**
   * Sets the current session context.
   *
   * @param sessionId - Session identifier
   * @param stage - Current Gofer stage
   * @param task - Current task description
   */
  setSessionContext(sessionId: string, stage: string, task?: string): void {
    this.currentSessionId = sessionId;
    this.currentStage = stage;
    this.currentTask = task || '';
    this.logger.debug('Session context updated', { sessionId, stage, task });
  }

  /**
   * Handles auto-save threshold crossing (65% by default).
   * Automatically executes /7_gofer_save if autoExecuteSave is enabled.
   */
  private async handleAutoSaveThreshold(status: ContextHealthStatus): Promise<void> {
    // Only act on real session data — filesystem estimates are not context usage
    if (status.dataSource !== 'real') {
      return;
    }

    this.logger.info('Auto-save threshold reached', {
      threshold: this.config.autoSaveThreshold,
      utilization: status.utilizationPercent,
      tokensUsed: status.tokensUsed,
    });

    // If auto-execute is enabled, automatically run /7_gofer_save
    if (this.config.autoExecuteSave) {
      await this.executeAutoSave(status);
    } else {
      // Log threshold reached (no notification - status bar shows visual feedback)
      const percent = Math.round(status.utilizationPercent);
      this.logger.warn(`Context at ${percent}% (auto-save threshold) - auto-save disabled`);
    }
  }

  /**
   * Automatically executes /7_gofer_save to create a session checkpoint.
   *
   * Flow:
   * 1. Send /7_gofer_save command to Claude Code terminal
   * 2. If autoResumeAfterSave is enabled, clear context and send a plain
   *    checkpoint-continuation prompt
   * 3. Log the auto-save event
   * 4. Show confirmation notification
   */
  private async executeAutoSave(status: ContextHealthStatus): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    if (this.isInCooldown()) {
      return;
    }
    if (this.pendingNotification) {
      return;
    }

    this.pendingNotification = true;
    this.lastNotificationTime = Date.now();

    try {
      const percent = Math.round(status.utilizationPercent);
      this.logger.info(`Context at ${percent}% — executing save/clear/continue cycle`);

      // Save → Clear → Continue in the same terminal (no kill/respawn needed)
      const sent = await this.sendSaveClearContinue();

      // Log the event
      if (this.usageLogger) {
        await this.usageLogger.logHandoff(
          this.currentSessionId || status.sessionId || 'unknown',
          this.currentStage,
          status.status,
          status.tokensUsed,
          status.tokensLimit,
          status.utilizationPercent,
          `auto-save: save/clear/continue at ${status.utilizationPercent.toFixed(1)}%, success=${sent}`
        );
      }

      if (sent) {
        this.logger.info(`Context at ${percent}% — save/clear/continue completed`);
      } else {
        this.logger.warn(`Context at ${percent}% — save/clear/continue failed, no active terminal`);
      }
    } finally {
      this.pendingNotification = false;
    }
  }

  /**
   * Gets the current state (mtime) of all session-checkpoint.md files across spec dirs.
   * Used to detect when a new checkpoint is created or an existing one is updated.
   */
  private getCheckpointStates(): Map<string, number> {
    const states = new Map<string, number>();
    const specsDir = path.join(this.workspaceRoot, '.specify', 'specs');

    try {
      const dirs = fs.readdirSync(specsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const dir of dirs) {
        const checkpointPath = path.join(specsDir, dir.name, 'session-checkpoint.md');
        try {
          const stat = fs.statSync(checkpointPath);
          states.set(checkpointPath, stat.mtimeMs);
        } catch {
          // File doesn't exist yet — that's fine
        }
      }
    } catch {
      // Specs dir doesn't exist
    }

    return states;
  }

  /**
   * Waits for a session-checkpoint.md file to appear or update in any spec directory.
   * Polls every 1 second, times out after maxWaitMs.
   *
   * @param beforeStates Checkpoint file states captured before the save command was sent
   * @param maxWaitMs Maximum time to wait in milliseconds (default: 60000)
   * @returns true if checkpoint was detected, false if timed out
   */
  private waitForCheckpointFile(
    beforeStates: Map<string, number>,
    maxWaitMs: number = 60000
  ): Promise<boolean> {
    const specsDir = path.join(this.workspaceRoot, '.specify', 'specs');
    const startTime = Date.now();
    const pollIntervalMs = 1000;

    return new Promise<boolean>((resolve) => {
      const timer = setInterval(() => {
        // Check timeout
        if (Date.now() - startTime >= maxWaitMs) {
          clearInterval(timer);
          resolve(false);
          return;
        }

        // Scan for new or updated checkpoint files
        try {
          const dirs = fs
            .readdirSync(specsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory());

          for (const dir of dirs) {
            const checkpointPath = path.join(specsDir, dir.name, 'session-checkpoint.md');
            try {
              const stat = fs.statSync(checkpointPath);
              const previousMtime = beforeStates.get(checkpointPath);

              if (previousMtime === undefined) {
                // New checkpoint file created
                this.logger.info(
                  `New checkpoint file detected: ${path.basename(path.dirname(checkpointPath))}/${path.basename(checkpointPath)}`
                );
                clearInterval(timer);
                resolve(true);
                return;
              }

              if (stat.mtimeMs > previousMtime) {
                // Existing checkpoint file was updated
                this.logger.info(
                  `Checkpoint file updated: ${path.basename(path.dirname(checkpointPath))}/${path.basename(checkpointPath)}`
                );
                clearInterval(timer);
                resolve(true);
                return;
              }
            } catch {
              // File doesn't exist yet, continue polling
            }
          }
        } catch {
          // Specs dir error, continue polling
        }
      }, pollIntervalMs);
    });
  }

  /**
   * Handles critical health status event.
   * Automatically runs slop reduction on the workspace, then shows a summary.
   */
  private async handleCriticalStatus(status: ContextHealthStatus): Promise<void> {
    // Only act on real session data — filesystem estimates are not context usage
    if (status.dataSource !== 'real') {
      return;
    }

    this.logger.info('Critical health status detected', {
      utilization: status.utilizationPercent,
      tokensUsed: status.tokensUsed,
    });

    // Auto-reduce slop if SlopReducer is available
    if (this.slopReducer) {
      await this.autoReduceSlop(status);
    } else {
      await this.triggerHandoffNotification(status, 'critical');
    }
  }

  /**
   * Automatically cleans workspace files, then compacts the Claude Code context.
   *
   * Flow:
   * 1. Run SlopReducer on workspace files (removes console.log, debugger, etc.)
   * 2. Execute save/clear/continue cycle to refresh context with clean files
   * 3. Show notification summarizing what was done
   */
  private async autoReduceSlop(status: ContextHealthStatus): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    if (this.isInCooldown()) {
      return;
    }
    if (this.pendingNotification) {
      return;
    }

    this.pendingNotification = true;
    this.lastNotificationTime = Date.now();

    try {
      const percent = Math.round(status.utilizationPercent);

      // Step 1: Clean workspace files
      this.logger.info('Running automatic slop reduction at critical threshold');
      const result = this.slopReducer!.reduceWorkspace();

      if (result.totalFixes > 0) {
        const patternSummary = Object.entries(result.fixesByPattern)
          .map(([pattern, count]) => `${pattern}: ${count}`)
          .join(', ');
        this.logger.info(
          `Cleaned ${result.totalFixes} issues in ${result.filesFixed} files (${patternSummary})`
        );
      }

      // Step 2: Save → Clear → Continue in the same terminal session
      // This gives a fresh context window without killing the terminal
      this.logger.info(`Context at ${percent}% — executing save/clear/continue cycle`);
      const sent = await this.sendSaveClearContinue();

      // Log the event
      if (this.usageLogger) {
        await this.usageLogger.logHandoff(
          this.currentSessionId || status.sessionId || 'unknown',
          this.currentStage,
          status.status,
          status.tokensUsed,
          status.tokensLimit,
          status.utilizationPercent,
          `auto-context-reset: ${result.totalFixes} file fixes, save/clear/continue=${sent}`
        );
      }
    } finally {
      this.pendingNotification = false;
    }
  }

  /**
   * Sends /7_gofer_save, /clear, then a plain continuation prompt to the active terminal.
   * This resets the context window without killing the terminal:
   *   1. /7_gofer_save — writes checkpoint to disk
   *   2. Wait for checkpoint file to appear on disk (confirms save completed)
   *   3. /clear — wipes Claude Code's context window
   *   4. Plain prompt — reloads from checkpoint into fresh context
   */
  /**
   * Sends a command to the Claude Code terminal.
   *
   * Uses terminal.sendText() which automatically appends Enter.
   */
  private async sendTerminalCommand(command: string): Promise<void> {
    if (this.claudeVscodeTerminal) {
      this.claudeVscodeTerminal.sendText(command);
    } else {
      throw new Error('No Claude Code terminal available');
    }
  }

  private async sendSaveClearContinue(): Promise<boolean> {
    if (!this.hasActiveTerminal()) {
      this.logger.warn('No Claude Code terminal available for save/clear/continue');
      return false;
    }

    try {
      // Snapshot checkpoint files BEFORE save so we can detect when a new one appears
      const checkpointsBefore = this.getCheckpointStates();

      // Step 1: Send /7_gofer_save
      await this.sendTerminalCommand('/7_gofer_save');
      this.logger.info('[save/clear/continue] Step 1: Sent /7_gofer_save');

      // Step 2: Wait for checkpoint file to appear/update (max 90 seconds)
      const checkpointDetected = await this.waitForCheckpointFile(checkpointsBefore, 90000);
      if (checkpointDetected) {
        this.logger.info('[save/clear/continue] Step 2: Checkpoint file confirmed on disk');
      } else {
        this.logger.warn(
          '[save/clear/continue] Step 2: Checkpoint wait timed out after 90s, proceeding anyway'
        );
      }

      // Step 3: Send /clear (guard against dead terminal)
      if (!this.hasActiveTerminal()) {
        this.logger.warn('[save/clear/continue] Terminal died during save, aborting');
        return false;
      }
      await this.sendTerminalCommand('/clear');
      this.logger.info('[save/clear/continue] Step 3: Sent /clear');

      // Brief pause for clear to take effect
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));

      // Step 4: Send continuation prompt (guard against dead terminal)
      if (!this.hasActiveTerminal()) {
        this.logger.warn('[save/clear/continue] Terminal died after clear, aborting');
        return false;
      }
      await this.sendTerminalCommand(
        'Read the latest .specify/specs/*/session-checkpoint.md checkpoint, summarize the saved state, and continue from the recorded Gofer stage.'
      );
      this.logger.info(
        '[save/clear/continue] Step 4: Sent checkpoint continuation prompt — context reset complete'
      );

      return true;
    } catch (error) {
      this.logger.error('[save/clear/continue] Failed', error as Error);
      return false;
    }
  }

  /**
   * Runs continuous slop reduction scan.
   * Called periodically (every 2 minutes by default) to clean workspace files.
   * Runs independently of context threshold - prevents slop accumulation.
   */
  private runContinuousSlopScan(): void {
    if (!this.config.enableContinuousSlopReduction) {
      return;
    }

    if (!this.slopReducer) {
      return;
    }

    try {
      this.logger.debug('Running continuous slop scan');
      const result = this.slopReducer.reduceWorkspace();
      this.lastSlopScanTime = Date.now();

      if (result.totalFixes > 0) {
        this.logger.info('Continuous slop scan found issues', {
          totalFixes: result.totalFixes,
          filesFixed: result.filesFixed,
          fixesByPattern: result.fixesByPattern,
        });
      } else {
        this.logger.debug('Continuous slop scan: workspace clean');
      }
    } catch (error) {
      this.logger.error('Continuous slop scan failed', error as Error);
    }
  }

  /**
   * Starts the periodic slop scanning timer.
   */
  private startContinuousSlopScanning(): void {
    if (!this.config.enableContinuousSlopReduction) {
      this.logger.debug('Continuous slop reduction disabled');
      return;
    }

    if (this.slopScanTimer) {
      this.logger.debug('Continuous slop scanning already started');
      return;
    }

    // Run initial scan immediately
    this.runContinuousSlopScan();

    // Set up periodic scanning
    this.slopScanTimer = setInterval(() => {
      this.runContinuousSlopScan();
    }, this.config.slopScanIntervalMs);

    this.logger.info('Continuous slop scanning started', {
      intervalMs: this.config.slopScanIntervalMs,
    });
  }

  /**
   * Stops the periodic slop scanning timer.
   */
  private stopContinuousSlopScanning(): void {
    if (this.slopScanTimer) {
      clearInterval(this.slopScanTimer);
      this.slopScanTimer = null;
      this.logger.debug('Continuous slop scanning stopped');
    }
  }

  /**
   * Handles handoff-recommended event.
   *
   * @param status - Health status with handoff recommendation
   */
  private async handleHandoffRecommended(status: ContextHealthStatus): Promise<void> {
    // Only notify for real session data
    if (status.dataSource !== 'real') {
      return;
    }

    this.logger.info('Handoff recommended', {
      utilization: status.utilizationPercent,
      recommendations: status.recommendations,
    });

    await this.triggerHandoffNotification(status, 'handoff-recommended');
  }

  /**
   * Handles warning health status event (if configured).
   *
   * @param status - Warning health status
   */
  private async handleWarningStatus(status: ContextHealthStatus): Promise<void> {
    // Only notify for real session data
    if (status.dataSource !== 'real') {
      return;
    }

    this.logger.debug('Warning health status detected', {
      utilization: status.utilizationPercent,
    });

    // Only show warning notification if not in cooldown
    if (this.isInCooldown()) {
      return;
    }

    await this.triggerHandoffNotification(status, 'warning');
  }

  /**
   * Triggers the handoff notification.
   *
   * @param status - Health status that triggered notification
   * @param reason - Reason for triggering
   * @returns Promise<HandoffTriggerResult>
   */
  async triggerHandoffNotification(
    status: ContextHealthStatus,
    reason: 'critical' | 'warning' | 'handoff-recommended'
  ): Promise<HandoffTriggerResult> {
    if (!this.config.enabled) {
      this.logger.debug('Auto-handoff disabled');
      return {
        triggered: false,
        action: 'disabled',
        timestamp: Date.now(),
        healthStatus: status,
      };
    }

    // Log the handoff event (no notification - status bar handles visual feedback)
    const percent = Math.round(status.utilizationPercent);
    this.logger.warn(`Handoff recommended: ${reason} at ${percent}%`);

    if (this.usageLogger) {
      await this.usageLogger.logHandoff(
        this.currentSessionId || status.sessionId || 'unknown',
        this.currentStage,
        status.status,
        status.tokensUsed,
        status.tokensLimit,
        status.utilizationPercent,
        `${reason}: logged`
      );
    }

    return {
      triggered: true,
      action: 'dismiss',
      timestamp: Date.now(),
      healthStatus: status,
    };
  }

  /**
   * Shows the handoff notification to the user.
   *
   * @param status - Health status
   * @param reason - Reason for notification
   * @returns Promise<HandoffTriggerResult>
   */
  /**
   * Executes a context reseed to reclaim context space (T035).
   * Clears stale observations and rebuilds from memory store.
   *
   * @param status - Health status at time of reseed
   */
  private async executeReseed(status: ContextHealthStatus): Promise<void> {
    this.logger.info('Executing context reseed', {
      sessionId: this.currentSessionId,
      stage: this.currentStage,
      utilizationBefore: status.utilizationPercent,
    });

    try {
      if (this.contextBuilder) {
        const task: TaskContext = {
          taskId: this.currentTask || 'current',
          specId: '',
          description: this.currentTask || 'Active task',
        };
        await this.contextBuilder.reseedContext(task);
        this.logger.info('Context reseed completed');
      } else {
        this.logger.warn('Context reseed unavailable - no ContextBuilder connected');
      }
    } catch (error) {
      this.logger.error('Failed to reseed context', error as Error);
    }
  }

  /**
   * Executes the save and handoff workflow.
   *
   * @param status - Health status at time of handoff
   */
  private async executeSaveAndHandoff(status: ContextHealthStatus): Promise<void> {
    this.logger.info('Executing save and handoff', {
      sessionId: this.currentSessionId,
      stage: this.currentStage,
    });

    try {
      // Generate handoff document content
      const handoffContent = this.generateHandoffDocument(status, {
        sessionId: this.currentSessionId,
        currentStage: this.currentStage,
        currentTask: this.currentTask,
      });

      // Try to execute the gofer.saveProgress command
      await vscode.commands.executeCommand('gofer.saveProgress', {
        handoffContent,
        healthStatus: status,
        reason: 'auto-handoff',
      });

      this.logger.info('Handoff completed successfully');
    } catch (error) {
      this.logger.error('Failed to execute save and handoff', error as Error);
    }
  }

  /**
   * Generates the handoff document content.
   *
   * @param status - Current health status
   * @param options - Handoff options
   * @returns Markdown content for session-handoff.md
   */
  generateHandoffDocument(status: ContextHealthStatus, options: HandoffDocumentOptions): string {
    const timestamp = new Date().toISOString();
    const breakdown = status.breakdown;

    const lines = [
      '---',
      `session_id: ${options.sessionId || 'auto-generated'}`,
      `timestamp: ${timestamp}`,
      `stage: ${options.currentStage}`,
      `context_utilization: ${Math.round(status.utilizationPercent)}%`,
      `status: ${status.status}`,
      '---',
      '',
      '# Session Handoff',
      '',
      '## Context Health Snapshot',
      '',
      `- **Status**: ${status.status.toUpperCase()}`,
      `- **Utilization**: ${Math.round(status.utilizationPercent)}% (${status.tokensUsed.toLocaleString()} / ${status.tokensLimit.toLocaleString()} tokens)`,
      '',
      '### Token Breakdown',
      '',
      `| Category | Tokens | % of Total |`,
      `|----------|--------|------------|`,
      `| Conversation | ${breakdown.conversation.toLocaleString()} | ${this.percentage(breakdown.conversation, status.tokensUsed)}% |`,
      `| Observations | ${breakdown.observations.toLocaleString()} | ${this.percentage(breakdown.observations, status.tokensUsed)}% |`,
      `| Spec Artifacts | ${breakdown.specArtifacts.toLocaleString()} | ${this.percentage(breakdown.specArtifacts, status.tokensUsed)}% |`,
      `| Memories | ${breakdown.memories.toLocaleString()} | ${this.percentage(breakdown.memories, status.tokensUsed)}% |`,
      `| Hints | ${breakdown.hints.toLocaleString()} | ${this.percentage(breakdown.hints, status.tokensUsed)}% |`,
      `| System Files | ${breakdown.systemFiles.toLocaleString()} | ${this.percentage(breakdown.systemFiles, status.tokensUsed)}% |`,
      '',
      '## Current Progress',
      '',
      `**Stage**: ${options.currentStage}`,
    ];

    if (options.currentTask) {
      lines.push(`**Current Task**: ${options.currentTask}`);
    }

    lines.push('');

    if (options.keyDecisions && options.keyDecisions.length > 0) {
      lines.push('### Key Decisions');
      lines.push('');
      for (const decision of options.keyDecisions) {
        lines.push(`- ${decision}`);
      }
      lines.push('');
    }

    if (options.blockers && options.blockers.length > 0) {
      lines.push('### Blockers');
      lines.push('');
      for (const blocker of options.blockers) {
        lines.push(`- ${blocker}`);
      }
      lines.push('');
    }

    if (status.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const rec of status.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }

    // Include failed approaches from JSONL if they exist
    const failedApproachesContent = this.readFailedApproaches();
    if (failedApproachesContent) {
      lines.push('## Failed Approaches');
      lines.push('');
      lines.push(failedApproachesContent);
      lines.push('');
    }

    // Include session memories from JSONL if they exist
    const sessionMemoriesContent = this.readSessionMemories();
    if (sessionMemoriesContent) {
      lines.push('## Session Memories');
      lines.push('');
      lines.push(sessionMemoriesContent);
      lines.push('');
    }

    if (options.additionalContext) {
      lines.push('## Additional Context');
      lines.push('');
      lines.push(options.additionalContext);
      lines.push('');
    }

    // T049: Include observation cache and knowledge graph stats
    lines.push('## Context State Summary');
    lines.push('');
    if (this.contextBuilder) {
      const masker = this.contextBuilder.getObservationMasker();
      const allObs = masker.getAllObservations();
      const tiers = { full: 0, keyPoints: 0, masked: 0 };
      let totalObsTokens = 0;
      for (const obs of allObs) {
        if (obs.decayTier === 'full') {
          tiers.full++;
        } else if (obs.decayTier === 'key-points') {
          tiers.keyPoints++;
        } else {
          tiers.masked++;
        }
        totalObsTokens += obs.tokenEstimate;
      }
      lines.push(
        `- **Observation Cache**: ${allObs.length} entries (Full: ${tiers.full}, Key-Points: ${tiers.keyPoints}, Masked: ${tiers.masked}), ~${totalObsTokens.toLocaleString()} tokens`
      );

      const kg = this.contextBuilder.getKnowledgeGraph();
      if (kg) {
        const stats = kg.getStats();
        lines.push(`- **Knowledge Graph**: ${stats.nodeCount} nodes, ${stats.edgeCount} edges`);
      }
    }
    lines.push('');

    lines.push('## Resume Instructions');
    lines.push('');
    lines.push('1. Start a new Claude session');
    lines.push('2. Read `session-checkpoint.md` and continue from the recorded stage');
    lines.push('3. The session will be restored with this context');
    lines.push('');
    lines.push('---');
    lines.push(`*Generated automatically at ${timestamp}*`);

    const document = lines.join('\n');

    // T006: Validate handoff document before returning
    const validation = this.checkpointValidator.validate(document);
    if (validation.warnings.length > 0) {
      this.logger.warn('Handoff document validation warnings', { warnings: validation.warnings });
    }
    if (!validation.valid) {
      this.logger.warn('Handoff document validation errors', { errors: validation.errors });
    }

    return document;
  }

  /**
   * Reads failed approaches from JSONL file and formats as markdown.
   * Returns null if no entries exist.
   */
  private readFailedApproaches(): string | null {
    if (!this.workspaceRoot) {
      return null;
    }
    const filePath = path.join(this.workspaceRoot, '.specify/logs/failed-approaches.jsonl');
    return this.readJsonlEntries(filePath, (entry: Record<string, unknown>) => {
      const approach = entry.approach || 'Unknown approach';
      const reason = entry.reason || 'No reason given';
      return `- **${approach}**: ${reason}`;
    });
  }

  /**
   * Reads session memories from JSONL file and formats as markdown.
   * Returns null if no entries exist.
   */
  private readSessionMemories(): string | null {
    if (!this.workspaceRoot) {
      return null;
    }
    const filePath = path.join(this.workspaceRoot, '.specify/logs/session-memory.jsonl');
    return this.readJsonlEntries(filePath, (entry: Record<string, unknown>) => {
      const type = entry.type || 'learning';
      const content = entry.content || '';
      const taskId = entry.taskId || '';
      return `- **[${type}]** ${taskId ? `(${taskId}) ` : ''}${content}`;
    });
  }

  /**
   * Reads entries from a JSONL file and formats them with a formatter function.
   * Returns null if file doesn't exist or has no entries.
   */
  private readJsonlEntries(
    filePath: string,
    formatter: (entry: Record<string, unknown>) => string
  ): string | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim().length > 0);
      if (lines.length === 0) {
        return null;
      }

      const formatted: string[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          formatted.push(formatter(entry));
        } catch {
          continue; // Skip invalid JSONL lines
        }
      }
      return formatted.length > 0 ? formatted.join('\n') : null;
    } catch {
      return null;
    }
  }

  /**
   * Calculates percentage for breakdown.
   *
   * @param value - Value
   * @param total - Total
   * @returns Percentage string
   */
  private percentage(value: number, total: number): string {
    if (total === 0) {
      return '0';
    }
    return Math.round((value / total) * 100).toString();
  }

  /**
   * Checks if notification is in cooldown period.
   *
   * @returns True if in cooldown
   */
  private isInCooldown(): boolean {
    return Date.now() - this.lastNotificationTime < this.config.notificationCooldownMs;
  }

  /**
   * Manually triggers a handoff check.
   *
   * @returns Promise<HandoffTriggerResult | null>
   */
  async checkAndTrigger(): Promise<HandoffTriggerResult | null> {
    if (!this.monitor) {
      this.logger.warn('Cannot check: no monitor connected');
      return null;
    }

    const status = this.monitor.checkHealth();
    if (!status) {
      return null;
    }

    if (status.status === 'critical') {
      return this.triggerHandoffNotification(status, 'critical');
    }

    if (status.status === 'warning' && this.config.notifyAtWarning) {
      return this.triggerHandoffNotification(status, 'warning');
    }

    return null;
  }

  /**
   * Gets the current configuration.
   *
   * @returns Current configuration copy
   */
  getConfig(): AutoHandoffConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   *
   * @param config - Partial configuration to merge
   */
  updateConfig(config: Partial<AutoHandoffConfig>): void {
    Object.assign(this.config, config);
    this.logger.debug('Configuration updated', { config: this.config });
  }

  /**
   * Resets the cooldown timer.
   */
  resetCooldown(): void {
    this.lastNotificationTime = 0;
    this.logger.debug('Cooldown reset');
  }

  /**
   * Disposes all resources.
   */
  dispose(): void {
    this.stopContinuousSlopScanning();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.logger.debug('AutoHandoffTrigger disposed');
  }
}
