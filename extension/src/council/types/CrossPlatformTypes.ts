/**
 * Cross-Platform Command Parity Types
 * Feature 028: Enable complete feature parity across Claude CLI, Codex CLI,
 * GitHub Copilot Chat, and Gemini CLI command files.
 */

/**
 * Supported AI platforms for Gofer commands
 */
export type PlatformType = 'claude' | 'copilot' | 'codex' | 'gemini';

/**
 * Platform detection context information
 */
export interface PlatformDetectionContext {
  /**
   * Detected platform (or 'auto' if not yet detected)
   */
  platform: PlatformType | 'auto';

  /**
   * Whether the platform was explicitly set by user (via gofer.defaultCLI)
   */
  isExplicit: boolean;

  /**
   * Whether the platform was auto-detected from environment
   */
  isAutoDetected: boolean;

  /**
   * VSCode extension host is running
   */
  isVSCodeExtension: boolean;

  /**
   * Claude CLI directory exists (.claude/commands/)
   */
  hasClaudeDirectory: boolean;

  /**
   * Copilot CLI directory exists (.github/prompts/)
   */
  hasCopilotDirectory: boolean;

  /**
   * Codex CLI directory exists (.agents/skills/, with .system/skills/ legacy fallback)
   */
  hasCodexDirectory: boolean;

  /**
   * Gemini command directory exists (.gemini/commands/gofer/)
   */
  hasGeminiDirectory: boolean;

  /**
   * Timestamp when detection was performed
   */
  detectedAt: Date;

  /**
   * Detection method used
   */
  detectionMethod: 'user-setting' | 'directory-check' | 'execution-context' | 'fallback';
}

/**
 * Command metadata extracted from platform-specific files
 */
export interface CommandMetadata {
  /**
   * Command name (without platform-specific prefix)
   */
  name: string;

  /**
   * Command description
   */
  description: string;

  /**
   * Platform this metadata was extracted from
   */
  platform: PlatformType;

  /**
   * File path where command is defined
   */
  filePath: string;

  /**
   * YAML frontmatter (raw)
   */
  frontmatter: Record<string, unknown>;

  /**
   * Command body content (markdown)
   */
  content: string;

  /**
   * Whether command supports auto-chaining
   */
  supportsAutoChain: boolean;

  /**
   * Whether command supports parallel agent spawning
   */
  supportsParallelAgents: boolean;

  /**
   * Invocation syntax for this command on this platform
   */
  invocationSyntax: CommandInvocationSyntax;

  /**
   * Timestamp when metadata was extracted
   */
  extractedAt: Date;
}

/**
 * Platform-specific command invocation syntax
 */
export interface CommandInvocationSyntax {
  /**
   * Platform this syntax applies to
   */
  platform: PlatformType;

  /**
   * Command prefix (Claude: "/", Copilot: "#", Codex: "/", Gemini: "/gofer:")
   */
  prefix: string;

  /**
   * Example invocation
   */
  example: string;

  /**
   * Full command pattern (regex-compatible)
   */
  pattern: string;

  /**
   * Whether arguments are supported
   */
  supportsArguments: boolean;

  /**
   * Argument format (if supported)
   */
  argumentFormat?: string;
}

/**
 * Command mapping across platforms
 */
export interface CommandMapping {
  /**
   * Canonical command name
   */
  commandName: string;

  /**
   * Claude CLI file path
   */
  claudePath?: string;

  /**
   * Copilot Chat file path
   */
  copilotPath?: string;

  /**
   * Codex CLI file path
   */
  codexPath?: string;

  /**
   * Gemini CLI command file path
   */
  geminiPath?: string;

  /**
   * Whether command is available on all platforms (100% parity)
   */
  hasFullParity: boolean;

  /**
   * Missing platforms (if not full parity)
   */
  missingPlatforms: PlatformType[];

  /**
   * Last sync timestamp
   */
  lastSynced?: Date;
}

/**
 * Platform capabilities matrix
 */
export interface PlatformCapabilities {
  /**
   * Platform identifier
   */
  platform: PlatformType;

  /**
   * Supports Task tool for parallel agent spawning
   */
  supportsTaskTool: boolean;

  /**
   * Supports auto-chaining between commands
   */
  supportsAutoChain: boolean;

  /**
   * Supports conversation history preservation
   */
  supportsHistoryPreservation: boolean;

  /**
   * Supports MCP (Model Context Protocol)
   */
  supportsMCP: boolean;

  /**
   * Maximum context window size (tokens)
   */
  maxContextWindow: number;

  /**
   * Command discovery method
   */
  discoveryMethod: 'directory-scan' | 'extension-api' | 'cli-list';

  /**
   * File format for commands
   */
  fileFormat: {
    extension: string;
    hasSubdirectories: boolean;
    yamlFrontmatter: boolean;
  };
}

/**
 * User settings for cross-platform command routing
 */
export interface UserSettings {
  /**
   * Default CLI platform (from gofer.defaultCLI)
   */
  defaultCLI: PlatformType | 'auto';

  /**
   * Whether to show platform detection notifications
   */
  showDetectionNotifications: boolean;

  /**
   * Whether to auto-sync commands across platforms
   */
  autoSyncCommands: boolean;

  /**
   * Preferred platform for autonomous mode
   */
  autonomousPlatform?: PlatformType;
}

/**
 * Conversation history entry for cross-platform preservation
 */
export interface ConversationHistoryEntry {
  /**
   * Message ID
   */
  id: string;

  /**
   * Platform where message originated
   */
  platform: PlatformType;

  /**
   * Message role (user, assistant, system)
   */
  role: 'user' | 'assistant' | 'system';

  /**
   * Message content
   */
  content: string;

  /**
   * Timestamp
   */
  timestamp: Date;

  /**
   * Command invoked (if applicable)
   */
  command?: string;

  /**
   * Metadata (platform-specific)
   */
  metadata?: Record<string, unknown>;
}

/**
 * Command routing decision
 */
export interface CommandRoutingDecision {
  /**
   * Command name
   */
  commandName: string;

  /**
   * Selected platform
   */
  selectedPlatform: PlatformType;

  /**
   * Routing reason
   */
  reason: 'user-preference' | 'auto-detection' | 'availability' | 'fallback';

  /**
   * File path to execute
   */
  filePath: string;

  /**
   * Invocation syntax to use
   */
  invocationSyntax: CommandInvocationSyntax;

  /**
   * Decision timestamp
   */
  decidedAt: Date;

  /**
   * Alternative platforms available
   */
  alternativePlatforms: PlatformType[];
}
