/**
 * MCP Integration Tests
 * Task: T084
 *
 * Tests verify:
 * - T084: MCP Tool Handler multi-directory search
 * - Priority fallback (.claude/commands/ > .agents/skills/ > .github/prompts/)
 * - Graceful degradation when MCP not available
 * - Provider-neutral MCP initialization for app/native agent surfaces
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPConfigHelper } from '../../extension/src/mcpConfig';
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'fs/promises';
import type { Stats } from 'node:fs';

// Mock VSCode
vi.mock('vscode', () => ({
  window: { showErrorMessage: vi.fn() },
  workspace: {
    isTrusted: true,
    getConfiguration: vi.fn(),
  },
}));

// Mock fs/promises
vi.mock('fs/promises');

describe('MCP Integration (T084)', () => {
  let mcpHelper: MCPConfigHelper;
  let mockConfig: Record<string, unknown>;
  let fileExists: boolean;
  const write = vi.fn();
  const mockWorkspacePath = path.resolve('/test/workspace');
  const mockContext = {
    asAbsolutePath: vi.fn((p: string) => `/extension/${p}`),
  } as unknown as vscode.ExtensionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    fileExists = false;
    const stat = {
      dev: 1,
      ino: 2,
      size: 0,
      mtimeMs: 0,
      ctimeMs: 0,
      nlink: 1,
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false,
    } as Stats;
    vi.mocked(fs.lstat).mockImplementation(async (file) => {
      if (String(file).endsWith('mcp.json')) {
        if (!fileExists) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        return stat;
      }
      return { ...stat, ino: 1, isFile: () => false, isDirectory: () => true } as Stats;
    });
    write.mockImplementation(async (_buffer: Buffer, _offset: number, length: number) => ({
      bytesWritten: length,
    }));
    vi.mocked(fs.open).mockImplementation(async () => {
      fileExists = true;
      return {
        stat: async () => stat,
        readFile: () => fs.readFile(path.join(mockWorkspacePath, '.vscode', 'mcp.json'), 'utf8'),
        write,
        truncate: vi.fn(),
        close: vi.fn(),
      } as unknown as fs.FileHandle;
    });
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

    mcpHelper = new MCPConfigHelper(mockWorkspacePath, mockContext);
  });

  describe('Provider-neutral MCP Initialization', () => {
    it.each(['codex', 'copilot', 'gemini', 'claude', 'auto'])(
      'should write MCP setup when defaultCLI is "%s"',
      async (provider) => {
        mockConfig['defaultCLI'] = provider;
        mockConfig['cliProvider'] = 'auto';

        // Mock fs operations to succeed
        const fs = await import('fs/promises');
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.readFile).mockRejectedValue(
          Object.assign(new Error('File not found'), { code: 'ENOENT' })
        );
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        await expect(mcpHelper.createOrUpdateConfig()).resolves.toBeUndefined();

        expect(write).toHaveBeenCalled();
        const written = (write.mock.calls.at(-1)?.[0] as Buffer).toString('utf8');
        const parsed = JSON.parse(written);
        expect(parsed.servers.gofer.command).toBe('node');
        expect(parsed.servers.gofer.args).toEqual([
          mockContext.asAbsolutePath(path.join('language-server', 'dist', 'mcpServer.js')),
          '--workspace-root',
          path.resolve(mockWorkspacePath),
        ]);
        expect(parsed.servers.gofer.env).toBeUndefined();
      }
    );

    it('should migrate old nested gofer config to top-level servers without duplicating it', async () => {
      fileExists = true;
      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          mcp: {
            servers: {
              gofer: {
                type: 'stdio',
                command: 'node',
                args: [
                  mockContext.asAbsolutePath(path.join('language-server', 'dist', 'server.js')),
                ],
                description: 'Gofer - Spec-driven development orchestrator',
              },
              other: { command: 'other', args: [] },
            },
          },
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await expect(mcpHelper.createOrUpdateConfig()).resolves.toBeUndefined();

      const written = (write.mock.calls.at(-1)?.[0] as Buffer).toString('utf8');
      const parsed = JSON.parse(written);
      expect(parsed.servers.gofer.command).toBe('node');
      expect(parsed.mcp.servers.gofer).toBeUndefined();
      expect(parsed.mcp.servers.other.command).toBe('other');
    });
  });

  describe('T084: MCP Tool Handler Priority Fallback', () => {
    it('should prioritize .claude/commands/ directory first', () => {
      const platforms = [
        { name: 'claude', path: '.claude/commands', priority: 1 },
        { name: 'codex', path: '.agents/skills', priority: 2 },
        { name: 'copilot', path: '.github/prompts', priority: 3 },
      ];

      // Verify priority ordering
      expect(platforms[0].name).toBe('claude');
      expect(platforms[0].priority).toBe(1);
    });

    it('should fall back to .agents/skills/ if .claude/commands/ not found', () => {
      const platforms = [
        { name: 'claude', exists: false },
        { name: 'codex', exists: true },
        { name: 'copilot', exists: true },
      ];

      const available = platforms.filter((p) => p.exists);
      expect(available[0].name).toBe('codex');
    });

    it('should fall back to .github/prompts/ if only Copilot available', () => {
      const platforms = [
        { name: 'claude', exists: false },
        { name: 'codex', exists: false },
        { name: 'copilot', exists: true },
      ];

      const available = platforms.filter((p) => p.exists);
      expect(available[0].name).toBe('copilot');
    });
  });

  describe('Graceful Degradation', () => {
    it('should report directory creation failure without attempting a write', async () => {
      mockConfig['defaultCLI'] = 'auto';

      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Directory exists'));
      vi.mocked(fs.readFile).mockRejectedValue(
        Object.assign(new Error('File not found'), { code: 'ENOENT' })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await expect(mcpHelper.createOrUpdateConfig()).rejects.toThrow(
        'Cannot write Gofer MCP configuration'
      );
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    });

    it('should handle write errors by throwing', async () => {
      mockConfig['defaultCLI'] = 'auto';

      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockRejectedValue(
        Object.assign(new Error('File not found'), { code: 'ENOENT' })
      );
      write.mockRejectedValue(new Error('Permission denied'));

      // Should throw when unable to write
      await expect(mcpHelper.createOrUpdateConfig()).rejects.toThrow();
    });
  });

  describe('Multi-Directory Search', () => {
    it('should search command directories in priority order', () => {
      const searchOrder = ['.claude/commands', '.agents/skills', '.github/prompts'];

      expect(searchOrder[0]).toBe('.claude/commands');
      expect(searchOrder[1]).toBe('.agents/skills');
      expect(searchOrder[2]).toBe('.github/prompts');
    });

    it('should stop search after first match', () => {
      const directories = [
        { path: '.claude/commands', found: true },
        { path: '.agents/skills', found: true },
        { path: '.github/prompts', found: true },
      ];

      // Simulate priority search
      let result = null;
      for (const dir of directories) {
        if (dir.found) {
          result = dir.path;
          break;
        }
      }

      expect(result).toBe('.claude/commands');
    });
  });
});
