import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('workspace preflight surface generation', () => {
  it('keeps user-visible command surfaces to the public EAI entrypoint', () => {
    expect(read('extension/resources/claude-commands/eai.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host claude --json'
    );
    expect(read('.github/prompts/eai.prompt.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host copilot --json'
    );
    expect(read('.agents/skills/eai/SKILL.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host <host> --json'
    );
    expect(read('.agents/skills/eai/SKILL.md')).toContain(
      '`codex`, `antigravity`, or `antigravity-desktop`'
    );
    expect(read('.system/skills/eai/SKILL.md')).toContain(
      'node .specify/scripts/node/gofer-workspace-check.mjs --host codex --json'
    );
    expect(fs.existsSync(path.join(REPO_ROOT, '.gemini/commands/gofer/eai.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.gemini/commands/gofer/eai.toml'))).toBe(false);
    expect(read('GEMINI.md')).toContain('AGENTS.md');

    expect(fs.existsSync(path.join(REPO_ROOT, '.claude/commands/gofer.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.github/prompts/gofer.prompt.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.agents/skills/gofer'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.system/skills/gofer'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.gemini/commands/gofer/gofer.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.gemini/commands/gofer/gofer.toml'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.claude/commands/0_gofer_start.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.github/prompts/0_gofer_start.prompt.md'))).toBe(
      false
    );
    expect(fs.existsSync(path.join(REPO_ROOT, '.agents/skills/0_gofer_start'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.gemini/commands/gofer/0_gofer_start.md'))).toBe(
      false
    );
    expect(fs.existsSync(path.join(REPO_ROOT, '.specify/commands/0_gofer_start.md'))).toBe(true);
  });

  it('carries business English, journey routing, and EAI service choices across public surfaces', () => {
    for (const surfacePath of [
      'extension/resources/claude-commands/eai.md',
      '.github/prompts/eai.prompt.md',
      '.agents/skills/eai/SKILL.md',
      '.system/skills/eai/SKILL.md',
      '.grok/skills/eai/SKILL.md',
      'plugins/eai-gofer/skills/eai/SKILL.md',
    ]) {
      const surface = read(surfacePath);
      expect(surface).toContain('## Always-On EAI Contract');
      expect(surface).toContain('## User-Facing Response Gate');
      expect(surface).toContain('## Journey State');
      expect(surface).toContain('## EAI Platform Decision Contract');
      expect(surface).toContain('Apply the Controlled English Contract to every Gofer-authored');
      expect(surface).toContain('Find the earliest missing pipeline artifact or blocked EAI gate');
      expect(surface).toContain('Prefer PostgreSQL for relational');
      expect(surface).toContain('Prefer DocumentDB for flexible JSON documents');
      expect(surface).toContain('Prefer EAI content understanding and document services');
      expect(surface).toContain('Prefer EAI workflows, goals, and targets');
      expect(surface).toContain('Use any other platform only as an explicit exception');
      expect(surface).toContain('If any check fails, rewrite the reply before sending it');
      expect(surface).toContain('## Local Settings Cleanup Contract');
      expect(surface).toContain('gofer-local-settings-cleanup.mjs --workspace . --apply --json');
      expect(surface).toContain('## App Preview Runner Contract');
      expect(surface).toContain('./run.sh dev 3001');
      expect(surface).toContain('run.bat dev 3001');
    }
  });

  it('keeps EAI platform service guidance in repo-owned stage contracts', () => {
    expect(read('.specify/commands/0_gofer_start.md')).toContain('## Always-On EAI Contract');
    expect(read('.specify/commands/0_gofer_start.md')).toContain('## Journey State');
    expect(read('.specify/commands/1_gofer_research.md')).toContain(
      '## EAI Platform Capability Research'
    );
    expect(read('.specify/commands/2_gofer_specify.md')).toContain(
      '## EAI Platform Requirement Capture'
    );
    expect(read('.specify/commands/3_gofer_plan.md')).toContain('## EAI Platform Service Planning');
    expect(read('.specify/references/platform/eai-service-patterns.md')).toContain(
      '| Goals and targets'
    );
    expect(read('.specify/references/platform/eai-repo-contract.md')).toContain(
      '## Platform Service Choice Rule'
    );
  });

  it('keeps the response gate in direct GitHub Gofer agents', () => {
    const agentDir = path.join(REPO_ROOT, '.github', 'agents');
    const agentFiles = fs
      .readdirSync(agentDir)
      .filter((file) => file.startsWith('gofer-') && file.endsWith('.agent.md'));

    expect(agentFiles.length).toBeGreaterThan(0);
    for (const file of agentFiles) {
      const surface = read(path.join('.github', 'agents', file));
      expect(surface, file).toContain('## User-Facing Response Gate');
      expect(surface, file).toContain('If any check fails, rewrite the reply before sending it');
    }
  });

  it('does not expose pure control commands in user-visible command folders', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, '.claude/commands/gofer_plan.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.agents/skills/gofer_plan'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.gemini/commands/gofer/gofer_plan.md'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, '.specify/commands/gofer_plan.md'))).toBe(true);
  });

  it('keeps a freshly packaged candidate aligned with current command surfaces', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-preflight-candidate-'));
    try {
      const { version } = JSON.parse(read('extension/package.json'));
      execFileSync(
        process.execPath,
        [
          path.join(REPO_ROOT, '.specify/scripts/node/package-agent-plugin.mjs'),
          '--root',
          REPO_ROOT,
          '--version',
          version,
          '--out-dir',
          outDir,
        ],
        { cwd: outDir, stdio: 'pipe' }
      );
      const publicPluginRoot = path.join(outDir, `eai-gofer-agent-plugin-${version}`, 'eai-gofer');
      const readPublicPlugin = (relativePath: string): string =>
        fs.readFileSync(path.join(publicPluginRoot, relativePath), 'utf8');

      expect(fs.existsSync(path.join(publicPluginRoot, 'commands', 'eai.md'))).toBe(true);
      for (const stalePath of [
        path.join('commands', 'gofer.md'),
        path.join('skills', 'gofer', 'SKILL.md'),
        path.join('plugin-skills', 'gofer', 'SKILL.md'),
        path.join('.github', 'prompts', 'gofer.prompt.md'),
        path.join('.gemini', 'commands', 'gofer', 'gofer.md'),
        path.join('.gemini', 'commands', 'gofer', 'gofer.toml'),
        path.join('commands', '0_gofer_start.md'),
        path.join('commands', '0_business_scenario.md'),
        path.join('.specify', 'commands', '0_business_scenario.md'),
        path.join('.github', 'prompts', '0_business_scenario.prompt.md'),
        path.join('.gemini', 'commands', 'gofer', '0_business_scenario.md'),
      ]) {
        expect(fs.existsSync(path.join(publicPluginRoot, stalePath)), stalePath).toBe(false);
      }

      const publicEai = readPublicPlugin(path.join('commands', 'eai.md'));
      expect(publicEai).toContain('.specify/commands/0_gofer_start.md');
      expect(publicEai).toContain('## EAI Platform Readiness');
      expect(publicEai).toContain('eai whoami');
      expect(publicEai).not.toContain('.specify/commands/0_business_scenario.md');

      const publicCodexManifestText = readPublicPlugin(path.join('.codex-plugin', 'plugin.json'));
      const publicCodexManifest = JSON.parse(publicCodexManifestText);
      expect(publicCodexManifest.skills).toBe('./skills/');
      expect(publicCodexManifest.gofer).toBeUndefined();
      expect(publicCodexManifestText).not.toContain('0_business_scenario');
      expect(
        fs.existsSync(path.join(publicPluginRoot, '.gemini/commands/gofer/manifest.json'))
      ).toBe(false);
      expect(fs.existsSync(path.join(publicPluginRoot, '.gemini/extension.json'))).toBe(false);
      expect(readPublicPlugin('GEMINI.md')).toContain('AGENTS.md');
      for (const entry of ['eai', 'eai-update']) {
        expect(
          readPublicPlugin(`plugins/antigravity/eai-gofer/skills/${entry}/SKILL.md`)
        ).toContain(`name: ${entry}`);
      }

      const latestZip = path.join(outDir, `eai-gofer-agent-plugin-${version}.zip`);
      const zipListing = execFileSync('unzip', ['-l', latestZip], { encoding: 'utf8' });
      expect(zipListing).toContain('eai-gofer/commands/eai.md');
      expect(zipListing).not.toContain('eai-gofer/commands/gofer.md');
      expect(zipListing).not.toContain('eai-gofer/skills/gofer/SKILL.md');
      expect(zipListing).not.toContain('eai-gofer/plugin-skills/gofer/SKILL.md');
      expect(zipListing).not.toContain('eai-gofer/commands/0_gofer_start.md');
      expect(zipListing).not.toContain('0_business_scenario');
      expect(zipListing).not.toContain('eai-gofer/.gemini/commands/');
      expect(zipListing).not.toContain('gemini-extension.json');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('keeps the indexed published snapshot consistent with its feed and versioned archives', () => {
    // Review exactly what CI receives. Unstaged candidate release output is not a publication.
    // No fallback to workspace files: a missing indexed release asset must fail this check.
    const cache = new Map<string, Buffer>();
    const published = (relative: string): Buffer => {
      if (!cache.has(relative)) {
        cache.set(
          relative,
          execFileSync('git', ['show', `:docs-site/static/${relative}`], {
            cwd: REPO_ROOT,
            maxBuffer: 32 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
          })
        );
      }
      return cache.get(relative)!;
    };
    const feed = JSON.parse(published('releases.json').toString('utf8'));
    expect(feed.latest_version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(Array.isArray(feed.releases)).toBe(true);
    const latest = feed.releases.filter(
      (entry: { version: string }) => entry.version === feed.latest_version
    );
    expect(latest).toHaveLength(1);
    const release = latest[0];
    const assets = release.assets;
    expect(assets).toBeTypeOf('object');
    const generations = ['gemini', 'antigravity'].filter((host) => Object.hasOwn(assets, host));
    expect(generations.length).toBeGreaterThan(0);
    expect(Object.keys(assets).sort()).toEqual(
      ['vscode', 'claude', 'codex', 'copilot', ...generations].sort()
    );

    const assetPath = (url: string): string => {
      const base = 'https://eai-support.github.io/eai-gofer/';
      expect(url).toBeTypeOf('string');
      expect(url.startsWith(`${base}releases/`)).toBe(true);
      const relative = url.slice(base.length);
      expect(relative).not.toMatch(/[%?#\\]/);
      expect(relative.split('/').some((part) => !part || part === '.' || part === '..')).toBe(
        false
      );
      return relative;
    };
    for (const host of ['vscode', 'claude', 'codex', 'copilot', ...generations]) {
      const asset = assets[host];
      const fields = ['download_url', 'latest_download_url'];
      if (host !== 'vscode') fields.push('manifest_url');
      if (['claude', 'codex', 'copilot'].includes(host)) fields.push('marketplace_url');
      if (host === 'gemini') fields.push('commands_manifest_url');
      for (const field of fields)
        expect(published(assetPath(asset[field])).length, `${host}.${field}`).toBeGreaterThan(0);
      const versionedPath = `releases/eai-gofer-${host === 'vscode' ? '' : 'agent-plugin-'}${release.version}.${host === 'vscode' ? 'vsix' : 'zip'}`;
      expect(assetPath(asset.download_url)).toBe(versionedPath);
      expect(
        published(assetPath(asset.latest_download_url)).equals(published(versionedPath)),
        host
      ).toBe(true);
    }

    const pluginRoot = 'releases/plugins/eai-gofer';
    const snapshotFiles = [
      'commands/eai.md',
      'skills/eai/SKILL.md',
      'skills/eai-update/SKILL.md',
      '.specify/commands/0_gofer_start.md',
      '.codex-plugin/plugin.json',
      '.claude-plugin/plugin.json',
      '.github/plugin/plugin.json',
    ];
    for (const file of [
      '.codex-plugin/plugin.json',
      '.claude-plugin/plugin.json',
      '.github/plugin/plugin.json',
    ]) {
      const manifest = JSON.parse(published(`${pluginRoot}/${file}`).toString('utf8'));
      expect(manifest.name).toBe('eai-gofer');
      expect(manifest.version).toBe(feed.latest_version);
    }
    if (generations.includes('gemini')) {
      const manifest = JSON.parse(
        published(`${pluginRoot}/.gemini/extension.json`).toString('utf8')
      );
      expect(manifest.name).toBe('eai-gofer');
      expect(manifest.version).toBe(feed.latest_version);
      expect(
        published(assetPath(assets.gemini.manifest_url)).equals(
          published(`${pluginRoot}/.gemini/extension.json`)
        )
      ).toBe(true);
      const commands = published(`${pluginRoot}/.gemini/commands/gofer/manifest.json`);
      expect(JSON.parse(commands.toString('utf8')).commands).toEqual(['eai', 'eai-update']);
      expect(published(assetPath(assets.gemini.commands_manifest_url)).equals(commands)).toBe(true);
      snapshotFiles.push('.gemini/extension.json', '.gemini/commands/gofer/manifest.json');
      for (const entry of ['eai', 'eai-update']) {
        snapshotFiles.push(
          `.gemini/commands/gofer/${entry}.md`,
          `.gemini/commands/gofer/${entry}.toml`
        );
      }
    }
    if (generations.includes('antigravity')) {
      const nativeRoot = 'plugins/antigravity/eai-gofer';
      expect(assetPath(assets.antigravity.manifest_url)).toBe(
        `${pluginRoot}/${nativeRoot}/plugin.json`
      );
      expect(
        JSON.parse(published(`${pluginRoot}/${nativeRoot}/plugin.json`).toString('utf8')).name
      ).toBe('eai-gofer');
      snapshotFiles.push('GEMINI.md', `${nativeRoot}/plugin.json`);
      for (const file of [
        'skills/eai/SKILL.md',
        'skills/eai-update/SKILL.md',
        'rules/gofer.md',
        '.specify/scripts/node/gofer-stage-execute.mjs',
        '.specify/scripts/node/lib/stage-execution.mjs',
        '.specify/scripts/node/lib/stage-cli-adapters.mjs',
        '.specify/scripts/node/lib/portable-orchestration.mjs',
      ]) {
        snapshotFiles.push(`${nativeRoot}/${file}`);
      }
    }

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-published-preflight-'));
    try {
      const zip = path.join(outDir, 'published.zip');
      fs.writeFileSync(zip, published(`releases/eai-gofer-agent-plugin-${release.version}.zip`));
      const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n');
      expect(entries).not.toContain('eai-gofer/commands/gofer.md');
      expect(entries).not.toContain('eai-gofer/skills/gofer/SKILL.md');
      expect(entries).not.toContain('eai-gofer/plugin-skills/gofer/SKILL.md');
      expect(entries).not.toContain('eai-gofer/commands/0_gofer_start.md');
      expect(entries.join('\n')).not.toContain('0_business_scenario');
      if (!generations.includes('gemini')) {
        expect(
          entries.some(
            (entry) =>
              entry.includes('/.gemini/commands/') || entry.endsWith('/gemini-extension.json')
          )
        ).toBe(false);
      }
      for (const file of snapshotFiles) {
        expect(entries, file).toContain(`eai-gofer/${file}`);
        const archived = execFileSync('unzip', ['-p', zip, `eai-gofer/${file}`], {
          maxBuffer: 4 * 1024 * 1024,
        });
        expect(archived.equals(published(`${pluginRoot}/${file}`)), file).toBe(true);
      }
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
