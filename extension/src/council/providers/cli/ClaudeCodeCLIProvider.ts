/**
 * Claude Code CLI Provider (T021)
 *
 * Extends CLIProviderAdapter with Claude-specific implementation.
 * Handles `claude` command execution and output parsing.
 *
 * @see .specify/specs/027-multi-provider-cli-support/data-model.md Section 1.7
 * @see .specify/specs/027-multi-provider-cli-support/contracts/internal-api.md Section 2
 */

import { CLIProviderAdapter, ParsedCLIOutput } from './CLIProviderAdapter';
import { ClaudeOutputParser } from './ClaudeOutputParser';
import {
  HOST_DEFAULT_MODEL,
  ProviderId,
  QueryRequest,
  type CLIModelCatalogResolver,
} from '../../types';
import { registerProvider } from '../ProviderFactory';
import { assertCLIModelOverride } from './CLIModelSelection';
import { discoverCLIModels } from './CLIModelDiscovery';

/**
 * Claude Code CLI provider implementation
 * Wraps `claude` command-line tool
 */
export class ClaudeCodeCLIProvider extends CLIProviderAdapter {
  readonly id: ProviderId = 'claude-cli';
  readonly name = 'Claude Code CLI';
  readonly model: string;
  private outputParser: ClaudeOutputParser;

  /**
   * Constructor
   * @param cliCommand - Command to execute (default: 'claude')
   * @param modelOverride - Explicit model only; omission retains the host's native default
   * @param discoverModels - Live account-scoped discovery required for explicit overrides
   */
  constructor(
    cliCommand: string = 'claude',
    private readonly modelOverride?: string,
    private readonly discoverModels: CLIModelCatalogResolver = discoverCLIModels
  ) {
    super(cliCommand, modelOverride ?? HOST_DEFAULT_MODEL);
    this.model = modelOverride ?? HOST_DEFAULT_MODEL;
    this.outputParser = new ClaudeOutputParser();
  }

  /**
   * Get CLI command to execute
   * @returns CLI command path or name
   */
  getCLICommand(): string {
    return this.cliCommand;
  }

  /**
   * Parse Claude CLI output using ClaudeOutputParser
   * @param output - Raw stdout from Claude CLI
   * @returns Parsed content and usage
   */
  parseOutput(output: string): ParsedCLIOutput {
    return this.outputParser.parse(output);
  }

  /**
   * Format prompt for Claude CLI
   * Claude CLI accepts direct text prompts
   *
   * @param request - Query request with prompt and options
   * @returns Formatted prompt string
   */
  formatPrompt(request: QueryRequest): string {
    // If system prompt provided, prepend it
    if (request.systemPrompt) {
      return `${request.systemPrompt}\n\n${request.prompt}`;
    }
    return request.prompt;
  }

  /**
   * Build CLI arguments for Claude
   * @param prompt - Formatted prompt
   * @returns Array of CLI arguments
   */
  protected buildCLIArgs(prompt: string): string[] {
    const args = ['--print'];
    if (this.modelOverride !== undefined) {
      args.push('--model', this.modelOverride);
    }
    // Print mode accepts a positional prompt; do not interpret its contents as options.
    args.push('--', prompt);

    return args;
  }

  protected async spawnCLI(prompt: string, options: { timeout?: number } = {}): Promise<string> {
    await assertCLIModelOverride(this.id, this.cliCommand, this.modelOverride, this.discoverModels);
    return super.spawnCLI(prompt, options);
  }

  /**
   * Check if MCP servers are supported
   * Claude CLI supports MCP servers
   *
   * @returns true (Claude CLI supports MCP)
   */
  public supportsMCPServers(): boolean {
    return true;
  }

  /**
   * Check if web search is supported
   * Claude CLI doesn't have native web search
   *
   * @returns false (Claude CLI doesn't support web search)
   */
  public supportsWebSearch(): boolean {
    return false;
  }

  /**
   * Translate Claude-specific error messages into standard format (T074)
   *
   * @param error - Raw error message from Claude CLI
   * @returns Normalized error message
   */
  public translateError(error: string): string {
    // Authentication errors
    if (error.includes('API key') || error.includes('authentication') || error.includes('401')) {
      return 'Authentication failed: run `claude login` and retry.';
    }

    // Rate limiting
    if (error.includes('rate limit') || error.includes('429')) {
      return 'Rate limit exceeded: Too many requests. Please wait a moment and try again.';
    }

    // Model not found
    if (error.includes('model') && (error.includes('not found') || error.includes('invalid'))) {
      return `Model not available: The requested model is not accessible. Please check your model configuration.`;
    }

    // Token limit exceeded
    if (error.includes('token') && error.includes('limit')) {
      return 'Token limit exceeded: The request exceeds the maximum token limit. Please reduce the prompt size.';
    }

    // Network errors
    if (
      error.includes('network') ||
      error.includes('connection') ||
      error.includes('ECONNREFUSED')
    ) {
      return 'Network error: Unable to connect to Claude API. Please check your internet connection.';
    }

    // Timeout errors
    if (error.includes('timeout') || error.includes('ETIMEDOUT')) {
      return 'Request timeout: The request took too long to complete. Please try again.';
    }

    // Command not found
    if (error.includes('command not found') || error.includes('ENOENT')) {
      return 'Claude CLI not found: Please install Claude Code CLI using: npm install -g @anthropic-ai/claude-code';
    }

    // Default: Return sanitized error (remove file paths and internal details)
    const sanitized = error
      .replace(/\/[^\s]+/g, '[PATH]')
      .replace(/Error: /g, '')
      .trim();
    return `Claude error: ${sanitized}`;
  }
}

// Register provider in factory
registerProvider('claude-cli', ClaudeCodeCLIProvider);
