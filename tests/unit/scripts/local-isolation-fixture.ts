import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  codexIsolatedPermissionArgs,
  LOCAL_ISOLATION_CONTRACT,
} from '../../../.specify/scripts/node/gofer-local-isolation.mjs';

export function createIsolationRepository(): {
  source: string;
  worktree: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(path.join(tmpdir(), 'gofer-report-fixture-'));
  const source = path.join(root, 'source');
  const worktree = path.join(root, 'worktree');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
  );
  execFileSync('git', ['init', source], { env });
  execFileSync(
    'git',
    [
      '-C',
      source,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'base',
    ],
    { env }
  );
  execFileSync('git', ['-C', source, 'worktree', 'add', '--detach', worktree], { env });
  return { source, worktree, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function localIsolationReport(workspaceRoot: string) {
  const policy = codexIsolatedPermissionArgs(workspaceRoot);
  if (!policy) throw new Error('A dedicated Git worktree is required for this fixture.');
  return {
    contractVersion: LOCAL_ISOLATION_CONTRACT,
    projectDirectory: workspaceRoot,
    nativeExecutable: '/usr/bin/codex',
    cloudExecution: 'prohibited',
    gitRepository: true,
    assessments: [
      {
        surfaceId: 'codex-cli',
        status: 'ready',
        localOnly: true,
        requiresGitWorktree: true,
        requiresOsSandbox: true,
        hostArguments: [
          '--ask-for-approval',
          'never',
          'exec',
          '--ignore-user-config',
          ...policy.config.flatMap((value: string) => ['-c', value]),
        ],
        missing: [],
      },
    ],
  };
}
