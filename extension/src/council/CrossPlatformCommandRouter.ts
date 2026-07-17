/**
 * Cross-Platform Command Router
 * Routes commands across Claude CLI, Codex CLI, GitHub Copilot Chat, and Gemini CLI
 * Feature 028: Cross-platform command parity
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathExistsSafe, readDirectorySafe } from './CommandFileAccess';
import { validateCommandName } from './CommandNameValidation';
import { PlatformDetector } from './PlatformDetector';
import { DefaultSkillDirectoryManager } from './SkillDirectoryManager';
import { CommandMetadataExtractor } from './CommandMetadataExtractor';
import { CommandMetadata, PlatformType } from './types/CrossPlatformTypes';
import {
  isWorkflowProfileCompatible,
  selectGuidanceForWorkflowProfile,
} from './WorkflowProfileGuidance';
import { type WorkflowProfile, getWorkflowProfile } from '../config/workflowProfile';
import { Logger } from '../utils/logger';

/**
 * Command routing result
 */
export interface CommandRoutingResult {
  commandName: string;
  platform: PlatformType;
  filePath: string;
  metadata: CommandMetadata;
  syntax: string;
  isAvailable: boolean;
  workflowProfile: WorkflowProfile;
  profileMatched: boolean;
}

interface CommandSelectionResult {
  metadata: CommandMetadata;
  platform: PlatformType;
  profileMatched: boolean;
}

/**
 * Routes commands across different AI platforms with priority fallback
 *
 * Priority: .claude/commands/ > .agents/skills/ (with legacy .system fallback)
 * > .gemini/commands/gofer/ > .github/prompts/
 *
 * Security: Validates all paths to prevent directory traversal attacks
 */
export class CrossPlatformCommandRouter {
  private platformDetector: PlatformDetector;
  private skillDirectoryManager: DefaultSkillDirectoryManager;
  private metadataExtractor: CommandMetadataExtractor;
  private routingCache: Map<string, CommandRoutingResult>;
  private cacheExpiry: number;
  private readonly CACHE_TTL_MS = 60000; // 1 minute
  private readonly logger = Logger.for('CrossPlatformCommandRouter');
  private readonly logWarning = (message: string, metadata: Record<string, unknown>): void =>
    this.logger.warn(message, metadata);

  constructor(private workspacePath: string) {
    this.platformDetector = PlatformDetector.getInstance(workspacePath);
    this.skillDirectoryManager = new DefaultSkillDirectoryManager(workspacePath);
    this.metadataExtractor = new CommandMetadataExtractor();
    this.routingCache = new Map();
    this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;
  }

  private toCommandFileStem(commandName: string): string {
    return commandName.replace(/:/g, '_').replace(/-/g, '_');
  }

  private getCommandFileStemCandidates(commandName: string): string[] {
    const safeStem = this.toCommandFileStem(commandName);
    return safeStem === commandName ? [commandName] : [safeStem, commandName];
  }

