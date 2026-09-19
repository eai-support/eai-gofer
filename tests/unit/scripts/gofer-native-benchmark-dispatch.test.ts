import { createHash, generateKeyPairSync } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runHeldOutBenchmark } from '../../../.specify/scripts/node/gofer-benchmark-executor.mjs';
import { createCapabilityReceipt } from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import { captureHeldOutResultSnapshot } from '../../../.specify/scripts/node/gofer-heldout-snapshot.mjs';
import {
  createNativeBenchmarkDispatch,
  priceUsage,
} from '../../../.specify/scripts/node/gofer-native-benchmark-dispatch.mjs';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function temp(prefix: string) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(directory);
  await chmod(directory, 0o700);
  return directory;
}

const ISOLATION = 'git-worktree+local-os-sandbox';
const VERIFY =
  "import assert from 'node:assert/strict'; import { value } from './src/value.mjs'; assert.equal(value, 1);\n";
const USAGE = '{"input_tokens":1000000,"cached_input_tokens":0,"output_tokens":500000}';
const RATE = { inputUsdPerMillion: 4, outputUsdPerMillion: 20 };
const FIXED_COST = 14;

// A stand-in for the pinned native executable. It is launched by the real
// local launcher, so git baseline, scope, and usage checks are all real.
async function fakeCodex(body: string) {
  const directory = await temp('gofer-fake-codex-');
  const log = path.join(directory, 'launches.log');
  const script = path.join(directory, 'codex');
  await writeFile(script, `#!/bin/sh\necho launched >> '${log}'\n${body}\n`, { mode: 0o755 });
  return { script, launches: async () => (await readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean).length };
}
const FIX = `printf 'export const value = 1;\\n' > src/value.mjs\necho '${USAGE}'`;

async function receipt() {
  const keys = generateKeyPairSync('ed25519');
  const now = Date.now();
  return {
    capabilityPublicKey: keys.publicKey,
    capabilityReceipt: createCapabilityReceipt({
      host: 'codex', evaluatorVersion: '1', evaluationId: 'evaluation-1', hostVersion: '1',
      evaluatedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(),
      models: [{ id: 'test-model' }], isolationClass: ISOLATION,
      provenance: { evaluator: 'gofer-native-host-evaluator', source: 'test', keyId: 'capability-key' },
      signingKey: keys.privateKey,
    }),
  };
}

async function dispatcher(command: string, extra: Record<string, unknown> = {}) {
  const { capabilityReceipt, capabilityPublicKey } = await receipt();
  const ledgerDirectory = await temp('gofer-native-ledger-');
  return createNativeBenchmarkDispatch({
    ledgerPath: path.join(ledgerDirectory, 'ledger.jsonl'), capabilityReceipt, capabilityPublicKey,
    requiredCapabilities: { isolationClass: ISOLATION }, modelId: 'test-model',
    approvalReceipt: 'user-approval-1', command, rateCard: RATE, maxRunCostUsd: 20, maxTotalCostUsd: 50,
    ...extra,
  });
}

async function caseWorktree() {
  const worktree = await temp('gofer-native-case-');
  await mkdir(path.join(worktree, 'src'));
  await writeFile(path.join(worktree, 'verify.mjs'), VERIFY);
  await writeFile(path.join(worktree, 'src/value.mjs'), 'export const value = 0;\n');
  return worktree;
}
const call = (dispatch: (input: unknown) => Promise<unknown>, worktree: string, run = 1) =>
  dispatch({ caseId: 'case-a', run, prompt: 'fix it', allowedWriteScope: ['src/'], worktree });

