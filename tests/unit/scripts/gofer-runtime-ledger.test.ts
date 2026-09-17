import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRuntimeLedger } from '../../../.specify/scripts/node/gofer-runtime-ledger.mjs';

describe('durable verified-runtime ledger', () => {
  it('releases a cross-process transaction lock after its owner exits', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-runtime-ledger-'));
    let child;
    try {
      const ledgerPath = path.join(root, 'authority.jsonl');
      const ledger = await createRuntimeLedger({ ledgerPath });
      expect((await ledger.reserve({ taskId: 'T001', revision: 'r1', attempt: 1 })).allowed).toBe(
        true
      );
      child = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync(process.argv[1]); db.exec('BEGIN IMMEDIATE'); process.stdout.write('ready\\n'); process.stdin.once('data', () => process.exit(1));",
          `${ledgerPath}.lock`,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      await once(child.stdout!, 'data');
      await expect(ledger.reserve({ taskId: 'T002', revision: 'r1', attempt: 1 })).rejects.toThrow(
        'LEDGER_BUSY'
      );
      child.stdin!.write('exit\n');
      await once(child, 'exit');
      expect((await ledger.reserve({ taskId: 'T002', revision: 'r1', attempt: 1 })).allowed).toBe(
        true
      );
    } finally {
      if (child && child.exitCode === null) child.kill();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not reinterpret a legacy lock marker as a free transaction lock', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-runtime-ledger-'));
    try {
      const ledgerPath = path.join(root, 'authority.jsonl');
      await writeFile(`${ledgerPath}.lock`, '', { mode: 0o600 });
      const ledger = await createRuntimeLedger({ ledgerPath });
      await expect(ledger.reserve({ taskId: 'T001', revision: 'r1', attempt: 1 })).rejects.toThrow(
        'LEDGER_LOCK_MIGRATION_REQUIRED'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('releases a cancelled lease only after bound worker and replacement-worktree proof', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-runtime-ledger-'));
    try {
      let currentTime = Date.parse('2026-09-17T00:00:00.000Z');
      const ledger = await createRuntimeLedger({
        ledgerPath: path.join(root, 'authority.jsonl'),
        now: () => new Date(currentTime),
        verifyCancellation: async (request) => ({ ...request, valid: true }),
      });
      const request = {
        taskId: 'T007',
        revision: 'objective-v1',
        attempt: 1,
        dependencies: [],
        worktreeReceipt: 'old-worktree',
        allowedEditScope: ['src/'],
        requiredChecks: ['test'],
        capabilityReceiptHash: 'capability',
        approvalReceipt: 'approved',
        selectedModel: 'live-model',
        benchmarkReceipt: 'benchmark-v1',
      };
      const reservation = await ledger.reserve(request);
      const lease = await ledger.lease(request);
      const authority = await ledger.authorize({
        ...request,
        leaseId: lease.leaseId,
        budgetReservation: reservation.budgetReservation,
        approvalReceipt: 'approved',
        allowedEditScope: ['src/'],
        requiredChecks: ['test'],
        capabilityReceiptHash: 'capability',
      });
      await ledger.authorizeNative({
        ...request,
        objectiveRevision: request.revision,
        leaseId: lease.leaseId,
        budgetReservation: reservation.budgetReservation,
        approvalReceipt: 'approved',
        capabilityReceiptHash: 'capability',
        ledgerAuthorityReceipt: authority.receipt,
        allowedWriteScope: ['src/'],
      });
      currentTime += 360000;
      const premature = { ...request, attempt: 2 };
      expect((await ledger.reserve(premature)).allowed).toBe(false);
      expect((await ledger.lease(premature)).allowed).toBe(false);
      const cancellation = {
        taskId: request.taskId,
        revision: request.revision,
        attempt: 1,
        leaseId: lease.leaseId,
        budgetReservation: reservation.budgetReservation,
        approvalReceipt: 'approved',
        capabilityReceiptHash: 'capability',
        journalHash: 'journal-before-reconciliation',
        inputRevision: 'source-head',
        workerStopReceipt: 'worker-exited',
        abandonedWorktreeReceipt: 'old-worktree',
        replacementWorktreeReceipt: 'new-worktree',
      };
      expect(
        (
          await ledger.reconcileCancelledLease({
            ...cancellation,
            replacementWorktreeReceipt: 'old-worktree',
          })
        ).allowed
      ).toBe(false);
      const reconciled = await ledger.reconcileCancelledLease(cancellation);
      expect(reconciled.allowed).toBe(true);
      expect((await ledger.reconcileCancelledLease(cancellation)).allowed).toBe(false);
      expect(
        (
          await ledger.inspectCancellation({
            taskId: request.taskId,
            revision: request.revision,
            leaseId: lease.leaseId,
            journalHash: cancellation.journalHash,
            receipt: reconciled.receipt,
          })
        ).valid
      ).toBe(true);
      expect(
        (
          await ledger.authorizeCommit({
            ...request,
            leaseId: lease.leaseId,
            budgetReservation: reservation.budgetReservation,
            approvalReceipt: 'approved',
            capabilityReceiptHash: 'capability',
            inputRevision: 'source-head',
            validation: [],
          })
        ).allowed
      ).toBe(false);
      const next = { ...request, attempt: 2, worktreeReceipt: 'new-worktree' };
      const nextReservation = await ledger.reserve(next);
      expect(nextReservation.allowed).toBe(true);
      const nextLease = await ledger.lease(next);
      expect(nextLease.allowed).toBe(true);
      expect(
        (
          await ledger.authorize({
            ...next,
            worktreeReceipt: 'old-worktree',
            leaseId: nextLease.leaseId,
            budgetReservation: nextReservation.budgetReservation,
            approvalReceipt: 'approved',
            allowedEditScope: ['src/'],
            requiredChecks: ['test'],
            capabilityReceiptHash: 'capability',
          })
        ).allowed
      ).toBe(false);
      expect(
        (
          await ledger.authorize({
            ...next,
            leaseId: nextLease.leaseId,
            budgetReservation: nextReservation.budgetReservation,
            approvalReceipt: 'approved',
            allowedEditScope: ['src/'],
            requiredChecks: ['test'],
            capabilityReceiptHash: 'capability',
          })
        ).allowed
      ).toBe(true);
      expect((await ledger.reserve({ ...request, attempt: 2 })).allowed).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('persists one authority chain and rejects concurrent or replayed execution', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-runtime-ledger-'));
    try {
      const ledger = await createRuntimeLedger({ ledgerPath: path.join(root, 'authority.jsonl') });
      const request = {
        taskId: 'T007',
        revision: 'objective-v1',
        attempt: 1,
        dependencies: [],
        allowedEditScope: ['src/'],
        requiredChecks: ['npm test'],
        capabilityReceiptHash: 'capability:verified',
        approvalReceipt: 'approved:decision-1',
        selectedModel: 'live-model',
        benchmarkReceipt: 'benchmark-v1',
      };
      const reservation = await ledger.reserve(request);
      const lease = await ledger.lease(request);
      const authority = await ledger.authorize({
        ...request,
        leaseId: lease.leaseId,
        budgetReservation: reservation.budgetReservation,
        approvalReceipt: 'approved:decision-1',
        allowedEditScope: ['src/'],
        requiredChecks: ['npm test'],
        capabilityReceiptHash: 'capability:verified',
      });
      const native = await ledger.authorizeNative({
        ...request,
        objectiveRevision: request.revision,
        leaseId: lease.leaseId,
        budgetReservation: reservation.budgetReservation,
        approvalReceipt: 'approved:decision-1',
        capabilityReceiptHash: 'capability:verified',
        ledgerAuthorityReceipt: authority.receipt,
        allowedWriteScope: ['src/'],
      });
      const commit = await ledger.authorizeCommit({
        ...request,
        leaseId: lease.leaseId,
        budgetReservation: reservation.budgetReservation,
        approvalReceipt: 'approved:decision-1',
        inputRevision: 'input-v1',
        capabilityReceiptHash: 'capability:verified',
        validation: [
          { check: 'npm test', passed: true, inputRevision: 'input-v1', receipt: 'test:verified' },
        ],
      });

      expect([reservation, lease, authority, native, commit].every((item) => item.allowed)).toBe(
        true
      );
      await expect(
        ledger.authorizeNative({
          ...request,
          objectiveRevision: request.revision,
          leaseId: lease.leaseId,
          budgetReservation: reservation.budgetReservation,
          approvalReceipt: request.approvalReceipt,
          ledgerAuthorityReceipt: authority.receipt,
          allowedWriteScope: request.allowedEditScope,
          worktreeReceipt: request.worktreeReceipt,
        })
      ).resolves.toMatchObject({ allowed: false });
      await expect(
        ledger.authorizeCommit({
          ...request,
          leaseId: lease.leaseId,
          budgetReservation: reservation.budgetReservation,
          inputRevision: 'input-v1',
          validation: [
            {
              check: 'npm test',
              passed: true,
              inputRevision: 'input-v1',
              receipt: 'test:verified',
            },
          ],
        })
      ).resolves.toMatchObject({ allowed: false });
      await expect(
        ledger.inspectRecovery({
          revision: request.revision,
          journalHash: 'journal:verified',
          authorizations: [
            {
              taskId: request.taskId,
              leaseId: lease.leaseId,
              receipt: authority.receipt,
              capabilityReceiptHash: 'capability:verified',
            },
          ],
          commits: [
            {
              taskId: request.taskId,
              leaseId: lease.leaseId,
              receipt: commit.receipt,
              inputRevision: 'input-v1',
              capabilityReceiptHash: 'capability:verified',
            },
          ],
        })
      ).resolves.toMatchObject({ allowed: true });
      await expect(ledger.lease(request)).resolves.toMatchObject({ allowed: false });
      await expect(
        ledger.authorizeNative({
          ...request,
          leaseId: lease.leaseId,
          ledgerAuthorityReceipt: 'authority:replayed',
        })
      ).resolves.toMatchObject({ allowed: false });
      await expect(
        ledger.authorizeCommit({
          ...request,
          dependencies: [{ taskId: 'T006', inputRevision: 'forged' }],
          leaseId: lease.leaseId,
          budgetReservation: reservation.budgetReservation,
          approvalReceipt: 'approved:decision-1',
          inputRevision: 'input-v1',
          capabilityReceiptHash: 'capability:verified',
          validation: [],
        })
      ).resolves.toMatchObject({ allowed: false });
      await expect(
        ledger.authorizeNative({
          ...request,
          objectiveRevision: request.revision,
          leaseId: lease.leaseId,
          budgetReservation: reservation.budgetReservation,
          approvalReceipt: 'approved:decision-1',
          capabilityReceiptHash: 'capability:verified',
          ledgerAuthorityReceipt: authority.receipt,
          allowedWriteScope: ['outside/'],
        })
      ).resolves.toMatchObject({ allowed: false });
      await expect(
        ledger.authorizeCommit({
          ...request,
          attempt: 2,
          leaseId: lease.leaseId,
          budgetReservation: reservation.budgetReservation,
          approvalReceipt: 'approved:decision-1',
          inputRevision: 'input-v1',
          capabilityReceiptHash: 'capability:verified',
          validation: [],
        })
      ).resolves.toMatchObject({ allowed: false });

      const events = (await readFile(path.join(root, 'authority.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map(JSON.parse);
      expect(events.map((event: { type: string }) => event.type)).toEqual([
        'reserve',
        'lease',
        'authorize',
        'native-authorize',
        'commit-authorize',
      ]);
      expect(
        events.every((event: { eventId: string; at: string }) => event.eventId && event.at)
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('denies forged reservations, cross-attempt authority, unverified checks and expired leases', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-runtime-ledger-'));
    try {
      let currentTime = Date.parse('2026-09-17T00:00:00.000Z');
      const ledger = await createRuntimeLedger({
        ledgerPath: path.join(root, 'authority.jsonl'),
        now: () => new Date(currentTime),
      });
      const request = {
        taskId: 'T007',
        revision: 'objective-v1',
        attempt: 1,
        dependencies: [],
        worktreeReceipt: 'worktree-v1',
        allowedEditScope: ['src/'],
        requiredChecks: ['npm test'],
        capabilityReceiptHash: 'capability-v1',
        approvalReceipt: 'approved-v1',
        selectedModel: 'model-v1',
        benchmarkReceipt: 'benchmark-v1',
      };
      const reservation = await ledger.reserve(request);
      const lease = await ledger.lease(request);
      const proposed = {
        ...request,
        leaseId: lease.leaseId,
        budgetReservation: reservation.budgetReservation,
      };
      expect((await ledger.authorize({ ...proposed, budgetReservation: 'forged' })).allowed).toBe(
        false
      );
      expect((await ledger.authorize({ ...proposed, attempt: 2 })).allowed).toBe(false);
      expect(
        (await ledger.authorize({ ...proposed, allowedEditScope: ['outside/'] })).allowed
      ).toBe(false);
      const authority = await ledger.authorize(proposed);
      expect(authority.allowed).toBe(true);
      expect((await ledger.authorize(proposed)).allowed).toBe(false);
      const completion = {
        ...proposed,
        inputRevision: 'input-v1',
        validation: [
          { check: 'npm test', passed: true, inputRevision: 'input-v1', receipt: 'check-v1' },
        ],
      };
      expect((await ledger.authorizeCommit(completion)).allowed).toBe(false);
      const native = {
        ...proposed,
        objectiveRevision: request.revision,
        ledgerAuthorityReceipt: authority.receipt,
        allowedWriteScope: request.allowedEditScope,
      };
      expect((await ledger.authorizeNative(native)).allowed).toBe(true);
      expect((await ledger.authorizeNative(native)).allowed).toBe(false);
      expect((await ledger.authorizeCommit({ ...completion, validation: [] })).allowed).toBe(false);
      expect(
        (
          await ledger.authorizeCommit({
            ...completion,
            validation: [{ ...completion.validation[0], passed: false }],
          })
        ).allowed
      ).toBe(false);
      expect(
        (
          await ledger.authorizeCommit({
            ...completion,
            validation: [{ ...completion.validation[0], inputRevision: 'stale' }],
          })
        ).allowed
      ).toBe(false);
      currentTime += 300001;
      expect((await ledger.authorizeCommit(completion)).allowed).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
