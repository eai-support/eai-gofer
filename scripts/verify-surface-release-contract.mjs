#!/usr/bin/env node

/**
 * Verifies the distributable Gofer bundle can configure every supported host
 * without changing a user workspace or calling host CLIs.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '..');
let repoRoot = defaultRepoRoot;
const hosts = ['claude', 'codex', 'copilot', 'antigravity', 'grok', 'vscode'];
const expectedInvocationPrefixes = {
  claude: '/',
  codex: '$',
  copilot: '/',
  antigravity: '/',
  grok: '/',
  vscode: '/',
};
const execFileAsync = promisify(execFile);
const repositoryUrl = 'https://github.com/eai-support/eai-gofer';
const publicReleasesBaseUrl = 'https://eai-support.github.io/eai-gofer/releases';
const publicPluginAliases = [
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
const expectedCommands = {
  install: {
    claude: [
      [
        'claude',
        'plugin',
        'marketplace',
        'add',
        repositoryUrl,
        '--scope',
        'user',
        '--sparse',
        '.claude-plugin',
        '--sparse',
        'plugins/eai-gofer',
      ],
      ['claude', 'plugin', 'install', 'eai-gofer@eai-gofer', '--scope', 'user'],
    ],
    codex: [
      [
        'codex',
        'plugin',
        'marketplace',
        'add',
        repositoryUrl,
        '--sparse',
        '.agents/plugins',
        '--sparse',
        'plugins/eai-gofer',
      ],
      ['codex', 'plugin', 'add', 'eai-gofer@eai-gofer'],
    ],
    copilot: [
      ['copilot', 'plugin', 'marketplace', 'add', repositoryUrl],
      ['copilot', 'plugin', 'install', 'eai-gofer@eai-gofer'],
    ],
    antigravity: [['agy', 'plugin', 'install', repositoryUrl]],
    grok: [['grok', 'plugin', 'install', '--trust', repositoryUrl]],
    vscode: [['code', '--install-extension', 'EnterpriseAI.gofer', '--force']],
  },
  update: {
    claude: [
      ['claude', 'plugin', 'marketplace', 'update', 'eai-gofer'],
      ['claude', 'plugin', 'update', 'eai-gofer@eai-gofer', '--scope', 'user'],
    ],
    codex: [
      ['codex', 'plugin', 'marketplace', 'upgrade', 'eai-gofer'],
      ['codex', 'plugin', 'add', 'eai-gofer@eai-gofer'],
    ],
    copilot: [
      ['copilot', 'plugin', 'marketplace', 'update', 'eai-gofer'],
      ['copilot', 'plugin', 'update', 'eai-gofer@eai-gofer'],
    ],
    antigravity: [['agy', 'plugin', 'install', repositoryUrl]],
    grok: [['grok', 'plugin', 'update', 'eai-gofer']],
    vscode: [['code', '--install-extension', 'EnterpriseAI.gofer', '--force']],
  },
};

function parseArgs(argv) {
  const versionIndex = argv.indexOf('--version');
  const rootIndex = argv.indexOf('--root');
  const publicMirrors = argv.includes('--public');
  const candidateBinaries = argv.includes('--candidate');
  const root = rootIndex === -1 ? undefined : argv[rootIndex + 1];
  if (rootIndex !== -1 && (!root || root.startsWith('-'))) {
    throw new Error('Missing value for --root.');
  }
  if (versionIndex === -1) return { publicMirrors, candidateBinaries, root };
  const version = argv[versionIndex + 1];
  if (!version || version.startsWith('-')) throw new Error('Missing value for --version.');
  return { version, publicMirrors, candidateBinaries, root };
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), 'utf8'));
}

async function assertRegularFile(relativePath, label = relativePath) {
  const stats = await fs.lstat(path.join(repoRoot, relativePath));
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file.`);
  }
}

async function assertByteCurrentMirrors(canonicalPath, mirrorPaths) {
  await assertRegularFile(canonicalPath);
  const canonical = await fs.readFile(path.join(repoRoot, canonicalPath));
  for (const mirrorPath of mirrorPaths) {
    await assertRegularFile(mirrorPath);
    const mirror = await fs.readFile(path.join(repoRoot, mirrorPath));
    if (!canonical.equals(mirror)) {
      throw new Error(
        `Release package mirror is stale: ${mirrorPath} must be byte-identical to ${canonicalPath}.`
      );
    }
  }
}

async function sha256(relativePath) {
  await assertRegularFile(relativePath);
  const bytes = await fs.readFile(path.join(repoRoot, relativePath));
  return createHash('sha256').update(bytes).digest('hex');
}

async function listFiles(relativeRoot) {
  const absoluteRoot = path.join(repoRoot, relativeRoot);
  const files = [];

  async function visit(absoluteDirectory) {
    for (const entry of await fs.readdir(absoluteDirectory, { withFileTypes: true })) {
      const absoluteEntry = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(absoluteEntry);
      } else if (entry.isFile()) {
        files.push(path.relative(absoluteRoot, absoluteEntry));
      } else {
        throw new Error(
          `Release package contains a non-regular entry: ${path.relative(repoRoot, absoluteEntry)}.`
        );
      }
    }
  }

  await visit(absoluteRoot);
  return files.sort();
}

async function assertDirectoryContainedByteForByte(candidateRoot, publicRoot) {
  const candidateFiles = await listFiles(candidateRoot);
  for (const relativeFile of candidateFiles) {
    await assertByteCurrentMirrors(path.join(candidateRoot, relativeFile), [
      path.join(publicRoot, relativeFile),
    ]);
  }

  const expectedPublicFiles = new Set([
    ...candidateFiles,
    ...publicPluginAliases.map(([, alias]) => alias),
  ]);
  const unexpectedFiles = (await listFiles(publicRoot)).filter(
    (relativeFile) => !expectedPublicFiles.has(relativeFile)
  );
  if (unexpectedFiles.length > 0) {
    throw new Error(
      `Public release package contains unexpected files: ${unexpectedFiles.join(', ')}.`
    );
  }
}

async function assertPublicAliases(publicRoot) {
  for (const [source, alias] of publicPluginAliases) {
    await assertByteCurrentMirrors(path.join(publicRoot, source), [path.join(publicRoot, alias)]);
  }
}

async function relativePathExists(relativePath) {
  try {
    await fs.access(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function resolveCandidatePackageRoot(version, candidateBinaries) {
  const stagedRoot = `dist/eai-gofer-agent-plugin-${version}/eai-gofer`;
  if (!candidateBinaries) return 'plugins/eai-gofer';
  if (!(await relativePathExists(stagedRoot))) {
    throw new Error(`Unable to find staged candidate agent plugin for v${version}.`);
  }
  return stagedRoot;
}

async function resolveCandidateBinary(relativePaths, label) {
  for (const relativePath of relativePaths) {
    if (await relativePathExists(relativePath)) {
      await assertRegularFile(relativePath, `Candidate ${label}`);
      return relativePath;
    }
  }
  throw new Error(`Unable to find candidate ${label}.`);
}

async function readArchiveEntry(relativeArchivePath, entryPath, label) {
  try {
    const { stdout } = await execFileAsync(
      'unzip',
      ['-p', path.join(repoRoot, relativeArchivePath), entryPath],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 }
    );
    if (!stdout.trim()) throw new Error('entry is empty');
    return stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is missing readable ${entryPath}: ${detail}`);
  }
}

async function readArchiveBytes(
  relativeArchivePath,
  entryPath,
  label,
  { allowEmpty = false } = {}
) {
  try {
    const { stdout } = await execFileAsync(
      'unzip',
      ['-p', path.join(repoRoot, relativeArchivePath), entryPath],
      { encoding: null, maxBuffer: 32 * 1024 * 1024 }
    );
    if (stdout.length === 0 && !allowEmpty) throw new Error('entry is empty');
    return stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is missing readable ${entryPath}: ${detail}`);
  }
}

async function assertVsixContents(vsixPath) {
  const resourcesRoot = 'extension/resources';
  const resourceFiles = await listFiles(resourcesRoot);
  const expectedArchiveResources = resourceFiles.map(
    (relativeFile) => `extension/resources/${relativeFile.split(path.sep).join('/')}`
  );
  const archiveFiles = await listZipFiles(vsixPath, 'VSIX artifact');
  const nativeEntries = archiveFiles.filter((entry) => entry.toLowerCase().endsWith('.node'));
  if (nativeEntries.length > 0) {
    throw new Error(`VSIX artifact contains native binary entries: ${nativeEntries.join(', ')}.`);
  }
  const archiveResources = archiveFiles.filter((entry) => entry.startsWith('extension/resources/'));
  if (JSON.stringify(archiveResources) !== JSON.stringify(expectedArchiveResources)) {
    throw new Error(
      'VSIX artifact resource file list is not byte-current with the local extension/resources tree.'
    );
  }
  for (let index = 0; index < resourceFiles.length; index += 1) {
    const relativeFile = resourceFiles[index];
    const archivePath = expectedArchiveResources[index];
    const [localBytes, archiveBytes] = await Promise.all([
      fs.readFile(path.join(repoRoot, resourcesRoot, relativeFile)),
      readArchiveBytes(vsixPath, archivePath, 'VSIX artifact', { allowEmpty: true }),
    ]);
    if (!localBytes.equals(archiveBytes)) {
      throw new Error(
        `VSIX artifact ${archivePath} is not byte-identical to ${resourcesRoot}/${relativeFile}.`
      );
    }
  }
  for (const runtimePath of [
    'extension/dist/extension.js',
    'extension/language-server/dist/server.js',
  ]) {
    await readArchiveBytes(vsixPath, runtimePath, 'VSIX artifact');
  }
}

async function listZipFiles(relativeArchivePath, label) {
  try {
    const archivePath = path.join(repoRoot, relativeArchivePath);
    const [{ stdout: namesOutput }, { stdout: metadataOutput }] = await Promise.all([
      execFileAsync('unzip', ['-Z1', archivePath], {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      }),
      execFileAsync('unzip', ['-Z', '-l', archivePath], {
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
      }),
    ]);
    const entries = namesOutput.split(/\r?\n/).filter(Boolean);
    if (
      entries.length === 0 ||
      new Set(entries).size !== entries.length ||
      entries.some((entry) => {
        const pathValue = entry.endsWith('/') ? entry.slice(0, -1) : entry;
        const segments = pathValue.split('/');
        return (
          !pathValue ||
          entry.startsWith('/') ||
          /^[A-Za-z]:/.test(entry) ||
          entry.includes('\\') ||
          segments.some((segment) => !segment || segment === '.' || segment === '..')
        );
      })
    ) {
      throw new Error('archive has empty, duplicate, or unsafe file entries');
    }

    const modes = metadataOutput
      .split(/\r?\n/)
      .map((line) => line.match(/^([bcdlps-][rwxStTs-]{9})\s/)?.[1])
      .filter(Boolean);
    if (
      modes.length !== entries.length ||
      entries.some((entry, index) =>
        entry.endsWith('/') ? modes[index][0] !== 'd' : modes[index][0] !== '-'
      )
    ) {
      throw new Error('archive contains symlink, special, or type-confused entries');
    }

    const files = entries.filter((entry) => !entry.endsWith('/'));
    return files.sort();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} has an invalid file layout: ${detail}`);
  }
}

async function assertZipSemanticParity(candidateArchive, publicArchive) {
  const [candidateFiles, publicFiles] = await Promise.all([
    listZipFiles(candidateArchive, 'candidate VSIX'),
    listZipFiles(publicArchive, 'published VSIX'),
  ]);
  if (JSON.stringify(candidateFiles) !== JSON.stringify(publicFiles)) {
    throw new Error(
      'Candidate and published VSIX regular entry-name sets are not semantically identical.'
    );
  }

  const extractRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-vsix-semantic-parity-'));
  const candidateRoot = path.join(extractRoot, 'candidate');
  const publicRoot = path.join(extractRoot, 'public');
  await Promise.all([fs.mkdir(candidateRoot), fs.mkdir(publicRoot)]);
  try {
    await Promise.all([
      execFileAsync('unzip', ['-qq', path.join(repoRoot, candidateArchive), '-d', candidateRoot], {
        maxBuffer: 4 * 1024 * 1024,
      }),
      execFileAsync('unzip', ['-qq', path.join(repoRoot, publicArchive), '-d', publicRoot], {
        maxBuffer: 4 * 1024 * 1024,
      }),
    ]);
    for (const entry of candidateFiles) {
      const [candidateBytes, publicBytes] = await Promise.all([
        fs.readFile(path.join(candidateRoot, ...entry.split('/'))),
        fs.readFile(path.join(publicRoot, ...entry.split('/'))),
      ]);
      if (!candidateBytes.equals(publicBytes)) {
        throw new Error(`Candidate and published VSIX entry ${entry} differs byte-for-byte.`);
      }
    }
  } finally {
    await fs.rm(extractRoot, { recursive: true, force: true });
  }
}

async function listPluginArchiveFiles(relativeArchivePath, label) {
  const files = await listZipFiles(relativeArchivePath, label);
  if (files.some((entry) => !entry.startsWith('eai-gofer/'))) {
    throw new Error(
      `${label} has an invalid file layout: archive contains files outside eai-gofer/.`
    );
  }
  return files;
}

async function assertPluginArchiveMatchesDirectory(relativeArchivePath, candidateRoot) {
  const candidateFiles = await listFiles(candidateRoot);
  const expectedArchiveFiles = candidateFiles.map(
    (relativePath) => `eai-gofer/${relativePath.split(path.sep).join('/')}`
  );
  const archiveFiles = await listPluginArchiveFiles(relativeArchivePath, 'published agent plugin');
  if (JSON.stringify(archiveFiles) !== JSON.stringify(expectedArchiveFiles)) {
    throw new Error('Published agent plugin zip file list does not match the candidate bundle.');
  }

  const extractRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-release-archive-'));
  try {
    await execFileAsync(
      'unzip',
      ['-qq', path.join(repoRoot, relativeArchivePath), '-d', extractRoot],
      { maxBuffer: 4 * 1024 * 1024 }
    );
    const extractedRoot = path.join(extractRoot, 'eai-gofer');
    await listFiles(path.relative(repoRoot, extractedRoot));
    for (const relativePath of candidateFiles) {
      const [candidateBytes, archiveBytes] = await Promise.all([
        fs.readFile(path.join(repoRoot, candidateRoot, relativePath)),
        fs.readFile(path.join(extractedRoot, relativePath)),
      ]);
      if (!candidateBytes.equals(archiveBytes)) {
        throw new Error(
          `Published agent plugin zip entry eai-gofer/${relativePath} differs from the candidate bundle.`
        );
      }
    }
  } finally {
    await fs.rm(extractRoot, { recursive: true, force: true });
  }
}

async function assertPublishedArchiveVersions(version, vsixPath, pluginPath) {
  const vsixManifest = JSON.parse(
    await readArchiveEntry(vsixPath, 'extension/package.json', 'published VSIX')
  );
  const pluginMarker = await readArchiveEntry(
    pluginPath,
    'eai-gofer/.eai-gofer-plugin-version',
    'published agent plugin'
  );
  const pluginManifest = JSON.parse(
    await readArchiveEntry(
      pluginPath,
      'eai-gofer/.claude-plugin/plugin.json',
      'published agent plugin'
    )
  );
  const versions = [
    ['published VSIX', vsixManifest.version],
    ['published agent plugin', pluginMarker.trim().split(/\r?\n/, 1)[0]],
    ['published agent plugin manifest', pluginManifest.version],
  ];
  const mismatched = versions.filter(([, actual]) => actual !== version);
  if (mismatched.length > 0) {
    throw new Error(
      `Published archive version mismatch: ${mismatched
        .map(([label, actual]) => `${label}=${actual ?? ''}`)
        .join(', ')}; expected ${version}.`
    );
  }
}

async function assertCandidateBinaryParity(version, candidateRoot) {
  const candidateVsix = await resolveCandidateBinary(
    [`eai-gofer-${version}.vsix`, `extension/eai-gofer-${version}.vsix`],
    `VSIX for v${version}`
  );
  const candidatePlugin = await resolveCandidateBinary(
    [`dist/eai-gofer-agent-plugin-${version}.zip`],
    `agent plugin for v${version}`
  );
  await assertPublishedArchiveVersions(version, candidateVsix, candidatePlugin);
  await assertVsixContents(candidateVsix);
  await assertPluginArchiveMatchesDirectory(candidatePlugin, candidateRoot);
  return { candidateVsix, candidatePlugin };
}

async function assertPublicBinaryParity(version, packageRoot, compareCandidate) {
  const publicVsix = `docs-site/static/releases/eai-gofer-${version}.vsix`;
  const publicPlugin = `docs-site/static/releases/eai-gofer-agent-plugin-${version}.zip`;
  await Promise.all([
    assertRegularFile(publicVsix, `Published VSIX v${version}`),
    assertRegularFile(publicPlugin, `Published agent plugin v${version}`),
    assertRegularFile('docs-site/static/releases/eai-gofer-latest.vsix'),
    assertRegularFile('docs-site/static/releases/eai-gofer-agent-plugin-latest.zip'),
  ]);
  await assertPublishedArchiveVersions(version, publicVsix, publicPlugin);
  await assertVsixContents(publicVsix);
  await assertPluginArchiveMatchesDirectory(publicPlugin, packageRoot);
  await assertByteCurrentMirrors(publicVsix, ['docs-site/static/releases/eai-gofer-latest.vsix']);
  await assertByteCurrentMirrors(publicPlugin, [
    'docs-site/static/releases/eai-gofer-agent-plugin-latest.zip',
  ]);

  if (compareCandidate) {
    const { candidateVsix } = await assertCandidateBinaryParity(version, packageRoot);
    await assertZipSemanticParity(candidateVsix, publicVsix);
  }

  const [vsixHash, pluginHash] = await Promise.all([sha256(publicVsix), sha256(publicPlugin)]);
  const releases = await readJson('docs-site/static/releases.json');
  const release = releases.releases?.find((entry) => entry.version === version);
  if (!release) {
    throw new Error(`Release feed does not contain v${version}.`);
  }
  if (releases.latest_version !== version || releases.releases?.[0] !== release) {
    throw new Error(`Release feed does not advertise v${version} as the current first release.`);
  }
  if (release.prerelease !== version.includes('-')) {
    throw new Error(`Release feed prerelease metadata does not match v${version}.`);
  }
  const actualAssetHosts = Object.keys(release.assets ?? {});
  if (JSON.stringify(actualAssetHosts) !== JSON.stringify(hosts)) {
    throw new Error(
      `Release feed host contract mismatch: expected ${hosts.join(', ')}, received ${actualAssetHosts.join(', ')}.`
    );
  }
  const pluginUrl = `${publicReleasesBaseUrl}/eai-gofer-agent-plugin-${version}.zip`;
  const latestPluginUrl = `${publicReleasesBaseUrl}/eai-gofer-agent-plugin-latest.zip`;
  const pluginBundleUrl = `${publicReleasesBaseUrl}/plugins/eai-gofer`;
  const vsixUrl = `${publicReleasesBaseUrl}/eai-gofer-${version}.vsix`;
  const latestVsixUrl = `${publicReleasesBaseUrl}/eai-gofer-latest.vsix`;
  const expectedUrlFields = {
    tag_name: `v${version}`,
    download_url: vsixUrl,
    public_base_url: publicReleasesBaseUrl,
    repository_public_base_url: publicReleasesBaseUrl,
    claude_bundle_url: pluginBundleUrl,
    claude_marketplace_url: `${pluginBundleUrl}/claude-marketplace.json`,
    claude_manifest_url: `${pluginBundleUrl}/claude-plugin.json`,
    codex_bundle_url: pluginBundleUrl,
    codex_marketplace_url: `${pluginBundleUrl}/codex-marketplace.json`,
    codex_manifest_url: `${pluginBundleUrl}/codex-plugin.json`,
    copilot_bundle_url: pluginBundleUrl,
    copilot_marketplace_url: `${pluginBundleUrl}/copilot-marketplace.json`,
    copilot_manifest_url: `${pluginBundleUrl}/copilot-plugin.json`,
    antigravity_bundle_url: pluginBundleUrl,
    antigravity_manifest_url: `${pluginBundleUrl}/gemini-extension.json`,
    antigravity_commands_manifest_url: `${pluginBundleUrl}/gemini-commands-manifest.json`,
    grok_bundle_url: pluginBundleUrl,
    vscode_file_name: `eai-gofer-${version}.vsix`,
    vscode_download_url: vsixUrl,
    vscode_latest_download_url: latestVsixUrl,
  };
  const actualUrlFields = {
    tag_name: release.tag_name,
    download_url: release.download_url,
    public_base_url: release.public_base_url,
    repository_public_base_url: releases.public_base_url,
    claude_bundle_url: release.assets?.claude?.bundle_url,
    claude_marketplace_url: release.assets?.claude?.marketplace_url,
    claude_manifest_url: release.assets?.claude?.manifest_url,
    codex_bundle_url: release.assets?.codex?.bundle_url,
    codex_marketplace_url: release.assets?.codex?.marketplace_url,
    codex_manifest_url: release.assets?.codex?.manifest_url,
    copilot_bundle_url: release.assets?.copilot?.bundle_url,
    copilot_marketplace_url: release.assets?.copilot?.marketplace_url,
    copilot_manifest_url: release.assets?.copilot?.manifest_url,
    antigravity_bundle_url: release.assets?.antigravity?.bundle_url,
    antigravity_manifest_url: release.assets?.antigravity?.manifest_url,
    antigravity_commands_manifest_url: release.assets?.antigravity?.commands_manifest_url,
    grok_bundle_url: release.assets?.grok?.bundle_url,
    vscode_file_name: release.assets?.vscode?.file_name,
    vscode_download_url: release.assets?.vscode?.download_url,
    vscode_latest_download_url: release.assets?.vscode?.latest_download_url,
  };
  for (const host of ['claude', 'codex', 'copilot', 'antigravity', 'grok']) {
    actualUrlFields[`${host}_download_url`] = release.assets?.[host]?.download_url;
    actualUrlFields[`${host}_latest_download_url`] = release.assets?.[host]?.latest_download_url;
    expectedUrlFields[`${host}_download_url`] = pluginUrl;
    expectedUrlFields[`${host}_latest_download_url`] = latestPluginUrl;
  }
  if (JSON.stringify(actualUrlFields) !== JSON.stringify(expectedUrlFields)) {
    throw new Error(`Release feed URL contract does not match the canonical v${version} schema.`);
  }
  if (release.sha256 !== vsixHash) {
    throw new Error(`Release feed VSIX SHA-256 does not match v${version}.`);
  }
  for (const host of hosts) {
    const expectedHash = host === 'vscode' ? vsixHash : pluginHash;
    if (release.assets?.[host]?.sha256 !== expectedHash) {
      throw new Error(`Release feed ${host} SHA-256 does not match v${version}.`);
    }
  }
}

async function assertReleasePackageParity(version, publicMirrors, candidateBinaries) {
  const candidateRoot = await resolveCandidatePackageRoot(version, candidateBinaries);
  const packagedRoots = ['plugins/eai-gofer', 'plugins/eai-gofer/plugins/eai-gofer'];
  if (candidateRoot !== 'plugins/eai-gofer') packagedRoots.push(candidateRoot);
  if (publicMirrors) {
    packagedRoots.push(
      'docs-site/static/releases/plugins/eai-gofer',
      'docs-site/static/releases/plugins/eai-gofer/plugins/eai-gofer'
    );
  }
  await assertByteCurrentMirrors('.specify/scripts/node/gofer-surface-update.mjs', [
    'extension/resources/node-scripts/gofer-surface-update.mjs',
    ...packagedRoots.map((root) => `${root}/.specify/scripts/node/gofer-surface-update.mjs`),
    ...(publicMirrors
      ? ['docs-site/static/releases/plugins/eai-gofer/gofer-surface-update.mjs']
      : []),
  ]);
  await assertByteCurrentMirrors('.specify/scripts/bash/install-optional-tools.sh', [
    'extension/resources/bash-scripts/install-optional-tools.sh',
    ...packagedRoots.map((root) => `${root}/.specify/scripts/bash/install-optional-tools.sh`),
  ]);
  await assertByteCurrentMirrors('.specify/scripts/powershell/install-optional-tools.ps1', [
    'extension/resources/powershell-scripts/install-optional-tools.ps1',
    ...packagedRoots.map(
      (root) => `${root}/.specify/scripts/powershell/install-optional-tools.ps1`
    ),
  ]);
  if (publicMirrors) {
    const publicRoot = 'docs-site/static/releases/plugins/eai-gofer';
    await assertDirectoryContainedByteForByte(candidateRoot, publicRoot);
    await assertPublicAliases(publicRoot);
    await assertPublicBinaryParity(version, candidateRoot, candidateBinaries);
  } else if (candidateBinaries) {
    await assertCandidateBinaryParity(version, candidateRoot);
  }
  return candidateRoot;
}

async function assertBundleVersion(expectedVersion, packageRoot, publicMirrors) {
  const manifests = [
    'package.json',
    'extension/package.json',
    'plugins/eai-gofer/.claude-plugin/plugin.json',
    'plugins/eai-gofer/.codex-plugin/plugin.json',
    'plugins/eai-gofer/.github/plugin/plugin.json',
  ];
  if (packageRoot !== 'plugins/eai-gofer') {
    manifests.push(`${packageRoot}/.claude-plugin/plugin.json`);
  }
  if (publicMirrors) {
    manifests.push(
      'docs-site/static/releases/plugins/eai-gofer/.claude-plugin/plugin.json',
      'docs-site/static/releases/plugins/eai-gofer/.codex-plugin/plugin.json',
      'docs-site/static/releases/plugins/eai-gofer/.github/plugin/plugin.json'
    );
  }
  const versions = await Promise.all(
    manifests.map(async (manifest) => ({
      manifest,
      version: (await readJson(manifest)).version,
    }))
  );
  const mismatched = versions.filter((entry) => entry.version !== expectedVersion);
  if (mismatched.length > 0) {
    throw new Error(
      `Release surface version mismatch: ${mismatched.map((entry) => `${entry.manifest}=${entry.version}`).join(', ')}`
    );
  }
}

function assertCommandPlans(updater) {
  for (const action of ['install', 'update']) {
    const plans = updater.buildSurfacePlan({ action, host: 'all' });
    const actual = Object.fromEntries(
      plans.map((plan) => [plan.host, plan.commands.map((step) => [step.command, ...step.args])])
    );
    if (JSON.stringify(actual) !== JSON.stringify(expectedCommands[action])) {
      throw new Error(
        `Release bundle ${action} commands do not match the six-host contract: ${JSON.stringify(actual)}`
      );
    }
  }
}

async function verifyInstructions(packageRoot) {
  const updaterPath = path.join(
    repoRoot,
    packageRoot,
    '.specify/scripts/node/gofer-surface-update.mjs'
  );
  await fs.access(updaterPath);
  const updater = await import(`${pathToFileURL(updaterPath).href}?release-check=${Date.now()}`);
  if (JSON.stringify(updater.SUPPORTED_HOSTS) !== JSON.stringify(hosts)) {
    throw new Error(
      `Release bundle host contract mismatch: expected ${hosts.join(', ')}, received ${(updater.SUPPORTED_HOSTS || []).join(', ')}.`
    );
  }
  if (JSON.stringify(updater.INVOCATION_PREFIXES) !== JSON.stringify(expectedInvocationPrefixes)) {
    throw new Error('Release bundle invocation-prefix contract does not match all six hosts.');
  }
  assertCommandPlans(updater);
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-release-surface-'));
  const configHome = path.join(home, '.config');

  try {
    const results = await updater.configureAlwaysOnInstructions(hosts, {
      home,
      platform: 'linux',
      env: { XDG_CONFIG_HOME: configHome },
    });
    const failures = results.filter((result) => !result.ok);
    if (failures.length > 0) {
      throw new Error(
        `Always-on instruction setup failed: ${failures.map((result) => result.host).join(', ')}`
      );
    }

    for (const host of hosts) {
      const targetPath =
        host === 'grok'
          ? updater.getBundledAlwaysOnSkillPath(host)
          : updater.getAlwaysOnInstructionPath(host, {
              home,
              platform: 'linux',
              env: { XDG_CONFIG_HOME: configHome },
            });
      const content = await fs.readFile(targetPath, 'utf8');
      const expectedInstruction =
        host === 'grok' ? 'Apply this contract to every request' : 'Apply Gofer to every request.';
      if (
        !content.includes('gofer:always-on-eai:start') ||
        !content.includes(expectedInstruction)
      ) {
        throw new Error(`Always-on EAI contract is missing for ${host}.`);
      }
    }
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

const { version, publicMirrors, candidateBinaries, root } = parseArgs(process.argv.slice(2));
repoRoot = root ? path.resolve(root) : defaultRepoRoot;
const expectedVersion = version || (await readJson('package.json')).version;
const packageRoot = await assertReleasePackageParity(
  expectedVersion,
  publicMirrors,
  candidateBinaries
);
await assertBundleVersion(expectedVersion, packageRoot, publicMirrors);
await verifyInstructions(
  publicMirrors ? 'docs-site/static/releases/plugins/eai-gofer' : packageRoot
);
console.log(`Gofer release surface contract passed for v${expectedVersion}: ${hosts.join(', ')}.`);
