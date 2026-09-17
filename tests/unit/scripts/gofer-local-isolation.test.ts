import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_ISOLATION_CONTRACT,
  inspectEaiLocalIsolation,
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
