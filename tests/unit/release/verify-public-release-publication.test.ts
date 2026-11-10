import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SOURCE_SCRIPT_PATH = path.resolve(
  __dirname,
  '../../../scripts/verify-public-release-publication.mjs'
);
const VERSION = '3.14.5';
const PUBLISHED_AT = '2026-10-15T18:55:01Z';
const RELEASE_NOTES = '# Gofer v3.14.5\n\nOfficial release notes.\n\n';
const RELEASES_BASE_URL = 'https://eai-support.github.io/eai-gofer/releases';
const PLUGIN_BUNDLE_URL = `${RELEASES_BASE_URL}/plugins/eai-gofer`;

function writeFile(root: string, relativePath: string, contents: string | Buffer): string {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function expectedRelease(vsixSizeMb = 1, pluginSizeMb = 2) {
  const vsixUrl = `${RELEASES_BASE_URL}/eai-gofer-${VERSION}.vsix`;
  const latestVsixUrl = `${RELEASES_BASE_URL}/eai-gofer-latest.vsix`;
  const pluginZipUrl = `${RELEASES_BASE_URL}/eai-gofer-agent-plugin-${VERSION}.zip`;
  const latestPluginZipUrl = `${RELEASES_BASE_URL}/eai-gofer-agent-plugin-latest.zip`;
  const hostAssets = {
    bundle_url: PLUGIN_BUNDLE_URL,
    download_url: pluginZipUrl,
    latest_download_url: latestPluginZipUrl,
    size_mb: pluginSizeMb,
  };

  return {
    version: VERSION,
    tag_name: `v${VERSION}`,
    published_at: new Date(PUBLISHED_AT).toISOString(),
    download_url: vsixUrl,
    notes: RELEASE_NOTES,
    prerelease: false,
    size_mb: vsixSizeMb,
    public_base_url: RELEASES_BASE_URL,
    assets: {
      vscode: {
        file_name: `eai-gofer-${VERSION}.vsix`,
        download_url: vsixUrl,
        latest_download_url: latestVsixUrl,
        size_mb: vsixSizeMb,
      },
      claude: {
        ...hostAssets,
        marketplace_url: `${PLUGIN_BUNDLE_URL}/claude-marketplace.json`,
        manifest_url: `${PLUGIN_BUNDLE_URL}/claude-plugin.json`,
      },
      codex: {
        ...hostAssets,
        marketplace_url: `${PLUGIN_BUNDLE_URL}/codex-marketplace.json`,
        manifest_url: `${PLUGIN_BUNDLE_URL}/codex-plugin.json`,
      },
      copilot: {
        ...hostAssets,
        marketplace_url: `${PLUGIN_BUNDLE_URL}/copilot-marketplace.json`,
        manifest_url: `${PLUGIN_BUNDLE_URL}/copilot-plugin.json`,
      },
      antigravity: {
        ...hostAssets,
        manifest_url: `${PLUGIN_BUNDLE_URL}/plugin.json`,
        install_url: 'https://github.com/eai-support/eai-gofer',
      },
      gemini: {
        ...hostAssets,
        manifest_url: `${PLUGIN_BUNDLE_URL}/gemini-extension.json`,
        commands_manifest_url: `${PLUGIN_BUNDLE_URL}/gemini-commands-manifest.json`,
      },
    },
  };
}

describe('verify-public-release-publication.mjs', () => {
  let tmpRoot: string;
  let officialRoot: string;
  let pluginRoot: string;
  let releasesPath: string;
  let officialMetadataPath: string;
  let publicReleasesDir: string;
  let publicPluginRoot: string;
  let vsixPath: string;
  let pluginZipPath: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-public-release-'));
    officialRoot = path.join(tmpRoot, 'official-release');
    pluginRoot = path.join(officialRoot, 'eai-gofer');
    publicReleasesDir = path.join(tmpRoot, 'docs-site', 'static', 'releases');
    publicPluginRoot = path.join(publicReleasesDir, 'plugins', 'eai-gofer');
    releasesPath = path.join(tmpRoot, 'docs-site', 'static', 'releases.json');
    officialMetadataPath = path.join(officialRoot, 'release.json');
    vsixPath = path.join(officialRoot, `eai-gofer-${VERSION}.vsix`);
    pluginZipPath = path.join(officialRoot, `eai-gofer-agent-plugin-${VERSION}.zip`);

    fs.mkdirSync(officialRoot, { recursive: true });
    fs.mkdirSync(publicReleasesDir, { recursive: true });
    fs.writeFileSync(vsixPath, Buffer.alloc(1024 * 1024, 1));
    fs.writeFileSync(pluginZipPath, Buffer.alloc(2 * 1024 * 1024, 2));
    fs.writeFileSync(
      officialMetadataPath,
      JSON.stringify({
        tagName: `v${VERSION}`,
        isDraft: false,
        isPrerelease: false,
        publishedAt: PUBLISHED_AT,
        body: RELEASE_NOTES,
        name: `Gofer v${VERSION}`,
      })
    );

    writeFile(pluginRoot, '.eai-gofer-plugin-version', `${VERSION}\ngenerated-by-eai-gofer\n`);
    writeFile(pluginRoot, 'AGENTS.md', 'Outer release instructions');
    writeFile(pluginRoot, 'README.md', 'Outer release readme');
    writeFile(pluginRoot, 'commands/eai.md', 'Outer release command');
    writeFile(pluginRoot, 'plugin.json', '{"name":"outer-release"}');
    writeFile(pluginRoot, 'plugins/eai-gofer/plugin.json', '{"name":"nested-plugin"}');
    writeFile(pluginRoot, '.claude-plugin/plugin.json', '{"name":"claude"}');
    writeFile(pluginRoot, '.claude-plugin/marketplace.json', '{"name":"claude-marketplace"}');
    writeFile(pluginRoot, '.codex-plugin/plugin.json', '{"name":"codex"}');
    writeFile(pluginRoot, '.agents/plugins/marketplace.json', '{"name":"codex-marketplace"}');
    writeFile(pluginRoot, '.github/plugin/plugin.json', '{"name":"copilot"}');
    writeFile(pluginRoot, '.github/plugin/marketplace.json', '{"name":"copilot-marketplace"}');
    writeFile(pluginRoot, '.gemini/extension.json', '{"name":"gemini"}');
    writeFile(pluginRoot, '.gemini/commands/gofer/manifest.json', '{"commands":[]}');
    writeFile(pluginRoot, '.specify/scripts/node/gofer-surface-update.mjs', 'export {};');
    writeFile(pluginRoot, '.specify/scripts/node/gofer-local-settings-cleanup.mjs', 'export {};');

    fs.cpSync(pluginRoot, publicPluginRoot, { recursive: true });
    for (const [source, alias] of [
      ['.claude-plugin/plugin.json', 'claude-plugin.json'],
      ['.claude-plugin/marketplace.json', 'claude-marketplace.json'],
      ['.codex-plugin/plugin.json', 'codex-plugin.json'],
      ['.agents/plugins/marketplace.json', 'codex-marketplace.json'],
      ['.github/plugin/plugin.json', 'copilot-plugin.json'],
      ['.github/plugin/marketplace.json', 'copilot-marketplace.json'],
      ['.gemini/extension.json', 'gemini-extension.json'],
      ['.gemini/commands/gofer/manifest.json', 'gemini-commands-manifest.json'],
      ['.specify/scripts/node/gofer-surface-update.mjs', 'gofer-surface-update.mjs'],
      [
        '.specify/scripts/node/gofer-local-settings-cleanup.mjs',
        'gofer-local-settings-cleanup.mjs',
      ],
    ]) {
      fs.copyFileSync(path.join(pluginRoot, source), path.join(publicPluginRoot, alias));
    }

    for (const filePath of [
      path.join(publicReleasesDir, `eai-gofer-${VERSION}.vsix`),
      path.join(publicReleasesDir, 'eai-gofer-latest.vsix'),
    ]) {
      fs.copyFileSync(vsixPath, filePath);
    }
    for (const filePath of [
      path.join(publicReleasesDir, `eai-gofer-agent-plugin-${VERSION}.zip`),
      path.join(publicReleasesDir, 'eai-gofer-agent-plugin-latest.zip'),
    ]) {
      fs.copyFileSync(pluginZipPath, filePath);
    }
    fs.writeFileSync(
      releasesPath,
      JSON.stringify(
        {
          latest_version: VERSION,
          repository: 'eai-support/eai-gofer',
          public_base_url: RELEASES_BASE_URL,
          last_updated: '2026-10-15T19:00:00.000Z',
          releases: [expectedRelease()],
        },
        null,
        2
      )
    );
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  async function runVerifier(): Promise<number> {
    try {
      await execFileAsync(
        'node',
        [
          SOURCE_SCRIPT_PATH,
          '--root',
          tmpRoot,
          '--version',
          VERSION,
          '--release-metadata-file',
          officialMetadataPath,
          '--vsix',
          vsixPath,
          '--plugin-zip',
          pluginZipPath,
          '--plugin-root',
          pluginRoot,
        ],
        { cwd: tmpRoot }
      );
      return 0;
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 1) return 1;
      throw error;
    }
  }

  it('accepts exact official metadata, assets, aliases, and the full outer bundle', async () => {
    expect(await runVerifier()).toBe(0);
  });

  it('rejects shortened or stale release notes', async () => {
    const feed = JSON.parse(fs.readFileSync(releasesPath, 'utf8'));
    feed.releases[0].notes = 'Shortened notes';
    fs.writeFileSync(releasesPath, JSON.stringify(feed));

    expect(await runVerifier()).toBe(1);
  });

  it('rejects official metadata for a different release', async () => {
    const officialRelease = JSON.parse(fs.readFileSync(officialMetadataPath, 'utf8'));
    officialRelease.tagName = 'v3.14.4';
    fs.writeFileSync(officialMetadataPath, JSON.stringify(officialRelease));

    expect(await runVerifier()).toBe(1);
  });

  it('rejects draft and prerelease metadata', async () => {
    const officialRelease = JSON.parse(fs.readFileSync(officialMetadataPath, 'utf8'));

    for (const releaseState of [{ isDraft: true }, { isPrerelease: true }]) {
      fs.writeFileSync(
        officialMetadataPath,
        JSON.stringify({ ...officialRelease, ...releaseState })
      );

      expect(await runVerifier()).toBe(1);
    }
  });

  it('rejects a different publication time', async () => {
    const feed = JSON.parse(fs.readFileSync(releasesPath, 'utf8'));
    feed.releases[0].published_at = '2026-10-15T18:55:02.000Z';
    fs.writeFileSync(releasesPath, JSON.stringify(feed));

    expect(await runVerifier()).toBe(1);
  });

  it('rejects stale artifact sizes in the feed', async () => {
    const feed = JSON.parse(fs.readFileSync(releasesPath, 'utf8'));
    feed.releases[0].assets.codex.size_mb = 1.5;
    fs.writeFileSync(releasesPath, JSON.stringify(feed));

    expect(await runVerifier()).toBe(1);
  });

  it('rejects a stale stable binary alias', async () => {
    fs.writeFileSync(path.join(publicReleasesDir, 'eai-gofer-latest.vsix'), 'stale alias');

    expect(await runVerifier()).toBe(1);
  });

  it('rejects a missing outer release file even when the nested plugin exists', async () => {
    fs.rmSync(path.join(publicPluginRoot, 'AGENTS.md'));

    expect(await runVerifier()).toBe(1);
  });

  it('rejects an unexpected stale file in the public bundle', async () => {
    writeFile(publicPluginRoot, 'old-version/obsolete-command.md', 'stale');

    expect(await runVerifier()).toBe(1);
  });
});
