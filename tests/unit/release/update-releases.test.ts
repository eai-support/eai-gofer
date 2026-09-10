import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SOURCE_SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/update-releases.js');
const SOURCE_COMPARATOR_PATH = path.resolve(
  __dirname,
  '../../../scripts/compare-release-versions.mjs'
);

interface ReleaseEntry {
  version: string;
  tag_name: string;
  published_at: string;
  download_url: string;
  notes: string;
  prerelease: boolean;
  size_mb: number;
  sha256?: string;
  public_base_url?: string;
  assets?: {
    claude?: {
      bundle_url: string;
      marketplace_url: string;
      manifest_url: string;
      download_url: string;
      latest_download_url: string;
      size_mb: number;
      sha256?: string;
    };
    codex?: {
      bundle_url: string;
      marketplace_url: string;
      manifest_url: string;
      download_url: string;
      latest_download_url: string;
      size_mb: number;
      sha256?: string;
    };
    copilot?: {
      bundle_url: string;
      marketplace_url: string;
      manifest_url: string;
      download_url: string;
      latest_download_url: string;
      size_mb: number;
      sha256?: string;
    };
    antigravity?: {
      bundle_url: string;
      manifest_url: string;
      commands_manifest_url: string;
      download_url: string;
      latest_download_url: string;
      size_mb: number;
      sha256?: string;
    };
    grok?: {
      bundle_url: string;
      download_url: string;
      latest_download_url: string;
      size_mb: number;
      sha256?: string;
    };
    vscode?: {
      file_name: string;
      download_url: string;
      latest_download_url: string;
      size_mb: number;
      sha256?: string;
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

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeCandidateArtifacts(tmpRoot: string, version: string, vsixBytes = Buffer.alloc(1024)) {
  const pluginBytes = Buffer.from(`plugin-${version}`);
  fs.writeFileSync(path.join(tmpRoot, `eai-gofer-${version}.vsix`), vsixBytes);
  fs.mkdirSync(path.join(tmpRoot, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpRoot, 'dist', `eai-gofer-agent-plugin-${version}.zip`),
    pluginBytes
  );
  return { vsixBytes, pluginBytes };
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
    fs.copyFileSync(
      SOURCE_COMPARATOR_PATH,
      path.join(tmpRoot, 'scripts', 'compare-release-versions.mjs')
    );
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('writes SHA-256 metadata for fresh versioned release artifacts', async () => {
    const version = '3.2.0';
    const { vsixBytes, pluginBytes } = writeCandidateArtifacts(tmpRoot, version);
    fs.writeFileSync(
      releasesPath,
      JSON.stringify({
        latest_version: '3.1.9',
        repository: 'eai-support/eai-gofer',
        last_updated: '2026-05-01T00:00:00.000Z',
        releases: [],
      })
    );

    await execFileAsync('node', [scriptPath, version, 'Fresh release notes']);

    const updated = readReleasesJson(releasesPath);
    const release = updated.releases[0];
    expect(release.version).toBe(version);
    expect(release.prerelease).toBe(false);
    expect(release.sha256).toBe(sha256(vsixBytes));
    expect(release.assets?.vscode?.sha256).toBe(sha256(vsixBytes));
    expect(release.assets?.claude?.sha256).toBe(sha256(pluginBytes));
    expect(release.assets?.codex?.sha256).toBe(sha256(pluginBytes));
    expect(release.assets?.copilot?.sha256).toBe(sha256(pluginBytes));
    expect(release.assets?.antigravity?.sha256).toBe(sha256(pluginBytes));
    expect(release.assets?.grok?.sha256).toBe(sha256(pluginBytes));
    expect(Object.keys(release.assets ?? {})).toEqual([
      'claude',
      'codex',
      'copilot',
      'antigravity',
      'grok',
      'vscode',
    ]);
    expect(release.assets).not.toHaveProperty('gemini');
    expect(release.assets?.antigravity?.manifest_url).toContain('/gemini-extension.json');
    expect(release.assets?.claude?.download_url).toBe(
      `https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-${version}.zip`
    );
    expect(updated.public_base_url).toBe('https://eai-support.github.io/eai-gofer/releases');
  });

  it('derives prerelease metadata from the validated semantic version suffix', async () => {
    const version = '3.2.0-rc.1';
    writeCandidateArtifacts(tmpRoot, version);
    fs.writeFileSync(
      releasesPath,
      JSON.stringify({
        latest_version: '3.1.9',
        repository: 'eai-support/eai-gofer',
        last_updated: '2026-05-01T00:00:00.000Z',
        releases: [],
      })
    );

    await execFileAsync('node', [scriptPath, version, 'Release candidate']);

    expect(readReleasesJson(releasesPath).releases[0].prerelease).toBe(true);
  });

  it('preserves an exact idempotent duplicate byte-for-byte', async () => {
    const version = '3.2.0';
    writeCandidateArtifacts(tmpRoot, version);
    fs.writeFileSync(
      releasesPath,
      JSON.stringify({
        latest_version: '3.1.9',
        repository: 'eai-support/eai-gofer',
        last_updated: '2026-05-01T00:00:00.000Z',
        releases: [],
      })
    );
    await execFileAsync('node', [scriptPath, version, 'Release notes']);
    const firstBytes = fs.readFileSync(releasesPath);

    const { stdout } = await execFileAsync('node', [scriptPath, version, 'Release notes']);

    expect(stdout).toContain(`v${version} is already current with identical metadata`);
    expect(fs.readFileSync(releasesPath).equals(firstBytes)).toBe(true);
  });

  it('rejects a conflicting duplicate and leaves the release feed unchanged', async () => {
    const version = '3.2.0';
    writeCandidateArtifacts(tmpRoot, version);
    fs.writeFileSync(
      releasesPath,
      JSON.stringify({
        latest_version: '3.1.9',
        repository: 'eai-support/eai-gofer',
        last_updated: '2026-05-01T00:00:00.000Z',
        releases: [],
      })
    );
    await execFileAsync('node', [scriptPath, version, 'Original notes']);
    const firstBytes = fs.readFileSync(releasesPath);

    await expect(
      execFileAsync('node', [scriptPath, version, 'Changed notes'])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        `Release v${version} already exists with different immutable metadata`
      ),
    });
    expect(fs.readFileSync(releasesPath).equals(firstBytes)).toBe(true);
  });

  it('rejects a new feed entry when fresh artifact hashes are unavailable', async () => {
    const version = '3.2.0';
    fs.writeFileSync(
      releasesPath,
      JSON.stringify({
        latest_version: '3.1.9',
        repository: 'eai-support/eai-gofer',
        last_updated: '2026-05-01T00:00:00.000Z',
        releases: [],
      })
    );
    const before = fs.readFileSync(releasesPath);

    await expect(
      execFileAsync('node', [scriptPath, version, 'Release notes'])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        `Unable to find fresh root VSIX artifact for v${version}; refusing to publish an unhashed release`
      ),
    });
    expect(fs.readFileSync(releasesPath).equals(before)).toBe(true);
  });

  it('rejects a previously unseen version that is not newer than the current release', async () => {
    const version = '3.1.8';
    writeCandidateArtifacts(tmpRoot, version);
    fs.writeFileSync(
      releasesPath,
      JSON.stringify({
        latest_version: '3.1.9',
        repository: 'eai-support/eai-gofer',
        last_updated: '2026-05-01T00:00:00.000Z',
        releases: [
          {
            version: '3.1.9',
            tag_name: 'v3.1.9',
            published_at: '2026-05-01T00:00:00.000Z',
          },
        ],
      })
    );
    const before = fs.readFileSync(releasesPath);

    await expect(
      execFileAsync('node', [scriptPath, version, 'Downgrade attempt'])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        `Release v${version} must be strictly newer than the current feed version(s) 3.1.9, 3.1.9`
      ),
    });
    expect(fs.readFileSync(releasesPath).equals(before)).toBe(true);
  });

  it('rejects a noncanonical custom download URL', async () => {
    const version = '3.2.1';
    const customUrl = 'https://cdn.example.invalid/releases/eai-gofer-3.2.1.vsix';
    writeCandidateArtifacts(tmpRoot, version);

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

    const before = fs.readFileSync(releasesPath);
    await expect(
      execFileAsync('node', [scriptPath, version, 'Release notes', customUrl])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('Release download URL must use the canonical GitHub Pages'),
    });
    expect(fs.readFileSync(releasesPath).equals(before)).toBe(true);
  });

  it('keeps only the latest five releases', async () => {
    const version = '3.3.2';
    writeCandidateArtifacts(tmpRoot, version);
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
