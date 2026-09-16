/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic host receipts are intentionally untyped test inputs. */
import { describe, expect, it, vi } from 'vitest';
import {
  ablateBenchmark,
  gateBenchmark,
  runBenchmark,
} from '../../../.specify/scripts/node/gofer-benchmark.mjs';

const cases = [{ id: 'held-out-runtime-recovery', heldOut: true, input: { fixture: 'recovery' } }];
const provenance = { harnessId: 'independent-local-verifier', modelId: 'fixture-model' };
const execute = async ({ run }: any) => ({
  modelId: 'fixture-model',
  costUsd: run,
  durationMs: run * 10,
  receipt: `execution-${run}`,
  output: { repaired: true },
});
const verify = async ({ caseId, run, inputHash, execution }: any) => ({
  caseId,
  run,
  inputHash,
  executionReceipt: execution.receipt,
  passed: true,
  receipt: `verifier-${run}`,
  verifierId: 'independent-local-verifier',
});

describe('Gofer benchmark contract', () => {
  it('requires three independently verified runs of every held-out case', async () => {
    const report = await runBenchmark({ cases, execute, verify, provenance });
    expect(report).toMatchObject({
      status: 'pass',
      reliability: 1,
      functionalRuns: 3,
      costUsd: 6,
      durationMs: 60,
    });
    expect(report.runs.every((run) => run.functionalVerified && run.verifierReceipt)).toBe(true);
  });

  it('does not turn a caller-supplied functional flag into a benchmark pass', async () => {
    const verifier = vi.fn(async ({ caseId, run, inputHash, execution }: any) => ({
      caseId,
      run,
      inputHash,
      executionReceipt: execution.receipt,
      passed: run !== 2,
      receipt: `verifier-${run}`,
      verifierId: 'independent-local-verifier',
    }));
    const report = await runBenchmark({
      cases,
      execute: async (request: any) => ({ ...(await execute(request)), functional: true }),
      verify: verifier,
      provenance,
    });
    expect(report).toMatchObject({ status: 'fail', reliability: 2 / 3 });
    expect(verifier).toHaveBeenCalledTimes(3);
  });

  it('rejects a verifier verdict not bound to the worker receipt', async () => {
    await expect(
      runBenchmark({
        cases,
        execute,
        verify: async ({ caseId, run }: any) => ({
          caseId,
          run,
          executionReceipt: 'forged',
          passed: true,
          receipt: 'v',
          verifierId: 'independent-local-verifier',
        }),
        provenance,
      })
    ).rejects.toThrow('INVALID_BENCHMARK_VERDICT');
  });

  it('rejects a verifier verdict bound to a different held-out input', async () => {
    await expect(
      runBenchmark({
        cases,
        execute,
        verify: async ({ caseId, run, execution }: any) => ({
          caseId,
          run,
          inputHash: 'forged',
          executionReceipt: execution.receipt,
          passed: true,
          receipt: 'v',
          verifierId: 'independent-local-verifier',
        }),
        provenance,
      })
    ).rejects.toThrow('INVALID_BENCHMARK_VERDICT');
  });

  it('reports model and harness ablations without conflating them', () => {
    expect(
      ablateBenchmark([
        { status: 'pass', reliability: 1, costUsd: 1, durationMs: 10, provenance },
        {
          status: 'pass',
          reliability: 1,
          costUsd: 2,
          durationMs: 20,
          provenance: { harnessId: 'independent-local-verifier', modelId: 'other-model' },
        },
      ])
    ).toEqual(expect.arrayContaining([expect.objectContaining({ modelId: 'fixture-model' })]));
  });

  it('fails reliability, cost and duration regressions independently', () => {
    const baseline = { status: 'pass', reliability: 1, costUsd: 10, durationMs: 100 };
    const candidate = { status: 'fail', reliability: 2 / 3, costUsd: 12, durationMs: 120 };
    expect(
      gateBenchmark(candidate, baseline, { maxCostIncreasePct: 0.05, maxDurationIncreasePct: 0.05 })
        .findings
    ).toEqual(
      expect.arrayContaining([
        'FUNCTIONAL_RELIABILITY_REGRESSION',
        'BASELINE_RELIABILITY_REGRESSION',
        'COST_REGRESSION',
        'DURATION_REGRESSION',
      ])
    );
  });
});
