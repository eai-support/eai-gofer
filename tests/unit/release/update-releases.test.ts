import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SOURCE_SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/update-releases.js');

interface ReleaseEntry {
  version: string;
  tag_name: string;
  published_at: string;
  download_url: string;
  notes: string;
  prerelease: boolean;
  size_mb: number;
  public_base_url?: string;
  assets?: {
    claude?: {
      bundle_url: string;
      marketplace_url: string;
      manifest_url: string;
      download_url: string;
      latest_download_url: string;
      size_mb: number;
    };
    codex?: {
      bundle_url: string;
      marketplace_url: string;
      manifest_url: string;
      download_url: string;
      latest_download_url: string;
      size_mb: number;
    };
    antigravity?: {
      bundle_url: string;
      manifest_url: string;
      surfaces: string[];
      download_url: string;
      latest_download_url: string;
      size_mb: number;
    };
    vscode?: {
      file_name: string;
      download_url: string;
      latest_download_url: string;
      size_mb: number;
    };
  };
}

interface ReleasesJson {
  latest_version: string;
  repository: string;
  last_updated: string;
  public_base_url?: string;
  releases: ReleaseEntry[];
}

function readReleasesJson(releasesPath: string): ReleasesJson {
  return JSON.parse(fs.readFileSync(releasesPath, 'utf8')) as ReleasesJson;
}

describe('update-releases.js', () => {
  let tmpRoot: string;
  let docsSiteStaticDir: string;
  let releasesPath: string;
  let scriptPath: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'update-releases-test-'));
    docsSiteStaticDir = path.join(tmpRoot, 'docs-site', 'static');
    releasesPath = path.join(docsSiteStaticDir, 'releases.json');
    scriptPath = path.join(tmpRoot, 'scripts', 'update-releases.js');

    fs.mkdirSync(path.join(docsSiteStaticDir, 'releases'), { recursive: true });
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.copyFileSync(SOURCE_SCRIPT_PATH, scriptPath);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('dedupes an existing version before prepending the new release entry', async () => {
    const duplicateVersion = '3.2.0';
    const duplicateVsixPath = path.join(
      docsSiteStaticDir,
      'releases',
      `eai-gofer-${duplicateVersion}.vsix`
    );

    fs.writeFileSync(
      releasesPath,
      JSON.stringify(
        {
          latest_version: '3.1.9',
          repository: 'eai-support/eai-gofer',
          last_updated: '2026-05-01T00:00:00.000Z',
          releases: [
            {
              version: duplicateVersion,
              tag_name: `v${duplicateVersion}`,
              published_at: '2026-05-01T00:00:00.000Z',
              download_url: 'https://example.invalid/old.vsix',
              notes: 'Old notes',
              prerelease: false,
              size_mb: 8.5,
            },
            {
              version: '3.1.9',
              tag_name: 'v3.1.9',
              published_at: '2026-04-30T00:00:00.000Z',
              download_url: 'https://eai-support.github.io/eai-gofer/releases/eai-gofer-3.1.9.vsix',
              notes: 'Previous release',
              prerelease: false,
              size_mb: 8.5,
              assets: {
                gemini: { manifest_url: 'https://example.invalid/historical-gemini.json' },
              },
            },
          ],
        },
        null,
        2
      )
    );
    fs.writeFileSync(duplicateVsixPath, Buffer.alloc(1024 * 1024));

    await execFileAsync('node', [scriptPath, duplicateVersion, 'Fresh release notes']);

    const updated = readReleasesJson(releasesPath);
    const matchingEntries = updated.releases.filter(
      (release) => release.version === duplicateVersion
    );

    expect(updated.latest_version).toBe(duplicateVersion);
    expect(updated.public_base_url).toBe('https://eai-support.github.io/eai-gofer/releases');
    expect(matchingEntries).toHaveLength(1);
    expect(updated.releases[0].tag_name).toBe(`v${duplicateVersion}`);
    expect(updated.releases[0].notes).toBe('Fresh release notes');
    expect(updated.releases[0].download_url).toBe(
      `https://eai-support.github.io/eai-gofer/releases/eai-gofer-${duplicateVersion}.vsix`
    );
    expect(updated.releases[0].size_mb).toBe(1);
    expect(updated.releases[0].assets?.claude?.download_url).toBe(
      `https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-${duplicateVersion}.zip`
    );
    expect(updated.releases[0].assets?.claude?.bundle_url).toBe(
      'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer'
    );
    expect(updated.releases[0].assets?.codex?.manifest_url).toBe(
      'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/codex-plugin.json'
    );
    expect(updated.releases[0].assets?.antigravity?.manifest_url).toBe(
      'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/plugins/antigravity/eai-gofer/plugin.json'
    );
    expect(updated.releases[0].assets?.antigravity?.surfaces).toEqual(['cli', 'desktop']);
    expect(updated.releases[0].assets).not.toHaveProperty('gemini');
    expect(updated.releases[1].version).toBe('3.1.9');
    expect(updated.releases[1].assets).toEqual({
      gemini: { manifest_url: 'https://example.invalid/historical-gemini.json' },
    });
  });

  it('honors a custom download URL when one is provided', async () => {
    const version = '3.2.1';
    const customUrl = 'https://cdn.example.invalid/releases/eai-gofer-3.2.1.vsix';

    fs.writeFileSync(
      releasesPath,
      JSON.stringify(
        {
          latest_version: '3.2.0',
          repository: 'eai-support/eai-gofer',
          last_updated: '2026-05-01T00:00:00.000Z',
          releases: [],
        },
        null,
        2
      )
    );

    await execFileAsync('node', [scriptPath, version, 'Release notes', customUrl]);

    const updated = readReleasesJson(releasesPath);

    expect(updated.latest_version).toBe(version);
    expect(updated.releases[0].download_url).toBe(customUrl);
    expect(updated.releases[0].tag_name).toBe(`v${version}`);
  });

  it('keeps only the latest five releases', async () => {
    const version = '3.3.2';
    const existingReleases = ['3.3.1', '3.3.0', '3.2.2', '3.2.1', '3.2.0'].map(
      (releaseVersion) => ({
        version: releaseVersion,
        tag_name: `v${releaseVersion}`,
        published_at: '2026-05-01T00:00:00.000Z',
        download_url: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-${releaseVersion}.vsix`,
        notes: `Release ${releaseVersion}`,
        prerelease: false,
        size_mb: 8.5,
      })
    );

    fs.writeFileSync(
      releasesPath,
      JSON.stringify(
        {
          latest_version: '3.3.1',
          repository: 'eai-support/eai-gofer',
          last_updated: '2026-05-01T00:00:00.000Z',
          releases: existingReleases,
        },
        null,
        2
      )
    );

    await execFileAsync('node', [scriptPath, version, 'New retention-capped release']);

    const updated = readReleasesJson(releasesPath);

    expect(updated.releases).toHaveLength(5);
    expect(updated.releases.map((release) => release.version)).toEqual([
      version,
      '3.3.1',
      '3.3.0',
      '3.2.2',
      '3.2.1',
    ]);
    expect(updated.releases.some((release) => release.version === '3.2.0')).toBe(false);
  });
});
