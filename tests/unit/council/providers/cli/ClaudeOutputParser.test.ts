/**
 * ClaudeOutputParser Unit Tests (T014)
 *
 * Tests for Claude CLI output parsing with markdown format.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeOutputParser } from '../../../../../extension/src/council/providers/cli/ClaudeOutputParser';

describe('ClaudeOutputParser', () => {
  let parser: ClaudeOutputParser;

  beforeEach(() => {
    parser = new ClaudeOutputParser();
  });

  describe('parse', () => {
    it('should parse valid Claude output with usage footer', () => {
      const output = `Hello! How can I help you today?

I can assist with various tasks.

---
Usage: 12,500 input tokens, 3,400 output tokens`;

      const result = parser.parse(output);

      expect(result.content).toBe(
        'Hello! How can I help you today?\n\nI can assist with various tasks.'
      );
      expect(result.usage.inputTokens).toBe(12500);
      expect(result.usage.outputTokens).toBe(3400);
      expect(result.error).toBeUndefined();
    });

    it('should handle output without usage footer', () => {
      const output = `Simple response without usage`;

      const result = parser.parse(output);

      expect(result.content).toBe('Simple response without usage');
      expect(result.usage.inputTokens).toBe(0);
      expect(result.usage.outputTokens).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it('should handle output with separator but no usage', () => {
      const output = `Response text

---
Some footer text without usage`;

      const result = parser.parse(output);

      expect(result.content).toBe('Response text');
      expect(result.usage.inputTokens).toBe(0);
      expect(result.usage.outputTokens).toBe(0);
    });

    it('should detect authentication errors', () => {
      const output = `Error: authentication failed. Please run the login command.`;

      const result = parser.parse(output);

      expect(result.content).toBe('');
      expect(result.usage.inputTokens).toBe(0);
      expect(result.usage.outputTokens).toBe(0);
      expect(result.error).toContain('Authentication failed');
    });

    it('should detect rate limit errors', () => {
      const output = `Error: rate limit exceeded. Please try again later.`;

      const result = parser.parse(output);

      expect(result.error).toContain('Rate limited');
    });

    it('should detect generic errors', () => {
      const output = `Error: Something went wrong`;

      const result = parser.parse(output);

      expect(result.error).toBe('Something went wrong');
    });

    it('should handle empty output', () => {
      const result = parser.parse('');

      expect(result.content).toBe('');
      expect(result.usage.inputTokens).toBe(0);
      expect(result.usage.outputTokens).toBe(0);
    });

    it('should trim whitespace from content', () => {
      const output = `

      Response with leading/trailing whitespace


---
Usage: 100 input tokens, 50 output tokens`;

      const result = parser.parse(output);

      expect(result.content).toBe('Response with leading/trailing whitespace');
    });
  });

  describe('extractTokenUsage', () => {
    it('should extract usage with comma-separated numbers', () => {
      const output = `Usage: 12,500 input tokens, 3,400 output tokens`;

      const usage = parser.extractTokenUsage(output);

      expect(usage.inputTokens).toBe(12500);
      expect(usage.outputTokens).toBe(3400);
    });

    it('should extract usage without commas', () => {
      const output = `Usage: 500 input tokens, 200 output tokens`;

      const usage = parser.extractTokenUsage(output);

      expect(usage.inputTokens).toBe(500);
      expect(usage.outputTokens).toBe(200);
    });

    it('should handle singular "token" form', () => {
      const output = `Usage: 1 input token, 1 output token`;

      const usage = parser.extractTokenUsage(output);

      expect(usage.inputTokens).toBe(1);
      expect(usage.outputTokens).toBe(1);
    });

    it('should be case-insensitive', () => {
      const output = `usage: 100 INPUT TOKENS, 50 OUTPUT TOKENS`;

      const usage = parser.extractTokenUsage(output);

      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(50);
    });

    it('should return zeros when usage pattern not found', () => {
      const output = `Some text without usage information`;

      const usage = parser.extractTokenUsage(output);

      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
    });

    it('should handle malformed numbers gracefully', () => {
      const output = `Usage: abc input tokens, xyz output tokens`;

      const usage = parser.extractTokenUsage(output);

      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
    });
  });

  describe('detectErrors', () => {
    it('should detect authentication errors with "authentication"', () => {
      const error = parser.detectErrors('authentication failed');

      expect(error).toContain('Authentication failed');
      expect(error).toContain('claude auth login');
    });

    it('should detect authentication errors with "API key"', () => {
      const error = parser.detectErrors('Invalid API key provided');

      expect(error).toContain('Authentication failed');
    });

    it('should detect rate limit errors', () => {
      const error = parser.detectErrors('rate limit exceeded');

      expect(error).toContain('Rate limited');
    });

    it('should detect rate limit errors with "too many requests"', () => {
      const error = parser.detectErrors('too many requests');

      expect(error).toContain('Rate limited');
    });

    it('should detect generic errors with "Error:" prefix', () => {
      const error = parser.detectErrors('Error: Connection timeout');

      expect(error).toBe('Connection timeout');
    });

    it('should detect lowercase "error:" prefix', () => {
      const error = parser.detectErrors('error: invalid input');

      expect(error).toBe('invalid input');
    });

    it('should return null for successful output', () => {
      const error = parser.detectErrors(`Hello! This is a valid response.

---
Usage: 100 input tokens, 50 output tokens`);

      expect(error).toBeNull();
    });

    it('should extract error message from Error: line', () => {
      const error = parser.detectErrors('Error: Failed to connect to API\nMore details here');

      expect(error).toBe('Failed to connect to API');
    });

    it('should return generic message if no specific error found after Error:', () => {
      const error = parser.detectErrors('Error:');

      expect(error).toBe('Unknown error occurred');
    });
  });
});
