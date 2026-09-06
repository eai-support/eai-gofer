import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  verifyUpdatePlans,
  verifyWorkspaceHostPolicies,
} from '../../../scripts/verify-surface-release-contract.mjs';
import {
  buildEaiRefreshLayout,
  EAI_REQUIRED_RESOURCE_DIRECTORIES,
} from '../../../scripts/verify-eai-refresh-layout.mjs';

const bootstrapUrl = new URL(
  '../../../.specify/scripts/node/workspace-bootstrap-lib.mjs',
  import.meta.url
);
const syncUrl = new URL(
  '../../../.specify/scripts/node/sync-extension-resources.mjs',
  import.meta.url
);
const temporaryRoots: string[] = [];
afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe('Antigravity release and bootstrap contracts (no native execution)', () => {
  it('checks each actual host and rejects the retired host, without auto fallback', async () => {
    const bootstrap = await import(bootstrapUrl.href);
    expect(() => verifyWorkspaceHostPolicies(bootstrap)).not.toThrow();
    expect(() => bootstrap.normalizeHost('not-a-host')).toThrow(/Unsupported/);
    expect(bootstrap.normalizeHost(' Antigravity-Desktop ')).toBe('antigravity-desktop');
    for (const host of ['auto', 'claude', 'codex', 'copilot', 'grok', 'vscode']) {
      expect(bootstrap.normalizeHost(host)).toBe(host);
    }
    expect(() =>
      verifyWorkspaceHostPolicies({ ...bootstrap, normalizeHost: () => 'auto' })
    ).toThrow(/fall back/);
    expect(() =>
      verifyWorkspaceHostPolicies({ ...bootstrap, normalizeHost: (host: string) => host })
    ).toThrow(/must not pass/);
    expect(() =>
      verifyWorkspaceHostPolicies({
        ...bootstrap,
        HOST_POLICIES: {
          ...bootstrap.HOST_POLICIES,
          antigravity: { required: ['GEMINI.md'] },
        },
      })
    ).toThrow(/missing/);
  });

  it('retains automatic update checks without treating workspace support as a native updater', () => {
    const plans = ['claude', 'codex', 'copilot', 'vscode'].map((host) => ({
      host,
      commands: [{}],
    }));
    expect(() => verifyUpdatePlans(plans)).not.toThrow();
    expect(() =>
      verifyUpdatePlans([...plans, { host: 'antigravity', status: 'blocked', commands: [] }])
    ).not.toThrow();
    expect(() => verifyUpdatePlans([...plans, { host: 'gemini', commands: [{}] }])).toThrow(
      /retired Gemini/
    );
    expect(() => verifyUpdatePlans(plans.slice(1))).toThrow(/every supported/);
    expect(() => verifyUpdatePlans([...plans, plans[0]])).toThrow(/every supported/);
    expect(() => verifyUpdatePlans(plans.map((plan) => ({ ...plan, commands: [] })))).toThrow(
      /every supported/
    );
  });

  it('ships shared skill resources, not a Gemini extension mirror', async () => {
    const { SYNC_PAIRS } = await import(syncUrl.href);
    expect(SYNC_PAIRS).toContainEqual(['.agents/skills', 'extension/resources/agents-skills']);
    expect(SYNC_PAIRS.some(([source]: string[]) => source === '.gemini')).toBe(false);
    expect(EAI_REQUIRED_RESOURCE_DIRECTORIES).toContain('agents-skills');
    expect(EAI_REQUIRED_RESOURCE_DIRECTORIES).not.toContain('gemini');
    const shellSync = await fs.readFile(
      new URL('../../../scripts/sync-extension-resources.sh', import.meta.url),
      'utf8'
    );
    expect(shellSync).toContain('".agents/skills"          "extension/resources/agents-skills"');
    expect(shellSync).not.toContain('sync_dir ".gemini"');
  });

  it('keeps GEMINI.md context without advertising the retired context command', async () => {
    const script = await fs.readFile(
      new URL('../../../.specify/scripts/bash/update-agent-context.sh', import.meta.url),
      'utf8'
    );
    expect(script).toContain('antigravity|antigravity-desktop)');
    expect(script).toContain('GEMINI_FILE="$REPO_ROOT/GEMINI.md"');
    expect(script).toContain('Gemini CLI is retired. Use antigravity or antigravity-desktop.');
    expect(script).not.toContain('claude|gemini|copilot');
  });

  it.each(['resources/agents-skills', 'skills'])(
    'bootstraps Antigravity from %s in packaged sources',
    async (layout) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-antigravity-source-'));
      temporaryRoots.push(root);
      const sourceRoot = path.join(root, 'bundle');
      await fs.mkdir(path.join(sourceRoot, '.specify/commands'), { recursive: true });
      for (const name of ['eai', 'eai-update']) {
        const dir = path.join(sourceRoot, layout, name);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'SKILL.md'), `name: ${name}\n`);
      }
      const { bootstrapWorkspace } = await import(bootstrapUrl.href);
      const workspaceRoot = path.join(root, 'workspace');
      await fs.mkdir(workspaceRoot);
      const result = await bootstrapWorkspace({
        workspaceRoot,
        sourceRoot,
        host: 'antigravity-desktop',
      });
      expect(result.host).toBe('antigravity-desktop');
      expect(result.status).toBe('missing'); // Skills alone do not establish a complete scaffold.
      expect(result.check.missingHost).toEqual([]);
      expect(
        await fs.readFile(path.join(workspaceRoot, '.agents/skills/eai/SKILL.md'), 'utf8')
      ).toBe('name: eai\n');
      await expect(fs.access(path.join(workspaceRoot, '.gemini'))).rejects.toThrow();
    }
  );

  it('drops stale Gemini resources only from normalized refresh output', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-antigravity-refresh-'));
    temporaryRoots.push(root);
    for (const resource of [...EAI_REQUIRED_RESOURCE_DIRECTORIES, 'gemini']) {
      const dir = path.join(root, 'extension/resources', resource);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'fixture.txt'), resource);
    }
    const output = path.join(root, 'output');
    await buildEaiRefreshLayout(root, output);
    await expect(fs.access(path.join(output, 'gemini'))).rejects.toThrow();
    expect(await fs.readFile(path.join(output, 'agents-skills/fixture.txt'), 'utf8')).toBe(
      'agents-skills'
    );
    expect(
      await fs.readFile(path.join(root, 'extension/resources/gemini/fixture.txt'), 'utf8')
    ).toBe('gemini');
  });
});
