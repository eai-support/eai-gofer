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
import { DEFAULT_MODELS, ProviderId, QueryRequest } from '../../types';
import { registerProvider } from '../ProviderFactory';

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
   * @param model - Model identifier (defaults to the cost-optimized Codex model)
   */
  constructor(cliCommand: string = 'codex', model: string = DEFAULT_MODELS['codex-cli']) {
    super(cliCommand, model);
    this.model = model;
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
    // `codex exec` accepts the prompt as its positional argument.
    return ['exec', '--model', this.model, prompt];
  }

  /**
   * Check if MCP servers are supported
   * Codex CLI supports configuring and using MCP servers
   *
   * @returns true (Codex CLI supports MCP)
   */
  public supportsMCPServers(): boolean {
    return true;
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
    if (error.includes('model') && (error.includes('not found') || error.includes('invalid'))) {
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
      return 'Codex CLI not found: Install Codex CLI from https://learn.chatgpt.com/docs/codex/cli';
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
registerProvider(
  'codex-cli',
  CodexCLIProvider as unknown as new (cliCommand: string, model: string) => CLIProviderAdapter
);
