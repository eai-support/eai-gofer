import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SOURCE_SCRIPT_PATH = path.resolve(
  __dirname,
  '../../../scripts/publish-public-release-assets.mjs'
);

describe('publish-public-release-assets.mjs', () => {
  let tmpRoot: string;
  let scriptPath: string;
  let pluginRoot: string;

  beforeEach(async () => {
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

    fs.mkdirSync(path.join(tmpRoot, 'dist'), { recursive: true });

    fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'), { recursive: true });
    fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
    fs.mkdirSync(path.join(pluginRoot, '.agents', 'plugins'), { recursive: true });
    fs.mkdirSync(path.join(pluginRoot, '.github', 'plugin'), { recursive: true });
    fs.mkdirSync(path.join(pluginRoot, '.gemini', 'commands', 'gofer'), { recursive: true });
    fs.mkdirSync(path.join(pluginRoot, '.specify', 'scripts', 'node'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, '.claude-plugin', 'plugin.json'),
      '{"name":"eai-gofer","version":"3.4.0"}'
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
    fs.writeFileSync(path.join(pluginRoot, '.gemini', 'extension.json'), '{"name":"eai-gofer"}');
    fs.writeFileSync(
      path.join(pluginRoot, '.gemini', 'commands', 'gofer', 'manifest.json'),
      '{"commands":[]}'
    );
    fs.writeFileSync(
      path.join(pluginRoot, '.specify', 'scripts', 'node', 'gofer-surface-update.mjs'),
      'export {};\n'
    );
    fs.writeFileSync(
      path.join(pluginRoot, '.specify', 'scripts', 'node', 'gofer-local-settings-cleanup.mjs'),
      'export {};\n'
    );
    fs.writeFileSync(
      path.join(pluginRoot, '.eai-gofer-plugin-version'),
      '3.4.0\ngenerated-by-eai-gofer\n'
    );

    const vsixRoot = path.join(tmpRoot, 'vsix-input');
    fs.mkdirSync(path.join(vsixRoot, 'extension'), { recursive: true });
    fs.writeFileSync(
      path.join(vsixRoot, 'extension', 'package.json'),
      JSON.stringify({ name: 'gofer', version: '3.4.0' })
    );
    await execFileAsync('zip', ['-qr', path.join(tmpRoot, 'eai-gofer-3.4.0.vsix'), '.'], {
      cwd: vsixRoot,
    });
    await execFileAsync(
      'zip',
      ['-qr', path.join(tmpRoot, 'dist', 'eai-gofer-agent-plugin-3.4.0.zip'), 'eai-gofer'],
      { cwd: path.dirname(pluginRoot) }
    );

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

  it('copies versioned assets, refreshes stable aliases, writes public aliases, and preserves prior releases', async () => {
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
    expect(
      fs
        .readFileSync(path.join(publicReleasesDir, 'eai-gofer-3.4.0.vsix'))
        .equals(fs.readFileSync(path.join(tmpRoot, 'eai-gofer-3.4.0.vsix')))
    ).toBe(true);
    expect(
      fs
        .readFileSync(path.join(publicReleasesDir, 'eai-gofer-agent-plugin-3.4.0.zip'))
        .equals(fs.readFileSync(path.join(tmpRoot, 'dist', 'eai-gofer-agent-plugin-3.4.0.zip')))
    ).toBe(true);

    expect(fs.existsSync(path.join(publicPluginRoot, 'claude-marketplace.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'claude-plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'codex-marketplace.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'codex-plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'copilot-marketplace.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'copilot-plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'gemini-extension.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'gemini-commands-manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'gofer-surface-update.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'gofer-local-settings-cleanup.mjs'))).toBe(
      true
    );

    expect(fs.existsSync(path.join(publicReleasesDir, 'eai-gofer-3.2.0.vsix'))).toBe(true);
    expect(
      fs
        .readFileSync(path.join(publicReleasesDir, 'eai-gofer-3.2.0.vsix'))
        .equals(Buffer.alloc(128))
    ).toBe(true);
    expect(fs.existsSync(path.join(publicReleasesDir, 'eai-gofer-agent-plugin-3.2.0.zip'))).toBe(
      true
    );
    expect(
      fs
        .readFileSync(path.join(publicReleasesDir, 'eai-gofer-agent-plugin-3.2.0.zip'))
        .equals(Buffer.alloc(128))
    ).toBe(true);
  });

  it('allows an exact idempotent retry without changing versioned bytes', async () => {
    await execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot });
    const publicVsix = path.join(
      tmpRoot,
      'docs-site',
      'static',
      'releases',
      'eai-gofer-3.4.0.vsix'
    );
    const publicPlugin = path.join(
      tmpRoot,
      'docs-site',
      'static',
      'releases',
      'eai-gofer-agent-plugin-3.4.0.zip'
    );
    const beforeVsix = fs.readFileSync(publicVsix);
    const beforePlugin = fs.readFileSync(publicPlugin);

    await execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot });

    expect(fs.readFileSync(publicVsix).equals(beforeVsix)).toBe(true);
    expect(fs.readFileSync(publicPlugin).equals(beforePlugin)).toBe(true);
  });

  it('rejects an exact old-version retry before changing latest aliases or the public tree', async () => {
    await execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot });
    const publicReleasesDir = path.join(tmpRoot, 'docs-site', 'static', 'releases');
    const latestVsix = path.join(publicReleasesDir, 'eai-gofer-latest.vsix');
    const publicPluginRoot = path.join(publicReleasesDir, 'plugins', 'eai-gofer');
    const latestBefore = fs.readFileSync(latestVsix);
    const publicTreeBefore = fs.readFileSync(
      path.join(publicPluginRoot, '.eai-gofer-plugin-version')
    );
    fs.writeFileSync(
      path.join(tmpRoot, 'docs-site', 'static', 'releases.json'),
      JSON.stringify({
        latest_version: '3.5.0',
        releases: [
          { version: '3.5.0', tag_name: 'v3.5.0' },
          { version: '3.4.0', tag_name: 'v3.4.0' },
        ],
      })
    );

    await expect(
      execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'Release v3.4.0 is not the current first feed entry; refusing to change latest aliases or the public plugin tree'
      ),
    });
    expect(fs.readFileSync(latestVsix).equals(latestBefore)).toBe(true);
    expect(
      fs
        .readFileSync(path.join(publicPluginRoot, '.eai-gofer-plugin-version'))
        .equals(publicTreeBefore)
    ).toBe(true);
  });

  it('rejects a differing existing same-version asset before changing aliases', async () => {
    await execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot });
    const publicReleasesDir = path.join(tmpRoot, 'docs-site', 'static', 'releases');
    const publicVsix = path.join(publicReleasesDir, 'eai-gofer-3.4.0.vsix');
    const latestVsix = path.join(publicReleasesDir, 'eai-gofer-latest.vsix');
    const latestBefore = fs.readFileSync(latestVsix);
    fs.writeFileSync(publicVsix, 'previous immutable bytes');

    await expect(
      execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('VSIX v3.4.0 already exists with different bytes'),
    });
    expect(fs.readFileSync(publicVsix, 'utf8')).toBe('previous immutable bytes');
    expect(fs.readFileSync(latestVsix).equals(latestBefore)).toBe(true);
  });

  it('rejects candidate and published versioned binary symlinks', async () => {
    const candidateVsix = path.join(tmpRoot, 'eai-gofer-3.4.0.vsix');
    const candidateTarget = path.join(tmpRoot, 'candidate-target.vsix');
    fs.renameSync(candidateVsix, candidateTarget);
    fs.symlinkSync(candidateTarget, candidateVsix);
    await expect(
      execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'fresh root VSIX artifact must be a file and must not be a symlink'
      ),
    });

    fs.rmSync(candidateVsix);
    fs.renameSync(candidateTarget, candidateVsix);
    await execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot });
    const publicVsix = path.join(
      tmpRoot,
      'docs-site',
      'static',
      'releases',
      'eai-gofer-3.4.0.vsix'
    );
    fs.rmSync(publicVsix);
    fs.symlinkSync('eai-gofer-latest.vsix', publicVsix);
    await expect(
      execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('VSIX v3.4.0 target must be a regular non-symlink file'),
    });
  });

  it('rejects an intermediate public plugin symlink without deleting its target', async () => {
    const externalTarget = path.join(tmpRoot, 'external-plugin-target');
    const sentinel = path.join(externalTarget, 'sentinel.txt');
    const pluginsParent = path.join(tmpRoot, 'docs-site', 'static', 'releases', 'plugins');
    fs.mkdirSync(externalTarget);
    fs.writeFileSync(sentinel, 'must survive');
    fs.symlinkSync(externalTarget, pluginsParent, 'dir');

    await expect(
      execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'Public plugin directory ancestor must be a real directory, not a symlink'
      ),
    });
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('must survive');
  });

  it('rejects candidates whose embedded version does not match the requested release', async () => {
    const vsixRoot = path.join(tmpRoot, 'wrong-vsix-input');
    fs.mkdirSync(path.join(vsixRoot, 'extension'), { recursive: true });
    fs.writeFileSync(
      path.join(vsixRoot, 'extension', 'package.json'),
      JSON.stringify({ name: 'gofer', version: '9.9.9' })
    );
    fs.rmSync(path.join(tmpRoot, 'eai-gofer-3.4.0.vsix'));
    await execFileAsync('zip', ['-qr', path.join(tmpRoot, 'eai-gofer-3.4.0.vsix'), '.'], {
      cwd: vsixRoot,
    });

    await expect(
      execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("VSIX artifact declares version '9.9.9', expected '3.4.0'"),
    });
    expect(
      fs.existsSync(path.join(tmpRoot, 'docs-site', 'static', 'releases', 'eai-gofer-3.4.0.vsix'))
    ).toBe(false);
  });

  it('rejects a plugin zip whose bytes differ from the staged plugin tree', async () => {
    fs.appendFileSync(
      path.join(pluginRoot, '.specify', 'scripts', 'node', 'gofer-surface-update.mjs'),
      '// changed after packaging\n'
    );

    await expect(
      execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'Agent plugin zip entry eai-gofer/.specify/scripts/node/gofer-surface-update.mjs differs from the staged plugin bundle'
      ),
    });
    expect(
      fs.existsSync(path.join(tmpRoot, 'docs-site', 'static', 'releases', 'eai-gofer-3.4.0.vsix'))
    ).toBe(false);
  });

  it('does not use an extension or previously published asset as a fresh root candidate', async () => {
    await execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot });
    fs.copyFileSync(
      path.join(tmpRoot, 'eai-gofer-3.4.0.vsix'),
      path.join(tmpRoot, 'extension', 'eai-gofer-3.4.0.vsix')
    );
    fs.rmSync(path.join(tmpRoot, 'eai-gofer-3.4.0.vsix'));

    await expect(
      execFileAsync('node', [scriptPath, '--version', '3.4.0'], { cwd: tmpRoot })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('Unable to find fresh root VSIX artifact'),
    });
  });
});
