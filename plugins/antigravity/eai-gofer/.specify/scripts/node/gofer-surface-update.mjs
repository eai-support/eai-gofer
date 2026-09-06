#!/usr/bin/env node

/**
 * Plans and runs user-level Gofer install and update actions for supported hosts.
 * This script is intentionally independent of a repository scaffold.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import { cleanupLocalSettings } from './gofer-local-settings-cleanup.mjs';
import { inspectGrok } from './lib/grok-surface.mjs';

const execFileAsync = promisify(execFile);
const REPOSITORY_URL = 'https://github.com/eai-support/eai-gofer';
const VS_CODE_EXTENSION_ID = 'EnterpriseAI.gofer';
// Keep the existing all-host update set separate from recognized, unverified surfaces.
const HOSTS = ['claude', 'codex', 'copilot', 'vscode'];
// Native Antigravity deployment remains an explicit target, not an all-host side effect.
const ANTIGRAVITY_HOSTS = ['antigravity', 'antigravity-desktop'];
const DEFAULT_SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RECEIPT = '.gofer-install.json';
const BLOCKED_HOSTS = {
  gemini: 'Gemini CLI is retired as an active Gofer surface. Select antigravity for CLI or antigravity-desktop for the app. Existing Gemini files and accounts are untouched; never import all legacy assets unattended.',
  grok: 'Grok Build supports native plugins, but Gofer native install/update integration is unverified. Keep the existing repository skill and verify discovery in the actual CLI.',
  'grok-bot': 'Grok Bot desktop has Plugins settings and skills, but Gofer compatibility is unverified. It is not Grok Build CLI; a local repository or CLI install does not establish desktop support.',
  'grok-desktop': 'Identify the desktop product first: official Grok Bot, consumer Grok, or a third-party wrapper. Generic Grok desktop install/update support is unverified.',
  'antigravity-ide': 'Gofer install/update support for the standalone Antigravity IDE is unverified; agy or code CLI availability does not establish IDE support.',
  'antigravity-vscode': 'Gofer install/update support for the Antigravity VS Code extension is unverified; standalone IDE or code CLI availability does not verify this integration.',
  'gemini-desktop': 'Gemini desktop Spark supports uploaded skills, but Gofer integration is unverified: no verified Gofer bundle or automatic repository loader is available. Internet-dependent skill scripts are not supported.',
};
const RECOGNIZED_HOSTS = [...HOSTS, ...ANTIGRAVITY_HOSTS, ...Object.keys(BLOCKED_HOSTS)];
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
6. For an accepted scope change, update all five feature records before implementation continues: \`spec.md\`, \`plan.md\`, \`tasks.md\`, \`traceability.md\`, and \`validation-report.md\` (including the active validation scope). Explain the business effect and mark affected old evidence pending. Loop records supplement these five records; they never replace them. Name all five when explaining this process, even without an \`/eai\` prefix. A question alone does not authorize artifact edits.
7. Validate only the current implemented or required capabilities. A local MVP with no implemented or required authentication needs no login before local preview. Record future authentication as planned, not passed. Keep confirmed non-app work exempt from EAI login, tenant setup and provisioning.
8. Link every new requirement to a specific existing test or named planned check. Read the test before claiming it covers that requirement. File existence alone is not coverage. Keep missing or unexecuted checks pending. Never point new criteria to an unchanged test that does not assert them.
9. Apply the user's word limit to the whole visible answer, including headings and lists. Count the draft before sending and shorten it to fit. Do not repeat the user's questions. Keep required facts; remove repeated explanations.
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
    } else if (value === '--source-root') {
      if (!nextValue || nextValue.startsWith('-')) throw new Error('Missing value for --source-root.');
      if (!path.isAbsolute(nextValue)) throw new Error('--source-root must be an absolute Gofer source or bundle root.');
      result.sourceRoot = argv[++index];
    }
    else if (value === '--execute') result.execute = true;
    else if (value === '--json') result.json = true;
    else if (value === '--help' || value === '-h') result.help = true;
  }
  if (!['inspect', 'install', 'update'].includes(result.action)) {
    throw new Error(`Unsupported action: ${result.action}. Use inspect, install, or update.`);
  }
  if (!['auto', 'all', ...RECOGNIZED_HOSTS].includes(result.host)) {
    throw new Error(`Unsupported host: ${result.host}. Use auto, all, ${RECOGNIZED_HOSTS.join(', ')}`);
  }
  return result;
}

export function resolveHosts(host, currentHost = process.env.GOFER_HOST) {
  if (host === 'all') return HOSTS;
  if (host !== 'auto') return [host];
  if (RECOGNIZED_HOSTS.includes(currentHost)) return [currentHost];
  return [];
}

export function buildSurfacePlan({ action, host, currentHost, sourceRoot = DEFAULT_SOURCE_ROOT }) {
  const selectedHosts = resolveHosts(host, currentHost);
  if (selectedHosts.length === 0) {
    throw new Error(`Use --host with ${RECOGNIZED_HOSTS.join(', ')}, or all.`);
  }
  return selectedHosts.map((surface) => {
    if (Object.hasOwn(BLOCKED_HOSTS, surface)) {
      return { host: surface, action, status: 'blocked', reason: BLOCKED_HOSTS[surface], commands: [] };
    }
    if (ANTIGRAVITY_HOSTS.includes(surface)) {
      return {
        host: surface, action, commands: [], sourceRoot,
        operation: surface === 'antigravity' ? 'Verify local agy help, then install only the native Gofer package; changed existing CLI installs remain blocked' : 'Stage and back up only the owned Antigravity desktop Gofer directory',
        refresh: surface === 'antigravity' ? 'Start a new Antigravity CLI session and verify Gofer loading; no native task is certified.' : 'Reload Antigravity desktop and verify Gofer loading; the CLI does not prove desktop support.',
      };
    }
    return {
      host: surface,
      action,
      commands: action === 'inspect' ? [] : SURFACE_ACTIONS[surface][action],
      refresh: SURFACE_ACTIONS[surface].refresh,
    };
  });
}

async function inspectAntigravity(execute) {
  const result = {
    host: 'antigravity', status: 'unverified', available: null, installed: null,
    pluginListRead: false, reason: 'Native agy availability is separate from a verified Gofer package or task. Installation requires local help and the native source package.',
  };
  const options = {
    shell: false, windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024,
    env: { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE: 'true' },
  };
  let version;
  try {
    version = await execute('agy', ['--version'], options);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ...result, status: 'unavailable', available: false, installed: false, error: 'agy is not installed or is not on PATH.' };
    }
    return { ...result, reason: 'Could not verify agy version; installation status is unknown.' };
  }
  result.available = true;
  result.version = version.stdout.trim().split('\n')[0];
  try {
    await execute('agy', ['plugin', 'list'], options);
    // A listing is not evidence of a compatible Gofer bundle; do not expose raw plugin metadata.
    return { ...result, pluginListRead: true };
  } catch {
    return { ...result, reason: 'Could not read agy plugin list; Gofer installation is unverified.' };
  }
}

async function trustedDirectory(root, fileSystem) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('An absolute trusted directory is required.');
  const stat = await fileSystem.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Refusing a linked or non-directory root.');
  return fileSystem.realpath(root);
}

async function directoryBelow(root, parts, fileSystem, create = false) {
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try { stat = await fileSystem.lstat(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) continue;
      try { await fileSystem.mkdir(current, { mode: 0o700 }); }
      catch (mkdirError) { if (mkdirError.code !== 'EEXIST') throw mkdirError; }
      stat = await fileSystem.lstat(current);
    }
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('Refusing a linked or non-directory plugin path.');
  }
  return current;
}

async function regularFile(file, fileSystem) {
  const stat = await fileSystem.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 16 * 1024 * 1024) {
    throw new Error('Refusing an unsafe or oversized plugin file.');
  }
  const handle = await fileSystem.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) {
      throw new Error('Plugin file changed during verification.');
    }
    const data = await handle.readFile();
    if (data.length > 16 * 1024 * 1024) throw new Error('Plugin file exceeds the size limit.');
    return { data, mode: stat.mode & 0o777 };
  } finally { await handle.close(); }
}

async function snapshotPlugin(root, fileSystem, owned = false) {
  const files = [];
  const directories = [];
  let size = 0;
  const walk = async (relative) => {
    const entries = await fileSystem.readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (owned && !relative && entry.name === RECEIPT) continue;
      if (!relative && !['plugin.json', 'skills', 'rules', 'agents', '.specify', 'README.md', 'LICENSE', 'NOTICE', 'TRADEMARKS.md', '.eai-gofer-plugin-version'].includes(entry.name)) {
        throw new Error('Native Gofer package contains an undeclared root entry.');
      }
      if (['.git', '.env', '.ssh', 'auth.json', 'credentials.json', 'id_rsa', 'id_ed25519'].includes(entry.name)) {
        throw new Error('Native Gofer package contains private or repository-local data.');
      }
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const fullPath = path.join(root, name);
      const stat = await fileSystem.lstat(fullPath);
      if (stat.isSymbolicLink()) throw new Error('Native Gofer package must not contain symbolic links.');
      if (stat.isDirectory()) {
        directories.push(name);
        if (directories.length + files.length > 10000) throw new Error('Native Gofer package exceeds the entry limit.');
        await walk(name);
      } else {
        const file = await regularFile(fullPath, fileSystem);
        size += file.data.length;
        if (size > 128 * 1024 * 1024 || directories.length + files.length >= 10000) throw new Error('Native Gofer package exceeds the size limit.');
        files.push({ name, ...file });
      }
    }
  };
  await walk('');
  const manifest = files.find((file) => file.name === 'plugin.json');
  if (!manifest || JSON.parse(manifest.data.toString('utf8')).name !== 'eai-gofer') throw new Error('Expected the native eai-gofer plugin manifest.');
  const marker = files.find((file) => file.name === '.eai-gofer-plugin-version');
  if (!marker || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?\r?\ngenerated-by-eai-gofer\r?\n?$/.test(marker.data.toString('utf8'))) {
    throw new Error('Expected the generated Gofer package version marker.');
  }
  const required = [
    'skills/eai/SKILL.md', 'skills/eai-update/SKILL.md', '.specify/scripts/node/gofer-surface-update.mjs',
    ...['0_gofer_start', '1_gofer_research', '2_gofer_specify', '3_gofer_plan', '4_gofer_tasks', '5_gofer_implement', '6_gofer_validate'].map((stage) => `.specify/commands/${stage}.md`),
  ];
  if (required.some((name) => !files.some((file) => file.name === name)) || !files.some((file) => /^rules\/.+\.md$/.test(file.name))) {
    throw new Error('Native Gofer package is incomplete: skills, rules and the full pipeline scaffold are required.');
  }
  const hash = createHash('sha256');
  for (const directory of directories) hash.update(`directory:${directory}\0`);
  for (const file of files) hash.update(JSON.stringify([file.name, file.mode, file.data.length])).update(file.data);
  return { files, directories, digest: hash.digest('hex') };
}

async function readOwnedDesktop(target, fileSystem) {
  try { await fileSystem.lstat(target); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  await trustedDirectory(target, fileSystem);
  let receipt;
  try { receipt = JSON.parse((await regularFile(path.join(target, RECEIPT), fileSystem)).data.toString('utf8')); }
  catch { throw new Error('Existing desktop directory is not proven updater-owned; it was left untouched.'); }
  if (receipt.version !== 1 || receipt.host !== 'antigravity-desktop' || !/^[a-f0-9]{64}$/.test(receipt.digest)) {
    throw new Error('Existing desktop ownership receipt is invalid; directory was left untouched.');
  }
  const snapshot = await snapshotPlugin(target, fileSystem, true);
  if (snapshot.digest !== receipt.digest) throw new Error('Existing desktop Gofer files have local changes; preserve or reconcile them before updating.');
  return snapshot;
}

async function deployDesktop(snapshot, home, fileSystem) {
  const root = await trustedDirectory(home, fileSystem);
  const parts = ['.gemini', 'config', 'plugins'];
  const parent = await directoryBelow(root, parts, fileSystem);
  const target = await directoryBelow(parent, ['eai-gofer'], fileSystem);
  const existing = await readOwnedDesktop(target, fileSystem);
  if (existing?.digest === snapshot.digest) return { changed: false, targetPath: target };
  // Staging, locks and backups live outside the directories Antigravity auto-loads.
  const maintenance = await directoryBelow(root, ['.gemini', 'config', '.gofer-plugin-maintenance'], fileSystem, true);
  const lockPath = path.join(maintenance, 'eai-gofer.lock');
  let lock;
  try { lock = await fileSystem.open(lockPath, 'wx', 0o600); }
  catch { throw new Error('Another desktop Gofer update or recovery lock exists; no plugin was replaced.'); }
  let stage;
  let backupPath;
  let moved = false;
  try {
    await directoryBelow(root, parts, fileSystem, true);
    const current = await readOwnedDesktop(target, fileSystem);
    if ((current?.digest ?? null) !== (existing?.digest ?? null)) throw new Error('Desktop Gofer changed before staging; retry after reviewing it.');
    stage = await fileSystem.mkdtemp(path.join(maintenance, 'stage-'));
    for (const directory of snapshot.directories) await fileSystem.mkdir(path.join(stage, directory), { recursive: true });
    for (const file of snapshot.files) {
      await fileSystem.writeFile(path.join(stage, file.name), file.data, { flag: 'wx', mode: file.mode });
      await fileSystem.chmod(path.join(stage, file.name), file.mode);
    }
    if ((await snapshotPlugin(stage, fileSystem)).digest !== snapshot.digest) throw new Error('Staged Gofer package failed verification.');
    await fileSystem.writeFile(path.join(stage, RECEIPT), JSON.stringify({ version: 1, host: 'antigravity-desktop', digest: snapshot.digest }), { flag: 'wx', mode: 0o600 });
    await directoryBelow(root, parts, fileSystem);
    const latest = await readOwnedDesktop(target, fileSystem);
    if ((latest?.digest ?? null) !== (current?.digest ?? null)) throw new Error('Desktop Gofer changed during staging; no replacement was attempted.');
    if (current) {
      const backup = await fileSystem.mkdtemp(path.join(maintenance, 'backup-'));
      backupPath = path.join(backup, 'eai-gofer');
      await fileSystem.rename(target, backupPath);
      moved = true;
    }
    try {
      try { await fileSystem.lstat(target); throw new Error('Desktop destination appeared during update.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await fileSystem.rename(stage, target);
      stage = undefined;
    } catch (error) {
      if (moved) {
        try {
          try { await fileSystem.lstat(target); throw new Error('Destination is occupied; do not overwrite it during recovery.'); }
          catch (absent) { if (absent.code !== 'ENOENT') throw absent; }
          await fileSystem.rename(backupPath, target);
          moved = false;
        } catch { throw new Error(`Desktop update failed; previous Gofer remains backed up at ${backupPath}. Manual recovery is required.`); }
      }
      throw error;
    }
    return { changed: true, targetPath: target, ...(moved ? { backupPath } : {}) };
  } finally {
    try { if (stage) await fileSystem.rm(stage, { recursive: true, force: true }); }
    finally { await lock.close(); await fileSystem.unlink(lockPath); }
  }
}

async function deployAntigravity(surface, { sourceRoot, home, execute, fileSystem }) {
  const label = 'Deploy native EAI Gofer package';
  try {
    const root = await trustedDirectory(sourceRoot, fileSystem);
    let localPath = await directoryBelow(root, ['plugins', 'antigravity', 'eai-gofer'], fileSystem);
    try { await fileSystem.lstat(localPath); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // A bundled updater resolves its own native root, not the enclosing source tree.
      localPath = root;
    }
    const snapshot = await snapshotPlugin(localPath, fileSystem);
    if (surface.host === 'antigravity-desktop') {
      const result = await deployDesktop(snapshot, home, fileSystem);
      return { host: surface.host, label, ok: true, ...result, executionVerified: false, note: 'Package files verified only; reload the desktop app and verify native Gofer loading.' };
    }
    const userRoot = await trustedDirectory(home, fileSystem);
    const target = await directoryBelow(userRoot, ['.gemini', 'antigravity-cli', 'plugins', 'eai-gofer'], fileSystem);
    let present = false;
    try { await fileSystem.lstat(target); present = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (present) {
      if ((await snapshotPlugin(target, fileSystem)).digest === snapshot.digest) {
        return { host: surface.host, label, ok: true, changed: false, targetPath: target, executionVerified: false, note: 'Package already matches; native loading is not certified.' };
      }
      throw new Error('Existing CLI Gofer differs. Native replacement semantics are unverified; no uninstall, overwrite or legacy import was attempted.');
    }
    const options = { shell: false, windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024, env: { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE: 'true' } };
    let help = '';
    try { help = (await execute('agy', ['plugin', 'install', '--help'], options)).stdout ?? ''; }
    catch { /* agy 1.1.27 treats child --help as an install target; verify parent help instead. */ }
    let validatePackage = false;
    if (!/\bagy\s+plugins?\s+install\s+[<\[][^>\]\r\n]*(?:path|directory|source)[^>\]\r\n]*[>\]]/i.test(help)) {
      let parentHelp;
      try { parentHelp = (await execute('agy', ['plugin', '--help'], options)).stdout ?? ''; }
      catch { throw new Error('Could not verify local agy plugin help; no install was attempted.'); }
      if (!/^[ \t]*Usage:[ \t]*agy[ \t]+plugin[ \t]+<command>[ \t]+\[arguments\][ \t]*\r?$/m.test(parentHelp)
        || !/^[ \t]*Commands:[ \t]*\r?$/m.test(parentHelp)
        || !/^[ \t]+install[ \t]+<target>(?:[ \t]+[^\r\n]*)?\r?$/m.test(parentHelp)
        || !/^[ \t]+validate[ \t]+\[path\](?:[ \t]+[^\r\n]*)?\r?$/m.test(parentHelp)) {
        throw new Error('Installed agy help does not verify plugin install and package validation; no install was attempted.');
      }
      validatePackage = true;
    }
    if ((await snapshotPlugin(localPath, fileSystem)).digest !== snapshot.digest) throw new Error('Native source changed during help verification; no install was attempted.');
    if (validatePackage) {
      try { await execute('agy', ['plugin', 'validate', localPath], { ...options, timeout: 30000 }); }
      catch { throw new Error('Native CLI package validation failed; no install was attempted.'); }
      if ((await snapshotPlugin(localPath, fileSystem)).digest !== snapshot.digest) throw new Error('Native source changed during package validation; no install was attempted.');
    }
    await directoryBelow(userRoot, ['.gemini', 'antigravity-cli', 'plugins', 'eai-gofer'], fileSystem);
    try { await fileSystem.lstat(target); throw new Error('CLI Gofer destination appeared during verification; no install was attempted.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await execute('agy', ['plugin', 'install', localPath], { ...options, timeout: 30000 }); }
    catch { throw new Error('Native CLI installation failed. Its resulting state is unverified; no fallback, uninstall or legacy import was attempted.'); }
    await directoryBelow(userRoot, ['.gemini', 'antigravity-cli', 'plugins', 'eai-gofer'], fileSystem);
    if ((await snapshotPlugin(target, fileSystem)).digest !== snapshot.digest) throw new Error('Native CLI command returned, but installed Gofer package contents could not be verified.');
    return { host: surface.host, label, ok: true, changed: true, targetPath: target, executionVerified: false, note: 'Package files verified only; start a new CLI session and verify native Gofer loading.' };
  } catch (error) {
    const reason = error?.code || error instanceof SyntaxError || !(error instanceof Error) ? 'Native Gofer deployment could not verify the source, destination or CLI. No automatic fallback or cleanup was attempted.' : error.message;
    return { host: surface.host, label, status: 'blocked', ok: false, reason, error: reason, executionVerified: false };
  }
}

