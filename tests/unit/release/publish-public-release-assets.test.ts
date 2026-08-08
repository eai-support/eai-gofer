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
    fs.mkdirSync(path.join(pluginRoot, '.gemini', 'commands', 'gofer'), { recursive: true });
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
    fs.writeFileSync(path.join(pluginRoot, '.gemini', 'extension.json'), '{"name":"eai-gofer"}');
    fs.writeFileSync(
      path.join(pluginRoot, '.gemini', 'commands', 'gofer', 'manifest.json'),
      '{"commands":[]}'
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
    expect(fs.existsSync(path.join(publicPluginRoot, 'gemini-extension.json'))).toBe(true);
    expect(fs.existsSync(path.join(publicPluginRoot, 'gemini-commands-manifest.json'))).toBe(true);

    expect(fs.existsSync(path.join(publicReleasesDir, 'eai-gofer-3.2.0.vsix'))).toBe(false);
    expect(fs.existsSync(path.join(publicReleasesDir, 'eai-gofer-agent-plugin-3.2.0.zip'))).toBe(
      false
    );
  });
});
