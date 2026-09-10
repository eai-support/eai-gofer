#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const PUBLIC_RELEASES_DIR = path.join(REPO_ROOT, 'docs-site', 'static', 'releases');
const PUBLIC_PLUGIN_DIR = path.join(PUBLIC_RELEASES_DIR, 'plugins', 'eai-gofer');
const execFileAsync = promisify(execFile);

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
  const sourceStats = await fs.lstat(source);
  if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
    throw new Error(`Release copy source must be a regular non-symlink file: ${source}.`);
  }
  const targetStats = await lstatIfExists(target);
  if (targetStats) {
    if (!targetStats.isFile() || targetStats.isSymbolicLink()) {
      throw new Error(`Release copy target must be a regular non-symlink file: ${target}.`);
    }
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function lstatIfExists(filePath) {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertSafeDirectoryChain(directoryPath, label) {
  const relative = path.relative(REPO_ROOT, directoryPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a descendant of the repository root.`);
  }
  let current = REPO_ROOT;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    const stats = await lstatIfExists(current);
    if (stats && (!stats.isDirectory() || stats.isSymbolicLink())) {
      throw new Error(`${label} ancestor must be a real directory, not a symlink: ${current}.`);
    }
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveArtifact(version, candidates, label, expectedKind = 'file') {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      const stats = await fs.lstat(candidate);
      const validKind = expectedKind === 'directory' ? stats.isDirectory() : stats.isFile();
      if (!validKind || stats.isSymbolicLink()) {
        throw new Error(`${label} must be a ${expectedKind} and must not be a symlink.`);
      }
      return candidate;
    }
  }

  throw new Error(`Unable to find ${label} for version ${version}.`);
}

async function sha256(filePath) {
  const bytes = await fs.readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

async function listRegularFiles(rootPath) {
  const files = [];

  async function visit(directoryPath) {
    for (const entry of await fs.readdir(directoryPath, { withFileTypes: true })) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        files.push(path.relative(rootPath, entryPath).split(path.sep).join('/'));
      } else {
        throw new Error(
          `Staged plugin contains a non-regular entry: ${path.relative(rootPath, entryPath)}.`
        );
      }
    }
  }

  await visit(rootPath);
  return files.sort();
}

async function listArchiveFiles(archivePath, label) {
  try {
    const { stdout } = await execFileAsync('unzip', ['-Z1', archivePath], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    const entries = stdout.split(/\r?\n/).filter(Boolean);
    const files = entries.filter((entry) => !entry.endsWith('/'));
    if (
      files.length === 0 ||
      new Set(files).size !== files.length ||
      files.some(
        (entry) =>
          !entry.startsWith('eai-gofer/') || entry.includes('\\') || entry.split('/').includes('..')
      )
    ) {
      throw new Error('archive has empty, duplicate, or unsafe file entries');
    }
    return files.sort();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} has an invalid file layout: ${detail}`);
  }
}

async function assertPluginZipMatchesStagedRoot(pluginZipPath, stagedPluginRoot) {
  const stagedFiles = await listRegularFiles(stagedPluginRoot);
  const expectedArchiveFiles = stagedFiles.map((relativePath) => `eai-gofer/${relativePath}`);
  const archiveFiles = await listArchiveFiles(pluginZipPath, 'agent plugin zip');
  if (JSON.stringify(archiveFiles) !== JSON.stringify(expectedArchiveFiles)) {
    throw new Error('Agent plugin zip file list does not match the staged plugin bundle.');
  }

  const extractRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'eai-gofer-plugin-verify-'));
  try {
    await execFileAsync('unzip', ['-qq', pluginZipPath, '-d', extractRoot]);
    const extractedPluginRoot = path.join(extractRoot, 'eai-gofer');
    await listRegularFiles(extractedPluginRoot);
    for (const relativePath of stagedFiles) {
      const [stagedBytes, archiveBytes] = await Promise.all([
        fs.readFile(path.join(stagedPluginRoot, relativePath)),
        fs.readFile(path.join(extractedPluginRoot, relativePath)),
      ]);
      if (!stagedBytes.equals(archiveBytes)) {
        throw new Error(
          `Agent plugin zip entry eai-gofer/${relativePath} differs from the staged plugin bundle.`
        );
      }
    }
  } finally {
    await fs.rm(extractRoot, { recursive: true, force: true });
  }
}

async function readArchiveEntry(archivePath, entryPath, label) {
  try {
    const { stdout } = await execFileAsync('unzip', ['-p', archivePath, entryPath], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    if (!stdout.trim()) {
      throw new Error('entry is empty');
    }
    return stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is missing readable ${entryPath}: ${detail}`);
  }
}

function assertVersion(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} declares version '${actual ?? ''}', expected '${expected}'.`);
  }
}

async function assertCandidateVersions(version, vsixPath, pluginZipPath, stagedPluginRoot) {
  const vsixManifest = JSON.parse(
    await readArchiveEntry(vsixPath, 'extension/package.json', 'VSIX artifact')
  );
  assertVersion(vsixManifest.version, version, 'VSIX artifact');

  const pluginMarker = await readArchiveEntry(
    pluginZipPath,
    'eai-gofer/.eai-gofer-plugin-version',
    'agent plugin zip'
  );
  assertVersion(pluginMarker.trim().split(/\r?\n/, 1)[0], version, 'agent plugin zip');
  const pluginManifest = JSON.parse(
    await readArchiveEntry(
      pluginZipPath,
      'eai-gofer/.claude-plugin/plugin.json',
      'agent plugin zip'
    )
  );
  assertVersion(pluginManifest.version, version, 'agent plugin zip manifest');

  const stagedMarker = await fs.readFile(
    path.join(stagedPluginRoot, '.eai-gofer-plugin-version'),
    'utf8'
  );
  assertVersion(stagedMarker.trim().split(/\r?\n/, 1)[0], version, 'staged plugin bundle');
  const stagedManifest = await readJson(
    path.join(stagedPluginRoot, '.claude-plugin', 'plugin.json')
  );
  assertVersion(stagedManifest.version, version, 'staged plugin bundle manifest');
  await assertPluginZipMatchesStagedRoot(pluginZipPath, stagedPluginRoot);
}

