import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_ISOLATION_CONTRACT,
  inspectEaiLocalIsolation,
  probeMacCodexSandboxBoundary,
  verifyLocalIsolationReport,
} from '../../../.specify/scripts/node/gofer-local-isolation.mjs';

const workspaceRoot = '/work/feature';
const readyReport = {
  contractVersion: LOCAL_ISOLATION_CONTRACT,
  projectDirectory: workspaceRoot,
  cloudExecution: 'prohibited',
  gitRepository: true,
  assessments: [
    {
      surfaceId: 'codex-cli',
      status: 'ready',
      localOnly: true,
      requiresGitWorktree: true,
      requiresOsSandbox: true,
      hostArguments: ['--sandbox', 'workspace-write'],
      missing: [],
    },
  ],
};

describe('EAI local isolation contract', () => {
  it.skipIf(process.platform !== 'darwin')(
    'rejects a sandbox that can write shared Git metadata outside the task worktree',
    () => {
      const root = mkdtempSync(path.join(tmpdir(), 'gofer-git-boundary-'));
      const repository = path.join(root, 'repository');
      const worker = path.join(root, 'worker');
      const gitEnvironment = Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
      );
      try {
        execFileSync('git', ['init', repository], { env: gitEnvironment });
        execFileSync(
          'git',
          [
            '-C',
            repository,
            '-c',
            'user.name=Test',
            '-c',
            'user.email=test@example.com',
            'commit',
            '--allow-empty',
            '-m',
            'base',
          ],
          { env: gitEnvironment }
        );
        execFileSync('git', ['-C', repository, 'worktree', 'add', '--detach', worker], {
          env: gitEnvironment,
        });
        const common = realpathSync(path.join(repository, '.git'));
        const sandbox = (sharedGitWritable: boolean) => (_command: string, args: string[]) => {
          const target = args.at(-1)!;
          if (
            target.startsWith(worker + path.sep) ||
            (sharedGitWritable && target.startsWith(common + path.sep))
          ) {
            writeFileSync(target, 'probe');
            return { status: 0, stdout: '', stderr: '' };
          }
          return { status: 1, stdout: '', stderr: 'Operation not permitted' };
        };
        expect(
          probeMacCodexSandboxBoundary({
            workspaceRoot: worker,
            executable: '/usr/bin/codex',
            runSandbox: sandbox(true),
          })
        ).toBeNull();
        expect(
          probeMacCodexSandboxBoundary({
            workspaceRoot: worker,
            executable: '/usr/bin/codex',
            runSandbox: sandbox(false),
          })
        ).toBe('/usr/bin/codex');
        expect(readdirSync(common).some((name) => name.startsWith('.gofer-isolation-probe-'))).toBe(
          false
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );
  it('accepts a ready local report for the selected workspace and host', () => {
    expect(verifyLocalIsolationReport(readyReport, { host: 'codex', workspaceRoot })).toBe(true);
  });

  it('rejects duplicate selected assessments and hosts without qualified arguments', () => {
    expect(
      verifyLocalIsolationReport(
        {
          ...readyReport,
          assessments: [
            readyReport.assessments[0],
            { ...readyReport.assessments[0], status: 'missing-prerequisite' },
          ],
        },
        { host: 'codex', workspaceRoot }
      )
    ).toBe(false);
    for (const host of ['antigravity', 'claude', 'copilot', 'grok']) {
      expect(verifyLocalIsolationReport(readyReport, { host, workspaceRoot })).toBe(false);
    }
  });

  it('rejects cloud, bypassable, or mismatched reports', () => {
    expect(
      verifyLocalIsolationReport(
        { ...readyReport, cloudExecution: 'allowed' },
        { host: 'codex', workspaceRoot }
      )
    ).toBe(false);
    for (const hostArguments of [
      ['--no-sandbox'],
      ['--sandbox', 'danger-full-access'],
      ['--sandbox', 'workspace-write', '--sandbox', 'danger-full-access'],
    ]) {
      expect(
        verifyLocalIsolationReport(
          { ...readyReport, assessments: [{ ...readyReport.assessments[0], hostArguments }] },
          { host: 'codex', workspaceRoot }
        )
      ).toBe(false);
    }
    expect(
      verifyLocalIsolationReport(
        { ...readyReport, projectDirectory: '/work/other' },
        { host: 'codex', workspaceRoot }
      )
    ).toBe(false);
    expect(
      verifyLocalIsolationReport(
        {
          ...readyReport,
          assessments: [
            { ...readyReport.assessments[0], missing: ['full-access bypass must be disabled'] },
          ],
        },
        { host: 'codex', workspaceRoot }
      )
    ).toBe(false);
  });

  it('reads the selected worktree from the local CLI and rejects failed readiness', async () => {
    const run = vi.fn(async () => ({ stdout: JSON.stringify(readyReport), stderr: '' }));
    await expect(
      inspectEaiLocalIsolation({
        host: 'codex',
        workspaceRoot,
        run,
        verifyNativeSandbox: () => '/usr/bin/codex',
      })
    ).resolves.toMatchObject({ ...readyReport, nativeExecutable: '/usr/bin/codex' });
    expect(run).toHaveBeenCalledWith(
      'eai',
      ['start', workspaceRoot, '--isolation-check', '--surface', 'codex-cli', '--format', 'json'],
      expect.objectContaining({ timeout: 15000 })
    );
    await expect(
      inspectEaiLocalIsolation({
        host: 'codex',
        workspaceRoot,
        run,
        verifyNativeSandbox: () => null,
      })
    ).rejects.toThrow('LOCAL_SANDBOX_REQUIRED');
    await expect(
      inspectEaiLocalIsolation({
        host: 'codex',
        workspaceRoot,
        run: async () => {
          throw new Error('exit 1');
        },
      })
    ).rejects.toThrow('LOCAL_SANDBOX_REQUIRED');
    await expect(
      inspectEaiLocalIsolation({
        host: 'codex',
        workspaceRoot,
        run: async () => ({
          stdout: JSON.stringify({ ...readyReport, projectDirectory: '/other' }),
        }),
      })
    ).rejects.toThrow('LOCAL_SANDBOX_REQUIRED');
  });
});
