/**
 * Integration tests for Cross-Platform Command Routing with Default CLI Setting
 * Task: T072
 *
 * Tests verify:
 * - T072: CrossPlatformCommandRouter respects gofer.defaultCLI setting
 * - Default provider selection honors user configuration
 * - Auto-detection fallback when defaultCLI is 'auto'
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CrossPlatformCommandRouter } from '../../extension/src/council/CrossPlatformCommandRouter';
import { PlatformDetector } from '../../extension/src/council/PlatformDetector';
import { ConfigManager } from '../../extension/src/config';
import * as vscode from 'vscode';
import * as fs from 'fs';

// Mock VSCode
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

// Mock fs for directory checks
vi.mock('fs');

describe('Cross-Platform Command Routing with Default CLI (T072)', () => {
  let router: CrossPlatformCommandRouter;
  let mockConfig: Record<string, unknown>;
  const testWorkspacePath = '/test/workspace';

  beforeEach(() => {
    // Reset PlatformDetector singleton
    PlatformDetector.resetInstance();

    // Reset mock config
    mockConfig = {};

    // Mock getConfiguration
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

    // Mock fs.existsSync to simulate all directories exist
    vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
      const pathStr = String(filePath);
      return (
        pathStr.includes('.claude/commands') ||
        pathStr.includes('.github/prompts') ||
        pathStr.includes('.system/skills') ||
        pathStr.includes('.gemini/commands/gofer')
      );
    });

    // Mock fs.statSync
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);

    // Refresh ConfigManager
    ConfigManager.getInstance().refresh();

    // Create router
    router = new CrossPlatformCommandRouter(testWorkspacePath);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('T072: Default CLI Setting Respect', () => {
    it('should use Claude when defaultCLI is set to "claude"', () => {
      mockConfig['defaultCLI'] = 'claude';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('claude');
    });

    it('should use Copilot when defaultCLI is set to "copilot"', () => {
      mockConfig['defaultCLI'] = 'copilot';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('copilot');
    });

    it('should use Codex when defaultCLI is set to "codex"', () => {
      mockConfig['defaultCLI'] = 'codex';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('codex');
    });

    it('should use Gemini when defaultCLI is set to "gemini"', () => {
      mockConfig['defaultCLI'] = 'gemini';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('gemini');
    });

    it('should auto-detect when defaultCLI is set to "auto"', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();

      // Mock only Claude directory exists
      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        const pathStr = String(filePath);
        return pathStr.includes('.claude/commands');
      });

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache(); // Force re-detection
      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('claude');
    });

    it('should prioritize user setting over directory auto-detection', () => {
      mockConfig['defaultCLI'] = 'copilot';
      ConfigManager.getInstance().refresh();

      // Mock all directories exist, but user wants copilot
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();
      const platform = detector.getDefaultPlatform();

      // Should be copilot, not claude (which has higher auto-detect priority)
      expect(platform).toBe('copilot');
    });
  });

  describe('Detection Context with User Settings', () => {
    it('should mark detection as explicit when user sets defaultCLI', () => {
      mockConfig['defaultCLI'] = 'claude';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();
      const context = detector.getDetectionContext();

      expect(context.isExplicit).toBe(true);
      expect(context.isAutoDetected).toBe(false);
      expect(context.detectionMethod).toBe('user-setting');
      expect(context.platform).toBe('claude');
    });

    it('should mark detection as auto-detected when defaultCLI is "auto"', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();
      const context = detector.getDetectionContext();

      expect(context.isExplicit).toBe(false);
      expect(context.isAutoDetected).toBe(true);
      expect(context.detectionMethod).toBe('directory-check');
    });

    it('should include all directory availability in context', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();

      // Mock all directories present
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();
      const context = detector.getDetectionContext();

      expect(context.hasClaudeDirectory).toBe(true);
      expect(context.hasCopilotDirectory).toBe(true);
      expect(context.hasCodexDirectory).toBe(true);
      expect(context.hasGeminiDirectory).toBe(true);
    });
  });

  describe('Auto-Detection Priority with "auto" Setting', () => {
    it('should prioritize Claude when all directories exist', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();

      vi.mocked(fs.existsSync).mockReturnValue(true);

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();
      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('claude');
    });

    it('should use Codex when only Codex, Gemini, and Copilot exist', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();

      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        const pathStr = String(filePath);
        return (
          pathStr.includes('.system/skills') ||
          pathStr.includes('.gemini/commands/gofer') ||
          pathStr.includes('.github/prompts')
        );
      });

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();
      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('codex');
    });

    it('should use Gemini when only Gemini and Copilot exist', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();

      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        const pathStr = String(filePath);
        return pathStr.includes('.gemini/commands/gofer') || pathStr.includes('.github/prompts');
      });

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();
      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('gemini');
    });

    it('should use Copilot when only Copilot exists', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();

      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        const pathStr = String(filePath);
        return pathStr.includes('.github/prompts');
      });

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();
      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('copilot');
    });

    it('should return "auto" when no directories exist', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();
      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('auto');
    });
  });

  describe('Cache Invalidation on Setting Change', () => {
    it('should detect new platform after clearCache and setting change', () => {
      // Start with Claude
      mockConfig['defaultCLI'] = 'claude';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();
      let platform = detector.getDefaultPlatform();
      expect(platform).toBe('claude');

      // Change to Copilot
      mockConfig['defaultCLI'] = 'copilot';
      ConfigManager.getInstance().refresh();
      detector.clearCache();
      platform = detector.getDefaultPlatform();
      expect(platform).toBe('copilot');
    });
  });

  describe('T072: Settings Change Triggering Re-Detection', () => {
    it('should re-detect platform within cache TTL after settings change', () => {
      // Set initial platform
      mockConfig['defaultCLI'] = 'claude';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      const router = new CrossPlatformCommandRouter(testWorkspacePath);

      // Initial detection
      let platform = detector.getDefaultPlatform();
      expect(platform).toBe('claude');

      // Simulate settings change
      mockConfig['defaultCLI'] = 'codex';
      ConfigManager.getInstance().refresh();

      // Clear caches to force re-detection (simulates workspace config change event)
      detector.clearCache();
      router.clearCache();

      // Verify new platform detected
      platform = detector.getDefaultPlatform();
      expect(platform).toBe('codex');
    });

    it('should re-detect auto platform when switching from explicit to auto', () => {
      // Start with explicit Copilot
      mockConfig['defaultCLI'] = 'copilot';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();
      let platform = detector.getDefaultPlatform();
      expect(platform).toBe('copilot');

      // Switch to auto (Claude has highest priority in auto mode)
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();
      vi.mocked(fs.existsSync).mockReturnValue(true); // All directories exist

      detector.clearCache();
      platform = detector.getDefaultPlatform();
      expect(platform).toBe('claude'); // Auto-detect prioritizes Claude
    });
  });

  describe('T073: Command Execution with Different defaultCLI Values', () => {
    it('should route commands to Claude when defaultCLI is "claude"', () => {
      mockConfig['defaultCLI'] = 'claude';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();

      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('claude');
      // Verify path resolution matches Claude
      expect(router.getCommandPath('1_gofer_research', 'claude')).toContain('.claude/commands');
    });

    it('should route commands to Copilot when defaultCLI is "copilot"', () => {
      mockConfig['defaultCLI'] = 'copilot';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();

      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('copilot');
      // Verify path resolution matches Copilot
      expect(router.getCommandPath('1_gofer_research', 'copilot')).toContain('.github/prompts');
    });

    it('should route commands to Codex when defaultCLI is "codex"', () => {
      mockConfig['defaultCLI'] = 'codex';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();

      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('codex');
      // Verify path resolution matches Codex
      expect(router.getCommandPath('1_gofer_research', 'codex')).toContain('.system/skills');
    });

    it('should route commands to Gemini when defaultCLI is "gemini"', () => {
      mockConfig['defaultCLI'] = 'gemini';
      ConfigManager.getInstance().refresh();

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();

      const platform = detector.getDefaultPlatform();

      expect(platform).toBe('gemini');
      expect(router.getCommandPath('1_gofer_research', 'gemini')).toContain(
        '.gemini/commands/gofer'
      );
    });

    it('should auto-detect and route to highest priority platform when defaultCLI is "auto"', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();

      // Mock all platforms available
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const detector = PlatformDetector.getInstance(testWorkspacePath);
      detector.clearCache();

      const platform = detector.getDefaultPlatform();

      // Should prioritize Claude when all are available
      expect(platform).toBe('claude');
    });

    it('should provide correct command syntax for each platform', () => {
      const commandName = '1_gofer_research';

      expect(router.getCommandSyntax(commandName, 'claude')).toBe('/1_gofer_research');
      expect(router.getCommandSyntax(commandName, 'copilot')).toBe('#1_gofer_research');
      expect(router.getCommandSyntax(commandName, 'codex')).toBe('/1_gofer_research');
      expect(router.getCommandSyntax(commandName, 'gemini')).toBe('/gofer:1_gofer_research');
    });
  });
});
