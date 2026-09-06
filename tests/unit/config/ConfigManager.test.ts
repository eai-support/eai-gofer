/**
 * Unit tests for ConfigManager
 * Task: T071
 *
 * Tests verify:
 * - T071: Default CLI configuration with default value and all enum options
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigManager, DEFAULTS } from '../../../extension/src/config';
import * as vscode from 'vscode';

// Mock VSCode workspace configuration
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
}));

describe('ConfigManager (T071)', () => {
  let configManager: ConfigManager;
  let mockConfig: Record<string, unknown>;

  beforeEach(() => {
    // Reset mock config
    mockConfig = {};

    // Mock getConfiguration to return a mock config object
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key in mockConfig) {
          return mockConfig[key];
        }
        return defaultValue;
      }),
      update: vi.fn(),
      has: vi.fn(),
      inspect: vi.fn(),
    } as unknown as vscode.WorkspaceConfiguration);

    // Create fresh instance
    configManager = ConfigManager.getInstance();
    configManager.refresh();
  });

  describe('T071: getDefaultCLI()', () => {
    it('should return default value "auto" when not configured', () => {
      const result = configManager.getDefaultCLI();

      expect(result).toBe('auto');
      expect(result).toBe(DEFAULTS.defaultCLI);
    });

    it('should return "claude" when configured', () => {
      mockConfig['defaultCLI'] = 'claude';
      configManager.refresh();

      const result = configManager.getDefaultCLI();

      expect(result).toBe('claude');
    });

    it('should return "copilot" when configured', () => {
      mockConfig['defaultCLI'] = 'copilot';
      configManager.refresh();

      const result = configManager.getDefaultCLI();

      expect(result).toBe('copilot');
    });

    it('should return "codex" when configured', () => {
      mockConfig['defaultCLI'] = 'codex';
      configManager.refresh();

      const result = configManager.getDefaultCLI();

      expect(result).toBe('codex');
    });

    it('should return "auto" when explicitly configured', () => {
      mockConfig['defaultCLI'] = 'auto';
      configManager.refresh();

      const result = configManager.getDefaultCLI();

      expect(result).toBe('auto');
    });

    it('should have type-safe return value matching enum', () => {
      const result = configManager.getDefaultCLI();

      // Type assertion to verify it's one of the valid values
      const validValues: Array<
        'claude' | 'copilot' | 'codex' | 'antigravity' | 'antigravity-desktop' | 'auto'
      > = ['claude', 'copilot', 'codex', 'antigravity', 'antigravity-desktop', 'auto'];

      expect(validValues).toContain(result);
    });
  });

  describe('ConfigManager singleton', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = ConfigManager.getInstance();
      const instance2 = ConfigManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should refresh configuration when refresh() is called', () => {
      const getConfigSpy = vi.mocked(vscode.workspace.getConfiguration);

      configManager.refresh();

      expect(getConfigSpy).toHaveBeenCalledWith('gofer');
    });
  });

  describe('T075: getCLIDisplayName()', () => {
    it('should return "Claude Code" for claude platform', () => {
      const displayName = configManager.getCLIDisplayName('claude');

      expect(displayName).toBe('Claude Code');
    });

    it('should return "GitHub Copilot Chat" for copilot platform', () => {
      const displayName = configManager.getCLIDisplayName('copilot');

      expect(displayName).toBe('GitHub Copilot Chat');
    });

    it('should return "OpenAI Codex CLI" for codex platform', () => {
      const displayName = configManager.getCLIDisplayName('codex');

      expect(displayName).toBe('OpenAI Codex CLI');
    });

    it('should return "Auto-Detect" for auto setting', () => {
      const displayName = configManager.getCLIDisplayName('auto');

      expect(displayName).toBe('Auto-Detect');
    });
  });

  describe('T076: isPlatformEnabled()', () => {
    it('should return true when Claude directory exists in current workspace', () => {
      const currentWorkspace = process.cwd();
      const enabled = configManager.isPlatformEnabled('claude', currentWorkspace);

      // Current workspace has .claude/commands directory
      expect(enabled).toBe(true);
    });

    it('should return false when directory does not exist', () => {
      const nonExistentWorkspace = '/nonexistent/workspace/path';
      const enabled = configManager.isPlatformEnabled('claude', nonExistentWorkspace);

      expect(enabled).toBe(false);
    });

    it('should check different platform paths correctly', () => {
      const currentWorkspace = process.cwd();

      // Test each platform (at least one should exist in current workspace)
      const claudeEnabled = configManager.isPlatformEnabled('claude', currentWorkspace);
      const copilotEnabled = configManager.isPlatformEnabled('copilot', currentWorkspace);
      const codexEnabled = configManager.isPlatformEnabled('codex', currentWorkspace);

      // At least Claude should be enabled in this workspace
      expect(claudeEnabled).toBe(true);

      // Results should be boolean
      expect(typeof claudeEnabled).toBe('boolean');
      expect(typeof copilotEnabled).toBe('boolean');
      expect(typeof codexEnabled).toBe('boolean');
    });

    it('should handle invalid paths gracefully', () => {
      const invalidPath = '/\0invalid/path';
      const enabled = configManager.isPlatformEnabled('claude', invalidPath);

      expect(enabled).toBe(false);
    });

    it('should return consistent results for same input', () => {
      const testPath = '/some/test/path';
      const result1 = configManager.isPlatformEnabled('claude', testPath);
      const result2 = configManager.isPlatformEnabled('claude', testPath);

      expect(result1).toBe(result2);
    });
  });
});