export async function inspectHost(host, execute = execFileAsync, { home = os.homedir(), fileSystem = fs } = {}) {
  if (host === 'grok') return inspectGrok(execute);
  if (host === 'antigravity') return inspectAntigravity(execute);
  if (host === 'gemini') {
    return { host, status: 'blocked', retired: true, available: null, installed: null, reason: BLOCKED_HOSTS.gemini };
  }
  if (host === 'antigravity-desktop') {
    try {
      const root = await trustedDirectory(home, fileSystem);
      const targetPath = await directoryBelow(root, ['.gemini', 'config', 'plugins', 'eai-gofer'], fileSystem);
      const receipt = await readOwnedDesktop(targetPath, fileSystem);
      return { host, status: 'unverified', available: null, installed: receipt !== null, targetPath, reason: receipt ? 'Owned Gofer package is present; desktop loading and execution have not been tested.' : 'No owned Gofer desktop package is present; app availability is not inferred from a CLI.' };
    } catch {
      return { host, status: 'unverified', available: null, installed: null, reason: 'Desktop Gofer directory ownership or contents could not be verified. No files were changed.' };
    }
  }
  if (Object.hasOwn(BLOCKED_HOSTS, host)) {
    return { host, status: 'unverified', available: null, installed: null, reason: BLOCKED_HOSTS[host] };
  }
  const executable = host === 'vscode' ? 'code' : host;
  const listArgs = {
    claude: ['plugin', 'list'],
    codex: ['plugin', 'list', '--json'],
    copilot: ['plugin', 'list'],
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
    sourceRoot,
    home = os.homedir(),
    fileSystem = fs,
  } = {}
) {
  // Reject the whole plan before any inspection or mutation, even if a caller supplies commands.
  const blocked = plan.filter((surface) => Object.hasOwn(BLOCKED_HOSTS, surface.host));
  if (blocked.length > 0) {
    return blocked.map((surface) => ({
      host: surface.host, status: 'blocked', label: 'Gofer install/update blocked', ok: false,
      reason: BLOCKED_HOSTS[surface.host], error: BLOCKED_HOSTS[surface.host],
    }));
  }
  const results = [];
  let completedUpdate = false;
  const configuredHosts = [];

  for (const surface of plan) {
    if (ANTIGRAVITY_HOSTS.includes(surface.host)) {
      if (!['install', 'update'].includes(surface.action)) {
        results.push({ host: surface.host, status: 'blocked', ok: false, error: 'Native deployment requires an explicit install or update action.' });
      } else {
        results.push(await deployAntigravity(surface, { sourceRoot: sourceRoot ?? surface.sourceRoot ?? DEFAULT_SOURCE_ROOT, home, execute, fileSystem }));
      }
      continue;
    }
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
      if (host.status === 'blocked') {
        lines.push(`${host.host}: blocked - ${host.reason}`);
        continue;
      }
      if (host.status === 'unverified') {
        lines.push(`${host.host}: ${host.available === true ? 'CLI available; ' : ''}unverified - ${host.reason}`);
        continue;
      }
      const status = host.available
        ? `available${host.installed ? ', Gofer installed' : ', Gofer not installed'}`
        : `not available${host.error ? `: ${host.error}` : ''}`;
      lines.push(`${host.host}: ${status}`);
    }
    return lines.join('\n');
  }

  for (const surface of result.plan) {
    if (surface.status === 'blocked') {
      lines.push(`${surface.host}: blocked - ${surface.reason}`);
      continue;
    }
    lines.push(`${surface.host}: ${surface.operation ?? surface.commands.map((step) => step.label).join('; ')}`);
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
  process.stdout.write(`Usage: node gofer-surface-update.mjs --action <inspect|install|update> --host <auto|all|${RECOGNIZED_HOSTS.join('|')}> [--source-root <absolute-gofer-root>] [--execute] [--json]\n`);
  process.stdout.write(`all covers only ${HOSTS.join(', ')}. Gemini CLI is retired and blocked without CLI calls. Antigravity CLI and desktop require explicit targets and a native package at <source-root>/plugins/antigravity/eai-gofer, or the native package root itself with its Gofer manifest and generated version marker. CLI install requires verified local help; changed existing CLI installs remain blocked. Desktop stages only its owned Gofer directory, retaining backups outside active plugins. Other unverified integrations remain blocked. No unattended legacy imports, login, global instructions or native task verification.\n`);
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
    if (report.some((entry) => entry.status === 'blocked')) process.exitCode = 1;
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
// macOS temporary directories and downloaded helper paths may contain symlinks.
const resolvedInvokedPath = invokedPath ? await fs.realpath(invokedPath).catch(() => '') : '';
if (fileURLToPath(import.meta.url) === resolvedInvokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
