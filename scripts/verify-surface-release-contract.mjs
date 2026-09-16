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
const hosts = ['claude', 'codex', 'copilot', 'antigravity', 'grok', 'vscode'];
const requiredRuntimeAssets = [
  '.specify/scripts/node/gofer-host-capability.mjs',
  '.specify/scripts/node/gofer-live-routing.mjs',
  '.specify/scripts/node/gofer-native-adapter.mjs',
  '.specify/scripts/node/gofer-verified-execution.mjs',
  '.specify/scripts/node/gofer-execution-recovery.mjs',
  '.specify/scripts/node/gofer-execution-metrics.mjs',
  '.specify/scripts/node/gofer-benchmark.mjs',
];
const packagedRuntimeRoots = [
  'plugins/eai-gofer',
  'plugins/eai-gofer/plugins/eai-gofer',
  'extension/resources',
];

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
      if (host === 'grok') {
        const content = await fs.readFile(
          path.join(repoRoot, 'plugins/eai-gofer/.grok/skills/eai/SKILL.md'),
          'utf8'
        );
        if (!content.includes('gofer:always-on-eai:start')) {
          throw new Error('Always-on EAI contract is missing for grok.');
        }
        continue;
      }
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

async function verifyRuntimeAssetParity() {
  for (const asset of requiredRuntimeAssets) {
    const canonical = await fs.readFile(path.join(repoRoot, asset));
    for (const root of packagedRuntimeRoots) {
      const packaged = asset.replace('.specify/scripts/node/', root.endsWith('resources')
        ? 'node-scripts/'
        : '.specify/scripts/node/');
      let packagedContent;
      try {
        packagedContent = await fs.readFile(path.join(repoRoot, root, packaged));
      } catch {
        throw new Error(`Release runtime asset is missing from ${root}: ${asset}`);
      }
      if (!canonical.equals(packagedContent)) {
        throw new Error(`Release runtime asset differs in ${root}: ${asset}`);
      }
    }
  }
}

async function verifyCanonicalHostIdentity() {
  const currentHostSurfaces = [
    '.specify/scripts/node/gofer-host-capability.mjs',
    '.specify/scripts/node/gofer-surface-update.mjs',
    '.specify/scripts/node/package-agent-plugin.mjs',
    'README.md',
  ];
  const prohibited = /(?:supported|current|install|update)\s+(?:AI\s+)?(?:host|hosts|workflows?|surface)\b[^\n]{0,100}\bGemini\b(?![^\n]{0,30}\blegacy\b)|\bGemini\b(?![^\n]{0,30}\blegacy\b)[^\n]{0,100}(?:supported|current|install|update)\s+(?:AI\s+)?(?:host|hosts|workflows?|surface)\b/i;
  for (const relative of currentHostSurfaces) {
    const content = await fs.readFile(path.join(repoRoot, relative), 'utf8');
    const currentHostGemini = content.split(/\r?\n/).find(line => prohibited.test(line) &&
      !/\bGemini\b[^\n]{0,50}\b(?:legacy|not|never)\b/i.test(line));
    if (currentHostGemini) throw new Error(`Current-host Gemini reference in ${relative}.`);
  }
}

const { version } = parseArgs(process.argv.slice(2));
const expectedVersion = version || (await readJson('package.json')).version;
await assertBundleVersion(expectedVersion);
await verifyInstructions();
await verifyRuntimeAssetParity();
await verifyCanonicalHostIdentity();
console.log(`Gofer release surface contract passed for v${expectedVersion}.`);
