import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { executionRevision } from '../../../.specify/scripts/node/gofer-verified-execution.mjs';
import {
  inspectExecutionRecovery,
  reconcileCancelledExecution,
} from '../../../.specify/scripts/node/gofer-execution-recovery.mjs';
import { createRuntimeLedger } from '../../../.specify/scripts/node/gofer-runtime-ledger.mjs';
import {
  createVerifiedWorktree,
  startLocalCodexInvocation,
} from '../../../.specify/scripts/node/gofer-native-adapter.mjs';
import { reconcileVerifiedNativeCancellation } from '../../../.specify/scripts/node/gofer-native-runtime.mjs';
import { localIsolationReport } from './local-isolation-fixture.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'gofer-recovery-'));
  roots.push(root);
  for (const file of [
    'spec.md',
    'plan.md',
    'decisions.md',
    'priority-plan.json',
    'loop-contract.json',
  ]) {
    await writeFile(path.join(root, file), '{}');
  }
  const revision = await executionRevision(root);
  const event = (value: Record<string, unknown>) => ({ schemaVersion: 1, revision, ...value });
  const events = [
    event({
      event: 'started',
      maxCalls: 50,
      maxConcurrent: 1,
      maxIterations: 2,
      requiredChecks: { T001: ['acceptance'] },
      deadlineMs: Date.now() + 10000,
    }),
    event({ event: 'attempt_reserved', task: 'T001', attempt: 1 }),
    event({ event: 'call_reserved', task: 'T001', method: 'execute', call: 1 }),
    event({
      event: 'ledger_authorized',
      task: 'T001',
      attempt: 1,
      leaseId: 'lease-1',
      budgetReservation: 'budget-1',
      receipt: 'authority-1',
      capabilityReceiptHash: 'capability-1',
    }),
  ];
  const journal = path.join(root, 'verified-execution.jsonl');
  const save = async (records = events) =>
    writeFile(journal, records.map((e) => JSON.stringify(e)).join('\n') + '\n');
  await save();
  const inspectWorkers = vi.fn(async (r: Record<string, unknown>) => ({
    ...r,
    allStopped: true,
    receipt: 'trusted-worker-inspection',
  }));
  const verifyReceipt = vi.fn(async (r: Record<string, unknown>) => ({ ...r, valid: true }));
  const inspectLedger = vi.fn(async (r: Record<string, unknown>) => ({ ...r, allowed: true }));
  return {
    root,
    revision,
    event,
    events,
    journal,
    save,
    options: { featureDir: root, inspectWorkers, verifyReceipt, inspectLedger },
  };
}
describe('Read-only interrupted execution reconciliation', () => {
  it('accepts a journaled lease call from the verified execution graph', async () => {
    const f = await fixture();
    f.events.splice(
      2,
      1,
      f.event({ event: 'call_reserved', task: 'T001', method: 'lease', call: 1 }),
      f.event({
        event: 'lease_granted',
        task: 'T001',
        attempt: 1,
        leaseId: 'lease-1',
        expiresAt: new Date(Date.now() + 5000).toISOString(),
      }),
      f.event({ event: 'call_reserved', task: 'T001', method: 'execute', call: 2 })
    );
    await f.save();
    expect((await inspectExecutionRecovery(f.options)).reasons).not.toContain(
      'INVALID_CALL_HISTORY'
    );
  });

  it('does not reuse the preceding attempt execution for a new attempt', async () => {
    const f = await fixture();
    f.events.push(
      f.event({ event: 'attempt_reserved', task: 'T001', attempt: 2 }),
      f.event({
        event: 'check',
        task: 'T001',
        attempt: 2,
        check: 'acceptance',
        passed: true,
        inputRevision: 'i',
        receipt: 'c',
      }),
      f.event({ event: 'verified', task: 'T001', inputRevision: 'i', receipt: 'r' })
    );
    await f.save();
    expect((await inspectExecutionRecovery(f.options)).reasons).toContain('INVALID_CHECK_HISTORY');
  });
  it.each([false, true])(
    'does not start another receipt verifier after timeout (fixed wall clock: %s)',
    async (fixedClock) => {
      const f = await fixture();
      f.events[0].requiredChecks.T002 = ['acceptance'];
      for (const [task, call] of [
        ['T001', 1],
        ['T002', 2],
      ] as const) {
        if (task === 'T002')
          f.events.push(
            f.event({ event: 'attempt_reserved', task, attempt: 1 }),
            f.event({ event: 'call_reserved', task, method: 'execute', call }),
            f.event({
              event: 'ledger_authorized',
              task,
              attempt: 1,
              leaseId: 'lease-2',
              budgetReservation: 'budget-2',
              receipt: 'authority-2',
              capabilityReceiptHash: 'capability-1',
            })
          );
        f.events.push(
          f.event({
            event: 'check',
            task,
            attempt: 1,
            check: 'acceptance',
            passed: true,
            inputRevision: 'i',
            receipt: 'c',
          }),
          f.event({
            event: 'commit_authorized',
            task,
            attempt: 1,
            leaseId: task === 'T001' ? 'lease-1' : 'lease-2',
            inputRevision: 'i',
            receipt: `commit-${task}`,
            capabilityReceiptHash: 'capability-1',
          }),
          f.event({ event: 'verified', task, inputRevision: 'i', receipt: 'r' })
        );
      }
      await f.save();
      if (fixedClock) vi.spyOn(Date, 'now').mockReturnValue(Date.now());
      f.options.verifyReceipt.mockImplementation(() => new Promise(() => {}));
      // Allow journal I/O to finish on loaded CI hosts; the verifier itself
      // remains pending until the bounded inspection timer expires.
      const report = await inspectExecutionRecovery({ ...f.options, timeoutMs: 3000 });
      expect(f.options.verifyReceipt).toHaveBeenCalledOnce();
      expect(report.reusableTasks).toEqual([]);
      expect(report.reasons).toContain('INSPECTION_DEADLINE_EXHAUSTED');
    }
  );
  it('keeps consumed limits and never replays uncertain work', async () => {
    const f = await fixture();
    const before = await readFile(f.journal, 'utf8');
    const report = await inspectExecutionRecovery(f.options);
    expect(report.status).toBe('blocked');
    expect(report.callsConsumed).toBe(1);
    expect(report.attemptsConsumed).toEqual({ T001: 1 });
    expect(report.uncertainTasks).toEqual(['T001']);
    expect(report.resumeAllowed).toBe(false);
    expect(report.replayAllowed).toBe(false);
    expect(await readFile(f.journal, 'utf8')).toBe(before);
  });
  it('requires a trusted cancellation proof before a cancelled task can restart', async () => {
    const f = await fixture();
    f.events[3].worktreeReceipt = 'old-worktree';
    f.events.push(
      f.event({
        event: 'cancelled',
        task: 'T001',
        reason: 'CANCELLED',
        reconciliationRequired: true,
      }),
      f.event({ event: 'finished', status: 'incomplete', adapterCallsSettled: true })
    );
    const journalHash = createHash('sha256')
      .update(f.events.map((e) => `${JSON.stringify(e)}\n`).join(''))
      .digest('hex');
    f.events.push(
      f.event({
        event: 'cancel_reconciled',
        task: 'T001',
        attempt: 1,
        leaseId: 'lease-1',
        journalHash,
        abandonedWorktreeReceipt: 'old-worktree',
        replacementWorktreeReceipt: 'new-worktree',
        workerStopReceipt: 'stopped',
        inputRevision: 'input-1',
        receipt: 'cancellation-1',
      })
    );
    await f.save();
    const withoutVerifier = await inspectExecutionRecovery(f.options);
    expect(withoutVerifier.status).toBe('blocked');
    expect(withoutVerifier.reasons).toContain('CANCELLATION_VERIFIER_REQUIRED');
    const verifyCancellation = vi.fn(async (request: Record<string, unknown>) => ({
      ...request,
      valid: true,
    }));
    const report = await inspectExecutionRecovery({ ...f.options, verifyCancellation });
    expect(report.status).toBe('reconciled');
    expect(report.restartableTasks).toEqual(['T001']);
    expect(report.replacementWorktreeReceipt).toBe('new-worktree');
    expect(report.resumeAllowed).toBe(true);
    expect(report.replayAllowed).toBe(false);
    expect(verifyCancellation).toHaveBeenCalledOnce();
    f.events.at(-1)!.journalHash = 'forged';
    await f.save();
    const forged = await inspectExecutionRecovery({ ...f.options, verifyCancellation });
    expect(forged.status).toBe('blocked');
    expect(forged.reasons).toContain('INVALID_CANCELLATION_RECONCILIATION');
  });
  // The native worktree profile is not qualified on Windows; portable recovery cases above still run there.
  const nativeCase = it.skipIf(process.platform === 'win32');
  const restartTitle =
    'writes a ledger-bound restart record only after both worktrees are inspected';
  nativeCase(restartTitle, async () => {
    const f = await fixture();
    const source = await mkdtemp(path.join(tmpdir(), 'gofer-recovery-source-'));
    roots.push(source);
    const git = (...args: string[]) => promisify(execFile)('git', ['-C', source, ...args]);
    await git('init');
    await git('config', 'user.email', 'test@example.com');
    await git('config', 'user.name', 'Test');
    await writeFile(path.join(source, 'tracked.txt'), 'base');
    await git('add', '.');
    await git('commit', '-m', 'base');
    const localIsolation = ({ workspaceRoot }: { workspaceRoot: string }) =>
      localIsolationReport(workspaceRoot);
    const oldWorktree = await createVerifiedWorktree({
      workspaceRoot: source,
      host: 'codex',
      localIsolation,
    });
    const newWorktree = await createVerifiedWorktree({
      workspaceRoot: source,
      host: 'codex',
      localIsolation,
    });
    let worker: Awaited<ReturnType<typeof startLocalCodexInvocation>> | undefined;
    try {
      await writeFile(path.join(oldWorktree.isolatedWorkspace, 'tracked.txt'), 'partial');
      f.events[0].approvalReceipt = 'approved';
      f.events[3].worktreeReceipt = oldWorktree.receipt;
      const ledgerPath = path.join(f.root, 'ledger.jsonl');
      const native = process.platform !== 'win32';
      const ledger = await createRuntimeLedger({
        ledgerPath,
        verifyCancellation: native ? undefined : async (request) => ({ ...request, valid: true }),
      });
      const base = {
        taskId: 'T001',
        revision: f.revision,
        attempt: 1,
        dependencies: [],
        worktreeReceipt: oldWorktree.receipt,
        allowedEditScope: ['tracked.txt'],
        requiredChecks: ['test'],
        approvalReceipt: 'approved',
        capabilityReceiptHash: 'capability-1',
        selectedModel: 'local-process-test',
        benchmarkReceipt: 'benchmark-v1',
      };
      const reservation = await ledger.reserve(base);
      const lease = await ledger.lease(base);
      const authority = await ledger.authorize({
        ...base,
        leaseId: lease.leaseId,
        budgetReservation: reservation.budgetReservation,
        approvalReceipt: 'approved',
        allowedEditScope: ['tracked.txt'],
        capabilityReceiptHash: 'capability-1',
      });
      await ledger.authorizeNative({
        ...base,
        objectiveRevision: f.revision,
        leaseId: lease.leaseId,
        budgetReservation: reservation.budgetReservation,
        approvalReceipt: 'approved',
        capabilityReceiptHash: 'capability-1',
        ledgerAuthorityReceipt: authority.receipt,
        allowedWriteScope: ['tracked.txt'],
      });
      f.events[3].leaseId = lease.leaseId;
      f.events[3].budgetReservation = reservation.budgetReservation;
      f.events[3].receipt = authority.receipt;
      f.events.push(
        f.event({
          event: 'cancelled',
          task: 'T001',
          reason: 'CANCELLED',
          reconciliationRequired: true,
        }),
        f.event({ event: 'finished', status: 'incomplete', adapterCallsSettled: true })
      );
      await f.save();
      if (native) {
        const evidenceDirectory = path.join(f.root, '.native-worker-evidence');
        let readyResolve!: () => void;
        const ready = new Promise<void>((resolve) => {
          readyResolve = resolve;
        });
        worker = await startLocalCodexInvocation({
          isolatedWorkspace: oldWorktree.isolatedWorkspace,
          prompt: 'Non-model cancellation proof',
          modelId: 'local-process-test',
          capabilityReceiptHash: 'capability-1',
          allowedWriteScope: ['tracked.txt'],
          objectiveRevision: f.revision,
          leaseId: lease.leaseId,
          worktreeReceipt: oldWorktree.receipt,
          evidenceDirectory,
          spawnProcess: (
            _command: string,
            _args: string[],
            options: Parameters<typeof spawn>[2]
          ) => {
            const child = spawn(
              process.execPath,
              ['-e', "process.stdout.write('ready\\n'); setInterval(() => {}, 1000)"],
              options
            );
            child.stdout?.once('data', () => readyResolve());
            return child;
          },
        });
        await Promise.race([
          ready,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('PROCESS_NOT_READY')), 2000)
          ),
        ]);
        await worker.cancel();
        expect((await worker.inspect()).cancelled).toBe(true);
      }
      let currentInput = 'source-head';
      const reconcile = () => {
        const options = {
          featureDir: f.root,
          workspaceRoot: source,
          abandonedWorkspace: oldWorktree.isolatedWorkspace,
          replacementWorkspace: newWorktree.isolatedWorkspace,
          worktreeRevision: oldWorktree.revision,
          replacementWorktreeReceipt: newWorktree.receipt,
          inputRevision: 'source-head',
        };
        return native
          ? reconcileVerifiedNativeCancellation({
              ...options,
              ledgerPath,
              inspectInputRevision: async () => currentInput,
              verifyReceipt: f.options.verifyReceipt,
            })
          : reconcileCancelledExecution({ ...f.options, ...options, ledger });
      };
      await writeFile(path.join(newWorktree.isolatedWorkspace, 'tracked.txt'), 'not-clean');
      await expect(reconcile()).rejects.toThrow('REPLACEMENT_WORKTREE_UNVERIFIED');
      await writeFile(path.join(newWorktree.isolatedWorkspace, 'tracked.txt'), 'base');
      if (native) {
        currentInput = 'stale-input';
        await expect(reconcile()).rejects.toThrow('LEDGER_CANCELLATION_DENIED');
        currentInput = 'source-head';
      }
      const result = await reconcile();
      expect(result.reconciled).toBe(true);
      const resumed = await inspectExecutionRecovery({
        ...f.options,
        verifyCancellation: async (request) => {
          const proof = await ledger.inspectCancellation(request);
          return { ...request, valid: proof.valid };
        },
      });
      expect(resumed.status).toBe('reconciled');
      expect(resumed.restartableTasks).toEqual(['T001']);
      const raw = await readFile(f.journal, 'utf8');
      expect(raw).toContain('cancel_reconciled');
      const records = raw
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line));
      records.at(-1).replacementWorktreeReceipt = 'forged-replacement';
      await f.save(records);
      const forged = await inspectExecutionRecovery({
        ...f.options,
        verifyCancellation: async (request) => {
          const proof = await ledger.inspectCancellation(request);
          return { ...request, valid: proof.valid };
        },
      });
      expect(forged.status).toBe('blocked');
      expect(forged.reasons).toContain('CANCELLATION_NOT_VERIFIED:T001');
      await writeFile(f.journal, raw);
      await expect(reconcile()).rejects.toThrow('CANCELLATION_RECONCILIATION_REQUIRED');
    } finally {
      await worker?.cancel().catch(() => {});
      await git('worktree', 'remove', '--force', oldWorktree.isolatedWorkspace);
      await git('worktree', 'remove', '--force', newWorktree.isolatedWorkspace);
    }
  });
  it('does not resume a run that returned while an adapter call was still active', async () => {
    const f = await fixture();
    f.events.push(f.event({ event: 'finished', status: 'incomplete', adapterCallsSettled: false }));
    await f.save();
    const report = await inspectExecutionRecovery(f.options);
    expect(report.status).toBe('blocked');
    expect(report.reasons).toContain('ADAPTER_CALLS_NOT_SETTLED');
    expect(report.resumeAllowed).toBe(false);
  });
  it('reconciles independently reverified receipts without granting replay', async () => {
    const f = await fixture();
    f.events.push(
      f.event({
        event: 'check',
        task: 'T001',
        attempt: 1,
        check: 'acceptance',
        passed: true,
        inputRevision: 'input-1',
        receipt: 'check-1',
      }),
      f.event({
        event: 'commit_authorized',
        task: 'T001',
        attempt: 1,
        leaseId: 'lease-1',
        inputRevision: 'input-1',
        receipt: 'commit-1',
        capabilityReceiptHash: 'capability-1',
      }),
      f.event({ event: 'verified', task: 'T001', inputRevision: 'input-1', receipt: 'proof-1' })
    );
    await f.save();
    const report = await inspectExecutionRecovery(f.options);
    expect(report.status).toBe('reconciled');
    expect(report.reusableTasks).toEqual(['T001']);
    expect(report.resumeAllowed).toBe(true);
    expect(f.options.verifyReceipt).toHaveBeenCalledOnce();
  });
  it('rejects a forged restart link even when the earlier task has a valid receipt', async () => {
    const f = await fixture();
    f.events.push(
      f.event({
        event: 'check',
        task: 'T001',
        attempt: 1,
        check: 'acceptance',
        passed: true,
        inputRevision: 'input-1',
        receipt: 'check-1',
      }),
      f.event({
        event: 'commit_authorized',
        task: 'T001',
        attempt: 1,
        leaseId: 'lease-1',
        inputRevision: 'input-1',
        receipt: 'commit-1',
        capabilityReceiptHash: 'capability-1',
      }),
      f.event({ event: 'verified', task: 'T001', inputRevision: 'input-1', receipt: 'proof-1' }),
      f.event({ event: 'finished', status: 'incomplete' }),
      f.event({
        event: 'resumed',
        previousJournalHash: 'forged',
        callsConsumed: 1,
        attemptsConsumed: { T001: 1 },
      })
    );
    await f.save();
    const report = await inspectExecutionRecovery(f.options);
    expect(report.status).toBe('blocked');
    expect(report.reasons).toContain('INVALID_RESUME_HISTORY');
    expect(report.resumeAllowed).toBe(false);
  });
  it('does not turn a journal claim into proof without trusted inspectors', async () => {
    const f = await fixture();
    const report = await inspectExecutionRecovery({ featureDir: f.root });
    expect(report.reasons).toContain('WORKER_INSPECTION_REQUIRED');
    expect(report.reasons).toContain('RECEIPT_VERIFIER_REQUIRED');
    expect(report.reasons).toContain('LEDGER_INSPECTION_REQUIRED');
  });
  it('does not reuse work when the authority ledger cannot reconcile it', async () => {
    const f = await fixture();
    f.options.inspectLedger.mockResolvedValue({ allowed: false });
    const report = await inspectExecutionRecovery(f.options);
    expect(report.reasons).toContain('LEDGER_NOT_RECONCILED');
    expect(report.resumeAllowed).toBe(false);
  });
  it('does not accept still-active workers', async () => {
    const f = await fixture();
    f.options.inspectWorkers.mockResolvedValue({ allStopped: false });
    expect((await inspectExecutionRecovery(f.options)).reasons).toContain('WORKERS_NOT_RECONCILED');
    expect(f.options.verifyReceipt).not.toHaveBeenCalled();
  });
  it('rejects stale direction before receipt verification', async () => {
    const f = await fixture();
    await writeFile(path.join(f.root, 'spec.md'), 'New goal');
    expect((await inspectExecutionRecovery(f.options)).reasons).toContain('STALE_DIRECTION');
    expect(f.options.verifyReceipt).not.toHaveBeenCalled();
  });
  it('rejects changing evidence during reconciliation', async () => {
    const f = await fixture();
    f.events.push(
      f.event({
        event: 'check',
        task: 'T001',
        attempt: 1,
        check: 'acceptance',
        passed: true,
        inputRevision: 'i',
        receipt: 'c',
      })
    );
    f.events.push(
      f.event({
        event: 'commit_authorized',
        task: 'T001',
        attempt: 1,
        leaseId: 'lease-1',
        inputRevision: 'i',
        receipt: 'commit-1',
        capabilityReceiptHash: 'capability-1',
      })
    );
    f.events.push(f.event({ event: 'verified', task: 'T001', inputRevision: 'i', receipt: 'r' }));
    await f.save();
    f.options.verifyReceipt.mockImplementation(async (r: Record<string, unknown>) => {
      await appendFile(f.journal, JSON.stringify(f.event({ event: 'finished' })) + '\n');
      return { ...r, valid: true };
    });
    const report = await inspectExecutionRecovery(f.options);
    expect(report.reasons).toContain('RECOVERY_INPUT_CHANGED');
    expect(report.reusableTasks).toEqual([]);
  });
  it('rejects a receipt proof naming a different journal', async () => {
    const f = await fixture();
    f.events.push(
      f.event({
        event: 'check',
        task: 'T001',
        attempt: 1,
        check: 'acceptance',
        passed: true,
        inputRevision: 'i',
        receipt: 'c',
      }),
      f.event({
        event: 'commit_authorized',
        task: 'T001',
        attempt: 1,
        leaseId: 'lease-1',
        inputRevision: 'i',
        receipt: 'commit-1',
        capabilityReceiptHash: 'capability-1',
      }),
      f.event({ event: 'verified', task: 'T001', inputRevision: 'i', receipt: 'r' })
    );
    await f.save();
    f.options.verifyReceipt.mockImplementation(async (r: Record<string, unknown>) => ({
      ...r,
      valid: true,
      journalHash: 'wrong',
    }));
    expect((await inspectExecutionRecovery(f.options)).reasons).toContain(
      'RECEIPT_NOT_VERIFIED:T001'
    );
  });
  it.each(['call_reserved', 'stale'])('rejects %s after verification', async (event) => {
    const f = await fixture();
    f.events.push(
      f.event({
        event: 'check',
        task: 'T001',
        attempt: 1,
        check: 'acceptance',
        passed: true,
        inputRevision: 'i',
        receipt: 'c',
      }),
      f.event({ event: 'verified', task: 'T001', inputRevision: 'i', receipt: 'r' }),
      f.event({ event, task: 'T001', method: 'execute', call: 2 })
    );
    await f.save();
    expect((await inspectExecutionRecovery(f.options)).reusableTasks).toEqual([]);
  });
  it('does not accept verification without required check history', async () => {
    const f = await fixture();
    f.events.push(f.event({ event: 'verified', task: 'T001', inputRevision: 'i', receipt: 'r' }));
    await f.save();
    expect((await inspectExecutionRecovery(f.options)).reasons).toContain(
      'INVALID_VERIFICATION_RECORD'
    );
  });
  it('does not accept a verified journal event without ledger and commit authority', async () => {
    const f = await fixture();
    f.events.push(
      f.event({
        event: 'check',
        task: 'T001',
        attempt: 1,
        check: 'acceptance',
        passed: true,
        inputRevision: 'i',
        receipt: 'c',
      }),
      f.event({ event: 'verified', task: 'T001', inputRevision: 'i', receipt: 'r' })
    );
    await f.save();
    expect((await inspectExecutionRecovery(f.options)).reasons).toContain(
      'INVALID_VERIFICATION_RECORD'
    );
  });
  it('bounds a stalled inspector and does not reconcile past its deadline', async () => {
    const f = await fixture();
    f.options.inspectWorkers.mockImplementation(() => new Promise(() => {}));
    const start = Date.now();
    const report = await inspectExecutionRecovery({ ...f.options, timeoutMs: 30 });
    expect(report.status).toBe('blocked');
    expect(Date.now() - start).toBeLessThan(1000);
    expect(report.reasons).toContain('INSPECTION_DEADLINE_EXHAUSTED');
  });
  it('retains a real exited child process journal without executing another child', async () => {
    const f = await fixture();
    await expect(
      promisify(execFile)(process.execPath, [
        '-e',
        'const fs=require("fs"); const fd=fs.openSync(process.argv[1],"w"); fs.writeSync(fd,process.argv[2]); fs.fsyncSync(fd); process.exit(77)',
        f.journal,
        f.events.map((e) => JSON.stringify(e)).join('\n') + '\n',
      ])
    ).rejects.toMatchObject({ code: 77 });
    const report = await inspectExecutionRecovery(f.options);
    expect(report.reasons).toContain('SIDE_EFFECT_RECONCILIATION_REQUIRED');
    expect(report.callsConsumed).toBe(1);
  });
  it('rejects a truncated journal', async () => {
    const f = await fixture();
    await appendFile(f.journal, '{');
    expect((await inspectExecutionRecovery(f.options)).reasons).toContain('TRUNCATED_JOURNAL');
  });
  it('rejects malformed JSON and reset or inflated call history', async () => {
    const f = await fixture();
    await writeFile(f.journal, '{}\n{invalid}\n');
    expect((await inspectExecutionRecovery(f.options)).reasons).toContain('INVALID_JOURNAL_JSON');
    for (const call of [0, 3, 100]) {
      f.events[2].call = call;
      await f.save();
      expect((await inspectExecutionRecovery(f.options)).reasons).toContain('INVALID_CALL_HISTORY');
    }
  });
  it('does not reset an exhausted deadline', async () => {
    const f = await fixture();
    f.events[0].deadlineMs = 1;
    await f.save();
    expect((await inspectExecutionRecovery(f.options)).reasons).toContain('DEADLINE_EXHAUSTED');
  });
  it('rejects additional work after the finished event', async () => {
    const f = await fixture();
    await f.save([f.events[0], f.event({ event: 'finished' }), f.events[1]]);
    expect((await inspectExecutionRecovery(f.options)).reasons).toContain(
      'INVALID_JOURNAL_SEQUENCE'
    );
  });
  it('bounds journal reads', async () => {
    const f = await fixture();
    await writeFile(f.journal, 'x'.repeat(8 * 1024 * 1024 + 1));
    await expect(inspectExecutionRecovery(f.options)).rejects.toThrow('INVALID_RECOVERY_JOURNAL');
  });
});
