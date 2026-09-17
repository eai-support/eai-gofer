import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTrustedBenchmarkEvidence } from '../../../.specify/scripts/node/gofer-trusted-benchmark.mjs';

const trusted = vi.hoisted(() => ({ key: null as KeyObject | null, options: null as unknown }));
vi.mock('../../../.specify/scripts/node/gofer-trusted-evaluator.mjs', () => ({
  resolveTrustedEvaluatorPublicKey: async (_receipt: unknown, options: unknown) => {
    trusted.options = options;
    if (!trusted.key) throw new Error('TRUSTED_EVALUATOR_REQUIRED');
    return trusted.key;
  },
}));
afterEach(() => {
  trusted.key = null;
  trusted.options = null;
});

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'gofer-benchmark-trust-'));
  const workspaceRoot = path.join(root, 'repository');
  await mkdir(workspaceRoot);
  const keys = generateKeyPairSync('ed25519');
  trusted.key = keys.publicKey;
  const capabilityKeys = generateKeyPairSync('ed25519');
  const evidence = { schemaVersion: 2, runs: [{ receipt: 'worker-1', functionalVerified: true }] };
  const receiptHash = 'a'.repeat(64);
  const now = Date.now();
  const payload = {
    schemaVersion: 1,
    host: 'codex',
    capabilityReceiptHash: receiptHash,
    evidenceHash: hash(evidence),
    verification: 'functional-tests+independent-review',
    verifierVersion: '1',
    verifiedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60000).toISOString(),
    provenance: {
      evaluator: 'gofer-heldout-benchmark-verifier',
      keyId: 'benchmark-key',
      source: 'private-corpus',
    },
  };
  const attestation = {
    ...payload,
    signature: {
      algorithm: 'ed25519',
      keyId: 'benchmark-key',
      value: sign(null, Buffer.from(JSON.stringify(payload)), keys.privateKey).toString(
        'base64url'
      ),
    },
  };
  const request = {
    host: 'codex',
    receiptHash,
    evidence,
    attestation,
    capabilityKeyId: 'capability-key',
    capabilityPublicKey: capabilityKeys.publicKey,
    workspaceRoot,
    now,
  };
  return { root, request, benchmarkPublicKey: keys.publicKey };
}

describe.skipIf(process.platform === 'win32')('trusted benchmark evidence', () => {
  it('accepts only a report bound to a registered, separate verifier key', async () => {
    const f = await fixture();
    try {
      await expect(verifyTrustedBenchmarkEvidence(f.request)).resolves.toMatchObject({
        valid: true,
        receiptHash: f.request.receiptHash,
      });
      await verifyTrustedBenchmarkEvidence({
        ...f.request,
        trustRoot: path.join(f.root, 'untrusted'),
      });
      expect(trusted.options).toEqual({ workspaceRoot: f.request.workspaceRoot });
      await expect(
        verifyTrustedBenchmarkEvidence({
          ...f.request,
          evidence: { ...f.request.evidence, costUsd: 0 },
        })
      ).rejects.toThrow('TRUSTED_BENCHMARK_REQUIRED');
      await expect(
        verifyTrustedBenchmarkEvidence({ ...f.request, capabilityKeyId: 'benchmark-key' })
      ).rejects.toThrow('TRUSTED_BENCHMARK_REQUIRED');
      await expect(
        verifyTrustedBenchmarkEvidence({ ...f.request, capabilityPublicKey: f.benchmarkPublicKey })
      ).rejects.toThrow('TRUSTED_BENCHMARK_REQUIRED');
      await expect(
        verifyTrustedBenchmarkEvidence({ ...f.request, now: f.request.now + 120000 })
      ).rejects.toThrow('TRUSTED_BENCHMARK_REQUIRED');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it('rejects an unsigned caller verdict and a forged signature', async () => {
    const f = await fixture();
    try {
      await expect(
        verifyTrustedBenchmarkEvidence({ ...f.request, attestation: undefined })
      ).rejects.toThrow('TRUSTED_BENCHMARK_REQUIRED');
      await expect(
        verifyTrustedBenchmarkEvidence({
          ...f.request,
          attestation: {
            ...f.request.attestation,
            signature: {
              ...f.request.attestation.signature,
              value: 'forged',
            },
          },
        })
      ).rejects.toThrow('TRUSTED_BENCHMARK_REQUIRED');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
