import { describe, expect, it } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  CURRENT_SEMANTIC_HOSTS,
  SEMANTIC_HOST_INVOCATION_PREFIX,
} from '../../../extension/src/config/semanticHosts';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, '../../..');
const publicAliases = [
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

function copyRepoFile(relativePath: string, targetRoot: string): void {
  const target = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, relativePath), target);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function replacePublicVsixFromExtractedTree(
  root: string,
  version: string,
  mutate: (extractedRoot: string) => void
): { candidateBytes: Buffer; publicBytes: Buffer } {
  const candidatePath = path.join(root, `eai-gofer-${version}.vsix`);
  const publicPath = path.join(
    root,
    'docs-site',
    'static',
    'releases',
    `eai-gofer-${version}.vsix`
  );
  const latestPath = path.join(root, 'docs-site', 'static', 'releases', 'eai-gofer-latest.vsix');
  const extractedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-vsix-repack-'));
  try {
    execFileSync('unzip', ['-qq', candidatePath, '-d', extractedRoot]);
    mutate(extractedRoot);
    fs.rmSync(publicPath);
    execFileSync('zip', ['-qr', publicPath, '.'], { cwd: extractedRoot });
    const publicBytes = fs.readFileSync(publicPath);
    fs.writeFileSync(latestPath, publicBytes);

    const feedPath = path.join(root, 'docs-site', 'static', 'releases.json');
    const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
    const publicHash = sha256(publicBytes);
    feed.releases[0].sha256 = publicHash;
    feed.releases[0].assets.vscode.sha256 = publicHash;
    fs.writeFileSync(feedPath, JSON.stringify(feed));
    return { candidateBytes: fs.readFileSync(candidatePath), publicBytes };
  } finally {
    fs.rmSync(extractedRoot, { recursive: true, force: true });
  }
}

