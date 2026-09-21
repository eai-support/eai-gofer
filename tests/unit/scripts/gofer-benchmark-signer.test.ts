import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signHeldOutBenchmarkAttestation } from '../../../.specify/scripts/node/gofer-benchmark-signer.mjs';
import { runBenchmark } from '../../../.specify/scripts/node/gofer-benchmark.mjs';
import { captureHeldOutResultSnapshot } from '../../../.specify/scripts/node/gofer-heldout-snapshot.mjs';
import { capabilityReceiptHash } from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import { installVerifier, type VerifierInstall } from '../../helpers/verifierCustody';

// verifyTrustedBenchmarkEvidence deliberately has no trust-root override, so
// route its registry lookup to the isolated test root and nowhere else.
const seam = vi.hoisted(() => ({
  trustRoot: null as string | null,
  protectedRegistry: null as { path: string; ownerUid: number } | null,
}));
vi.mock('../../../.specify/scripts/node/gofer-trusted-evaluator.mjs', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../../.specify/scripts/node/gofer-trusted-evaluator.mjs')
    >();
  return {
    ...original,
    resolveTrustedEvaluatorPublicKey: (receipt: unknown, options: Record<string, unknown>) =>
      original.resolveTrustedEvaluatorPublicKey(receipt, {
        ...options,
        trustRoot: seam.trustRoot,
        protectedRegistry: seam.protectedRegistry,
      }),
  };
});

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const jsonHash = (value: unknown) => sha(JSON.stringify(value));
const roots: string[] = [];
afterEach(async () => {
  seam.trustRoot = null;
  seam.protectedRegistry = null;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const VERIFY =
  "import assert from 'node:assert/strict'; import { value } from './src/value.mjs'; assert.equal(value, 1);\n";
const EVALUATOR = 'gofer-heldout-benchmark-verifier';

async function fixture({ activate = true, signerKeyId = 'verifier-key', worktreeValue = 1 } = {}) {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'gofer-signer-workspace-'));
  const trustRoot = await mkdtemp(path.join(tmpdir(), 'gofer-signer-trust-'));
  const worktreesRoot = await mkdtemp(path.join(tmpdir(), 'gofer-signer-worktrees-'));
  roots.push(workspaceRoot, trustRoot, worktreesRoot);
  seam.trustRoot = trustRoot;
  await chmod(trustRoot, 0o700);
  const corpusRoot = path.join(trustRoot, 'corpora', 'fixture');
  await mkdir(corpusRoot, { recursive: true, mode: 0o700 });
  await chmod(path.join(trustRoot, 'corpora'), 0o700);
  const receipts = path.join(corpusRoot, 'receipts');
  await mkdir(receipts, { mode: 0o700 });

  const manifest = { schemaVersion: 1, cases: [] as Array<Record<string, string>> };
  const cases: Array<{ id: string; heldOut: true; input: Record<string, unknown> }> = [];
  for (const [index, category] of [
    'bug-fix',
    'refactor',
    'cross-service-contract',
    'security-sensitive',
  ].entries()) {
    const id = `eai-${category}`;
    const input = {
      prompt: category,
      allowedWriteScope: ['src/'],
      files: { 'verify.mjs': VERIFY, 'src/value.mjs': 'export const value = 0;\n' },
    };
    const bytes = JSON.stringify(input);
    const inputFile = `${index}.json`;
    await writeFile(path.join(corpusRoot, inputFile), bytes, { mode: 0o600 });
    manifest.cases.push({ id, category, inputFile, inputSha256: sha(bytes) });
    cases.push({ id, heldOut: true, input });
  }
  const manifestBytes = JSON.stringify(manifest);
  await writeFile(path.join(corpusRoot, 'manifest.json'), manifestBytes, { mode: 0o600 });
  const corpusHash = sha(manifestBytes);
  await writeFile(
    path.join(trustRoot, 'heldout-corpus.json'),
    JSON.stringify({ schemaVersion: 1, corpusId: 'fixture', corpusHash }),
    { mode: 0o600 }
  );

  const capabilityReceipt = {
    host: 'codex',
    provenance: { evaluator: 'gofer-native-host-evaluator', keyId: 'capability-key' },
    models: [{ id: 'test-model' }],
  };
  const capabilityKeys = generateKeyPairSync('ed25519');
  const receiptHash = capabilityReceiptHash(capabilityReceipt);

  const report = await runBenchmark({
    cases,
    repetitions: 3,
    provenance: {
      harnessId: 'fixture-harness',
      modelId: 'test-model',
      corpusHash,
      capabilityReceiptHash: receiptHash,
    },
    execute: async ({ id, run }: { id: string; run: number }) => {
      const worktree = path.join(worktreesRoot, `${id}-${run}`);
      await mkdir(path.join(worktree, 'src'), { recursive: true, mode: 0o700 });
      await writeFile(path.join(worktree, 'verify.mjs'), VERIFY);
      await writeFile(
        path.join(worktree, 'src/value.mjs'),
        `export const value = ${worktreeValue};\n`
      );
      const payload = { id, run, worktree, native: { isolation: 'git-worktree+local-os-sandbox' } };
      const receipt = jsonHash(payload);
      await writeFile(
        path.join(receipts, `${id}-${run}.execution.json`),
        JSON.stringify({ ...payload, executionReceipt: receipt })
      );
      return { modelId: 'test-model', costUsd: 0.01, durationMs: 10, receipt };
    },
    verify: async ({
      caseId,
      run,
      inputHash,
      execution,
    }: {
      caseId: string;
      run: number;
      inputHash: string;
      execution: { receipt: string };
    }) => {
      const receipt = jsonHash({ caseId, run, kind: 'verification' });
      await writeFile(
        path.join(receipts, `${caseId}-${run}.verification.json`),
        JSON.stringify({
          caseId,
          run,
          inputHash,
          executionReceipt: execution.receipt,
          receipt,
          passed: true,
        })
      );
      return {
        caseId,
        run,
        inputHash,
        executionReceipt: execution.receipt,
        passed: true,
        receipt,
        verifierId: 'fixture-verifier',
        failureClassification: 'none',
        reviewReceipt: jsonHash({ caseId, run, kind: 'review' }),
      };
    },
  });
  await writeFile(
    path.join(receipts, 'benchmark-report.json'),
    JSON.stringify({ corpusHash, report })
  );

  const verifier: VerifierInstall = await installVerifier({ trustRoot, keyId: signerKeyId, activate });
  roots.push(verifier.protectedDirectory);
  seam.protectedRegistry = verifier.protectedRegistry;
  const snapshot = await captureHeldOutResultSnapshot({ corpusRoot, workspaceRoot, trustRoot });
  return {
    workspaceRoot,
    trustRoot,
    worktreesRoot,
    capabilityReceipt,
    receiptHash,
    report,
    capabilityPublicKey: capabilityKeys.publicKey,
    verifierPublicKey: verifier.keys.publicKey,
    getPassphrase: verifier.getPassphrase,
    protectedRegistry: verifier.protectedRegistry,
    snapshotId: snapshot.snapshotId,
  };
}

