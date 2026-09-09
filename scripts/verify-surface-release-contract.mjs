#!/usr/bin/env node

/**
 * Verifies the distributable Gofer bundle can configure every supported host
 * without changing a user workspace or calling host CLIs.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const hosts = ['claude', 'codex', 'copilot', 'gemini', 'vscode'];

function parseArgs(argv) {
  const versionIndex = argv.indexOf('--version');
  if (versionIndex === -1) return {};
  const version = argv[versionIndex + 1];
  if (!version || version.startsWith('-')) throw new Error('Missing value for --version.');
  return { version };
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), 'utf8'));
}

async function assertBundleVersion(expectedVersion) {
  const manifests = [
    'package.json',
    'extension/package.json',
    'plugins/eai-gofer/.claude-plugin/plugin.json',
    'plugins/eai-gofer/.codex-plugin/plugin.json',
    'plugins/eai-gofer/.github/plugin/plugin.json',
  ];
  const versions = await Promise.all(manifests.map(async (manifest) => ({
    manifest,
    version: (await readJson(manifest)).version,
  })));
  const mismatched = versions.filter((entry) => entry.version !== expectedVersion);
  if (mismatched.length > 0) {
    throw new Error(
      `Release surface version mismatch: ${mismatched.map((entry) => `${entry.manifest}=${entry.version}`).join(', ')}`
    );
  }
}

async function verifyInstructions() {
  const updaterPath = path.join(
    repoRoot,
    'plugins/eai-gofer/.specify/scripts/node/gofer-surface-update.mjs'
  );
  await fs.access(updaterPath);
  const updater = await import(`${pathToFileURL(updaterPath).href}?release-check=${Date.now()}`);
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-release-surface-'));
  const configHome = path.join(home, '.config');

  try {
    const plans = updater.buildSurfacePlan({ action: 'update', host: 'all' });
    if (plans.length !== hosts.length || plans.some((plan) => plan.commands.length === 0)) {
      throw new Error('Release bundle does not provide an update plan for every supported host.');
    }

    const results = await updater.configureAlwaysOnInstructions(hosts, {
      home,
      platform: 'linux',
      env: { XDG_CONFIG_HOME: configHome },
    });
    const failures = results.filter((result) => !result.ok);
    if (failures.length > 0) {
      throw new Error(`Always-on instruction setup failed: ${failures.map((result) => result.host).join(', ')}`);
    }

    for (const host of hosts) {
      const targetPath = updater.getAlwaysOnInstructionPath(host, {
        home,
        platform: 'linux',
        env: { XDG_CONFIG_HOME: configHome },
      });
      const content = await fs.readFile(targetPath, 'utf8');
      if (!content.includes('gofer:always-on-eai:start') || !content.includes('Apply Gofer to every request.')) {
        throw new Error(`Always-on EAI contract is missing for ${host}.`);
      }
    }
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

const { version } = parseArgs(process.argv.slice(2));
const expectedVersion = version || (await readJson('package.json')).version;
await assertBundleVersion(expectedVersion);
await verifyInstructions();
console.log(`Gofer release surface contract passed for v${expectedVersion}.`);