describe.skipIf(process.platform !== 'darwin' || process.execPath.startsWith('/Users/'))(
  'native benchmark dispatch',
  () => {
    it('runs a case through the ledger-bound launcher and prices the reported usage', async () => {
      const codex = await fakeCodex(FIX);
      const worktree = await caseWorktree();
      const result = await call(await dispatcher(codex.script), worktree);
      expect(result).toMatchObject({ modelId: 'test-model', isolation: ISOLATION, costUsd: FIXED_COST });
      expect(await readFile(path.join(worktree, 'src/value.mjs'), 'utf8')).toBe('export const value = 1;\n');
      expect(await codex.launches()).toBe(1);
      const leftovers = (await readdir(tmpdir())).filter((name) => name.startsWith('gofer-benchmark-base-'));
      expect(leftovers).toEqual([]);
    });

    it('refuses to launch once the next run could exceed the spend cap', async () => {
      const codex = await fakeCodex(FIX);
      const dispatch = await dispatcher(codex.script, { maxTotalCostUsd: 30 });
      await call(dispatch, await caseWorktree(), 1);
      await expect(call(dispatch, await caseWorktree(), 2)).rejects.toThrow('BENCHMARK_SPEND_CAP_REACHED');
      expect(await codex.launches()).toBe(1);
    });

    it('charges a run it cannot meter in full', async () => {
      const codex = await fakeCodex(`printf 'export const value = 1;\\n' > src/value.mjs`);
      const dispatch = await dispatcher(codex.script, { maxTotalCostUsd: 30 });
      await expect(call(dispatch, await caseWorktree(), 1)).rejects.toThrow('BENCHMARK_USAGE_REQUIRED');
      await expect(call(dispatch, await caseWorktree(), 2)).rejects.toThrow('BENCHMARK_SPEND_CAP_REACHED');
      expect(await codex.launches()).toBe(1);
    });

    it('rejects a run whose measured cost exceeds the per-run bound', async () => {
      const codex = await fakeCodex(FIX);
      const dispatch = await dispatcher(codex.script, { maxRunCostUsd: 10, maxTotalCostUsd: 50 });
      await expect(call(dispatch, await caseWorktree())).rejects.toThrow('BENCHMARK_RUN_COST_EXCEEDED');
    });

    it('fails a worker that writes outside its allowed scope', async () => {
      const codex = await fakeCodex(`echo x > outside.txt\n${FIX}`);
      await expect(call(await dispatcher(codex.script), await caseWorktree())).rejects.toThrow('NATIVE_SCOPE_VIOLATION');
    });

    it('fails a worker that commits to git', async () => {
      const codex = await fakeCodex(
        `${FIX}\ngit -c user.name=x -c user.email=x@x add -A && git -c user.name=x -c user.email=x@x commit -q -m sneaky`
      );
      await expect(call(await dispatcher(codex.script), await caseWorktree())).rejects.toThrow(
        'NATIVE_UNAUTHORIZED_GIT_CHANGE'
      );
    });

    it('rejects an unpinned command and an untrusted capability key', async () => {
      await expect(dispatcher('codex')).rejects.toThrow('NATIVE_BENCHMARK_DISPATCH_REQUIRED');
      const codex = await fakeCodex(FIX);
      const wrongKey = generateKeyPairSync('ed25519').publicKey;
      const dispatch = await dispatcher(codex.script, { capabilityPublicKey: wrongKey });
      await expect(call(dispatch, await caseWorktree())).rejects.toThrow('CAPABILITY_RECEIPT_REQUIRED');
      expect(await codex.launches()).toBe(0);
    });

    it('prices cached input at its own rate only when one is given', () => {
      const usage = { inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 100_000 };
      expect(priceUsage(usage, RATE)).toBeCloseTo(4 + 2, 9);
      expect(priceUsage(usage, { ...RATE, cachedInputUsdPerMillion: 1 })).toBeCloseTo(0.6 * 4 + 0.4 * 1 + 2, 9);
      expect(() => priceUsage(undefined, RATE)).toThrow('BENCHMARK_USAGE_REQUIRED');
      expect(() => priceUsage({ ...usage, cachedInputTokens: 2_000_000 }, RATE)).toThrow('BENCHMARK_USAGE_REQUIRED');
    });

    it('drives the whole executor, and the result is capturable', async () => {
      const codex = await fakeCodex(FIX);
      const workspaceRoot = await temp('gofer-native-workspace-');
      const trustRoot = await temp('gofer-native-trust-');
      const corpusRoot = path.join(trustRoot, 'corpora', 'fixture');
      await mkdir(corpusRoot, { recursive: true, mode: 0o700 });
      await chmod(path.join(trustRoot, 'corpora'), 0o700);
      const manifest = { schemaVersion: 1, cases: [] as Array<Record<string, string>> };
      for (const [index, category] of ['bug-fix', 'refactor', 'cross-service-contract', 'security-sensitive'].entries()) {
        const input = { prompt: category, allowedWriteScope: ['src/'],
          files: { 'verify.mjs': VERIFY, 'src/value.mjs': 'export const value = 0;\n' } };
        const bytes = JSON.stringify(input);
        await writeFile(path.join(corpusRoot, `${index}.json`), bytes, { mode: 0o600 });
        manifest.cases.push({ id: `eai-${category}`, category, inputFile: `${index}.json`, inputSha256: sha(bytes) });
      }
      const manifestBytes = JSON.stringify(manifest);
      await writeFile(path.join(corpusRoot, 'manifest.json'), manifestBytes, { mode: 0o600 });
      await writeFile(path.join(trustRoot, 'heldout-corpus.json'),
        JSON.stringify({ schemaVersion: 1, corpusId: 'fixture', corpusHash: sha(manifestBytes) }), { mode: 0o600 });

      const { capabilityReceipt, capabilityPublicKey } = await receipt();
      const ledgerDirectory = await temp('gofer-native-ledger-');
      const dispatchCase = await createNativeBenchmarkDispatch({
        ledgerPath: path.join(ledgerDirectory, 'ledger.jsonl'), capabilityReceipt, capabilityPublicKey,
        requiredCapabilities: { isolationClass: ISOLATION }, modelId: 'test-model',
        approvalReceipt: 'user-approval-1', command: codex.script, rateCard: RATE,
        maxRunCostUsd: 20, maxTotalCostUsd: 11 * FIXED_COST + 20,
      });
      const result = await runHeldOutBenchmark({
        workspaceRoot, trustRoot, capabilityReceipt, modelId: 'test-model', harnessId: 'native-fixture',
        dispatchCase, review: async ({ caseId, run }: { caseId: string; run: number }) => ({ receipt: sha(`r:${caseId}:${run}`) }),
      });
      roots.push(result.worktreesRoot);
      expect(result.report).toMatchObject({ functionalPasses: 12, status: 'pass', costUsd: 12 * FIXED_COST });
      expect(await codex.launches()).toBe(12);
      const snapshot = await captureHeldOutResultSnapshot({ corpusRoot, workspaceRoot, trustRoot });
      expect(snapshot.fileCount).toBeGreaterThan(36);
    });
  }
);
