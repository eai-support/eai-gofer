/* eslint-disable @typescript-eslint/no-explicit-any -- the trusted-adapter seam accepts host-defined payloads. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateKeyPairSync } from 'node:crypto';
import { applyBlockerEvent } from '../../../.specify/scripts/node/gofer-blocker-control.mjs';
import { createAcceptanceChecker } from '../../../.specify/scripts/node/gofer-acceptance-check.mjs';
import {
  runVerifiedGraph,
  validateWorkGraph,
} from '../../../.specify/scripts/node/gofer-verified-execution.mjs';
import { inspectExecutionRecovery } from '../../../.specify/scripts/node/gofer-execution-recovery.mjs';
import {
  capabilityReceiptHash,
  createCapabilityReceipt,
} from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import { runBenchmark } from '../../../.specify/scripts/node/gofer-benchmark.mjs';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});

const roots: string[] = [];
beforeEach(async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  vi.mocked(filesystem.open).mockImplementation(actual.open);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture({ parallel = false, conflict = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'gofer-kernel-'));
  roots.push(root);
  const plan = {
    schemaVersion: 1,
    revision: 'direction-1',
    objective: 'Check both tasks',
    lastInstruction: { id: 'D001', text: 'Check both tasks' },
    criticalPath: ['T001', 'T002'],
    outcome: {
      id: 'OUTCOME-1',
      statement: 'Check both tasks',
      requirements: ['FR-001'],
      target: { environment: 'local', revision: 'input-1' },
      receipt: 'evidence/outcome.json',
    },
    tasks: {
      T001: { dependsOn: [], allowedEditScope: ['a.txt'] },
      T002: {
        dependsOn: parallel ? [] : ['T001'],
        allowedEditScope: [conflict ? 'a.txt' : 'b.txt'],
        ...(parallel
          ? { parallelFor: 'T001', reason: 'Independent work', decisionId: 'D002' }
          : {}),
      },
    },
  };
  const files = {
    'spec.md': '# Specification\nFR-001: Check both tasks.\n',
    'plan.md': '# Plan\n',
    'tasks.md': '- [ ] T001: First\n- [ ] T002: Second\n',
    'decisions.md': 'D001: Check both tasks\nD002: Independent work\n',
    'traceability.md': 'FR-001 T001 T002\n',
    'priority-plan.json': JSON.stringify(plan),
    'loop-contract.json': JSON.stringify({ maxIterations: 2, budget: {} }),
  };
  for (const [name, body] of Object.entries(files)) await writeFile(path.join(root, name), body);
  const adapter = {
    reserve: vi.fn(async () => ({ allowed: true, budgetReservation: 'fixture-budget' })),
    lease: vi.fn(async () => ({
      leaseId: 'fixture-lease',
      expiresAt: new Date(Date.now() + 5000).toISOString(),
    })),
    execute: vi.fn(async () => ({ changedFiles: [] })),
    inputRevision: vi.fn(async () => 'input-1'),
    check: vi.fn(async (request: any) => ({
      ...request,
      executed: true,
      exitCode: 0,
      receipt: 'local-test-output',
    })),
    verified: vi.fn(async ({ taskId, revision, inputRevision, assertCurrent }: any) => {
      await assertCurrent();
      const file = path.join(root, 'tasks.md');
      await writeFile(
        file,
        (await readFile(file, 'utf8')).replace(`[ ] ${taskId}`, `[x] ${taskId}`)
      );
      return { committed: true, taskId, revision, inputRevision, receipt: 'local-commit' };
    }),
  };
  const keys = generateKeyPairSync('ed25519');
  const capabilityReceipt = createCapabilityReceipt({
    host: 'codex',
    evaluatorVersion: '2',
    evaluationId: 'fixture',
    evaluatedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    hostVersion: 'codex fixture',
    models: [{ id: 'fixture-model', reasoningEfforts: ['high'] }],
    reasoningCapabilities: ['high'],
    toolCapabilities: ['shell'],
    grantedPermissions: ['workspace-write'],
    isolationClass: 'git-worktree+local-os-sandbox',
    provenance: { evaluator: 'fixture', source: 'fixture', keyId: 'fixture-key' },
    signingKey: keys.privateKey,
  });
  const benchmarkEvidence = await runBenchmark({
    cases: [{ id: 'fixture-case', heldOut: true, input: { task: 'fixture' } }],
    provenance: {
      harnessId: 'graph-fixture',
      modelId: 'fixture-model',
      capabilityReceiptHash: capabilityReceiptHash(capabilityReceipt),
    },
    execute: async ({ run }) => ({
      modelId: 'fixture-model',
      costUsd: 0,
      durationMs: 1,
      receipt: `fixture-execution-${run}`,
    }),
    verify: async ({ caseId, run, inputHash, execution }) => ({
      caseId,
      run,
      inputHash,
      executionReceipt: execution.receipt,
      passed: true,
      receipt: `fixture-verifier-${run}`,
      verifierId: 'fixture-independent-check',
      failureClassification: 'none',
      reviewReceipt: `fixture-review-${run}`,
    }),
  });
  const ledger = {
    authorize: vi.fn(async (request: any) => ({
      allowed: true,
      ...request,
      receipt: 'fixture-ledger-authority',
    })),
    authorizeCommit: vi.fn(
      async ({ taskId, revision, inputRevision, leaseId, capabilityReceiptHash }: any) => ({
        allowed: true,
        taskId,
        revision,
        inputRevision,
        leaseId,
        capabilityReceiptHash,
        receipt: 'fixture-ledger-commit-authority',
      })
    ),
  };
  return {
    root,
    plan,
    adapter,
    keys,
    options: {
      featureDir: root,
      workspaceRoot: root,
      checks: { T001: ['acceptance'], T002: ['acceptance'] },
      adapter,
      ledger,
      capabilityReceipt,
      capabilityPublicKey: keys.publicKey,
      approvalReceipt: 'fixture-approval',
      benchmarkEvidence,
      verifyBenchmark: async ({ receiptHash }: any) => ({
        valid: true,
        receiptHash,
        receipt: 'fixture-benchmark',
      }),
      maxCalls: 40,
      deadlineMs: Date.now() + 10000,
      maxConcurrent: 2,
    },
  };
}

describe('Verified execution kernel (local adapters, not native model qualification)', () => {
  it('accepts a live model reasoning-effort requirement through graph routing', async () => {
    const f = await fixture();
    const result = await runVerifiedGraph({
      ...f.options,
      requiredCapabilities: { reasoningEfforts: ['high'] },
    });
    expect(result.status).toBe('verified');
    expect(f.adapter.execute).toHaveBeenCalled();
  });
  it('continues pending work after a real controller interruption at a verified boundary', async () => {
    const f = await fixture();
    const controller = new AbortController();
    const originalVerified = f.adapter.verified.getMockImplementation()!;
    const originalInputRevision = f.adapter.inputRevision.getMockImplementation()!;
    let firstTaskCommitted = false;
    let readsAfterCommit = 0;
    f.adapter.verified.mockImplementation(async (request: any) => {
      const result = await originalVerified(request);
      if (request.taskId === 'T001') firstTaskCommitted = true;
      return result;
    });
    f.adapter.inputRevision.mockImplementation(async (request: any) => {
      if (request.taskId === 'T001' && firstTaskCommitted && ++readsAfterCommit === 2) {
        controller.abort();
      }
      return originalInputRevision(request);
    });
    await expect(runVerifiedGraph({ ...f.options, signal: controller.signal })).rejects.toThrow(
      'CANCELLED'
    );
    expect(f.adapter.execute.mock.calls.map(([request]: any) => request.taskId)).toEqual(['T001']);
    f.adapter.execute.mockClear();
    const recovery = {
      inspectWorkers: async (request: any) => ({
        ...request,
        allStopped: true,
        receipt: 'stopped',
      }),
      inspectLedger: async (request: any) => ({ ...request, allowed: true }),
      verifyReceipt: async (request: any) => ({ ...request, valid: true }),
    };
    expect(
      (await inspectExecutionRecovery({ featureDir: f.root, ...recovery })).resumeAllowed
    ).toBe(true);
    const result = await runVerifiedGraph({ ...f.options, recovery });
    expect(result.status).toBe('verified');
    expect(f.adapter.execute.mock.calls.map(([request]: any) => request.taskId)).toEqual(['T002']);
  });
  it('resumes only pending work after independent reconciliation of a verified checkpoint', async () => {
    const f = await fixture();
    expect((await runVerifiedGraph(f.options)).status).toBe('verified');
    const journalPath = path.join(f.root, 'verified-execution.jsonl');
    const original = (await readFile(journalPath, 'utf8')).trimEnd().split('\n').map(JSON.parse);
    const partial = original.filter(
      (event: any) => event.task !== 'T002' && event.event !== 'finished'
    );
    await writeFile(
      journalPath,
      `${partial.map((event: any) => JSON.stringify(event)).join('\n')}\n`
    );
    await writeFile(path.join(f.root, 'tasks.md'), '- [x] T001: First\n- [ ] T002: Second\n');
    f.adapter.execute.mockClear();
    const recovery = {
      inspectWorkers: async (request: any) => ({
        ...request,
        allStopped: true,
        receipt: 'stopped',
      }),
      inspectLedger: async (request: any) => ({ ...request, allowed: true }),
      verifyReceipt: async (request: any) => ({ ...request, valid: true }),
    };
    const result = await runVerifiedGraph({ ...f.options, recovery });
    expect(result.status).toBe('verified');
    expect(result.verified).toEqual(['T001', 'T002']);
    expect(f.adapter.execute.mock.calls.map(([request]: any) => request.taskId)).toEqual(['T002']);
    const resumed = (await readFile(journalPath, 'utf8')).trimEnd().split('\n').map(JSON.parse);
    expect(resumed.filter((event: any) => event.event === 'resumed')).toHaveLength(1);
    expect(resumed.filter((event: any) => event.event === 'verified')).toHaveLength(2);
    const reconciled = await inspectExecutionRecovery({ featureDir: f.root, ...recovery });
    expect(reconciled.status).toBe('reconciled');
    expect(reconciled.reusableTasks).toEqual(['T001', 'T002']);
  });
  it('fails closed without signed capability evidence and ledger authority', async () => {
    const f = await fixture();
    const untrusted = {
      ...f.options,
      ledger: undefined,
      capabilityReceipt: undefined,
      capabilityPublicKey: undefined,
    };
    await expect(runVerifiedGraph(untrusted)).rejects.toThrow(
      'LEDGER_CAPABILITY_AUTHORITY_REQUIRED'
    );
    expect(f.adapter.execute).not.toHaveBeenCalled();
  });
  it('does not dispatch without independently verified benchmark evidence', async () => {
    const f = await fixture();
    await expect(runVerifiedGraph({ ...f.options, verifyBenchmark: undefined })).rejects.toThrow(
      'INDEPENDENT_BENCHMARK_REQUIRED'
    );
    expect(f.adapter.execute).not.toHaveBeenCalled();
  });
  it('does not dispatch without an approval receipt', async () => {
    const f = await fixture();
    await expect(runVerifiedGraph({ ...f.options, approvalReceipt: undefined })).rejects.toThrow(
      'APPROVAL_RECEIPT_REQUIRED'
    );
    expect(f.adapter.execute).not.toHaveBeenCalled();
  });
  it('does not dispatch when the receipt lacks an OS sandbox', async () => {
    const f = await fixture();
    const unsafeReceipt = createCapabilityReceipt({
      host: 'codex',
      evaluatorVersion: '2',
      evaluationId: 'unsafe',
      evaluatedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      hostVersion: 'codex fixture',
      models: [{ id: 'fixture-model', reasoningEfforts: ['high'] }],
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'git-worktree',
      provenance: { evaluator: 'fixture', source: 'fixture', keyId: 'fixture-key' },
      signingKey: f.keys.privateKey,
    });
    await expect(
      runVerifiedGraph({ ...f.options, capabilityReceipt: unsafeReceipt })
    ).rejects.toThrow('LEDGER_CAPABILITY_AUTHORITY_REQUIRED');
    expect(f.adapter.execute).not.toHaveBeenCalled();
  });
  it('does not commit when the ledger refuses completion authority', async () => {
    const f = await fixture();
    f.options.ledger.authorizeCommit.mockResolvedValue({ allowed: false });
    const result = await runVerifiedGraph(f.options);
    expect(result.states.T001).toBe('blocked');
    expect(f.options.ledger.authorizeCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'T001',
        inputRevision: 'input-1',
        leaseId: 'fixture-lease',
      })
    );
    expect(f.adapter.verified).not.toHaveBeenCalled();
  });
  it('retains all scope protection by aborting the run after unresolved cleanup', async () => {
    const f = await fixture({ parallel: true, conflict: true });
    f.adapter.check.mockImplementation(async (r: any) => ({
      ...r,
      executed: true,
      exitCode: 1,
      cleanupVerified: false,
      receipt: 'unresolved-process',
    }));
    const result = await runVerifiedGraph(f.options);
    expect(result.status).toBe('incomplete');
    expect(result.states).toEqual({ T001: 'blocked', T002: 'pending' });
    expect(f.adapter.execute.mock.calls.map(([r]: any) => r.taskId)).toEqual(['T001']);
  });
  it('never retries or runs another check when child cleanup is unverified', async () => {
    const f = await fixture();
    f.options.checks.T001.push('second');
    f.adapter.check.mockImplementation(async (r: any) => ({
      ...r,
      executed: true,
      exitCode: 1,
      cleanupVerified: false,
      receipt: 'unresolved-process',
    }));
    const result = await runVerifiedGraph(f.options);
    expect(result.attempts.T001).toBe(1);
    expect(f.adapter.execute).toHaveBeenCalledOnce();
    expect(f.adapter.check).toHaveBeenCalledOnce();
    expect(result.states.T001).toBe('blocked');
  });
  it('feeds real failing acceptance evidence into a bounded repair', async () => {
    const f = await fixture();
    f.adapter.check = createAcceptanceChecker({
      workspaceRoot: f.root,
      evidenceDir: path.join(f.root, 'evidence'),
      getInputRevision: f.adapter.inputRevision,
      verifyCleanup: async (r: any) => ({
        ...r,
        allStopped: true,
        receipt: 'fixture-process-check',
      }),
      commands: {
        acceptance: {
          program: process.execPath,
          args: ['-e', 'const fs=require("fs"); process.exit(fs.existsSync("fixed.txt") ? 0 : 1)'],
        },
      },
    });
    f.adapter.execute.mockImplementation(async (r: any) => {
      if (r.attempt === 2) {
        expect(r.previousChecks).toHaveLength(1);
        expect(r.previousChecks[0].passed).toBe(false);
        const receipt = JSON.parse(await readFile(r.previousChecks[0].receipt, 'utf8'));
        expect(receipt.executed).toBe(true);
        expect(receipt.exitCode).toBe(1);
        await writeFile(path.join(f.root, 'fixed.txt'), 'fixture state, not native output');
      }
      return { changedFiles: [] };
    });
    const result = await runVerifiedGraph(f.options);
    expect(result.status).toBe('verified');
    expect(result.attempts.T001).toBe(2);
  });
  it('does not redispatch affected work while a business answer is pending', async () => {
    const f = await fixture();
    await applyBlockerEvent(f.root, {
      action: 'open',
      goalKey: 'feature',
      subjectKey: 'decision',
      conditionKey: 'storage-choice',
      category: 'decision',
      owner: 'user',
      question: 'Which approved choice?',
      requiredChange: 'User decision',
      tasks: ['T001'],
    });
    expect((await runVerifiedGraph(f.options)).states.T001).toBe('blocked');
    expect(f.adapter.reserve).not.toHaveBeenCalled();
    expect(f.adapter.execute).not.toHaveBeenCalled();
  });
  it.each(['reserve', 'check'])(
    'stops when a business blocker arrives during %s',
    async (method) => {
      const f = await fixture();
      const original = f.adapter[method].getMockImplementation()!;
      f.adapter[method].mockImplementation(async (request: any) => {
        await applyBlockerEvent(f.root, {
          action: 'open',
          goalKey: 'feature',
          subjectKey: 'decision',
          conditionKey: 'late-decision',
          category: 'decision',
          owner: 'user',
          question: 'Which choice?',
          requiredChange: 'User decision',
          tasks: ['T001'],
        });
        return original(request);
      });
      const result = await runVerifiedGraph(f.options);
      expect(result.states.T001).toBe('blocked');
      expect(f.adapter.verified).not.toHaveBeenCalled();
      if (method === 'reserve') expect(f.adapter.execute).not.toHaveBeenCalled();
    }
  );
  it('waits for verified prerequisites and never claims feature completion', async () => {
    const f = await fixture();
    const result = await runVerifiedGraph(f.options);
    expect(result.states).toEqual({ T001: 'verified', T002: 'verified' });
    expect(result.featureComplete).toBe(false);
    expect(result.cost).toBeNull();
    expect(f.adapter.execute.mock.calls.map(([r]: any) => r.taskId)).toEqual(['T001', 'T002']);
    expect(f.options.ledger.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        budgetReservation: 'fixture-budget',
        leaseId: 'fixture-lease',
        allowedEditScope: ['a.txt'],
        requiredChecks: ['acceptance'],
      })
    );
  });
  it('does not execute a task without a finite, unexpired lease and writes a delta checkpoint', async () => {
    const f = await fixture();
    f.adapter.lease.mockResolvedValueOnce({
      leaseId: 'expired',
      expiresAt: new Date(Date.now() - 1).toISOString(),
    });
    const blocked = await runVerifiedGraph(f.options);
    expect(blocked.states.T001).toBe('blocked');
    expect(f.adapter.execute).not.toHaveBeenCalled();
    await rm(path.join(f.root, 'verified-execution.jsonl'));
    const fresh = await fixture();
    const result = await runVerifiedGraph(fresh.options);
    expect(result.status).toBe('verified');
    expect(
      JSON.parse(
        await readFile(path.join(fresh.root, 'verified-execution.checkpoint.json'), 'utf8')
      )
    ).toMatchObject({
      revision: result.revision,
      delta: { event: 'finished' },
      states: { T001: 'verified', T002: 'verified' },
    });
  });
  it('does not accept a good worker answer when acceptance fails', async () => {
    const f = await fixture();
    f.adapter.check.mockImplementation(async (r: any) => ({
      ...r,
      executed: true,
      exitCode: 1,
      receipt: 'failing-test',
    }));
    const result = await runVerifiedGraph(f.options);
    expect(result.status).toBe('incomplete');
    expect(result.attempts.T001).toBe(2);
    expect(result.states.T002).toBe('pending');
    expect(f.adapter.verified).not.toHaveBeenCalled();
  });
  it('runs a bounded repair and records every check', async () => {
    const f = await fixture();
    f.adapter.check.mockImplementation(async (r: any) => ({
      ...r,
      executed: true,
      exitCode: r.attempt === 1 ? 1 : 0,
      receipt: 'test-output',
    }));
    const result = await runVerifiedGraph(f.options);
    expect(result.status).toBe('verified');
    expect(result.attempts).toEqual({ T001: 2, T002: 2 });
    const events = (await readFile(path.join(f.root, 'verified-execution.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse);
    expect(events.filter((e: any) => e.event === 'check')).toHaveLength(4);
  });
  it('requires every check, not a majority vote', async () => {
    const f = await fixture();
    f.options.checks.T001.push('security');
    f.adapter.check.mockImplementation(async (r: any) => ({
      ...r,
      executed: true,
      exitCode: r.check === 'security' ? 1 : 0,
      receipt: 'test-output',
    }));
    expect((await runVerifiedGraph(f.options)).states.T001).toBe('blocked');
  });
  it('rejects evidence for a different input revision', async () => {
    const f = await fixture();
    f.adapter.check.mockImplementation(async (r: any) => ({
      ...r,
      inputRevision: 'old',
      executed: true,
      exitCode: 0,
      receipt: 'old-test',
    }));
    expect((await runVerifiedGraph(f.options)).status).toBe('incomplete');
  });
  it('rejects work after direction changes', async () => {
    const f = await fixture();
    f.adapter.execute.mockImplementation(async () => {
      await writeFile(path.join(f.root, 'spec.md'), 'Changed goal');
      return { changedFiles: [] };
    });
    expect((await runVerifiedGraph(f.options)).states.T001).toBe('stale');
    expect(f.adapter.check).not.toHaveBeenCalled();
  });
  it('rejects changes outside the approved scope', async () => {
    const f = await fixture();
    f.adapter.execute.mockResolvedValue({ changedFiles: ['other.txt'] });
    expect((await runVerifiedGraph(f.options)).states.T001).toBe('blocked');
    expect(f.adapter.verified).not.toHaveBeenCalled();
  });
  it('honours blocker denial without running the worker', async () => {
    const f = await fixture();
    f.adapter.reserve.mockResolvedValue({ allowed: false });
    expect((await runVerifiedGraph(f.options)).status).toBe('incomplete');
    expect(f.adapter.execute).not.toHaveBeenCalled();
  });
  it('shares a call limit across parallel workers', async () => {
    const f = await fixture({ parallel: true });
    const result = await runVerifiedGraph({ ...f.options, maxCalls: 3 });
    expect(result.calls).toBeLessThanOrEqual(3);
    expect(result.status).toBe('incomplete');
  });
  it('does not repeat a run with an existing journal', async () => {
    const f = await fixture();
    await runVerifiedGraph(f.options);
    await expect(runVerifiedGraph(f.options)).rejects.toThrow('RECONCILIATION_REQUIRED');
  });
  it('honours pre-cancellation without executing work', async () => {
    const f = await fixture();
    const abort = new AbortController();
    abort.abort();
    expect((await runVerifiedGraph({ ...f.options, signal: abort.signal })).status).toBe(
      'incomplete'
    );
    expect(f.adapter.execute).not.toHaveBeenCalled();
  });
  it('reports an unsettled child only if the deadline reached a running adapter', async () => {
    const f = await fixture();
    f.adapter.execute.mockImplementation(() => new Promise(() => {}));
    const result = await runVerifiedGraph({
      ...f.options,
      deadlineMs: Date.now() + 150,
      adapterDrainMs: 50,
    });
    expect(result.states.T001).toBe('cancelled');
    expect(result.status).toBe('incomplete');
    // Under a busy CI runner, the deadline can expire before execute starts.
    // In that case there is no child call to drain.
    expect(result.adapterCallsSettled).toBe(f.adapter.execute.mock.calls.length === 0);
  });
  it('waits for a cancelled trusted adapter call to settle before returning', async () => {
    const f = await fixture();
    const abort = new AbortController();
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let cleanupFinished = false;
    f.adapter.execute.mockImplementation(async (request: any) => {
      started();
      await new Promise<void>((resolve) =>
        request.signal.addEventListener(
          'abort',
          () => {
            setTimeout(() => {
              cleanupFinished = true;
              resolve();
            }, 40);
          },
          { once: true }
        )
      );
      return { changedFiles: [] };
    });
    const run = runVerifiedGraph({ ...f.options, signal: abort.signal, adapterDrainMs: 1000 });
    await entered;
    abort.abort();
    const result = await run;
    expect(cleanupFinished).toBe(true);
    expect(result.adapterCallsSettled).toBe(true);
    expect(result.status).toBe('incomplete');
  });
  it('serializes overlapping write scopes', async () => {
    const f = await fixture({ parallel: true, conflict: true });
    let active = 0;
    let peak = 0;
    f.adapter.execute.mockImplementation(async () => {
      active++;
      peak = Math.max(active, peak);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return { changedFiles: [] };
    });
    expect((await runVerifiedGraph(f.options)).status).toBe('verified');
    expect(peak).toBe(1);
  });
  it('executes independent real local processes concurrently (not models)', async () => {
    const f = await fixture({ parallel: true });
    let active = 0;
    let peak = 0;
    const run = promisify(execFile);
    f.adapter.execute.mockImplementation(async () => {
      active++;
      peak = Math.max(active, peak);
      await run(process.execPath, ['-e', 'setTimeout(() => process.stdout.write("worked"), 80)']);
      active--;
      return { changedFiles: [] };
    });
    f.adapter.check.mockImplementation(async (r: any) => {
      const { stdout } = await run(process.execPath, ['-e', 'process.stdout.write("PASS")']);
      return {
        ...r,
        executed: true,
        exitCode: stdout === 'PASS' ? 0 : 1,
        receipt: 'local-process-stdout:PASS',
      };
    });
    // Serialize only the tasks.md read-modify-write in this trusted fixture adapter.
    let update = Promise.resolve();
    f.adapter.verified.mockImplementation((request: any) => {
      update = update.then(async () => {
        await request.assertCurrent();
        const p = path.join(f.root, 'tasks.md');
        await writeFile(
          p,
          (await readFile(p, 'utf8')).replace(`[ ] ${request.taskId}`, `[x] ${request.taskId}`)
        );
      });
      return update.then(() => ({
        committed: true,
        taskId: request.taskId,
        revision: request.revision,
        inputRevision: request.inputRevision,
        receipt: 'local-commit',
      }));
    });
    expect((await runVerifiedGraph(f.options)).status).toBe('verified');
    expect(peak).toBe(2);
  });
  it('rejects cyclic, unknown, and empty-check work orders', async () => {
    const f = await fixture();
    f.plan.tasks.T001.dependsOn.push('T002');
    expect(() => validateWorkGraph(f.plan, f.options.checks)).toThrow('CYCLIC_GRAPH');
    f.plan.tasks.T001.dependsOn = ['T999'];
    expect(() => validateWorkGraph(f.plan, f.options.checks)).toThrow('INVALID_WORK_ORDER');
    f.plan.tasks.T001.dependsOn = [];
    f.options.checks.T001 = [];
    expect(() => validateWorkGraph(f.plan, f.options.checks)).toThrow('INVALID_WORK_ORDER');
  });
  it('accepts the goal-led priority-plan schema that the priority checker supports', async () => {
    const f = await fixture();
    f.plan.schemaVersion = 2;
    f.plan.decisionPolicy = { mode: 'goal-led', askOnlyFor: ['missing authority'] };
    await writeFile(path.join(f.root, 'priority-plan.json'), JSON.stringify(f.plan));
    expect((await runVerifiedGraph(f.options)).status).toBe('verified');
  });
  it('bounds graph edges and edit scopes before execution', async () => {
    const f = await fixture();
    f.plan.tasks.T001.dependsOn = Array.from({ length: 257 }, () => 'T002');
    expect(() => validateWorkGraph(f.plan, f.options.checks)).toThrow('INVALID_WORK_ORDER');
    f.plan.tasks.T001.dependsOn = [];
    f.plan.tasks.T001.allowedEditScope = Array.from(
      { length: 257 },
      (_, index) => `safe-${index}.txt`
    );
    expect(() => validateWorkGraph(f.plan, f.options.checks)).toThrow('INVALID_WORK_ORDER');
  });
  it('rejects missing limits and unsupported spend caps', async () => {
    const f = await fixture();
    await expect(runVerifiedGraph({ ...f.options, maxCalls: Infinity })).rejects.toThrow(
      'FINITE_LIMITS'
    );
    await writeFile(
      path.join(f.root, 'loop-contract.json'),
      JSON.stringify({ maxIterations: 2, budget: { maxModelSpendUsd: 2 } })
    );
    await expect(runVerifiedGraph(f.options)).rejects.toThrow('SPEND_RESERVATION_NOT_IMPLEMENTED');
  });
  it('does not trust previously completed checkboxes as fresh evidence', async () => {
    const f = await fixture();
    await writeFile(path.join(f.root, 'tasks.md'), '- [x] T001: First\n- [x] T002: Second\n');
    await expect(runVerifiedGraph(f.options)).rejects.toThrow(
      'BASELINE_EVIDENCE_RECONCILIATION_REQUIRED'
    );
  });
  it('keeps required checks if the caller changes the original array', async () => {
    const f = await fixture();
    f.adapter.execute.mockImplementation(async () => {
      f.options.checks.T001.length = 0;
      return { changedFiles: [] };
    });
    expect((await runVerifiedGraph(f.options)).status).toBe('verified');
    expect(f.adapter.check.mock.calls.some(([r]: any) => r.taskId === 'T001')).toBe(true);
  });
  it('rejects noncanonical scope aliases before execution', async () => {
    const f = await fixture();
    f.plan.tasks.T001.allowedEditScope = ['src//'];
    expect(() => validateWorkGraph(f.plan, f.options.checks)).toThrow('INVALID_WORK_ORDER');
  });
  it('rejects input changes during completion and requires reconciliation', async () => {
    const f = await fixture();
    f.adapter.verified.mockImplementation(async (r: any) => {
      f.adapter.inputRevision.mockResolvedValue('changed-input');
      return {
        committed: true,
        taskId: r.taskId,
        revision: r.revision,
        inputRevision: r.inputRevision,
        receipt: 'uncertain-commit',
      };
    });
    expect((await runVerifiedGraph(f.options)).states.T001).toBe('stale');
  });
  it('does not start dependent work using stale prerequisite evidence', async () => {
    const f = await fixture();
    const original = f.adapter.verified.getMockImplementation()!;
    f.adapter.verified.mockImplementation(async (request: any) => {
      const result = await original(request);
      if (request.taskId === 'T001') f.adapter.inputRevision.mockResolvedValue('changed-input');
      return result;
    });
    const result = await runVerifiedGraph(f.options);
    expect(result.status).toBe('incomplete');
    expect(result.states.T002).toBe('pending');
    expect(f.adapter.execute.mock.calls.map(([request]: any) => request.taskId)).toEqual(['T001']);
  });
  it('rechecks direction after admission is persisted and before dispatch', async () => {
    const f = await fixture();
    const original = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises'))
      .open;
    let writes = 0;
    vi.spyOn(filesystem, 'open').mockImplementation(async (...args: any[]) => {
      const handle = await (original as any)(...args);
      if (String(args[0]).endsWith('verified-execution.jsonl')) {
        const sync = handle.sync.bind(handle);
        handle.sync = async () => {
          await sync();
          if (++writes === 3) await writeFile(path.join(f.root, 'spec.md'), 'New direction');
        };
      }
      return handle;
    });
    expect((await runVerifiedGraph(f.options)).states.T001).toBe('stale');
    expect(f.adapter.execute).not.toHaveBeenCalled();
  });
  it('closes the journal and cancels siblings when persistence fails', async () => {
    const f = await fixture({ parallel: true });
    const original = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises'))
      .open;
    let closed = false;
    let writes = 0;
    const signals: AbortSignal[] = [];
    f.adapter.execute.mockImplementation(async (r: any) => {
      signals.push(r.signal);
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { changedFiles: [] };
    });
    vi.spyOn(filesystem, 'open').mockImplementation(async (...args: any[]) => {
      const handle = await (original as any)(...args);
      if (String(args[0]).endsWith('verified-execution.jsonl')) {
        const sync = handle.sync.bind(handle);
        const close = handle.close.bind(handle);
        handle.sync = async () => {
          // Admission, ledger authority, and lease grants add durable records
          // before dispatch. Fail only after both independently scheduled
          // workers have started and can observe cancellation.
          if (++writes > 16) throw new Error('disk failure');
          await sync();
        };
        handle.close = async () => {
          closed = true;
          await close();
        };
      }
      return handle;
    });
    await expect(runVerifiedGraph(f.options)).rejects.toThrow('JOURNAL_FAILURE');
    expect(closed).toBe(true);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
  it('does not dispatch a worker when cancellation arrives during final admission reads', async () => {
    const f = await fixture();
    const abort = new AbortController();
    f.adapter.reserve.mockImplementation(async () => {
      // This occurs after the reservation receipt is durable but before dispatch.
      abort.abort();
      return { allowed: true };
    });
    expect((await runVerifiedGraph({ ...f.options, signal: abort.signal })).status).toBe(
      'incomplete'
    );
    expect(f.adapter.execute).not.toHaveBeenCalled();
  });
});
