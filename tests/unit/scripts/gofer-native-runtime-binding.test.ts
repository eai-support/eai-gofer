import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { chmod, link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createCapabilityReceipt } from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import {
  createVerifiedNativeRuntime,
  openVerifiedNativeBenchmarkCapture,
} from '../../../.specify/scripts/node/gofer-native-runtime.mjs';
import { localIsolationReport } from './local-isolation-fixture.js';

const runGraph = vi.hoisted(() => vi.fn());
const trustedKey = vi.hoisted(() => ({ value: null as KeyObject | null }));
vi.mock('../../../.specify/scripts/node/gofer-verified-execution.mjs', () => ({
  runVerifiedGraph: runGraph,
}));
vi.mock('../../../.specify/scripts/node/gofer-trusted-evaluator.mjs', () => ({
  resolveTrustedEvaluatorPublicKey: async () => trustedKey.value,
}));

describe('native runtime workspace binding', () => {
  it('opens only an existing private source-side ledger and fails closed without native run evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-capture-'));
    try {
      const featureDir = path.join(root, '.specify', 'specs', 'task');
      await mkdir(featureDir, { recursive: true });
      const ledgerPath = path.join(featureDir, 'runtime-ledger.jsonl');
      await expect(
        openVerifiedNativeBenchmarkCapture({ workspaceRoot: root, featureDir, ledgerPath })
      ).rejects.toThrow();
      await writeFile(ledgerPath, '', { mode: 0o600 });
      const capture = await openVerifiedNativeBenchmarkCapture({
        workspaceRoot: root,
        featureDir,
        ledgerPath,
      });
      expect(await capture.authorizeCapture({})).toEqual({ allowed: false });
      await expect(capture.capture({})).rejects.toThrow('HELDOUT_SNAPSHOT_REQUIRED');
      await expect(
        openVerifiedNativeBenchmarkCapture({
          workspaceRoot: root,
          featureDir,
          ledgerPath: path.join(root, 'outside.jsonl'),
        })
      ).rejects.toThrow('NATIVE_BENCHMARK_CAPTURE_CONTROL_PLANE_REQUIRED');
      const linkPath = path.join(featureDir, 'linked-ledger.jsonl');
      await symlink(ledgerPath, linkPath);
      await expect(
        openVerifiedNativeBenchmarkCapture({
          workspaceRoot: root,
          featureDir,
          ledgerPath: linkPath,
        })
      ).rejects.toThrow('NATIVE_BENCHMARK_CAPTURE_LEDGER_REQUIRED');
      const hardlinkPath = path.join(featureDir, 'hardlinked-ledger.jsonl');
      await link(ledgerPath, hardlinkPath);
      await expect(
        openVerifiedNativeBenchmarkCapture({
          workspaceRoot: root,
          featureDir,
          ledgerPath: hardlinkPath,
        })
      ).rejects.toThrow('NATIVE_BENCHMARK_CAPTURE_LEDGER_REQUIRED');
      await chmod(ledgerPath, 0o644);
      await expect(
        openVerifiedNativeBenchmarkCapture({ workspaceRoot: root, featureDir, ledgerPath })
      ).rejects.toThrow('NATIVE_BENCHMARK_CAPTURE_LEDGER_REQUIRED');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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
        localIsolation: async ({ workspaceRoot }: { workspaceRoot: string }) =>
          localIsolationReport(workspaceRoot),
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
        async ({ adapter, workspaceRoot, featureDir: controlRoot, verifyBenchmark }) => {
          expect(workspaceRoot).toBe(runtime?.isolation.isolatedWorkspace);
          expect(controlRoot).toBe(await realpath(featureDir));
          expect(path.relative(workspaceRoot, controlRoot)).toMatch(/^\.\./);
          await expect(
            verifyBenchmark({
              host: 'codex',
              receiptHash: 'a'.repeat(64),
              evidence: { callerResult: true },
            })
          ).rejects.toThrow('TRUSTED_BENCHMARK_REQUIRED');
          await adapter.check({});
          await adapter.verified({});
          return { status: 'verified', adapterCallsSettled: true };
        }
      );
      await runtime.run({ featureDir, verifyBenchmark: async () => ({ valid: true }) });
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
