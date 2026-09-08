/**
 * MCP Configuration Helper
 *
 * Creates .vscode/mcp.json for VSCode's native MCP support (1.102+)
 * This allows Claude Code and GitHub Copilot to discover Gofer's MCP tools
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { constants, type Stats } from 'fs';
import { Logger } from './utils/logger';

interface MCPWorkspaceConfig {
  servers?: Record<string, unknown>;
  mcp?: {
    servers?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const description = 'Gofer - Spec-driven development orchestrator';
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
    await this.updateConfig();
  }

  private async updateConfig(): Promise<boolean> {
    if (
      !path.isAbsolute(this.workspacePath) ||
      (process.platform === 'win32' &&
        !/^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/i.test(this.workspacePath))
    ) {
      throw new Error(
        'Select an explicit Gofer workspace using an absolute path; relative paths are not accepted.'
      );
    }
    this.requireWorkspaceTrust();
    const workspaceRoot = path.normalize(this.workspacePath);
    const vscodeDir = path.join(workspaceRoot, '.vscode');
    const mcpConfigPath = path.join(vscodeDir, 'mcp.json');
    const serverPath = this.context.asAbsolutePath(
      path.join('language-server', 'dist', 'mcpServer.js')
    );
    const goferServer = {
      type: 'stdio',
      command: 'node',
      args: [serverPath, '--workspace-root', workspaceRoot],
      description,
    };
    const fail = (reason: string): never => {
      throw new Error(`Gofer MCP configuration unchanged: ${mcpConfigPath}. ${reason}`);
    };
    const inspect = async () => {
      const stat = async (file: string, directory: boolean): Promise<Stats | undefined> => {
        let entry: Stats;
        try {
          entry = await fs.lstat(file);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return undefined;
          }
          return fail(
            'Cannot inspect the configuration path. Check its permissions and retry setup.'
          );
        }
        if (entry.isSymbolicLink()) {
          return fail(
            'A configuration path is a symbolic link. Preserve the link and configure MCP manually, or replace it with a workspace-owned directory/file.'
          );
        }
        if (directory ? !entry.isDirectory() : !entry.isFile() || entry.nlink !== 1) {
          return fail(
            'Configuration requires a normal directory and an unlinked regular file. Review the path manually.'
          );
        }
        return entry;
      };
      const directory = await stat(vscodeDir, true);
      return { directory, file: directory ? await stat(mcpConfigPath, false) : undefined };
    };
    const sameIdentity = (a: Stats | undefined, b: Stats | undefined) =>
      a === undefined || b === undefined ? a === b : a.dev === b.dev && a.ino === b.ino;
    const sameFile = (a: Stats | undefined, b: Stats | undefined) =>
      sameIdentity(a, b) &&
      (!a || !b || (a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs));
    const changed = () =>
      fail(
        'Configuration changed during setup. Review the current file and retry; no migration was applied.'
      );
    const initial = await inspect();
    let existingConfig: MCPWorkspaceConfig = {};
    let content: string | undefined;
    try {
      content = await fs.readFile(mcpConfigPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        fail('Cannot read the file. Check its permissions and retry setup.');
      }
    }
    if (
      Boolean(initial.file) !== (content !== undefined) ||
      !sameFile(initial.file, (await inspect()).file)
    ) {
      changed();
    }
    if (content !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        fail('Invalid JSON. Repair the file manually before retrying setup.');
      }
      if (
        !isObject(parsed) ||
        ('servers' in parsed && !isObject(parsed.servers)) ||
        ('mcp' in parsed &&
          (!isObject(parsed.mcp) || ('servers' in parsed.mcp && !isObject(parsed.mcp.servers))))
      ) {
        fail('Expected JSON objects for the configuration and server maps. Repair them manually.');
      }
      existingConfig = parsed as MCPWorkspaceConfig;
    }
    const current = existingConfig.servers;
    const legacy = existingConfig.mcp?.servers;
    const entries = [current, legacy].filter((map) => map && Object.hasOwn(map, 'gofer'));
    const owned = entries.map((map) => {
      const entry = map!.gofer;
      if (!this.isGeneratedEntry(entry, workspaceRoot)) {
        return fail(
          'A custom Gofer entry exists. Keep it, or manually configure mcpServer.js with --workspace-root and an absolute workspace path.'
        );
      }
      return { ...entry, ...goferServer };
    });
    if (owned.length === 2 && JSON.stringify(owned[0]) !== JSON.stringify(owned[1])) {
      fail(
        'Top-level and legacy Gofer entries differ. Reconcile their custom fields manually before retrying.'
      );
    }
    const mergedConfig: MCPWorkspaceConfig = {
      ...existingConfig,
      servers: { ...current, gofer: owned[0] ?? goferServer },
    };
    if (legacy && Object.hasOwn(legacy, 'gofer')) {
      const remaining = { ...legacy };
      delete remaining.gofer;
      const mcp = { ...existingConfig.mcp };
      if (Object.keys(remaining).length) {
        mcp.servers = remaining;
      } else {
        delete mcp.servers;
      }
      if (Object.keys(mcp).length) {
        mergedConfig.mcp = mcp;
      } else {
        delete mergedConfig.mcp;
      }
    }
    if (content !== undefined && JSON.stringify(existingConfig) === JSON.stringify(mergedConfig)) {
      return false;
    }
    try {
      this.requireWorkspaceTrust();
      const beforeMkdir = await inspect();
      if (
        !sameIdentity(initial.directory, beforeMkdir.directory) ||
        !sameFile(initial.file, beforeMkdir.file)
      ) {
        changed();
      }
      await fs.mkdir(vscodeDir, { recursive: true });
      const beforeOpen = await inspect();
      if (
        (initial.directory && !sameIdentity(initial.directory, beforeOpen.directory)) ||
        !sameFile(initial.file, beforeOpen.file)
      ) {
        changed();
      }
      this.requireWorkspaceTrust();
      // Never truncate by pathname: verify the opened file before changing its bytes.
      const handle = await fs.open(
        mcpConfigPath,
        (constants.O_NOFOLLOW ?? 0) |
          (content === undefined
            ? constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
            : constants.O_RDWR)
      );
      try {
        const opened = await handle.stat();
        const afterOpen = await inspect();
        if (
          !opened.isFile() ||
          opened.nlink !== 1 ||
          !sameIdentity(beforeOpen.directory, afterOpen.directory) ||
          !sameIdentity(opened, afterOpen.file) ||
          (initial.file && !sameFile(initial.file, opened))
        ) {
          changed();
        }
        if (content !== undefined && (await handle.readFile('utf8')) !== content) {
          changed();
        }
        const beforeWrite = await inspect();
        if (
          !sameIdentity(beforeOpen.directory, beforeWrite.directory) ||
          !sameFile(opened, beforeWrite.file) ||
          !sameFile(opened, await handle.stat())
        ) {
          changed();
        }
        this.requireWorkspaceTrust();
        const bytes = Buffer.from(JSON.stringify(mergedConfig, null, 2), 'utf8');
        let offset = 0;
        while (offset < bytes.length) {
          const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, offset);
          if (bytesWritten <= 0) {
            throw new Error('Configuration write made no progress.');
          }
          offset += bytesWritten;
        }
        await handle.truncate(bytes.length);
      } finally {
        await handle.close();
      }
      this.logger.info(`MCP configuration created/updated: ${mcpConfigPath}`);
    } catch (error) {
      this.logger.error('Failed to write MCP configuration:', error as Error);
      if (
        error instanceof Error &&
        (error.message.startsWith('Gofer MCP configuration unchanged:') ||
          error.message.includes('workspace trust'))
      ) {
        throw error;
      }
      throw new Error(
        `Cannot write Gofer MCP configuration: ${mcpConfigPath}. Check permissions and retry setup.`
      );
    }
    return true;
  }

  private requireWorkspaceTrust(): void {
    if (vscode.workspace.isTrusted !== true) {
      throw new Error(
        'Gofer MCP setup requires workspace trust. Review and trust this workspace in VS Code before retrying setup.'
      );
    }
  }

  private isGeneratedEntry(
    entry: unknown,
    workspaceRoot: string
  ): entry is Record<string, unknown> {
    if (
      !isObject(entry) ||
      entry.command !== 'node' ||
      entry.type !== 'stdio' ||
      entry.description !== description ||
      !Array.isArray(entry.args)
    ) {
      return false;
    }
    const args = entry.args;
    if (typeof args[0] !== 'string') {
      return false;
    }
    const normalized = args[0].replace(/\\/g, '/');
    const extensionRoot = this.context.asAbsolutePath('').replace(/\\/g, '/').replace(/\/$/, '');
    const workspace = workspaceRoot.replace(/\\/g, '/');
    const knownRoot =
      [extensionRoot, workspace, '${workspaceFolder}'].some(
        (root) =>
          normalized === `${root}/language-server/dist/server.js` ||
          normalized === `${root}/language-server/dist/mcpServer.js`
      ) ||
      /\/extensions\/enterpriseai\.gofer-[^/]+\/language-server\/dist\/(?:server|mcpServer)\.js$/.test(
        normalized
      );
    if (!knownRoot) {
      return false;
    }
    return normalized.endsWith('/server.js')
      ? args.length === 1 || (args.length === 2 && args[1] === '--stdio')
      : args.length === 3 &&
          args[1] === '--workspace-root' &&
          typeof args[2] === 'string' &&
          (path.isAbsolute(args[2]) || args[2] === '${workspaceFolder}');
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
      return await this.updateConfig();
    } catch (error) {
      this.logger.error('MCP auto-setup failed:', error as Error);
      void vscode.window.showErrorMessage((error as Error).message);
      return false;
    }
  }
}
