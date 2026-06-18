import * as vscode from 'vscode';
import packageJson from '../package.json';

/**
 * Extension configuration constants and settings management
 * Centralizes all configuration values and provides typed access to VSCode settings
 */

// Extension constants
export const EXTENSION_NAME = 'gofer';
export const EXTENSION_DISPLAY_NAME = 'Gofer';
// Read version from package.json to keep it in sync
export const EXTENSION_VERSION = packageJson.version;

// File and folder constants
export const SPECIFY_FOLDER = '.specify';
export const SPECS_FOLDER = 'specs';
export const MEMORY_FOLDER = 'memory';
export const TEMPLATES_FOLDER = 'templates';
export const CONSTITUTION_FILE = 'constitution.md';
export const MCP_CONFIG_FILE = '.vscode/mcp.json';

// GitHub constants
export const GITHUB_OWNER = 'eai-tools';
export const GITHUB_REPO = 'eai-gofer';
export const GITHUB_API_BASE = 'https://api.github.com';

// Language Server constants
export const LSP_SERVER_NAME = 'Gofer Language Server';
export const LSP_SERVER_ID = 'gofer-lsp';
export const LSP_SERVER_EXECUTABLE = 'node';

// MCP Tool names
export const MCP_TOOLS = {
  getSpecs: 'gofer_get_specs',
  getNextTask: 'gofer_get_next_task',
  executeTask: 'gofer_execute_task',
  updateTaskStatus: 'gofer_update_task_status',
  validateCode: 'gofer_validate_code',
  runTests: 'gofer_run_tests',
} as const;

// Commands
export const COMMANDS = {
  initialize: 'gofer.initialize',
  installOptionalTools: 'gofer.installOptionalTools',
  upgrade: 'gofer.upgrade',
  checkVersion: 'gofer.checkVersion',
  refreshSpecs: 'gofer.refreshSpecs',
  refreshConstitution: 'gofer.refreshConstitution',
  showProgress: 'gofer.showProgress',
  showConstitution: 'gofer.showConstitution',
  checkForUpdates: 'gofer.checkForUpdates',
  updateNow: 'gofer.updateNow',
} as const;

// View IDs
export const VIEWS = {
  progress: 'goferProgress',
  aiUsage: 'goferAIUsage',
  memory: 'goferMemory',
  container: 'gofer',
} as const;

// Configuration keys
export const CONFIG_KEYS = {
  claudeCodeCommand: 'gofer.claudeCodeCommand',
  cliProvider: 'gofer.cliProvider',
  defaultCLI: 'gofer.defaultCLI',
  codexCommand: 'gofer.codexCommand',
  autoInitialize: 'gofer.autoInitialize',
  preferredAi: 'gofer.preferredAI',
} as const;

// Default values
export const DEFAULTS = {
  claudeCodeCommand: 'claude',
  cliProvider: 'auto' as const,
  defaultCLI: 'auto' as const,
  codexCommand: 'codex',
  autoInitialize: false,
  preferredAi: 'ask',
} as const;

// File patterns
export const FILE_PATTERNS = {
  SPEC_MARKDOWN: '**/specs/**/spec.md',
  TASK_MARKDOWN: '**/specs/**/tasks.md',
  CONSTITUTION: '**/memory/constitution.md',
  CLAUDE_INPUT: '.claude-input.txt',
  CLAUDE_OUTPUT: '.claude-output.txt',
  GITIGNORE: '.gitignore',
} as const;

