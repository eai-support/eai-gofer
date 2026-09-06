import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const surfaceUpdateModuleUrl = new URL(
  '../../../.specify/scripts/node/gofer-surface-update.mjs',
  import.meta.url
);
const blockedHosts = [
  'gemini',
  'grok',
  'grok-bot',
  'grok-desktop',
  'antigravity-ide',
  'antigravity-vscode',
  'gemini-desktop',
];
const agy1127PluginHelp = `Usage: agy plugin <command> [arguments]

Commands:
  install <target>  Install a plugin (supports plugin@marketplace)
  validate [path]   Validate a plugin
`;

describe('gofer surface update', () => {
  it('rejects missing action and host values clearly', async () => {
    const { parseArgs } = await import(surfaceUpdateModuleUrl.href);

    expect(() => parseArgs(['--action', '--host', 'codex'])).toThrow('Missing value for --action.');
    expect(() => parseArgs(['--host'])).toThrow('Missing value for --host.');
  });

  it('always returns help without validating unrelated flags', async () => {
    const { parseArgs } = await import(surfaceUpdateModuleUrl.href);

    expect(parseArgs(['--help', '--action', 'unsupported'])).toEqual(
      expect.objectContaining({ help: true })
    );
  });

  it('plans a Claude user-level update without a repository path', async () => {
    const { buildSurfacePlan } = await import(surfaceUpdateModuleUrl.href);
    const plan = buildSurfacePlan({ action: 'update', host: 'claude' });

    expect(plan).toEqual([
      expect.objectContaining({
        host: 'claude',
        commands: [
          expect.objectContaining({
            command: 'claude',
            args: ['plugin', 'marketplace', 'update', 'eai-gofer'],
          }),
          expect.objectContaining({
            command: 'claude',
            args: ['plugin', 'update', 'eai-gofer@eai-gofer', '--scope', 'user'],
          }),
        ],
      }),
    ]);
  });

  it('uses the current host for auto mode and does not update every host by default', async () => {
    const { buildSurfacePlan } = await import(surfaceUpdateModuleUrl.href);
    const plan = buildSurfacePlan({ action: 'update', host: 'auto', currentHost: 'codex' });

    expect(plan).toHaveLength(1);
    expect(plan[0].host).toBe('codex');
    expect(plan[0].commands.map((step: { command: string }) => step.command)).toEqual([
      'codex',
      'codex',
    ]);
  });

  it('plans all supported host updates only when explicitly requested', async () => {
    const { buildSurfacePlan } = await import(surfaceUpdateModuleUrl.href);
    const plan = buildSurfacePlan({ action: 'update', host: 'all' });

    expect(plan.map((entry: { host: string }) => entry.host)).toEqual([
      'claude',
      'codex',
      'copilot',
      'vscode',
    ]);
  });

  it('uses the supported user instruction locations on macOS, Windows, and Linux', async () => {
    const { getAlwaysOnInstructionPath } = await import(surfaceUpdateModuleUrl.href);
    const home = '/Users/example';

    expect(getAlwaysOnInstructionPath('codex', { home })).toBe('/Users/example/.codex/AGENTS.md');
    expect(getAlwaysOnInstructionPath('claude', { home })).toBe('/Users/example/.claude/CLAUDE.md');
    expect(getAlwaysOnInstructionPath('copilot', { home })).toBe(
      '/Users/example/.copilot/copilot-instructions.md'
    );
    expect(() => getAlwaysOnInstructionPath('gemini', { home })).toThrow(
      'Unsupported host: gemini'
    );
    expect(getAlwaysOnInstructionPath('vscode', { home, platform: 'darwin' })).toBe(
      '/Users/example/Library/Application Support/Code/User/settings.json'
    );
    expect(
      getAlwaysOnInstructionPath('vscode', {
        home: 'C:\\Users\\example',
        platform: 'win32',
        env: { APPDATA: 'C:\\Users\\example\\AppData\\Roaming' },
      })
    ).toBe('C:\\Users\\example\\AppData\\Roaming/Code/User/settings.json');
    expect(getAlwaysOnInstructionPath('vscode', { home, platform: 'linux', env: {} })).toBe(
      '/Users/example/.config/Code/User/settings.json'
    );
  });

  it('replaces a managed CRLF section and does not add a leading blank line', async () => {
    const { upsertAlwaysOnEaiSection } = await import(surfaceUpdateModuleUrl.href);
    const windowsContent = [
      '## Always-On EAI Contract',
      '<!-- gofer:always-on-eai:start -->',
      'Old Gofer contract.',
      '<!-- gofer:always-on-eai:end -->',
      '',
      '## Personal Rules',
      'Keep this.',
    ].join('\r\n');

    const updated = upsertAlwaysOnEaiSection(windowsContent);
    expect(updated.match(/## Always-On EAI Contract/g) || []).toHaveLength(1);
    expect(updated).toContain('## Personal Rules');
    expect(upsertAlwaysOnEaiSection('').startsWith('## Always-On EAI Contract')).toBe(true);
  });

  it('fast-forwards a clean official Codex local marketplace and enables always-on routing', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const cleanup = vi.fn();
    const execute = vi.fn(async () => ({ stdout: 'updated' }));
    const configureInstructions = vi.fn(async () => [
      { host: 'codex', targetPath: '/Users/example/.codex/AGENTS.md', ok: true },
    ]);

    const result = await runPlan(buildSurfacePlan({ action: 'update', host: 'codex' }), {
      inspect: async () => ({ available: true }),
      inspectMarketplace: async () => ({ type: 'local', root: '/Users/example/gofer' }),
      inspectLocalMarketplace: async () => ({ clean: true, official: true, branch: 'main' }),
      execute,
      cleanup,
      configureInstructions,
    });

    expect(execute).toHaveBeenCalledWith(
      'git',
      ['-C', '/Users/example/gofer', 'fetch', 'origin', 'main'],
      { windowsHide: true }
    );
    expect(execute).toHaveBeenCalledWith(
      'git',
      ['-C', '/Users/example/gofer', 'merge', '--ff-only', 'origin/main'],
      { windowsHide: true }
    );
    expect(cleanup).toHaveBeenCalledWith({ apply: true });
    expect(configureInstructions).toHaveBeenCalledWith(['codex']);
    expect(result).toContainEqual(
      expect.objectContaining({
        host: 'codex',
        ok: true,
        label: 'Fast-forward the local EAI Gofer marketplace',
        stdout: 'updated',
      })
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        host: 'codex',
        label: 'Enable always-on Gofer instructions',
        ok: true,
      })
    );
  });

  it('preserves a dirty or non-main Codex local marketplace while still enabling always-on routing', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const execute = vi.fn();
    const configureInstructions = vi.fn(async () => [
      { host: 'codex', targetPath: '/Users/example/.codex/AGENTS.md', ok: true },
    ]);

    const result = await runPlan(buildSurfacePlan({ action: 'update', host: 'codex' }), {
      inspect: async () => ({ available: true }),
      inspectMarketplace: async () => ({ type: 'local', root: '/Users/example/gofer' }),
      inspectLocalMarketplace: async () => ({
        clean: false,
        official: true,
        branch: 'feature/local-work',
      }),
      execute,
      cleanup: vi.fn(),
      configureInstructions,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(configureInstructions).toHaveBeenCalledWith(['codex']);
    expect(result).toContainEqual(
      expect.objectContaining({
        host: 'codex',
        label: 'Update local EAI Gofer marketplace',
        ok: false,
        error: expect.stringContaining('uncommitted changes'),
      })
    );
  });

  it('stops when it cannot confirm the Codex marketplace source', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const cleanup = vi.fn();
    const execute = vi.fn();

    const result = await runPlan(buildSurfacePlan({ action: 'update', host: 'codex' }), {
      inspect: async () => ({ available: true }),
      inspectMarketplace: async () => ({ type: 'unknown' }),
      execute,
      cleanup,
      configureInstructions: vi.fn(async () => []),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    expect(result).toContainEqual(
      expect.objectContaining({
        host: 'codex',
        ok: false,
        error: expect.stringContaining('Update stopped to protect local Gofer work'),
      })
    );
  });

  it('classifies Codex marketplace sources without assuming missing output is Git', async () => {
    const { inspectCodexMarketplace, inspectLocalCodexMarketplace } = await import(
      surfaceUpdateModuleUrl.href
    );
    const list = async () => ({
      stdout: 'eai-gofer  /Users/example/gofer\n',
    });
    const local = await inspectCodexMarketplace(list);
    expect(local).toEqual({ type: 'local', root: '/Users/example/gofer' });

    const git = await inspectCodexMarketplace(async () => ({
      stdout: 'eai-gofer  https://github.com/eai-support/eai-gofer.git\n',
    }));
    expect(git).toEqual({ type: 'git', root: 'https://github.com/eai-support/eai-gofer.git' });

    const missing = await inspectCodexMarketplace(async () => ({
      stdout: 'other-plugin  /tmp/other\n',
    }));
    expect(missing).toEqual({ type: 'unknown' });

    const localInspection = await inspectLocalCodexMarketplace(
      '/Users/example/gofer',
      async (_command, args) => {
        if (args.includes('status')) return { stdout: '' };
        if (args.includes('remote'))
          return { stdout: 'git@github.com:eai-support/eai-gofer.git\n' };
        return { stdout: 'main\n' };
      }
    );
    expect(localInspection).toEqual({
      root: '/Users/example/gofer',
      clean: true,
      official: true,
      branch: 'main',
    });
  });

  it('keeps the update plan independent of installed repository files', async () => {
    const { buildSurfacePlan } = await import(surfaceUpdateModuleUrl.href);
    const plan = buildSurfacePlan({ action: 'update', host: 'all' });

    for (const entry of plan) {
      for (const step of entry.commands) {
        expect(step.args.join(' ')).not.toContain('.specify');
        expect(step.args.join(' ')).not.toContain('node_modules');
      }
    }
  });

  it('keeps install commands on public user-level sources', async () => {
    const { buildSurfacePlan } = await import(surfaceUpdateModuleUrl.href);
    const plan = buildSurfacePlan({ action: 'install', host: 'claude' });
    const step = plan[0].commands[0];

    expect(step.command).toBe('claude');
    expect(step.args).toContain('https://github.com/eai-support/eai-gofer');
    expect(step.args).toContain('--scope');
    expect(step.args.join(' ')).not.toContain('.specify');
  });

  it('archives stale Gofer entries only after a surface update succeeds', async () => {
    const { runPlan } = await import(surfaceUpdateModuleUrl.href);
    const cleanup = vi.fn(async () => ({
      archiveRoot: '/tmp/eai-gofer-archive',
      removed: [{ path: '/tmp/old-gofer-command.md' }],
    }));
    const result = await runPlan(
      [
        {
          host: 'codex',
          commands: [
            {
              command: 'codex',
              args: ['plugin', 'add', 'eai-gofer@eai-gofer'],
              label: 'Update Gofer',
            },
          ],
        },
      ],
      {
        inspect: async () => ({ available: true }),
        execute: async () => ({ stdout: 'updated' }),
        cleanup,
        configureInstructions: vi.fn(async () => []),
      }
    );

    expect(cleanup).toHaveBeenCalledWith({ apply: true });
    expect(result).toContainEqual(
      expect.objectContaining({
        label: 'Archive stale Gofer surface entries',
        ok: true,
        archived: 1,
      })
    );
  });

  it('does not clean up when the host update fails', async () => {
    const { runPlan } = await import(surfaceUpdateModuleUrl.href);
    const cleanup = vi.fn();
    await runPlan(
      [
        {
          host: 'codex',
          commands: [
            {
              command: 'codex',
              args: ['plugin', 'add', 'eai-gofer@eai-gofer'],
              label: 'Update Gofer',
            },
          ],
        },
      ],
      {
        inspect: async () => ({ available: true }),
        execute: async () => {
          throw new Error('update failed');
        },
        cleanup,
        configureInstructions: vi.fn(async () => []),
      }
    );

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('reports a useful error when execution throws a non-standard value', async () => {
    const { runPlan } = await import(surfaceUpdateModuleUrl.href);
    const result = await runPlan(
      [
        {
          host: 'codex',
          commands: [{ command: 'codex', args: ['plugin', 'add'], label: 'Update Gofer' }],
        },
      ],
      {
        inspect: async () => ({ available: true }),
        execute: async () => {
          throw 'unexpected failure';
        },
        cleanup: vi.fn(),
        configureInstructions: vi.fn(async () => []),
      }
    );

    expect(result).toContainEqual(
      expect.objectContaining({ ok: false, error: 'unexpected failure' })
    );
  });

  it('reports a useful error when host inspection throws a non-standard value', async () => {
    const { inspectHost } = await import(surfaceUpdateModuleUrl.href);
    const result = await inspectHost('codex', async () => {
      throw 'not available';
    });

    expect(result).toEqual(
      expect.objectContaining({ available: false, installed: false, error: 'not available' })
    );
  });

  it('inspects hosts without passing array index values as executor arguments', async () => {
    const { inspectHosts } = await import(surfaceUpdateModuleUrl.href);
    const inspect = vi.fn(async (host: string) => ({ host, available: true, installed: true }));

    await inspectHosts(['codex'], inspect);

    expect(inspect).toHaveBeenCalledWith('codex');
  });

  it('uses human-readable output unless JSON is requested', async () => {
    const { formatSurfaceUpdateReport } = await import(surfaceUpdateModuleUrl.href);
    const output = formatSurfaceUpdateReport({
      action: 'inspect',
      execute: false,
      hosts: [{ host: 'codex', available: true, installed: true }],
    });

    expect(output).toContain('Action: inspect');
    expect(output).toContain('codex: available, Gofer installed');
  });

  it('includes the required host reload step in a human-readable update plan', async () => {
    const { formatSurfaceUpdateReport } = await import(surfaceUpdateModuleUrl.href);
    const output = formatSurfaceUpdateReport({
      action: 'update',
      execute: false,
      plan: [
        {
          host: 'codex',
          commands: [{ label: 'Update Gofer' }],
          refresh: 'Start a new Codex task.',
        },
      ],
      results: [],
    });

    expect(output).toContain('codex: reload - Start a new Codex task.');
  });

  it('adds managed always-on instructions without replacing user instructions', async () => {
    const { configureAlwaysOnInstructions } = await import(surfaceUpdateModuleUrl.href);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-always-on-'));
    const codexPath = path.join(home, '.codex', 'AGENTS.md');
    const copilotPath = path.join(home, '.copilot', 'copilot-instructions.md');
    const vscodePath = path.join(home, '.config', 'Code', 'User', 'settings.json');
    fs.mkdirSync(path.dirname(codexPath), { recursive: true });
    fs.mkdirSync(path.dirname(vscodePath), { recursive: true });
    fs.writeFileSync(codexPath, '# Personal rules\n\nKeep this instruction.\n');
    fs.writeFileSync(
      vscodePath,
      '{\n  // User settings can include comments and trailing commas.\n  "editor.fontSize": 16,\n}\n'
    );

    try {
      const results = await configureAlwaysOnInstructions(['codex', 'copilot', 'vscode'], {
        home,
        platform: 'linux',
        env: {},
      });

      expect(results.every((entry: { ok: boolean }) => entry.ok)).toBe(true);
      const codex = fs.readFileSync(codexPath, 'utf8');
      expect(codex).toContain('Keep this instruction.');
      expect(codex).toContain('gofer:always-on-eai:start');
      expect(fs.readFileSync(copilotPath, 'utf8')).toContain('gofer:always-on-eai:start');

      const vscode = fs.readFileSync(vscodePath, 'utf8');
      expect(vscode).toContain('// User settings can include comments and trailing commas.');
      expect(vscode).toContain('"editor.fontSize": 16,');
      expect(vscode).toContain('gofer:always-on-eai:start');

      fs.writeFileSync(
        vscodePath,
        `{
  "editor.fontSize": 16, // retain this comment
  "github.copilot.chat.codeGeneration.instructions": [{ "text": "<!-- gofer:always-on-eai:start --> old <!-- gofer:always-on-eai:end -->" }],
}
`
      );
      const refreshed = await configureAlwaysOnInstructions(['vscode'], {
        home,
        platform: 'linux',
        env: {},
      });
      expect(refreshed[0].ok).toBe(true);
      const refreshedVscode = fs.readFileSync(vscodePath, 'utf8');
      expect(refreshedVscode).toContain('// retain this comment');
      expect(refreshedVscode).toContain('Always-On EAI Contract');
      expect(refreshedVscode).not.toContain('<!-- gofer:always-on-eai:start --> old');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('recognized but unverified Gofer surfaces', () => {
  it('acknowledges Grok native plugins without claiming the Gofer adapter works', async () => {
    const { buildSurfacePlan } = await import(surfaceUpdateModuleUrl.href);
    const [plan] = buildSurfacePlan({ action: 'update', host: 'grok' });
    expect(plan.status).toBe('blocked');
    expect(plan.reason).toContain('supports native plugins');
    expect(plan.reason).toContain('Gofer native install/update integration is unverified');
  });
  it('recognizes Spark skills without claiming a verified Gofer desktop integration', async () => {
    const { buildSurfacePlan } = await import(surfaceUpdateModuleUrl.href);
    const [plan] = buildSurfacePlan({ action: 'install', host: 'gemini-desktop' });
    expect(plan.status).toBe('blocked');
    expect(plan.commands).toEqual([]);
    expect(plan.reason).toContain('Spark supports uploaded skills');
    expect(plan.reason).toContain('Gofer integration is unverified');
    expect(plan.reason).toContain('Internet-dependent skill scripts are not supported');
  });

  it.each(blockedHosts)(
    'recognizes explicit and GOFER_HOST selection for %s without aliases',
    async (host) => {
      const { parseArgs, resolveHosts, buildSurfacePlan } = await import(
        surfaceUpdateModuleUrl.href
      );
      expect(parseArgs(['--host', host]).host).toBe(host);
      expect(resolveHosts(host, 'gemini')).toEqual([host]);
      vi.stubEnv('GOFER_HOST', host);
      try {
        expect(resolveHosts('auto')).toEqual([host]);
        expect(buildSurfacePlan({ action: 'update', host: 'auto' })).toEqual(
          buildSurfacePlan({ action: 'update', host })
        );
        expect(resolveHosts('gemini')).toEqual(['gemini']);
        expect(resolveHosts('all')).toEqual(['claude', 'codex', 'copilot', 'vscode']);
      } finally {
        vi.unstubAllEnvs();
      }
    }
  );

  it.each(
    blockedHosts.flatMap((host) => ['install', 'update'].map((action) => ({ host, action })))
  )(
    'blocks $action for $host before any inspection, command, cleanup or settings write',
    async ({ host, action }) => {
      const { buildSurfacePlan, runPlan, formatSurfaceUpdateReport } = await import(
        surfaceUpdateModuleUrl.href
      );
      const plan = buildSurfacePlan({ action, host });
      expect(plan).toEqual([
        {
          host,
          action,
          status: 'blocked',
          reason: expect.stringMatching(/unverified|No verified|retired/),
          commands: [],
        },
      ]);
      const dependencies = {
        inspect: vi.fn(async () => ({ available: true, installed: true })),
        inspectMarketplace: vi.fn(),
        inspectLocalMarketplace: vi.fn(),
        execute: vi.fn(),
        cleanup: vi.fn(),
        configureInstructions: vi.fn(),
      };
      const results = await runPlan(plan, dependencies);
      expect(results).toEqual([
        expect.objectContaining({
          host,
          status: 'blocked',
          ok: false,
          reason: plan[0].reason,
          error: plan[0].reason,
        }),
      ]);
      // A forged available/command-bearing plan must not bypass the host boundary.
      const forged = [
        { host, action, commands: [{ command: 'agy', args: ['unverified-command'] }] },
      ];
      expect(await runPlan(forged, dependencies)).toEqual(results);
      const mixed = [...buildSurfacePlan({ action, host: 'claude' }), ...plan];
      expect(await runPlan(mixed, dependencies)).toEqual(results);
      for (const dependency of Object.values(dependencies))
        expect(dependency).not.toHaveBeenCalled();
      const report = formatSurfaceUpdateReport({ action, execute: true, plan, results });
      expect(report).toContain(`${host}: blocked - ${plan[0].reason}`);
      expect(report).not.toMatch(/completed|reload -/);
    }
  );

  it.each(blockedHosts)(
    'returns a failing CLI exit for blocked %s, including auto mode',
    (host) => {
      for (const action of ['install', 'update']) {
        for (const selection of [host, 'auto']) {
          const result = spawnSync(
            process.execPath,
            [
              fileURLToPath(surfaceUpdateModuleUrl),
              '--action',
              action,
              '--host',
              selection,
              '--execute',
              '--json',
            ],
            {
              encoding: 'utf8',
              shell: false,
              timeout: 5000,
              env: { ...process.env, GOFER_HOST: host },
            }
          );
          expect(result.error).toBeUndefined();
          expect(result.status).toBe(1);
          const report = JSON.parse(result.stdout);
          expect(report.plan).toEqual([
            expect.objectContaining({ host, status: 'blocked', commands: [] }),
          ]);
          expect(report.results).toEqual([
            expect.objectContaining({ host, status: 'blocked', ok: false }),
          ]);
        }
      }
    }
  );

  it.each(blockedHosts)(
    'does not invent or write a global instruction path for %s',
    async (host) => {
      const { getAlwaysOnInstructionPath, configureAlwaysOnInstructions } = await import(
        surfaceUpdateModuleUrl.href
      );
      const fileSystem = { readFile: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() };
      expect(() => getAlwaysOnInstructionPath(host)).toThrow(`Unsupported host: ${host}`);
      await expect(configureAlwaysOnInstructions([host], { fileSystem })).rejects.toThrow(
        `Unsupported host: ${host}`
      );
      for (const method of Object.values(fileSystem)) expect(method).not.toHaveBeenCalled();
    }
  );

  it.each(['agy', 'antigravity-cli', 'gemini-app'])(
    'does not silently alias %s to Gemini',
    async (host) => {
      const { parseArgs, resolveHosts } = await import(surfaceUpdateModuleUrl.href);
      expect(() => parseArgs(['--host', host])).toThrow('Unsupported host');
      expect(resolveHosts('auto', host)).toEqual([]);
    }
  );

  it('retires Gemini CLI without probing it or migrating user data', async () => {
    const { buildSurfacePlan, inspectHost } = await import(surfaceUpdateModuleUrl.href);
    expect(buildSurfacePlan({ action: 'update', host: 'gemini' })[0]).toMatchObject({
      status: 'blocked',
      commands: [],
    });
    const execute = vi.fn(async () => ({ stdout: 'eai-gofer' }));
    expect(await inspectHost('gemini', execute)).toMatchObject({
      status: 'blocked',
      retired: true,
      available: null,
      installed: null,
      reason: expect.stringContaining('never import all legacy assets'),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('advertises the distinct hosts and the unchanged all-host boundary in help', () => {
    const result = spawnSync(process.execPath, [fileURLToPath(surfaceUpdateModuleUrl), '--help'], {
      encoding: 'utf8',
      shell: false,
      timeout: 5000,
    });
    expect(result.status).toBe(0);
    for (const host of blockedHosts) expect(result.stdout).toContain(host);
    expect(result.stdout).toContain('all covers only claude, codex, copilot, vscode');
    expect(result.stdout).toContain('Gemini CLI is retired and blocked');
    expect(result.stdout).toContain('Other unverified integrations remain blocked');
  });
});

describe('read-only Antigravity inspection', () => {
  it('uses only bounded native agy probes with auto-update disabled, without claiming a Gofer bundle', async () => {
    const { inspectHost, formatSurfaceUpdateReport } = await import(surfaceUpdateModuleUrl.href);
    vi.stubEnv('AGY_CLI_DISABLE_AUTO_UPDATE', 'false');
    vi.stubEnv('GOFER_PROBE_TEST_CONTEXT', 'preserved');
    try {
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ stdout: 'agy fixture-version\n' })
        .mockResolvedValueOnce({ stdout: 'eai-gofer /private/plugin/path private-metadata\n' });
      const result = await inspectHost('antigravity', execute);
      expect(result).toMatchObject({
        host: 'antigravity',
        status: 'unverified',
        available: true,
        installed: null,
        version: 'agy fixture-version',
        pluginListRead: true,
      });
      expect(execute).toHaveBeenCalledTimes(2);
      const options = expect.objectContaining({
        shell: false,
        windowsHide: true,
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        env: expect.objectContaining({
          AGY_CLI_DISABLE_AUTO_UPDATE: 'true',
          GOFER_PROBE_TEST_CONTEXT: 'preserved',
        }),
      });
      expect(execute).toHaveBeenNthCalledWith(1, 'agy', ['--version'], options);
      expect(execute).toHaveBeenNthCalledWith(2, 'agy', ['plugin', 'list'], options);
      expect(process.env.AGY_CLI_DISABLE_AUTO_UPDATE).toBe('false');
      expect(JSON.stringify(result)).not.toMatch(/private-metadata|private\/plugin/);
      const report = formatSurfaceUpdateReport({
        action: 'inspect',
        execute: false,
        hosts: [result],
      });
      expect(report).toContain('CLI available; unverified');
      expect(report).not.toContain('Gofer installed');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('reports a missing agy executable without invoking a plugin command', async () => {
    const { inspectHost } = await import(surfaceUpdateModuleUrl.href);
    const execute = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('private-path'), { code: 'ENOENT' }));
    expect(await inspectHost('antigravity', execute)).toMatchObject({
      status: 'unavailable',
      available: false,
      installed: false,
      pluginListRead: false,
      error: 'agy is not installed or is not on PATH.',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(['EACCES', 'ETIMEDOUT'])(
    'does not confuse %s with an absent executable',
    async (code) => {
      const { inspectHost } = await import(surfaceUpdateModuleUrl.href);
      const execute = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('private-error'), { code }));
      const result = await inspectHost('antigravity', execute);
      expect(result).toMatchObject({
        status: 'unverified',
        available: null,
        installed: null,
        pluginListRead: false,
      });
      expect(JSON.stringify(result)).not.toContain('private-error');
      expect(execute).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps CLI availability distinct from a failed plugin list', async () => {
    const { inspectHost } = await import(surfaceUpdateModuleUrl.href);
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'agy fixture-version' })
      .mockRejectedValue(new Error('private-account-details'));
    const result = await inspectHost('antigravity', execute);
    expect(result).toMatchObject({
      status: 'unverified',
      available: true,
      installed: null,
      pluginListRead: false,
      reason: 'Could not read agy plugin list; Gofer installation is unverified.',
    });
    expect(JSON.stringify(result)).not.toContain('private-account-details');
  });

  it.each(['antigravity-ide', 'antigravity-vscode', 'gemini-desktop', 'grok-bot', 'grok-desktop'])(
    'does not infer %s support from any installed CLI',
    async (host) => {
      const { inspectHost, formatSurfaceUpdateReport } = await import(surfaceUpdateModuleUrl.href);
      const execute = vi.fn(async () => ({ stdout: 'eai-gofer is installed' }));
      const result = await inspectHost(host, execute);
      expect(result).toMatchObject({
        host,
        status: 'unverified',
        available: null,
        installed: null,
      });
      expect(execute).not.toHaveBeenCalled();
      expect(
        formatSurfaceUpdateReport({ action: 'inspect', execute: false, hosts: [result] })
      ).toContain(`${host}: unverified`);
    }
  );
});

function nativeFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-native-updater-')));
  const home = path.join(root, 'test home');
  const sourceRoot = path.join(root, 'stable source');
  const plugin = path.join(sourceRoot, 'plugins', 'antigravity', 'eai-gofer');
  const desktop = path.join(home, '.gemini', 'config', 'plugins', 'eai-gofer');
  const cli = path.join(home, '.gemini', 'antigravity-cli', 'plugins', 'eai-gofer');
  const maintenance = path.join(home, '.gemini', 'config', '.gofer-plugin-maintenance');
  const write = (name: string, content: string) => {
    const file = path.join(plugin, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  fs.mkdirSync(home, { recursive: true });
  write('plugin.json', JSON.stringify({ name: 'eai-gofer' }));
  write('.eai-gofer-plugin-version', '1.0.0\ngenerated-by-eai-gofer\n');
  write('agents/reviewer.md', 'fixture agent');
  write('LICENSE', 'fixture license');
  write('NOTICE', 'fixture notice');
  write('TRADEMARKS.md', 'fixture trademarks');
  write('skills/eai/SKILL.md', 'fixture-v1');
  write('skills/eai-update/SKILL.md', 'fixture maintenance');
  write('rules/eai.md', 'fixture rule');
  write('.specify/scripts/node/gofer-surface-update.mjs', '// fixture only');
  for (const stage of [
    '0_gofer_start',
    '1_gofer_research',
    '2_gofer_specify',
    '3_gofer_plan',
    '4_gofer_tasks',
    '5_gofer_implement',
    '6_gofer_validate',
  ]) {
    write(`.specify/commands/${stage}.md`, 'fixture pipeline');
  }
  return {
    root,
    home,
    sourceRoot,
    plugin,
    desktop,
    cli,
    maintenance,
    write,
    dispose: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

describe('bounded native Antigravity deployment', () => {
  it.each([
    ['source-tree', 'antigravity'],
    ['native-root', 'antigravity'],
    ['source-tree', 'antigravity-desktop'],
    ['native-root', 'antigravity-desktop'],
  ])(
    'deploys the actual native package from %s for %s into a temporary home',
    async (layout, host) => {
      const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
      const f = nativeFixture();
      const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
      const nativeRoot = path.join(repositoryRoot, 'plugins', 'antigravity', 'eai-gofer');
      const sourceRoot = layout === 'native-root' ? nativeRoot : repositoryRoot;
      const target = host === 'antigravity' ? f.cli : f.desktop;
      const execute = vi.fn(async (_command: string, args: string[]) => {
        if (args.at(-1) === '--help') return { stdout: 'Usage: agy plugin install <local-path>' };
        fs.cpSync(nativeRoot, target, { recursive: true });
        return { stdout: '' };
      });
      try {
        // Read the real generated artifact; do not generate it or substitute a reduced fixture.
        expect(fs.readdirSync(nativeRoot).sort()).toEqual(
          [
            '.eai-gofer-plugin-version',
            '.specify',
            'LICENSE',
            'NOTICE',
            'TRADEMARKS.md',
            'agents',
            'plugin.json',
            'rules',
            'skills',
          ].sort()
        );
        const result = await runPlan(buildSurfacePlan({ host, action: 'install', sourceRoot }), {
          home: f.home,
          execute,
        });
        expect(result).toEqual([
          expect.objectContaining({
            ok: true,
            changed: true,
            executionVerified: false,
            targetPath: target,
          }),
        ]);
        const compare = (relative = '') => {
          for (const entry of fs.readdirSync(path.join(nativeRoot, relative), {
            withFileTypes: true,
          })) {
            const name = path.join(relative, entry.name);
            if (entry.isDirectory()) compare(name);
            else {
              expect(
                fs
                  .readFileSync(path.join(target, name))
                  .equals(fs.readFileSync(path.join(nativeRoot, name))),
                name
              ).toBe(true);
              expect(fs.statSync(path.join(target, name)).mode & 0o777, name).toBe(
                fs.statSync(path.join(nativeRoot, name)).mode & 0o777
              );
            }
          }
        };
        compare();
        if (host === 'antigravity') {
          expect(execute).toHaveBeenNthCalledWith(
            2,
            'agy',
            ['plugin', 'install', nativeRoot],
            expect.objectContaining({ shell: false })
          );
        } else expect(execute).not.toHaveBeenCalled();
        execute.mockClear();
        expect(
          (
            await runPlan(buildSurfacePlan({ host, action: 'update', sourceRoot }), {
              home: f.home,
              execute,
            })
          )[0]
        ).toMatchObject({ ok: true, changed: false });
        expect(execute).not.toHaveBeenCalled();
      } finally {
        f.dispose();
      }
    },
    30000
  );

  it('uses its own validated native root when a bundled updater has no source override', async () => {
    const f = nativeFixture();
    try {
      const script = path.join(f.plugin, '.specify/scripts/node/gofer-surface-update.mjs');
      fs.copyFileSync(fileURLToPath(surfaceUpdateModuleUrl), script);
      fs.mkdirSync(path.join(path.dirname(script), 'lib'), { recursive: true });
      fs.copyFileSync(
        fileURLToPath(new URL('lib/grok-surface.mjs', surfaceUpdateModuleUrl)),
        path.join(path.dirname(script), 'lib/grok-surface.mjs')
      );
      fs.copyFileSync(
        fileURLToPath(new URL('gofer-local-settings-cleanup.mjs', surfaceUpdateModuleUrl)),
        path.join(path.dirname(script), 'gofer-local-settings-cleanup.mjs')
      );
      const { buildSurfacePlan, runPlan } = await import(
        /* @vite-ignore */ pathToFileURL(script).href
      );
      const plan = buildSurfacePlan({ host: 'antigravity-desktop', action: 'install' });
      expect(plan[0].sourceRoot).toBe(f.plugin);
      expect((await runPlan(plan, { home: f.home, execute: vi.fn() }))[0]).toMatchObject({
        ok: true,
        changed: true,
        executionVerified: false,
      });
    } finally {
      f.dispose();
    }
  });

  it.each(['missing-marker', 'invalid-marker', 'wrong-manifest', 'undeclared-root'])(
    'rejects an untrusted native root without calls or writes: %s',
    async (problem) => {
      const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
      const f = nativeFixture();
      const execute = vi.fn();
      try {
        if (problem === 'missing-marker')
          fs.unlinkSync(path.join(f.plugin, '.eai-gofer-plugin-version'));
        if (problem === 'invalid-marker')
          f.write('.eai-gofer-plugin-version', '1.0.0\nnot-gofer\n');
        if (problem === 'wrong-manifest') f.write('plugin.json', '{"name":"unrelated"}');
        if (problem === 'undeclared-root') f.write('personal.txt', 'preserve');
        for (const host of ['antigravity', 'antigravity-desktop']) {
          expect(
            (
              await runPlan(buildSurfacePlan({ host, action: 'install', sourceRoot: f.plugin }), {
                home: f.home,
                execute,
              })
            )[0]
          ).toMatchObject({ ok: false, status: 'blocked' });
        }
        expect(execute).not.toHaveBeenCalled();
        expect(fs.readdirSync(f.home)).toEqual([]);
      } finally {
        f.dispose();
      }
    }
  );

  it('keeps native targets explicit and supports an absolute source root', async () => {
    const { parseArgs, buildSurfacePlan, resolveHosts } = await import(surfaceUpdateModuleUrl.href);
    const sourceRoot = path.resolve('fixture source');
    expect(parseArgs(['--host', 'antigravity', '--source-root', sourceRoot])).toMatchObject({
      sourceRoot,
    });
    expect(() => parseArgs(['--source-root'])).toThrow('Missing value');
    expect(() => parseArgs(['--source-root', 'relative'])).toThrow('absolute');
    expect(resolveHosts('all')).toEqual(['claude', 'codex', 'copilot', 'vscode']);
    for (const host of ['antigravity', 'antigravity-desktop']) {
      expect(buildSurfacePlan({ host, action: 'install', sourceRoot })[0]).toMatchObject({
        host,
        sourceRoot,
        commands: [],
      });
      expect(resolveHosts('auto', host)).toEqual([host]);
    }
  });

  it('returns a migration failure for Gemini inspection without starting any CLI', () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(surfaceUpdateModuleUrl), '--action', 'inspect', '--host', 'gemini', '--json'],
      { encoding: 'utf8', shell: false, timeout: 5000 }
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).hosts).toEqual([
      expect.objectContaining({ host: 'gemini', status: 'blocked', retired: true }),
    ]);
  });

  it('stages only owned desktop files, retains backups outside plugins and is idempotent', async () => {
    const { buildSurfacePlan, runPlan, inspectHost } = await import(surfaceUpdateModuleUrl.href);
    const f = nativeFixture();
    const execute = vi.fn();
    const cleanup = vi.fn();
    const configureInstructions = vi.fn();
    const inspect = vi.fn();
    const deps = {
      sourceRoot: f.sourceRoot,
      home: f.home,
      execute,
      cleanup,
      configureInstructions,
      inspect,
    };
    const plan = buildSurfacePlan({ host: 'antigravity-desktop', action: 'install' });
    try {
      fs.mkdirSync(path.join(f.home, '.gemini', 'config', 'plugins', 'personal-plugin'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(f.home, '.gemini', 'config', 'plugins', 'personal-plugin', 'private.txt'),
        'keep personal data'
      );
      fs.writeFileSync(path.join(f.home, '.gemini', 'settings.json'), 'legacy configuration');
      const first = await runPlan(plan, deps);
      expect(first).toEqual([
        expect.objectContaining({
          ok: true,
          changed: true,
          executionVerified: false,
          targetPath: f.desktop,
        }),
      ]);
      expect(fs.readFileSync(path.join(f.desktop, 'skills/eai/SKILL.md'), 'utf8')).toBe(
        'fixture-v1'
      );
      expect(await inspectHost('antigravity-desktop', execute, { home: f.home })).toMatchObject({
        status: 'unverified',
        installed: true,
        available: null,
      });
      const before = fs.readdirSync(f.maintenance);
      expect(await runPlan(plan, deps)).toEqual([
        expect.objectContaining({ ok: true, changed: false }),
      ]);
      expect(fs.readdirSync(f.maintenance)).toEqual(before);
      f.write('skills/eai/SKILL.md', 'fixture-v2');
      const updated = await runPlan(
        buildSurfacePlan({ host: 'antigravity-desktop', action: 'update' }),
        deps
      );
      expect(updated[0]).toMatchObject({ ok: true, changed: true, executionVerified: false });
      expect(updated[0].backupPath.startsWith(`${f.maintenance}${path.sep}`)).toBe(true);
      expect(fs.readFileSync(path.join(updated[0].backupPath, 'skills/eai/SKILL.md'), 'utf8')).toBe(
        'fixture-v1'
      );
      expect(fs.readFileSync(path.join(f.desktop, 'skills/eai/SKILL.md'), 'utf8')).toBe(
        'fixture-v2'
      );
      expect(
        fs.readFileSync(
          path.join(f.home, '.gemini', 'config', 'plugins', 'personal-plugin', 'private.txt'),
          'utf8'
        )
      ).toBe('keep personal data');
      expect(fs.readFileSync(path.join(f.home, '.gemini', 'settings.json'), 'utf8')).toBe(
        'legacy configuration'
      );
      for (const callback of [execute, cleanup, configureInstructions, inspect])
        expect(callback).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });

  it.each([
    'absent',
    'wrong-name',
    'missing-marker',
    'invalid-marker',
    'undeclared-root',
    'missing-skill',
    'missing-stage',
    'missing-rules',
    'secret-file',
    'linked-file',
    'linked-source',
  ])('blocks unsafe native source %s before side effects', async (problem) => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const f = nativeFixture();
    const execute = vi.fn();
    const cleanup = vi.fn();
    const configureInstructions = vi.fn();
    try {
      if (problem === 'absent') fs.rmSync(f.plugin, { recursive: true });
      if (problem === 'wrong-name') f.write('plugin.json', '{"name":"someone-else"}');
      if (problem === 'missing-marker')
        fs.unlinkSync(path.join(f.plugin, '.eai-gofer-plugin-version'));
      if (problem === 'invalid-marker') f.write('.eai-gofer-plugin-version', 'not-a-Gofer-marker');
      if (problem === 'undeclared-root') f.write('personal.txt', 'preserve');
      if (problem === 'missing-skill') fs.unlinkSync(path.join(f.plugin, 'skills/eai/SKILL.md'));
      if (problem === 'missing-stage')
        fs.unlinkSync(path.join(f.plugin, '.specify/commands/6_gofer_validate.md'));
      if (problem === 'missing-rules') fs.rmSync(path.join(f.plugin, 'rules'), { recursive: true });
      if (problem === 'secret-file') f.write('.specify/.env', 'private fixture');
      if (problem === 'linked-file') {
        fs.unlinkSync(path.join(f.plugin, 'skills/eai/SKILL.md'));
        fs.symlinkSync(
          path.join(f.plugin, 'plugin.json'),
          path.join(f.plugin, 'skills/eai/SKILL.md')
        );
      }
      if (problem === 'linked-source') {
        fs.renameSync(f.plugin, `${f.plugin}-real`);
        fs.symlinkSync(`${f.plugin}-real`, f.plugin, 'dir');
      }
      for (const host of ['antigravity', 'antigravity-desktop']) {
        expect(
          await runPlan(buildSurfacePlan({ host, action: 'install' }), {
            sourceRoot: f.sourceRoot,
            home: f.home,
            execute,
            cleanup,
            configureInstructions,
          })
        ).toEqual([expect.objectContaining({ status: 'blocked', ok: false })]);
      }
      expect(fs.readdirSync(f.home)).toEqual([]);
      for (const callback of [execute, cleanup, configureInstructions])
        expect(callback).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });

  it.each(['parent-link', 'target-link', 'unowned', 'modified'])(
    'preserves unsafe or user-owned desktop state: %s',
    async (problem) => {
      const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
      const f = nativeFixture();
      const plan = buildSurfacePlan({ host: 'antigravity-desktop', action: 'update' });
      const deps = { sourceRoot: f.sourceRoot, home: f.home, execute: vi.fn() };
      try {
        const outside = path.join(f.root, 'unrelated');
        fs.mkdirSync(outside);
        fs.writeFileSync(path.join(outside, 'keep.txt'), 'untouched');
        if (problem === 'parent-link') fs.symlinkSync(outside, path.join(f.home, '.gemini'), 'dir');
        if (problem === 'target-link') {
          fs.mkdirSync(path.dirname(f.desktop), { recursive: true });
          fs.symlinkSync(outside, f.desktop, 'dir');
        }
        if (problem === 'unowned') fs.cpSync(f.plugin, f.desktop, { recursive: true });
        if (problem === 'modified') {
          expect((await runPlan(plan, deps))[0].ok).toBe(true);
          fs.writeFileSync(path.join(f.desktop, 'skills/eai/SKILL.md'), 'personal edit');
        }
        expect((await runPlan(plan, deps))[0]).toMatchObject({ status: 'blocked', ok: false });
        expect(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8')).toBe('untouched');
        if (problem === 'modified')
          expect(fs.readFileSync(path.join(f.desktop, 'skills/eai/SKILL.md'), 'utf8')).toBe(
            'personal edit'
          );
        if (problem === 'unowned')
          expect(fs.existsSync(path.join(f.desktop, '.gofer-install.json'))).toBe(false);
        expect(deps.execute).not.toHaveBeenCalled();
      } finally {
        f.dispose();
      }
    }
  );

  it.each(['stage-write', 'activate'])(
    'restores or retains the previous desktop package on %s failure',
    async (failure) => {
      const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
      const f = nativeFixture();
      const plan = buildSurfacePlan({ host: 'antigravity-desktop', action: 'update' });
      const deps = { sourceRoot: f.sourceRoot, home: f.home, execute: vi.fn() };
      try {
        expect((await runPlan(plan, deps))[0].ok).toBe(true);
        const receipt = fs.readFileSync(path.join(f.desktop, '.gofer-install.json'), 'utf8');
        f.write('skills/eai/SKILL.md', 'fixture-v2');
        const fileSystem = {
          ...fs.promises,
          writeFile: vi.fn(async (...args: Parameters<typeof fs.promises.writeFile>) => {
            if (failure === 'stage-write' && String(args[0]).includes(`${path.sep}stage-`))
              throw Object.assign(new Error('fixture write failure'), { code: 'EIO' });
            return fs.promises.writeFile(...args);
          }),
          rename: vi.fn(async (from: fs.PathLike, to: fs.PathLike) => {
            if (
              failure === 'activate' &&
              String(from).includes(`${path.sep}stage-`) &&
              to === f.desktop
            )
              throw Object.assign(new Error('fixture rename failure'), { code: 'EIO' });
            return fs.promises.rename(from, to);
          }),
        };
        expect((await runPlan(plan, { ...deps, fileSystem }))[0]).toMatchObject({
          status: 'blocked',
          ok: false,
        });
        expect(fs.readFileSync(path.join(f.desktop, 'skills/eai/SKILL.md'), 'utf8')).toBe(
          'fixture-v1'
        );
        expect(fs.readFileSync(path.join(f.desktop, '.gofer-install.json'), 'utf8')).toBe(receipt);
        expect(
          fs
            .readdirSync(f.maintenance)
            .some((name) => name.startsWith('stage-') || name.endsWith('.lock'))
        ).toBe(false);
      } finally {
        f.dispose();
      }
    }
  );

  it("does not remove someone else's desktop update lock", async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const f = nativeFixture();
    try {
      fs.mkdirSync(f.maintenance, { recursive: true });
      const lock = path.join(f.maintenance, 'eai-gofer.lock');
      fs.writeFileSync(lock, 'another update');
      const result = await runPlan(
        buildSurfacePlan({ host: 'antigravity-desktop', action: 'install' }),
        { sourceRoot: f.sourceRoot, home: f.home }
      );
      expect(result[0]).toMatchObject({ ok: false, status: 'blocked' });
      expect(fs.readFileSync(lock, 'utf8')).toBe('another update');
      expect(fs.existsSync(f.desktop)).toBe(false);
    } finally {
      f.dispose();
    }
  });

  it('retains the backup and unrelated destination if rollback cannot safely restore', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const f = nativeFixture();
    const plan = buildSurfacePlan({ host: 'antigravity-desktop', action: 'update' });
    const deps = { sourceRoot: f.sourceRoot, home: f.home };
    try {
      expect((await runPlan(plan, deps))[0].ok).toBe(true);
      f.write('skills/eai/SKILL.md', 'fixture-v2');
      const fileSystem = {
        ...fs.promises,
        rename: async (from: fs.PathLike, to: fs.PathLike) => {
          if (String(from).includes(`${path.sep}stage-`) && to === f.desktop) {
            fs.mkdirSync(f.desktop);
            fs.writeFileSync(path.join(f.desktop, 'personal.txt'), 'concurrent personal file');
            throw Object.assign(new Error('occupied'), { code: 'ENOTEMPTY' });
          }
          return fs.promises.rename(from, to);
        },
      };
      const result = await runPlan(plan, { ...deps, fileSystem });
      expect(result[0]).toMatchObject({
        ok: false,
        reason: expect.stringContaining('Manual recovery is required'),
      });
      expect(fs.readFileSync(path.join(f.desktop, 'personal.txt'), 'utf8')).toBe(
        'concurrent personal file'
      );
      const backups = fs.readdirSync(f.maintenance).filter((name) => name.startsWith('backup-'));
      expect(backups).toHaveLength(1);
      expect(
        fs.readFileSync(
          path.join(f.maintenance, backups[0], 'eai-gofer', 'skills/eai/SKILL.md'),
          'utf8'
        )
      ).toBe('fixture-v1');
      expect(
        fs
          .readdirSync(f.maintenance)
          .some((name) => name.startsWith('stage-') || name.endsWith('.lock'))
      ).toBe(false);
    } finally {
      f.dispose();
    }
  });

  it('verifies native CLI help, installs exactly one local plugin and reads back the files', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const f = nativeFixture();
    const cleanup = vi.fn();
    const configureInstructions = vi.fn();
    const execute = vi.fn(async (_command: string, args: string[]) => {
      if (args.at(-1) === '--help')
        return { stdout: 'Usage:\n  agy plugin install <local-path> [flags]\n' };
      fs.cpSync(f.plugin, f.cli, { recursive: true });
      return { stdout: 'private native output must not be returned' };
    });
    try {
      const result = await runPlan(buildSurfacePlan({ host: 'antigravity', action: 'install' }), {
        sourceRoot: f.sourceRoot,
        home: f.home,
        execute,
        cleanup,
        configureInstructions,
      });
      expect(result[0]).toMatchObject({
        ok: true,
        changed: true,
        executionVerified: false,
        targetPath: f.cli,
      });
      expect(execute).toHaveBeenNthCalledWith(
        1,
        'agy',
        ['plugin', 'install', '--help'],
        expect.objectContaining({
          shell: false,
          timeout: 5000,
          env: expect.objectContaining({ AGY_CLI_DISABLE_AUTO_UPDATE: 'true' }),
        })
      );
      expect(execute).toHaveBeenNthCalledWith(
        2,
        'agy',
        ['plugin', 'install', f.plugin],
        expect.objectContaining({ shell: false, timeout: 30000 })
      );
      expect(execute).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(result)).not.toContain('private native output');
      expect(cleanup).not.toHaveBeenCalled();
      expect(configureInstructions).not.toHaveBeenCalled();
      execute.mockClear();
      expect(
        (
          await runPlan(buildSurfacePlan({ host: 'antigravity', action: 'update' }), {
            sourceRoot: f.sourceRoot,
            home: f.home,
            execute,
          })
        )[0]
      ).toMatchObject({ ok: true, changed: false });
      expect(execute).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });

  it.each(['child-fails', 'child-unrecognized'])(
    'uses verified agy 1.1.27 parent help and validates the actual package: %s',
    async (childHelp) => {
      const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
      const f = nativeFixture();
      const execute = vi.fn(async (_command: string, args: string[]) => {
        if (args.join(' ') === 'plugin install --help') {
          if (childHelp === 'child-fails')
            throw Object.assign(new Error('install target must be a directory: --help'), {
              code: 1,
            });
          return { stdout: 'Unrecognized child usage' };
        }
        if (args.join(' ') === 'plugin --help') return { stdout: agy1127PluginHelp };
        if (args[1] === 'validate') return { stdout: 'private validation output' };
        fs.cpSync(f.plugin, f.cli, { recursive: true });
        return { stdout: 'private install output' };
      });
      try {
        const result = await runPlan(buildSurfacePlan({ host: 'antigravity', action: 'install' }), {
          sourceRoot: f.sourceRoot,
          home: f.home,
          execute,
        });
        expect(result[0]).toMatchObject({
          ok: true,
          changed: true,
          executionVerified: false,
          targetPath: f.cli,
        });
        expect(execute.mock.calls.map(([command, args]) => [command, args])).toEqual([
          ['agy', ['plugin', 'install', '--help']],
          ['agy', ['plugin', '--help']],
          ['agy', ['plugin', 'validate', f.plugin]],
          ['agy', ['plugin', 'install', f.plugin]],
        ]);
        expect(execute).toHaveBeenNthCalledWith(
          3,
          'agy',
          ['plugin', 'validate', f.plugin],
          expect.objectContaining({
            shell: false,
            timeout: 30000,
            env: expect.objectContaining({ AGY_CLI_DISABLE_AUTO_UPDATE: 'true' }),
          })
        );
        expect(JSON.stringify(result)).not.toContain('private validation output');
        expect(JSON.stringify(result)).not.toContain('private install output');
      } finally {
        f.dispose();
      }
    }
  );

  it.each([
    '',
    agy1127PluginHelp.replace(
      'Usage: agy plugin <command> [arguments]',
      'Usage: agy <command> [arguments]'
    ),
    agy1127PluginHelp.replace('Commands:', 'Examples:'),
    agy1127PluginHelp.replace('install <target>', 'install [flags]'),
    agy1127PluginHelp.replace('validate [path]', 'validate --remote'),
    agy1127PluginHelp.replace('validate [path]   Validate a plugin\n', ''),
  ])('blocks unknown parent help without validation or installation: %j', async (parentHelp) => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const f = nativeFixture();
    const execute = vi.fn(async (_command: string, args: string[]) => {
      if (args.join(' ') === 'plugin install --help')
        throw new Error('install target must be a directory: --help');
      return { stdout: parentHelp };
    });
    try {
      expect(
        (
          await runPlan(buildSurfacePlan({ host: 'antigravity', action: 'install' }), {
            sourceRoot: f.sourceRoot,
            home: f.home,
            execute,
          })
        )[0]
      ).toMatchObject({ ok: false, status: 'blocked' });
      expect(execute.mock.calls.map(([, args]) => args)).toEqual([
        ['plugin', 'install', '--help'],
        ['plugin', '--help'],
      ]);
      expect(fs.readdirSync(f.home)).toEqual([]);
    } finally {
      f.dispose();
    }
  });

  it.each(['validation-fails', 'source-changes', 'destination-appears'])(
    'does not install after unsafe native validation: %s',
    async (failure) => {
      const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
      const f = nativeFixture();
      const execute = vi.fn(async (_command: string, args: string[]) => {
        if (args.join(' ') === 'plugin install --help')
          throw new Error('install target must be a directory: --help');
        if (args.join(' ') === 'plugin --help') return { stdout: agy1127PluginHelp };
        if (args[1] === 'validate') {
          if (failure === 'validation-fails') throw new Error('private validation failure details');
          if (failure === 'source-changes')
            f.write('skills/eai/SKILL.md', 'changed during validation');
          if (failure === 'destination-appears') {
            fs.mkdirSync(f.cli, { recursive: true });
            fs.writeFileSync(path.join(f.cli, 'personal.txt'), 'preserve');
          }
        }
        return { stdout: 'validation returned' };
      });
      try {
        const result = await runPlan(buildSurfacePlan({ host: 'antigravity', action: 'install' }), {
          sourceRoot: f.sourceRoot,
          home: f.home,
          execute,
        });
        expect(result[0]).toMatchObject({ ok: false, status: 'blocked', executionVerified: false });
        expect(execute.mock.calls.map(([, args]) => args)).toEqual([
          ['plugin', 'install', '--help'],
          ['plugin', '--help'],
          ['plugin', 'validate', f.plugin],
        ]);
        expect(JSON.stringify(result)).not.toContain('private validation failure');
        if (failure === 'validation-fails')
          expect(result[0].reason).toContain('package validation failed');
        if (failure === 'destination-appears')
          expect(fs.readFileSync(path.join(f.cli, 'personal.txt'), 'utf8')).toBe('preserve');
        else expect(fs.readdirSync(f.home)).toEqual([]);
      } finally {
        f.dispose();
      }
    }
  );

  it.each(['', 'Usage: agy plugin install [flags]', 'Usage: agy plugin update <path>'])(
    'blocks unsupported native help without installation: %j',
    async (stdout) => {
      const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
      const f = nativeFixture();
      const execute = vi.fn(async () => ({ stdout }));
      try {
        expect(
          (
            await runPlan(buildSurfacePlan({ host: 'antigravity', action: 'install' }), {
              sourceRoot: f.sourceRoot,
              home: f.home,
              execute,
            })
          )[0]
        ).toMatchObject({ status: 'blocked', ok: false });
        expect(execute).toHaveBeenCalledTimes(2);
        expect(fs.readdirSync(f.home)).toEqual([]);
      } finally {
        f.dispose();
      }
    }
  );

  it('does not equate native command success with installed Gofer files', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const f = nativeFixture();
    const execute = vi.fn(async () => ({ stdout: 'Usage: agy plugin install <path>' }));
    try {
      expect(
        (
          await runPlan(buildSurfacePlan({ host: 'antigravity', action: 'install' }), {
            sourceRoot: f.sourceRoot,
            home: f.home,
            execute,
          })
        )[0]
      ).toMatchObject({ status: 'blocked', ok: false, executionVerified: false });
      expect(execute).toHaveBeenCalledTimes(2);
    } finally {
      f.dispose();
    }
  });

  it.each(['help-failure', 'install-failure', 'source-changed'])(
    'fails safely without leaking native output: %s',
    async (failure) => {
      const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
      const f = nativeFixture();
      const execute = vi.fn(async (_command: string, args: string[]) => {
        if (failure === 'help-failure' || args.at(-1) !== '--help')
          throw new Error('private credentials in native error');
        if (failure === 'source-changed') f.write('skills/eai/SKILL.md', 'unexpected change');
        return { stdout: 'Usage: agy plugin install <path>' };
      });
      try {
        const result = await runPlan(buildSurfacePlan({ host: 'antigravity', action: 'install' }), {
          sourceRoot: f.sourceRoot,
          home: f.home,
          execute,
        });
        expect(result[0]).toMatchObject({ ok: false, status: 'blocked', executionVerified: false });
        expect(JSON.stringify(result)).not.toContain('private credentials');
        expect(execute).toHaveBeenCalledTimes(failure === 'source-changed' ? 1 : 2);
        expect(fs.readdirSync(f.home)).toEqual([]);
      } finally {
        f.dispose();
      }
    }
  );

  it('blocks an existing changed CLI package rather than guessing replacement semantics', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const f = nativeFixture();
    const execute = vi.fn();
    try {
      fs.cpSync(f.plugin, f.cli, { recursive: true });
      f.write('skills/eai/SKILL.md', 'fixture-v2');
      expect(
        (
          await runPlan(buildSurfacePlan({ host: 'antigravity', action: 'update' }), {
            sourceRoot: f.sourceRoot,
            home: f.home,
            execute,
          })
        )[0]
      ).toMatchObject({
        status: 'blocked',
        ok: false,
        reason: expect.stringContaining('replacement semantics are unverified'),
      });
      expect(execute).not.toHaveBeenCalled();
      expect(fs.readFileSync(path.join(f.cli, 'skills/eai/SKILL.md'), 'utf8')).toBe('fixture-v1');
    } finally {
      f.dispose();
    }
  });
});