  /**
   * Route a command to the appropriate platform-specific file
   *
   * @param commandName Command to route (e.g., "1_gofer_research")
   * @param targetPlatform Optional platform override
   * @returns Routing result with file path and metadata
   * @throws Error if command not found or path validation fails
   */
  public async routeCommand(
    commandName: string,
    targetPlatform?: PlatformType,
    workflowProfile?: WorkflowProfile
  ): Promise<CommandRoutingResult> {
    validateCommandName(commandName);
    const resolvedWorkflowProfile = this.resolveWorkflowProfile(workflowProfile);
    const cacheKey = `${commandName}:${targetPlatform || 'auto'}:${resolvedWorkflowProfile}`;
    const cachedResult = this.getCachedResult(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const searchOrder = targetPlatform
      ? [targetPlatform]
      : this.getPlatformSearchOrder(this.platformDetector.getDefaultPlatform());

    this.logger.debug('Routing command', {
      commandName,
      searchOrder,
      targetPlatform,
      workflowProfile: resolvedWorkflowProfile,
    });

    const selection = await this.selectCommandMetadata(
      commandName,
      searchOrder,
      resolvedWorkflowProfile,
      targetPlatform
    );
    const result = this.buildRoutingResult(commandName, selection, resolvedWorkflowProfile);
    this.routingCache.set(cacheKey, result);
    return result;
  }

  /**
   * Load skill content for a specific platform
   *
   * @param commandName Command to load
   * @param platform Target platform
   * @returns Full command file content
   */
  public async loadSkillForPlatform(
    commandName: string,
    platform: PlatformType,
    workflowProfile?: WorkflowProfile
  ): Promise<string> {
    const commandPath = await this.getCommandPathAsync(commandName, platform);
    const exists = await pathExistsSafe(commandPath, 'loadSkillForPlatform', this.logWarning);
    if (!exists) {
      throw new Error(`Command "${commandName}" not found for platform "${platform}"`);
    }

    const resolvedWorkflowProfile = this.resolveWorkflowProfile(workflowProfile);
    const content = await fs.promises.readFile(commandPath, 'utf8');
    return selectGuidanceForWorkflowProfile(content, resolvedWorkflowProfile);
  }

  /**
   * Detect the active platform
   *
   * @returns Detected platform type
   */
  public detectPlatform(): PlatformType | 'auto' {
    return this.platformDetector.detectPlatform();
  }

  /**
   * Get the file path for a command on a specific platform
   *
   * @param commandName Command name
   * @param platform Target platform
   * @returns Absolute file path
   */
  public getCommandPath(commandName: string, platform: PlatformType): string {
    validateCommandName(commandName);
    return this.resolveExistingCommandPath(this.getCommandPathCandidates(commandName, platform));
  }

  /**
   * List all available commands across all platforms
   *
   * @returns Array of command names
   */
  public async listCommands(): Promise<string[]> {
    const commands = new Set<string>();

    // Scan Claude commands
    const claudeDir = path.join(this.workspacePath, '.claude', 'commands');
    const claudeFiles = await readDirectorySafe(claudeDir, 'listCommands.claude', this.logWarning);
    const claudeMetadata = await Promise.all(
      claudeFiles
        .filter((file) => file.endsWith('.md'))
        .map(async (file) => {
          try {
            return await this.metadataExtractor.extractFromClaudeCommand(
              path.join(claudeDir, file)
            );
          } catch {
            return null;
          }
        })
    );
    claudeMetadata.filter(Boolean).forEach((metadata) => commands.add(metadata!.name));

    // Scan Codex skills
    const codexNames = await this.listCodexCommandNames();
    codexNames.forEach((name) => commands.add(name));

    // Scan Copilot prompts
    const copilotDir = path.join(this.workspacePath, '.github', 'prompts');
    const copilotFiles = await readDirectorySafe(
      copilotDir,
      'listCommands.copilot',
      this.logWarning
    );
    const copilotMetadata = await Promise.all(
      copilotFiles
        .filter((file) => file.endsWith('.prompt.md'))
        .map(async (file) => {
          try {
            return await this.metadataExtractor.extractFromCopilotPrompt(
              path.join(copilotDir, file)
            );
          } catch {
            return null;
          }
        })
    );
    copilotMetadata.filter(Boolean).forEach((metadata) => commands.add(metadata!.name));

    // Scan Gemini command TOML files
    const geminiDir = path.join(this.workspacePath, '.gemini', 'commands', 'gofer');
    const geminiFiles = await readDirectorySafe(geminiDir, 'listCommands.gemini', this.logWarning);
    const geminiMetadata = await Promise.all(
      geminiFiles
        .filter((file) => file.endsWith('.toml'))
        .map(async (file) => {
          try {
            return await this.metadataExtractor.extractFromGeminiCommand(
              path.join(geminiDir, file)
            );
          } catch {
            return null;
          }
        })
    );
    geminiMetadata.filter(Boolean).forEach((metadata) => commands.add(metadata!.name));

    return Array.from(commands).sort();
  }

  /**
   * Check if a command is available on any platform
   *
   * @param commandName Command to check
   * @returns True if command exists
   */
  public isCommandAvailable(commandName: string): boolean {
    try {
      validateCommandName(commandName);
      const metadata = this.skillDirectoryManager.findCommand(commandName);
      return metadata !== null;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid command name')) {
        this.logger.debug('Command rejected during availability check', {
          commandName,
          reason: error.message,
        });
        return false;
      }

      this.logger.warn('Failed to determine command availability', {
        commandName,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get the invocation syntax for a command on a platform
   *
   * @param commandName Command name
   * @param platform Target platform
   * @returns Invocation syntax (e.g., "/1_gofer_research" or "#1_gofer_research")
   */
  public getCommandSyntax(commandName: string, platform: PlatformType): string {
    const publicEntrypoints = new Set(['gofer', 'eai-gofer']);
    const geminiCommand =
      publicEntrypoints.has(commandName) || commandName.startsWith('gofer:')
        ? commandName
        : `gofer:${commandName}`;
    const syntaxMap: Record<PlatformType, string> = {
      claude: `/${commandName}`,
      codex: `/${commandName}`,
      copilot: `#${commandName}`,
      gemini: `/${geminiCommand}`,
    };

    return syntaxMap[platform];
  }

  /**
   * Clear routing cache (called on settings change)
   */
  public clearCache(): void {
    this.routingCache.clear();
    this.platformDetector.clearCache();
    this.skillDirectoryManager.clearCache();
    this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() < this.cacheExpiry;
  }

  private getPlatformSearchOrder(preferred: PlatformType | 'auto'): PlatformType[] {
    const defaultPriority: PlatformType[] = ['claude', 'codex', 'gemini', 'copilot'];
    if (preferred === 'auto') {
      return defaultPriority;
    }
    return [preferred, ...defaultPriority.filter((platform) => platform !== preferred)];
  }

  private getCachedResult(cacheKey: string): CommandRoutingResult | null {
    if (!this.isCacheValid()) {
      return null;
    }
    return this.routingCache.get(cacheKey) ?? null;
  }

  private async selectCommandMetadata(
    commandName: string,
    searchOrder: readonly PlatformType[],
    workflowProfile: WorkflowProfile,
    targetPlatform?: PlatformType
  ): Promise<CommandSelectionResult> {
    let fallbackSelection: CommandSelectionResult | null = null;

    for (const platform of searchOrder) {
      const candidateMetadata = await this.getMetadataForPlatform(commandName, platform);
      if (!candidateMetadata) {
        continue;
      }

      if (isWorkflowProfileCompatible(candidateMetadata.frontmatter, workflowProfile)) {
        this.logger.debug('Platform selected', {
          commandName,
          selectedPlatform: platform,
          workflowProfile,
          reason: targetPlatform ? 'explicit' : 'priority-fallback',
        });
        return {
          metadata: candidateMetadata,
          platform,
          profileMatched: true,
        };
      }

      if (!fallbackSelection) {
        fallbackSelection = {
          metadata: candidateMetadata,
          platform,
          profileMatched: false,
        };
      }
    }

    if (fallbackSelection) {
      this.logger.warn('Profile-scoped guidance unavailable, using compatibility fallback', {
        commandName,
        workflowProfile,
        selectedPlatform: fallbackSelection.platform,
      });
      return fallbackSelection;
    }

    this.logger.debug('Command not found', {
      commandName,
      targetPlatform,
      workflowProfile,
    });
    if (targetPlatform) {
      throw new Error(`Command "${commandName}" not found for platform "${targetPlatform}"`);
    }
    throw new Error(`Command "${commandName}" not found in any platform directory`);
  }

  private buildRoutingResult(
    commandName: string,
    selection: CommandSelectionResult,
    workflowProfile: WorkflowProfile
  ): CommandRoutingResult {
    return {
      commandName,
      platform: selection.platform,
      filePath: selection.metadata.filePath,
      metadata: selection.metadata,
      syntax: this.getCommandSyntax(commandName, selection.platform),
      isAvailable: true,
      workflowProfile,
      profileMatched: selection.profileMatched,
    };
  }

  private async getMetadataForPlatform(
    commandName: string,
    platform: PlatformType
  ): Promise<CommandMetadata | null> {
    const commandPath = await this.getCommandPathAsync(commandName, platform);
    const exists = await pathExistsSafe(commandPath, 'getMetadataForPlatform', this.logWarning);
    if (!exists) {
      return null;
    }

    try {
      if (platform === 'claude') {
        return await this.metadataExtractor.extractFromClaudeCommand(commandPath);
      }
      if (platform === 'codex') {
        return await this.metadataExtractor.extractFromCodexSkill(commandPath);
      }
      if (platform === 'gemini') {
        return await this.metadataExtractor.extractFromGeminiCommand(commandPath);
      }
      return await this.metadataExtractor.extractFromCopilotPrompt(commandPath);
    } catch (error) {
      this.logger.warn('Failed to extract command metadata', {
        commandName,
        platform,
        commandPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private resolveWorkflowProfile(workflowProfile?: WorkflowProfile): WorkflowProfile {
    if (workflowProfile) {
      return workflowProfile;
    }

    try {
      return getWorkflowProfile();
    } catch (error) {
      this.logger.warn(
        'Falling back to enterpriseai workflow profile after configuration read failure',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return 'enterpriseai';
    }
  }

  private getCommandPathCandidates(commandName: string, platform: PlatformType): string[] {
    if (platform === 'codex') {
      return this.getCodexCommandPathCandidates(commandName);
    }

    return this.getCommandFileStemCandidates(commandName).map((fileStem) => {
      const platformPaths: Record<Exclude<PlatformType, 'codex'>, string> = {
        claude: path.join(this.workspacePath, '.claude', 'commands', `${fileStem}.md`),
        copilot: path.join(this.workspacePath, '.github', 'prompts', `${fileStem}.prompt.md`),
        gemini: path.join(this.workspacePath, '.gemini', 'commands', 'gofer', `${fileStem}.toml`),
      };

      return platformPaths[platform];
    });
  }

  private async getCommandPathAsync(commandName: string, platform: PlatformType): Promise<string> {
    validateCommandName(commandName);
    return this.resolveExistingCommandPathAsync(
      this.getCommandPathCandidates(commandName, platform)
    );
  }

  private getCodexCommandPathCandidates(commandName: string): string[] {
    return this.getCommandFileStemCandidates(commandName).flatMap((fileStem) => [
      path.join(this.workspacePath, '.agents', 'skills', fileStem, 'SKILL.md'),
      path.join(this.workspacePath, '.agents', 'skills', 'gofer', fileStem, 'SKILL.md'),
      path.join(this.workspacePath, '.system', 'skills', fileStem, 'SKILL.md'),
      path.join(this.workspacePath, '.system', 'skills', 'gofer', fileStem, 'SKILL.md'),
    ]);
  }

  private resolveExistingCommandPath(candidates: string[]): string {
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return candidates[0];
  }

  private async resolveExistingCommandPathAsync(candidates: string[]): Promise<string> {
    for (const candidate of candidates) {
      const exists = await pathExistsSafe(
        candidate,
        'resolveExistingCommandPathAsync',
        this.logWarning
      );
      if (exists) {
        return candidate;
      }
    }

    return candidates[0];
  }

  private async listCodexCommandNames(): Promise<string[]> {
    const commandNames = new Set<string>();
    const codexRoots = [
      path.join(this.workspacePath, '.agents', 'skills'),
      path.join(this.workspacePath, '.agents', 'skills', 'gofer'),
      path.join(this.workspacePath, '.system', 'skills'),
      path.join(this.workspacePath, '.system', 'skills', 'gofer'),
    ];

    for (const codexRoot of codexRoots) {
      const rootEntries = await readDirectorySafe(
        codexRoot,
        `listCommands.codex.${path.relative(this.workspacePath, codexRoot) || 'root'}`,
        this.logWarning
      );
      const rootChecks = await Promise.all(
        rootEntries
          .filter((entry) => !entry.endsWith('.md'))
          .map(async (entry) => {
            const skillPath = path.join(codexRoot, entry, 'SKILL.md');
            const exists = await pathExistsSafe(
              skillPath,
              'listCommands.codexSkill',
              this.logWarning
            );
            if (!exists) {
              return null;
            }

            try {
              const metadata = await this.metadataExtractor.extractFromCodexSkill(skillPath);
              return metadata.name;
            } catch {
              return null;
            }
          })
      );
      rootChecks.filter(Boolean).forEach((entry) => commandNames.add(entry as string));
    }

    return Array.from(commandNames).sort();
  }
}