/**
 * Configuration manager class for type-safe access to VSCode settings
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: vscode.WorkspaceConfiguration;

  private constructor() {
    this.config = vscode.workspace.getConfiguration('gofer');
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Refresh configuration (call when settings change)
   */
  public refresh(): void {
    this.config = vscode.workspace.getConfiguration('gofer');
  }

  /**
   * Get the Claude Code command/path used by CLI provider execution.
   */
  public getClaudeCodeCommand(): string {
    return this.config.get<string>(
      CONFIG_KEYS.claudeCodeCommand.replace('gofer.', ''),
      DEFAULTS.claudeCodeCommand
    );
  }

  /**
   * Get auto-initialize setting
   */
  public getAutoInitialize(): boolean {
    return this.config.get<boolean>(
      CONFIG_KEYS.autoInitialize.replace('gofer.', ''),
      DEFAULTS.autoInitialize
    );
  }

  /**
   * Set auto-initialize setting
   */
  public async setAutoInitialize(
    value: boolean,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    await this.config.update(CONFIG_KEYS.autoInitialize.replace('gofer.', ''), value, target);
  }

  /**
   * Get preferred AI setting
   */
  public getPreferredAI(): string {
    return this.config.get<string>(
      CONFIG_KEYS.preferredAi.replace('gofer.', ''),
      DEFAULTS.preferredAi
    );
  }

  /**
   * Get auto-update check setting
   */
  public getAutoUpdateCheck(): boolean {
    return true;
  }

  /**
   * Get telemetry enabled setting
   */
  public getTelemetryEnabled(): boolean {
    return true;
  }

  /**
   * Get update check interval
   */
  public getUpdateCheckInterval(): number {
    return 24 * 60 * 60 * 1000;
  }

  /**
   * Get performance mode
   */
  public getPerformanceMode(): 'fast' | 'balanced' | 'thorough' {
    return 'balanced';
  }

  /**
   * Get preferred CLI provider setting (T009)
   */
  public getPreferredCLIProvider(): 'claude' | 'codex' | 'copilot' | 'gemini' | 'auto' {
    return this.config.get<'claude' | 'codex' | 'copilot' | 'gemini' | 'auto'>(
      CONFIG_KEYS.cliProvider.replace('gofer.', ''),
      DEFAULTS.cliProvider
    );
  }

  /**
   * Get default CLI for Gofer command routing (T004)
   */
  public getDefaultCLI(): 'claude' | 'copilot' | 'codex' | 'gemini' | 'auto' {
    return this.config.get<'claude' | 'copilot' | 'codex' | 'gemini' | 'auto'>(
      'defaultCLI',
      DEFAULTS.defaultCLI
    );
  }

  /**
   * Get Codex CLI command (T010)
   */
  public getCodexCommand(): string {
    return this.config.get<string>(
      CONFIG_KEYS.codexCommand.replace('gofer.', ''),
      DEFAULTS.codexCommand
    );
  }

  /**
   * Get human-readable display name for CLI platform (T075)
   *
   * @param platform Platform identifier
   * @returns Display name (e.g., "Claude Code", "GitHub Copilot Chat")
   */
  public getCLIDisplayName(platform: 'claude' | 'copilot' | 'codex' | 'gemini' | 'auto'): string {
    const displayNames: Record<'claude' | 'copilot' | 'codex' | 'gemini' | 'auto', string> = {
      claude: 'Claude Code',
      copilot: 'GitHub Copilot Chat',
      codex: 'OpenAI Codex CLI',
      gemini: 'Google Gemini CLI',
      auto: 'Auto-Detect',
    };

    return displayNames[platform];
  }

  /**
   * Check if a CLI platform directory exists in workspace (T076)
   *
   * @param platform Platform to check
   * @param workspacePath Workspace root path
   * @returns True if platform directory exists
   */
  public isPlatformEnabled(
    platform: 'claude' | 'copilot' | 'codex' | 'gemini',
    workspacePath: string
  ): boolean {
    const fs = require('fs');
    const path = require('path');

    const platformPaths: Record<'claude' | 'copilot' | 'codex' | 'gemini', string> = {
      claude: path.join(workspacePath, '.claude', 'commands'),
      copilot: path.join(workspacePath, '.github', 'prompts'),
      codex: path.join(workspacePath, '.system', 'skills'),
      gemini: path.join(workspacePath, '.gemini', 'commands', 'gofer'),
    };

    try {
      const fullPath = platformPaths[platform];
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get all configuration as object
   */
  public getAll(): Record<string, unknown> {
    return {
      autoInitialize: this.getAutoInitialize(),
      preferredAI: this.getPreferredAI(),
    };
  }
}

/**
 * Get workspace-specific paths
 */
export function getWorkspacePaths(workspacePath: string) {
  const path = require('path');

  return {
    specify: path.join(workspacePath, SPECIFY_FOLDER),
    specs: path.join(workspacePath, SPECIFY_FOLDER, SPECS_FOLDER),
    memory: path.join(workspacePath, SPECIFY_FOLDER, MEMORY_FOLDER),
    templates: path.join(workspacePath, SPECIFY_FOLDER, TEMPLATES_FOLDER),
    constitution: path.join(workspacePath, SPECIFY_FOLDER, MEMORY_FOLDER, CONSTITUTION_FILE),
    mcpConfig: path.join(workspacePath, MCP_CONFIG_FILE),
    claudeInput: path.join(workspacePath, FILE_PATTERNS.CLAUDE_INPUT),
    claudeOutput: path.join(workspacePath, FILE_PATTERNS.CLAUDE_OUTPUT),
  };
}

/**
 * Validation helpers
 */
export const VALIDATION = {
  /**
   * Check if a path is within the .specify folder
   */
  isSpecifyPath(filePath: string, workspacePath: string): boolean {
    const path = require('path');
    const specifyPath = path.join(workspacePath, SPECIFY_FOLDER);
    return filePath.startsWith(specifyPath);
  },

  /**
   * Check if a file is a spec file
   */
  isSpecFile(filePath: string): boolean {
    return filePath.includes('/specs/') && filePath.endsWith('/spec.md');
  },

  /**
   * Check if a file is a tasks file
   */
  isTasksFile(filePath: string): boolean {
    return filePath.includes('/specs/') && filePath.endsWith('/tasks.md');
  },

  /**
   * Check if a file is the constitution
   */
  isConstitutionFile(filePath: string): boolean {
    return filePath.includes('/memory/') && filePath.endsWith('/constitution.md');
  },
};
