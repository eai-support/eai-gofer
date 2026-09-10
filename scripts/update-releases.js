#!/usr/bin/env node

/**
 * Script to update releases.json when a new version is released
 * This should be run after creating a new VSIX file
 */

import fs from 'fs';
import { createHash } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { compareReleaseVersions } from './compare-release-versions.mjs';

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

function requireExistingPath(candidates, label) {
  const candidate = firstExistingPath(candidates);
  if (!candidate) {
    throw new Error(`Unable to find fresh ${label}; refusing to publish an unhashed release.`);
  }
  return candidate;
}

function sha256(candidatePath) {
  return createHash('sha256').update(fs.readFileSync(candidatePath)).digest('hex');
}

function withSha256(payload, digest) {
  return digest ? { ...payload, sha256: digest } : payload;
}

// Get version from command line or package.json
const version =
  process.argv[2] ||
  JSON.parse(fs.readFileSync(path.join(__dirname, '../extension/package.json'), 'utf8')).version;
compareReleaseVersions(version, version);
const prerelease = version.includes('-');
const releaseNotes = process.argv[3] || 'New release';
const customDownloadUrl = process.argv[4]; // Optional custom download URL

const releasesPath = path.join(__dirname, '../docs-site/static/releases.json');
const releases = JSON.parse(fs.readFileSync(releasesPath, 'utf8'));

// Determine download URL - use custom URL if provided, otherwise default to the
// GitHub Pages release host that mirrors the shipped binaries.
const canonicalDownloadUrl = buildVsixUrl(version);
if (customDownloadUrl && customDownloadUrl !== canonicalDownloadUrl) {
  throw new Error(
    `Release download URL must use the canonical GitHub Pages location ${canonicalDownloadUrl}.`
  );
}
const downloadUrl = canonicalDownloadUrl;
const agentPluginDownloadUrl = buildAgentPluginZipUrl(version);
const publicPluginBundleUrl = buildPublicPluginBundleUrl();
const latestVsixUrl = buildLatestVsixUrl();
const latestAgentPluginZipUrl = buildLatestAgentPluginZipUrl();

// Calculate actual file size from local release output if available.
const candidateVsixPaths = [path.join(__dirname, '..', `eai-gofer-${version}.vsix`)];
const candidatePluginZipPaths = [
  path.join(__dirname, '../dist', `eai-gofer-agent-plugin-${version}.zip`),
];
const vsixPath = requireExistingPath(candidateVsixPaths, `root VSIX artifact for v${version}`);
const pluginZipPath = requireExistingPath(
  candidatePluginZipPaths,
  `dist agent plugin artifact for v${version}`
);
const vsixSizeMb = sizeInMb(vsixPath);
const agentPluginSizeMb = sizeInMb(pluginZipPath);
const vsixSha256 = sha256(vsixPath);
const agentPluginSha256 = sha256(pluginZipPath);

// Create new release entry
const newRelease = withSha256(
  {
    version: version,
    tag_name: `v${version}`,
    published_at: new Date().toISOString(),
    download_url: downloadUrl,
    notes: releaseNotes,
    prerelease,
    size_mb: vsixSizeMb,
    public_base_url: PUBLIC_RELEASES_BASE_URL,
    assets: {
      claude: withSha256(
        {
          bundle_url: publicPluginBundleUrl,
          marketplace_url: `${publicPluginBundleUrl}/claude-marketplace.json`,
          manifest_url: `${publicPluginBundleUrl}/claude-plugin.json`,
          download_url: agentPluginDownloadUrl,
          latest_download_url: latestAgentPluginZipUrl,
          size_mb: agentPluginSizeMb,
        },
        agentPluginSha256
      ),
      codex: withSha256(
        {
          bundle_url: publicPluginBundleUrl,
          marketplace_url: `${publicPluginBundleUrl}/codex-marketplace.json`,
          manifest_url: `${publicPluginBundleUrl}/codex-plugin.json`,
          download_url: agentPluginDownloadUrl,
          latest_download_url: latestAgentPluginZipUrl,
          size_mb: agentPluginSizeMb,
        },
        agentPluginSha256
      ),
      copilot: withSha256(
        {
          bundle_url: publicPluginBundleUrl,
          marketplace_url: `${publicPluginBundleUrl}/copilot-marketplace.json`,
          manifest_url: `${publicPluginBundleUrl}/copilot-plugin.json`,
          download_url: agentPluginDownloadUrl,
          latest_download_url: latestAgentPluginZipUrl,
          size_mb: agentPluginSizeMb,
        },
        agentPluginSha256
      ),
      antigravity: withSha256(
        {
          bundle_url: publicPluginBundleUrl,
          manifest_url: `${publicPluginBundleUrl}/gemini-extension.json`,
          commands_manifest_url: `${publicPluginBundleUrl}/gemini-commands-manifest.json`,
          download_url: agentPluginDownloadUrl,
          latest_download_url: latestAgentPluginZipUrl,
          size_mb: agentPluginSizeMb,
        },
        agentPluginSha256
      ),
      grok: withSha256(
        {
          bundle_url: publicPluginBundleUrl,
          download_url: agentPluginDownloadUrl,
          latest_download_url: latestAgentPluginZipUrl,
          size_mb: agentPluginSizeMb,
        },
        agentPluginSha256
      ),
      vscode: withSha256(
        {
          file_name: `eai-gofer-${version}.vsix`,
          download_url: downloadUrl,
          latest_download_url: latestVsixUrl,
          size_mb: vsixSizeMb,
        },
        vsixSha256
      ),
    },
  },
  vsixSha256
);

if (!Array.isArray(releases.releases)) {
  throw new Error('releases.json must contain a releases array.');
}

// Published version descriptors are immutable. A retry is allowed only when it
// describes exactly the already-current release; preserve its original dates
// and leave the file byte-for-byte unchanged in that case.
const matchingEntries = releases.releases.filter(
  (release) => release.version === version || release.tag_name === `v${version}`
);
if (matchingEntries.length > 0) {
  if (matchingEntries.length !== 1) {
    throw new Error(`Release v${version} has conflicting duplicate descriptors.`);
  }

  const existingRelease = matchingEntries[0];
  const idempotentRelease = { ...newRelease, published_at: existingRelease.published_at };
  const isCurrent = releases.latest_version === version && releases.releases[0] === existingRelease;
  if (!isCurrent || JSON.stringify(existingRelease) !== JSON.stringify(idempotentRelease)) {
    throw new Error(`Release v${version} already exists with different immutable metadata.`);
  }

  console.log(`release-feed: v${version} is already current with identical metadata`);
  process.exit(0);
}

const currentVersions = [releases.latest_version, releases.releases[0]?.version].filter(Boolean);
if (currentVersions.length === 0) {
  throw new Error('Release feed has no current version; refusing to establish latest implicitly.');
}
if (
  currentVersions.some((currentVersion) => compareReleaseVersions(version, currentVersion) <= 0)
) {
  throw new Error(
    `Release v${version} must be strictly newer than the current feed version(s) ${currentVersions.join(', ')}.`
  );
}

// Add to beginning of releases array
releases.releases.unshift(newRelease);

// Update latest version
releases.latest_version = version;
releases.last_updated = new Date().toISOString();
releases.public_base_url = PUBLIC_RELEASES_BASE_URL;

// Keep only the latest five releases to avoid advertising stale downloads.
releases.releases = releases.releases.slice(0, 5);

// Write back to file
fs.writeFileSync(releasesPath, `${JSON.stringify(releases, null, 2)}\n`);
