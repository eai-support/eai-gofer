/**
 * ClaudeCodeCLIProvider Unit Tests
 *
 * Tests for Claude Code CLI provider implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeCodeCLIProvider } from '../../../../../extension/src/council/providers/cli/ClaudeCodeCLIProvider';
import type { QueryRequest } from '../../../../../extension/src/council/types';

describe('ClaudeCodeCLIProvider', () => {
  let provider: ClaudeCodeCLIProvider;
  const mockCommand = 'claude';
  const mockModel = 'claude-sonnet-4-5';

  beforeEach(() => {
    provider = new ClaudeCodeCLIProvider(mockCommand, mockModel);
  });

  describe('constructor', () => {
    it('should create provider with correct id', () => {
      expect(provider.id).toBe('claude-cli');
    });

    it('should create provider with correct name', () => {
      expect(provider.name).toBe('Claude Code CLI');
    });

    it('should create provider with specified model', () => {
      expect(provider.model).toBe(mockModel);
    });
  });

  describe('getCLICommand', () => {
    it('should return the CLI command', () => {
      expect(provider.getCLICommand()).toBe(mockCommand);
    });

    it('should build a non-interactive command with a positional prompt', () => {
      const prompt = 'Review this implementation';

      expect(provider.getCLICommand()).toBe('claude');
      expect(provider['buildCLIArgs'](prompt)).toEqual([
        '--model',
        mockModel,
        '--print',
        prompt,
      ]);
    });
  });

  describe('formatPrompt', () => {
    it('should format prompt with system message', () => {
      const request: QueryRequest = {
        prompt: 'Hello, Claude!',
        maxTokens: 1000,
        temperature: 0,
        systemPrompt: 'You are a helpful assistant.',
      };

      const formatted = provider.formatPrompt(request);

      expect(formatted).toContain('You are a helpful assistant.');
      expect(formatted).toContain('Hello, Claude!');
    });

    it('should format prompt without system message', () => {
      const request: QueryRequest = {
        prompt: 'Hello, Claude!',
        maxTokens: 1000,
        temperature: 0,
      };

      const formatted = provider.formatPrompt(request);

      expect(formatted).toContain('Hello, Claude!');
    });
  });

  describe('parseOutput', () => {
    it('should parse markdown output with usage footer', () => {
      const output = `Hello from Claude

---
Usage: 10 input tokens, 20 output tokens`;

      const parsed = provider.parseOutput(output);

      expect(parsed.content).toBe('Hello from Claude');
      expect(parsed.usage.inputTokens).toBe(10);
      expect(parsed.usage.outputTokens).toBe(20);
      expect(parsed.error).toBeUndefined();
    });

    it('should extract content before separator', () => {
      const output = `Response text
More text

---
Usage: 10 input tokens, 20 output tokens`;

      const parsed = provider.parseOutput(output);

      expect(parsed.content).toContain('Response text');
      expect(parsed.content).toContain('More text');
    });

    it('should detect error in output', () => {
      const output = 'Error: Invalid API key';

      const parsed = provider.parseOutput(output);

      expect(parsed.error).toBe('Authentication failed. Run: claude auth login');
    });

    it('should handle output without separator', () => {
      const output = 'Just plain text';

      const parsed = provider.parseOutput(output);

      expect(parsed.content).toBe(output);
    });

    it('should extract usage tokens with commas', () => {
      const output = `Response

---
Usage: 1,000 input tokens, 2,000 output tokens`;

      const parsed = provider.parseOutput(output);

      expect(parsed.usage.inputTokens).toBe(1000);
      expect(parsed.usage.outputTokens).toBe(2000);
    });

    it('should default to zero tokens if usage missing', () => {
      const output = 'Response without usage footer';

      const parsed = provider.parseOutput(output);

      expect(parsed.usage.inputTokens).toBe(0);
      expect(parsed.usage.outputTokens).toBe(0);
    });
  });

  describe('supportsMCPServers', () => {
    it('should support MCP servers', () => {
      expect(provider.supportsMCPServers()).toBe(true);
    });
  });

  describe('supportsWebSearch', () => {
    it('should not support web search', () => {
      expect(provider.supportsWebSearch()).toBe(false);
    });
  });
});
