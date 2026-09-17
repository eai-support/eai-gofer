import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  capabilityReceiptHash,
  createCapabilityReceipt,
} from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import { selectCapabilityRoute } from '../../../.specify/scripts/node/gofer-live-routing.mjs';
import { runBenchmark } from '../../../.specify/scripts/node/gofer-benchmark.mjs';

async function verifiedBenchmark(receipt: ReturnType<typeof createCapabilityReceipt>) {
  return runBenchmark({
    cases: [{ id: 'case-1', heldOut: true, input: { task: 'repair' } }],
    provenance: {
      harnessId: 'held-out',
      modelId: 'model-high',
      capabilityReceiptHash: capabilityReceiptHash(receipt),
    },
    execute: async ({ run }) => ({
      modelId: 'model-high',
      costUsd: 0.1,
      durationMs: 10,
      receipt: `execution-${run}`,
    }),
    verify: async ({ caseId, run, inputHash, execution }) => ({
      caseId,
      run,
      inputHash,
      executionReceipt: execution.receipt,
      passed: true,
      receipt: `verifier-${run}`,
      verifierId: 'independent-verifier',
      failureClassification: 'none',
      reviewReceipt: `review-${run}`,
    }),
  });
}

describe('live capability routing', () => {
  it('routes only a signed, fresh receipt with independently verified benchmark evidence', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'antigravity',
      evaluatorVersion: '2.0.0',
      evaluationId: 'eval-1',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-17T01:00:00.000Z',
      hostVersion: 'agy 1.2.4',
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'worktree',
      provenance: { evaluator: 'native', source: 'agy models', keyId: 'key-1' },
      signingKey: keys.privateKey,
      models: [
        { id: 'model-low', reasoningEfforts: ['low'] },
        { id: 'model-high', reasoningEfforts: ['high'] },
      ],
    });
    const benchmarkEvidence = await verifiedBenchmark(receipt);
    const route = await selectCapabilityRoute({
      receipt,
      publicKey: keys.publicKey,
      host: 'antigravity',
      now: Date.parse('2026-09-17T00:01:00Z'),
      requiredCapabilities: { reasoningEfforts: ['high'] },
      advisoryConstraints: { reasoningEfforts: ['high'] },
      benchmarkEvidence,
      verifyBenchmark: async ({ receiptHash }) => ({
        valid: true,
        receiptHash,
        receipt: 'benchmark-verifier-receipt',
      }),
    });
    expect(route).toMatchObject({
      model: { id: 'model-high' },
      authority: 'live-capability-and-independent-benchmark',
      benchmark: { reliability: 1 },
    });
    expect(route.benchmark.costUsd).toBeCloseTo(0.3);
  });

  it('rejects a caller-supplied benchmark result without an independent verifier', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'antigravity',
      evaluatorVersion: '2.0.0',
      evaluationId: 'eval-2',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-17T01:00:00.000Z',
      hostVersion: 'agy 1.2.4',
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'worktree',
      provenance: { evaluator: 'native', source: 'agy models', keyId: 'key-2' },
      signingKey: keys.privateKey,
      models: [{ id: 'model-high', reasoningEfforts: ['high'] }],
    });
    const benchmarkEvidence = await verifiedBenchmark(receipt);
    await expect(
      selectCapabilityRoute({
        receipt,
        publicKey: keys.publicKey,
        host: 'antigravity',
        now: Date.parse('2026-09-17T00:01:00Z'),
        requiredCapabilities: { reasoningEfforts: ['high'] },
        benchmarkEvidence,
      })
    ).rejects.toThrow('INDEPENDENT_BENCHMARK_REQUIRED');
    await expect(
      selectCapabilityRoute({
        receipt,
        publicKey: keys.publicKey,
        host: 'antigravity',
        now: Date.parse('2026-09-17T00:01:00Z'),
        benchmarkEvidence: { results: [{ modelId: 'model-high', reliability: 1 }] },
        verifyBenchmark: async () => ({
          valid: true,
          receiptHash: capabilityReceiptHash(receipt),
          receipt: 'claimed-verifier',
        }),
      })
    ).rejects.toThrow('INDEPENDENT_BENCHMARK_REQUIRED');
  });

  it('rejects impossible caller-supplied benchmark metrics', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'antigravity',
      evaluatorVersion: '2.0.0',
      evaluationId: 'eval-1',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-17T01:00:00.000Z',
      hostVersion: 'agy 1.2.4',
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'worktree',
      provenance: { evaluator: 'native', source: 'agy models', keyId: 'key-1' },
      signingKey: keys.privateKey,
      models: [{ id: 'model-high', reasoningEfforts: ['high'] }],
    });
    const benchmarkEvidence = await verifiedBenchmark(receipt);
    await expect(
      selectCapabilityRoute({
        receipt,
        publicKey: keys.publicKey,
        host: 'antigravity',
        now: Date.parse('2026-09-17T00:01:00Z'),
        requiredCapabilities: { reasoningEfforts: ['high'] },
        benchmarkEvidence: { ...benchmarkEvidence, reliability: 1.1, costUsd: -1 },
        verifyBenchmark: async ({ receiptHash }) => ({
          valid: true,
          receiptHash,
          receipt: 'benchmark-verifier-receipt',
        }),
      })
    ).rejects.toThrow('NO_VERIFIED_BENCHMARK_MATCH');
  });
});
