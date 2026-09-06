#!/usr/bin/env tsx
/**
 * Command Generator for Cross-Platform Parity
 *
 * Regenerates the canonical Codex and Copilot surfaces from
 * `.specify/commands/*.md` via the shared Node generator. This keeps the release
 * path byte-identical with the canonical source-of-truth surfaces already used
 * across Claude, Copilot, Codex, and Antigravity.
 *
 * Usage:
 *   npm run generate-commands               # Generate all commands
 *   npm run generate-commands -- --platform codex   # Generate only Codex skills
 *   npm run generate-commands -- --platform copilot # Generate only Copilot prompts
 *   npm run generate-commands -- --dry-run  # Preview changes without writing files
 *
 * Feature: 028-cross-platform-command-parity
 */

import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

/**
 * CLI arguments
 */
interface GenerateCommandsArgs {
  platform?: 'codex' | 'copilot' | 'all';
  workflowProfile: 'standard' | 'enterpriseai' | 'auto';
  dryRun: boolean;
  verbose: boolean;
}

/**
 * Parse command-line arguments
 */
function parseArgs(): GenerateCommandsArgs {
  const args = process.argv.slice(2);
  const result: GenerateCommandsArgs = {
    workflowProfile: 'auto',
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--platform':
        result.platform = args[++i] as 'codex' | 'copilot' | 'all';
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--workflow-profile':
      case '--profile':
        result.workflowProfile = args[++i] as 'standard' | 'enterpriseai' | 'auto';
        break;
      case '--verbose':
      case '-v':
        result.verbose = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  if (!['standard', 'enterpriseai', 'auto'].includes(result.workflowProfile)) {
    throw new Error(
      `Invalid --workflow-profile value "${result.workflowProfile}". Use standard, enterpriseai, or auto.`
    );
  }

  return result;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Usage: npm run generate-commands [options]

Options:
  --platform <type>   Generate for specific platform: codex, copilot, or all (default: all)
  --workflow-profile  Metadata workflow profile: standard, enterpriseai, or auto (default: auto)
  --dry-run          Preview changes without writing files
  --verbose, -v      Show detailed generation output
  --help, -h         Show this help message

Examples:
  npm run generate-commands                        # Generate all commands
  npm run generate-commands -- --platform codex    # Generate only Codex skills
  npm run generate-commands -- --workflow-profile enterpriseai
  npm run generate-commands -- --dry-run           # Preview without writing
  `);
}

/**
 * Main generation logic
 */
async function main(): Promise<void> {
  const args = parseArgs();

  // Get workspace path (parent of scripts directory)
  const scriptPath = fileURLToPath(import.meta.url);
  const scriptDir = path.dirname(scriptPath);
  const workspacePath = path.resolve(scriptDir, '..');

  const surfaces: string[] = [];
  if (args.platform === 'codex' || args.platform === 'all' || !args.platform) {
    surfaces.push('agents-skills', 'system-skills');
  }
  if (args.platform === 'copilot' || args.platform === 'all' || !args.platform) {
    surfaces.push('github-prompts');
  }

  const canonicalGeneratorPath = path.join(
    workspacePath,
    '.specify',
    'scripts',
    'node',
    'generate-commands.mjs'
  );
  const commandArgs = [
    canonicalGeneratorPath,
    '--root',
    workspacePath,
    '--surfaces',
    surfaces.join(','),
  ];

  if (args.dryRun) {
    commandArgs.push('--dry-run');
  }

  if (args.verbose) {
    console.log('Using workflow profile metadata: auto-detected per canonical source');
  }

  try {
    execFileSync(process.execPath, commandArgs, {
      stdio: 'inherit',
      cwd: workspacePath,
    });
  } catch (error) {
    console.error('❌ Failed to generate canonical command surfaces:', error);
    process.exit(1);
  }
}

// Run if invoked directly
const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedPath === scriptPath) {
  main().catch((error) => {
    console.error('❌ Generation failed:', error.message);
    process.exit(1);
  });
}

export { GenerateCommandsArgs };
