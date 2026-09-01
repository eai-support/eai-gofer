import { describe, expect, it, vi } from 'vitest';

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
      'gemini',
      'vscode',
    ]);
  });

  it('leaves a Codex local marketplace unchanged instead of running Git-only commands', async () => {
    const { buildSurfacePlan, runPlan } = await import(surfaceUpdateModuleUrl.href);
    const cleanup = vi.fn();
    const execute = vi.fn();

    const result = await runPlan(buildSurfacePlan({ action: 'update', host: 'codex' }), {
      inspect: async () => ({ available: true }),
      inspectMarketplace: async () => ({ type: 'local', root: '/Users/example/gofer' }),
      execute,
      cleanup,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    expect(result).toContainEqual(
      expect.objectContaining({
        host: 'codex',
        ok: true,
        label: 'Inspect local EAI Gofer marketplace',
        note: expect.stringContaining('local work and settings are preserved'),
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
    const plan = buildSurfacePlan({ action: 'install', host: 'gemini' });
    const step = plan[0].commands[0];

    expect(step.command).toBe('gemini');
    expect(step.args).toContain('https://github.com/eai-support/eai-gofer');
    expect(step.args).toContain('--auto-update');
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
});
