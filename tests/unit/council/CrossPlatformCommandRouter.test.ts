import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { CrossPlatformCommandRouter } from '../../../extension/src/council/CrossPlatformCommandRouter';
import { PlatformDetector } from '../../../extension/src/council/PlatformDetector';
import { ConfigManager } from '../../../extension/src/config';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
    createFileSystemWatcher: vi.fn(() => ({
      onDidChange: vi.fn(),
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  RelativePattern: class RelativePattern {
    constructor(
      public base: string,
      public pattern: string
    ) {}
  },
}));

vi.mock('fs');

function createFsError(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

describe('CrossPlatformCommandRouter', () => {
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
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.readFileSync).mockReturnValue(`---
description: Test command
---

# Test

Body`);
    vi.mocked(fs.promises.readFile).mockResolvedValue(`---
description: Test command
---

# Test

Body`);
    // Default: all paths inaccessible
    vi.mocked(fs.promises.access).mockRejectedValue(createFsError('ENOENT'));

    ConfigManager.getInstance().refresh();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('routes to preferred platform when available', async () => {
    mockConfig['defaultCLI'] = 'copilot';
    ConfigManager.getInstance().refresh();

    vi.mocked(fs.promises.access).mockImplementation((p) =>
      String(p).includes('.github/prompts/1_gofer_research.prompt.md')
        ? Promise.resolve()
        : Promise.reject(createFsError('ENOENT'))
    );

    const router = new CrossPlatformCommandRouter(workspacePath);
    const result = await router.routeCommand('1_gofer_research');

    expect(result.platform).toBe('copilot');
    expect(result.filePath).toContain('.github/prompts/1_gofer_research.prompt.md');
    expect(result.syntax).toBe('#1_gofer_research');
  });

  it('falls back by priority Claude > Codex > Copilot when auto', async () => {
    mockConfig['defaultCLI'] = 'auto';
    ConfigManager.getInstance().refresh();

    vi.mocked(fs.promises.access).mockImplementation((p) => {
      const pathStr = String(p);
      return pathStr.includes('.claude/commands/1_gofer_research.md') ||
        pathStr.includes('.system/skills/gofer/1_gofer_research/SKILL.md') ||
        pathStr.includes('.github/prompts/1_gofer_research.prompt.md')
        ? Promise.resolve()
        : Promise.reject(createFsError('ENOENT'));
    });

    const router = new CrossPlatformCommandRouter(workspacePath);
    const result = await router.routeCommand('1_gofer_research');

    expect(result.platform).toBe('claude');
    expect(result.syntax).toBe('/1_gofer_research');
  });

  it('falls back from unavailable preferred codex to claude', async () => {
    mockConfig['defaultCLI'] = 'codex';
    ConfigManager.getInstance().refresh();

    vi.mocked(fs.promises.access).mockImplementation((p) =>
      String(p).includes('.claude/commands/1_gofer_research.md')
        ? Promise.resolve()
        : Promise.reject(createFsError('ENOENT'))
    );

    const router = new CrossPlatformCommandRouter(workspacePath);
    const result = await router.routeCommand('1_gofer_research');

    expect(result.platform).toBe('claude');
    expect(result.filePath).toContain('.claude/commands/1_gofer_research.md');
  });

  it('prefers nested codex skill paths and falls back to legacy flat paths', () => {
    const router = new CrossPlatformCommandRouter(workspacePath);

    vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) =>
      String(filePath).includes('.system/skills/gofer/gofer_diagnose/SKILL.md')
    );
    expect(router.getCommandPath('gofer:diagnose', 'codex')).toContain(
      '.system/skills/gofer/gofer_diagnose/SKILL.md'
    );

    vi.mocked(fs.existsSync).mockImplementation((filePath: fs.PathLike) =>
      String(filePath).includes('.system/skills/gofer_plan/SKILL.md')
    );
    expect(router.getCommandPath('gofer:plan', 'codex')).toContain(
      '.system/skills/gofer_plan/SKILL.md'
    );
  });

  it('respects explicit targetPlatform override without fallback', async () => {
    mockConfig['defaultCLI'] = 'claude';
    ConfigManager.getInstance().refresh();
    // access already mocked to reject by default in beforeEach

    const router = new CrossPlatformCommandRouter(workspacePath);
    await expect(router.routeCommand('1_gofer_research', 'copilot')).rejects.toThrow(
      'Command "1_gofer_research" not found for platform "copilot"'
    );
  });

  it('formats Antigravity skill syntax without legacy Gemini command prefixes', () => {
    const router = new CrossPlatformCommandRouter(workspacePath);

    expect(router.getCommandSyntax('eai', 'antigravity')).toBe('/eai');
    expect(router.getCommandSyntax('eai', 'antigravity-desktop')).toBe('/eai');
  });

  it('rejects path traversal command names (T046)', async () => {
    const router = new CrossPlatformCommandRouter(workspacePath);

    await expect(router.routeCommand('../../../etc/passwd')).rejects.toThrow(
      'Invalid command name: "../../../etc/passwd" (path traversal not allowed)'
    );
    await expect(router.routeCommand('..\\..\\windows\\system32')).rejects.toThrow(
      'Invalid command name: "..\\..\\windows\\system32" (path traversal not allowed)'
    );
    await expect(router.routeCommand('/absolute/path')).rejects.toThrow(
      'Invalid command name: "/absolute/path" (path traversal not allowed)'
    );
  });
  it.each(['antigravity', 'antigravity-desktop'] as const)(
    'routes explicit %s to shared skills with its own identity and no native capability claim',
    async (surface) => {
      mockConfig.defaultCLI = surface;
      ConfigManager.getInstance().refresh();
      vi.mocked(fs.promises.access).mockImplementation((p) =>
        String(p).endsWith('.agents/skills/eai/SKILL.md')
          ? Promise.resolve()
          : Promise.reject(createFsError('ENOENT'))
      );
      vi.mocked(fs.promises.readFile).mockResolvedValue(
        '---\\nname: eai\\ndescription: Shared Gofer\\n---\\nBody'
      );
      const router = new CrossPlatformCommandRouter(workspacePath);
      const result = await router.routeCommand('eai');
      expect(result).toMatchObject({
        platform: surface,
        syntax: '/eai',
        metadata: { platform: surface, supportsAutoChain: false, supportsParallelAgents: false },
      });
      expect(result.filePath).toBe(workspacePath + '/.agents/skills/eai/SKILL.md');
      vi.mocked(fs.promises.access).mockRejectedValue(createFsError('ENOENT'));
      router.clearCache();
      await expect(router.routeCommand('eai')).rejects.toThrow('not found');
    }
  );

  it('rejects a supplied retired target before filesystem access', async () => {
    const router = new CrossPlatformCommandRouter(workspacePath);
    vi.mocked(fs.promises.access).mockClear();
    await expect(router.routeCommand('eai', 'gemini' as never)).rejects.toThrow('retired');
    expect(fs.promises.access).not.toHaveBeenCalled();
  });
});
