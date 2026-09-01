#!/usr/bin/env node

/**
 * Plans and runs user-level Gofer install and update actions for supported hosts.
 * This script is intentionally independent of a repository scaffold.
 */

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { cleanupLocalSettings } from './gofer-local-settings-cleanup.mjs';

const execFileAsync = promisify(execFile);
const REPOSITORY_URL = 'https://github.com/eai-support/eai-gofer';
const VS_CODE_EXTENSION_ID = 'EnterpriseAI.gofer';
const HOSTS = ['claude', 'codex', 'copilot', 'gemini', 'vscode'];

function command(command, args, label) {
  return { command, args, label };
}

const SURFACE_ACTIONS = {
  claude: {
    install: [
      command('claude', ['plugin', 'marketplace', 'add', REPOSITORY_URL, '--scope', 'user', '--sparse', '.claude-plugin', '--sparse', 'plugins/eai-gofer'], 'Add the EAI Gofer marketplace'),
      command('claude', ['plugin', 'install', 'eai-gofer@eai-gofer', '--scope', 'user'], 'Install EAI Gofer'),
    ],
    update: [
      command('claude', ['plugin', 'marketplace', 'update', 'eai-gofer'], 'Refresh the EAI Gofer marketplace'),
      command('claude', ['plugin', 'update', 'eai-gofer@eai-gofer', '--scope', 'user'], 'Update EAI Gofer'),
    ],
    refresh: 'Run /reload-plugins, then start a new Claude Code conversation.',
  },
  codex: {
    install: [
      command('codex', ['plugin', 'marketplace', 'add', REPOSITORY_URL, '--sparse', '.agents/plugins', '--sparse', 'plugins/eai-gofer'], 'Add the EAI Gofer marketplace'),
      command('codex', ['plugin', 'add', 'eai-gofer@eai-gofer'], 'Install EAI Gofer'),
    ],
    update: [
      command('codex', ['plugin', 'marketplace', 'upgrade', 'eai-gofer'], 'Refresh the EAI Gofer marketplace'),
      command('codex', ['plugin', 'add', 'eai-gofer@eai-gofer'], 'Apply the refreshed EAI Gofer plugin'),
    ],
    refresh: 'Start a new Codex task or restart Codex so it loads the refreshed plugin.',
  },
  copilot: {
    install: [
      command('copilot', ['plugin', 'marketplace', 'add', REPOSITORY_URL], 'Add the EAI Gofer marketplace'),
      command('copilot', ['plugin', 'install', 'eai-gofer@eai-gofer'], 'Install EAI Gofer'),
    ],
    update: [
      command('copilot', ['plugin', 'marketplace', 'update', 'eai-gofer'], 'Refresh the EAI Gofer marketplace'),
      command('copilot', ['plugin', 'update', 'eai-gofer@eai-gofer'], 'Update EAI Gofer'),
    ],
    refresh: 'Run /restart in Copilot CLI or start a new Copilot app chat.',
  },
  gemini: {
    install: [
      command('gemini', ['extensions', 'install', REPOSITORY_URL, '--auto-update'], 'Install EAI Gofer with automatic updates'),
    ],
    update: [
      command('gemini', ['extensions', 'update', 'eai-gofer'], 'Update EAI Gofer'),
    ],
    refresh: 'Start a new Gemini CLI session so it loads the updated extension.',
  },
  vscode: {
    install: [
      command('code', ['--install-extension', VS_CODE_EXTENSION_ID, '--force'], 'Install or update the EAI Gofer VS Code extension'),
    ],
    update: [
      command('code', ['--install-extension', VS_CODE_EXTENSION_ID, '--force'], 'Install or update the EAI Gofer VS Code extension'),
    ],
    refresh: 'Run Developer: Reload Window in VS Code.',
  },
};

