import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { createCapabilityReceipt } from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import {
  createVerifiedWorktree,
  invokeLedgerBoundNative,
} from '../../../.specify/scripts/node/gofer-native-adapter.mjs';

describe('native adapter primitives', () => {
  it('creates a detached worktree at the verified source revision', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-native-adapter-'));
    try {
      execFileSync('git', ['init', root]);
      execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
      execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
      await writeFile(path.join(root, 'tracked.txt'), 'base');
      execFileSync('git', ['-C', root, 'add', '.']);
      execFileSync('git', ['-C', root, 'commit', '-m', 'base']);
      const isolated = await createVerifiedWorktree({ workspaceRoot: root });
      expect(isolated.isolationClass).toBe('git-worktree');
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
      isolationClass: 'git-worktree',
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
      assertLedger: async (value) => ({ allowed: true, ...value, isolation: 'git-worktree' }),
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
    expect(result.isolation).toBe('git-worktree');
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
      isolationClass: 'git-worktree',
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
        assertLedger: async (value) => ({ allowed: true, ...value, isolation: 'git-worktree' }),
        start: async () => ({
          invocationId: 'run-1',
          cancel: async () => {},
          inspect: async () => ({ invocationId: 'run-1', cancelled: true, receipt: 'cancelled' }),
          wait: async () => ({ invocationId: 'run-1', receipt: 'finished' }),
        }),
      })
    ).rejects.toThrow('NATIVE_INVOCATION_CANCELLED');
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
      isolationClass: 'git-worktree',
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
});
