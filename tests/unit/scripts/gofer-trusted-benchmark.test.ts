import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTrustedBenchmarkEvidence } from '../../../.specify/scripts/node/gofer-trusted-benchmark.mjs';
import { runBenchmark } from '../../../.specify/scripts/node/gofer-benchmark.mjs';

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
  const receiptHash = 'a'.repeat(64);
  const evidence = await runBenchmark({
    cases: ['bug-fix', 'refactor', 'cross-service-contract', 'security-sensitive'].map((id) => ({
      id,
      heldOut: true,
      input: { id },
    })),
    repetitions: 3,
    provenance: {
      harnessId: 'test-harness',
      modelId: 'test-model',
      corpusHash: 'b'.repeat(64),
      capabilityReceiptHash: receiptHash,
    },
    execute: async ({ id, run }) => ({
      modelId: 'test-model',
      costUsd: 0.01,
      durationMs: 10,
      receipt: hash({ id, run, kind: 'execution' }),
    }),
    verify: async ({ caseId, run, inputHash, execution }) => ({
      caseId,
      run,
      inputHash,
      executionReceipt: execution.receipt,
      passed: true,
      receipt: hash({ caseId, run, kind: 'verification' }),
      verifierId: 'test-verifier',
      failureClassification: 'none',
      reviewReceipt: hash({ caseId, run, kind: 'review' }),
    }),
  });
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
  return {
    root,
    request,
    benchmarkPublicKey: keys.publicKey,
    benchmarkPrivateKey: keys.privateKey,
  };
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

  it('accepts a signed report set and rejects a different capability binding', async () => {
    const f = await fixture();
    try {
      const evidence = [f.request.evidence];
      const payload = { ...f.request.attestation, evidenceHash: hash(evidence) };
      delete (payload as { signature?: unknown }).signature;
      const attestation = {
        ...payload,
        signature: {
          algorithm: 'ed25519',
          keyId: 'benchmark-key',
          value: sign(null, Buffer.from(JSON.stringify(payload)), f.benchmarkPrivateKey).toString(
            'base64url'
          ),
        },
      };
      await expect(
        verifyTrustedBenchmarkEvidence({ ...f.request, evidence, attestation })
      ).resolves.toMatchObject({ valid: true });
      const rebound = {
        ...f.request.evidence,
        provenance: { ...f.request.evidence.provenance, capabilityReceiptHash: 'c'.repeat(64) },
      };
      const reboundPayload = { ...f.request.attestation, evidenceHash: hash(rebound) };
      delete (reboundPayload as { signature?: unknown }).signature;
      const reboundAttestation = {
        ...reboundPayload,
        signature: {
          algorithm: 'ed25519',
          keyId: 'benchmark-key',
          value: sign(
            null,
            Buffer.from(JSON.stringify(reboundPayload)),
            f.benchmarkPrivateKey
          ).toString('base64url'),
        },
      };
      await expect(
        verifyTrustedBenchmarkEvidence({
          ...f.request,
          evidence: rebound,
          attestation: reboundAttestation,
        })
      ).rejects.toThrow('TRUSTED_BENCHMARK_REQUIRED');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it('rejects a validly signed report with missing runs or false totals', async () => {
    const f = await fixture();
    try {
      const keys = generateKeyPairSync('ed25519');
      trusted.key = keys.publicKey;
      for (const evidence of [
        { ...f.request.evidence, runs: f.request.evidence.runs.slice(1) },
        { ...f.request.evidence, functionalPasses: 0 },
        { ...f.request.evidence, confidenceInterval: { level: 0.95, lower: 0, upper: 1 } },
        {
          ...f.request.evidence,
          runs: [
            f.request.evidence.runs[0],
            ...f.request.evidence.runs.slice(1, -1),
            f.request.evidence.runs[0],
          ],
        },
      ]) {
        const payload = { ...f.request.attestation, evidenceHash: hash(evidence) };
        delete (payload as { signature?: unknown }).signature;
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
        await expect(
          verifyTrustedBenchmarkEvidence({ ...f.request, evidence, attestation })
        ).rejects.toThrow('TRUSTED_BENCHMARK_REQUIRED');
      }
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
