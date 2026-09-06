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
const hosts = ['claude', 'codex', 'copilot', 'vscode'];
const nativeWorkspaceHosts = ['antigravity', 'antigravity-desktop'];

export function verifyWorkspaceHostPolicies({ HOST_POLICIES, normalizeHost }) {
  for (const host of nativeWorkspaceHosts) {
    if (normalizeHost(host) !== host) throw new Error(`${host} must not fall back to auto.`);
    for (const required of [
      'AGENTS.md', 'GEMINI.md',
      path.join('.agents', 'skills', 'eai', 'SKILL.md'),
      path.join('.agents', 'skills', 'eai-update', 'SKILL.md'),
    ]) {
      if (!HOST_POLICIES[host]?.required.includes(required)) {
        throw new Error(`${host} workspace policy is missing ${required}.`);
      }
    }
  }
  try {
    normalizeHost('gemini');
  } catch (error) {
    if (/retired/i.test(error.message) && /antigravity/i.test(error.message)) return;
    throw new Error('Retired Gemini CLI needs explicit Antigravity migration guidance.');
  }
  throw new Error('Retired Gemini CLI must not pass workspace checks.');
}

export function verifyUpdatePlans(plans) {
  const allowed = [...hosts, ...nativeWorkspaceHosts];
  if (new Set(plans.map((plan) => plan.host)).size !== plans.length ||
      plans.some((plan) => !allowed.includes(plan.host)) ||
      hosts.some((host) => !plans.some((plan) => plan.host === host && plan.commands?.length > 0))) {
    throw new Error('Release bundle must retain every supported update plan and exclude retired Gemini CLI.');
  }
}

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
  for (const nativeRoot of ['plugins/antigravity/eai-gofer', 'plugins/eai-gofer/plugins/antigravity/eai-gofer']) {
    const manifest = await readJson(`${nativeRoot}/plugin.json`);
    const marker = await fs.readFile(path.join(repoRoot, nativeRoot, '.eai-gofer-plugin-version'), 'utf8');
    if (manifest.name !== 'eai-gofer' ||
        JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(['description', 'name']) ||
        marker.split('\n')[0] !== expectedVersion) {
      throw new Error(`Native Antigravity manifest or version mismatch: ${nativeRoot}`);
    }
    for (const required of ['skills/eai/SKILL.md', 'skills/eai-update/SKILL.md', 'rules/gofer.md', '.specify/scripts/node/gofer-surface-update.mjs', '.specify/scripts/node/gofer-workspace-check.mjs']) {
      await fs.access(path.join(repoRoot, nativeRoot, required));
    }
  }
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
    verifyUpdatePlans(plans);

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

async function main() {
  const { version } = parseArgs(process.argv.slice(2));
  const expectedVersion = version || (await readJson('package.json')).version;
  await assertBundleVersion(expectedVersion);
  await verifyInstructions();
  const bundleRoot = path.join(repoRoot, 'plugins/eai-gofer');
  const bootstrap = await import(pathToFileURL(path.join(bundleRoot, '.specify/scripts/node/workspace-bootstrap-lib.mjs')).href);
  verifyWorkspaceHostPolicies(bootstrap);
  for (const relative of ['GEMINI.md', 'AGENTS.md', 'skills/eai/SKILL.md', 'skills/eai-update/SKILL.md']) {
    await fs.access(path.join(bundleRoot, relative));
  }
  console.log(`Gofer release surface contract passed for v${expectedVersion}; native app loading is not tested.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
