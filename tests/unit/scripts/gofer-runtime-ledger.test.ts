import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRuntimeLedger } from '../../../.specify/scripts/node/gofer-runtime-ledger.mjs';

describe('durable verified-runtime ledger', () => {
  it('persists one authority chain and rejects concurrent or replayed execution', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gofer-runtime-ledger-'));
    try {
      const ledger = await createRuntimeLedger({ ledgerPath: path.join(root, 'authority.jsonl') });
      const request = { taskId: 'T007', revision: 'objective-v1', attempt: 1, dependencies: [] };
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
        validation: [{ check: 'npm test', passed: true, receipt: 'test:verified' }],
      });

      expect([reservation, lease, authority, native, commit].every((item) => item.allowed)).toBe(
        true
      );
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
});
