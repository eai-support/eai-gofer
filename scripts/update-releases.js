#!/usr/bin/env node

/**
 * Script to update releases.json when a new version is released
 * This should be run after creating a new VSIX file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_RELEASES_BASE_URL = 'https://eai-support.github.io/eai-gofer/releases';

function buildVsixUrl(version) {
  return `${PUBLIC_RELEASES_BASE_URL}/eai-gofer-${version}.vsix`;
}

function buildLatestVsixUrl() {
  return `${PUBLIC_RELEASES_BASE_URL}/eai-gofer-latest.vsix`;
}

function buildAgentPluginZipUrl(version) {
  return `${PUBLIC_RELEASES_BASE_URL}/eai-gofer-agent-plugin-${version}.zip`;
}

function buildLatestAgentPluginZipUrl() {
  return `${PUBLIC_RELEASES_BASE_URL}/eai-gofer-agent-plugin-latest.zip`;
}

function buildPublicPluginBundleUrl() {
  return `${PUBLIC_RELEASES_BASE_URL}/plugins/eai-gofer`;
}

function sizeInMb(candidatePath) {
  const stats = fs.statSync(candidatePath);
  return Number((stats.size / (1024 * 1024)).toFixed(1));
}

function firstExistingPath(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate));
}

// Get version from command line or package.json
const version =
  process.argv[2] ||
  JSON.parse(fs.readFileSync(path.join(__dirname, '../extension/package.json'), 'utf8')).version;
const releaseNotes = process.argv[3] || 'New release';
const customDownloadUrl = process.argv[4]; // Optional custom download URL

const releasesPath = path.join(__dirname, '../docs-site/static/releases.json');
const releases = JSON.parse(fs.readFileSync(releasesPath, 'utf8'));

// Determine download URL - use custom URL if provided, otherwise default to the
// GitHub Pages release host that mirrors the shipped binaries.
const downloadUrl = customDownloadUrl || buildVsixUrl(version);
const agentPluginDownloadUrl = buildAgentPluginZipUrl(version);
const publicPluginBundleUrl = buildPublicPluginBundleUrl();
const latestVsixUrl = buildLatestVsixUrl();
const latestAgentPluginZipUrl = buildLatestAgentPluginZipUrl();

// Calculate actual file size from local release output if available.
const candidateVsixPaths = [
  path.join(__dirname, '..', `eai-gofer-${version}.vsix`),
  path.join(__dirname, '..', `gofer-${version}.vsix`),
  path.join(__dirname, '../extension', `eai-gofer-${version}.vsix`),
  path.join(__dirname, '../extension', `gofer-${version}.vsix`),
  path.join(__dirname, '../docs-site/static/releases', `eai-gofer-${version}.vsix`),
  path.join(__dirname, '../docs-site/static/releases', `gofer-${version}.vsix`),
];
const candidatePluginZipPaths = [
  path.join(__dirname, '../dist', `eai-gofer-agent-plugin-${version}.zip`),
  path.join(__dirname, '../docs-site/static/releases', `eai-gofer-agent-plugin-${version}.zip`),
];
const vsixPath = firstExistingPath(candidateVsixPaths);
const pluginZipPath = firstExistingPath(candidatePluginZipPaths);
const vsixSizeMb = vsixPath ? sizeInMb(vsixPath) : 8.5;
const agentPluginSizeMb = pluginZipPath ? sizeInMb(pluginZipPath) : 1.5;

// Create new release entry
const newRelease = {
  version: version,
  tag_name: `v${version}`,
  published_at: new Date().toISOString(),
  download_url: downloadUrl,
  notes: releaseNotes,
  prerelease: false,
  size_mb: vsixSizeMb,
  public_base_url: PUBLIC_RELEASES_BASE_URL,
  assets: {
    vscode: {
      file_name: `eai-gofer-${version}.vsix`,
      download_url: downloadUrl,
      latest_download_url: latestVsixUrl,
      size_mb: vsixSizeMb,
    },
    claude: {
      bundle_url: publicPluginBundleUrl,
      marketplace_url: `${publicPluginBundleUrl}/claude-marketplace.json`,
      manifest_url: `${publicPluginBundleUrl}/claude-plugin.json`,
      download_url: agentPluginDownloadUrl,
      latest_download_url: latestAgentPluginZipUrl,
      size_mb: agentPluginSizeMb,
    },
    codex: {
      bundle_url: publicPluginBundleUrl,
      marketplace_url: `${publicPluginBundleUrl}/codex-marketplace.json`,
      manifest_url: `${publicPluginBundleUrl}/codex-plugin.json`,
      download_url: agentPluginDownloadUrl,
      latest_download_url: latestAgentPluginZipUrl,
      size_mb: agentPluginSizeMb,
    },
    copilot: {
      bundle_url: publicPluginBundleUrl,
      marketplace_url: `${publicPluginBundleUrl}/copilot-marketplace.json`,
      manifest_url: `${publicPluginBundleUrl}/copilot-plugin.json`,
      download_url: agentPluginDownloadUrl,
      latest_download_url: latestAgentPluginZipUrl,
      size_mb: agentPluginSizeMb,
    },
    antigravity: {
      surfaces: ['cli', 'desktop'],
      bundle_url: `${publicPluginBundleUrl}/plugins/antigravity/eai-gofer`,
      manifest_url: `${publicPluginBundleUrl}/plugins/antigravity/eai-gofer/plugin.json`,
      download_url: agentPluginDownloadUrl,
      latest_download_url: latestAgentPluginZipUrl,
      size_mb: agentPluginSizeMb,
    },
  },
};

// Replace any existing entry for the same version before prepending the latest.
releases.releases = releases.releases.filter((release) => {
  return release.version !== version && release.tag_name !== `v${version}`;
});

// Add to beginning of releases array
releases.releases.unshift(newRelease);

// Update latest version
releases.latest_version = version;
releases.last_updated = new Date().toISOString();
releases.public_base_url = PUBLIC_RELEASES_BASE_URL;

// Keep only the latest five releases to avoid advertising stale downloads.
releases.releases = releases.releases.slice(0, 5);

// Write back to file
fs.writeFileSync(releasesPath, JSON.stringify(releases, null, 2));
