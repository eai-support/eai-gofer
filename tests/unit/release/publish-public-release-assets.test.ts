import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import ts from 'typescript';

const execFileAsync = promisify(execFile);

const SOURCE_SCRIPT_PATH = path.resolve(
  __dirname,
  '../../../scripts/publish-public-release-assets.mjs'
);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const UPDATER_FILES = [
  'gofer-surface-update.mjs',
  'gofer-local-settings-cleanup.mjs',
  'lib/grok-surface.mjs',
];

function firstInstallBlock(language: string): string {
  const guide = fs.readFileSync(path.join(REPO_ROOT, '.tech-docs', 'first-run.md'), 'utf8');
  const section = guide.split('## First Install Without A Repository')[1].split('\n## ')[0];
  const block = section.match(new RegExp('```' + language + '\\n([\\s\\S]*?)```'))?.[1];
  expect(block).toBeDefined();
  return block!;
}

const NATIVE_SHELLS = [
  {
    language: 'bash',
    command: 'bash',
    args: ['--noprofile', '--norc', '-c'],
    setup: `
curl() {
  relative="\${2#https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/}"
  printf '%s\\n' "$relative" >> "$REQUEST_LOG"
  if [ "$relative" = "$FAIL_DOWNLOAD" ]; then return 22; fi
  command cp "$FIXTURE_PUBLIC/$relative" "$4"
}
node() {
  printf '%s\\n' invoked > "$INSTALL_MARKER"
  command "$NODE_RUNTIME" "$1" --help
}
`,
  },
  {
    language: 'powershell',
    command: process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'],
    setup: `
function Invoke-WebRequest {
  [CmdletBinding()]
  param([Parameter(Position=0)][string]$Uri, [string]$OutFile)
  $relative = $Uri.Replace('https://eai-support.github.io/eai-gofer/releases/plugins/eai-gofer/', '')
  Add-Content -LiteralPath $env:REQUEST_LOG -Value $relative
  if ($relative -eq $env:FAIL_DOWNLOAD) { throw 'Required download failed' }
  Copy-Item -LiteralPath (Join-Path $env:FIXTURE_PUBLIC $relative) -Destination $OutFile -ErrorAction Stop
}
function node {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
  Set-Content -LiteralPath $env:INSTALL_MARKER -Value 'invoked'
  & $env:NODE_RUNTIME $Arguments[0] --help
  $global:LASTEXITCODE = $LASTEXITCODE
}
`,
  },
];

