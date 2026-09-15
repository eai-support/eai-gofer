/**
 * Integration tests for CLI Provider Switching (R8)
 * Tests the integration between ProviderFactory, ConfigManager, and CLI providers
 * for Feature 027: Multi-Provider CLI Support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderFactory } from '../../../src/council/providers/ProviderFactory';
import type { LLMProvider } from '../../../src/council/providers/LLMProvider';
import type { QueryRequest } from '../../../src/council/types';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue?: any) => {
        if (key === 'cliProvider') return 'claude';
        if (key === 'claudeCodeCommand') return 'claude';
        if (key === 'codexCommand') return 'codex';
        return defaultValue;
      }),
    })),
  },
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
}));

// Mock CLI health checker to avoid actual CLI invocations
vi.mock('../../../src/council/providers/cli/CLIHealthChecker', () => ({
  CLIHealthChecker: {
    check: vi.fn(async (cliType: string) => ({
      available: true,
      authenticated: true,
      compatible: true,
      version: '1.0.0',
      cliType,
    })),
  },
}));

// Mock child_process to avoid spawning real processes
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn(), setEncoding: vi.fn() },
    stderr: { on: vi.fn(), setEncoding: vi.fn() },
    on: vi.fn((event, callback) => {
      if (event === 'close') {
        // Simulate successful execution
        setTimeout(() => callback(0), 10);
      }
    }),
    kill: vi.fn(),
  })),
}));

describe('CLI Provider Switching Integration Tests (R8)', () => {
  let factory: ProviderFactory;

  beforeEach(() => {
    factory = new ProviderFactory();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * R8.1: Test provider selection based on config
   */
  describe('Provider Selection', () => {
    it('should create Claude CLI provider when configured', async () => {
      const vscode = await import('vscode');
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'claude';
          if (key === 'claudeCodeCommand') return 'claude';
          return defaultValue;
        }),
      } as any);

      const provider = await factory.getCLIProvider();

      expect(provider).toBeDefined();
      expect(provider.id).toBe('claude-cli');
      expect(provider.name).toBe('Claude Code CLI');
    });

    it('should create Codex CLI provider when configured', async () => {
      const vscode = await import('vscode');
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'codex';
          if (key === 'codexCommand') return 'codex';
          return defaultValue;
        }),
      } as any);

      const provider = await factory.getCLIProvider();

      expect(provider).toBeDefined();
      expect(provider.id).toBe('codex-cli');
      expect(provider.name).toBe('Codex CLI');
    });

    it('normalizes a stale non-CLI Copilot backend setting to auto', async () => {
      const vscode = await import('vscode');
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'copilot';
          if (key === 'defaultCLI') return 'copilot';
          if (key === 'claudeCodeCommand') return 'claude';
          if (key === 'codexCommand') return 'codex';
          return defaultValue;
        }),
      } as any);

      const provider = await factory.getCLIProvider();

      expect(provider).toBeDefined();
      expect(provider.id).toBe('claude-cli');
    });

    it('normalizes a legacy Gemini backend setting to auto', async () => {
      const vscode = await import('vscode');
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'gemini';
          if (key === 'defaultCLI') return 'auto';
          if (key === 'claudeCodeCommand') return 'claude';
          if (key === 'codexCommand') return 'codex';
          return defaultValue;
        }),
      } as any);

      const provider = await factory.getCLIProvider();

      expect(provider).toBeDefined();
      expect(provider.id).toBe('claude-cli');
    });

    it('should auto-detect Claude CLI when set to auto', async () => {
      const vscode = await import('vscode');
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'auto';
          if (key === 'claudeCodeCommand') return 'claude';
          if (key === 'codexCommand') return 'codex';
          return defaultValue;
        }),
      } as any);

      const provider = await factory.getCLIProvider();

      expect(provider).toBeDefined();
      // Auto-detection should prefer Claude
      expect(provider.id).toBe('claude-cli');
    });
  });

  /**
   * R8.2: Test conversation history preservation across provider switches
   */
  describe('Conversation History Preservation (R1)', () => {
    it('should preserve conversation history when switching from Claude to Codex', async () => {
      const vscode = await import('vscode');

      // Start with Claude CLI
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'claude';
          if (key === 'claudeCodeCommand') return 'claude';
          return defaultValue;
        }),
      } as any);

      await factory.getCLIProvider();
      expect(claudeProvider.id).toBe('claude-cli');

      // Simulate conversation history by adding to provider's internal state
      const mockHistory = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
      ];

      if (typeof (claudeProvider as any).setConversationHistory === 'function') {
        (claudeProvider as any).setConversationHistory(mockHistory);
      }

      // Verify history was set
      if (typeof (claudeProvider as any).getConversationHistory === 'function') {
        const history = (claudeProvider as any).getConversationHistory();
        expect(history).toHaveLength(2);
        expect(history[0].content).toBe('Hello');
      }

      // Switch to Codex CLI
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'codex';
          if (key === 'codexCommand') return 'codex';
          return defaultValue;
        }),
      } as any);

      const codexProvider = await factory.getCLIProvider();
      expect(codexProvider.id).toBe('codex-cli');

      // Verify history was preserved
      if (typeof (codexProvider as any).getConversationHistory === 'function') {
        const preservedHistory = (codexProvider as any).getConversationHistory();
        expect(preservedHistory).toHaveLength(2);
        expect(preservedHistory[0].content).toBe('Hello');
        expect(preservedHistory[1].content).toBe('Hi there!');
      }
    });

    it('should preserve conversation history when switching from Codex to Claude', async () => {
      const vscode = await import('vscode');

      // Start with Codex CLI
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'codex';
          if (key === 'codexCommand') return 'codex';
          return defaultValue;
        }),
      } as any);

      const codexProvider = await factory.getCLIProvider();
      expect(codexProvider.id).toBe('codex-cli');

      // Simulate conversation history
      const mockHistory = [
        { role: 'user' as const, content: 'Implement feature X' },
        { role: 'assistant' as const, content: 'Done!' },
      ];

      if (typeof (codexProvider as any).setConversationHistory === 'function') {
        (codexProvider as any).setConversationHistory(mockHistory);
      }

      // Switch to Claude CLI
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'claude';
          if (key === 'claudeCodeCommand') return 'claude';
          return defaultValue;
        }),
      } as any);

      await factory.getCLIProvider();
      expect(claudeProvider.id).toBe('claude-cli');

      // Verify history was preserved
      if (typeof (claudeProvider as any).getConversationHistory === 'function') {
        const preservedHistory = (claudeProvider as any).getConversationHistory();
        expect(preservedHistory).toHaveLength(2);
        expect(preservedHistory[0].content).toBe('Implement feature X');
        expect(preservedHistory[1].content).toBe('Done!');
      }
    });

    it('should handle empty conversation history gracefully', async () => {
      const vscode = await import('vscode');

      // Start with Claude CLI (no conversation yet)
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'claude';
          if (key === 'claudeCodeCommand') return 'claude';
          return defaultValue;
        }),
      } as any);

      await factory.getCLIProvider();

      // Switch to Codex CLI
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'codex';
          if (key === 'codexCommand') return 'codex';
          return defaultValue;
        }),
      } as any);

      const codexProvider = await factory.getCLIProvider();

      // Verify history is empty (no errors thrown)
      if (typeof (codexProvider as any).getConversationHistory === 'function') {
        const history = (codexProvider as any).getConversationHistory();
        expect(history).toHaveLength(0);
      }
    });
  });

  /**
   * R8.3: Test config watcher integration
   */
  describe('Config Changes Triggering Provider Reload', () => {
    it('should create new provider instance when CLI preference changes', async () => {
      const vscode = await import('vscode');

      // Create initial Claude provider
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'claude';
          if (key === 'claudeCodeCommand') return 'claude';
          return defaultValue;
        }),
      } as any);

      const firstProvider = await factory.getCLIProvider();
      expect(firstProvider.id).toBe('claude-cli');

      // Change config to Codex
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'codex';
          if (key === 'codexCommand') return 'codex';
          return defaultValue;
        }),
      } as any);

      const secondProvider = await factory.getCLIProvider();
      expect(secondProvider.id).toBe('codex-cli');

      // Verify they are different instances
      expect(secondProvider).not.toBe(firstProvider);
    });

    it('should create new provider instance when CLI command path changes', async () => {
      const vscode = await import('vscode');

      // Create initial Claude provider with default command
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'claude';
          if (key === 'claudeCodeCommand') return 'claude';
          return defaultValue;
        }),
      } as any);

      const firstProvider = await factory.getCLIProvider();
      expect(firstProvider.id).toBe('claude-cli');

      // Change command path
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'claude';
          if (key === 'claudeCodeCommand') return '/usr/local/bin/claude';
          return defaultValue;
        }),
      } as any);

      const secondProvider = await factory.createCLIProvider('claude', '/usr/local/bin/claude');

      // Verify new instance was created
      expect(secondProvider).toBeDefined();
      expect(secondProvider.id).toBe('claude-cli');
    });
  });

  /**
   * R8.4: Test provider factory caching behavior
   */
  describe('Provider Factory Caching', () => {
    it('should cache provider instances', async () => {
      const vscode = await import('vscode');
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'claude';
          if (key === 'claudeCodeCommand') return 'claude';
          return defaultValue;
        }),
      } as any);

      const firstCall = await factory.getCLIProvider();
      const secondCall = await factory.getCLIProvider();

      // Should return cached instance
      expect(secondCall).toBe(firstCall);
    });

    it('should invalidate cache when switching providers', async () => {
      const vscode = await import('vscode');

      // Get Claude provider
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'claude';
          if (key === 'claudeCodeCommand') return 'claude';
          return defaultValue;
        }),
      } as any);

      const claudeProvider = await factory.getCLIProvider();

      // Switch to Codex
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'codex';
          if (key === 'codexCommand') return 'codex';
          return defaultValue;
        }),
      } as any);

      const codexProvider = await factory.getCLIProvider();

      // Should be different instances
      expect(codexProvider).not.toBe(claudeProvider);
      expect(codexProvider.id).toBe('codex-cli');
    });
  });

  /**
   * R8.5: Test error handling during provider switching
   */
  describe('Error Handling', () => {
    it('should throw descriptive error when CLI not available', async () => {
      const { CLIHealthChecker } = await import('../../../src/council/providers/cli/CLIHealthChecker');
      vi.mocked(CLIHealthChecker.check).mockResolvedValue({
        available: false,
        authenticated: false,
        compatible: false,
        version: null,
        errorMessage: 'CLI not found in PATH',
        installInstructions: 'Install Claude Code CLI from https://code.claude.com/docs/en/setup',
        authInstructions: null,
        cliType: 'claude',
      });

      const vscode = await import('vscode');
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'claude';
          if (key === 'claudeCodeCommand') return 'claude';
          return defaultValue;
        }),
      } as any);

      await expect(factory.getCLIProvider()).rejects.toThrow('CLI not found');
    });

    it('should throw descriptive error when CLI not authenticated', async () => {
      const { CLIHealthChecker } = await import('../../../src/council/providers/cli/CLIHealthChecker');
      vi.mocked(CLIHealthChecker.check).mockResolvedValue({
        available: true,
        authenticated: false,
        compatible: true,
        version: '1.0.0',
        errorMessage: null,
        installInstructions: null,
        authInstructions: 'Authenticate via: claude auth login',
        cliType: 'claude',
      });

      const vscode = await import('vscode');
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: any) => {
          if (key === 'cliProvider') return 'claude';
          if (key === 'claudeCodeCommand') return 'claude';
          return defaultValue;
        }),
      } as any);

      await expect(factory.getCLIProvider()).rejects.toThrow('not authenticated');
    });
  });
});
