import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createCapabilityReceipt } from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import { createVerifiedNativeRuntime } from '../../../.specify/scripts/node/gofer-native-runtime.mjs';

const runGraph = vi.hoisted(() => vi.fn());
const trustedKey = vi.hoisted(() => ({ value: null as KeyObject | null }));
vi.mock('../../../.specify/scripts/node/gofer-verified-execution.mjs', () => ({
  runVerifiedGraph: runGraph,
}));
vi.mock('../../../.specify/scripts/node/gofer-trusted-evaluator.mjs', () => ({
  resolveTrustedEvaluatorPublicKey: async () => trustedKey.value,
}));

describe('native runtime workspace binding', () => {
  it('runs validation and commit against the isolated worktree while keeping control evidence outside it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-binding-'));
    let runtime: Awaited<ReturnType<typeof createVerifiedNativeRuntime>> | undefined;
    try {
      execFileSync('git', ['init', root]);
      execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
      execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
      await writeFile(path.join(root, 'tracked.txt'), 'base');
      execFileSync('git', ['-C', root, 'add', '.']);
      execFileSync('git', ['-C', root, 'commit', '-m', 'base']);
      const featureDir = path.join(root, '.specify', 'specs', 'task');
      await mkdir(featureDir, { recursive: true });
      await writeFile(path.join(featureDir, 'spec.md'), 'private controller direction');
      const keys = generateKeyPairSync('ed25519');
      trustedKey.value = keys.publicKey;
      const receipt = createCapabilityReceipt({
        host: 'codex',
        evaluatorVersion: '2',
        evaluationId: 'binding',
        evaluatedAt: '2026-09-17T00:00:00.000Z',
        expiresAt: '2026-09-18T00:00:00.000Z',
        hostVersion: 'codex',
        models: [{ id: 'live', reasoningEfforts: ['high'] }],
        reasoningCapabilities: ['high'],
        toolCapabilities: ['shell'],
        grantedPermissions: ['workspace-write'],
        isolationClass: 'git-worktree+local-os-sandbox',
        provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
        signingKey: keys.privateKey,
      });
      const observed: string[] = [];
      runtime = await createVerifiedNativeRuntime({
        workspaceRoot: root,
        localIsolation: async ({ workspaceRoot }: { workspaceRoot: string }) => ({
          contractVersion: 'eai.local-isolation/v1',
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
              hostArguments: ['--sandbox', 'workspace-write'],
              missing: [],
            },
          ],
        }),
        capabilityReceipt: receipt,
        ledger: {
          authorize: async () => ({ allowed: false }),
          authorizeCommit: async () => ({ allowed: false }),
          authorizeNative: async () => ({ allowed: false }),
        },
        promptForRequest: async () => 'Approved task.',
        adapter: {
          bindWorkspace: ({ workspaceRoot }: { workspaceRoot: string }) => ({
            workspaceRoot,
            reserve: async () => ({}),
            lease: async () => ({}),
            inputRevision: async () => 'input',
            check: async () => {
              observed.push(`check:${workspaceRoot}`);
              return {};
            },
            verified: async () => {
              observed.push(`commit:${workspaceRoot}`);
              return {};
            },
          }),
        },
      });
      await expect(
        realpath(path.join(runtime.isolation.isolatedWorkspace, '.specify', 'specs', 'task'))
      ).rejects.toThrow();
      runGraph.mockImplementationOnce(
        async ({ adapter, workspaceRoot, featureDir: controlRoot }) => {
          expect(workspaceRoot).toBe(runtime?.isolation.isolatedWorkspace);
          expect(controlRoot).toBe(await realpath(featureDir));
          expect(path.relative(workspaceRoot, controlRoot)).toMatch(/^\.\./);
          await adapter.check({});
          await adapter.verified({});
          return { status: 'verified', adapterCallsSettled: true };
        }
      );
      await runtime.run({ featureDir });
      expect(observed).toEqual([
        `check:${runtime.isolation.isolatedWorkspace}`,
        `commit:${runtime.isolation.isolatedWorkspace}`,
      ]);
      await runtime.dispose();
      runtime = undefined;
    } finally {
      if (runtime) await runtime.dispose().catch(() => {});
      await rm(root, { recursive: true, force: true });
    }
  });
});
