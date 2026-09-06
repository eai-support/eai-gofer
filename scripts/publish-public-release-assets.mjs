#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const PUBLIC_RELEASES_DIR = path.join(REPO_ROOT, 'docs-site', 'static', 'releases');
const PUBLIC_PLUGIN_DIR = path.join(PUBLIC_RELEASES_DIR, 'plugins', 'eai-gofer');
const STANDALONE_UPDATER_FILES = [
  'gofer-surface-update.mjs',
  'gofer-local-settings-cleanup.mjs',
  'lib/grok-surface.mjs',
];

function parseArgs(argv) {
  const args = {
    version: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--version' && argv[i + 1]) {
      args.version = argv[++i].replace(/^v/, '');
    } else if (!arg.startsWith('-') && !args.version) {
      args.version = arg.replace(/^v/, '');
    }
  }

  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function copyFileEnsuringParent(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveArtifact(version, candidates, label) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to find ${label} for version ${version}.`);
}

async function writePublicPluginAliases(pluginDir) {
  const aliases = [
    ['.claude-plugin/plugin.json', 'claude-plugin.json'],
    ['.claude-plugin/marketplace.json', 'claude-marketplace.json'],
    ['.codex-plugin/plugin.json', 'codex-plugin.json'],
    ['.agents/plugins/marketplace.json', 'codex-marketplace.json'],
    ['.github/plugin/plugin.json', 'copilot-plugin.json'],
    ['.github/plugin/marketplace.json', 'copilot-marketplace.json'],
    ['plugins/antigravity/eai-gofer/plugin.json', 'antigravity-plugin.json'],
    ...STANDALONE_UPDATER_FILES.map((relativePath) => [
      `.specify/scripts/node/${relativePath}`, relativePath,
    ]),
  ];

  for (const [sourceRelativePath, aliasRelativePath] of aliases) {
    const source = path.join(pluginDir, sourceRelativePath);
    if (!(await pathExists(source))) {
      continue;
    }

    await copyFileEnsuringParent(source, path.join(pluginDir, aliasRelativePath));
  }
}

async function pruneOldVersionedAssets(releasesJsonPath) {
  if (!(await pathExists(releasesJsonPath))) {
    return;
  }

  const releases = await readJson(releasesJsonPath);
  const keptVersions = new Set(
    Array.isArray(releases.releases) ? releases.releases.map((release) => String(release.version)) : []
  );
  const entries = await fs.readdir(PUBLIC_RELEASES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const fileName = entry.name;
    const versionMatch =
      fileName.match(/^eai-gofer-(\d+\.\d+\.\d+)\.vsix$/) ??
      fileName.match(/^eai-gofer-agent-plugin-(\d+\.\d+\.\d+)\.zip$/);

    if (!versionMatch) {
      continue;
    }

    const [, version] = versionMatch;
    if (keptVersions.has(version)) {
      continue;
    }

    await fs.rm(path.join(PUBLIC_RELEASES_DIR, fileName), { force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const version =
    args.version ??
    (await readJson(path.join(REPO_ROOT, 'extension', 'package.json'))).version;

  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Version must look like 3.4.0; got '${version}'.`);
  }

  const vsixPath = await resolveArtifact(
    version,
    [
      path.join(REPO_ROOT, `eai-gofer-${version}.vsix`),
      path.join(REPO_ROOT, `gofer-${version}.vsix`),
      path.join(REPO_ROOT, 'extension', `eai-gofer-${version}.vsix`),
      path.join(REPO_ROOT, 'extension', `gofer-${version}.vsix`),
      path.join(PUBLIC_RELEASES_DIR, `eai-gofer-${version}.vsix`),
      path.join(PUBLIC_RELEASES_DIR, 'eai-gofer-latest.vsix'),
    ],
    'VSIX artifact'
  );

  const pluginZipPath = await resolveArtifact(
    version,
    [
      path.join(REPO_ROOT, 'dist', `eai-gofer-agent-plugin-${version}.zip`),
      path.join(PUBLIC_RELEASES_DIR, `eai-gofer-agent-plugin-${version}.zip`),
      path.join(PUBLIC_RELEASES_DIR, 'eai-gofer-agent-plugin-latest.zip'),
    ],
    'agent plugin zip'
  );

  const stagedPluginRoot = await resolveArtifact(
    version,
    [path.join(REPO_ROOT, 'dist', `eai-gofer-agent-plugin-${version}`, 'eai-gofer')],
    'staged public plugin bundle'
  );

  // Reject incomplete downloads before replacing any public assets.
  for (const relativePath of STANDALONE_UPDATER_FILES) {
    const source = path.join(stagedPluginRoot, '.specify', 'scripts', 'node', relativePath);
    if (!(await fs.stat(source).catch(() => null))?.isFile()) {
      throw new Error(`Standalone updater dependency is missing: ${relativePath}`);
    }
  }

  await fs.mkdir(PUBLIC_RELEASES_DIR, { recursive: true });

  const publicVsixPath = path.join(PUBLIC_RELEASES_DIR, `eai-gofer-${version}.vsix`);
  const publicLatestVsixPath = path.join(PUBLIC_RELEASES_DIR, 'eai-gofer-latest.vsix');
  const publicPluginZipPath = path.join(
    PUBLIC_RELEASES_DIR,
    `eai-gofer-agent-plugin-${version}.zip`
  );
  const publicLatestPluginZipPath = path.join(
    PUBLIC_RELEASES_DIR,
    'eai-gofer-agent-plugin-latest.zip'
  );

  await copyFileEnsuringParent(vsixPath, publicVsixPath);
  await copyFileEnsuringParent(vsixPath, publicLatestVsixPath);
  await copyFileEnsuringParent(pluginZipPath, publicPluginZipPath);
  await copyFileEnsuringParent(pluginZipPath, publicLatestPluginZipPath);

  await fs.rm(PUBLIC_PLUGIN_DIR, { recursive: true, force: true });
  await fs.mkdir(path.dirname(PUBLIC_PLUGIN_DIR), { recursive: true });
  await fs.cp(stagedPluginRoot, PUBLIC_PLUGIN_DIR, {
    recursive: true,
    force: true,
    dereference: false,
  });
  await writePublicPluginAliases(PUBLIC_PLUGIN_DIR);

  await pruneOldVersionedAssets(path.join(REPO_ROOT, 'docs-site', 'static', 'releases.json'));

  console.log(`public-release: copied VSIX to ${publicVsixPath}`);
  console.log(`public-release: copied agent plugin zip to ${publicPluginZipPath}`);
  console.log(`public-release: refreshed stable plugin bundle at ${PUBLIC_PLUGIN_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
