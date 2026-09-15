import { describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const surfaceUpdateModuleUrl = new URL(
  '../../../.specify/scripts/node/gofer-surface-update.mjs',
  import.meta.url
);

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

  it('rejects unknown flags and positional arguments before planning or execution', async () => {
    const { parseArgs } = await import(surfaceUpdateModuleUrl.href);

    expect(() => parseArgs(['--executee'])).toThrow('Unsupported option.');
    expect(() => parseArgs(['unexpected'])).toThrow('Unsupported option.');
  });

  it('maps hidden legacy Gemini input to Antigravity without listing it as current', async () => {
    const { parseArgs, resolveHosts, SUPPORTED_HOSTS } = await import(surfaceUpdateModuleUrl.href);

    expect(parseArgs(['--host', 'gemini']).host).toBe('antigravity');
    expect(resolveHosts('gemini')).toEqual(['antigravity']);
    expect(resolveHosts('auto', 'gemini')).toEqual(['antigravity']);
    expect(SUPPORTED_HOSTS).not.toContain('gemini');
  });

  it('rejects unsupported programmatic hosts and actions with public guidance', async () => {
    const { buildSurfacePlan, inspectHost, resolveHosts, runPlan } = await import(
      surfaceUpdateModuleUrl.href
    );
    const execute = vi.fn();
    const inspect = vi.fn(async () => ({ available: true }));

    expect(() => resolveHosts('bogus')).toThrow(
      'Unsupported host: bogus. Use auto, all, claude, codex, copilot, antigravity, grok, vscode'
    );
    expect(() => buildSurfacePlan({ action: 'remove', host: 'claude' })).toThrow(
      'Unsupported action: remove. Use inspect, install, or update.'
    );
    await expect(inspectHost('bogus', execute)).rejects.toThrow(
      'Unsupported host: bogus. Use claude, codex, copilot, antigravity, grok, vscode'
    );
    await expect(
      runPlan(
        [{ host: 'bogus', action: 'update', commands: [{ command: 'unexpected', args: [] }] }],
        { inspect, execute }
      )
    ).rejects.toThrow(
      'Unsupported host: bogus. Use claude, codex, copilot, antigravity, grok, vscode'
    );
    await expect(
      runPlan(
        [{ host: 'claude', action: 'update', commands: [{ command: 'malware', args: [] }] }],
        { inspect, execute }
      )
    ).rejects.toThrow('must exactly match the packaged update action');
    await expect(
      runPlan(
        [{ host: 'grok', action: 'remove', commands: [{ command: 'unexpected', args: [] }] }],
        { inspect, execute }
      )
    ).rejects.toThrow('Unsupported executable action: remove. Use install or update.');
    await expect(
      runPlan(
        [
          { host: 'claude', action: 'update', commands: [{ command: 'claude', args: [] }] },
          { host: 'bogus', action: 'update', commands: [{ command: 'unexpected', args: [] }] },
        ],
        { inspect, execute }
      )
    ).rejects.toThrow(
      'Unsupported host: bogus. Use claude, codex, copilot, antigravity, grok, vscode'
    );
    expect(inspect).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps the legacy alias out of usage and emits only the Antigravity plan', () => {
    const scriptPath = fileURLToPath(surfaceUpdateModuleUrl);
    const usage = execFileSync(process.execPath, [scriptPath, '--help'], { encoding: 'utf8' });
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [scriptPath, '--action', 'update', '--host', 'gemini', '--json'],
        { encoding: 'utf8' }
      )
    );

    expect(usage).toContain('<claude|codex|copilot|antigravity|grok|vscode|all>');
    expect(usage.toLowerCase()).not.toContain('gemini');
    expect(result.plan).toEqual([
      expect.objectContaining({
        host: 'antigravity',
        commands: [
          expect.objectContaining({
            command: 'agy',
            args: ['plugin', 'install', 'https://github.com/eai-support/eai-gofer'],
          }),
        ],
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('gemini');
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
    const { buildSurfacePlan, resolveHosts } = await import(surfaceUpdateModuleUrl.href);
    const plan = buildSurfacePlan({ action: 'update', host: 'auto', currentHost: 'codex' });

    expect(plan).toHaveLength(1);
    expect(plan[0].host).toBe('codex');
    expect(plan[0].commands.map((step: { command: string }) => step.command)).toEqual([
      'codex',
      'codex',
    ]);
    expect(resolveHosts('auto', 'unknown')).toEqual([]);
    expect(() =>
      buildSurfacePlan({ action: 'update', host: 'auto', currentHost: 'unknown' })
    ).toThrow('Use --host with claude, codex, copilot, antigravity, grok, vscode, or all.');
  });

  it('plans all supported host updates only when explicitly requested', async () => {
    const { buildSurfacePlan, SUPPORTED_HOSTS } = await import(surfaceUpdateModuleUrl.href);
    const plan = buildSurfacePlan({ action: 'update', host: 'all' });

    expect(SUPPORTED_HOSTS).toEqual([
      'claude',
      'codex',
      'copilot',
      'antigravity',
      'grok',
      'vscode',
    ]);
    expect(plan.map((entry: { host: string }) => entry.host)).toEqual([
      'claude',
      'codex',
      'copilot',
      'antigravity',
      'grok',
      'vscode',
    ]);
    expect(
      Object.fromEntries(
        plan.map(
          (entry: { host: string; commands: Array<{ command: string; args: string[] }> }) => [
            entry.host,
            entry.commands.map((step) => [step.command, ...step.args]),
          ]
        )
      )
    ).toEqual({
      claude: [
        ['claude', 'plugin', 'marketplace', 'update', 'eai-gofer'],
        ['claude', 'plugin', 'update', 'eai-gofer@eai-gofer', '--scope', 'user'],
      ],
      codex: [
        ['codex', 'plugin', 'marketplace', 'upgrade', 'eai-gofer'],
        ['codex', 'plugin', 'add', 'eai-gofer@eai-gofer'],
      ],
      copilot: [
        ['copilot', 'plugin', 'marketplace', 'update', 'eai-gofer'],
        ['copilot', 'plugin', 'update', 'eai-gofer@eai-gofer'],
      ],
      antigravity: [['agy', 'plugin', 'install', 'https://github.com/eai-support/eai-gofer']],
      grok: [['grok', 'plugin', 'update', 'eai-gofer']],
      vscode: [['code', '--install-extension', 'EnterpriseAI.gofer', '--force']],
    });
  });

  it('uses the supported user instruction locations on macOS, Windows, and Linux', async () => {
    const { getAlwaysOnInstructionPath } = await import(surfaceUpdateModuleUrl.href);
    const home = '/Users/example';

    expect(getAlwaysOnInstructionPath('codex', { home })).toBe('/Users/example/.codex/AGENTS.md');
    expect(getAlwaysOnInstructionPath('claude', { home })).toBe('/Users/example/.claude/CLAUDE.md');
    expect(getAlwaysOnInstructionPath('copilot', { home })).toBe(
      '/Users/example/.copilot/copilot-instructions.md'
    );
    expect(getAlwaysOnInstructionPath('antigravity', { home })).toBe(
      '/Users/example/.gemini/GEMINI.md'
    );
    expect(() => getAlwaysOnInstructionPath('grok', { home })).toThrow('Unsupported host: grok');
    expect(getAlwaysOnInstructionPath('vscode', { home, platform: 'darwin' })).toBe(
      '/Users/example/.copilot/instructions/eai-gofer.instructions.md'
    );
    expect(
      getAlwaysOnInstructionPath('vscode', {
        home: 'C:\\Users\\example',
        platform: 'win32',
        env: { APPDATA: 'C:\\Users\\example\\AppData\\Roaming' },
      })
    ).toBe('C:\\Users\\example/.copilot/instructions/eai-gofer.instructions.md');
    expect(getAlwaysOnInstructionPath('vscode', { home, platform: 'linux', env: {} })).toBe(
      '/Users/example/.copilot/instructions/eai-gofer.instructions.md'
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

  it.each([
    {
      name: 'dirty',
      local: { clean: false, official: true, branch: 'main' },
      reason: 'uncommitted changes',
    },
    {
      name: 'non-official',
      local: { clean: true, official: false, branch: 'main' },
      reason: 'origin is not the official EAI Gofer repository',
    },
    {
      name: 'non-main',
      local: { clean: true, official: true, branch: 'feature/local-work' },
      reason: 'not main',
    },
  ])(
    'preserves a $name Codex local marketplace while still enabling always-on routing',
    async ({ local, reason }) => {
      const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
      const execute = vi.fn();
      const cleanup = vi.fn();
      const configureInstructions = vi.fn(async () => [
        { host: 'codex', targetPath: '/Users/example/.codex/AGENTS.md', ok: true },
      ]);

      const result = await runPlan(buildSurfacePlan({ action: 'update', host: 'codex' }), {
        inspect: async () => ({ available: true }),
        inspectMarketplace: async () => ({ type: 'local', root: '/Users/example/gofer' }),
        inspectLocalMarketplace: async () => local,
        execute,
        cleanup,
        configureInstructions,
      });

      expect(execute).not.toHaveBeenCalled();
      expect(cleanup).not.toHaveBeenCalled();
      expect(configureInstructions).toHaveBeenCalledWith(['codex']);
      expect(result).toContainEqual(
        expect.objectContaining({
          host: 'codex',
          label: 'Update local EAI Gofer marketplace',
          ok: false,
          error: expect.stringContaining(reason),
        })
      );
    }
  );

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

  it('uses the verified Antigravity and Grok plugin commands', async () => {
    const { buildSurfacePlan } = await import(surfaceUpdateModuleUrl.href);
    const repository = 'https://github.com/eai-support/eai-gofer';

    expect(buildSurfacePlan({ action: 'install', host: 'antigravity' })[0].commands).toEqual([
      expect.objectContaining({ command: 'agy', args: ['plugin', 'install', repository] }),
    ]);
    expect(buildSurfacePlan({ action: 'update', host: 'antigravity' })[0].commands).toEqual([
      expect.objectContaining({ command: 'agy', args: ['plugin', 'install', repository] }),
    ]);
    expect(buildSurfacePlan({ action: 'install', host: 'grok' })[0].commands).toEqual([
      expect.objectContaining({
        command: 'grok',
        args: ['plugin', 'install', '--trust', repository],
      }),
    ]);
    expect(buildSurfacePlan({ action: 'update', host: 'grok' })[0].commands).toEqual([
      expect.objectContaining({ command: 'grok', args: ['plugin', 'update', 'eai-gofer'] }),
    ]);
  });

  it('passes explicit trust to a Grok installer that otherwise refuses to continue', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const execute = vi.fn(async (command: string, args: string[]) => {
      if (command === 'grok' && !args.includes('--trust')) {
        throw new Error('Trust confirmation required');
      }
      return { stdout: 'installed\n', stderr: '' };
    });

    const result = await runPlan(buildSurfacePlan({ action: 'install', host: 'grok' }), {
      inspect: async () => ({ available: true }),
      execute,
      configureInstructions: async () => [
        { host: 'grok', ok: true, managedByPlugin: true },
      ],
      cleanup: async () => ({ removed: [], archiveRoot: undefined }),
    });

    expect(result.every((entry: { ok?: boolean }) => entry.ok !== false)).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      'grok',
      ['plugin', 'install', '--trust', 'https://github.com/eai-support/eai-gofer'],
      { windowsHide: true }
    );
  });

  it('inspects all six hosts through their current executables and list commands', async () => {
    const { inspectHost } = await import(surfaceUpdateModuleUrl.href);
    const cases = [
      ['claude', 'claude', ['plugin', 'list']],
      ['codex', 'codex', ['plugin', 'list', '--json']],
      ['copilot', 'copilot', ['plugin', 'list']],
      ['antigravity', 'agy', ['plugin', 'list']],
      ['grok', 'grok', ['plugin', 'list']],
      ['vscode', 'code', ['--list-extensions', '--show-versions']],
    ] as const;

    for (const [host, executable, listArgs] of cases) {
      const listing =
        host === 'codex'
          ? JSON.stringify([{ id: 'eai-gofer' }])
          : host === 'vscode'
            ? 'EnterpriseAI.gofer@3.12.4\n'
            : 'eai-gofer@eai-gofer\n';
      const execute = vi.fn(async (_command, args: string[]) => ({
        stdout: args.includes('--version') ? '1.0.0\n' : listing,
      }));
      await expect(inspectHost(host, execute)).resolves.toEqual(
        expect.objectContaining({ host, available: true, installed: true })
      );
      expect(execute).toHaveBeenNthCalledWith(1, executable, ['--version'], { windowsHide: true });
      expect(execute).toHaveBeenNthCalledWith(2, executable, [...listArgs], { windowsHide: true });
    }

    const legacyExecute = vi.fn(async () => ({ stdout: 'eai-gofer@eai-gofer\n' }));
    await expect(inspectHost('gemini', legacyExecute)).resolves.toEqual(
      expect.objectContaining({ host: 'antigravity', available: true, installed: true })
    );
    expect(legacyExecute).toHaveBeenNthCalledWith(1, 'agy', ['--version'], { windowsHide: true });
  });

  it('does not accept near-match plugin identifiers on any surface', async () => {
    const { pluginListingHasGofer } = await import(surfaceUpdateModuleUrl.href);

    for (const host of ['claude', 'copilot', 'antigravity', 'grok']) {
      expect(pluginListingHasGofer(host, 'evil-eai-gofer\neai-gofer-fake\n')).toBe(false);
    }
    expect(
      pluginListingHasGofer(
        'codex',
        JSON.stringify([{ id: 'evil-eai-gofer' }, { name: 'eai-gofer-fake' }])
      )
    ).toBe(false);
    expect(pluginListingHasGofer('codex', 'eai-gofer\n')).toBe(false);
    expect(
      pluginListingHasGofer('vscode', 'NotEnterpriseAI.gofer\nEnterpriseAI.gofer-fake\n')
    ).toBe(false);
  });

  it('archives stale Gofer entries only after a surface update succeeds', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const cleanup = vi.fn(async () => ({
      archiveRoot: '/tmp/eai-gofer-archive',
      removed: [{ path: '/tmp/old-gofer-command.md' }],
    }));
    const result = await runPlan(buildSurfacePlan({ action: 'update', host: 'claude' }), {
      inspect: async () => ({ available: true }),
      execute: async () => ({ stdout: 'updated' }),
      cleanup,
      configureInstructions: vi.fn(async () => []),
    });

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
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const cleanup = vi.fn();
    await runPlan(buildSurfacePlan({ action: 'update', host: 'claude' }), {
      inspect: async () => ({ available: true }),
      execute: async () => {
        throw new Error('update failed');
      },
      cleanup,
      configureInstructions: vi.fn(async () => []),
    });

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('marks an unavailable requested host as a failed execution', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const cleanup = vi.fn();
    const execute = vi.fn();

    const result = await runPlan(buildSurfacePlan({ action: 'update', host: 'grok' }), {
      inspect: async () => ({ available: false }),
      execute,
      cleanup,
      configureInstructions: vi.fn(async () => []),
    });

    expect(result).toEqual([
      expect.objectContaining({
        host: 'grok',
        skipped: true,
        ok: false,
        label: 'Inspect host availability',
      }),
    ]);
    expect(execute).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('exits unsuccessfully when an explicitly requested host executable is unavailable', () => {
    const scriptPath = fileURLToPath(surfaceUpdateModuleUrl);
    const child = spawnSync(
      process.execPath,
      [scriptPath, '--action', 'update', '--host', 'grok', '--execute', '--json'],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: '' },
      }
    );

    expect(child.status).toBe(1);
    expect(child.stderr).toBe('');
    expect(JSON.parse(child.stdout).results).toEqual([
      expect.objectContaining({ host: 'grok', skipped: true, ok: false }),
    ]);
  });

  it('does not clean up after mixed multi-host success and failure', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const cleanup = vi.fn();
    const execute = vi.fn(async (command: string) => {
      if (command === 'grok') throw new Error('Grok update failed');
      return { stdout: 'updated' };
    });

    const result = await runPlan(
      [
        ...buildSurfacePlan({ action: 'update', host: 'claude' }),
        ...buildSurfacePlan({ action: 'update', host: 'grok' }),
      ],
      {
        inspect: async () => ({ available: true }),
        execute,
        cleanup,
        configureInstructions: vi.fn(async () => []),
      }
    );

    expect(result).toContainEqual(
      expect.objectContaining({ host: 'grok', ok: false, error: 'Grok update failed' })
    );
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('does not clean up when always-on instruction setup fails', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const cleanup = vi.fn();

    await runPlan(buildSurfacePlan({ action: 'update', host: 'claude' }), {
      inspect: async () => ({ available: true }),
      execute: async () => ({ stdout: 'updated' }),
      cleanup,
      configureInstructions: async () => [
        { host: 'claude', targetPath: '/tmp/CLAUDE.md', ok: false, error: 'write failed' },
      ],
    });

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('reports a useful error when execution throws a non-standard value', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const result = await runPlan(buildSurfacePlan({ action: 'update', host: 'claude' }), {
      inspect: async () => ({ available: true }),
      execute: async () => {
        throw 'unexpected failure';
      },
      cleanup: vi.fn(),
      configureInstructions: vi.fn(async () => []),
    });

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
    const pluginRoot = path.join(home, 'plugin');
    const codexPath = path.join(home, '.codex', 'AGENTS.md');
    const copilotPath = path.join(home, '.copilot', 'copilot-instructions.md');
    const antigravityPath = path.join(home, '.gemini', 'GEMINI.md');
    const vscodePath = path.join(home, '.copilot', 'instructions', 'eai-gofer.instructions.md');
    const vscodeSettingsPath = path.join(home, '.config', 'Code', 'User', 'settings.json');
    const grokSkillPath = path.join(pluginRoot, 'skills', 'eai', 'SKILL.md');
    fs.mkdirSync(path.dirname(codexPath), { recursive: true });
    fs.mkdirSync(path.dirname(vscodePath), { recursive: true });
    fs.mkdirSync(path.dirname(vscodeSettingsPath), { recursive: true });
    fs.mkdirSync(path.dirname(grokSkillPath), { recursive: true });
    fs.writeFileSync(codexPath, '# Personal rules\n\nKeep this instruction.\n');
    fs.writeFileSync(
      grokSkillPath,
      '## Always-On EAI Contract\n<!-- gofer:always-on-eai:start -->\nApply this contract to every request.\n<!-- gofer:always-on-eai:end -->\n'
    );
    fs.writeFileSync(vscodePath, '# Existing VS Code instructions\n\nKeep this instruction.\n');
    fs.writeFileSync(
      vscodeSettingsPath,
      `{
  // Preserve this user setting and comment.
  "editor.fontSize": 15,
  "github.copilot.chat.codeGeneration.instructions": [
    { "text": "Unrelated legacy instruction" },
    { "text": "${'<!-- gofer:always-on-eai:start -->'} old Gofer ${'<!-- gofer:always-on-eai:end -->'}" }
  ]
}
`
    );

    try {
      const results = await configureAlwaysOnInstructions(
        ['codex', 'copilot', 'antigravity', 'grok', 'vscode'],
        {
          home,
          platform: 'linux',
          env: {},
          pluginRoot,
        }
      );

      expect(results.every((entry: { ok: boolean }) => entry.ok)).toBe(true);
      expect(results.find((entry: { host: string }) => entry.host === 'grok')).toEqual(
        expect.objectContaining({ targetPath: '<local-path>/SKILL.md', managedByPlugin: true })
      );
      const codex = fs.readFileSync(codexPath, 'utf8');
      expect(codex).toContain('Keep this instruction.');
      expect(codex).toContain('gofer:always-on-eai:start');
      expect(fs.readFileSync(copilotPath, 'utf8')).toContain('gofer:always-on-eai:start');
      expect(fs.readFileSync(antigravityPath, 'utf8')).toContain('gofer:always-on-eai:start');

      const vscode = fs.readFileSync(vscodePath, 'utf8');
      expect(vscode).toContain('Keep this instruction.');
      expect(vscode).toContain("applyTo: '**'");
      expect(vscode).toContain('gofer:always-on-eai:start');
      const migratedSettings = fs.readFileSync(vscodeSettingsPath, 'utf8');
      expect(migratedSettings).toContain('// Preserve this user setting and comment.');
      expect(migratedSettings).toContain('"editor.fontSize": 15');
      expect(migratedSettings).toContain('Unrelated legacy instruction');
      expect(migratedSettings).not.toContain('old Gofer');

    fs.writeFileSync(
      vscodePath,
      `---
name: Existing EAI rules
applyTo: '**/*.ts'
---

Keep this instruction.

## Always-On EAI Contract
<!-- gofer:always-on-eai:start --> old <!-- gofer:always-on-eai:end -->
`
      );
      const refreshed = await configureAlwaysOnInstructions(['vscode'], {
        home,
        platform: 'linux',
        env: {},
      });
      expect(refreshed[0].ok).toBe(true);
      const refreshedVscode = fs.readFileSync(vscodePath, 'utf8');
      expect(refreshedVscode).toContain('Keep this instruction.');
      expect(refreshedVscode).toContain("applyTo: '**'");
      expect(refreshedVscode).toContain('Always-On EAI Contract');
      expect(refreshedVscode).not.toContain('<!-- gofer:always-on-eai:start --> old');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('writes through a verified file handle, preserves mode, and leaves no secret-bearing backup', async () => {
    const { configureAlwaysOnInstructions } = await import(surfaceUpdateModuleUrl.href);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-atomic-instructions-'));
    const targetPath = path.join(home, '.codex', 'AGENTS.md');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, '# Existing private instructions\n');
    fs.chmodSync(targetPath, 0o640);

    try {
      const result = await configureAlwaysOnInstructions(['codex'], { home });
      expect(result).toEqual([
        expect.objectContaining({
          host: 'codex',
          ok: true,
          targetPath: '<local-path>/AGENTS.md',
        }),
      ]);

      const siblings = fs.readdirSync(path.dirname(targetPath));
      const backups = siblings.filter((name) => name.startsWith('AGENTS.md.gofer-backup-'));
      expect(backups).toHaveLength(0);
      expect(siblings.some((name) => name.includes('.gofer-') && name.endsWith('.tmp'))).toBe(
        false
      );
      expect(fs.statSync(targetPath).mode & 0o777).toBe(0o640);
      expect(fs.readFileSync(targetPath, 'utf8')).toContain('gofer:always-on-eai:start');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('rejects both direct and parent-directory symlinks without changing their targets', async () => {
    const { configureAlwaysOnInstructions } = await import(surfaceUpdateModuleUrl.href);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-symlink-instructions-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-symlink-outside-'));
    const directTarget = path.join(home, '.claude', 'CLAUDE.md');
    const directDestination = path.join(outside, 'direct');
    const directSentinel = path.join(directDestination, 'sentinel.md');
    const parentDestination = path.join(outside, 'codex');
    fs.mkdirSync(path.dirname(directTarget), { recursive: true });
    fs.mkdirSync(directDestination, { recursive: true });
    fs.mkdirSync(parentDestination, { recursive: true });
    fs.writeFileSync(directSentinel, 'do not replace direct\n');
    fs.writeFileSync(path.join(parentDestination, 'AGENTS.md'), 'do not replace parent\n');
    const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(directDestination, directTarget, directoryLinkType);
    fs.symlinkSync(parentDestination, path.join(home, '.codex'), directoryLinkType);

    try {
      const result = await configureAlwaysOnInstructions(['claude', 'codex'], { home });
      expect(result).toHaveLength(2);
      for (const entry of result) {
        expect(entry).toEqual(
          expect.objectContaining({ ok: false, error: expect.stringContaining('symbolic link') })
        );
        expect(JSON.stringify(entry)).not.toContain(home);
        expect(JSON.stringify(entry)).not.toContain(outside);
      }
      expect(fs.readFileSync(directSentinel, 'utf8')).toBe('do not replace direct\n');
      expect(fs.readFileSync(path.join(parentDestination, 'AGENTS.md'), 'utf8')).toBe(
        'do not replace parent\n'
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('does not write through a parent directory swapped after validation', async () => {
    const { configureAlwaysOnInstructions } = await import(surfaceUpdateModuleUrl.href);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-parent-swap-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-parent-swap-outside-'));
    const parent = path.join(home, '.codex');
    const savedParent = path.join(home, '.codex-original');
    const targetPath = path.join(parent, 'AGENTS.md');
    const outsideTarget = path.join(outside, 'AGENTS.md');
    fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(targetPath, '# Original instructions\n');
    fs.writeFileSync(outsideTarget, '# Outside instructions\n');
    let openCount = 0;
    const fileSystem = new Proxy(fs.promises, {
      get(target, property, receiver) {
        if (property !== 'open') return Reflect.get(target, property, receiver);
        return async (...args: Parameters<typeof fs.promises.open>) => {
          openCount += 1;
          if (openCount === 3) {
            await fs.promises.rename(parent, savedParent);
            await fs.promises.symlink(
              outside,
              parent,
              process.platform === 'win32' ? 'junction' : 'dir'
            );
          }
          return fs.promises.open(...args);
        };
      },
    });

    try {
      const result = await configureAlwaysOnInstructions(['codex'], { home, fileSystem });
      expect(result).toEqual([
        expect.objectContaining({
          ok: false,
          error: expect.stringContaining('changed during the update'),
        }),
      ]);
      expect(fs.readFileSync(outsideTarget, 'utf8')).toBe('# Outside instructions\n');
      expect(fs.readFileSync(path.join(savedParent, 'AGENTS.md'), 'utf8')).toBe(
        '# Original instructions\n'
      );
    } finally {
      try {
        fs.unlinkSync(parent);
      } catch {
        // The swap may not have occurred if the injected open was not reached.
      }
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('does not leave a target or temporary file after a missing-target parent swap', async () => {
    const { configureAlwaysOnInstructions } = await import(surfaceUpdateModuleUrl.href);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-missing-parent-swap-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-missing-parent-outside-'));
    const parent = path.join(home, '.codex');
    const savedParent = path.join(home, '.codex-original');
    fs.mkdirSync(parent, { recursive: true });
    let openCount = 0;
    const fileSystem = new Proxy(fs.promises, {
      get(target, property, receiver) {
        if (property !== 'open') return Reflect.get(target, property, receiver);
        return async (...args: Parameters<typeof fs.promises.open>) => {
          openCount += 1;
          if (openCount === 2) {
            await fs.promises.rename(parent, savedParent);
            await fs.promises.symlink(
              outside,
              parent,
              process.platform === 'win32' ? 'junction' : 'dir'
            );
          }
          return fs.promises.open(...args);
        };
      },
    });

    try {
      const result = await configureAlwaysOnInstructions(['codex'], { home, fileSystem });
      expect(result).toEqual([
        expect.objectContaining({ ok: false, error: expect.stringContaining('changed during the update') }),
      ]);
      expect(fs.existsSync(path.join(outside, 'AGENTS.md'))).toBe(false);
      expect(fs.readdirSync(outside)).toEqual([]);
      expect(fs.existsSync(path.join(savedParent, 'AGENTS.md'))).toBe(false);
    } finally {
      try {
        fs.unlinkSync(parent);
      } catch {
        // The swap may not have occurred if the injected open was not reached.
      }
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('keeps the original instruction intact when the atomic rename fails', async () => {
    const { configureAlwaysOnInstructions } = await import(surfaceUpdateModuleUrl.href);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-rename-failure-'));
    const targetPath = path.join(home, '.codex', 'AGENTS.md');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, '# Original instructions\n');
    const fileSystem = new Proxy(fs.promises, {
      get(target, property, receiver) {
        if (property !== 'rename') return Reflect.get(target, property, receiver);
        return async () => {
          const error = new Error('injected rename failure') as NodeJS.ErrnoException;
          error.code = 'EIO';
          throw error;
        };
      },
    });

    try {
      const result = await configureAlwaysOnInstructions(['codex'], { home, fileSystem });
      expect(result).toEqual([expect.objectContaining({ ok: false })]);
      expect(fs.readFileSync(targetPath, 'utf8')).toBe('# Original instructions\n');
      expect(fs.readdirSync(path.dirname(targetPath)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('rejects a non-file instruction target', async () => {
    const { configureAlwaysOnInstructions } = await import(surfaceUpdateModuleUrl.href);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-directory-instructions-'));
    const targetPath = path.join(home, '.copilot', 'copilot-instructions.md');
    fs.mkdirSync(targetPath, { recursive: true });

    try {
      const result = await configureAlwaysOnInstructions(['copilot'], { home });
      expect(result).toEqual([
        expect.objectContaining({
          ok: false,
          targetPath: '<local-path>/copilot-instructions.md',
          error: expect.stringContaining('not a regular file'),
        }),
      ]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('bounds and redacts secrets, credentials, ANSI controls, and local paths in reports', async () => {
    const { formatSurfaceUpdateReport, sanitizeDiagnostic, sanitizeSurfaceUpdateOutput } =
      await import(surfaceUpdateModuleUrl.href);
    const home = '/Users/private-user';
    const diagnostic = sanitizeDiagnostic(
      `\u001b[31mBearer top-secret password=hunter2 https://me:pass@example.test ${home}/repo/file ${'x'.repeat(5000)}`,
      { home }
    );

    expect(diagnostic).not.toContain('top-secret');
    expect(diagnostic).not.toContain('hunter2');
    expect(diagnostic).not.toContain('private-user');
    expect(diagnostic).not.toContain('me:pass');
    expect(diagnostic).not.toContain('\u001b');
    expect(diagnostic).toContain('<redacted>');
    expect(diagnostic).toContain('<home>');
    expect(diagnostic).toContain('…<truncated>');

    const publicResult = sanitizeSurfaceUpdateOutput(
      { token: 'secret-value', targetPath: '/opt/private/config.json' },
      { home }
    );
    expect(publicResult).toEqual({
      token: '<redacted>',
      targetPath: '<local-path>/config.json',
    });

    const report = formatSurfaceUpdateReport({
      action: 'update',
      execute: true,
      plan: [],
      results: [
        {
          host: 'codex',
          label: 'Update Gofer',
          ok: false,
          error: `token=raw-secret ${home}/repo`,
        },
      ],
    });
    expect(report).not.toContain('raw-secret');
    expect(report).not.toContain('private-user');
  });

  it.each([
    ['missing', null],
    ['malformed', 'The marker contract is absent.'],
  ])('reports a %s bundled Grok skill as a plugin verification failure', async (_case, content) => {
    const { configureAlwaysOnInstructions } = await import(surfaceUpdateModuleUrl.href);
    const readFile =
      content === null
        ? vi.fn(async () => {
            throw new Error('ENOENT');
          })
        : vi.fn(async () => content);
    const result = await configureAlwaysOnInstructions(['grok'], {
      pluginRoot: '/tmp/eai-gofer-plugin',
      fileSystem: {
        readFile,
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        host: 'grok',
        ok: false,
        managedByPlugin: true,
      }),
    ]);
    expect(result[0].error).toMatch(/ENOENT|does not contain the always-on contract/);
  });
});
