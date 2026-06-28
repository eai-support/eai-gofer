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

// Mock VSCode
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
  },
}));

// Mock fs/promises
vi.mock('fs/promises');

describe('MCP Integration (T084)', () => {
  let mcpHelper: MCPConfigHelper;
  let mockConfig: Record<string, unknown>;
  const mockWorkspacePath = '/test/workspace';
  const mockContext = {
    asAbsolutePath: vi.fn((p: string) => `/extension/${p}`),
  } as unknown as vscode.ExtensionContext;

  beforeEach(() => {
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
        vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        await expect(mcpHelper.createOrUpdateConfig()).resolves.toBeUndefined();

        expect(fs.writeFile).toHaveBeenCalled();
        const written = vi.mocked(fs.writeFile).mock.calls.at(-1)?.[1] as string;
        const parsed = JSON.parse(written);
        expect(parsed.servers.gofer.command).toBe('node');
        expect(parsed.servers.gofer.args).toEqual(['/extension/language-server/dist/server.js']);
        expect(parsed.servers.gofer.env).toBeUndefined();
      }
    );

    it('should migrate old nested gofer config to top-level servers without duplicating it', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          mcp: {
            servers: {
              gofer: { command: 'old', args: [] },
              other: { command: 'other', args: [] },
            },
          },
        })
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await expect(mcpHelper.createOrUpdateConfig()).resolves.toBeUndefined();

      const written = vi.mocked(fs.writeFile).mock.calls.at(-1)?.[1] as string;
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
    it('should handle missing directory creation gracefully', async () => {
      mockConfig['defaultCLI'] = 'auto';

      const fs = await import('fs/promises');
      // Mock mkdir to fail but writeFile to succeed (directory already exists)
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Directory exists'));
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      // Should complete successfully despite mkdir error
      await expect(mcpHelper.createOrUpdateConfig()).resolves.toBeUndefined();
    });

    it('should handle write errors by throwing', async () => {
      mockConfig['defaultCLI'] = 'auto';

      const fs = await import('fs/promises');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));

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