function createPublicReleaseFixture(version: string): {
  root: string;
  candidateRoot: string;
  stagedRoot: string;
  publicRoot: string;
  latestVsix: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-public-release-'));
  for (const relativePath of [
    'package.json',
    'extension/package.json',
    '.specify/scripts/node/gofer-surface-update.mjs',
    '.specify/scripts/bash/install-optional-tools.sh',
    '.specify/scripts/powershell/install-optional-tools.ps1',
  ]) {
    copyRepoFile(relativePath, root);
  }
  fs.mkdirSync(path.join(root, 'extension'), { recursive: true });
  fs.cpSync(
    path.join(repoRoot, 'extension', 'resources'),
    path.join(root, 'extension', 'resources'),
    {
      recursive: true,
    }
  );

  const candidateRoot = path.join(root, 'plugins', 'eai-gofer');
  fs.mkdirSync(path.dirname(candidateRoot), { recursive: true });
  fs.cpSync(path.join(repoRoot, 'plugins', 'eai-gofer'), candidateRoot, { recursive: true });
  const publicRoot = path.join(root, 'docs-site', 'static', 'releases', 'plugins', 'eai-gofer');
  fs.mkdirSync(path.dirname(publicRoot), { recursive: true });
  fs.cpSync(candidateRoot, publicRoot, { recursive: true });
  for (const [source, alias] of publicAliases) {
    fs.copyFileSync(path.join(publicRoot, source), path.join(publicRoot, alias));
  }

  const releasesRoot = path.join(root, 'docs-site', 'static', 'releases');
  const candidateVsix = path.join(root, `eai-gofer-${version}.vsix`);
  const candidatePlugin = path.join(root, 'dist', `eai-gofer-agent-plugin-${version}.zip`);
  const stagedRoot = path.join(root, 'dist', `eai-gofer-agent-plugin-${version}`, 'eai-gofer');
  const latestVsix = path.join(releasesRoot, 'eai-gofer-latest.vsix');
  fs.mkdirSync(path.dirname(candidatePlugin), { recursive: true });
  fs.cpSync(candidateRoot, stagedRoot, { recursive: true });
  const vsixInput = path.join(root, '.fixture-vsix');
  fs.mkdirSync(path.join(vsixInput, 'extension'), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'extension', 'package.json'),
    path.join(vsixInput, 'extension', 'package.json')
  );
  fs.cpSync(
    path.join(root, 'extension', 'resources'),
    path.join(vsixInput, 'extension', 'resources'),
    { recursive: true }
  );
  for (const runtimePath of [
    'extension/dist/extension.js',
    'extension/language-server/dist/server.js',
  ]) {
    const target = path.join(vsixInput, runtimePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `fixture runtime: ${runtimePath}\n`);
  }
  execFileSync('zip', ['-qr', candidateVsix, '.'], { cwd: vsixInput });
  execFileSync('zip', ['-qr', candidatePlugin, 'eai-gofer'], {
    cwd: path.join(root, 'plugins'),
  });
  fs.rmSync(vsixInput, { recursive: true, force: true });
  const vsixBytes = fs.readFileSync(candidateVsix);
  const pluginBytes = fs.readFileSync(candidatePlugin);
  fs.writeFileSync(path.join(releasesRoot, `eai-gofer-${version}.vsix`), vsixBytes);
  fs.writeFileSync(latestVsix, vsixBytes);
  fs.writeFileSync(path.join(releasesRoot, `eai-gofer-agent-plugin-${version}.zip`), pluginBytes);
  fs.writeFileSync(path.join(releasesRoot, 'eai-gofer-agent-plugin-latest.zip'), pluginBytes);

  const vsixHash = sha256(vsixBytes);
  const pluginHash = sha256(pluginBytes);
  fs.writeFileSync(
    path.join(root, 'docs-site', 'static', 'releases.json'),
    JSON.stringify({
      latest_version: version,
      public_base_url: 'https://eai-support.github.io/eai-gofer/releases',
      releases: [
        {
          version,
          tag_name: `v${version}`,
          download_url: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-${version}.vsix`,
          public_base_url: 'https://eai-support.github.io/eai-gofer/releases',
          prerelease: version.includes('-'),
          sha256: vsixHash,
          assets: {
            claude: {
              bundle_url: 'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer',
              marketplace_url:
                'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/claude-marketplace.json',
              manifest_url:
                'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/claude-plugin.json',
              download_url: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-${version}.zip`,
              latest_download_url:
                'https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-latest.zip',
              sha256: pluginHash,
            },
            codex: {
              bundle_url: 'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer',
              marketplace_url:
                'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/codex-marketplace.json',
              manifest_url:
                'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/codex-plugin.json',
              download_url: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-${version}.zip`,
              latest_download_url:
                'https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-latest.zip',
              sha256: pluginHash,
            },
            copilot: {
              bundle_url: 'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer',
              marketplace_url:
                'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/copilot-marketplace.json',
              manifest_url:
                'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/copilot-plugin.json',
              download_url: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-${version}.zip`,
              latest_download_url:
                'https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-latest.zip',
              sha256: pluginHash,
            },
            antigravity: {
              bundle_url: 'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer',
              manifest_url:
                'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/gemini-extension.json',
              commands_manifest_url:
                'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/gemini-commands-manifest.json',
              download_url: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-${version}.zip`,
              latest_download_url:
                'https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-latest.zip',
              sha256: pluginHash,
            },
            grok: {
              bundle_url: 'https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer',
              download_url: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-${version}.zip`,
              latest_download_url:
                'https://eai-support.github.io/eai-gofer/releases/eai-gofer-agent-plugin-latest.zip',
              sha256: pluginHash,
            },
            vscode: {
              file_name: `eai-gofer-${version}.vsix`,
              download_url: `https://eai-support.github.io/eai-gofer/releases/eai-gofer-${version}.vsix`,
              latest_download_url:
                'https://eai-support.github.io/eai-gofer/releases/eai-gofer-latest.vsix',
              sha256: vsixHash,
            },
          },
        },
      ],
    })
  );
  return { root, candidateRoot, stagedRoot, publicRoot, latestVsix };
}

