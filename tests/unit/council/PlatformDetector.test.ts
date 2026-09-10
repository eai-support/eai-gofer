import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { PlatformDetector } from '../../../extension/src/council/PlatformDetector';
import { ConfigManager } from '../../../extension/src/config';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
  },
}));

vi.mock('fs');

describe('PlatformDetector', () => {
  const workspacePath = '/test/workspace';
  let mockConfig: Record<string, unknown>;

  beforeEach(() => {
    PlatformDetector.resetInstance();
    mockConfig = {};

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

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);

    ConfigManager.getInstance().refresh();
  });

  describe('isPlatformAvailable', () => {
    it('returns true for claude when .claude/commands exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.claude/commands')
      );
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.isPlatformAvailable('claude')).toBe(true);
      expect(detector.isPlatformAvailable('copilot')).toBe(false);
      expect(detector.isPlatformAvailable('codex')).toBe(false);
      expect(detector.isPlatformAvailable('antigravity')).toBe(false);
    });

    it('returns true for copilot when .github/prompts exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.github/prompts')
      );
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.isPlatformAvailable('copilot')).toBe(true);
      expect(detector.isPlatformAvailable('claude')).toBe(false);
      expect(detector.isPlatformAvailable('codex')).toBe(false);
      expect(detector.isPlatformAvailable('antigravity')).toBe(false);
    });

    it('returns true for codex when .system/skills exists', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.system/skills')
      );
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.isPlatformAvailable('codex')).toBe(true);
      expect(detector.isPlatformAvailable('claude')).toBe(false);
      expect(detector.isPlatformAvailable('copilot')).toBe(false);
      expect(detector.isPlatformAvailable('antigravity')).toBe(false);
    });

    it('maps legacy .gemini command resources to the Antigravity host', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.gemini/commands/gofer')
      );
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.isPlatformAvailable('antigravity')).toBe(true);
      expect(detector.isPlatformAvailable('claude')).toBe(false);
      expect(detector.isPlatformAvailable('copilot')).toBe(false);
      expect(detector.isPlatformAvailable('codex')).toBe(false);
    });

    it('detects Grok and the active VS Code extension surface', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.grok/skills')
      );
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.isPlatformAvailable('grok')).toBe(true);
      expect(detector.isPlatformAvailable('vscode')).toBe(true);
    });
  });

  describe('getDefaultPlatform', () => {
    it('honors explicit user setting', () => {
      mockConfig['defaultCLI'] = 'copilot';
      ConfigManager.getInstance().refresh();
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.getDefaultPlatform()).toBe('copilot');
    });

    it('auto-detects hosts in canonical order', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.system/skills')
      );
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.getDefaultPlatform()).toBe('codex');

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const path = String(p);
        return path.includes('.claude/commands') || path.includes('.system/skills');
      });
      detector.clearCache();
      expect(detector.getDefaultPlatform()).toBe('claude');

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.gemini/commands/gofer')
      );
      detector.clearCache();
      expect(detector.getDefaultPlatform()).toBe('antigravity');

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.github/prompts')
      );
      detector.clearCache();
      expect(detector.getDefaultPlatform()).toBe('copilot');
    });

    it('uses the active VS Code execution context when no filesystem surface exists', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.getDefaultPlatform()).toBe('vscode');
    });
  });

  describe('detection context and cache behavior', () => {
    it('marks context explicit for user-setting', () => {
      mockConfig['defaultCLI'] = 'claude';
      ConfigManager.getInstance().refresh();
      const detector = PlatformDetector.getInstance(workspacePath);
      const ctx = detector.getDetectionContext();
      expect(ctx.isExplicit).toBe(true);
      expect(ctx.isAutoDetected).toBe(false);
      expect(ctx.detectionMethod).toBe('user-setting');
      expect(ctx.platform).toBe('claude');
    });

    it('marks context auto-detected for auto mode', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.claude/commands')
      );
      const detector = PlatformDetector.getInstance(workspacePath);
      const ctx = detector.getDetectionContext();
      expect(ctx.isExplicit).toBe(false);
      expect(ctx.isAutoDetected).toBe(true);
      expect(ctx.detectionMethod).toBe('directory-check');
      expect(ctx.platform).toBe('claude');
      expect(ctx.hasClaudeDirectory).toBe(true);
      expect(ctx.hasCopilotDirectory).toBe(false);
      expect(ctx.hasCodexDirectory).toBe(false);
      expect(ctx.hasAntigravityDirectory).toBe(false);
      expect(ctx.hasGrokDirectory).toBe(false);
      expect(ctx.hasVSCodeSurface).toBe(true);
    });

    it('records VS Code as an execution-context fallback when no host resources exist', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const detector = PlatformDetector.getInstance(workspacePath);

      const ctx = detector.getDetectionContext();

      expect(ctx.platform).toBe('vscode');
      expect(ctx.detectionMethod).toBe('execution-context');
      expect(ctx.isAutoDetected).toBe(true);
      expect(ctx.isVSCodeExtension).toBe(true);
    });

    it('caches detectPlatform result until clearCache', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.claude/commands')
      );
      const detector = PlatformDetector.getInstance(workspacePath);

      const first = detector.detectPlatform();
      expect(first).toBe('claude');

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.system/skills')
      );

      const cached = detector.detectPlatform();
      expect(cached).toBe('claude');

      detector.clearCache();
      const refreshed = detector.detectPlatform();
      expect(refreshed).toBe('codex');
    });

    it('gracefully handles fs errors in directory checks', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('fs failed');
      });
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.getDefaultPlatform()).toBe('vscode');
      expect(detector.isPlatformAvailable('claude')).toBe(false);
    });
  });
});
