import { describe, expect, it } from 'vitest';
import { gateBenchmark, runBenchmark } from '../../../.specify/scripts/node/gofer-benchmark.mjs';

const cases = [{ id: 'held-out-runtime-recovery', heldOut: true, input: { fixture: 'recovery' } }];

describe('Gofer benchmark contract', () => {
  it('requires three functionally verified runs of every held-out case', async () => {
    const report = await runBenchmark({ cases, execute: async ({ run }) => ({ functional: true, costUsd: run, durationMs: run * 10, receipt: `receipt-${run}` }) });
    expect(report).toMatchObject({ status: 'pass', reliability: 1, functionalRuns: 3, costUsd: 6, durationMs: 60 });
  });

  it('does not turn a fluent but unverifiable result into a benchmark pass', async () => {
    const report = await runBenchmark({ cases, execute: async ({ run }) => ({ functional: run !== 2, costUsd: 1, durationMs: 10, receipt: `receipt-${run}` }) });
    expect(report).toMatchObject({ status: 'fail', reliability: 2 / 3 });
  });

  it('fails reliability, cost and duration regressions independently', () => {
    const baseline = { status: 'pass', reliability: 1, costUsd: 10, durationMs: 100 };
    const candidate = { status: 'fail', reliability: 2 / 3, costUsd: 12, durationMs: 120 };
    expect(gateBenchmark(candidate, baseline, { maxCostIncreasePct: 0.05, maxDurationIncreasePct: 0.05 }).findings)
      .toEqual(expect.arrayContaining(['FUNCTIONAL_RELIABILITY_REGRESSION', 'BASELINE_RELIABILITY_REGRESSION', 'COST_REGRESSION', 'DURATION_REGRESSION']));
  });
});