describe('surface release contract', () => {
  it('pins the exact six-host invocation-prefix contract', () => {
    expect(CURRENT_SEMANTIC_HOSTS).toEqual([
      'claude',
      'codex',
      'copilot',
      'antigravity',
      'grok',
      'vscode',
    ]);
    expect(SEMANTIC_HOST_INVOCATION_PREFIX).toEqual({
      claude: '/',
      codex: '$',
      copilot: '/',
      antigravity: '/',
      grok: '/',
      vscode: '/',
    });
  });

  it('reuses the exact typed six-host contract in the runtime updater', async () => {
    const updater = await import(
      new URL('../../../.specify/scripts/node/gofer-surface-update.mjs', import.meta.url).href
    );
    expect(updater.SUPPORTED_HOSTS).toEqual([...CURRENT_SEMANTIC_HOSTS]);
  });

  it('verifies the packaged updater configures every supported surface', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const { stdout } = await execFileAsync(
      'node',
      ['scripts/verify-surface-release-contract.mjs', '--version', version],
      { cwd: repoRoot }
    );

    expect(stdout.trim()).toBe(
      `Gofer release surface contract passed for v${version}: ${CURRENT_SEMANTIC_HOSTS.join(', ')}.`
    );
  });

  it('rejects a candidate VSIX with a missing critical bundled resource', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      execFileSync(
        'zip',
        [
          '-d',
          path.join(fixture.root, `eai-gofer-${version}.vsix`),
          'extension/resources/bash-scripts/install-optional-tools.sh',
        ],
        { stdio: 'ignore' }
      );

      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--candidate',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'VSIX artifact resource file list is not byte-current with the local extension/resources tree'
        ),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a candidate VSIX with a missing non-installer bundled resource', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    const resource = 'extension/resources/contracts/object-type-routing-v1.json';
    try {
      execFileSync('zip', ['-d', path.join(fixture.root, `eai-gofer-${version}.vsix`), resource], {
        stdio: 'ignore',
      });

      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--candidate',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'VSIX artifact resource file list is not byte-current with the local extension/resources tree'
        ),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('accepts an exact zero-length resource entry', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      expect(
        fs.statSync(
          path.join(
            fixture.root,
            'extension',
            'resources',
            'gemini',
            'commands',
            'gofer',
            '.gitkeep'
          )
        ).size
      ).toBe(0);
      const { stdout } = await execFileAsync(
        'node',
        [
          'scripts/verify-surface-release-contract.mjs',
          '--root',
          fixture.root,
          '--version',
          version,
          '--candidate',
        ],
        { cwd: repoRoot }
      );
      expect(stdout).toContain(`Gofer release surface contract passed for v${version}`);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects native .node binaries in candidate and public VSIX archives', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    const nativeRoot = path.join(fixture.root, '.native-fixture', 'extension', 'native');
    const candidateVsix = path.join(fixture.root, `eai-gofer-${version}.vsix`);
    try {
      fs.mkdirSync(nativeRoot, { recursive: true });
      fs.writeFileSync(path.join(nativeRoot, 'addon.node'), 'native bytes');
      execFileSync('zip', ['-qr', candidateVsix, 'extension'], {
        cwd: path.join(fixture.root, '.native-fixture'),
      });
      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--candidate',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'VSIX artifact contains native binary entries: extension/native/addon.node'
        ),
      });

      fs.copyFileSync(
        candidateVsix,
        path.join(fixture.root, 'docs-site', 'static', 'releases', `eai-gofer-${version}.vsix`)
      );
      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--public',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('VSIX artifact contains native binary entries'),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('separately verifies published package, alias, binary, and feed-hash parity', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      const { stdout } = await execFileAsync(
        'node',
        [
          'scripts/verify-surface-release-contract.mjs',
          '--root',
          fixture.root,
          '--version',
          version,
          '--public',
        ],
        { cwd: repoRoot }
      );
      expect(stdout).toContain(`Gofer release surface contract passed for v${version}`);

      fs.writeFileSync(fixture.latestVsix, 'different latest bytes');
      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--public',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('eai-gofer-latest.vsix must be byte-identical'),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('validates committed public artifacts from a clean checkout without candidate build files', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      fs.rmSync(path.join(fixture.root, `eai-gofer-${version}.vsix`));
      fs.rmSync(path.join(fixture.root, 'dist'), { recursive: true, force: true });
      const { stdout } = await execFileAsync(
        'node',
        [
          'scripts/verify-surface-release-contract.mjs',
          '--root',
          fixture.root,
          '--version',
          version,
          '--public',
        ],
        { cwd: repoRoot }
      );
      expect(stdout).toContain(`Gofer release surface contract passed for v${version}`);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a public versioned binary that is a symlink to a mutable alias', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    const publicVsix = path.join(
      fixture.root,
      'docs-site',
      'static',
      'releases',
      `eai-gofer-${version}.vsix`
    );
    try {
      fs.rmSync(publicVsix);
      fs.symlinkSync('eai-gofer-latest.vsix', publicVsix);
      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--public',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          `Published VSIX v${version} must be a regular non-symlink file`
        ),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it.each(['extension/dist/extension.js', 'extension/language-server/dist/server.js'])(
    'rejects a substituted %s runtime in combined semantic mode',
    async (runtimeEntry) => {
      const { version } = await import(path.join(repoRoot, 'package.json'));
      const fixture = createPublicReleaseFixture(version);
      try {
        replacePublicVsixFromExtractedTree(fixture.root, version, (extractedRoot) => {
          fs.writeFileSync(
            path.join(extractedRoot, ...runtimeEntry.split('/')),
            'substituted runtime'
          );
        });
        await expect(
          execFileAsync(
            'node',
            [
              'scripts/verify-surface-release-contract.mjs',
              '--root',
              fixture.root,
              '--version',
              version,
              '--candidate',
              '--public',
            ],
            { cwd: repoRoot }
          )
        ).rejects.toMatchObject({
          stderr: expect.stringContaining(
            `Candidate and published VSIX entry ${runtimeEntry} differs byte-for-byte`
          ),
        });
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    }
  );

  it('accepts semantically identical VSIX files with different ZIP metadata', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      const { candidateBytes, publicBytes } = replacePublicVsixFromExtractedTree(
        fixture.root,
        version,
        (extractedRoot) => {
          const changedTimestamp = new Date('2001-02-03T04:05:06Z');
          fs.utimesSync(
            path.join(extractedRoot, 'extension', 'dist', 'extension.js'),
            changedTimestamp,
            changedTimestamp
          );
        }
      );
      expect(publicBytes).not.toEqual(candidateBytes);

      const { stdout } = await execFileAsync(
        'node',
        [
          'scripts/verify-surface-release-contract.mjs',
          '--root',
          fixture.root,
          '--version',
          version,
          '--candidate',
          '--public',
        ],
        { cwd: repoRoot }
      );
      expect(stdout).toContain(`Gofer release surface contract passed for v${version}`);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects symlink entries in a candidate VSIX before extraction', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    const linkRoot = path.join(fixture.root, '.symlink-vsix');
    try {
      fs.mkdirSync(path.join(linkRoot, 'extension'), { recursive: true });
      fs.symlinkSync('package.json', path.join(linkRoot, 'extension', 'linked-runtime'));
      execFileSync(
        'zip',
        ['-qry', path.join(fixture.root, `eai-gofer-${version}.vsix`), 'extension'],
        { cwd: linkRoot }
      );

      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--candidate',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'archive contains symlink, special, or type-confused entries'
        ),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a stale public package file even when the binaries match', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      fs.appendFileSync(path.join(fixture.publicRoot, 'README.md'), '\nstale\n');
      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--public',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('README.md must be byte-identical'),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects an unexpected public package file', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      fs.writeFileSync(path.join(fixture.publicRoot, 'unexpected.txt'), 'stale release payload');
      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--public',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'Public release package contains unexpected files: unexpected.txt'
        ),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a retired Gemini release-feed key in place of Antigravity', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      const feedPath = path.join(fixture.root, 'docs-site', 'static', 'releases.json');
      const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
      const assets = feed.releases[0].assets;
      assets.gemini = assets.antigravity;
      delete assets.antigravity;
      fs.writeFileSync(feedPath, JSON.stringify(feed));

      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--public',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('Release feed host contract mismatch'),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('requires the requested version to be the current first release', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      const feedPath = path.join(fixture.root, 'docs-site', 'static', 'releases.json');
      const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
      feed.latest_version = '0.0.1';
      fs.writeFileSync(feedPath, JSON.stringify(feed));

      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--public',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          `Release feed does not advertise v${version} as the current first release`
        ),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects release-feed prerelease metadata that contradicts the version suffix', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      const feedPath = path.join(fixture.root, 'docs-site', 'static', 'releases.json');
      const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
      feed.releases[0].prerelease = !version.includes('-');
      fs.writeFileSync(feedPath, JSON.stringify(feed));

      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--public',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          `Release feed prerelease metadata does not match v${version}`
        ),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a tampered public release URL contract', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      const feedPath = path.join(fixture.root, 'docs-site', 'static', 'releases.json');
      const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
      feed.releases[0].assets.copilot.download_url = 'https://attacker.invalid/gofer.zip';
      fs.writeFileSync(feedPath, JSON.stringify(feed));

      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--public',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          `Release feed URL contract does not match the canonical v${version} schema`
        ),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a plugin zip that does not match the candidate and public trees', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixture = createPublicReleaseFixture(version);
    try {
      for (const root of [fixture.candidateRoot, fixture.publicRoot]) {
        fs.appendFileSync(path.join(root, 'README.md'), '\nchanged after zip creation\n');
      }

      await expect(
        execFileAsync(
          'node',
          [
            'scripts/verify-surface-release-contract.mjs',
            '--root',
            fixture.root,
            '--version',
            version,
            '--public',
          ],
          { cwd: repoRoot }
        )
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'Published agent plugin zip entry eai-gofer/README.md differs from the candidate bundle'
        ),
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
