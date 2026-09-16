import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { createCapabilityReceipt } from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import { selectCapabilityRoute } from '../../../.specify/scripts/node/gofer-live-routing.mjs';

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
    const route = await selectCapabilityRoute({
      receipt,
      publicKey: keys.publicKey,
      host: 'antigravity',
      now: Date.parse('2026-09-17T00:01:00Z'),
      requiredCapabilities: { reasoningEfforts: ['high'] },
      advisoryConstraints: { reasoningEfforts: ['high'] },
      benchmarkEvidence: {
        results: [
          {
            modelId: 'model-high',
            receiptHash: (
              await import('../../../.specify/scripts/node/gofer-host-capability.mjs')
            ).capabilityReceiptHash(receipt),
            functionalVerified: true,
            reliability: 1,
            costUsd: 0.1,
          },
        ],
      },
      verifyBenchmark: async ({ receiptHash }) => ({
        valid: true,
        receiptHash,
        receipt: 'benchmark-verifier-receipt',
      }),
    });
    expect(route).toMatchObject({
      model: { id: 'model-high' },
      authority: 'live-capability-and-independent-benchmark',
    });
  });

  it('rejects a caller-supplied benchmark result without an independent verifier', async () => {
    await expect(selectCapabilityRoute({ benchmarkEvidence: { results: [] } })).rejects.toThrow(
      'LIVE_RECEIPT_REQUIRED'
    );
  });
});
