import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyTrustedBenchmarkEvidence } from '../../../.specify/scripts/node/gofer-trusted-benchmark.mjs';

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'gofer-benchmark-trust-'));
  const workspaceRoot = path.join(root, 'repository');
  const trustRoot = path.join(root, 'trust');
  await mkdir(workspaceRoot);
  await mkdir(trustRoot, { mode: 0o700 });
  const keys = generateKeyPairSync('ed25519');
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
  await writeFile(
    path.join(trustRoot, 'trusted-evaluators.json'),
    JSON.stringify({
      schemaVersion: 1,
      evaluators: [
        {
          host: 'codex',
          evaluator: 'gofer-heldout-benchmark-verifier',
          keyId: 'benchmark-key',
          publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        },
      ],
    }),
    { mode: 0o600 }
  );
  const request = {
    host: 'codex',
    receiptHash,
    evidence,
    attestation,
    capabilityKeyId: 'capability-key',
    capabilityPublicKey: capabilityKeys.publicKey,
    workspaceRoot,
    trustRoot,
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