export function parseArgs(argv) {
  const result = { action: 'inspect', host: 'auto', execute: false, json: false, help: false };
  if (argv.includes('--help') || argv.includes('-h')) return { ...result, help: true };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const nextValue = argv[index + 1];
    if (value === '--action') {
      if (!nextValue || nextValue.startsWith('-')) throw new Error('Missing value for --action.');
      result.action = argv[++index];
    } else if (value === '--host') {
      if (!nextValue || nextValue.startsWith('-')) throw new Error('Missing value for --host.');
      result.host = argv[++index];
    }
    else if (value === '--execute') result.execute = true;
    else if (value === '--json') result.json = true;
    else if (value === '--help' || value === '-h') result.help = true;
  }
  if (!['inspect', 'install', 'update'].includes(result.action)) {
    throw new Error(`Unsupported action: ${result.action}. Use inspect, install, or update.`);
  }
  if (!['auto', 'all', ...HOSTS].includes(result.host)) {
    throw new Error(`Unsupported host: ${result.host}. Use auto, all, ${HOSTS.join(', ')}`);
  }
  return result;
}

export function resolveHosts(host, currentHost = process.env.GOFER_HOST) {
  if (host === 'all') return HOSTS;
  if (host !== 'auto') return [host];
  if (HOSTS.includes(currentHost)) return [currentHost];
  return [];
}

export function buildSurfacePlan({ action, host, currentHost }) {
  const selectedHosts = resolveHosts(host, currentHost);
  if (selectedHosts.length === 0) {
    throw new Error('Use --host with claude, codex, copilot, gemini, vscode, or all.');
  }
  return selectedHosts.map((surface) => ({
    host: surface,
    action,
    commands: action === 'inspect' ? [] : SURFACE_ACTIONS[surface][action],
    refresh: SURFACE_ACTIONS[surface].refresh,
  }));
}

export async function inspectHost(host, execute = execFileAsync) {
  const executable = host === 'vscode' ? 'code' : host;
  const listArgs = {
    claude: ['plugin', 'list'],
    codex: ['plugin', 'list', '--json'],
    copilot: ['plugin', 'list'],
    gemini: ['extensions', 'list'],
    vscode: ['--list-extensions', '--show-versions'],
  }[host];
  try {
    const version = await execute(executable, ['--version'], { windowsHide: true });
    const listing = await execute(executable, listArgs, { windowsHide: true });
    return {
      host,
      available: true,
      version: version.stdout.trim().split('\n')[0],
      installed: /eai-gofer|EnterpriseAI\.gofer/i.test(listing.stdout),
    };
  } catch (error) {
    return {
      host,
      available: false,
      installed: false,
      error: error?.code ?? error?.message ?? String(error),
    };
  }
}

export async function inspectHosts(hosts, inspect = inspectHost) {
  return Promise.all(hosts.map((host) => inspect(host)));
}

function executableForHost(host) {
  return host === 'vscode' ? 'code' : host;
}

function isLocalMarketplacePath(value) {
  return /^(?:[A-Za-z]:[\\/]|[/~])/.test(value.trim());
}

export async function inspectCodexMarketplace(execute = execFileAsync) {
  try {
    const result = await execute('codex', ['plugin', 'marketplace', 'list'], {
      windowsHide: true,
    });
    const marketplace = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith('eai-gofer'));
    const root = marketplace?.replace(/^eai-gofer\s+/, '').trim();

    if (!root) {
      return { type: 'unknown' };
    }

    return {
      type: isLocalMarketplacePath(root) ? 'local' : 'git',
      root,
    };
  } catch {
    return { type: 'unknown' };
  }
}

