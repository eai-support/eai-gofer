/**
 * Usage Adapter Factory (T046)
 *
 * Factory for creating CLI-specific usage adapters.
 * Returns the appropriate adapter based on provider ID.
 *
 * @see .specify/specs/027-multi-provider-cli-support/spec.md User Story 5
 * @see .specify/specs/027-multi-provider-cli-support/plan.md Phase 7
 */

import type { ProviderId } from '../council/types';
import type { CLIUsageAdapter, UsageEntry } from './cli/CLIUsageAdapter';
import { ClaudeCodeUsageAdapter } from './ClaudeCodeUsageAdapter';
import { getCodexAdapter } from './CodexUsageAdapter';

/**
 * Wrapper to adapt ClaudeCodeUsageAdapter to CLIUsageAdapter interface
 */
class ClaudeCodeUsageAdapterWrapper implements CLIUsageAdapter {
  readonly providerId: ProviderId = 'claude-cli';
  readonly providerName = 'Claude CLI';

  constructor(private adapter: ClaudeCodeUsageAdapter) {}

  async parseLogFile(_logFilePath: string, fromDate?: Date, toDate?: Date): Promise<UsageEntry[]> {
    // ClaudeCodeUsageAdapter scans workspace usage, not a single file
    const conversations = await this.adapter.getWorkspaceUsage(fromDate, toDate);
    return conversations.map((conv: import('./ClaudeCodeUsageAdapter').ConversationUsage) => ({
      timestamp: conv.timestamp,
      model: conv.model,
      inputTokens: conv.inputTokens,
      outputTokens: conv.outputTokens,
      cacheCreationTokens: conv.cacheCreationTokens,
      cacheReadTokens: conv.cacheReadTokens,
      totalTokens: conv.totalTokens,
      costUsd: conv.costUsd,
      provider: 'claude-cli' as ProviderId,
      sessionId: conv.sessionId,
      conversationId: conv.conversationId,
    }));
  }

  getDefaultLogPath(): string {
    // Claude Code uses ~/.claude/projects/<project>/
    const os = require('os');
    const path = require('path');
    return path.join(os.homedir(), '.claude');
  }

  extractUsage(_logEntry: string | object): UsageEntry | null {
    // Not used in current implementation
    return null;
  }

  async isInstalled(): Promise<boolean> {
    return await this.adapter.isClaudeCodeInstalled();
  }
}

/**
 * CLI Provider ID type (subset of ProviderId)
 */
export type CLIProviderId = 'claude-cli' | 'codex-cli';

/**
 * Usage Adapter Factory
 *
 * Creates the appropriate usage adapter based on CLI provider type
 */
export class UsageAdapterFactory {
  public readonly workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Create usage adapter for specified CLI provider
   *
   * @param providerId - CLI provider identifier
   * @returns CLI-specific usage adapter
   * @throws Error if provider ID is not a CLI provider
   */
  createUsageAdapter(providerId: ProviderId): CLIUsageAdapter {
    switch (providerId) {
      case 'claude-cli': {
        const claudeAdapter = new ClaudeCodeUsageAdapter(this.workspacePath);
        return new ClaudeCodeUsageAdapterWrapper(claudeAdapter);
      }

      case 'codex-cli':
        return getCodexAdapter(this.workspacePath);

      default:
        throw new Error(
          `Usage adapter not available for provider: ${providerId}. ` +
            `Only CLI providers (claude-cli, codex-cli) support usage tracking.`
        );
    }
  }

  /**
   * Check if a provider ID is a CLI provider
   *
   * @param providerId - Provider to check
   * @returns true if provider is a CLI provider
   */
  isCLIProvider(providerId: ProviderId): providerId is CLIProviderId {
    return providerId === 'claude-cli' || providerId === 'codex-cli';
  }

  /**
   * Get usage adapter for current CLI provider setting
   * Reads from VSCode configuration
   *
   * @returns CLI usage adapter or null if not using CLI provider
   */
  getCurrentAdapter(): CLIUsageAdapter | null {
    const vscode = require('vscode');
    const config = vscode.workspace.getConfiguration('gofer');
    const preference = config.get('cliProvider', 'auto') as
      | 'claude'
      | 'codex'
      | 'copilot'
      | 'gemini'
      | 'auto';

    const providerId =
      preference === 'auto'
        ? 'claude-cli'
        : preference === 'claude' || preference === 'codex'
          ? (`${preference}-cli` as CLIProviderId)
          : null;

    if (!providerId) {
      // Copilot/Gemini selections do not have CLI usage adapters.
      return null;
    }

    try {
      return this.createUsageAdapter(providerId);
    } catch {
      return null;
    }
  }
}

/**
 * Singleton factory instance
 */
let factoryInstance: UsageAdapterFactory | undefined;

/**
 * Get the singleton Usage Adapter Factory
 *
 * @param workspacePath - Current workspace path
 * @returns UsageAdapterFactory instance
 */
export function getUsageAdapterFactory(workspacePath: string): UsageAdapterFactory {
  if (!factoryInstance || factoryInstance.workspacePath !== workspacePath) {
    factoryInstance = new UsageAdapterFactory(workspacePath);
  }
  return factoryInstance;
}
