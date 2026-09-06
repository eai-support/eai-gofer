/**
 * Skill Directory Manager for Cross-Platform Command Parity
 * Feature 028: Manages command discovery across multiple directories
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CommandMetadata } from './types/CrossPlatformTypes';
import { CommandMetadataExtractor } from './CommandMetadataExtractor';

/**
 * Interface for skill directory management
 */
export interface SkillDirectoryManager {
  /**
   * Find a specific command by name
   *
   * @param commandName Command to find
   * @returns Command metadata or null if not found
   */
  findCommand(commandName: string): CommandMetadata | null;

  /**
   * List all available commands
   *
   * @returns Array of command metadata
   */
  listCommands(): CommandMetadata[];

  /**
   * Get metadata for a specific command
   *
   * @param commandName Command name
   * @returns Command metadata or null if not found
   */
  getCommandMetadata(commandName: string): CommandMetadata | null;

  /**
   * Watch directories for changes
   *
   * @param callback Function to call when changes detected
   */
  watchDirectories(callback: () => void): vscode.Disposable;
}

/**
 * Default implementation of SkillDirectoryManager
 *
 * Searches multiple directories with priority:
 * 1. .claude/commands/ (Claude CLI - highest priority)
 * 2. .agents/skills/  (Codex CLI canonical path, with legacy .system fallback)
 * 4. .github/prompts/ (Copilot Chat - lowest priority)
 */
export class DefaultSkillDirectoryManager implements SkillDirectoryManager {
  private commandCache: Map<string, CommandMetadata> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache
  private extractor: CommandMetadataExtractor;

  constructor(private workspacePath: string) {
    this.extractor = new CommandMetadataExtractor();
  }

  private toCommandFileStem(commandName: string): string {
    return commandName.replace(/:/g, '_').replace(/-/g, '_');
  }

  private getCommandFileStemCandidates(commandName: string): string[] {
    const safeStem = this.toCommandFileStem(commandName);
    return safeStem === commandName ? [commandName] : [safeStem, commandName];
  }

  /**
   * Find a specific command by name (with priority order)
   *
   * @param commandName Command to find
   * @returns Command metadata or null if not found
   */
  public findCommand(commandName: string): CommandMetadata | null {
    // Check cache first
    if (this.isCacheValid() && this.commandCache.has(commandName)) {
      return this.commandCache.get(commandName)!;
    }

    // Search in priority order: Claude > shared .agents skills > Copilot
    // 1. Try Claude CLI
    const claudeMetadata = this.searchClaudeCommands(commandName);
    if (claudeMetadata) {
      this.commandCache.set(commandName, claudeMetadata);
      return claudeMetadata;
    }

    // 2. Try Codex CLI
    const codexMetadata = this.searchCodexSkills(commandName);
    if (codexMetadata) {
      this.commandCache.set(commandName, codexMetadata);
      return codexMetadata;
    }

    // 4. Try Copilot Chat
    const copilotMetadata = this.searchCopilotPrompts(commandName);
    if (copilotMetadata) {
      this.commandCache.set(commandName, copilotMetadata);
      return copilotMetadata;
    }
    return null;
  }

  /**
   * List all available commands from all directories
   *
   * @returns Array of command metadata
   */
  public listCommands(): CommandMetadata[] {
    // Check cache first
    if (this.isCacheValid() && this.commandCache.size > 0) {
      return Array.from(this.commandCache.values());
    }

    const commands: CommandMetadata[] = [];

    // Collect from all platforms
    commands.push(...this.getAllClaudeCommands());
    commands.push(...this.getAllCodexSkills());
    commands.push(...this.getAllCopilotPrompts());

    // Update cache
    this.commandCache.clear();
    commands.forEach((cmd) => this.commandCache.set(cmd.name, cmd));
    this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;

    return commands;
  }

  /**
   * Get metadata for a specific command (alias for findCommand)
   *
   * @param commandName Command name
   * @returns Command metadata or null if not found
   */
  public getCommandMetadata(commandName: string): CommandMetadata | null {
    return this.findCommand(commandName);
  }

