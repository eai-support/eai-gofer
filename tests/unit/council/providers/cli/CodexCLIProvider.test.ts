/**
 * CodexCLIProvider Unit Tests
 *
 * Tests for Codex CLI provider implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CodexCLIProvider } from '../../../../../extension/src/council/providers/cli/CodexCLIProvider';
import type { QueryRequest } from '../../../../../extension/src/council/types';

describe('CodexCLIProvider', () => {
  let provider: CodexCLIProvider;
  const mockCommand = 'codex';
  const mockModel = 'gpt-4o';

  beforeEach(() => {
    provider = new CodexCLIProvider(mockCommand, mockModel);
  });

  describe('constructor', () => {
    it('should create provider with correct id', () => {
      expect(provider.id).toBe('codex-cli');
    });

    it('should create provider with correct name', () => {
      expect(provider.name).toBe('Codex CLI');
    });

    it('should create provider with specified model', () => {
      expect(provider.model).toBe(mockModel);
    });
  });

  describe('getCLICommand', () => {
    it('should return the CLI command', () => {
      expect(provider.getCLICommand()).toBe(mockCommand);
    });

    it('should build an exec command with a positional prompt', () => {
      const prompt = 'Review this implementation';

      expect(provider.getCLICommand()).toBe('codex');
      expect(provider['buildCLIArgs'](prompt)).toEqual(['exec', '--model', mockModel, prompt]);
    });
  });

  describe('formatPrompt', () => {
    it('should format prompt for Codex CLI', () => {
      const request: QueryRequest = {
        prompt: 'Write a function to sort an array',
        maxTokens: 1000,
        temperature: 0.7,
      };

      const formatted = provider.formatPrompt(request);

      expect(formatted).toContain('Write a function to sort an array');
    });

    it('should include system prompt if provided', () => {
      const request: QueryRequest = {
        prompt: 'Hello, Codex!',
        maxTokens: 1000,
        temperature: 0,
        systemPrompt: 'You are a code assistant.',
      };

      const formatted = provider.formatPrompt(request);

      expect(formatted).toContain('You are a code assistant.');
      expect(formatted).toContain('Hello, Codex!');
    });
  });

  describe('parseOutput', () => {
    it('should parse valid JSON output with content field', () => {
      const output = JSON.stringify({
        content: 'Here is the function...',
        usage: {
          input_tokens: 15,
          output_tokens: 25,
        },
      });

      const parsed = provider.parseOutput(output);

      expect(parsed.content).toBe('Here is the function...');
      expect(parsed.usage.inputTokens).toBe(15);
      expect(parsed.usage.outputTokens).toBe(25);
      expect(parsed.error).toBeUndefined();
    });

    it('should handle text field as alternative', () => {
      const output = JSON.stringify({
        text: 'Alternative response',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      });

      const parsed = provider.parseOutput(output);

      expect(parsed.content).toBe('Alternative response');
    });

    it('should detect error in output', () => {
      const output = 'Error: Authentication failed';

      const parsed = provider.parseOutput(output);

      expect(parsed.error).toBe('Authentication failed');
    });

    it('should handle non-JSON output as content', () => {
      const output = 'Not valid JSON';

      const parsed = provider.parseOutput(output);

      expect(parsed.content).toBe(output);
    });

    it('should extract token usage correctly', () => {
      const output = JSON.stringify({
        content: 'Response text',
        usage: {
          input_tokens: 50,
          output_tokens: 100,
        },
      });

      const parsed = provider.parseOutput(output);

      expect(parsed.usage.inputTokens).toBe(50);
      expect(parsed.usage.outputTokens).toBe(100);
    });

    it('should default to zero tokens if usage missing', () => {
      const output = JSON.stringify({
        content: 'Response text',
      });

      const parsed = provider.parseOutput(output);

      expect(parsed.usage.inputTokens).toBe(0);
      expect(parsed.usage.outputTokens).toBe(0);
    });

    it('should handle response field as alternative', () => {
      const output = JSON.stringify({
        response: 'Response',
        usage: {
          input_tokens: 30,
          output_tokens: 60,
        },
      });

      const parsed = provider.parseOutput(output);

      expect(parsed.usage.inputTokens).toBe(30);
      expect(parsed.usage.outputTokens).toBe(60);
    });
  });

  describe('supportsMCPServers', () => {
    it('should support MCP servers', () => {
      expect(provider.supportsMCPServers()).toBe(true);
    });
  });

  describe('supportsWebSearch', () => {
    it('should support web search', () => {
      expect(provider.supportsWebSearch()).toBe(true);
    });
  });
});
