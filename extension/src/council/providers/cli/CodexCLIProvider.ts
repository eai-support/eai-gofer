/**
 * Codex CLI Provider (T022)
 *
 * Extends CLIProviderAdapter with Codex-specific implementation.
 * Handles `codex` command execution and output parsing.
 *
 * @see .specify/specs/027-multi-provider-cli-support/data-model.md Section 1.8
 * @see .specify/specs/027-multi-provider-cli-support/contracts/internal-api.md Section 3
 */

import { CLIProviderAdapter, ParsedCLIOutput } from './CLIProviderAdapter';
import { CodexOutputParser } from './CodexOutputParser';
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
 * Codex CLI provider implementation
 * Wraps `codex` command-line tool
 */
export class CodexCLIProvider extends CLIProviderAdapter {
  readonly id: ProviderId = 'codex-cli';
  readonly name = 'Codex CLI';
  readonly model: string;
  private outputParser: CodexOutputParser;

  /**
   * Constructor
   * @param cliCommand - Command to execute (default: 'codex')
   * @param modelOverride - Explicit model only; omission retains the host's native default
   * @param discoverModels - Live account-scoped discovery required for explicit overrides
   */
  constructor(
    cliCommand: string = 'codex',
    private readonly modelOverride?: string,
    private readonly discoverModels: CLIModelCatalogResolver = discoverCLIModels
  ) {
    super(cliCommand, modelOverride ?? HOST_DEFAULT_MODEL);
    this.model = modelOverride ?? HOST_DEFAULT_MODEL;
    this.outputParser = new CodexOutputParser();
  }

  /**
   * Get CLI command to execute
   * @returns CLI command path or name
   */
  getCLICommand(): string {
    return this.cliCommand;
  }

  /**
   * Parse Codex CLI output using CodexOutputParser
   * @param output - Raw stdout from Codex CLI
   * @returns Parsed content and usage
   */
  parseOutput(output: string): ParsedCLIOutput {
    return this.outputParser.parse(output);
  }

  /**
   * Format prompt for Codex CLI
   * Codex CLI may need JSON or structured format
   *
   * @param request - Query request with prompt and options
   * @returns Formatted prompt string
   */
  formatPrompt(request: QueryRequest): string {
    // Codex CLI accepts direct text prompts in exec mode
    // System prompt can be prepended if provided
    if (request.systemPrompt) {
      return `${request.systemPrompt}\n\n${request.prompt}`;
    }
    return request.prompt;
  }

  /**
   * Build CLI arguments for Codex
   * @param prompt - Formatted prompt
   * @returns Array of CLI arguments
   */
  protected buildCLIArgs(prompt: string): string[] {
    const args = ['exec'];
    if (this.modelOverride !== undefined) {
      args.push('--model', this.modelOverride);
    }
    // The option terminator prevents prompt text from becoming CLI flags or subcommands.
    args.push('--', prompt);

    return args;
  }

  protected async spawnCLI(prompt: string, options: { timeout?: number } = {}): Promise<string> {
    await assertCLIModelOverride(this.id, this.cliCommand, this.modelOverride, this.discoverModels);
    return super.spawnCLI(prompt, options);
  }

  /**
   * Check if MCP servers are supported
   * Codex CLI doesn't support MCP
   *
   * @returns false (Codex CLI doesn't support MCP)
   */
  public supportsMCPServers(): boolean {
    return false;
  }

  /**
   * Check if web search is supported
   * Codex CLI has web search capability
   *
   * @returns true (Codex CLI supports web search)
   */
  public supportsWebSearch(): boolean {
    return true;
  }

  /**
   * Translate Codex-specific error messages into standard format (T074)
   *
   * @param error - Raw error message from Codex CLI
   * @returns Normalized error message
   */
  public translateError(error: string): string {
    // Authentication errors
    if (error.includes('API key') || error.includes('authentication') || error.includes('401')) {
      return 'Authentication failed: run `codex login` and retry.';
    }

    // Rate limiting
    if (error.includes('rate limit') || error.includes('429')) {
      return 'Rate limit exceeded: Too many requests. Please wait a moment and try again.';
    }

    // Model not found
    if (
      error.includes('model') &&
      (error.includes('not found') ||
        error.includes('invalid') ||
        error.includes('not supported') ||
        error.includes('unsupported'))
    ) {
      return `Model not available: The requested model is not accessible. Please check your model configuration.`;
    }

    // Token limit exceeded
    if (error.includes('token') && (error.includes('limit') || error.includes('maximum'))) {
      return 'Token limit exceeded: The request exceeds the maximum token limit. Please reduce the prompt size.';
    }

    // Network errors
    if (
      error.includes('network') ||
      error.includes('connection') ||
      error.includes('ECONNREFUSED')
    ) {
      return 'Network error: Unable to connect to OpenAI API. Please check your internet connection.';
    }

    // Timeout errors
    if (error.includes('timeout') || error.includes('ETIMEDOUT')) {
      return 'Request timeout: The request took too long to complete. Please try again.';
    }

    // Command not found
    if (error.includes('command not found') || error.includes('ENOENT')) {
      return 'Codex CLI not found: Please install Codex CLI using: npm install -g @openai/codex-cli';
    }

    // Quota exceeded
    if (error.includes('quota') || error.includes('insufficient_quota')) {
      return 'Quota exceeded: Your OpenAI account has insufficient quota. Please add credits to your account.';
    }

    // Default: Return sanitized error (remove file paths and internal details)
    const sanitized = error
      .replace(/\/[^\s]+/g, '[PATH]')
      .replace(/Error: /g, '')
      .trim();
    return `Codex error: ${sanitized}`;
  }
}

// Register provider in factory
registerProvider('codex-cli', CodexCLIProvider);