describe('publish-public-release-assets.mjs', () => {
  let tmpRoot: string;
  let scriptPath: string;
  let pluginRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-public-release-assets-'));
    scriptPath = path.join(tmpRoot, 'scripts', 'publish-public-release-assets.mjs');
    pluginRoot = path.join(tmpRoot, 'dist', 'eai-gofer-agent-plugin-3.4.0', 'eai-gofer');

    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.copyFileSync(SOURCE_SCRIPT_PATH, scriptPath);

    fs.mkdirSync(path.join(tmpRoot, 'extension'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, 'extension', 'package.json'),
      JSON.stringify({ version: '3.4.0' }, null, 2)
    );

    fs.mkdirSync(path.join(tmpRoot, 'docs-site', 'static', 'releases'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, 'docs-site', 'static', 'releases.json'),
      JSON.stringify(
        {
          latest_version: '3.4.0',
          repository: 'eai-support/eai-gofer',
          last_updated: '2026-05-22T00:00:00.000Z',
          releases: [
            { version: '3.4.0', tag_name: 'v3.4.0', published_at: '', download_url: '', notes: '' },
            { version: '3.3.1', tag_name: 'v3.3.1', published_at: '', download_url: '', notes: '' },
          ],
        },
        null,
        2
      )
    );

    fs.writeFileSync(path.join(tmpRoot, 'eai-gofer-3.4.0.vsix'), Buffer.alloc(1024));
    fs.mkdirSync(path.join(tmpRoot, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, 'dist', 'eai-gofer-agent-plugin-3.4.0.zip'),
      Buffer.alloc(2048)
    );

    fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
    fs.mkdirSync(path.join(pluginRoot, '.agents', 'plugins'), { recursive: true });
    fs.mkdirSync(path.join(pluginRoot, '.github', 'plugin'), { recursive: true });
    fs.mkdirSync(path.join(pluginRoot, 'plugins', 'antigravity', 'eai-gofer'), { recursive: true });
    fs.mkdirSync(path.join(pluginRoot, '.specify', 'scripts', 'node'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, '.claude-plugin', 'plugin.json'),
      '{"name":"eai-gofer"}'
    );
    fs.writeFileSync(
      path.join(pluginRoot, '.claude-plugin', 'marketplace.json'),
      '{"name":"eai-gofer"}'
    );
    fs.writeFileSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), '{"name":"eai-gofer"}');
    fs.writeFileSync(
      path.join(pluginRoot, '.agents', 'plugins', 'marketplace.json'),
      '{"name":"eai-gofer"}'
    );
    fs.writeFileSync(
      path.join(pluginRoot, '.github', 'plugin', 'plugin.json'),
      '{"name":"eai-gofer"}'
    );
    fs.writeFileSync(
      path.join(pluginRoot, '.github', 'plugin', 'marketplace.json'),
      '{"name":"eai-gofer"}'
    );
    fs.writeFileSync(
      path.join(pluginRoot, 'plugins', 'antigravity', 'eai-gofer', 'plugin.json'),
      '{"name":"eai-gofer","description":"EAI delivery"}'
    );
    for (const relative of UPDATER_FILES) {
      const target = path.join(pluginRoot, '.specify', 'scripts', 'node', relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(REPO_ROOT, '.specify', 'scripts', 'node', relative), target);
    }

    fs.writeFileSync(
      path.join(tmpRoot, 'docs-site', 'static', 'releases', 'eai-gofer-3.2.0.vsix'),
      Buffer.alloc(128)
    );
    fs.writeFileSync(
      path.join(tmpRoot, 'docs-site', 'static', 'releases', 'eai-gofer-agent-plugin-3.2.0.zip'),
      Buffer.alloc(128)
    );
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('copies versioned assets, refreshes stable aliases, writes public manifest aliases, and prunes stale binaries', async () => {
    await execFileAsync('node', [scriptPath, '--version', '3.4.0'], {
      cwd: tmpRoot,
    });

    const publicReleasesDir = path.join(tmpRoot, 'docs-site', 'static', 'releases');
    const publicPluginRoot = path.join(publicReleasesDir, 'plugins', 'eai-gofer');

    expect(fs.existsSync(path.join(publicReleasesDir, 'eai-gofer-3.4.0.vsix'))).toBe(true);
    expect(fs.existsSync(path.join(publicReleasesDir, 'eai-gofer-latest.vsix'))).toBe(true);
    expect(fs.existsSync(path.join(publicReleasesDir, 'eai-gofer-agent-plugin-3.4.0.zip'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(publicReleasesDir, 'eai-gofer-agent-plugin-latest.zip'))).toBe(
      true
    );

    expect(fs.existsSync(path.join(publicPluginRoot, 'claude-marketplace.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'claude-plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'codex-marketplace.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'codex-plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'copilot-marketplace.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'copilot-plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'antigravity-plugin.json'))).toBe(true);
    expect(
      fs.existsSync(
        path.join(publicPluginRoot, 'plugins', 'antigravity', 'eai-gofer', 'plugin.json')
      )
    ).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'gemini-extension.json'))).toBe(false);
    expect(fs.existsSync(path.join(publicPluginRoot, 'gemini-commands-manifest.json'))).toBe(false);
    expect(fs.existsSync(path.join(publicPluginRoot, 'gofer-surface-update.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'gofer-local-settings-cleanup.mjs'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(publicPluginRoot, 'lib', 'grok-surface.mjs'))).toBe(true);

    expect(fs.existsSync(path.join(publicReleasesDir, 'eai-gofer-3.2.0.vsix'))).toBe(false);
    expect(fs.existsSync(path.join(publicReleasesDir, 'eai-gofer-agent-plugin-3.2.0.zip'))).toBe(
      false
    );
  });

  it.each(UPDATER_FILES)('rejects missing %s before replacing public assets', async (relative) => {
    const publicRoot = path.join(tmpRoot, 'docs-site', 'static', 'releases');
    const existingAsset = path.join(publicRoot, 'eai-gofer-3.4.0.vsix');
    fs.writeFileSync(existingAsset, 'previous published artifact');
    const staleHelper = path.join(publicRoot, 'plugins', 'eai-gofer', relative);
    fs.mkdirSync(path.dirname(staleHelper), { recursive: true });
    fs.writeFileSync(staleHelper, 'previous published helper');
    fs.rmSync(path.join(pluginRoot, '.specify', 'scripts', 'node', relative));

    await expect(
      execFileAsync(process.execPath, [scriptPath, '--version', '3.4.0'], {
        cwd: tmpRoot,
      })
    ).rejects.toThrow(`Standalone updater dependency is missing: ${relative}`);
    expect(fs.readFileSync(existingAsset, 'utf8')).toBe('previous published artifact');
    expect(fs.readFileSync(staleHelper, 'utf8')).toBe('previous published helper');
    expect(fs.existsSync(path.join(publicRoot, 'eai-gofer-latest.vsix'))).toBe(false);
  });

  it('publishes the complete canonical import chain into a fresh synthetic public layout', async () => {
    const publicReleases = path.join(tmpRoot, 'docs-site', 'static', 'releases');
    // Remove only this test's synthetic prior releases, never repository assets.
    fs.rmSync(publicReleases, { recursive: true, force: true });
    expect(fs.existsSync(publicReleases)).toBe(false);
    await execFileAsync(process.execPath, [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot });

    const publicRoot = path.join(publicReleases, 'plugins', 'eai-gofer');
    const visited = new Set<string>();
    function checkImports(relative: string): void {
      if (visited.has(relative)) return;
      visited.add(relative);
      const canonical = fs.readFileSync(
        path.join(REPO_ROOT, '.specify', 'scripts', 'node', relative)
      );
      expect(fs.readFileSync(path.join(publicRoot, relative)).equals(canonical), relative).toBe(
        true
      );
      for (const imported of ts.preProcessFile(canonical.toString('utf8'), true, true)
        .importedFiles) {
        if (imported.fileName.startsWith('node:')) continue;
        expect(
          imported.fileName.startsWith('.'),
          `Unexpected external dependency: ${imported.fileName}`
        ).toBe(true);
        const dependency = path.posix.normalize(
          path.posix.join(path.posix.dirname(relative), imported.fileName)
        );
        expect(dependency.startsWith('../')).toBe(false);
        checkImports(dependency);
      }
    }
    checkImports('gofer-surface-update.mjs');
    expect([...visited].sort()).toEqual([...UPDATER_FILES].sort());
  });

  for (const shell of NATIVE_SHELLS) {
    // Native shell coverage is explicit when the optional runtime is unavailable.
    const available = !spawnSync(shell.command, [...shell.args, 'exit 0']).error;
    describe.skipIf(!available)(`native ${shell.language} first-install instructions`, () => {
      it.each([
        { release: 'legacy', failedDownload: '' },
        { release: 'new', failedDownload: '' },
        ...UPDATER_FILES.map((failedDownload) => ({ release: 'new', failedDownload })),
      ])(
        '$release release, failed download "$failedDownload"',
        async ({ release, failedDownload }) => {
          const publicRoot = path.join(
            tmpRoot,
            'docs-site',
            'static',
            'releases',
            'plugins',
            'eai-gofer'
          );
          if (release === 'new') {
            await execFileAsync(process.execPath, [scriptPath, '--version', '3.4.0'], {
              cwd: tmpRoot,
            });
          } else {
            fs.mkdirSync(publicRoot, { recursive: true });
            // A fixed ref can verify the real old release without reading dirty public snapshots.
            const ref = process.env.GOFER_LEGACY_UPDATER_REF;
            for (const relative of UPDATER_FILES.slice(0, 2)) {
              const source = ref
                ? (
                    await execFileAsync(
                      'git',
                      ['show', `${ref}:docs-site/static/releases/plugins/eai-gofer/${relative}`],
                      { cwd: REPO_ROOT }
                    )
                  ).stdout
                : relative === 'gofer-surface-update.mjs'
                  ? "import { cleanupLocalSettings } from './gofer-local-settings-cleanup.mjs';\nconsole.log('Usage: legacy two-file updater');\n"
                  : fs.readFileSync(
                      path.join(REPO_ROOT, '.specify/scripts/node', relative),
                      'utf8'
                    );
              fs.writeFileSync(path.join(publicRoot, relative), source);
            }
            expect(fs.existsSync(path.join(publicRoot, 'lib/grok-surface.mjs'))).toBe(false);
          }
          const home = path.join(fs.realpathSync(tmpRoot), 'temporary home with spaces');
          fs.mkdirSync(home);
          const marker = path.join(home, 'install-invoked');
          const requests = path.join(home, 'downloads');
          const result = execFileAsync(
            shell.command,
            [...shell.args, `${shell.setup}\n${firstInstallBlock(shell.language)}`],
            {
              cwd: home,
              timeout: 15000,
              env: {
                ...process.env,
                HOME: home,
                USERPROFILE: home,
                TMPDIR: home,
                TEMP: home,
                NODE_RUNTIME: process.execPath,
                FIXTURE_PUBLIC: publicRoot,
                INSTALL_MARKER: marker,
                REQUEST_LOG: requests,
                FAIL_DOWNLOAD: failedDownload,
              },
            }
          );
          if (failedDownload) {
            await expect(result).rejects.toThrow();
            expect(fs.existsSync(marker)).toBe(false);
          } else {
            expect((await result).stdout).toContain('Usage:');
            expect(fs.existsSync(marker)).toBe(true);
          }
          const requested = fs.readFileSync(requests, 'utf8').trim().split(/\r?\n/);
          const expected = release === 'legacy' ? UPDATER_FILES.slice(0, 2) : UPDATER_FILES;
          expect(requested).toEqual(
            failedDownload ? expected.slice(0, expected.indexOf(failedDownload) + 1) : expected
          );
        }
      );
    });
  }

  it.each(['bash', 'powershell'])(
    'loads the exact documented %s download without installing',
    async (shell) => {
      await execFileAsync(process.execPath, [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot });
      const publicRoot = path.join(
        tmpRoot,
        'docs-site',
        'static',
        'releases',
        'plugins',
        'eai-gofer'
      );
      const guide = fs.readFileSync(path.join(REPO_ROOT, '.tech-docs', 'first-run.md'), 'utf8');
      const section = guide.split('## First Install Without A Repository')[1].split('\n## ')[0];
      const block = section.match(new RegExp('```' + shell + '\\n([\\s\\S]*?)```'))?.[1];
      expect(block).toBeDefined();
      // Interpret only the download mappings; never run the documented install command.
      const downloads = [
        ...block!.matchAll(
          shell === 'bash'
            ? /curl -fsSL (https:\/\/\S+)\s*\\\s*-o "\$helper_dir\/([^"\n]+)"/g
            : /Invoke-WebRequest (https:\/\/\S+) -OutFile (\$helper|\(Join-Path \$helperDir '([^']+)'\))/g
        ),
      ];
      const home = path.join(tmpRoot, `download-${shell}`);
      fs.mkdirSync(path.join(home, 'lib'), { recursive: true });
      const downloaded: string[] = [];
      for (const match of downloads) {
        const url = new URL(match[1]);
        expect(url.origin).toBe('https://eai-support.github.io');
        const prefix = '/eai-gofer/releases/plugins/eai-gofer/';
        expect(url.pathname.startsWith(prefix)).toBe(true);
        const sourceRelative = url.pathname.slice(prefix.length);
        const targetRelative =
          shell === 'bash' ? match[2] : (match[3] ?? 'gofer-surface-update.mjs');
        expect(targetRelative).toBe(sourceRelative);
        downloaded.push(targetRelative);
        const published = fs.readFileSync(path.join(publicRoot, sourceRelative));
        expect(
          published.equals(
            fs.readFileSync(path.join(REPO_ROOT, '.specify', 'scripts', 'node', sourceRelative))
          )
        ).toBe(true);
        fs.writeFileSync(path.join(home, targetRelative), published);
      }
      expect(downloaded.sort()).toEqual([...UPDATER_FILES].sort());
      const options = {
        cwd: home,
        timeout: 10000,
        env: { ...process.env, HOME: home, USERPROFILE: home, PATH: '' },
      };
      const helper = path.join(home, 'gofer-surface-update.mjs');
      expect((await execFileAsync(process.execPath, [helper, '--help'], options)).stdout).toContain(
        'Usage:'
      );
      const linkedHome = path.join(tmpRoot, `linked-download-${shell}`);
      fs.symlinkSync(home, linkedHome, 'junction');
      expect(
        (
          await execFileAsync(
            process.execPath,
            [path.join(linkedHome, 'gofer-surface-update.mjs'), '--help'],
            options
          )
        ).stdout
      ).toContain('Usage:');
      for (const host of ['codex', 'claude', 'copilot', 'vscode', 'all']) {
        const { stdout } = await execFileAsync(
          process.execPath,
          [helper, '--action', 'install', '--host', host, '--json'],
          options
        );
        const result = JSON.parse(stdout);
        expect(result.execute).toBe(false);
        expect(result.results).toEqual([]);
        expect(result.plan.length).toBeGreaterThan(0);
      }
      expect(fs.readdirSync(home).sort()).toEqual([
        'gofer-local-settings-cleanup.mjs',
        'gofer-surface-update.mjs',
        'lib',
      ]);
      expect(fs.readdirSync(path.join(home, 'lib'))).toEqual(['grok-surface.mjs']);
    }
  );
});