export async function runPlan(
  plan,
  {
    inspect = inspectHost,
    inspectMarketplace = inspectCodexMarketplace,
    execute = execFileAsync,
    cleanup = cleanupLocalSettings,
  } = {}
) {
  const results = [];
  let completedUpdate = false;

  for (const surface of plan) {
    const availability = await inspect(surface.host);
    if (!availability.available) {
      results.push({
        host: surface.host,
        skipped: true,
        reason: `${executableForHost(surface.host)} is not installed or is not on PATH.`,
      });
      continue;
    }
    if (surface.host === 'codex' && surface.action === 'update') {
      const marketplace = await inspectMarketplace(execute);
      if (marketplace.type === 'local') {
        results.push({
          host: surface.host,
          label: 'Inspect local EAI Gofer marketplace',
          ok: true,
          note: `EAI Gofer uses the local marketplace at ${marketplace.root}. It was left unchanged, so local work and settings are preserved.`,
        });
        continue;
      }
      if (marketplace.type !== 'git') {
        results.push({
          host: surface.host,
          label: 'Inspect Codex EAI Gofer marketplace',
          ok: false,
          error:
            'Could not confirm the Codex marketplace source. Update stopped to protect local Gofer work and settings.',
        });
        continue;
      }
    }
    let completedSurface = true;
    for (const step of surface.commands) {
      try {
        const result = await execute(step.command, step.args, { windowsHide: true });
        results.push({ host: surface.host, label: step.label, ok: true, stdout: result.stdout.trim() });
      } catch (error) {
        results.push({
          host: surface.host,
          label: step.label,
          ok: false,
          error: error?.stderr?.trim() ?? error?.message ?? String(error),
        });
        completedSurface = false;
        break;
      }
    }
    completedUpdate ||= completedSurface && surface.commands.length > 0;
  }

  if (completedUpdate) {
    try {
      const report = await cleanup({ apply: true });
      results.push({
        host: 'local',
        label: 'Archive stale Gofer surface entries',
        ok: true,
        archived: report.removed.length,
        archiveRoot: report.archiveRoot,
      });
    } catch (error) {
      results.push({
        host: 'local',
        label: 'Archive stale Gofer surface entries',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export function formatSurfaceUpdateReport(result) {
  const lines = [
    `Action: ${result.action}`,
    `Mode: ${result.execute ? 'execute' : 'plan only'}`,
  ];

  if (result.action === 'inspect') {
    for (const host of result.hosts) {
      const status = host.available
        ? `available${host.installed ? ', Gofer installed' : ', Gofer not installed'}`
        : `not available${host.error ? `: ${host.error}` : ''}`;
      lines.push(`${host.host}: ${status}`);
    }
    return lines.join('\n');
  }

  for (const surface of result.plan) {
    lines.push(`${surface.host}: ${surface.commands.map((step) => step.label).join('; ')}`);
    lines.push(`${surface.host}: reload - ${surface.refresh}`);
  }
  for (const entry of result.results) {
    if (entry.skipped) lines.push(`${entry.host}: skipped - ${entry.reason}`);
    else if (entry.ok) lines.push(`${entry.host}: ${entry.label} completed${entry.note ? ` - ${entry.note}` : ''}`);
    else lines.push(`${entry.host}: ${entry.label} failed - ${entry.error}`);
  }

  return lines.join('\n');
}

function printUsage() {
  process.stdout.write(`Usage: node gofer-surface-update.mjs --action <inspect|install|update> --host <claude|codex|copilot|gemini|vscode|all> [--execute] [--json]\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  const selectedHosts = resolveHosts(args.host);
  if (selectedHosts.length === 0) {
    throw new Error('Use --host when running this helper outside a Gofer surface.');
  }
  if (args.action === 'inspect') {
    const report = await inspectHosts(selectedHosts);
    const result = { action: 'inspect', execute: false, hosts: report };
    process.stdout.write(
      `${args.json ? JSON.stringify(result, null, 2) : formatSurfaceUpdateReport(result)}\n`
    );
    return;
  }
  const plan = buildSurfacePlan(args);
  const result = {
    action: args.action,
    execute: args.execute,
    plan,
    results: args.execute ? await runPlan(plan) : [],
  };
  process.stdout.write(
    `${args.json ? JSON.stringify(result, null, 2) : formatSurfaceUpdateReport(result)}\n`
  );
  if (args.execute && result.results.some((entry) => entry.ok === false)) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
