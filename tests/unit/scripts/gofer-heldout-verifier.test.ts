import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recheckHeldOutBenchmark } from '../../../.specify/scripts/node/gofer-heldout-verifier.mjs';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const jsonHash = (value: unknown) => hash(JSON.stringify(value));
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(
  verifySource = "import assert from 'node:assert/strict'; import { value } from './src/value.mjs'; assert.equal(value, 1);\n"
) {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'gofer-verifier-workspace-'));
  const corpusRoot = await mkdtemp(path.join(tmpdir(), 'gofer-verifier-corpus-'));
  const worktreesRoot = await mkdtemp(path.join(tmpdir(), 'gofer-verifier-worktrees-'));
  roots.push(workspaceRoot, corpusRoot, worktreesRoot);
  const receipts = path.join(corpusRoot, 'receipts');
  await mkdir(receipts);
  const categories = ['bug-fix', 'refactor', 'cross-service-contract', 'security-sensitive'];
  const manifest = { schemaVersion: 1, cases: [] as Array<Record<string, string>> };
  const inputs: Array<{
    id: string;
    input: { prompt: string; allowedWriteScope: string[]; files: Record<string, string> };
  }> = [];
  for (const [index, category] of categories.entries()) {
    const id = `eai-${category}`;
    const input = {
      prompt: category,
      allowedWriteScope: ['src/'],
      files: {
        'verify.mjs': verifySource,
        'src/value.mjs': 'export const value = 0;\n',
      },
    };
    const inputFile = `${index}.json`;
    const bytes = JSON.stringify(input);
    await writeFile(path.join(corpusRoot, inputFile), bytes);
    manifest.cases.push({ id, category, inputFile, inputSha256: hash(bytes) });
    inputs.push({ id, input });
  }
  await writeFile(path.join(corpusRoot, 'manifest.json'), JSON.stringify(manifest));
  const corpusHash = jsonHash(manifest);
  const runs = [];
  const worktrees: string[] = [];
  for (const { id, input } of inputs)
    for (let run = 1; run <= 3; run++) {
      const label = `${id}-${run}`;
      const worktree = path.join(worktreesRoot, label);
      worktrees.push(worktree);
      await mkdir(path.join(worktree, 'src'), { recursive: true, mode: 0o700 });
      await writeFile(path.join(worktree, 'verify.mjs'), input.files['verify.mjs']);
      await writeFile(path.join(worktree, 'src/value.mjs'), 'export const value = 1;\n');
      const execution = {
        id,
        run,
        worktree,
        native: { isolation: 'git-worktree+local-os-sandbox' },
      };
      const executionReceipt = jsonHash(execution);
      const inputHash = jsonHash({ caseId: id, input });
      const verifierReceipt = jsonHash({ id, run, verifier: true });
      await writeFile(
        path.join(receipts, `${label}.execution.json`),
        JSON.stringify({ ...execution, executionReceipt })
      );
      await writeFile(
        path.join(receipts, `${label}.verification.json`),
        JSON.stringify({
          caseId: id,
          run,
          inputHash,
          executionReceipt,
          receipt: verifierReceipt,
          passed: true,
        })
      );
      runs.push({
        caseId: id,
        run,
        modelId: 'test-model',
        inputHash,
        receipt: executionReceipt,
        verifierReceipt,
        functionalVerified: true,
        costUsd: 0.01,
        durationMs: 10,
      });
    }
  await writeFile(
    path.join(receipts, 'benchmark-report.json'),
    JSON.stringify({
      corpusHash,
      report: {
        schemaVersion: 2,
        repetitions: 3,
        caseCount: 4,
        runs,
        provenance: { corpusHash, modelId: 'test-model' },
        functionalPasses: 12,
        functionalRuns: 12,
        reliability: 1,
        status: 'pass',
        costUsd: 0.12,
        durationMs: 120,
      },
    })
  );
  return { corpusRoot, workspaceRoot, worktrees };
}

describe.skipIf(process.platform !== 'darwin' || process.execPath.startsWith('/Users/'))(
  'separate-process held-out verifier',
  () => {
    it('reruns all twelve cases without trusting the saved verdict', async () => {
      const f = await fixture();
      const result = await recheckHeldOutBenchmark(f);
      expect(result).toMatchObject({
        authority: 'diagnostic-only',
        functionalPasses: 12,
        functionalRuns: 12,
      });
      expect(result.checks).toHaveLength(12);
    });

    it('rejects changed protected tests and false functional claims', async () => {
      const f = await fixture();
      await writeFile(path.join(f.worktrees[0], 'verify.mjs'), 'process.exit(0);\n');
      await expect(recheckHeldOutBenchmark(f)).rejects.toThrow('HELDOUT_VERIFIER_REQUIRED');
      const fresh = await fixture();
      await writeFile(path.join(fresh.worktrees[0], 'src/value.mjs'), 'export const value = 0;\n');
      await expect(recheckHeldOutBenchmark(fresh)).rejects.toThrow('HELDOUT_VERIFIER_REQUIRED');
      const extra = await fixture();
      await writeFile(path.join(extra.worktrees[0], 'unscoped.txt'), 'unexpected\n');
      await expect(recheckHeldOutBenchmark(extra)).rejects.toThrow('HELDOUT_VERIFIER_REQUIRED');
    });

    it('runs the protected test with writes denied', async () => {
      const f = await fixture(
        "import fs from 'node:fs'; import assert from 'node:assert/strict'; import { value } from './src/value.mjs'; assert.equal(value, 1); assert.throws(() => fs.writeFileSync('forbidden.txt', 'x'));\n"
      );
      const result = await recheckHeldOutBenchmark(f);
      expect(result.functionalPasses).toBe(12);
    });
  }
);
