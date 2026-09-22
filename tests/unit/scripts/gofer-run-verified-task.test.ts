import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createCapabilityReceipt } from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import { createIsolationRepository, localIsolationReport } from './local-isolation-fixture.js';

const runGraph = vi.hoisted(() => vi.fn());
const issueReceipt = vi.hoisted(() => vi.fn());
const trustedKey = vi.hoisted(() => ({ value: null as KeyObject | null }));

vi.mock('../../../.specify/scripts/node/gofer-verified-execution.mjs', () => ({
  runVerifiedGraph: runGraph,
}));
vi.mock('../../../.specify/scripts/node/gofer-trusted-evaluator.mjs', () => ({
  resolveTrustedEvaluatorPublicKey: async () => trustedKey.value,
}));
vi.mock('../../../.specify/scripts/node/gofer-local-capability-issuer.mjs', () => ({
  issueLocalCapabilityReceipt: issueReceipt,
}));
vi.mock('../../../.specify/scripts/node/gofer-local-isolation.mjs', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    inspectEaiLocalIsolation: async ({ workspaceRoot }: { workspaceRoot: string }) =>
      localIsolationReport(workspaceRoot),
  };
});

describe('verified native runtime command entrypoint', () => {
  it('fails closed with no dispatch when no local trust identity is registered', async () => {
    const { source, cleanup } = createIsolationRepository();
    try {
      issueReceipt.mockRejectedValueOnce(new Error('TRUSTED_EVALUATOR_REQUIRED'));
      const { runVerifiedSmokeTask } =
        await import('../../../.specify/scripts/node/gofer-run-verified-task.mjs');
      await expect(runVerifiedSmokeTask({ workspace: source })).rejects.toThrow(
        'TRUSTED_EVALUATOR_REQUIRED'
      );
      expect(runGraph).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('dispatches one real ledger-authorized task through the isolated worktree', async () => {
    const { source, cleanup } = createIsolationRepository();
    try {
      const keys = generateKeyPairSync('ed25519');
      trustedKey.value = keys.publicKey;
      const now = Date.now();
      const receipt = createCapabilityReceipt({
        host: 'codex',
        evaluatorVersion: '2',
        evaluationId: 'smoke',
        evaluatedAt: new Date(now - 1000).toISOString(),
        expiresAt: new Date(now + 60000).toISOString(),
        hostVersion: 'codex',
        models: [{ id: 'live', reasoningEfforts: ['high'] }],
        reasoningCapabilities: ['high'],
        toolCapabilities: ['shell'],
        grantedPermissions: ['workspace-write'],
        isolationClass: 'git-worktree+local-os-sandbox',
        provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
        signingKey: keys.privateKey,
      });
      issueReceipt.mockResolvedValueOnce(receipt);
      runGraph.mockImplementationOnce(async ({ adapter, workspaceRoot }) => {
        // Prove reserve/lease genuinely proxy to the real ledger, not a stub:
        // the same request object must produce a matching reservation digest.
        const request = { taskId: 'T001', revision: 'r1', attempt: 1 };
        const reservation = await adapter.reserve(request);
        expect(reservation).toMatchObject({ allowed: true, taskId: 'T001' });
        const lease = await adapter.lease(request);
        expect(lease).toMatchObject({ allowed: true, taskId: 'T001' });
        // Simulate the worker producing the requested file before the graph
        // engine asks the adapter to check and then commit it.
        await writeFile(
          path.join(workspaceRoot, 'NATIVE_SMOKE_PROOF.md'),
          'native wiring smoke test passed.\n'
        );
        const inputRevision = await adapter.inputRevision({});
        const evidence = await adapter.check({
          taskId: 'T001',
          revision: inputRevision,
          inputRevision,
          check: 'smoke-file-check',
        });
        expect(evidence).toMatchObject({ taskId: 'T001', exitCode: 0, executed: true });
        const commit = await adapter.verified({
          taskId: 'T001',
          revision: inputRevision,
          inputRevision,
        });
        expect(commit).toMatchObject({ committed: true, taskId: 'T001' });
        return { status: 'verified', adapterCallsSettled: true };
      });
      const { runVerifiedSmokeTask } =
        await import('../../../.specify/scripts/node/gofer-run-verified-task.mjs');
      const result = await runVerifiedSmokeTask({ workspace: source });
      expect(result).toMatchObject({ status: 'verified', adapterCallsSettled: true });
      expect(runGraph).toHaveBeenCalledTimes(1);
      // The verified task worktree is disposed, and its output is kept as evidence.
      const worktrees = execFileSync('git', ['-C', source, 'worktree', 'list', '--porcelain'], {
        encoding: 'utf8',
      });
      expect(worktrees).not.toContain('gofer-isolated-worktree-');
      expect(
        await readFile(
          path.join(
            source,
            '.specify',
            'specs',
            'native-runtime-smoke',
            'evidence',
            'NATIVE_SMOKE_PROOF.md'
          ),
          'utf8'
        )
      ).toBe('native wiring smoke test passed.\n');
      const ledgerPath = path.join(
        source,
        '.specify',
        'specs',
        'native-runtime-smoke',
        'runtime-ledger.jsonl'
      );
      const ledgerContents = await readFile(ledgerPath, 'utf8');
      expect(ledgerContents.trim().split('\n').filter(Boolean).length).toBeGreaterThan(0);
      const plan = JSON.parse(
        await readFile(
          path.join(source, '.specify', 'specs', 'native-runtime-smoke', 'priority-plan.json'),
          'utf8'
        )
      );
      expect(plan.schemaVersion).toBe(2);
      expect(plan.tasks.T001).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it('routes by a supplied receipt and signed benchmark, and does not issue its own receipt', async () => {
    const { source, cleanup } = createIsolationRepository();
    try {
      const keys = generateKeyPairSync('ed25519');
      trustedKey.value = keys.publicKey;
      const now = Date.now();
      const receipt = createCapabilityReceipt({
        host: 'codex',
        evaluatorVersion: '2',
        evaluationId: 'supplied',
        evaluatedAt: new Date(now - 1000).toISOString(),
        expiresAt: new Date(now + 60000).toISOString(),
        hostVersion: 'codex',
        models: [{ id: 'live', reasoningEfforts: ['high'] }],
        reasoningCapabilities: ['high'],
        toolCapabilities: ['shell'],
        grantedPermissions: ['workspace-write'],
        isolationClass: 'git-worktree+local-os-sandbox',
        provenance: { evaluator: 'native', source: 'session', keyId: 'key' },
        signingKey: keys.privateKey,
      });
      issueReceipt.mockClear();
      let seen: Record<string, unknown> = {};
      runGraph.mockImplementationOnce(async (input) => {
        seen = input;
        return { status: 'verified', adapterCallsSettled: true };
      });
      const benchmark = { evidence: { schemaVersion: 2 }, attestation: { schemaVersion: 1 } };
      const { runVerifiedSmokeTask } =
        await import('../../../.specify/scripts/node/gofer-run-verified-task.mjs');
      await runVerifiedSmokeTask({ workspace: source, capabilityReceipt: receipt, benchmark });
      expect(issueReceipt).not.toHaveBeenCalled();
      expect(seen.capabilityReceipt).toEqual(receipt);
      expect(seen.benchmarkEvidence).toEqual(benchmark.evidence);
      expect(seen.maxCalls).toBeGreaterThanOrEqual(9);
      const feature = path.join(source, '.specify', 'specs', 'native-runtime-smoke');
      expect(await readFile(path.join(feature, 'plan.md'), 'utf8')).toContain('Plan');
      expect(
        JSON.parse(await readFile(path.join(feature, 'loop-contract.json'), 'utf8'))
      ).toMatchObject({
        maxIterations: 2,
      });
    } finally {
      cleanup();
    }
  });

  it('refuses a receipt without a benchmark, and a benchmark without a receipt', () => {
    const script = path.resolve('.specify/scripts/node/gofer-run-verified-task.mjs');
    for (const flag of ['--capability-receipt', '--benchmark']) {
      const result = spawnSync(process.execPath, [script, '--workspace', '/w', flag, '/x.json'], {
        encoding: 'utf8',
        timeout: 15000,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('must be given together');
    }
    const relative = spawnSync(
      process.execPath,
      [script, '--workspace', '/w', '--capability-receipt', 'r.json', '--benchmark', 'b.json'],
      { encoding: 'utf8', timeout: 15000 }
    );
    expect(relative.stderr).toContain('absolute paths');
  });
});
