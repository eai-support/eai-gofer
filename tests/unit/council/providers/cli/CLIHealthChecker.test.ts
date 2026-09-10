/**
 * CLIHealthChecker Unit Tests
 *
 * Tests for CLI health checking utilities.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLIHealthChecker } from '../../../../../extension/src/council/providers/cli/CLIHealthChecker';

describe('CLIHealthChecker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('check', () => {
    it('should return available=true when CLI is installed and authenticated', async () => {
      // Mock detectVersion to return a version
      vi.spyOn(CLIHealthChecker as any, 'detectVersion').mockResolvedValue('1.0.0');
      vi.spyOn(CLIHealthChecker as any, 'checkAuthentication').mockResolvedValue(true);

      const result = await CLIHealthChecker.check('claude', 'claude');

      expect(result.available).toBe(true);
      expect(result.authenticated).toBe(true);
      expect(result.compatible).toBe(true);
      expect(result.version).toBe('1.0.0');
    });

    it('should return available=false when CLI is not found', async () => {
      vi.spyOn(CLIHealthChecker as any, 'detectVersion').mockResolvedValue(null);

      const result = await CLIHealthChecker.check('claude', 'claude');

      expect(result.available).toBe(false);
      expect(result.version).toBeNull();
    });

    it('should return authenticated=false when CLI is not authenticated', async () => {
      vi.spyOn(CLIHealthChecker as any, 'detectVersion').mockResolvedValue('1.0.0');
      vi.spyOn(CLIHealthChecker as any, 'checkAuthentication').mockResolvedValue(false);

      const result = await CLIHealthChecker.check('claude', 'claude');

      expect(result.available).toBe(true);
      expect(result.authenticated).toBe(false);
    });

    it('accepts the provider-supported Codex 0.x release line without an invented major-version floor', async () => {
      vi.spyOn(CLIHealthChecker as any, 'detectVersion').mockResolvedValue('0.153.4');
      vi.spyOn(CLIHealthChecker as any, 'checkAuthentication').mockResolvedValue(true);

      const result = await CLIHealthChecker.check('codex', 'codex');

      expect(result.available).toBe(true);
      expect(result.compatible).toBe(true);
    });

    it('should include installation instructions for claude CLI', async () => {
      vi.spyOn(CLIHealthChecker as any, 'detectVersion').mockResolvedValue(null);

      const result = await CLIHealthChecker.check('claude', 'claude');

      expect(result.installInstructions).toBeDefined();
      expect(result.installInstructions).toContain('https://code.claude.com/docs/en/setup');
    });

    it('should include installation instructions for codex CLI', async () => {
      vi.spyOn(CLIHealthChecker as any, 'detectVersion').mockResolvedValue(null);

      const result = await CLIHealthChecker.check('codex', 'codex');

      expect(result.installInstructions).toBeDefined();
    });
  });

  describe('getInstallInstructions', () => {
    it('should return installation instructions for claude', () => {
      const instructions = CLIHealthChecker.getInstallInstructions('claude');

      expect(instructions).toContain('https://code.claude.com/docs/en/setup');
    });

    it('should return installation instructions for codex', () => {
      const instructions = CLIHealthChecker.getInstallInstructions('codex');

      expect(instructions).toContain('https://learn.chatgpt.com/docs/codex/cli');
    });
  });

  describe('getAuthInstructions', () => {
    it('should return auth instructions for claude', () => {
      const instructions = CLIHealthChecker.getAuthInstructions('claude');

      expect(instructions).toBe('Run: claude auth login');
    });

    it('should return auth instructions for codex', () => {
      const instructions = CLIHealthChecker.getAuthInstructions('codex');

      expect(instructions).toBeDefined();
      expect(instructions.length).toBeGreaterThan(0);
    });
  });

  describe('detectVersion', () => {
    it('should return null if CLI command fails', async () => {
      const error: any = new Error('Command not found');
      error.code = 'ENOENT';

      // This is private, but we test the public interface through check()
      const result = await CLIHealthChecker.check('claude', 'nonexistent-command');

      expect(result.available).toBe(false);
      expect(result.version).toBeNull();
    });
  });

  describe('checkAuthentication', () => {
    it.each([
      ['claude', ['auth', 'status']],
      ['codex', ['login', 'status']],
    ] as const)('uses the real %s session-status command', async (cliType, args) => {
      const statusProbe = vi.spyOn(CLIHealthChecker, 'supportsSubcommand').mockResolvedValue(true);

      await expect(CLIHealthChecker.checkAuthentication(cliType, cliType)).resolves.toBe(true);
      expect(statusProbe).toHaveBeenCalledWith(cliType, args);
    });

    it('does not mistake an installed but logged-out CLI for an authenticated session', async () => {
      vi.spyOn(CLIHealthChecker, 'supportsSubcommand').mockResolvedValue(false);

      await expect(CLIHealthChecker.checkAuthentication('codex', 'codex')).resolves.toBe(false);
    });
  });

  describe('checkCompatibility', () => {
    it('should validate version compatibility through check()', async () => {
      // checkCompatibility is private, tested indirectly through check()
      vi.spyOn(CLIHealthChecker as any, 'detectVersion').mockResolvedValue('1.0.0');
      vi.spyOn(CLIHealthChecker as any, 'checkAuthentication').mockResolvedValue(true);

      const result = await CLIHealthChecker.check('claude', 'claude');

      // Result should include compatibility check
      expect(result).toHaveProperty('compatible');
      expect(typeof result.compatible).toBe('boolean');
    });
  });
});
