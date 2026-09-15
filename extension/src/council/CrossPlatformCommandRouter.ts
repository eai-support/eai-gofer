/**
 * Cross-Platform Command Router
 * Routes commands across the six current semantic AI host surfaces.
 * Feature 028: Cross-platform command parity
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Disposable } from 'vscode';
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
import { CURRENT_SEMANTIC_HOSTS, SEMANTIC_HOST_INVOCATION_PREFIX } from '../config/semanticHosts';

const PUBLIC_ENTRYPOINTS = new Set(['eai', 'eai-update']);
const RETIRED_PUBLIC_ENTRYPOINTS = new Set(['gofer']);

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
 * Priority follows the canonical six-host semantic contract. Legacy
 * `.gemini/**` files are accepted only as an Antigravity compatibility fallback.
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
    if (RETIRED_PUBLIC_ENTRYPOINTS.has(commandName)) {
      throw new Error(`Command "${commandName}" has been retired. Use "eai" instead.`);
    }
    const resolvedWorkflowProfile = this.resolveWorkflowProfile(workflowProfile);
    const cacheKey = `${commandName}:${targetPlatform || 'auto'}:${resolvedWorkflowProfile}`;
    const cachedResult = this.getCachedResult(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const detectionContext = targetPlatform ? null : this.platformDetector.getDetectionContext();
    const detectedPreference =
      detectionContext?.detectionMethod === 'execution-context' ||
      detectionContext?.detectionMethod === 'fallback'
        ? 'auto'
        : (detectionContext?.platform ?? 'auto');
    const searchOrder = targetPlatform
      ? [targetPlatform]
      : this.getPlatformSearchOrder(detectedPreference);

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

    // Scan legacy Gemini-format command files as Antigravity compatibility input.
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

    // Scan Grok Build skills. This must work even when Grok is the only
    // provisioned command surface in the workspace.
    const grokNames = await this.listGrokCommandNames();
    grokNames.forEach((name) => commands.add(name));

    return Array.from(commands)
      .filter((commandName) => PUBLIC_ENTRYPOINTS.has(commandName))
      .sort();
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
      if (RETIRED_PUBLIC_ENTRYPOINTS.has(commandName)) {
        return false;
      }
      const metadata = this.skillDirectoryManager.findCommand(commandName);
      return metadata !== null && PUBLIC_ENTRYPOINTS.has(commandName);
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
   * @returns Invocation syntax (for example, "/1_gofer_research")
   */
  public getCommandSyntax(commandName: string, platform: PlatformType): string {
    return `${SEMANTIC_HOST_INVOCATION_PREFIX[platform]}${commandName}`;
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
   * Watch every command surface and invalidate both discovery and routing
   * caches when a file changes.
   */
  public watchDirectories(callback: () => void = (): void => undefined): Disposable {
    return this.skillDirectoryManager.watchDirectories(() => {
      this.clearCache();
      callback();
    });
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() < this.cacheExpiry;
  }

  private getPlatformSearchOrder(preferred: PlatformType | 'auto'): PlatformType[] {
    const defaultPriority: PlatformType[] = [...CURRENT_SEMANTIC_HOSTS];
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
      let metadata: CommandMetadata;
      if (platform === 'claude') {
        metadata = await this.metadataExtractor.extractFromClaudeCommand(commandPath);
      } else if (commandPath.endsWith('.toml')) {
        metadata = await this.metadataExtractor.extractFromGeminiCommand(commandPath);
      } else if (platform === 'codex' || platform === 'antigravity' || platform === 'grok') {
        metadata = await this.metadataExtractor.extractFromSkill(commandPath, platform);
      } else {
        metadata = await this.metadataExtractor.extractFromCopilotPrompt(commandPath);
      }
      return this.withSemanticPlatform(metadata, platform);
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

    if (platform === 'antigravity') {
      return [
        ...this.getCurrentSkillPathCandidates(commandName),
        ...this.getLegacyGeminiCommandPathCandidates(commandName),
      ];
    }

    if (platform === 'grok') {
      return this.getCommandFileStemCandidates(commandName).map((fileStem) =>
        path.join(this.workspacePath, '.grok', 'skills', fileStem, 'SKILL.md')
      );
    }

    return this.getCommandFileStemCandidates(commandName).map((fileStem) => {
      const platformPaths: Record<'claude' | 'copilot' | 'vscode', string> = {
        claude: path.join(this.workspacePath, '.claude', 'commands', `${fileStem}.md`),
        copilot: path.join(this.workspacePath, '.github', 'prompts', `${fileStem}.prompt.md`),
        vscode: path.join(this.workspacePath, '.github', 'prompts', `${fileStem}.prompt.md`),
      };

      return platformPaths[platform as 'claude' | 'copilot' | 'vscode'];
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

  private getCurrentSkillPathCandidates(commandName: string): string[] {
    return this.getCommandFileStemCandidates(commandName).flatMap((fileStem) => [
      path.join(this.workspacePath, '.agents', 'skills', fileStem, 'SKILL.md'),
      path.join(this.workspacePath, '.agents', 'skills', 'gofer', fileStem, 'SKILL.md'),
    ]);
  }

  private getLegacyGeminiCommandPathCandidates(commandName: string): string[] {
    return this.getCommandFileStemCandidates(commandName).map((fileStem) =>
      path.join(this.workspacePath, '.gemini', 'commands', 'gofer', `${fileStem}.toml`)
    );
  }

  private withSemanticPlatform(metadata: CommandMetadata, platform: PlatformType): CommandMetadata {
    const example = this.getCommandSyntax(metadata.name, platform);
    const escapedExample = example.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      ...metadata,
      platform,
      invocationSyntax: {
        ...metadata.invocationSyntax,
        platform,
        prefix: this.getCommandSyntax('', platform),
        example,
        pattern: `^${escapedExample}(\\s+.*)?$`,
      },
    };
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

  private async listGrokCommandNames(): Promise<string[]> {
    const grokRoot = path.join(this.workspacePath, '.grok', 'skills');
    const rootEntries = await readDirectorySafe(grokRoot, 'listCommands.grok', this.logWarning);
    const commandNames = await Promise.all(
      rootEntries.map(async (entry) => {
        const skillPath = path.join(grokRoot, entry, 'SKILL.md');
        if (!(await pathExistsSafe(skillPath, 'listCommands.grokSkill', this.logWarning))) {
          return null;
        }

        try {
          const metadata = await this.metadataExtractor.extractFromSkill(skillPath, 'grok');
          return metadata.name;
        } catch {
          return null;
        }
      })
    );

    return commandNames.filter((name): name is string => name !== null).sort();
  }
}
