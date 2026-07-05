/**
 * MCP Configuration Helper
 *
 * Creates .vscode/mcp.json for VSCode's native MCP support (1.102+)
 * This allows Claude Code and GitHub Copilot to discover Gofer's MCP tools
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from './utils/logger';

interface MCPWorkspaceConfig {
  servers?: Record<string, unknown>;
  mcp?: {
    servers?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

export class MCPConfigHelper {
  private readonly logger = Logger.for('McpConfig');

  constructor(
    private workspacePath: string,
    private context: vscode.ExtensionContext
  ) {}

  /**
   * Create or update .vscode/mcp.json with Gofer MCP server configuration
   */
  async createOrUpdateConfig(): Promise<void> {
    const vscodeDir = path.join(this.workspacePath, '.vscode');
    const mcpConfigPath = path.join(vscodeDir, 'mcp.json');

    // Ensure .vscode directory exists
    try {
      await fs.mkdir(vscodeDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create .vscode directory:', error as Error);
    }

    // Get the path to the language server (works in both dev and production)
    const serverPath = this.context.asAbsolutePath(
      path.join('language-server', 'dist', 'server.js')
    );

    const goferServer = {
      type: 'stdio',
      command: 'node',
      args: [serverPath],
      description: 'Gofer - Spec-driven development orchestrator',
    };

    // Check if file already exists
    let existingConfig: MCPWorkspaceConfig = {};
    try {
      const content = await fs.readFile(mcpConfigPath, 'utf-8');
      existingConfig = JSON.parse(content);
    } catch {
      // File doesn't exist or is invalid, will create new
    }

    // VS Code's current workspace MCP shape is top-level `servers`.
    // Preserve any legacy `mcp.servers` entries, but remove an older Gofer
    // entry there so we don't expose duplicate tools.
    const legacyMcp = existingConfig.mcp
      ? {
          ...existingConfig.mcp,
          servers: { ...(existingConfig.mcp.servers ?? {}) },
        }
      : undefined;
    if (legacyMcp?.servers) {
      delete legacyMcp.servers.gofer;
    }

    const mergedConfig = {
      ...existingConfig,
      servers: {
        ...(existingConfig.servers ?? {}),
        gofer: goferServer,
      },
      ...(legacyMcp && Object.keys(legacyMcp.servers ?? {}).length > 0 ? { mcp: legacyMcp } : {}),
    };

    // Write configuration
    try {
      await fs.writeFile(mcpConfigPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');
      this.logger.info(`MCP configuration created/updated: ${mcpConfigPath}`);
    } catch (error) {
      this.logger.error('Failed to write MCP configuration:', error as Error);
      throw error;
    }
  }

  /**
   * Check if MCP configuration exists
   */
  async configExists(): Promise<boolean> {
    const mcpConfigPath = path.join(this.workspacePath, '.vscode', 'mcp.json');
    try {
      await fs.access(mcpConfigPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get MCP configuration status
   */
  async getStatus(): Promise<{
    exists: boolean;
    configured: boolean;
    authDelegatedToCli: boolean;
  }> {
    const exists = await this.configExists();

    if (!exists) {
      return { exists: false, configured: false, authDelegatedToCli: true };
    }

    const mcpConfigPath = path.join(this.workspacePath, '.vscode', 'mcp.json');
    try {
      const content = await fs.readFile(mcpConfigPath, 'utf-8');
      const config = JSON.parse(content);

      const configured = !!(config.servers?.gofer || config.mcp?.servers?.gofer);

      return { exists: true, configured, authDelegatedToCli: true };
    } catch {
      return { exists: true, configured: false, authDelegatedToCli: true };
    }
  }

  /**
   * Show setup instructions to user
   */
  async showSetupInstructions(): Promise<void> {
    const status = await this.getStatus();

    if (!status.configured) {
      const choice = await vscode.window.showInformationMessage(
        '🤖 Gofer MCP Tools Available!\n\n' +
          'Configure workspace MCP to enable Gofer tools in VS Code, Copilot, Claude Code, and compatible agent apps?',
        { modal: false },
        'Configure Now',
        'Learn More',
        'Later'
      );

      if (choice === 'Configure Now') {
        await this.createOrUpdateConfig();

        vscode.window
          .showInformationMessage(
            '✅ MCP configured! Reload VSCode to activate Gofer MCP tools.',
            'Reload Now'
          )
          .then((choice) => {
            if (choice === 'Reload Now') {
              vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          });
      } else if (choice === 'Learn More') {
        vscode.env.openExternal(
          vscode.Uri.parse('https://code.visualstudio.com/blogs/2025/06/12/full-mcp-spec-support')
        );
      }
    }
  }

  /**
   * Create configuration silently (for auto-setup)
   */
  async autoSetup(): Promise<boolean> {
    try {
      const exists = await this.configExists();
      if (!exists) {
        await this.createOrUpdateConfig();
        this.logger.info('MCP configuration auto-created');
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('MCP auto-setup failed:', error as Error);
      return false;
    }
  }
}
