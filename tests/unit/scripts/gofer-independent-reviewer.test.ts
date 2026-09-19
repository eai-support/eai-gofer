import { createHash, generateKeyPairSync } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHeldOutBenchmark } from '../../../.specify/scripts/node/gofer-benchmark-executor.mjs';
import { createCapabilityReceipt } from '../../../.specify/scripts/node/gofer-host-capability.mjs';
import {
  createIndependentReviewer,
  renderChanges,
} from '../../../.specify/scripts/node/gofer-independent-reviewer.mjs';
import {
  createNativeBenchmarkDispatch,
  createSpendCap,
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
const VERIFY = "import assert from 'node:assert/strict'; import { value } from './src/value.mjs'; assert.equal(value, 1);\n";
const USAGE = '{"input_tokens":1000000,"cached_input_tokens":0,"output_tokens":500000}';
const RATE = { inputUsdPerMillion: 4, outputUsdPerMillion: 20 };
const BASELINE = { 'verify.mjs': VERIFY, 'src/value.mjs': 'export const value = 0;\n' };

async function workerTree(value = 1) {
  const worktree = await temp('gofer-review-worker-');
  await mkdir(path.join(worktree, 'src'));
  await writeFile(path.join(worktree, 'verify.mjs'), VERIFY);
  await writeFile(path.join(worktree, 'src/value.mjs'), `export const value = ${value};\n`);
  return worktree;
}
const request = (worktree: string, extra: Record<string, unknown> = {}) => ({
  caseId: 'case-a', run: 1, inputHash: 'a'.repeat(64), executionReceipt: 'b'.repeat(64), passed: true,
  prompt: 'make value equal one', worktree, baselineFiles: BASELINE, ...extra,
});

type ReviewRequest = { prompt: string; allowedWriteScope: string[]; worktree: string };
function fakeReview(write: (scratch: string) => Promise<void>, modelId = 'reviewer-model') {
  return vi.fn(async ({ worktree }: ReviewRequest) => {
    await write(worktree);
    return { modelId, receipt: sha('invocation'), costUsd: 1, durationMs: 1, isolation: ISOLATION };
  });
}
const verdict = (body: unknown) => async (scratch: string) =>
  writeFile(path.join(scratch, 'review', 'verdict.json'), typeof body === 'string' ? body : JSON.stringify(body));
const reviewerFor = (dispatchReview: unknown) =>
  createIndependentReviewer({ dispatchReview, workerModelId: 'test-model', reviewerModelId: 'reviewer-model' });

describe('independent reviewer', () => {
  it('approves from a strict verdict and binds the receipt to the evidence', async () => {
    const dispatch = fakeReview(verdict({ approved: true, reasons: ['solves the task'] }));
    const first = await reviewerFor(dispatch)(request(await workerTree()));
    expect(first).toMatchObject({ approved: true });
    expect(first.receipt).toMatch(/^[a-f0-9]{64}$/);
    const other = await reviewerFor(fakeReview(verdict({ approved: true, reasons: [] })))(request(await workerTree()));
    expect(other.receipt).not.toBe(first.receipt);
  });

  it('shows the reviewer only the task and the changes, never the protected check or verdict', async () => {
    let seen = { task: '', changes: '', prompt: '', names: [] as string[], scope: [] as string[] };
    const dispatch = fakeReview(async (scratch) => {
      seen = { ...seen,
        task: await readFile(path.join(scratch, 'task.md'), 'utf8'),
        changes: await readFile(path.join(scratch, 'changes.diff'), 'utf8'),
        names: await readdir(scratch) };
      await verdict({ approved: true, reasons: [] })(scratch);
    });
    await reviewerFor(dispatch)(request(await workerTree()));
    expect(seen.task).toBe('make value equal one');
    expect(seen.changes).toContain('src/value.mjs');
    expect(seen.changes).toContain('export const value = 1;');
    expect(seen.changes).not.toContain('verify.mjs');
    expect(seen.names.sort()).toEqual(['changes.diff', 'review', 'task.md']);
    const call = dispatch.mock.calls[0][0];
    expect(call.allowedWriteScope).toEqual(['review/']);
    expect(call.prompt).not.toMatch(/verify|passed|functional/i);
  });

  it('rejects, and does not spend a model call, when the protected check already failed', async () => {
    const dispatch = fakeReview(verdict({ approved: true, reasons: [] }));
    const result = await reviewerFor(dispatch)(request(await workerTree(0), { passed: false }));
    expect(result.approved).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('carries a rejection through', async () => {
    const result = await reviewerFor(fakeReview(verdict({ approved: false, reasons: ['hard-coded'] })))(request(await workerTree()));
    expect(result.approved).toBe(false);
  });

  it.each([
    ['unparseable', 'not json'],
    ['extra key', { approved: true, reasons: [], note: 'x' }],
    ['non-boolean approval', { approved: 'yes', reasons: [] }],
    ['missing reasons', { approved: true }],
    ['too many reasons', { approved: true, reasons: Array.from({ length: 11 }, () => 'r') }],
    ['oversized reason', { approved: true, reasons: ['x'.repeat(501)] }],
    ['array', [true]],
  ])('treats a %s verdict as a rejection', async (_name, body) => {
    const result = await reviewerFor(fakeReview(verdict(body as string)))(request(await workerTree()));
    expect(result.approved).toBe(false);
  });

  it('treats a missing or symlinked verdict file as a rejection', async () => {
    const none = await reviewerFor(fakeReview(async () => {}))(request(await workerTree()));
    expect(none.approved).toBe(false);
    const secret = path.join(await temp('gofer-review-secret-'), 'v.json');
    await writeFile(secret, JSON.stringify({ approved: true, reasons: [] }));
    const linked = await reviewerFor(fakeReview(async (scratch) => symlink(secret, path.join(scratch, 'review', 'verdict.json'))))(
      request(await workerTree())
    );
    expect(linked.approved).toBe(false);
  });

  it('must use a different model, and rejects a dispatch that ran another one', async () => {
    expect(() => createIndependentReviewer({ dispatchReview: vi.fn(), workerModelId: 'm', reviewerModelId: 'm' })).toThrow(
      'INDEPENDENT_REVIEWER_REQUIRED'
    );
    const wrong = fakeReview(verdict({ approved: true, reasons: [] }), 'test-model');
    await expect(reviewerFor(wrong)(request(await workerTree()))).rejects.toThrow('INDEPENDENT_REVIEWER_REQUIRED');
  });

  it('removes its scratch worktree', async () => {
    const before = (await readdir(tmpdir())).filter((name) => name.startsWith('gofer-review-') && !name.includes('worker'));
    await reviewerFor(fakeReview(verdict({ approved: true, reasons: [] })))(request(await workerTree()));
    const after = (await readdir(tmpdir())).filter((name) => name.startsWith('gofer-review-') && !name.includes('worker'));
    expect(after).toEqual(before);
  });

  it('renders added, changed, and removed files', () => {
    const text = renderChanges({ a: '1', b: '2', c: '3' }, new Map([['a', '1'], ['b', '9'], ['d', '4']]));
    expect(text).toContain('### b (changed)');
    expect(text).toContain('### c (removed)');
    expect(text).toContain('### d (added)');
    expect(text).not.toContain('### a');
  });
});

async function fakeCodex(body: string) {
  const directory = await temp('gofer-fake-codex-');
  const script = path.join(directory, 'codex');
  await writeFile(script, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return script;
}

describe.skipIf(process.platform !== 'darwin' || process.execPath.startsWith('/Users/'))(
  'independent reviewer through the native launcher',
  () => {
    async function harness(reviewerBody: string, total: number) {
      const keys = generateKeyPairSync('ed25519');
      const now = Date.now();
      const capabilityReceipt = createCapabilityReceipt({
        host: 'codex', evaluatorVersion: '1', evaluationId: 'e-1', hostVersion: '1',
        evaluatedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(),
        models: [{ id: 'test-model' }, { id: 'reviewer-model' }], isolationClass: ISOLATION,
        provenance: { evaluator: 'gofer-native-host-evaluator', source: 'test', keyId: 'capability-key' },
        signingKey: keys.privateKey,
      });
      const spend = createSpendCap(total);
      const make = async (modelId: string, command: string, approvalReceipt: string, taskPrefix: string) =>
        createNativeBenchmarkDispatch({
          ledgerPath: path.join(await temp('gofer-review-ledger-'), 'ledger.jsonl'), capabilityReceipt,
          capabilityPublicKey: keys.publicKey, requiredCapabilities: { isolationClass: ISOLATION },
          modelId, approvalReceipt, command, rateCard: RATE, maxRunCostUsd: 20, spend, taskPrefix,
        });
      const worker = await fakeCodex(`printf 'export const value = 1;\\n' > src/value.mjs\necho '${USAGE}'`);
      const reviewer = await fakeCodex(`${reviewerBody}\necho '${USAGE}'`);
      const dispatchCase = await make('test-model', worker, 'worker-approval', 'benchmark');
      const dispatchReview = await make('reviewer-model', reviewer, 'reviewer-approval', 'review');

      const workspaceRoot = await temp('gofer-review-workspace-');
      const trustRoot = await temp('gofer-review-trust-');
      const corpusRoot = path.join(trustRoot, 'corpora', 'fixture');
      await mkdir(corpusRoot, { recursive: true, mode: 0o700 });
      await chmod(path.join(trustRoot, 'corpora'), 0o700);
      const manifest = { schemaVersion: 1, cases: [] as Array<Record<string, string>> };
      for (const [index, category] of ['bug-fix', 'refactor', 'cross-service-contract', 'security-sensitive'].entries()) {
        const input = { prompt: category, allowedWriteScope: ['src/'], files: BASELINE };
        const bytes = JSON.stringify(input);
        await writeFile(path.join(corpusRoot, `${index}.json`), bytes, { mode: 0o600 });
        manifest.cases.push({ id: `eai-${category}`, category, inputFile: `${index}.json`, inputSha256: sha(bytes) });
      }
      const manifestBytes = JSON.stringify(manifest);
      await writeFile(path.join(corpusRoot, 'manifest.json'), manifestBytes, { mode: 0o600 });
      await writeFile(path.join(trustRoot, 'heldout-corpus.json'),
        JSON.stringify({ schemaVersion: 1, corpusId: 'fixture', corpusHash: sha(manifestBytes) }), { mode: 0o600 });
      const run = () => runHeldOutBenchmark({
        workspaceRoot, trustRoot, capabilityReceipt, modelId: 'test-model', harnessId: 'review-fixture',
        dispatchCase,
        review: createIndependentReviewer({ dispatchReview, workerModelId: 'test-model', reviewerModelId: 'reviewer-model' }),
      });
      return { run, spend };
    }

    it('passes every case only when the reviewer approves, and both share one spend cap', async () => {
      const { run, spend } = await harness(`printf '{"approved":true,"reasons":["ok"]}' > review/verdict.json`, 400);
      const result = await run();
      roots.push(result.worktreesRoot);
      expect(result.report).toMatchObject({ functionalPasses: 12, status: 'pass' });
      expect(spend.spentUsd).toBe(24 * 14);
    });

    it('fails every case when the reviewer rejects, even though the protected check passes', async () => {
      const { run } = await harness(`printf '{"approved":false,"reasons":["hard-coded"]}' > review/verdict.json`, 400);
      const result = await run();
      roots.push(result.worktreesRoot);
      expect(result.report).toMatchObject({ functionalPasses: 0, status: 'fail' });
      expect(result.report.runs[0].failureClassification).toBe('review-rejected');
    });

    it('stops when reviewer spend would exceed the shared cap', async () => {
      const { run } = await harness(`printf '{"approved":true,"reasons":[]}' > review/verdict.json`, 60);
      await expect(run()).rejects.toThrow('BENCHMARK_EXECUTOR_REQUIRED');
    });

    it('fails a reviewer that writes outside its review folder', async () => {
      const { run } = await harness(`echo x > task.md\nprintf '{"approved":true,"reasons":[]}' > review/verdict.json`, 400);
      await expect(run()).rejects.toThrow('BENCHMARK_EXECUTOR_REQUIRED');
    });
  }
);
