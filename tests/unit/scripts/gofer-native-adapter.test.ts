import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { createCapabilityReceipt } from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import {
  createVerifiedWorktree,
  invokeLedgerBoundNative,
  startLocalCodexInvocation,
} from '../../../.specify/scripts/node/gofer-native-adapter.mjs';

function localIsolation(workspaceRoot: string) {
  return {
    contractVersion: 'eai.local-isolation/v1',
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
}

describe('native adapter primitives', () => {
  it('starts Codex locally with its sandbox and returns only scoped worktree changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-adapter-'));
    try {
      execFileSync('git', ['init', root]);
      execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
      execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
      await writeFile(path.join(root, 'tracked.txt'), 'base');
      execFileSync('git', ['-C', root, 'add', '.']);
      execFileSync('git', ['-C', root, 'commit', '-m', 'base']);
      const spawnProcess = vi.fn(() => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          kill: vi.fn(() => true),
        });
        setTimeout(async () => {
          await writeFile(path.join(root, 'tracked.txt'), 'changed');
          child.emit('close', 0, null);
        }, 0);
        return child;
      });
      const invocation = await startLocalCodexInvocation({
        isolatedWorkspace: root,
        prompt: 'Update only tracked.txt',
        modelId: 'live-model',
        capabilityReceiptHash: 'receipt-hash',
        allowedWriteScope: ['tracked.txt'],
        spawnProcess,
      });
      await expect(invocation.wait()).resolves.toMatchObject({
        invocationId: expect.stringMatching(/^codex-/),
        capabilityReceiptHash: 'receipt-hash',
        changedFiles: ['tracked.txt'],
        isolation: 'git-worktree+local-os-sandbox',
      });
      expect(spawnProcess).toHaveBeenCalledOnce();
      expect(spawnProcess.mock.calls[0][0]).toBe('codex');
      expect(spawnProcess.mock.calls[0][1]).toEqual(
        expect.arrayContaining([
          'exec',
          '--sandbox',
          'workspace-write',
          '--json',
          '--model',
          'live-model',
          'Update only tracked.txt',
        ])
      );
      expect(spawnProcess.mock.calls[0][2]).toEqual(
        expect.objectContaining({
          cwd: expect.stringContaining(path.basename(root)),
          shell: false,
        })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('confirms the Codex process has exited before treating cancellation as complete', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-adapter-'));
    try {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: vi.fn(() => {
          setTimeout(() => child.emit('close', null, 'SIGTERM'), 0);
          return true;
        }),
      });
      const invocation = await startLocalCodexInvocation({
        isolatedWorkspace: root,
        prompt: 'Stop safely',
        modelId: 'live-model',
        capabilityReceiptHash: 'receipt-hash',
        allowedWriteScope: ['tracked.txt'],
        spawnProcess: () => child,
      });
      await invocation.cancel();
      await expect(invocation.inspect()).resolves.toMatchObject({
        cancelled: true,
        state: 'exited',
      });
      await expect(invocation.wait()).resolves.toMatchObject({
        cancelled: true,
        capabilityReceiptHash: 'receipt-hash',
      });
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('creates a detached worktree at the verified source revision', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-adapter-'));
    try {
      execFileSync('git', ['init', root]);
      execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
      execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
      await writeFile(path.join(root, 'tracked.txt'), 'base');
      execFileSync('git', ['-C', root, 'add', '.']);
      execFileSync('git', ['-C', root, 'commit', '-m', 'base']);
      const isolated = await createVerifiedWorktree({
        workspaceRoot: root,
        host: 'codex',
        localIsolation: localIsolation(root),
      });
      expect(isolated.isolationClass).toBe('git-worktree+local-os-sandbox');
      expect(isolated.isolatedWorkspace).not.toBe(isolated.workspace);
      execFileSync('git', [
        '-C',
        root,
        'worktree',
        'remove',
        '--force',
        isolated.isolatedWorkspace,
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an isolation root inside the source workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-adapter-'));
    try {
      await expect(
        createVerifiedWorktree({
          workspaceRoot: root,
          host: 'codex',
          localIsolation: localIsolation(root),
          temporaryRoot: root,
        })
      ).rejects.toThrow('ISOLATION_ROOT_INSIDE_WORKSPACE');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses a worktree when the EAI isolation contract is missing or bypassable', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-adapter-'));
    try {
      await expect(createVerifiedWorktree({ workspaceRoot: root, host: 'codex' })).rejects.toThrow(
        'LOCAL_SANDBOX_REQUIRED'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('requires ledger authority and confirms cancellation', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
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
    const request = {
      objectiveRevision: 'r1',
      allowedWriteScope: ['src/'],
      leaseId: 'lease',
      budgetReservation: 'budget',
      approvalReceipt: 'approval',
    };
    const result = await invokeLedgerBoundNative({
      request,
      capabilityReceipt: receipt,
      capabilityPublicKey: keys.publicKey,
      assertLedger: async (value) => ({
        allowed: true,
        ...value,
        isolation: 'git-worktree+local-os-sandbox',
      }),
      start: async (value) => ({
        invocationId: 'run-1',
        cancel: async () => {},
        inspect: async () => ({ invocationId: 'run-1', cancelled: true, receipt: 'cancelled' }),
        wait: async () => ({
          invocationId: 'run-1',
          capabilityReceiptHash: value.capabilityReceiptHash,
          receipt: 'finished',
        }),
      }),
    });
    expect(result.isolation).toBe('git-worktree+local-os-sandbox');
    const start = vi.fn();
    await expect(
      invokeLedgerBoundNative({
        request,
        capabilityReceipt: receipt,
        capabilityPublicKey: keys.publicKey,
        assertLedger: async (value) => ({
          ...value,
          allowed: true,
          allowedWriteScope: ['src/', 'broader/'],
          isolation: 'git-worktree+local-os-sandbox',
        }),
        start,
      })
    ).rejects.toThrow('LEDGER_AUTHORITY_REQUIRED');
    expect(start).not.toHaveBeenCalled();
  });

  it('cancels and confirms a malformed native invocation before failing closed', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
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
    const cancel = vi.fn(async () => {});
    await expect(
      invokeLedgerBoundNative({
        request: {
          objectiveRevision: 'r1',
          allowedWriteScope: ['src/'],
          leaseId: 'lease',
          budgetReservation: 'budget',
          approvalReceipt: 'approval',
        },
        capabilityReceipt: receipt,
        capabilityPublicKey: keys.publicKey,
        assertLedger: async (value) => ({
          allowed: true,
          ...value,
          isolation: 'git-worktree+local-os-sandbox',
        }),
        start: async () => ({
          invocationId: 'run-1',
          cancel,
          inspect: async () => ({ invocationId: 'run-1', cancelled: true, receipt: 'cancelled' }),
        }),
      })
    ).rejects.toThrow('NATIVE_INVOCATION_REQUIRED');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not return from an aborted invocation until cancellation is confirmed', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
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
    const controller = new AbortController();
    controller.abort();
    await expect(
      invokeLedgerBoundNative({
        signal: controller.signal,
        request: {
          objectiveRevision: 'r1',
          allowedWriteScope: ['src/'],
          leaseId: 'lease',
          budgetReservation: 'budget',
          approvalReceipt: 'approval',
        },
        capabilityReceipt: receipt,
        capabilityPublicKey: keys.publicKey,
        assertLedger: async (value) => ({
          allowed: true,
          ...value,
          isolation: 'git-worktree+local-os-sandbox',
        }),
        start: async () => ({
          invocationId: 'run-1',
          cancel: async () => {},
          inspect: async () => ({ invocationId: 'run-1', cancelled: true, receipt: 'cancelled' }),
          wait: async () => ({ invocationId: 'run-1', receipt: 'finished' }),
        }),
      })
    ).rejects.toThrow('NATIVE_INVOCATION_CANCELLED');
  });

  it('waits for a mid-flight cancellation before returning', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
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
    const controller = new AbortController();
    let releaseCancellation: () => void;
    const cancellation = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    const outcome = invokeLedgerBoundNative({
      signal: controller.signal,
      request: {
        objectiveRevision: 'r1',
        allowedWriteScope: ['src/'],
        leaseId: 'lease',
        budgetReservation: 'budget',
        approvalReceipt: 'approval',
      },
      capabilityReceipt: receipt,
      capabilityPublicKey: keys.publicKey,
      assertLedger: async (value) => ({
        allowed: true,
        ...value,
        isolation: 'git-worktree+local-os-sandbox',
      }),
      start: async () => ({
        invocationId: 'run-1',
        cancel: async () => cancellation,
        inspect: async () => ({ invocationId: 'run-1', cancelled: true, receipt: 'cancelled' }),
        wait: async () => {
          controller.abort();
          return { invocationId: 'run-1', receipt: 'finished' };
        },
      }),
    });
    let settled = false;
    void outcome.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseCancellation!();
    await expect(outcome).rejects.toThrow('NATIVE_INVOCATION_CANCELLED');
  });

  it('refuses a native invocation with an unauthenticated capability receipt', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
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
    await expect(
      invokeLedgerBoundNative({
        request: {
          objectiveRevision: 'r1',
          allowedWriteScope: ['src/'],
          leaseId: 'lease',
          budgetReservation: 'budget',
          approvalReceipt: 'approval',
        },
        capabilityReceipt: receipt,
        assertLedger: async () => ({ allowed: true }),
        start: async () => ({}),
      })
    ).rejects.toThrow('CAPABILITY_RECEIPT_REQUIRED');
  });

  it('refuses a signed receipt that has a worktree but no OS sandbox', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'id',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
      hostVersion: 'codex',
      models: [{ id: 'live', reasoningEfforts: ['high'] }],
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'git-worktree',
      provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
      signingKey: keys.privateKey,
    });
    const start = vi.fn();
    await expect(
      invokeLedgerBoundNative({
        request: {
          objectiveRevision: 'r1',
          allowedWriteScope: ['src/'],
          leaseId: 'lease',
          budgetReservation: 'budget',
          approvalReceipt: 'approval',
        },
        capabilityReceipt: receipt,
        capabilityPublicKey: keys.publicKey,
        assertLedger: async () => ({ allowed: true }),
        start,
      })
    ).rejects.toThrow('CAPABILITY_RECEIPT_REQUIRED');
    expect(start).not.toHaveBeenCalled();
  });
});
