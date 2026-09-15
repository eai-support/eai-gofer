/**
 * CLI Health Checker Utility (T016)
 *
 * Static utility class for CLI provider health checks, version detection,
 * and authentication verification.
 *
 * @see .specify/specs/027-multi-provider-cli-support/contracts/internal-api.md Section 6
 * @see .specify/specs/027-multi-provider-cli-support/plan.md Phase 2
 */

import { promisify } from 'util';
import { execFile as execFileCallback } from 'child_process';

const execFile = promisify(execFileCallback);

// Health check timeout
const CLI_HEALTH_CHECK_TIMEOUT_MS = 5000; // 5 seconds

/**
 * Result of CLI health check
 */
export interface CLIHealthResult {
  available: boolean;
  version: string | null;
  authenticated: boolean;
  compatible: boolean;
  errorMessage?: string;
  installInstructions?: string;
  authInstructions?: string;
}

/**
 * CLI Health Checker - Static utility class
 * Provides health check, version detection, and authentication verification
 */
export class CLIHealthChecker {
  /**
   * Check CLI availability and health
   * Orchestrates version detection and authentication checks
   *
   * @param cliType - 'claude' | 'codex'
   * @param cliCommand - Command to execute
   * @returns Promise<CLIHealthResult>
   */
  static async check(cliType: 'claude' | 'codex', cliCommand: string): Promise<CLIHealthResult> {
    const result: CLIHealthResult = {
      available: false,
      version: null,
      authenticated: false,
      compatible: false,
    };

    try {
      // 1. Check if CLI is installed
      const version = await this.detectVersion(cliCommand);
      if (!version) {
        result.errorMessage = `${cliType} CLI not found`;
        result.installInstructions = this.getInstallInstructions(cliType);
        return result;
      }

      result.version = version;
      result.available = true;

      // Both providers publish rolling native installers and Codex uses a
      // supported 0.x version line. Availability and command capability are
      // authoritative; do not invent a numeric minimum the provider does not.
      result.compatible = true;

      // 3. Check authentication
      result.authenticated = await this.checkAuthentication(cliType, cliCommand);

      if (!result.authenticated) {
        result.errorMessage = `${cliType} not authenticated`;
        result.authInstructions = this.getAuthInstructions(cliType);
        return result;
      }

      // All checks passed
      return result;
    } catch (error) {
      result.errorMessage = `Health check failed: ${error instanceof Error ? error.message : String(error)}`;
      return result;
    }
  }

  /**
   * Detect CLI version
   * Runs --version command and parses output
   *
   * @param cliCommand - Command to execute
   * @returns Promise<string | null> - Version string or null
   */
  static async detectVersion(cliCommand: string): Promise<string | null> {
    try {
      const { stdout } = await execFile(cliCommand, ['--version'], {
        timeout: CLI_HEALTH_CHECK_TIMEOUT_MS, // 5 seconds
      });

      // Extract version from output (e.g., "claude 1.2.0" or "version 1.2.0")
      const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
      return versionMatch ? versionMatch[1] : stdout.trim();
    } catch (_error) {
      // Command not found or other error
      return null;
    }
  }

  /**
   * Check whether a CLI supports a given subcommand.
   * Useful for CLIs that expose features as nested commands (e.g. "gh copilot").
   *
   * @param cliCommand - Root command to execute
   * @param args - Subcommand and flags
   * @returns Promise<boolean> - true when the command executes successfully
   */
  static async supportsSubcommand(cliCommand: string, args: string[]): Promise<boolean> {
    try {
      await execFile(cliCommand, args, {
        timeout: CLI_HEALTH_CHECK_TIMEOUT_MS,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check CLI authentication
   * Provider-specific auth verification
   *
   * @param cliType - 'claude' | 'codex'
   * @param cliCommand - Command to execute
   * @returns Promise<boolean> - true if authenticated
   */
  static async checkAuthentication(
    cliType: 'claude' | 'codex',
    cliCommand: string
  ): Promise<boolean> {
    const args = cliType === 'claude' ? ['auth', 'status'] : ['login', 'status'];
    return this.supportsSubcommand(cliCommand, args);
  }

  /**
   * Get installation instructions
   * Returns CLI-specific installation command
   *
   * @param cliType - 'claude' | 'codex'
   * @returns string - Installation command
   */
  static getInstallInstructions(cliType: 'claude' | 'codex'): string {
    if (cliType === 'claude') {
      return 'Install Claude Code CLI from https://code.claude.com/docs/en/setup';
    }
    return 'Install Codex CLI from https://learn.chatgpt.com/docs/codex/cli';
  }

  /**
   * Get authentication instructions
   * Returns CLI-specific auth setup steps
   *
   * @param cliType - 'claude' | 'codex'
   * @returns string - Authentication instructions
   */
  static getAuthInstructions(cliType: 'claude' | 'codex'): string {
    if (cliType === 'claude') {
      return 'Run: claude auth login';
    }
    return 'Run: codex login';
  }

  /**
   * Compare version against minimum requirement
   * Uses semver comparison
   *
   * @param version - Detected version string
   * @param minVersion - Minimum required version
   * @returns boolean - true if version meets requirement
   */
  static compareVersion(version: string, minVersion: string): boolean {
    // Parse version strings
    const parseVersion = (v: string): number[] => {
      const match = v.match(/(\d+)\.(\d+)\.(\d+)/);
      if (!match) {
        return [0, 0, 0];
      }
      return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
    };

    const current = parseVersion(version);
    const minimum = parseVersion(minVersion);

    // Compare major, minor, patch
    for (let i = 0; i < 3; i++) {
      if (current[i] > minimum[i]) {
        return true;
      }
      if (current[i] < minimum[i]) {
        return false;
      }
    }

    // Versions are equal
    return true;
  }
}
