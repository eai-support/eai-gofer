/**
 * Platform Detector for Cross-Platform Command Parity
 * Feature 028: Detects which current semantic AI host is active.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from '../config';
import { CURRENT_SEMANTIC_HOSTS } from '../config/semanticHosts';
import { PlatformType, PlatformDetectionContext } from './types/CrossPlatformTypes';

/**
 * Detects which AI platform is currently active
 *
 * Detection priority:
 * 1. User setting (gofer.defaultCLI) if explicitly set
 * 2. Current host resource presence
 * 3. Execution context (VSCode extension host)
 * 4. Fallback to 'auto'
 */
export class PlatformDetector {
  private static instance: PlatformDetector | undefined;
  private cachedDetection: PlatformDetectionContext | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  private constructor(private workspacePath: string) {}

  /**
   * Get singleton instance
   */
  public static getInstance(workspacePath: string): PlatformDetector {
    if (!PlatformDetector.instance) {
      PlatformDetector.instance = new PlatformDetector(workspacePath);
    }
    return PlatformDetector.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  public static resetInstance(): void {
    PlatformDetector.instance = undefined;
  }

  /**
   * Detect which platform is currently active
   *
   * @returns Detected platform or 'auto' if undetermined
   */
  public detectPlatform(): PlatformType | 'auto' {
    // Check cache first
    if (this.cachedDetection && Date.now() < this.cacheExpiry) {
      return this.cachedDetection.platform;
    }

    const context = this.getDetectionContext();
    this.cachedDetection = context;
    this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;

    return context.platform;
  }

  /**
   * Check if a specific platform is available
   *
   * @param platform Platform to check
   * @returns True if platform directory exists
   */
  public isPlatformAvailable(platform: PlatformType): boolean {
    switch (platform) {
      case 'claude':
        return this.hasDirectory('.claude/commands');
      case 'copilot':
        return this.hasDirectory('.github/prompts');
      case 'codex':
        return this.hasAnyDirectory(['.agents/skills', '.system/skills']);
      case 'antigravity':
        return this.hasAnyDirectory(['.agents/skills', '.gemini/commands/gofer']);
      case 'grok':
        return this.hasDirectory('.grok/skills');
      case 'vscode':
        return true;
      default:
        return false;
    }
  }

  /**
   * Get default platform based on user setting and availability
   *
   * @returns Default platform to use
   */
  public getDefaultPlatform(): PlatformType | 'auto' {
    const config = ConfigManager.getInstance();
    const userPreference = config.getDefaultCLI();

    // If user explicitly set a platform, honor it
    if (userPreference !== 'auto') {
      return userPreference as PlatformType;
    }

    // Auto-detect based on directory presence
    for (const host of CURRENT_SEMANTIC_HOSTS) {
      if (host !== 'vscode' && this.isPlatformAvailable(host)) {
        return host;
      }
    }
    // This class only runs inside the VS Code extension host, so VS Code is the
    // final concrete surface when no repository-owned provider resources exist.
    return 'vscode';
  }

  /**
   * Get full detection context with all metadata
   *
   * @returns Complete detection context
   */
  public getDetectionContext(): PlatformDetectionContext {
    const config = ConfigManager.getInstance();
    const userSetting = config.getDefaultCLI();

    // Check directory availability
    const hasClaudeDirectory = this.hasDirectory('.claude/commands');
    const hasCopilotDirectory = this.hasDirectory('.github/prompts');
    const hasCodexDirectory = this.hasAnyDirectory(['.agents/skills', '.system/skills']);
    const hasAntigravityDirectory = this.hasAnyDirectory([
      '.agents/skills',
      '.gemini/commands/gofer',
    ]);
    const hasGrokDirectory = this.hasDirectory('.grok/skills');
    const hasVSCodeSurface = true;

    // Determine platform
    let platform: PlatformType | 'auto' = 'auto';
    let detectionMethod: 'user-setting' | 'directory-check' | 'execution-context' | 'fallback';
    let isExplicit = false;
    let isAutoDetected = false;

    if (userSetting !== 'auto') {
      // User explicitly set preference
      platform = userSetting as PlatformType;
      detectionMethod = 'user-setting';
      isExplicit = true;
    } else {
      // Auto-detect based on directory presence, then use the active extension
      // host as the final concrete fallback.
      isAutoDetected = true;

      const directoryPlatform = CURRENT_SEMANTIC_HOSTS.find(
        (host) => host !== 'vscode' && this.isPlatformAvailable(host)
      );
      if (directoryPlatform) {
        platform = directoryPlatform;
        detectionMethod = 'directory-check';
      } else if (hasVSCodeSurface) {
        platform = 'vscode';
        detectionMethod = 'execution-context';
      } else {
        platform = 'auto';
        detectionMethod = 'fallback';
      }
    }

    return {
      platform,
      isExplicit,
      isAutoDetected,
      isVSCodeExtension: true, // Always true in extension context
      hasClaudeDirectory,
      hasCopilotDirectory,
      hasCodexDirectory,
      hasAntigravityDirectory,
      hasGrokDirectory,
      hasVSCodeSurface,
      detectedAt: new Date(),
      detectionMethod,
    };
  }

  /**
   * Clear detection cache (force re-detection)
   */
  public clearCache(): void {
    this.cachedDetection = null;
    this.cacheExpiry = 0;
  }

  /**
   * Check if directory exists in workspace
   */
  private hasDirectory(relativePath: string): boolean {
    try {
      const fullPath = path.join(this.workspacePath, relativePath);
      // Use async methods if available in calling context, but this is a sync helper
      // Called from config-driven detection, not in async I/O paths
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
    } catch {
      return false;
    }
  }

  private hasAnyDirectory(relativePaths: readonly string[]): boolean {
    return relativePaths.some((relativePath) => this.hasDirectory(relativePath));
  }
}