  /**
   * Watch directories for changes and invalidate cache
   *
   * @param callback Function to call when changes detected
   * @returns Disposable to stop watching
   */
  public watchDirectories(callback: () => void): vscode.Disposable {
    const watchers: vscode.FileSystemWatcher[] = [];

    // Watch .claude/commands/
    const claudePattern = new vscode.RelativePattern(this.workspacePath, '.claude/commands/*.md');
    const claudeWatcher = vscode.workspace.createFileSystemWatcher(claudePattern);
    claudeWatcher.onDidChange(() => this.onDirectoryChange(callback));
    claudeWatcher.onDidCreate(() => this.onDirectoryChange(callback));
    claudeWatcher.onDidDelete(() => this.onDirectoryChange(callback));
    watchers.push(claudeWatcher);

    // Watch canonical Codex skills plus legacy compatibility mirrors.
    const canonicalCodexPattern = new vscode.RelativePattern(
      this.workspacePath,
      '.agents/skills/*/SKILL.md'
    );
    const canonicalCodexWatcher = vscode.workspace.createFileSystemWatcher(canonicalCodexPattern);
    canonicalCodexWatcher.onDidChange(() => this.onDirectoryChange(callback));
    canonicalCodexWatcher.onDidCreate(() => this.onDirectoryChange(callback));
    canonicalCodexWatcher.onDidDelete(() => this.onDirectoryChange(callback));
    watchers.push(canonicalCodexWatcher);

    const codexNamespacePattern = new vscode.RelativePattern(
      this.workspacePath,
      '.agents/skills/gofer/*/SKILL.md'
    );
    const codexNamespaceWatcher = vscode.workspace.createFileSystemWatcher(codexNamespacePattern);
    codexNamespaceWatcher.onDidChange(() => this.onDirectoryChange(callback));
    codexNamespaceWatcher.onDidCreate(() => this.onDirectoryChange(callback));
    codexNamespaceWatcher.onDidDelete(() => this.onDirectoryChange(callback));
    watchers.push(codexNamespaceWatcher);

    const codexPattern = new vscode.RelativePattern(
      this.workspacePath,
      '.system/skills/*/SKILL.md'
    );
    const codexWatcher = vscode.workspace.createFileSystemWatcher(codexPattern);
    codexWatcher.onDidChange(() => this.onDirectoryChange(callback));
    codexWatcher.onDidCreate(() => this.onDirectoryChange(callback));
    codexWatcher.onDidDelete(() => this.onDirectoryChange(callback));
    watchers.push(codexWatcher);

    const legacyCodexNamespacePattern = new vscode.RelativePattern(
      this.workspacePath,
      '.system/skills/gofer/*/SKILL.md'
    );
    const legacyCodexNamespaceWatcher = vscode.workspace.createFileSystemWatcher(
      legacyCodexNamespacePattern
    );
    legacyCodexNamespaceWatcher.onDidChange(() => this.onDirectoryChange(callback));
    legacyCodexNamespaceWatcher.onDidCreate(() => this.onDirectoryChange(callback));
    legacyCodexNamespaceWatcher.onDidDelete(() => this.onDirectoryChange(callback));
    watchers.push(legacyCodexNamespaceWatcher);

    // Watch .github/prompts/
    const copilotPattern = new vscode.RelativePattern(
      this.workspacePath,
      '.github/prompts/*.prompt.md'
    );
    const copilotWatcher = vscode.workspace.createFileSystemWatcher(copilotPattern);
    copilotWatcher.onDidChange(() => this.onDirectoryChange(callback));
    copilotWatcher.onDidCreate(() => this.onDirectoryChange(callback));
    copilotWatcher.onDidDelete(() => this.onDirectoryChange(callback));
    watchers.push(copilotWatcher);

    // Return disposable to stop all watchers
    return {
      dispose: () => {
        watchers.forEach((watcher) => watcher.dispose());
      },
    };
  }

  /**
   * Clear command cache (force refresh)
   */
  public clearCache(): void {
    this.commandCache.clear();
    this.cacheExpiry = 0;
  }

  /**
   * Handle directory change events
   */
  private onDirectoryChange(callback: () => void): void {
    this.clearCache();
    callback();
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() < this.cacheExpiry;
  }

