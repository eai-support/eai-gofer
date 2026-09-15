/**
 * CLI Provider Switching Integration Tests
 *
 * Tests real provider switching behavior when config changes.
 * These tests verify that the config watcher, ProviderFactory, and
 * history preservation mechanisms work together correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getProviderFactory } from '../../../extension/src/council/providers/ProviderFactory';
import * as vscode from 'vscode';

// Import CLI providers so they register themselves
import '../../../extension/src/council/providers/cli/ClaudeCodeCLIProvider';
import '../../../extension/src/council/providers/cli/CodexCLIProvider';

// Mock CLIHealthChecker to avoid requiring actual CLI installations
vi.mock('../../../extension/src/council/providers/cli/CLIHealthChecker', () => ({
  CLIHealthChecker: {
    check: vi.fn().mockResolvedValue({
      available: true,
      authenticated: true,
      compatible: true,
      version: '1.0.0',
    }),
  },
}));

describe('CLI Provider Switching Integration', () => {
  let configStore: Map<string, any>;
  let mockConfig: any;

  beforeEach(async () => {
    // Initialize config store with default values
    configStore = new Map([
      ['cliProvider', 'claude'],
      ['claudeCodeCommand', 'claude'],
      ['codexCommand', 'codex'],
    ]);

    // Create mock config that reads/writes to configStore
    mockConfig = {
      get: vi.fn((key: string, defaultValue?: any) => {
        return configStore.has(key) ? configStore.get(key) : defaultValue;
      }),
      update: vi.fn(async (key: string, value: any) => {
        configStore.set(key, value);
        return Promise.resolve();
      }),
    };

    // Mock vscode.workspace.getConfiguration to return our mock config
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig);
  });

  afterEach(async () => {
    // Clear mocks
    vi.clearAllMocks();

    // Reset provider factory to clear cached providers
    const factory = getProviderFactory();
    (factory as any).providers.clear();
  });

  describe('Provider Selection', () => {
    it('should create Claude CLI provider when configured', async () => {
      // Setup: Set Claude CLI as preferred provider
      const config = vscode.workspace.getConfiguration('gofer');
      await config.update('cliProvider', 'claude', vscode.ConfigurationTarget.Global);
      await config.update('claudeCodeCommand', 'claude', vscode.ConfigurationTarget.Global);

      // Action: Get provider from factory
      const factory = getProviderFactory();
      const provider = await factory.getCLIProvider();

      // Verify: Provider is Claude CLI
      expect(provider.id).toBe('claude-cli');
      expect(provider.name).toBe('Claude Code CLI');
    });

    it('should create Codex CLI provider when configured', async () => {
      // Setup: Set Codex CLI as preferred provider
      const config = vscode.workspace.getConfiguration('gofer');
      await config.update('cliProvider', 'codex', vscode.ConfigurationTarget.Global);
      await config.update('codexCommand', 'codex', vscode.ConfigurationTarget.Global);

      // Action: Get provider from factory
      const factory = getProviderFactory();
      const provider = await factory.getCLIProvider();

      // Verify: Provider is Codex CLI
      expect(provider.id).toBe('codex-cli');
      expect(provider.name).toBe('Codex CLI');
    });

    it('should auto-detect when cliProvider is "auto"', async () => {
      // Setup: Set auto-detection mode
      const config = vscode.workspace.getConfiguration('gofer');
      await config.update('cliProvider', 'auto', vscode.ConfigurationTarget.Global);

      // Action: Get provider from factory
      const factory = getProviderFactory();
      const provider = await factory.getCLIProvider();

      // Verify: Provider is either Claude or Codex
      expect(['claude-cli', 'codex-cli']).toContain(provider.id);
      expect(provider.name).toMatch(/Claude Code CLI|Codex CLI/);
    });
  });

  describe('Config Change Behavior', () => {
    it('should switch providers when config changes', async () => {
      // Setup: Start with Claude CLI
      const config = vscode.workspace.getConfiguration('gofer');
      await config.update('cliProvider', 'claude', vscode.ConfigurationTarget.Global);

      // Get factory and create provider
      const factory = getProviderFactory();
      const claudeProvider = await factory.getCLIProvider();

      expect(claudeProvider.id).toBe('claude-cli');
      expect(claudeProvider.name).toBe('Claude Code CLI');

      // Action: Switch to Codex CLI
      await config.update('cliProvider', 'codex', vscode.ConfigurationTarget.Global);

      // Get new provider (factory should create Codex instance)
      const codexProvider = await factory.getCLIProvider();

      // Verify: Provider switched
      expect(codexProvider.id).toBe('codex-cli');
      expect(codexProvider.name).toBe('Codex CLI');

      // Verify: Different instances
      expect(claudeProvider).not.toBe(codexProvider);
    });

    it('should create fresh provider instance each time (no caching)', async () => {
      // Setup: Set CLI provider
      const config = vscode.workspace.getConfiguration('gofer');
      await config.update('cliProvider', 'claude', vscode.ConfigurationTarget.Global);

      // Action: Get provider twice
      const factory = getProviderFactory();
      const provider1 = await factory.getCLIProvider();
      const provider2 = await factory.getCLIProvider();

      // Verify: Different instances created (createCLIProvider always creates new instance)
      // Note: This is intentional - each call gets a fresh provider with latest config
      expect(provider1).not.toBe(provider2);
      expect(provider1.id).toBe('claude-cli');
      expect(provider2.id).toBe('claude-cli');
    });
  });

  describe('Conversation History Preservation', () => {
    it('should preserve conversation history when switching providers', async () => {
      // Setup: Start with Claude CLI
      const config = vscode.workspace.getConfiguration('gofer');
      await config.update('cliProvider', 'claude', vscode.ConfigurationTarget.Global);

      // Get factory and create provider
      const factory = getProviderFactory();
      const claudeProvider = await factory.getCLIProvider();

      // Add conversation history to Claude provider
      if (typeof (claudeProvider as any).setConversationHistory === 'function') {
        (claudeProvider as any).setConversationHistory([
          { role: 'user', content: 'Test message 1' },
          { role: 'assistant', content: 'Response 1' },
          { role: 'user', content: 'Test message 2' },
        ]);
      }

      // Action: Switch to Codex CLI
      await config.update('cliProvider', 'codex', vscode.ConfigurationTarget.Global);

      // Get new provider (factory should create Codex instance with history)
      const codexProvider = await factory.getCLIProvider();

      // Verify: History preserved
      if (typeof (codexProvider as any).getConversationHistory === 'function') {
        const history = (codexProvider as any).getConversationHistory();
        expect(history).toHaveLength(3);
        expect(history[0].content).toBe('Test message 1');
        expect(history[1].content).toBe('Response 1');
        expect(history[2].content).toBe('Test message 2');
      } else {
        throw new Error('Codex provider does not have getConversationHistory method');
      }
    });

    it('should handle empty history when switching', async () => {
      // Setup: Start with Claude CLI (no history)
      const config = vscode.workspace.getConfiguration('gofer');
      await config.update('cliProvider', 'claude', vscode.ConfigurationTarget.Global);

      const factory = getProviderFactory();
      await factory.getCLIProvider();

      // Action: Switch to Codex CLI
      await config.update('cliProvider', 'codex', vscode.ConfigurationTarget.Global);

      const codexProvider = await factory.getCLIProvider();

      // Verify: Empty history
      if (typeof (codexProvider as any).getConversationHistory === 'function') {
        const history = (codexProvider as any).getConversationHistory();
        expect(history).toHaveLength(0);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid CLI command gracefully', async () => {
      // Mock health checker to return unavailable
      const { CLIHealthChecker } = await import('../../../extension/src/council/providers/cli/CLIHealthChecker');
      vi.mocked(CLIHealthChecker.check).mockResolvedValueOnce({
        available: false,
        authenticated: false,
        compatible: false,
        version: undefined,
        errorMessage: 'CLI command not found',
        installInstructions: 'https://code.claude.com/docs/en/setup',
      });

      // Setup: Set invalid command
      const config = vscode.workspace.getConfiguration('gofer');
      await config.update('cliProvider', 'claude', vscode.ConfigurationTarget.Global);
      await config.update('claudeCodeCommand', 'nonexistent-cli-xyz', vscode.ConfigurationTarget.Global);

      // Action: Try to get provider (should throw)
      const factory = getProviderFactory();

      await expect(factory.getCLIProvider()).rejects.toThrow(
        'Preferred Claude Code CLI is unavailable'
      );
    });

    it('should handle CLI not installed', async () => {
      // Mock health checker to return unavailable
      const { CLIHealthChecker } = await import('../../../extension/src/council/providers/cli/CLIHealthChecker');
      vi.mocked(CLIHealthChecker.check).mockResolvedValueOnce({
        available: false,
        authenticated: false,
        compatible: false,
        version: undefined,
        errorMessage: 'CLI not found',
        installInstructions: 'https://learn.chatgpt.com/docs/codex/cli',
      });

      // Setup: Set CLI command that doesn't exist
      const config = vscode.workspace.getConfiguration('gofer');
      await config.update('cliProvider', 'codex', vscode.ConfigurationTarget.Global);
      await config.update('codexCommand', 'cli-that-definitely-does-not-exist', vscode.ConfigurationTarget.Global);

      // Action: Get provider (should throw)
      const factory = getProviderFactory();

      await expect(factory.getCLIProvider()).rejects.toThrow('Preferred Codex CLI is unavailable');
    });
  });

  describe('Factory Caching', () => {
    it('should clear cache when switching providers', async () => {
      // Setup: Start with Claude CLI
      const config = vscode.workspace.getConfiguration('gofer');
      await config.update('cliProvider', 'claude', vscode.ConfigurationTarget.Global);

      const factory = getProviderFactory();
      const claudeProvider1 = await factory.getCLIProvider();

      // Action: Switch to Codex and back to Claude
      await config.update('cliProvider', 'codex', vscode.ConfigurationTarget.Global);
      await factory.getCLIProvider();

      await config.update('cliProvider', 'claude', vscode.ConfigurationTarget.Global);
      const claudeProvider2 = await factory.getCLIProvider();

      // Verify: New Claude instance created (cache cleared)
      expect(claudeProvider1).not.toBe(claudeProvider2);
    });
  });
});
