/**
 * Command Metadata Extractor for Cross-Platform Command Parity
 * Feature 028: Extracts metadata from platform-specific command files
 */

import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as yaml from 'js-yaml';
import { PlatformType, CommandMetadata, CommandInvocationSyntax } from './types/CrossPlatformTypes';

/**
 * Extracts command metadata from platform-specific files
 *
 * Supports:
 * - Claude CLI (.claude/commands)
 * - Copilot Chat (.github/prompts)
 * - Codex CLI (.agents/skills, with .system/skills legacy fallback)
 * - Gemini CLI (.gemini/commands/gofer)
 */
export class CommandMetadataExtractor {
  /**
   * Extract metadata from a Claude CLI command file (async version)
   */
  public async extractFromClaudeCommand(filePath: string): Promise<CommandMetadata> {
    const content = await fsPromises.readFile(filePath, 'utf8');
    return this.parseClaudeCommandContent(content, filePath);
  }

  /**
   * Extract metadata from a Claude CLI command file (sync version)
   * Note: Prefer async version when possible to avoid blocking event loop
   */
  public extractFromClaudeCommandSync(filePath: string): CommandMetadata {
    const content = fs.readFileSync(filePath, 'utf8');
    return this.parseClaudeCommandContent(content, filePath);
  }

  private parseClaudeCommandContent(content: string, filePath: string): CommandMetadata {
    const { frontmatter, body } = this.parseMarkdownWithFrontmatter(content);

    const name = this.extractCommandNameFromPath(filePath, '.md');
    const description =
      (frontmatter.description as string) || this.extractDescriptionFromBody(body);

    const supportsAutoChain = body.includes('AUTO-CHAIN') || body.includes('Skill tool');
    const supportsParallelAgents =
      body.includes('Task tool') ||
      body.includes('Task: subagent_type=') ||
      body.includes('parallel agents');

    return {
      name,
      description,
      platform: 'claude',
      filePath,
      frontmatter,
      content: body,
      supportsAutoChain,
      supportsParallelAgents,
      invocationSyntax: this.getInvocationSyntax('claude', name),
      extractedAt: new Date(),
    };
  }

  /**
   * Extract metadata from a Copilot Chat prompt file (async version)
   */
  public async extractFromCopilotPrompt(filePath: string): Promise<CommandMetadata> {
    const content = await fsPromises.readFile(filePath, 'utf8');
    return this.parseCopilotPromptContent(content, filePath);
  }

  /**
   * Extract metadata from a Copilot Chat prompt file (sync version)
   * Note: Prefer async version when possible to avoid blocking event loop
   */
  public extractFromCopilotPromptSync(filePath: string): CommandMetadata {
    const content = fs.readFileSync(filePath, 'utf8');
    return this.parseCopilotPromptContent(content, filePath);
  }

  private parseCopilotPromptContent(content: string, filePath: string): CommandMetadata {
    const { frontmatter, body } = this.parseMarkdownWithFrontmatter(content);

    const name = this.extractCommandNameFromPath(filePath, '.prompt.md');
    const description = (frontmatter.description as string) || name;

    const supportsAutoChain =
      body.includes('Next Command:') || body.includes('continue the pipeline');
    const supportsParallelAgents =
      body.includes('@agent spawn') ||
      body.includes('Multi-Agent Delegation') ||
      body.includes('delegation syntax');

    return {
      name,
      description,
      platform: 'copilot',
      filePath,
      frontmatter,
      content: body,
      supportsAutoChain,
      supportsParallelAgents,
      invocationSyntax: this.getInvocationSyntax('copilot', name),
      extractedAt: new Date(),
    };
  }

  /**
   * Extract metadata from a Codex CLI skill file (async version)
   */
  public async extractFromCodexSkill(filePath: string): Promise<CommandMetadata> {
    const content = await fsPromises.readFile(filePath, 'utf8');
    return this.parseCodexSkillContent(content, filePath);
  }

  /**
   * Extract metadata from a Codex CLI skill file (sync version)
   * Note: Prefer async version when possible to avoid blocking event loop
   */
  public extractFromCodexSkillSync(filePath: string): CommandMetadata {
    const content = fs.readFileSync(filePath, 'utf8');
    return this.parseCodexSkillContent(content, filePath);
  }

  private parseCodexSkillContent(content: string, filePath: string): CommandMetadata {
    const { frontmatter, body } = this.parseMarkdownWithFrontmatter(content);

    const rawName = (frontmatter.name as string) || 'unknown';
    const name = rawName.startsWith('gofer/') ? rawName.slice('gofer/'.length) : rawName;
    const description = (frontmatter.description as string) || name;

    const supportsAutoChain =
      body.includes('Next Steps') ||
      body.includes('To continue the pipeline') ||
      body.includes('Run:');
    const supportsParallelAgents =
      body.includes('Multi-Perspective Analysis') ||
      body.includes('parallel perspectives') ||
      body.includes('separate Codex CLI sessions');

    return {
      name,
      description,
      platform: 'codex',
      filePath,
      frontmatter,
      content: body,
      supportsAutoChain,
      supportsParallelAgents,
      invocationSyntax: this.getInvocationSyntax('codex', name),
      extractedAt: new Date(),
    };
  }