  /**
   * Search for command in Claude CLI directory
   */
  private searchClaudeCommands(commandName: string): CommandMetadata | null {
    const claudeDir = path.join(this.workspacePath, '.claude/commands');
    if (!fs.existsSync(claudeDir)) {
      return null;
    }

    for (const fileStem of this.getCommandFileStemCandidates(commandName)) {
      const filePath = path.join(claudeDir, `${fileStem}.md`);
      if (fs.existsSync(filePath)) {
        try {
          return this.extractor.extractFromClaudeCommandSync(filePath);
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  /**
   * Search for skill in Codex CLI directory
   */
  private searchCodexSkills(commandName: string): CommandMetadata | null {
    const hasCanonicalCodexDir = fs.existsSync(path.join(this.workspacePath, '.agents/skills'));
    const hasLegacyCodexDir = fs.existsSync(path.join(this.workspacePath, '.system/skills'));
    if (!hasCanonicalCodexDir && !hasLegacyCodexDir) {
      return null;
    }

    for (const skillPath of this.getCodexSkillPathCandidates(commandName)) {
      if (!fs.existsSync(skillPath)) {
        continue;
      }

      try {
        return this.extractor.extractFromCodexSkillSync(skillPath);
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Search for prompt in Copilot Chat directory
   */
  private searchCopilotPrompts(commandName: string): CommandMetadata | null {
    const copilotDir = path.join(this.workspacePath, '.github/prompts');
    if (!fs.existsSync(copilotDir)) {
      return null;
    }

    for (const fileStem of this.getCommandFileStemCandidates(commandName)) {
      const filePath = path.join(copilotDir, `${fileStem}.prompt.md`);
      if (fs.existsSync(filePath)) {
        try {
          return this.extractor.extractFromCopilotPromptSync(filePath);
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  /**
   * Get all commands from Claude CLI directory
   */
  private getAllClaudeCommands(): CommandMetadata[] {
    const claudeDir = path.join(this.workspacePath, '.claude/commands');
    if (!fs.existsSync(claudeDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(claudeDir).filter((file) => file.endsWith('.md'));

      return files
        .map((file) => {
          try {
            const filePath = path.join(claudeDir, file);
            return this.extractor.extractFromClaudeCommandSync(filePath);
          } catch {
            return null;
          }
        })
        .filter((metadata): metadata is CommandMetadata => metadata !== null);
    } catch {
      return [];
    }
  }

  /**
   * Get all skills from Codex CLI directory
   */
  private getAllCodexSkills(): CommandMetadata[] {
    const codexRoots = [
      path.join(this.workspacePath, '.agents/skills'),
      path.join(this.workspacePath, '.agents/skills', 'gofer'),
      path.join(this.workspacePath, '.system/skills'),
      path.join(this.workspacePath, '.system/skills', 'gofer'),
    ];
    if (!codexRoots.some((codexRoot) => fs.existsSync(codexRoot))) {
      return [];
    }

    try {
      const skillPaths = new Set<string>();
      codexRoots.forEach((codexRoot) => this.collectCodexSkillPaths(codexRoot, skillPaths));

      const dedupedSkills = new Map<string, CommandMetadata>();
      for (const skillPath of Array.from(skillPaths)) {
        try {
          const metadata = this.extractor.extractFromCodexSkillSync(skillPath);
          if (!dedupedSkills.has(metadata.name)) {
            dedupedSkills.set(metadata.name, metadata);
          }
        } catch {
          // Ignore malformed legacy artifacts during discovery.
        }
      }

      return Array.from(dedupedSkills.values());
    } catch {
      return [];
    }
  }

  /**
   * Get all prompts from Copilot Chat directory
   */
  private getAllCopilotPrompts(): CommandMetadata[] {
    const copilotDir = path.join(this.workspacePath, '.github/prompts');
    if (!fs.existsSync(copilotDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(copilotDir).filter((file) => file.endsWith('.prompt.md'));

      return files
        .map((file) => {
          try {
            const filePath = path.join(copilotDir, file);
            return this.extractor.extractFromCopilotPromptSync(filePath);
          } catch {
            return null;
          }
        })
        .filter((metadata): metadata is CommandMetadata => metadata !== null);
    } catch {
      return [];
    }
  }

  private getCodexSkillPathCandidates(commandName: string): string[] {
    return this.getCommandFileStemCandidates(commandName).flatMap((fileStem) => [
      path.join(this.workspacePath, '.agents/skills', fileStem, 'SKILL.md'),
      path.join(this.workspacePath, '.agents/skills', 'gofer', fileStem, 'SKILL.md'),
      path.join(this.workspacePath, '.system/skills', fileStem, 'SKILL.md'),
      path.join(this.workspacePath, '.system/skills', 'gofer', fileStem, 'SKILL.md'),
    ]);
  }

  private collectCodexSkillPaths(parentDir: string, skillPaths: Set<string>): void {
    if (!fs.existsSync(parentDir)) {
      return;
    }

    const subdirs = fs.readdirSync(parentDir).filter((item) => {
      const itemPath = path.join(parentDir, item);
      return fs.statSync(itemPath).isDirectory();
    });

    for (const subdir of subdirs) {
      const skillPath = path.join(parentDir, subdir, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        skillPaths.add(skillPath);
      }
    }
  }
}
