/**
 * Claude Code CLI Output Parser (T014)
 *
 * Parses Claude CLI markdown-formatted output with "---" separators
 * and usage footer annotations.
 *
 * @see .specify/specs/027-multi-provider-cli-support/data-model.md Section 1.5
 * @see .specify/specs/027-multi-provider-cli-support/contracts/internal-api.md Section 7
 */

import { CLIOutputParser, ParsedCLIOutput } from './CLIOutputParser';

/**
 * Claude Code CLI output parser
 * Handles markdown format with "---" separator and usage footer
 */
export class ClaudeOutputParser implements CLIOutputParser {
  /**
   * Parse Claude CLI markdown output
   * Format:
   * ```
   * <response text>
   *
   * ---
   * Usage: 12,500 input tokens, 3,400 output tokens
   * ```
   *
   * @param output - Raw CLI stdout
   * @returns Parsed content and usage
   */
  parse(output: string): ParsedCLIOutput {
    // Check for errors first
    const error = this.detectErrors(output);
    if (error) {
      return {
        content: '',
        usage: { inputTokens: 0, outputTokens: 0 },
        error,
      };
    }

    // Extract text before "---" separator
    const separatorMatch = output.match(/^([\s\S]*?)\n---/m);
    const content = separatorMatch ? separatorMatch[1].trim() : output.trim();

    // Extract usage from footer
    const usage = this.extractTokenUsage(output);

    return {
      content,
      usage,
    };
  }

  /**
   * Extract token usage from Claude output footer
   * Parses: "Usage: 12,500 input tokens, 3,400 output tokens"
   *
   * @param output - Raw output with usage footer
   * @returns Token usage breakdown
   */
  extractTokenUsage(output: string): { inputTokens: number; outputTokens: number } {
    // Try to find usage pattern in output
    const usageMatch = output.match(
      /Usage:\s*([\d,]+)\s*input tokens?,\s*([\d,]+)\s*output tokens?/i
    );

    if (!usageMatch) {
      // No usage found, return zeros
      return { inputTokens: 0, outputTokens: 0 };
    }

    // Remove commas and parse numbers
    const inputTokens = parseInt(usageMatch[1].replace(/,/g, ''), 10);
    const outputTokens = parseInt(usageMatch[2].replace(/,/g, ''), 10);

    return {
      inputTokens: isNaN(inputTokens) ? 0 : inputTokens,
      outputTokens: isNaN(outputTokens) ? 0 : outputTokens,
    };
  }

  /**
   * Detect errors in Claude CLI output
   * Checks for common error patterns
   *
   * @param output - Raw output to check
   * @returns Error message or null
   */
  detectErrors(output: string): string | null {
    // Check for authentication errors
    if (output.includes('authentication') || output.includes('API key')) {
      return 'Authentication failed. Run: claude auth login';
    }

    // Check for rate limiting
    if (output.includes('rate limit') || output.includes('too many requests')) {
      return 'Rate limited. Please try again later.';
    }

    // Check for generic error prefix
    if (output.includes('Error:') || output.startsWith('error:')) {
      const errorMatch = output.match(/[Ee]rror:\s*(.+?)(?:\n|$)/);
      return errorMatch ? errorMatch[1].trim() : 'Unknown error occurred';
    }

    return null;
  }
}
