import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflow = parse(
  readFileSync(path.resolve(__dirname, '../../../.github/workflows/pages.yml'), 'utf8')
);
const step = workflow.jobs.deploy.steps.find(
  (entry: { name: string }) => entry.name === 'Verify generated site'
);
// Run the actual workflow guard, not a second implementation of its decisions.
const guard = /^node <<'NODE'\n([\s\S]+)\nNODE\s*$/.exec(step.run)?.[1];
if (!guard) throw new Error('Pages must run its published-release guard unconditionally');
const baseUrl = 'https://eai-support.github.io/eai-gofer/releases/';
const plugin = 'releases/plugins/eai-gofer';
const nativeRoot = `${plugin}/plugins/antigravity/eai-gofer`;
const commonFiles = [
  'index.html',
  'docs/overview.html',
  'releases.html',
  'releases.json',
  'releases/eai-gofer-3.12.4.vsix',
  'releases/eai-gofer-agent-plugin-3.12.4.zip',
  'releases/eai-gofer-latest.vsix',
  'releases/eai-gofer-agent-plugin-latest.zip',
  ...[
    'claude-marketplace.json',
    'claude-plugin.json',
    'codex-marketplace.json',
    'codex-plugin.json',
    'copilot-marketplace.json',
    'copilot-plugin.json',
    'gofer-surface-update.mjs',
    'gofer-local-settings-cleanup.mjs',
  ].map((file) => `${plugin}/${file}`),
];
const geminiFiles = ['gemini-extension.json', 'gemini-commands-manifest.json'].map(
  (file) => `${plugin}/${file}`
);
const antigravityFiles = [
  'plugin.json',
  'skills/eai/SKILL.md',
  'skills/eai-update/SKILL.md',
  'rules/gofer.md',
  ...[
    'gofer-surface-update.mjs',
    'gofer-local-settings-cleanup.mjs',
    'gofer-stage-execute.mjs',
    'gofer-model-discovery.mjs',
    'gofer-orchestration.mjs',
    'lib/grok-surface.mjs',
    'lib/model-discovery.mjs',
    'lib/stage-cli-adapters.mjs',
    'lib/stage-execution.mjs',
    'lib/portable-orchestration.mjs',
    'lib/orchestration-contract.mjs',
  ].map((file) => `.specify/scripts/node/${file}`),
]
  .map((file) => `${nativeRoot}/${file}`)
  .concat(`${plugin}/lib/grok-surface.mjs`);

type Generation = 'gemini' | 'antigravity';
function fixture(generation: Generation) {
  const assets: Record<string, Record<string, string>> = {};
  for (const host of ['vscode', 'claude', 'codex', 'copilot', generation]) {
    assets[host] = {
      download_url: `${baseUrl}eai-gofer-${host === 'vscode' ? '3.12.4.vsix' : 'agent-plugin-3.12.4.zip'}`,
      latest_download_url: `${baseUrl}eai-gofer-${host === 'vscode' ? 'latest.vsix' : 'agent-plugin-latest.zip'}`,
    };
    if (host !== 'vscode')
      assets[host].manifest_url = `${baseUrl}plugins/eai-gofer/${host}-plugin.json`;
    if (['claude', 'codex', 'copilot'].includes(host))
      assets[host].marketplace_url = `${baseUrl}plugins/eai-gofer/${host}-marketplace.json`;
  }
  if (generation === 'gemini') {
    assets.gemini.manifest_url = `${baseUrl}plugins/eai-gofer/gemini-extension.json`;
    assets.gemini.commands_manifest_url = `${baseUrl}plugins/eai-gofer/gemini-commands-manifest.json`;
  } else {
    assets.antigravity.bundle_url = `${baseUrl}plugins/eai-gofer/plugins/antigravity/eai-gofer`;
    assets.antigravity.manifest_url = `${assets.antigravity.bundle_url}/plugin.json`;
  }
  const feed = { latest_version: '3.12.4', releases: [{ version: '3.12.4', assets }] };
  const files = new Map(
    [...commonFiles, ...(generation === 'gemini' ? geminiFiles : antigravityFiles)].map((file) => [
      file,
      'published content',
    ])
  );
  files.set(
    `${nativeRoot}/plugin.json`,
    JSON.stringify({ name: 'eai-gofer', description: 'Gofer' })
  );
  if (generation === 'gemini') files.delete(`${nativeRoot}/plugin.json`);
  return { feed, files };
}