async function assertImmutableTargetCompatible(source, target, label) {
  const targetStats = await lstatIfExists(target);
  if (!targetStats) {
    return false;
  }

  if (!targetStats.isFile() || targetStats.isSymbolicLink()) {
    throw new Error(`${label} target must be a regular non-symlink file.`);
  }

  const [sourceHash, targetHash] = await Promise.all([sha256(source), sha256(target)]);
  if (sourceHash !== targetHash) {
    throw new Error(
      `${label} already exists with different bytes (${targetHash}); refusing to replace it with ${sourceHash}.`
    );
  }
  return true;
}

async function writePublicPluginAliases(pluginDir) {
  const aliases = [
    ['.claude-plugin/plugin.json', 'claude-plugin.json'],
    ['.claude-plugin/marketplace.json', 'claude-marketplace.json'],
    ['.codex-plugin/plugin.json', 'codex-plugin.json'],
    ['.agents/plugins/marketplace.json', 'codex-marketplace.json'],
    ['.github/plugin/plugin.json', 'copilot-plugin.json'],
    ['.github/plugin/marketplace.json', 'copilot-marketplace.json'],
    ['.gemini/extension.json', 'gemini-extension.json'],
    ['.gemini/commands/gofer/manifest.json', 'gemini-commands-manifest.json'],
    ['.specify/scripts/node/gofer-surface-update.mjs', 'gofer-surface-update.mjs'],
    ['.specify/scripts/node/gofer-local-settings-cleanup.mjs', 'gofer-local-settings-cleanup.mjs'],
  ];

  for (const [sourceRelativePath, aliasRelativePath] of aliases) {
    const source = path.join(pluginDir, sourceRelativePath);
    if (!(await pathExists(source))) {
      continue;
    }

    await copyFileEnsuringParent(source, path.join(pluginDir, aliasRelativePath));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const version =
    args.version ?? (await readJson(path.join(REPO_ROOT, 'extension', 'package.json'))).version;

  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Version must look like 3.4.0; got '${version}'.`);
  }

  const releaseFeed = await readJson(path.join(REPO_ROOT, 'docs-site', 'static', 'releases.json'));
  const currentRelease = releaseFeed.releases?.[0];
  if (
    releaseFeed.latest_version !== version ||
    currentRelease?.version !== version ||
    currentRelease?.tag_name !== `v${version}`
  ) {
    throw new Error(
      `Release v${version} is not the current first feed entry; refusing to change latest aliases or the public plugin tree.`
    );
  }

  const vsixPath = await resolveArtifact(
    version,
    [path.join(REPO_ROOT, `eai-gofer-${version}.vsix`)],
    'fresh root VSIX artifact'
  );

  const pluginZipPath = await resolveArtifact(
    version,
    [path.join(REPO_ROOT, 'dist', `eai-gofer-agent-plugin-${version}.zip`)],
    'fresh dist agent plugin zip'
  );

  const stagedPluginRoot = await resolveArtifact(
    version,
    [path.join(REPO_ROOT, 'dist', `eai-gofer-agent-plugin-${version}`, 'eai-gofer')],
    'staged public plugin bundle',
    'directory'
  );

  await assertSafeDirectoryChain(PUBLIC_RELEASES_DIR, 'Public releases directory');
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

  await assertCandidateVersions(version, vsixPath, pluginZipPath, stagedPluginRoot);
  const [vsixAlreadyPublished, pluginAlreadyPublished] = await Promise.all([
    assertImmutableTargetCompatible(vsixPath, publicVsixPath, `VSIX v${version}`),
    assertImmutableTargetCompatible(pluginZipPath, publicPluginZipPath, `agent plugin v${version}`),
  ]);

  if (!vsixAlreadyPublished) {
    await copyFileEnsuringParent(vsixPath, publicVsixPath);
  }
  await copyFileEnsuringParent(vsixPath, publicLatestVsixPath);
  if (!pluginAlreadyPublished) {
    await copyFileEnsuringParent(pluginZipPath, publicPluginZipPath);
  }
  await copyFileEnsuringParent(pluginZipPath, publicLatestPluginZipPath);

  await assertSafeDirectoryChain(PUBLIC_PLUGIN_DIR, 'Public plugin directory');
  await fs.rm(PUBLIC_PLUGIN_DIR, { recursive: true, force: true });
  await fs.mkdir(path.dirname(PUBLIC_PLUGIN_DIR), { recursive: true });
  await fs.cp(stagedPluginRoot, PUBLIC_PLUGIN_DIR, {
    recursive: true,
    force: true,
    dereference: false,
  });
  await writePublicPluginAliases(PUBLIC_PLUGIN_DIR);

  console.log(`public-release: copied VSIX to ${publicVsixPath}`);
  console.log(`public-release: copied agent plugin zip to ${publicPluginZipPath}`);
  console.log(`public-release: refreshed stable plugin bundle at ${PUBLIC_PLUGIN_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
