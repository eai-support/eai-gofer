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

    it('recognizes shared skill files for explicit Antigravity routing, not native installation', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.agents/skills')
      );
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.isPlatformAvailable('antigravity')).toBe(true);
      expect(detector.isPlatformAvailable('claude')).toBe(false);
      expect(detector.isPlatformAvailable('copilot')).toBe(false);
      expect(detector.isPlatformAvailable('codex')).toBe(true);
      expect(detector.isPlatformAvailable('antigravity-desktop')).toBe(true);
    });
  });

  describe('getDefaultPlatform', () => {
    it('honors explicit user setting', () => {
      mockConfig['defaultCLI'] = 'copilot';
      ConfigManager.getInstance().refresh();
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.getDefaultPlatform()).toBe('copilot');
    });

    it('auto-detects existing non-Google hosts and ignores retired Gemini files', () => {
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

      vi.mocked(fs.existsSync).mockImplementation(
        (p: fs.PathLike) =>
          String(p).includes('.gemini/commands/gofer') || String(p).includes('.github/prompts')
      );
      detector.clearCache();
      expect(detector.getDefaultPlatform()).toBe('copilot');

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
        String(p).includes('.github/prompts')
      );
      detector.clearCache();
      expect(detector.getDefaultPlatform()).toBe('copilot');
    });

    it('returns auto when no directories are available and setting is auto', () => {
      mockConfig['defaultCLI'] = 'auto';
      ConfigManager.getInstance().refresh();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const detector = PlatformDetector.getInstance(workspacePath);
      expect(detector.getDefaultPlatform()).toBe('auto');
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
      expect(detector.getDefaultPlatform()).toBe('auto');
      expect(detector.isPlatformAvailable('claude')).toBe(false);
    });
  });
});
