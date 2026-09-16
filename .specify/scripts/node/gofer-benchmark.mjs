/**
 * Provider-neutral benchmark aggregation. Cases are held out and each run must
 * supply a functional-verifier result; a fluent model answer is never a pass.
 */
const positive = value => Number.isFinite(value) && value >= 0;
const validCase = item => item && typeof item.id === 'string' && item.id.trim() && item.heldOut === true;
const validRun = result => result && result.functional === true && positive(result.costUsd) &&
  positive(result.durationMs) && typeof result.receipt === 'string' && result.receipt.trim();

export async function runBenchmark({ cases, execute, repetitions = 3 }) {
  if (!Array.isArray(cases) || !cases.length || cases.length > 1000 ||
      !cases.every(validCase) || new Set(cases.map(item => item.id)).size !== cases.length ||
      typeof execute !== 'function' || repetitions !== 3) throw new Error('INVALID_BENCHMARK_CONTRACT');
  const results = [];
  for (const benchmarkCase of cases) {
    for (let run = 1; run <= repetitions; run++) {
      const result = await execute(Object.freeze({ id: benchmarkCase.id, run, input: structuredClone(benchmarkCase.input) }));
      if (!result || !positive(result.costUsd) || !positive(result.durationMs) ||
          typeof result.receipt !== 'string' || !result.receipt.trim() || typeof result.functional !== 'boolean') {
        throw new Error('INVALID_BENCHMARK_RESULT');
      }
      results.push(Object.freeze({ caseId: benchmarkCase.id, run, ...structuredClone(result) }));
    }
  }
  const functionalPasses = results.filter(validRun).length;
  const totals = results.reduce((sum, result) => ({ costUsd: sum.costUsd + result.costUsd, durationMs: sum.durationMs + result.durationMs }),
    { costUsd: 0, durationMs: 0 });
  return Object.freeze({ schemaVersion: 1, repetitions, caseCount: cases.length, runs: results,
    reliability: functionalPasses / results.length, functionalPasses, functionalRuns: results.length,
    costUsd: totals.costUsd, durationMs: totals.durationMs,
    status: functionalPasses === results.length ? 'pass' : 'fail' });
}

export function gateBenchmark(candidate, baseline, { minReliability = 1, maxCostIncreasePct = 0.1, maxDurationIncreasePct = 0.1 } = {}) {
  if (!candidate || !baseline || !positive(candidate.costUsd) || !positive(candidate.durationMs) ||
      !positive(baseline.costUsd) || !positive(baseline.durationMs) || !Number.isFinite(candidate.reliability) ||
      !Number.isFinite(baseline.reliability) || ![minReliability, maxCostIncreasePct, maxDurationIncreasePct].every(positive)) {
    throw new Error('INVALID_BENCHMARK_GATE');
  }
  const findings = [];
  if (candidate.status !== 'pass' || candidate.reliability < minReliability) findings.push('FUNCTIONAL_RELIABILITY_REGRESSION');
  if (candidate.reliability < baseline.reliability) findings.push('BASELINE_RELIABILITY_REGRESSION');
  if ((candidate.costUsd - baseline.costUsd) / baseline.costUsd > maxCostIncreasePct) findings.push('COST_REGRESSION');
  if ((candidate.durationMs - baseline.durationMs) / baseline.durationMs > maxDurationIncreasePct) findings.push('DURATION_REGRESSION');
  return Object.freeze({ status: findings.length ? 'fail' : 'pass', findings,
    candidate: { reliability: candidate.reliability, costUsd: candidate.costUsd, durationMs: candidate.durationMs },
    baseline: { reliability: baseline.reliability, costUsd: baseline.costUsd, durationMs: baseline.durationMs } });
}
