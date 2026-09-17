import { describe, expect, it } from 'vitest';
import {
  LOCAL_ISOLATION_CONTRACT,
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

  it('rejects cloud, bypassable, or mismatched reports', () => {
    expect(
      verifyLocalIsolationReport(
        { ...readyReport, cloudExecution: 'allowed' },
        { host: 'codex', workspaceRoot }
      )
    ).toBe(false);
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
});
