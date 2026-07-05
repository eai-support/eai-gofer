/**
 * ContextHealthMonitor - Context Health Monitoring System
 *
 * Monitors context window usage and emits events at threshold crossings.
 * Provides context health analysis, token breakdown, and recommendations.
 *
 * Key Features:
 * - Real-time context utilization tracking
 * - Threshold-based health status (healthy/warning/critical)
 * - Token breakdown by category
 * - Actionable recommendations
 * - Event emission for status changes
 * - Periodic monitoring with configurable interval
 *
 * @see .specify/specs/011-context-health-recursive-memory/data-model.md
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { THRESHOLDS, LIMITS, TIMEOUTS } from '../config/index';
import { Logger } from '../utils/logger';
import { buildContextBudgetWarning, type ContextBudgetWarning } from './StageContextProfile';

/**
 * Health status levels for context utilization.
 */
export type HealthStatus = 'healthy' | 'warning' | 'critical';

/**
 * Token usage breakdown by category.
 */
export interface TokenBreakdown {
  /** Tokens from spec.md, plan.md, tasks.md, etc. */
  specArtifacts: number;
  /** Tokens from loaded memories */
  memories: number;
  /** Tokens from coding hints */
  hints: number;
  /** Tokens from tool outputs (observations) */
  observations: number;
  /** Tokens from constitution, templates, system files */
  systemFiles: number;
  /** Tokens from user/assistant conversation messages */
  conversation: number;
}

/**
 * Context health measurement at a point in time.
 */
export interface ContextHealthStatus {
  /** Overall health status */
  status: HealthStatus;
  /** Percentage of context used (0-100) */
  utilizationPercent: number;
  /** Total tokens currently in context */
  tokensUsed: number;
  /** Effective context limit */
  tokensLimit: number;
  /** Token usage by category */
  breakdown: TokenBreakdown;
  /** List of recommended actions */
  recommendations: string[];
  /** Unix milliseconds of measurement */
  timestamp: number;
  /** Associated session ID */
  sessionId?: string;
  /** Current Gofer stage */
  stage?: string;
  // Spec 014: Real context monitoring fields (additive)
  /** Data source: 'real' (JSONL session), 'estimated' (filesystem), 'none' */
  dataSource?: 'real' | 'estimated' | 'none';
  /** Model ID from active session */
  model?: string;
  /** Session age in milliseconds */
  sessionAge?: number;
  /** Number of API calls in session */
  apiCallCount?: number;
  /** Display name from /rename (customTitle) or auto-generated slug */
  displayName?: string;
}

export interface ContextBudgetWarningNotice extends ContextBudgetWarning {
  status: ContextHealthStatus;
}

/**
 * Configuration for context health monitoring.
 */
export interface ContextHealthConfig {
  /** Warning threshold (default: 0.5 = 50%) */
  warningThreshold: number;
  /** Critical threshold (default: 0.7 = 70%) */
  criticalThreshold: number;
  /** Auto-save threshold (default: 0.65 = 65%) */
  autoSaveThreshold: number;
  /** Effective context token limit (default: 120000) */
  effectiveContextLimit: number;
  /** Check interval in milliseconds (default: 5000) */
  checkIntervalMs: number;
  /** Enable auto-handoff at critical (default: true) */
  autoHandoffEnabled: boolean;
  /** Enable JSONL logging (default: true) */
  logToJsonl: boolean;
  // ACC (Adaptive Context Compaction) thresholds — Feature 024
  /** ACC stage 1: delegation advisory threshold (default: 0.70) */
  accDelegationAdvisoryThreshold: number;
  /** ACC stage 2: observation masking threshold (default: 0.80) */
  accObservationMaskingThreshold: number;
  /** ACC stage 3: fast pruning threshold (default: 0.85) */
  accFastPruningThreshold: number;
  /** ACC stage 4: aggressive masking threshold (default: 0.90) */
  accAggressiveMaskingThreshold: number;
  /** ACC stage 5: full compaction threshold (default: 0.99) */
  accFullCompactionThreshold: number;
}

/**
 * Events emitted by ContextHealthMonitor.
 */
