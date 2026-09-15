/**
 * Provider Capability Detection (T040, T041)
 *
 * Determines which features are supported by each CLI provider.
 * Enables graceful degradation and clear user notifications for unsupported features.
 *
 * @see .specify/specs/027-multi-provider-cli-support/spec.md User Story 4
 * @see .specify/specs/027-multi-provider-cli-support/plan.md Phase 6
 */

import type { ProviderId } from '../../types';

/**
 * Check if a provider supports MCP (Model Context Protocol) servers
 *
 * MCP servers enable extended capabilities through external integrations in
 * both Claude Code and Codex CLI.
 *
 * @param providerId - The provider to check
 * @returns true if MCP servers are supported, false otherwise
 *
 * @example
 * ```typescript
 * if (supportsMCPServers('claude-cli')) {
 *   // Activate MCP server integration
 * } else {
 *   // Show notification with the current MCP-capable CLI choices
 * }
 * ```
 */
export function supportsMCPServers(providerId: ProviderId): boolean {
  return providerId === 'claude-cli' || providerId === 'codex-cli';
}

/**
 * Check if a provider supports web search capabilities
 *
 * Web search is a Codex-specific feature that enables real-time
 * information retrieval during conversations.
 *
 * @param providerId - The provider to check
 * @returns true if web search is supported, false otherwise
 *
 * @example
 * ```typescript
 * if (supportsWebSearch('codex-cli')) {
 *   // Enable web search features
 * } else {
 *   // Show notification: "Web search requires Codex CLI"
 * }
 * ```
 */
export function supportsWebSearch(providerId: ProviderId): boolean {
  // Only Codex CLI supports web search
  return providerId === 'codex-cli';
}

/**
 * Get user-friendly notification message for unsupported feature
 *
 * @param feature - The feature name ('mcp' | 'web-search')
 * @param currentProvider - The currently active provider
 * @returns User-friendly error message with instructions
 */
export function getUnsupportedFeatureMessage(
  feature: 'mcp' | 'web-search',
  currentProvider: ProviderId
): string {
  if (feature === 'mcp') {
    return (
      `MCP servers require Claude Code or Codex CLI. ` +
      `Currently using: ${currentProvider}. ` +
      `Switch to Claude Code or Codex CLI in settings to enable MCP servers.`
    );
  } else if (feature === 'web-search') {
    return (
      `Web search requires Codex CLI. ` +
      `Currently using: ${currentProvider}. ` +
      `Switch to Codex CLI in settings to enable web search.`
    );
  }
  return `This feature is not supported by ${currentProvider}`;
}

/**
 * Provider capability matrix
 * Shows which features are available for each provider
 */
export const PROVIDER_CAPABILITIES = {
  'claude-cli': {
    mcpServers: true,
    webSearch: false,
    streaming: true,
    conversationHistory: true,
    fileOperations: true,
  },
  'codex-cli': {
    mcpServers: true,
    webSearch: true,
    streaming: true,
    conversationHistory: true,
    fileOperations: true,
  },
  // API providers for comparison
  anthropic: {
    mcpServers: false,
    webSearch: false,
    streaming: true,
    conversationHistory: true,
    fileOperations: false,
  },
  openai: {
    mcpServers: false,
    webSearch: false,
    streaming: true,
    conversationHistory: true,
    fileOperations: false,
  },
  google: {
    mcpServers: false,
    webSearch: false,
    streaming: true,
    conversationHistory: true,
    fileOperations: false,
  },
} as const;

/**
 * Check if a provider has a specific capability
 *
 * @param providerId - The provider to check
 * @param capability - The capability name
 * @returns true if the capability is supported
 */
export function hasCapability(
  providerId: ProviderId,
  capability: keyof (typeof PROVIDER_CAPABILITIES)['claude-cli']
): boolean {
  const capabilities = PROVIDER_CAPABILITIES[providerId as keyof typeof PROVIDER_CAPABILITIES];
  if (!capabilities) {
    return false;
  }
  return capabilities[capability] ?? false;
}
