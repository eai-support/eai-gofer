import { createHash, generateKeyPairSync } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHeldOutBenchmark } from '../../../.specify/scripts/node/gofer-benchmark-executor.mjs';
import { signHeldOutBenchmarkAttestation } from '../../../.specify/scripts/node/gofer-benchmark-signer.mjs';
import { captureHeldOutResultSnapshot } from '../../../.specify/scripts/node/gofer-heldout-snapshot.mjs';
import { installVerifier } from '../../helpers/verifierCustody';

// verifyTrustedBenchmarkEvidence has no trust-root override; point its registry
// lookup at the isolated test root only.
const seam = vi.hoisted(() => ({
  trustRoot: null as string | null,
  protectedRegistry: null as { path: string; ownerUid: number } | null,
}));
vi.mock('../../../.specify/scripts/node/gofer-trusted-evaluator.mjs', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../.specify/scripts/node/gofer-trusted-evaluator.mjs')>();
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
const roots: string[] = [];
afterEach(async () => {
  seam.trustRoot = null;
  seam.protectedRegistry = null;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const VERIFY =
  "import assert from 'node:assert/strict'; import { value } from './src/value.mjs'; assert.equal(value, 1);\n";
const ISOLATION = 'git-worktree+local-os-sandbox';

async function fixture() {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'gofer-exec-workspace-'));
  const trustRoot = await mkdtemp(path.join(tmpdir(), 'gofer-exec-trust-'));
  roots.push(workspaceRoot, trustRoot);
  seam.trustRoot = trustRoot;
  await chmod(trustRoot, 0o700);
  const corpusRoot = path.join(trustRoot, 'corpora', 'fixture');
  await mkdir(corpusRoot, { recursive: true, mode: 0o700 });
  await chmod(path.join(trustRoot, 'corpora'), 0o700);
  const manifest = { schemaVersion: 1, cases: [] as Array<Record<string, string>> };
  for (const [index, category] of ['bug-fix', 'refactor', 'cross-service-contract', 'security-sensitive'].entries()) {
    const input = {
      prompt: category,
      allowedWriteScope: ['src/'],
      files: { 'verify.mjs': VERIFY, 'src/value.mjs': 'export const value = 0;\n' },
    };
    const bytes = JSON.stringify(input);
    await writeFile(path.join(corpusRoot, `${index}.json`), bytes, { mode: 0o600 });
    manifest.cases.push({ id: `eai-${category}`, category, inputFile: `${index}.json`, inputSha256: sha(bytes) });
  }
  const manifestBytes = JSON.stringify(manifest);
  await writeFile(path.join(corpusRoot, 'manifest.json'), manifestBytes, { mode: 0o600 });
  await writeFile(
    path.join(trustRoot, 'heldout-corpus.json'),
    JSON.stringify({ schemaVersion: 1, corpusId: 'fixture', corpusHash: sha(manifestBytes) }),
    { mode: 0o600 }
  );
  const verifier = await installVerifier({ trustRoot });
  roots.push(verifier.protectedDirectory);
  seam.protectedRegistry = verifier.protectedRegistry;
  return {
    workspaceRoot, trustRoot, corpusRoot, getPassphrase: verifier.getPassphrase,
    protectedRegistry: verifier.protectedRegistry,
    capabilityReceipt: { host: 'codex', provenance: { evaluator: 'gofer-native-host-evaluator', keyId: 'capability-key' }, models: [{ id: 'test-model' }] },
    capabilityPublicKey: generateKeyPairSync('ed25519').publicKey,
  };
}

const fixed = async ({ worktree }: { worktree: string }) => {
  await writeFile(path.join(worktree, 'src/value.mjs'), 'export const value = 1;\n');
  return { modelId: 'test-model', costUsd: 0.01, durationMs: 10, isolation: ISOLATION };
};
const review = async ({ caseId, run }: { caseId: string; run: number }) => ({ receipt: sha(`review:${caseId}:${run}`), approved: true });

function options(f: Awaited<ReturnType<typeof fixture>>, extra: Record<string, unknown> = {}) {
  return { workspaceRoot: f.workspaceRoot, trustRoot: f.trustRoot, capabilityReceipt: f.capabilityReceipt,
    modelId: 'test-model', harnessId: 'fixture-harness', dispatchCase: fixed, review, ...extra };
}

describe.skipIf(process.platform !== 'darwin' || process.execPath.startsWith('/Users/'))(
  'held-out benchmark executor',
  () => {
    it('produces a report that survives capture, signing, and consumer verification', async () => {
      const f = await fixture();
      const result = await runHeldOutBenchmark(options(f));
      roots.push(result.worktreesRoot);
      expect(result.report).toMatchObject({ schemaVersion: 2, caseCount: 4, functionalPasses: 12, status: 'pass' });
      const snapshot = await captureHeldOutResultSnapshot({ corpusRoot: f.corpusRoot, workspaceRoot: f.workspaceRoot, trustRoot: f.trustRoot });
      const signed = await signHeldOutBenchmarkAttestation({
        workspaceRoot: f.workspaceRoot, trustRoot: f.trustRoot, capabilityReceipt: f.capabilityReceipt,
        capabilityPublicKey: f.capabilityPublicKey, snapshotId: snapshot.snapshotId,
        getPassphrase: f.getPassphrase, protectedRegistry: f.protectedRegistry,
      });
      expect(signed.verification.valid).toBe(true);
      expect(signed.checks).toBe(12);
    });

    it('records a failing case honestly instead of passing it', async () => {
      const f = await fixture();
      const idle = async () => ({ modelId: 'test-model', costUsd: 0.01, durationMs: 10, isolation: ISOLATION });
      const result = await runHeldOutBenchmark(options(f, { dispatchCase: idle }));
      roots.push(result.worktreesRoot);
      expect(result.report).toMatchObject({ functionalPasses: 0, status: 'fail' });
      expect(result.report.runs[0].failureClassification).toBe('functional-check-failed');
    });

    it('fails a case whose worker wrote outside its allowed scope', async () => {
      const f = await fixture();
      const escape = async (input: { worktree: string }) => {
        await writeFile(path.join(input.worktree, 'notes.txt'), 'outside scope');
        return fixed(input);
      };
      const result = await runHeldOutBenchmark(options(f, { dispatchCase: escape }));
      roots.push(result.worktreesRoot);
      expect(result.report.status).toBe('fail');
      expect(result.report.runs[0].failureClassification).toBe('scope-violation');
    });

    it('rejects a dispatch that does not report the qualified isolation', async () => {
      const f = await fixture();
      const bare = async (input: { worktree: string }) => ({ ...(await fixed(input)), isolation: 'none' });
      await expect(runHeldOutBenchmark(options(f, { dispatchCase: bare }))).rejects.toThrow('BENCHMARK_EXECUTOR_REQUIRED');
    });

    it('cannot invent an independent review', async () => {
      const f = await fixture();
      await expect(runHeldOutBenchmark(options(f, { review: undefined }))).rejects.toThrow('BENCHMARK_EXECUTOR_REQUIRED');
      const empty = async () => ({ receipt: 'not-a-digest' });
      await expect(runHeldOutBenchmark(options(f, { review: empty }))).rejects.toThrow('BENCHMARK_EXECUTOR_REQUIRED');
    });

    it('fails a case that passes the protected check but is rejected by review', async () => {
      const f = await fixture();
      const reject = async ({ caseId, run }: { caseId: string; run: number }) => ({ receipt: sha(`review:${caseId}:${run}`), approved: false });
      const result = await runHeldOutBenchmark(options(f, { review: reject }));
      roots.push(result.worktreesRoot);
      expect(result.report).toMatchObject({ functionalPasses: 0, status: 'fail' });
      expect(result.report.runs[0].failureClassification).toBe('review-rejected');
    });

    it('requires an explicit approval verdict from the reviewer', async () => {
      const f = await fixture();
      const silent = async ({ caseId, run }: { caseId: string; run: number }) => ({ receipt: sha(`review:${caseId}:${run}`) });
      await expect(runHeldOutBenchmark(options(f, { review: silent }))).rejects.toThrow('BENCHMARK_EXECUTOR_REQUIRED');
    });

    it('will not overwrite an earlier run', async () => {
      const f = await fixture();
      const first = await runHeldOutBenchmark(options(f));
      roots.push(first.worktreesRoot);
      const before = await readFile(path.join(f.corpusRoot, 'receipts', 'benchmark-report.json'), 'utf8');
      await expect(runHeldOutBenchmark(options(f))).rejects.toThrow('BENCHMARK_EXECUTOR_REQUIRED');
      expect(await readFile(path.join(f.corpusRoot, 'receipts', 'benchmark-report.json'), 'utf8')).toBe(before);
    });
  }
);