export interface ContextHealthEvents {
  healthy: (status: ContextHealthStatus) => void;
  warning: (status: ContextHealthStatus) => void;
  critical: (status: ContextHealthStatus) => void;
  'auto-save': (status: ContextHealthStatus) => void;
  'handoff-recommended': (status: ContextHealthStatus) => void;
  'status-change': (from: HealthStatus, to: HealthStatus, status: ContextHealthStatus) => void;
  'context-budget-warning': (warning: ContextBudgetWarningNotice) => void;
  // ACC (Adaptive Context Compaction) events — Feature 024
  'acc-delegation-advisory': (status: ContextHealthStatus) => void;
  'acc-observation-masking': (status: ContextHealthStatus) => void;
  'acc-fast-pruning': (status: ContextHealthStatus) => void;
  'acc-aggressive-masking': (status: ContextHealthStatus) => void;
  'acc-full-compaction': (status: ContextHealthStatus) => void;
}

/**
 * Input for context analysis.
 */
export interface ContextAnalysisInput {
  /** Token breakdown by category */
  breakdown: Partial<TokenBreakdown>;
  /** Optional session ID */
  sessionId?: string;
  /** Current Gofer stage (for stage-specific recommendations) */
  stage?: string;
  // Spec 014: Real context monitoring fields (additive)
  /** Data source for this analysis */
  dataSource?: 'real' | 'estimated' | 'none';
  /** Model context window size when real data available */
  modelContextLimit?: number;
  /** Model ID from active session */
  model?: string;
  /** Session age in milliseconds */
  sessionAge?: number;
  /** Number of API calls in session */
  apiCallCount?: number;
  /** Display name from /rename (customTitle) or auto-generated slug */
  displayName?: string;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: ContextHealthConfig = {
  warningThreshold: THRESHOLDS.CONTEXT_WARNING,
  criticalThreshold: THRESHOLDS.CONTEXT_CRITICAL,
  autoSaveThreshold: THRESHOLDS.MEMORY_PRIORITY_CUTOFF,
  effectiveContextLimit: LIMITS.EFFECTIVE_CONTEXT_LIMIT,
  checkIntervalMs: TIMEOUTS.CONTEXT_HEALTH_CHECK_INTERVAL,
  autoHandoffEnabled: true,
  logToJsonl: true,
  // ACC thresholds (Feature 024)
  accDelegationAdvisoryThreshold: 0.7,
  accObservationMaskingThreshold: 0.8,
  accFastPruningThreshold: 0.85,
  accAggressiveMaskingThreshold: 0.9,
  accFullCompactionThreshold: 0.99,
};

/**
 * ContextHealthMonitor implementation.
 *
 * Monitors context utilization and provides health status, recommendations,
 * and event-based notifications for threshold crossings.
 */
export class ContextHealthMonitor extends EventEmitter {
  private readonly config: ContextHealthConfig;
  private readonly logger: Logger;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private statusHistory: ContextHealthStatus[] = [];
  private lastStatus: HealthStatus = 'healthy';
  private lastUtilizationRatio: number | null = null;
  private contextProvider: (() => ContextAnalysisInput) | null = null;
  private workspaceRoot: string | null = null;
  /** Current polling interval in ms, tracked for adaptive polling */
  private currentPollingInterval: number | null = null;
  /** Base polling interval set by external callers (session events) */
  private basePollingInterval: number | null = null;

  /**
   * Creates a new ContextHealthMonitor instance.
   *
   * @param config - Optional partial configuration (merged with defaults)
   */
  constructor(config?: Partial<ContextHealthConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = Logger.for('ContextHealthMonitor');
    this.logger.debug('ContextHealthMonitor initialized', {
      warningThreshold: this.config.warningThreshold,
      criticalThreshold: this.config.criticalThreshold,
      effectiveContextLimit: this.config.effectiveContextLimit,
    });
  }