function verify(f: ReturnType<typeof fixture>, feed: unknown = f.feed) {
  const relative = (file: string) =>
    path.relative('docs-site/build', file).split(path.sep).join('/');
  const content = (file: string) =>
    relative(file) === 'releases.json' ? JSON.stringify(feed) : f.files.get(relative(file));
  const messages: string[] = [];
  runInNewContext(
    guard!,
    {
      require: (name: string) => {
        if (name === 'node:path') return path;
        if (name !== 'node:fs') throw new Error(`Unexpected dependency: ${name}`);
        return {
          existsSync: (file: string) => f.files.has(relative(file)),
          statSync: (file: string) => ({ isFile: () => true, size: content(file)?.length ?? 0 }),
          readFileSync: (file: string) => content(file),
        };
      },
      console: { log: (message: string) => messages.push(message) },
    },
    { timeout: 1000 }
  );
  return messages.join('\n');
}

describe('Pages published release compatibility', () => {
  it('keeps verification mandatory before artifact upload', () => {
    expect(step.if).toBeUndefined();
    expect(step['continue-on-error']).toBeUndefined();
    expect(workflow.jobs.deploy.steps.indexOf(step)).toBeLessThan(
      workflow.jobs.deploy.steps.findIndex(
        (entry: { name: string }) => entry.name === 'Upload artifact'
      )
    );
  });

  for (const generation of ['gemini', 'antigravity'] as const) {
    it(`accepts the complete ${generation} release without requiring the other generation`, () => {
      expect(verify(fixture(generation))).toContain(`Verified published 3.12.4: ${generation}`);
    });
    for (const file of [
      ...commonFiles,
      ...(generation === 'gemini' ? geminiFiles : antigravityFiles),
    ]) {
      it(`rejects ${generation} when ${file} is missing`, () => {
        const f = fixture(generation);
        f.files.delete(file);
        expect(() => verify(f)).toThrow(file);
      });
    }
  }

  it('selects latest_version, not the first entry or candidate source version', () => {
    const f = fixture('gemini');
    f.feed.releases.unshift({
      version: '3.12.5',
      assets: fixture('antigravity').feed.releases[0].assets,
    });
    expect(verify(f)).toContain('3.12.4: gemini');
  });

  it.each([
    null,
    {},
    { latest_version: '3.12.4' },
    { latest_version: '', releases: [] },
    { latest_version: '3.12.4', releases: [] },
  ])('rejects a missing or invalid feed entry: %j', (feed) => {
    expect(() => verify(fixture('gemini'), feed)).toThrow();
  });

  it('rejects duplicate latest entries', () => {
    const f = fixture('gemini');
    f.feed.releases.push(f.feed.releases[0]);
    expect(() => verify(f)).toThrow('exactly one');
  });

  it.each([
    'missing-generation',
    'unknown-generation',
    'missing-common',
    'empty-descriptor',
    'missing-url',
    'unsafe-url',
  ])('fails closed for %s', (scenario) => {
    const f = fixture('gemini');
    const assets = f.feed.releases[0].assets;
    if (scenario === 'missing-generation' || scenario === 'unknown-generation')
      delete assets.gemini;
    if (scenario === 'unknown-generation') assets.other = {};
    if (scenario === 'missing-common') delete assets.codex;
    if (scenario === 'empty-descriptor') assets.gemini = {};
    if (scenario === 'missing-url') delete assets.gemini.manifest_url;
    if (scenario === 'unsafe-url') assets.gemini.manifest_url = `${baseUrl}../index.html`;
    expect(() => verify(f)).toThrow();
  });

  it('requires both generations when both are advertised', () => {
    const f = fixture('gemini');
    f.feed.releases[0].assets.antigravity =
      fixture('antigravity').feed.releases[0].assets.antigravity;
    expect(() => verify(f)).toThrow('plugin.json');
  });

  it('rejects empty assets and an unrecognized native manifest', () => {
    const f = fixture('antigravity');
    f.files.set(`${nativeRoot}/skills/eai/SKILL.md`, '');
    expect(() => verify(f)).toThrow('Missing or empty');
    f.files.set(`${nativeRoot}/skills/eai/SKILL.md`, 'skill');
    f.files.set(`${nativeRoot}/plugin.json`, JSON.stringify({ name: 'other' }));
    expect(() => verify(f)).toThrow('Unrecognized Antigravity');
  });
});