function request(f: Awaited<ReturnType<typeof fixture>>, extra: Record<string, unknown> = {}) {
  return {
    workspaceRoot: f.workspaceRoot,
    trustRoot: f.trustRoot,
    capabilityReceipt: f.capabilityReceipt,
    capabilityPublicKey: f.capabilityPublicKey,
    snapshotId: f.snapshotId,
    getPassphrase: f.getPassphrase,
    protectedRegistry: f.protectedRegistry,
    ...extra,
  };
}

describe.skipIf(process.platform !== 'darwin' || process.execPath.startsWith('/Users/'))(
  'held-out benchmark signer',
  () => {
    it('signs only what it re-ran, and the consumer accepts the result', async () => {
      const f = await fixture();
      const result = await signHeldOutBenchmarkAttestation(request(f));
      expect(result.checks).toBe(12);
      expect(result.verification).toMatchObject({ valid: true, receiptHash: f.receiptHash });
      expect(result.attestation).toMatchObject({
        host: 'codex',
        capabilityReceiptHash: f.receiptHash,
        evidenceHash: jsonHash(result.evidence),
        provenance: { evaluator: EVALUATOR, keyId: 'verifier-key' },
      });
      const { signature, ...payload } = result.attestation;
      expect(
        verify(
          null,
          Buffer.from(JSON.stringify(payload)),
          f.verifierPublicKey,
          Buffer.from(signature.value, 'base64url')
        )
      ).toBe(true);
    });

    it('refuses to sign when the verifier key was never activated', async () => {
      const f = await fixture({ activate: false });
      await expect(signHeldOutBenchmarkAttestation(request(f))).rejects.toThrow(
        'BENCHMARK_SIGNER_REQUIRED'
      );
    });

    it('refuses a verifier key that shares the capability key identity', async () => {
      const f = await fixture({ signerKeyId: 'capability-key' });
      await expect(signHeldOutBenchmarkAttestation(request(f))).rejects.toThrow(
        'BENCHMARK_SIGNER_REQUIRED'
      );
    });

    it('refuses when the capability key is the verifier key itself', async () => {
      const f = await fixture();
      await expect(
        signHeldOutBenchmarkAttestation(request(f, { capabilityPublicKey: f.verifierPublicKey }))
      ).rejects.toThrow('BENCHMARK_SIGNER_REQUIRED');
    });

    it('refuses to sign a report whose saved verdicts do not survive re-execution', async () => {
      const f = await fixture({ worktreeValue: 0 });
      await expect(signHeldOutBenchmarkAttestation(request(f))).rejects.toThrow(
        'BENCHMARK_SIGNER_REQUIRED'
      );
    });

    it('refuses a report bound to a different capability receipt', async () => {
      const f = await fixture();
      const other = { ...f.capabilityReceipt, models: [{ id: 'another-model' }] };
      await expect(
        signHeldOutBenchmarkAttestation(request(f, { capabilityReceipt: other }))
      ).rejects.toThrow('BENCHMARK_SIGNER_REQUIRED');
    });

    it('rejects an unknown snapshot and an out-of-range lifetime', async () => {
      const f = await fixture();
      await expect(
        signHeldOutBenchmarkAttestation(request(f, { snapshotId: 'a'.repeat(64) }))
      ).rejects.toThrow('BENCHMARK_SIGNER_REQUIRED');
      for (const ttlMs of [0, -1, 1.5, 24 * 60 * 60 * 1000 + 1]) {
        await expect(signHeldOutBenchmarkAttestation(request(f, { ttlMs }))).rejects.toThrow(
          'BENCHMARK_SIGNER_REQUIRED'
        );
      }
    });

    it('leaves no recheck material behind', async () => {
      const f = await fixture();
      const before = (await readdir(tmpdir())).filter((name) =>
        name.startsWith('gofer-heldout-recheck-')
      );
      await signHeldOutBenchmarkAttestation(request(f));
      const after = (await readdir(tmpdir())).filter((name) =>
        name.startsWith('gofer-heldout-recheck-')
      );
      expect(after).toEqual(before);
    });
  }
);
