#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PUBLIC_RELEASES_BASE_URL = 'https://eai-support.github.io/eai-gofer/releases';

const PUBLIC_PLUGIN_ALIASES = [
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

function parseArgs(argv) {
  const args = { root: process.cwd(), quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--quiet') {
      args.quiet = true;
      continue;
    }
    if (!arg.startsWith('--') || i + 1 >= argv.length) {
      throw new Error(`Invalid argument: ${arg}`);
    }
    const value = argv[++i];
    switch (arg) {
      case '--root':
        args.root = path.resolve(value);
        break;
      case '--version':
        args.version = value;
        break;
      case '--release-metadata-file':
        args.releaseMetadataFile = path.resolve(value);
        break;
      case '--vsix':
        args.vsix = path.resolve(value);
        break;
      case '--plugin-zip':
        args.pluginZip = path.resolve(value);
        break;
      case '--plugin-root':
        args.pluginRoot = path.resolve(value);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function sizeInMb(filePath) {
  return Number((fs.statSync(filePath).size / (1024 * 1024)).toFixed(1));
}

function collectFiles(rootPath) {
  const files = new Map();
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic link in release bundle: ${fullPath}`);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(rootPath, fullPath).split(path.sep).join('/');
        files.set(relativePath, fullPath);
      } else {
        throw new Error(`Unsupported entry in release bundle: ${fullPath}`);
      }
    }
  }
  if (!fs.statSync(rootPath).isDirectory()) throw new Error(`Not a bundle directory: ${rootPath}`);
  visit(rootPath);
  return files;
}

function compareValue(actual, expected, label, issues) {
  if (actual !== expected) issues.push(`${label} does not match the official release.`);
}

function compareBundle(sourceRoot, publicRoot, issues) {
  const sourceFiles = collectFiles(sourceRoot);
  const expectedFiles = new Map(sourceFiles);

  for (const [sourceRelativePath, aliasRelativePath] of PUBLIC_PLUGIN_ALIASES) {
    const sourcePath =
      sourceFiles.get(`plugins/eai-gofer/${sourceRelativePath}`) ??
      sourceFiles.get(sourceRelativePath);
    if (sourcePath) expectedFiles.set(aliasRelativePath, sourcePath);
  }

  let actualFiles;
  try {
    actualFiles = collectFiles(publicRoot);
  } catch (error) {
    issues.push(error.message);
    return;
  }

  for (const [relativePath, expectedPath] of expectedFiles) {
    const actualPath = actualFiles.get(relativePath);
    if (!actualPath) {
      issues.push(`Public plugin bundle is missing ${relativePath}.`);
      continue;
    }
    if (!fs.readFileSync(expectedPath).equals(fs.readFileSync(actualPath))) {
      issues.push(`Public plugin bundle file differs: ${relativePath}.`);
    }
  }

  for (const relativePath of actualFiles.keys()) {
    if (!expectedFiles.has(relativePath)) {
      issues.push(`Public plugin bundle has an unexpected file: ${relativePath}.`);
    }
  }
}

export function verifyPublicReleasePublication(args) {
  const issues = [];
  const required = ['version', 'releaseMetadataFile', 'vsix', 'pluginZip', 'pluginRoot'];
  for (const field of required) {
    if (!args[field]) issues.push(`Missing official release input: ${field}.`);
  }
  if (issues.length) return { matches: false, issues };

  let officialRelease;
  try {
    officialRelease = JSON.parse(fs.readFileSync(args.releaseMetadataFile, 'utf8'));
  } catch {
    return { matches: false, issues: ['Official release metadata is unavailable or invalid.'] };
  }

  if (
    officialRelease.tagName !== `v${args.version}` ||
    officialRelease.isDraft ||
    officialRelease.isPrerelease
  ) {
    return {
      matches: false,
      issues: ['Official release metadata does not match the stable target release.'],
    };
  }

  let publishedAt;
  try {
    publishedAt = new Date(officialRelease.publishedAt);
    if (!Number.isFinite(publishedAt.getTime())) throw new Error('Invalid publication time.');
  } catch {
    return { matches: false, issues: ['Official release publication time is invalid.'] };
  }
  const officialNotes = officialRelease.body || officialRelease.name || `Gofer v${args.version}`;

  const root = path.resolve(args.root ?? process.cwd());
  const releasesJsonPath = path.join(root, 'docs-site/static/releases.json');
  const publicReleasesDir = path.join(root, 'docs-site/static/releases');
  const publicPluginRoot = path.join(publicReleasesDir, 'plugins/eai-gofer');
  const version = args.version;
  const versionedVsix = path.join(publicReleasesDir, `eai-gofer-${version}.vsix`);
  const latestVsix = path.join(publicReleasesDir, 'eai-gofer-latest.vsix');
  const versionedPluginZip = path.join(publicReleasesDir, `eai-gofer-agent-plugin-${version}.zip`);
  const latestPluginZip = path.join(publicReleasesDir, 'eai-gofer-agent-plugin-latest.zip');

  try {
    const feed = JSON.parse(fs.readFileSync(releasesJsonPath, 'utf8'));
    const release = Array.isArray(feed.releases)
      ? feed.releases.find((entry) => entry.version === version)
      : null;
    const vsixSizeMb = sizeInMb(args.vsix);
    const pluginSizeMb = sizeInMb(args.pluginZip);
    const vsixUrl = `${PUBLIC_RELEASES_BASE_URL}/eai-gofer-${version}.vsix`;
    const latestVsixUrl = `${PUBLIC_RELEASES_BASE_URL}/eai-gofer-latest.vsix`;
    const pluginZipUrl = `${PUBLIC_RELEASES_BASE_URL}/eai-gofer-agent-plugin-${version}.zip`;
    const latestPluginZipUrl = `${PUBLIC_RELEASES_BASE_URL}/eai-gofer-agent-plugin-latest.zip`;
    const bundleUrl = `${PUBLIC_RELEASES_BASE_URL}/plugins/eai-gofer`;

    compareValue(feed.latest_version, version, 'Feed latest_version', issues);
    compareValue(feed.public_base_url, PUBLIC_RELEASES_BASE_URL, 'Feed public_base_url', issues);
    if (!release) {
      issues.push(`Feed is missing release ${version}.`);
    } else {
      if (feed.releases[0]?.version !== version)
        issues.push('Current release is not the first feed entry.');
      compareValue(release.tag_name, `v${version}`, 'Release tag_name', issues);
      compareValue(release.published_at, publishedAt.toISOString(), 'Release published_at', issues);
      compareValue(release.notes, officialNotes, 'Release notes', issues);
      compareValue(release.prerelease, false, 'Release prerelease flag', issues);
      compareValue(release.download_url, vsixUrl, 'Release download_url', issues);
      compareValue(
        release.public_base_url,
        PUBLIC_RELEASES_BASE_URL,
        'Release public_base_url',
        issues
      );
      compareValue(release.size_mb, vsixSizeMb, 'Release VSIX size', issues);

      const expectedAssets = {
        vscode: {
          file_name: `eai-gofer-${version}.vsix`,
          download_url: vsixUrl,
          latest_download_url: latestVsixUrl,
          size_mb: vsixSizeMb,
        },
        claude: {
          bundle_url: bundleUrl,
          marketplace_url: `${bundleUrl}/claude-marketplace.json`,
          manifest_url: `${bundleUrl}/claude-plugin.json`,
          download_url: pluginZipUrl,
          latest_download_url: latestPluginZipUrl,
          size_mb: pluginSizeMb,
        },
        codex: {
          bundle_url: bundleUrl,
          marketplace_url: `${bundleUrl}/codex-marketplace.json`,
          manifest_url: `${bundleUrl}/codex-plugin.json`,
          download_url: pluginZipUrl,
          latest_download_url: latestPluginZipUrl,
          size_mb: pluginSizeMb,
        },
        copilot: {
          bundle_url: bundleUrl,
          marketplace_url: `${bundleUrl}/copilot-marketplace.json`,
          manifest_url: `${bundleUrl}/copilot-plugin.json`,
          download_url: pluginZipUrl,
          latest_download_url: latestPluginZipUrl,
          size_mb: pluginSizeMb,
        },
        antigravity: {
          bundle_url: bundleUrl,
          manifest_url: `${bundleUrl}/plugin.json`,
          install_url: 'https://github.com/eai-support/eai-gofer',
          download_url: pluginZipUrl,
          latest_download_url: latestPluginZipUrl,
          size_mb: pluginSizeMb,
        },
        gemini: {
          bundle_url: bundleUrl,
          manifest_url: `${bundleUrl}/gemini-extension.json`,
          commands_manifest_url: `${bundleUrl}/gemini-commands-manifest.json`,
          download_url: pluginZipUrl,
          latest_download_url: latestPluginZipUrl,
          size_mb: pluginSizeMb,
        },
      };

      for (const [surface, expected] of Object.entries(expectedAssets)) {
        const actual = release.assets?.[surface];
        if (!actual) {
          issues.push(`Feed is missing ${surface} asset metadata.`);
          continue;
        }
        for (const [field, value] of Object.entries(expected)) {
          compareValue(actual[field], value, `${surface}.${field}`, issues);
        }
      }
    }

    for (const [publicPath, sourcePath, label] of [
      [versionedVsix, args.vsix, 'Versioned VSIX'],
      [latestVsix, args.vsix, 'Latest VSIX alias'],
      [versionedPluginZip, args.pluginZip, 'Versioned plugin ZIP'],
      [latestPluginZip, args.pluginZip, 'Latest plugin ZIP alias'],
    ]) {
      if (
        !fs.existsSync(publicPath) ||
        !fs.readFileSync(publicPath).equals(fs.readFileSync(sourcePath))
      ) {
        issues.push(`${label} does not match the official release asset.`);
      }
    }

    const markerPath = path.join(args.pluginRoot, '.eai-gofer-plugin-version');
    if (
      !fs.existsSync(markerPath) ||
      fs.readFileSync(markerPath, 'utf8').split(/\r?\n/, 1)[0].trim() !== version
    ) {
      issues.push('Official outer plugin bundle has an incorrect or missing version marker.');
    }
    compareBundle(args.pluginRoot, publicPluginRoot, issues);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  return { matches: issues.length === 0, issues };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let args;
  let result;
  try {
    args = parseArgs(process.argv.slice(2));
    result = verifyPublicReleasePublication(args);
  } catch (error) {
    result = { matches: false, issues: [error instanceof Error ? error.message : String(error)] };
  }

  if (result.matches) {
    if (!args?.quiet)
      console.log(`release-feed-verify: public files and metadata match v${args.version}.`);
    process.exit(0);
  }

  if (!args?.quiet) {
    for (const issue of result.issues) console.error(`release-feed-verify: ${issue}`);
  }
  process.exit(1);
}