  /**
   * Extract metadata from a Gemini CLI command TOML file (async version)
   */
  public async extractFromGeminiCommand(filePath: string): Promise<CommandMetadata> {
    const content = await fsPromises.readFile(filePath, 'utf8');
    return this.parseGeminiCommandContent(content, filePath);
  }

  /**
   * Extract metadata from a Gemini CLI command TOML file (sync version)
   * Note: Prefer async version when possible to avoid blocking event loop
   */
  public extractFromGeminiCommandSync(filePath: string): CommandMetadata {
    const content = fs.readFileSync(filePath, 'utf8');
    return this.parseGeminiCommandContent(content, filePath);
  }

  private parseGeminiCommandContent(content: string, filePath: string): CommandMetadata {
    const frontmatter = this.parseSimpleToml(content);
    const name = this.extractCommandNameFromPath(filePath, '.toml');
    const description = (frontmatter.description as string) || name;
    const prompt = (frontmatter.prompt as string) || content;

    const supportsAutoChain =
      prompt.includes('Next Command:') ||
      prompt.includes('continue the pipeline') ||
      content.includes('AUTO-CHAIN');
    const supportsParallelAgents =
      prompt.includes('parallel') ||
      prompt.includes('Multi-Agent Delegation') ||
      content.includes('parallel agents');

    return {
      name,
      description,
      platform: 'gemini',
      filePath,
      frontmatter,
      content,
      supportsAutoChain,
      supportsParallelAgents,
      invocationSyntax: this.getInvocationSyntax('gemini', name),
      extractedAt: new Date(),
    };
  }

  /**
   * Validate command invocation syntax for a platform
   */
  public validateInvocationSyntax(invocation: string, platform: PlatformType): boolean {
    const syntaxPatterns: Record<PlatformType, RegExp> = {
      claude: /^\/[^\s]+(?:\s+.*)?$/,
      copilot: /^#[^\s]+(?:\s+.*)?$/,
      codex: /^\/[^\s]+(?:\s+.*)?$/,
      gemini: /^\/gofer:[^\s]+(?:\s+.*)?$/,
    };

    return syntaxPatterns[platform].test(invocation);
  }

  /**
   * Parse markdown file with YAML frontmatter
   */
  private parseMarkdownWithFrontmatter(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (match) {
      const yamlContent = match[1];
      const body = match[2];

      try {
        const frontmatter = yaml.load(yamlContent) as Record<string, unknown>;
        return { frontmatter: frontmatter || {}, body };
      } catch {
        return { frontmatter: {}, body: content };
      }
    }

    return { frontmatter: {}, body: content };
  }

  /**
   * Extract command name from file path
   */
  private extractCommandNameFromPath(filePath: string, extension: string): string {
    const filename = filePath.split(/[\\/]/).pop() || '';
    const fileStem = filename.replace(extension, '');
    return this.normalizeCommandName(fileStem);
  }

  private normalizeCommandName(fileStem: string): string {
    if (fileStem.includes(':')) {
      return fileStem;
    }

    if (fileStem === 'gofer_constitution' || fileStem === 'gofer_hydrate') {
      return fileStem;
    }

    if (fileStem.startsWith('gofer_')) {
      return `gofer:${fileStem.slice('gofer_'.length).replace(/_/g, '-')}`;
    }

    return fileStem;
  }

  /**
   * Extract description from markdown body
   */
  private extractDescriptionFromBody(body: string): string {
    const h1Match = body.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1];
    }

    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
        return trimmed;
      }
    }

    return 'No description available';
  }

  private parseSimpleToml(content: string): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    const stringFieldPattern = /^([A-Za-z0-9_-]+)\s*=\s*"((?:\\"|[^"])*)"\s*$/;

    for (const line of content.split(/\r?\n/)) {
      const match = line.trim().match(stringFieldPattern);
      if (match) {
        values[match[1]] = match[2].replace(/\\"/g, '"');
      }
    }

    return values;
  }

  /**
   * Get invocation syntax for a platform and command
   */
  private getInvocationSyntax(
    platform: PlatformType,
    commandName: string
  ): CommandInvocationSyntax {
    if (platform === 'claude') {
      return {
        platform: 'claude',
        prefix: '/',
        example: '/' + commandName,
        pattern: '^/' + commandName + '(\\s+.*)?$',
        supportsArguments: true,
        argumentFormat: 'space-separated after command',
      };
    }

    if (platform === 'copilot') {
      return {
        platform: 'copilot',
        prefix: '#',
        example: '#' + commandName,
        pattern: '^#' + commandName + '(\\s+.*)?$',
        supportsArguments: true,
        argumentFormat: 'space-separated after command',
      };
    }

    if (platform === 'codex') {
      return {
        platform: 'codex',
        prefix: '/',
        example: '/' + commandName,
        pattern: '^/' + commandName + '(\\s+.*)?$',
        supportsArguments: true,
        argumentFormat: 'space-separated after command',
      };
    }

    if (platform === 'gemini') {
      const geminiCommand = commandName.startsWith('gofer:') ? commandName : `gofer:${commandName}`;
      return {
        platform: 'gemini',
        prefix: '/gofer:',
        example: '/' + geminiCommand,
        pattern: '^/' + geminiCommand + '(\\s+.*)?$',
        supportsArguments: true,
        argumentFormat: 'space-separated after command',
      };
    }

    throw new Error('Unknown platform: ' + platform);
  }
}
