/** A benchmark execution result is not a functional pass. An independent
 * verifier binds every verdict to the held-out input and execution receipt. */
import { createHash } from 'node:crypto';

const positive = value => Number.isFinite(value) && value >= 0;
const text = value => typeof value === 'string' && value.trim().length > 0;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validCase = item => item && text(item.id) && item.heldOut === true;
const validExecution = result => result && positive(result.costUsd) && positive(result.durationMs) && text(result.receipt);
const validVerifiedRun = result => validExecution(result) && result.functionalVerified === true && text(result.verifierReceipt) && text(result.verifierId) && text(result.inputHash);

export async function runBenchmark({ cases, execute, verify, repetitions = 3, provenance } = {}) {
  if (!Array.isArray(cases) || !cases.length || cases.length > 1000 || !cases.every(validCase) ||
      new Set(cases.map(item => item.id)).size !== cases.length || typeof execute !== 'function' ||
      typeof verify !== 'function' || execute === verify || repetitions !== 3 || !text(provenance?.harnessId)) {
    throw new Error('INVALID_BENCHMARK_CONTRACT');
  }
  const results = [];
  for (const benchmarkCase of cases) for (let run = 1; run <= repetitions; run++) {
    const input = structuredClone(benchmarkCase.input);
    const inputHash = hash({ caseId: benchmarkCase.id, input });
    const execution = await execute(Object.freeze({ id: benchmarkCase.id, run, input }));
    if (!validExecution(execution)) throw new Error('INVALID_BENCHMARK_RESULT');
    const verdict = await verify(Object.freeze({ caseId: benchmarkCase.id, run, inputHash,
      execution: { receipt: execution.receipt, modelId: execution.modelId ?? null, output: structuredClone(execution.output ?? null) } }));
    if (!verdict || verdict.caseId !== benchmarkCase.id || verdict.run !== run || verdict.executionReceipt !== execution.receipt ||
        typeof verdict.passed !== 'boolean' || !text(verdict.receipt) || !text(verdict.verifierId)) throw new Error('INVALID_BENCHMARK_VERDICT');
    results.push(Object.freeze({ caseId: benchmarkCase.id, run, modelId: execution.modelId ?? null,
      costUsd: execution.costUsd, durationMs: execution.durationMs, receipt: execution.receipt, inputHash,
      functionalVerified: verdict.passed, verifierReceipt: verdict.receipt, verifierId: verdict.verifierId }));
  }
  const functionalPasses = results.filter(validVerifiedRun).length;
  const totals = results.reduce((sum, result) => ({ costUsd: sum.costUsd + result.costUsd, durationMs: sum.durationMs + result.durationMs }), { costUsd: 0, durationMs: 0 });
  return Object.freeze({ schemaVersion: 2, repetitions, caseCount: cases.length, runs: results, provenance: { ...provenance },
    reliability: functionalPasses / results.length, functionalPasses, functionalRuns: results.length,
    costUsd: totals.costUsd, durationMs: totals.durationMs, status: functionalPasses === results.length ? 'pass' : 'fail' });
}

export function ablateBenchmark(reports) {
  if (!Array.isArray(reports) || reports.length < 2 || reports.some(report => !report || !text(report.provenance?.harnessId) ||
      !text(report.provenance?.modelId) || !Number.isFinite(report.reliability) || !positive(report.costUsd) || !positive(report.durationMs))) throw new Error('INVALID_ABLATION_REPORT');
  return Object.freeze(reports.map(report => Object.freeze({ harnessId: report.provenance.harnessId, modelId: report.provenance.modelId,
    reliability: report.reliability, costUsd: report.costUsd, durationMs: report.durationMs, status: report.status })));
}

export function gateBenchmark(candidate, baseline, { minReliability = 1, maxCostIncreasePct = 0.1, maxDurationIncreasePct = 0.1 } = {}) {
  if (!candidate || !baseline || !positive(candidate.costUsd) || !positive(candidate.durationMs) || !positive(baseline.costUsd) ||
      !positive(baseline.durationMs) || !Number.isFinite(candidate.reliability) || !Number.isFinite(baseline.reliability) ||
      ![minReliability, maxCostIncreasePct, maxDurationIncreasePct].every(positive)) throw new Error('INVALID_BENCHMARK_GATE');
  const findings = [];
  if (candidate.status !== 'pass' || candidate.reliability < minReliability) findings.push('FUNCTIONAL_RELIABILITY_REGRESSION');
  if (candidate.reliability < baseline.reliability) findings.push('BASELINE_RELIABILITY_REGRESSION');
  if ((candidate.costUsd - baseline.costUsd) / baseline.costUsd > maxCostIncreasePct) findings.push('COST_REGRESSION');
  if ((candidate.durationMs - baseline.durationMs) / baseline.durationMs > maxDurationIncreasePct) findings.push('DURATION_REGRESSION');
  return Object.freeze({ status: findings.length ? 'fail' : 'pass', findings,
    candidate: { reliability: candidate.reliability, costUsd: candidate.costUsd, durationMs: candidate.durationMs },
    baseline: { reliability: baseline.reliability, costUsd: baseline.costUsd, durationMs: baseline.durationMs } });
}