  /**
   * Sets the workspace root for state persistence.
   * Must be called for persistState to work.
   *
   * @param workspaceRoot - Workspace root directory path
   */
  setWorkspaceRoot(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
    this.logger.debug('Workspace root set', { workspaceRoot });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Token Estimation (T017)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Estimates the token count for a given string.
   * Uses the approximation: 4 characters ≈ 1 token.
   *
   * @param content - The content to estimate tokens for
   * @returns Estimated token count
   */
  estimateTokens(content: string): number {
    if (!content) {
      return 0;
    }
    return Math.ceil(content.length / 4);
  }

  /**
   * Creates a complete TokenBreakdown from partial input.
   *
   * @param partial - Partial breakdown values
   * @returns Complete TokenBreakdown with defaults
   */
  private normalizeBreakdown(partial: Partial<TokenBreakdown>): TokenBreakdown {
    return {
      specArtifacts: partial.specArtifacts ?? 0,
      memories: partial.memories ?? 0,
      hints: partial.hints ?? 0,
      observations: partial.observations ?? 0,
      systemFiles: partial.systemFiles ?? 0,
      conversation: partial.conversation ?? 0,
    };
  }

  /**
   * Calculate total tokens from breakdown.
   *
   * @param breakdown - Token breakdown by category
   * @returns Total token count
   */
  private calculateTotalTokens(breakdown: TokenBreakdown): number {
    return (
      breakdown.specArtifacts +
      breakdown.memories +
      breakdown.hints +
      breakdown.observations +
      breakdown.systemFiles +
      breakdown.conversation
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Context Analysis (T016)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Analyzes context health and returns current status.
   *
   * @param input - Context analysis input with breakdown
   * @returns Complete ContextHealthStatus
   */
  analyzeContext(input: ContextAnalysisInput): ContextHealthStatus {
    const breakdown = this.normalizeBreakdown(input.breakdown);
    const tokensUsed = this.calculateTotalTokens(breakdown);
    const utilizationPercent = (tokensUsed / this.config.effectiveContextLimit) * 100;
    const status = this.determineStatus(utilizationPercent);
    const recommendations = this.generateRecommendations(
      status,
      breakdown,
      utilizationPercent,
      input.stage
    );

    const healthStatus: ContextHealthStatus = {
      status,
      utilizationPercent: Math.round(utilizationPercent * 100) / 100,
      tokensUsed,
      tokensLimit: this.config.effectiveContextLimit,
      breakdown,
      recommendations,
      timestamp: Date.now(),
      sessionId: input.sessionId,
      stage: input.stage,
      // Spec 014: pass through real context monitoring fields
      dataSource: input.dataSource,
      model: input.model,
      sessionAge: input.sessionAge,
      apiCallCount: input.apiCallCount,
      displayName: input.displayName,
    };

    // Track status history
    this.statusHistory.push(healthStatus);
    if (this.statusHistory.length > 100) {
      this.statusHistory.shift();
    }

    // Emit status-specific events
    this.emitStatusEvents(healthStatus);

    // Persist state for MCP tool (Spec 012)
    this.persistState(healthStatus).catch((error) => {
      this.logger.error('Failed to persist state after analysis', error as Error);
    });

    return healthStatus;
  }

  /**
   * Determines health status based on utilization percentage.
   *
   * @param utilizationPercent - Current utilization percentage
   * @returns Health status
   */
  private determineStatus(utilizationPercent: number): HealthStatus {
    const utilization = utilizationPercent / 100;
    if (utilization >= this.config.criticalThreshold) {
      return 'critical';
    }
    if (utilization >= this.config.warningThreshold) {
      return 'warning';
    }
    return 'healthy';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Recommendations (T018)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generates actionable recommendations based on current status.
   *
   * @param status - Current health status
   * @param breakdown - Token breakdown by category
   * @param utilizationPercent - Current utilization percentage
   * @param stage - Optional current Gofer stage
   * @returns Array of recommendation strings
   */
  private generateRecommendations(
    status: HealthStatus,
    breakdown: TokenBreakdown,
    utilizationPercent: number,
    stage?: string
  ): string[] {
    const recommendations: string[] = [];

    if (status === 'healthy') {
      return ['Context usage is healthy. Continue working normally.'];
    }

    // Find largest categories for targeted recommendations
    const categories = [
      { name: 'observations', tokens: breakdown.observations },
      { name: 'conversation', tokens: breakdown.conversation },
      { name: 'specArtifacts', tokens: breakdown.specArtifacts },
      { name: 'memories', tokens: breakdown.memories },
      { name: 'hints', tokens: breakdown.hints },
      { name: 'systemFiles', tokens: breakdown.systemFiles },
    ].sort((a, b) => b.tokens - a.tokens);

    // Generic recommendations based on status
    if (status === 'warning') {
      recommendations.push(
        `Context at ${utilizationPercent.toFixed(0)}%. Consider reducing context soon.`
      );
      recommendations.push(
        'Context budget warning: keep stage outputs concise to prevent critical context exhaustion.'
      );
    } else if (status === 'critical') {
      recommendations.push(
        `Context at ${utilizationPercent.toFixed(0)}%. Immediate action recommended.`
      );
      recommendations.push(
        'Context budget warning: critical threshold reached. Keep stage outputs concise and deterministic.'
      );
      recommendations.push('Run /7_gofer_save to preserve progress before handoff.');
    }

    // Category-specific recommendations
    if (
      categories[0].name === 'observations' &&
      breakdown.observations > LIMITS.OBSERVATIONS_WARNING_THRESHOLD
    ) {
      recommendations.push(
        'Large observation cache detected. Older tool outputs will be auto-masked.'
      );
    }

    if (
      categories[0].name === 'conversation' &&
      breakdown.conversation > LIMITS.CONVERSATION_WARNING_THRESHOLD
    ) {
      recommendations.push(
        'Long conversation history. Consider saving a checkpoint and starting a fresh session from session-checkpoint.md.'
      );
    }

    if (breakdown.specArtifacts > LIMITS.SPEC_ARTIFACTS_WARNING_THRESHOLD) {
      recommendations.push('Large spec artifacts. Consider summarizing completed sections.');
    }

    if (breakdown.memories > LIMITS.MEMORIES_WARNING_THRESHOLD) {
      recommendations.push('Many memories loaded. Consider consolidating related memories.');
    }

    // Stage-specific recommendations
    if (stage) {
      switch (stage) {
        case 'research':
          recommendations.push(
            'During research, focus on high-value codebase areas to minimize context.'
          );
          break;
        case 'implement':
          recommendations.push('During implementation, keep only task-relevant files in context.');
          break;
        case 'validate':
          recommendations.push('During validation, focus on test outputs and error messages.');
          break;
      }
    }

    return recommendations;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Emission (T019)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Emits appropriate events based on health status.
   *
   * @param status - Current context health status
   */
  private emitStatusEvents(status: ContextHealthStatus): void {
    // Check for auto-save threshold crossing FIRST (65% by default)
    // MUST emit before status events because the critical handler (70%+) sets
    // pendingNotification=true which blocks executeAutoSave. When context jumps
    // from below 65% to above 70% in one step, both fire simultaneously —
    // auto-save must win the race to save+resume before critical does cleanup.
    const utilizationRatio = status.utilizationPercent / 100;
    const previousRatio = this.lastUtilizationRatio ?? 0;

    if (
      utilizationRatio >= this.config.autoSaveThreshold &&
      previousRatio < this.config.autoSaveThreshold &&
      status.dataSource === 'real'
    ) {
      this.emit('auto-save', status);
      this.logger.warn('Auto-save threshold reached', {
        threshold: this.config.autoSaveThreshold,
        utilizationPercent: status.utilizationPercent,
        tokensUsed: status.tokensUsed,
      });
    }

    // Emit status-specific event so UI (status bar) stays updated
    this.emit(status.status, status);

    const contextBudgetWarning = buildContextBudgetWarning(
      status.stage,
      status.utilizationPercent,
      this.config.criticalThreshold
    );
    if (contextBudgetWarning.warning && previousRatio < this.config.criticalThreshold) {
      this.emit('context-budget-warning', {
        ...contextBudgetWarning,
        status,
      });
      this.logger.warn('Context budget warning emitted', {
        utilizationPercent: status.utilizationPercent,
        stage: status.stage,
      });
    }

    // Check for status change
    if (status.status !== this.lastStatus) {
      this.emit('status-change', this.lastStatus, status.status, status);
      this.logger.info('Context health status changed', {
        from: this.lastStatus,
        to: status.status,
        utilizationPercent: status.utilizationPercent,
      });

      // Only emit handoff-recommended for real session data.
      // Filesystem estimates ('estimated'/'none') are not real context
      // window usage and should not trigger handoff notifications.
      if (
        status.status === 'critical' &&
        this.config.autoHandoffEnabled &&
        status.dataSource === 'real'
      ) {
        this.emit('handoff-recommended', status);
        this.logger.warn('Handoff recommended due to critical context usage', {
          utilizationPercent: status.utilizationPercent,
          tokensUsed: status.tokensUsed,
        });
      }

      this.lastStatus = status.status;
    }

    // ACC threshold crossing events (Feature 024)
    // Emitted AFTER existing events to preserve event ordering.
    // Each fires once when the threshold is crossed (rising edge only).
    if (status.dataSource === 'real') {
      const accThresholds: Array<{ threshold: number; event: keyof ContextHealthEvents }> = [
        { threshold: this.config.accDelegationAdvisoryThreshold, event: 'acc-delegation-advisory' },
        { threshold: this.config.accObservationMaskingThreshold, event: 'acc-observation-masking' },
        { threshold: this.config.accFastPruningThreshold, event: 'acc-fast-pruning' },
        { threshold: this.config.accAggressiveMaskingThreshold, event: 'acc-aggressive-masking' },
        { threshold: this.config.accFullCompactionThreshold, event: 'acc-full-compaction' },
      ];

      for (const { threshold, event } of accThresholds) {
        if (utilizationRatio >= threshold && previousRatio < threshold) {
          this.emit(event, status);
          this.logger.info(`ACC event: ${event}`, {
            threshold,
            utilizationPercent: status.utilizationPercent,
          });
        }
      }
    }

    this.lastUtilizationRatio = utilizationRatio;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Periodic Monitoring (T019)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Sets the effective context limit dynamically.
   * Used when real session data reveals the active model's context window.
   *
   * @param limit - New context limit in tokens
   */
  setEffectiveContextLimit(limit: number): void {
    if (limit > 0 && limit !== this.config.effectiveContextLimit) {
      this.logger.info('Effective context limit updated', {
        previous: this.config.effectiveContextLimit,
        new: limit,
      });
      this.config.effectiveContextLimit = limit;
    }
  }

  /**
   * Sets the context provider function for periodic monitoring.
   *
   * @param provider - Function that returns current context analysis input
   */
  setContextProvider(provider: () => ContextAnalysisInput): void {
    this.contextProvider = provider;
  }

  /**
   * Starts periodic context health monitoring.
   *
   * @param intervalMs - Optional interval override (default from config)
   */
  startMonitoring(intervalMs?: number): void {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    const interval = intervalMs ?? this.config.checkIntervalMs;
    this.basePollingInterval = interval;
    this.currentPollingInterval = interval;
    this.logger.info('Starting context health monitoring', { intervalMs: interval });

    this.monitoringInterval = setInterval(() => {
      this.checkHealth();
    }, interval);
  }

  /**
   * Stops periodic monitoring.
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.logger.info('Stopped context health monitoring');
    }
  }

  /**
   * Performs a single health check using the context provider.
   * If the provider returns a model-based context limit, updates
   * the effective limit before calculating utilization.
   *
   * After each check, adaptively adjusts the polling interval:
   * - >= 50% utilization: poll every 2s (catch 65% threshold quickly)
   * - < 50% utilization: revert to base interval
   *
   * @returns ContextHealthStatus or null if no provider set
   */
  checkHealth(): ContextHealthStatus | null {
    if (!this.contextProvider) {
      this.logger.warn('No context provider set for health check');
      return null;
    }

    try {
      const input = this.contextProvider();

      // T023: If analysis includes model-based limit, update before calculating
      if (typeof input.modelContextLimit === 'number' && input.modelContextLimit > 0) {
        this.setEffectiveContextLimit(input.modelContextLimit);
      }

      const status = this.analyzeContext(input);

      // Adaptive polling: accelerate when approaching auto-save threshold
      if (status && this.monitoringInterval) {
        this.adjustPollingForUtilization(status.utilizationPercent / 100);
      }

      return status;
    } catch (error) {
      this.logger.error('Error during health check', error as Error);
      return null;
    }
  }

  /**
   * Adjusts the polling interval based on current utilization.
   * When utilization >= 50%, switches to 2-second polling to ensure
   * the 65% auto-save threshold is caught before Claude's built-in
   * compaction at ~77%.
   *
   * @param utilization - Current utilization ratio (0-1)
   */
  private adjustPollingForUtilization(utilization: number): void {
    const ACCELERATED_INTERVAL_MS = 2000;

    let targetInterval: number;
    if (utilization >= 0.5) {
      targetInterval = ACCELERATED_INTERVAL_MS;
    } else {
      targetInterval = this.basePollingInterval ?? this.config.checkIntervalMs;
    }

    if (targetInterval !== this.currentPollingInterval) {
      this.logger.info('Adaptive polling: adjusting interval', {
        utilizationPercent: Math.round(utilization * 100),
        previousIntervalMs: this.currentPollingInterval,
        newIntervalMs: targetInterval,
      });
      // Restart with new interval (stopMonitoring clears existing interval)
      this.stopMonitoring();
      this.currentPollingInterval = targetInterval;
      this.monitoringInterval = setInterval(() => {
        this.checkHealth();
      }, targetInterval);
    }
  }

  /**
   * Returns whether monitoring is currently active.
   */
  isMonitoring(): boolean {
    return this.monitoringInterval !== null;
  }

  /**
   * Returns the current polling interval in milliseconds.
   * Useful for testing adaptive polling behavior.
   */
  getCurrentPollingInterval(): number | null {
    return this.currentPollingInterval;
  }

  /**
   * Updates the base polling interval without resetting adaptive acceleration.
   * Use this from external events (session-start, session-stale) so they don't
   * override the faster adaptive interval when context is above 50%.
   *
   * @param intervalMs - New base polling interval
   */
  setBasePollingInterval(intervalMs: number): void {
    this.basePollingInterval = intervalMs;
    // Only restart if the new base is FASTER than current (don't slow down adaptive)
    if (this.currentPollingInterval && intervalMs < this.currentPollingInterval) {
      this.stopMonitoring();
      this.currentPollingInterval = intervalMs;
      this.monitoringInterval = setInterval(() => {
        this.checkHealth();
      }, intervalMs);
      this.logger.info('Base polling interval updated (faster)', { intervalMs });
    } else {
      this.logger.info('Base polling interval updated (deferred to adaptive)', {
        baseIntervalMs: intervalMs,
        currentIntervalMs: this.currentPollingInterval,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Status History and Configuration
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Returns the status history (most recent first).
   *
   * @param limit - Maximum entries to return (default: all)
   * @returns Array of ContextHealthStatus
   */
  getStatusHistory(limit?: number): ContextHealthStatus[] {
    const reversed = [...this.statusHistory].reverse();
    return limit ? reversed.slice(0, limit) : reversed;
  }

  /**
   * Returns the most recent status.
   *
   * @returns Most recent ContextHealthStatus or null
   */
  getLastStatus(): ContextHealthStatus | null {
    return this.statusHistory.length > 0 ? this.statusHistory[this.statusHistory.length - 1] : null;
  }

  /**
   * Clears the status history.
   */
  clearHistory(): void {
    this.statusHistory = [];
    this.lastStatus = 'healthy';
    this.logger.debug('Status history cleared');
  }

  /**
   * Gets the current configuration.
   *
   * @returns Current configuration (copy)
   */
  getConfig(): ContextHealthConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   *
   * @param config - Partial configuration to merge
   */
  updateConfig(config: Partial<ContextHealthConfig>): void {
    Object.assign(this.config, config);
    this.logger.debug('Configuration updated', { config });

    // Restart monitoring if interval changed and currently active
    if (config.checkIntervalMs && this.monitoringInterval) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // State Persistence (Spec 012)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Persists the current health status to a JSON file.
   * This enables the MCP tool to read real context health data.
   *
   * @param status - The health status to persist
   */
  private lastPersistedStatus?: string;
  private lastPersistedUtilization?: number;

  async persistState(status: ContextHealthStatus): Promise<void> {
    if (!this.workspaceRoot) {
      this.logger.debug('Cannot persist state: no workspace root set');
      return;
    }

    // Skip writing when status and utilization haven't meaningfully changed.
    // With 2s adaptive polling, writing every cycle causes git state churn
    // which triggers repo.state.onDidChange → handleBranchChange → tree refresh.
    const roundedUtilization = Math.round(status.utilizationPercent * 10) / 10;
    if (
      this.lastPersistedStatus === status.status &&
      this.lastPersistedUtilization === roundedUtilization
    ) {
      return;
    }

    const stateFile = path.join(this.workspaceRoot, '.specify/memory/context-health-state.json');
    const stateDir = path.dirname(stateFile);

    try {
      // Ensure directory exists
      await fs.promises.mkdir(stateDir, { recursive: true });

      // Write state atomically (write to temp, then rename)
      // T024: Include dataSource, model, sessionId, sessionAge for MCP tool consumption
      const state: Record<string, unknown> = {
        timestamp: status.timestamp,
        status: status.status,
        utilizationPercent: status.utilizationPercent,
        tokensUsed: status.tokensUsed,
        tokensLimit: status.tokensLimit,
        breakdown: status.breakdown,
        recommendations: status.recommendations,
        sessionId: status.sessionId,
        stage: status.stage,
        // Spec 014 additive fields
        dataSource: status.dataSource,
        model: status.model,
        sessionAge: status.sessionAge,
        displayName: status.displayName,
      };

      const tempFile = stateFile + '.tmp';
      await fs.promises.writeFile(tempFile, JSON.stringify(state, null, 2));
      await fs.promises.rename(tempFile, stateFile);

      this.lastPersistedStatus = status.status;
      this.lastPersistedUtilization = roundedUtilization;

      this.logger.debug('State persisted', { status: status.status });
    } catch (error) {
      this.logger.error('Failed to persist state', error as Error);
    }
  }

  /**
   * Disposes resources.
   */
  dispose(): void {
    this.stopMonitoring();
    this.removeAllListeners();
  }
}
