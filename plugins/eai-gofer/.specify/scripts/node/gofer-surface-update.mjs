#!/usr/bin/env node

/**
 * Plans and runs user-level Gofer install and update actions for supported hosts.
 * This script is intentionally independent of a repository scaffold.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { cleanupLocalSettings } from './gofer-local-settings-cleanup.mjs';

const execFileAsync = promisify(execFile);
const REPOSITORY_URL = 'https://github.com/eai-support/eai-gofer';
const VS_CODE_EXTENSION_ID = 'EnterpriseAI.gofer';
const HOSTS = ['claude', 'codex', 'copilot', 'gemini', 'vscode'];
const ALWAYS_ON_EAI_START = '<!-- gofer:always-on-eai:start -->';
const ALWAYS_ON_EAI_END = '<!-- gofer:always-on-eai:end -->';
const ALWAYS_ON_EAI_SECTION = `## Always-On EAI Contract
${ALWAYS_ON_EAI_START}

Apply Gofer to every request. The user does not need to type \`/eai\`, \`$eai\`, or \`#eai\`.

1. Preserve the user's request. Do not add a visible command prefix.
2. Use Gofer's internal routing. Do not make the user choose a pipeline stage.
3. Use concise, business-first ASD-STE100 style.
4. Check workspace health before meaningful repo work, tool use, or a pipeline stage. Do not repeat setup on every message.
5. Use Gofer maintenance only when the user explicitly asks to install or update Gofer.
${ALWAYS_ON_EAI_END}`;
const ALWAYS_ON_EAI_MARKER = /## Always-On EAI Contract\r?\n<!-- gofer:always-on-eai:start -->[\s\S]*?<!-- gofer:always-on-eai:end -->/;
const VS_CODE_INSTRUCTIONS_KEY = 'github.copilot.chat.codeGeneration.instructions';

function command(command, args, label) {
  return { command, args, label };
}

export function getAlwaysOnInstructionPath(host, {
  home = os.homedir(),
  platform = process.platform,
  env = process.env,
} = {}) {
  if (host === 'claude') return path.join(home, '.claude', 'CLAUDE.md');
  if (host === 'codex') return path.join(home, '.codex', 'AGENTS.md');
  if (host === 'copilot') return path.join(home, '.copilot', 'copilot-instructions.md');
  if (host === 'gemini') return path.join(home, '.gemini', 'GEMINI.md');
  if (host === 'vscode') {
    if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
    if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User', 'settings.json');
    return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Code', 'User', 'settings.json');
  }
  throw new Error(`Unsupported host: ${host}`);
}

export function upsertAlwaysOnEaiSection(content) {
  if (ALWAYS_ON_EAI_MARKER.test(content)) {
    return content.replace(ALWAYS_ON_EAI_MARKER, ALWAYS_ON_EAI_SECTION);
  }
  const separator = content.length === 0 ? '' : content.endsWith('\n') ? '\n' : '\n\n';
  return `${content}${separator}${ALWAYS_ON_EAI_SECTION}\n`;
}

function skipJsoncWhitespaceAndComments(content, start) {
  let index = start;
  while (index < content.length) {
    if (/\s/.test(content[index])) {
      index += 1;
      continue;
    }
    if (content[index] === '/' && content[index + 1] === '/') {
      index += 2;
      while (index < content.length && content[index] !== '\n' && content[index] !== '\r') index += 1;
      continue;
    }
    if (content[index] === '/' && content[index + 1] === '*') {
      index += 2;
      while (index < content.length && !(content[index] === '*' && content[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }
    break;
  }
  return index;
}

function parseJsoncObject(content) {
  const output = [];
  let index = 0;
  let quote = '';
  let escaped = false;

  while (index < content.length) {
    const character = content[index];
    const next = content[index + 1];

    if (quote) {
      output.push(character);
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      index += 1;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      output.push(character);
      index += 1;
      continue;
    }

    if (character === '/' && next === '/') {
      index += 2;
      while (index < content.length && content[index] !== '\n' && content[index] !== '\r') index += 1;
      continue;
    }

    if (character === '/' && next === '*') {
      index += 2;
      while (index < content.length && !(content[index] === '*' && content[index + 1] === '/')) {
        if (content[index] === '\n' || content[index] === '\r') output.push(content[index]);
        index += 1;
      }
      index += 2;
      continue;
    }

    if (character === ',') {
      const lookahead = skipJsoncWhitespaceAndComments(content, index + 1);
      if (content[lookahead] === '}' || content[lookahead] === ']') {
        index += 1;
        continue;
      }
    }

    output.push(character);
    index += 1;
  }

  const parsed = JSON.parse(output.join(''));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('VS Code settings.json must contain a JSON object.');
  }
  return parsed;
}

function findJsonStringEnd(content, start) {
  let escaped = false;
  for (let index = start + 1; index < content.length; index += 1) {
    if (escaped) escaped = false;
    else if (content[index] === '\\') escaped = true;
    else if (content[index] === '"') return index + 1;
  }
  throw new Error('VS Code settings.json contains an unterminated string.');
}

function findJsoncValueEnd(content, start) {
  const opening = content[start];
  if (opening === '"') return findJsonStringEnd(content, start);
  if (opening !== '[' && opening !== '{') {
    let index = start;
    while (index < content.length && !',}]'.includes(content[index])) index += 1;
    return index;
  }

  const closing = opening === '[' ? ']' : '}';
  let depth = 0;
  let index = start;
  while (index < content.length) {
    if (content[index] === '"') {
      index = findJsonStringEnd(content, index);
      continue;
    }
    if (content[index] === '/' && (content[index + 1] === '/' || content[index + 1] === '*')) {
      index = skipJsoncWhitespaceAndComments(content, index);
      continue;
    }
    if (content[index] === opening) depth += 1;
    if (content[index] === closing) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  throw new Error('VS Code settings.json contains an unterminated value.');
}

function findJsoncPropertyRange(content, key) {
  let depth = 0;
  for (let index = 0; index < content.length;) {
    if (content[index] === '"') {
      const stringStart = index;
      const stringEnd = findJsonStringEnd(content, index);
      const next = skipJsoncWhitespaceAndComments(content, stringEnd);
      if (depth === 1 && content[next] === ':' && JSON.parse(content.slice(stringStart, stringEnd)) === key) {
        const valueStart = skipJsoncWhitespaceAndComments(content, next + 1);
        const valueEnd = findJsoncValueEnd(content, valueStart);
        const afterValue = skipJsoncWhitespaceAndComments(content, valueEnd);
        if (content[afterValue] === ',') return { start: stringStart, end: afterValue + 1 };

        let beforeKey = stringStart - 1;
        while (beforeKey >= 0 && /\s/.test(content[beforeKey])) beforeKey -= 1;
        if (content[beforeKey] === ',') return { start: beforeKey, end: valueEnd };
        return { start: stringStart, end: valueEnd };
      }
      index = stringEnd;
      continue;
    }
    if (content[index] === '/' && (content[index + 1] === '/' || content[index + 1] === '*')) {
      index = skipJsoncWhitespaceAndComments(content, index);
      continue;
    }
    if (content[index] === '{' || content[index] === '[') depth += 1;
    if (content[index] === '}' || content[index] === ']') depth -= 1;
    index += 1;
  }
  return undefined;
}

function upsertVsCodeInstructions(content, instructions) {
  const range = findJsoncPropertyRange(content, VS_CODE_INSTRUCTIONS_KEY);
  const withoutGofer = range
    ? `${content.slice(0, range.start)}${content.slice(range.end)}`
    : content;
  const settings = parseJsoncObject(withoutGofer);
  const value = JSON.stringify(instructions, null, 2).replace(/\n/g, '\n  ');
  const property = `  ${JSON.stringify(VS_CODE_INSTRUCTIONS_KEY)}: ${value}`;
  const hasOtherSettings = Object.keys(settings).length > 0;
  const opening = withoutGofer.indexOf('{');
  return `${withoutGofer.slice(0, opening + 1)}\n${property}${hasOtherSettings ? ',' : ''}${withoutGofer.slice(opening + 1)}`;
}

async function readText(targetPath, fileSystem) {
  try {
    return await fileSystem.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

async function writeText(targetPath, content, fileSystem) {
  await fileSystem.mkdir(path.dirname(targetPath), { recursive: true });
  await fileSystem.writeFile(targetPath, content, 'utf8');
}

export async function configureAlwaysOnInstructions(hosts, {
  home = os.homedir(),
  platform = process.platform,
  env = process.env,
  fileSystem = fs,
} = {}) {
  const results = [];
  for (const host of [...new Set(hosts)]) {
    const targetPath = getAlwaysOnInstructionPath(host, { home, platform, env });
    try {
      const existing = await readText(targetPath, fileSystem);
      if (host === 'vscode') {
        const settings = existing.trim() ? parseJsoncObject(existing) : {};
        const instructions = settings[VS_CODE_INSTRUCTIONS_KEY];
        if (instructions !== undefined && !Array.isArray(instructions)) {
          throw new Error(`${VS_CODE_INSTRUCTIONS_KEY} is not an array.`);
        }
        const retained = (instructions || []).filter(
          (entry) => typeof entry?.text !== 'string' || !entry.text.includes(ALWAYS_ON_EAI_START)
        );
        const updated = existing.trim()
          ? upsertVsCodeInstructions(existing, [...retained, { text: ALWAYS_ON_EAI_SECTION }])
          : `{\n  ${JSON.stringify(VS_CODE_INSTRUCTIONS_KEY)}: ${JSON.stringify([{ text: ALWAYS_ON_EAI_SECTION }], null, 2).replace(/\n/g, '\n  ')}\n}\n`;
        if (updated !== existing) await writeText(targetPath, updated, fileSystem);
      } else {
        const updated = upsertAlwaysOnEaiSection(existing);
        if (updated !== existing) await writeText(targetPath, updated, fileSystem);
      }
      results.push({ host, targetPath, ok: true });
    } catch (error) {
      results.push({
        host,
        targetPath,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
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

function isOfficialRepositoryUrl(value) {
  const normalized = value.trim().replace(/\.git$/, '').replace(/\/$/, '');
  return [
    'https://github.com/eai-support/eai-gofer',
    'git@github.com:eai-support/eai-gofer',
    'ssh://git@github.com/eai-support/eai-gofer',
  ].includes(normalized);
}

export async function inspectLocalCodexMarketplace(root, execute = execFileAsync) {
  try {
    const [status, remote, branch] = await Promise.all([
      execute('git', ['-C', root, 'status', '--porcelain'], { windowsHide: true }),
      execute('git', ['-C', root, 'remote', 'get-url', 'origin'], { windowsHide: true }),
      execute('git', ['-C', root, 'branch', '--show-current'], { windowsHide: true }),
    ]);
    return {
      root,
      clean: status.stdout.trim().length === 0,
      official: isOfficialRepositoryUrl(remote.stdout),
      branch: branch.stdout.trim(),
    };
  } catch (error) {
    return {
      root,
      clean: false,
      official: false,
      branch: '',
      error: error?.stderr?.trim() ?? error?.message ?? String(error),
    };
  }
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
    inspectLocalMarketplace = inspectLocalCodexMarketplace,
    execute = execFileAsync,
    cleanup = cleanupLocalSettings,
    configureInstructions = configureAlwaysOnInstructions,
  } = {}
) {
  const results = [];
  let completedUpdate = false;
  const configuredHosts = [];

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
        const local = await inspectLocalMarketplace(marketplace.root, execute);
        if (!local.clean || !local.official || local.branch !== 'main') {
          const reasons = [
            !local.clean ? 'it has uncommitted changes' : '',
            !local.official ? 'its origin is not the official EAI Gofer repository' : '',
            local.branch !== 'main' ? `it is on ${local.branch || 'a detached branch'}, not main` : '',
          ].filter(Boolean).join('; ');
          results.push({
            host: surface.host,
            label: 'Update local EAI Gofer marketplace',
            ok: false,
            error:
              `EAI Gofer uses the local marketplace at ${marketplace.root}, but it was not updated because ${reasons}. ` +
              'The always-on EAI instruction was refreshed. Commit, stash, or switch the local checkout to a clean official main branch, or replace it with the public Git marketplace, then restart Codex.',
          });
          configuredHosts.push(surface.host);
          continue;
        }
        surface.commands = [
          command('git', ['-C', marketplace.root, 'fetch', 'origin', 'main'], 'Fetch the local EAI Gofer marketplace'),
          command('git', ['-C', marketplace.root, 'merge', '--ff-only', 'origin/main'], 'Fast-forward the local EAI Gofer marketplace'),
          command('codex', ['plugin', 'add', 'eai-gofer@eai-gofer'], 'Apply the refreshed EAI Gofer plugin'),
        ];
      }
      if (marketplace.type !== 'git' && marketplace.type !== 'local') {
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
    if (completedSurface && surface.commands.length > 0) {
      configuredHosts.push(surface.host);
    }
  }

  if (configuredHosts.length > 0) {
    const instructionResults = await configureInstructions(configuredHosts);
    for (const entry of instructionResults) {
      results.push({
        host: entry.host,
        label: 'Enable always-on Gofer instructions',
        ok: entry.ok,
        targetPath: entry.targetPath,
        error: entry.error,
      });
    }
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
