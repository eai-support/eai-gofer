import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const script = path.resolve(
  __dirname,
  '../../../.specify/scripts/node/gofer-execution-metrics.mjs'
);
const { generateExecutionMetrics, summarizeUsage, formatMarkdown } = await import(
  pathToFileURL(script).href
);

function trial(pairId: string, variant: string, elapsedMs = 100) {
  return {
    trialId: `${pairId}-${variant}`,
    pairId,
    variant,
    caseId: 'independent-tasks',
    requirementsRevision: 'requirements-v1',
    inputRevision: 'fixture-v1',
    implementationRevision: variant === 'baseline' ? 'baseline-sha' : 'candidate-sha',
    environmentRevision: 'same-host-model-policy-limits-and-cache',
    surface: 'codex',
    measurementClass: 'synthetic',
    requiredChecks: ['outcome', 'security'],
    status: 'verified',
    elapsedMs,
    checks: ['outcome', 'security'].map((id) => ({
      id,
      status: 'passed',
      receipt: `synthetic:${id}`,
      requirementsRevision: 'requirements-v1',
      inputRevision: 'fixture-v1',
      implementationRevision: variant === 'baseline' ? 'baseline-sha' : 'candidate-sha',
    })),
    usage: {
      complete: true,
      entries: [
        {
          executionId: `${pairId}-${variant}-worker`,
          role: 'worker',
          attempt: 1,
          calls: 1,
          inputTokens: 10,
          outputTokens: 5,
          costUsd: 0.1,
        },
        {
          executionId: `${pairId}-${variant}-review`,
          role: 'reviewer',
          attempt: 1,
          calls: 1,
          inputTokens: 20,
          outputTokens: 6,
          costUsd: 0.2,
        },
        {
          executionId: `${pairId}-${variant}-retry`,
          role: 'worker',
          attempt: 2,
          calls: 1,
          inputTokens: 30,
          outputTokens: 7,
          costUsd: 0.3,
        },
      ],
    },
  };
}

function input(pairs: [number, number][] = [[100, 70]]) {
  return {
    schemaVersion: 1,
    revisions: { baseline: 'baseline-sha', candidate: 'candidate-sha' },
    trials: pairs.flatMap(([b, c], i) => [
      trial(String(i), 'baseline', b),
      trial(String(i), 'candidate', c),
    ]),
  };
}

describe('gofer-execution-metrics (synthetic evidence only)', () => {
  it('computes paired time, quality and uncertainty without claiming native gains', () => {
    const report = generateExecutionMetrics(
      input([
        [100, 70],
        [200, 160],
        [300, 270],
      ])
    );
    const c = report.cohorts[0];
    expect(report.trialCount).toBe(6);
    expect(c.pairCount).toBe(3);
    expect(c.elapsedMs.baseline).toMatchObject({ median: 200, p95: 300, observedCount: 3 });
    expect(c.elapsedMs.candidate).toMatchObject({ median: 160, p95: 270 });
    expect(c.pairedElapsedDeltaMs.mean).toBeCloseTo(-100 / 3);
    expect(c.pairedElapsedDeltaMs.standardError).toBeCloseTo(10 / 3);
    expect(c.observedMedianReductionFraction).toBeCloseTo(0.2);
    expect(c.quality).toMatchObject({
      baselineAccepted: 3,
      candidateAccepted: 3,
      regressions: 0,
      improvements: 0,
    });
    expect(c.observedTargetMet).toBe(true);
    expect(report.productSpeedClaimSupported).toBe(false);
    expect(report.limitations.join(' ')).toMatch(/not.*native|native.*not/i);
  });

  it.each([
    'requirementsRevision',
    'inputRevision',
    'environmentRevision',
    'caseId',
    'surface',
    'measurementClass',
  ])('rejects non-equivalent %s rather than silently dropping a trial', (field) => {
    const data = input();
    Object.assign(data.trials[1], {
      [field]: field === 'measurementClass' ? 'native-host' : 'different',
    });
    expect(() => generateExecutionMetrics(data)).toThrow(/MISMATCH/);
  });

  it('rejects changed requirements and stale arm revisions, while allowing declared code differences', () => {
    const data = input();
    expect(() => generateExecutionMetrics(data)).not.toThrow();
    data.trials[1].implementationRevision = 'old-candidate';
    expect(() => generateExecutionMetrics(data)).toThrow(/REVISION_MISMATCH/);
    data.trials[1].implementationRevision = 'candidate-sha';
    data.trials[1].requiredChecks = ['outcome'];
    expect(() => generateExecutionMetrics(data)).toThrow(/MISMATCH/);
  });

  it('matches check sets and pair IDs independently of input order', () => {
    const data = input([
      [100, 70],
      [200, 150],
    ]);
    const expected = generateExecutionMetrics(data);
    data.trials.reverse();
    data.trials[0].requiredChecks.reverse();
    expect(generateExecutionMetrics(data)).toEqual(expected);
  });

  it.each(['failed', 'blocked', 'timed-out', 'cancelled', 'stale', 'incomplete'])(
    'retains %s trials, elapsed time, all costs and the quality denominator',
    (status) => {
      const data = input([
        [100, 70],
        [200, 900],
      ]);
      data.trials[3].status = status;
      const report = generateExecutionMetrics(data);
      const c = report.cohorts[0];
      expect(report.trials).toHaveLength(4);
      expect(c.outcomes.candidate[status]).toBe(1);
      expect(c.elapsedMs.candidate.median).toBe(485);
      expect(c.quality).toMatchObject({
        candidateAccepted: 1,
        candidateAcceptanceRate: 0.5,
        regressions: 1,
      });
      expect(c.usage.candidate.costUsd).toBeCloseTo(1.2);
      expect(c.observedTargetMet).toBe(false);
    }
  );

  it('does not allow improvements on other cases to hide a paired quality regression', () => {
    const data = input([
      [100, 10],
      [100, 10],
    ]);
    data.trials[0].status = 'failed';
    data.trials[3].status = 'failed';
    const c = generateExecutionMetrics(data).cohorts[0];
    expect(c.quality).toMatchObject({ regressions: 1, improvements: 1, acceptanceRateDelta: 0 });
    expect(c.observedTargetMet).toBe(false);
  });

  it.each(['missing', 'failed', 'stale', 'stale-code', 'no-receipt'])(
    'does not accept a verified label with %s required evidence',
    (problem) => {
      const data = input();
      const check = data.trials[1].checks[1];
      if (problem === 'missing') data.trials[1].checks.pop();
      if (problem === 'failed') check.status = 'failed';
      if (problem === 'stale') check.inputRevision = 'old';
      if (problem === 'stale-code') check.implementationRevision = 'baseline-sha';
      if (problem === 'no-receipt') check.receipt = '';
      const report = generateExecutionMetrics(data);
      expect(report.cohorts[0].quality.candidateAccepted).toBe(0);
      expect(report.trials[1].acceptanceIssues.length).toBeGreaterThan(0);
    }
  );

  it('sums every worker, reviewer and retry usage entry', () => {
    const usage = summarizeUsage(trial('0', 'baseline').usage);
    expect(usage).toMatchObject({ calls: 3, inputTokens: 60, outputTokens: 18, entryCount: 3 });
    expect(usage.costUsd).toBeCloseTo(0.6);
    expect(usage.reported.costUsd).toBeCloseTo(0.6);
  });

  it.each([undefined, null, { complete: false, entries: [] }, { complete: true, entries: [] }])(
    'keeps absent usage unknown rather than free',
    (usage) => {
      expect(summarizeUsage(usage)).toMatchObject({
        costUsd: null,
        calls: null,
        inputTokens: null,
      });
    }
  );

  it('preserves partial reported sums but keeps incomplete totals unknown', () => {
    const data = input();
    Reflect.deleteProperty(data.trials[1].usage.entries[1], 'costUsd');
    const c = generateExecutionMetrics(data).cohorts[0];
    expect(c.usage.candidate.costUsd).toBeNull();
    expect(c.usage.candidate.reported.costUsd).toBeCloseTo(0.4);
    expect(c.usage.candidate.calls).toBe(3);
    data.trials[1].usage.complete = false;
    expect(generateExecutionMetrics(data).cohorts[0].usage.candidate.calls).toBeNull();
  });

  it('distinguishes explicitly measured zero cost from missing cost', () => {
    const usage = trial('0', 'baseline').usage;
    usage.entries.forEach((e) => {
      e.costUsd = 0;
    });
    expect(summarizeUsage(usage).costUsd).toBe(0);
  });

  it('does not turn a fast timeout or unknown duration into an accepted speed gain', () => {
    const data = input();
    data.trials[1].status = 'timed-out';
    Object.assign(data.trials[1], { elapsedMs: null });
    const c = generateExecutionMetrics(data).cohorts[0];
    expect(c.elapsedMs.candidate).toMatchObject({
      count: 1,
      observedCount: 0,
      median: null,
      p95: null,
    });
    expect(c.pairedElapsedDeltaMs.mean).toBeNull();
    expect(c.observedMedianReductionFraction).toBeNull();
    expect(c.observedTargetMet).toBe(false);
  });

  it('reports small-sample uncertainty and undefined zero-baseline ratios honestly', () => {
    const c = generateExecutionMetrics(input([[0, 0]])).cohorts[0];
    expect(c.pairedElapsedDeltaMs.standardError).toBeNull();
    expect(c.observedMedianReductionFraction).toBeNull();
    expect(c.observedTargetMet).toBe(false);
    expect(c.uncertainty).toMatch(/descriptive|sample/i);
    expect(generateExecutionMetrics(input([]))).toMatchObject({
      trialCount: 0,
      pairCount: 0,
      cohorts: [],
      productSpeedClaimSupported: false,
    });
  });

  it('does not hide worse slow-case performance behind the median', () => {
    const c = generateExecutionMetrics(
      input([
        [100, 50],
        [100, 50],
        [100, 500],
      ])
    ).cohorts[0];
    expect(c.observedMedianReductionFraction).toBe(0.5);
    expect(c.observedTargetMet).toBe(false);
  });

  it('keeps synthetic, local-process and declared native results in separate cohorts', () => {
    const data = input([
      [100, 50],
      [1000, 900],
      [10, 9],
    ]);
    data.trials.slice(2, 4).forEach((t) => {
      t.measurementClass = 'native-host';
    });
    data.trials.slice(4).forEach((t) => {
      t.measurementClass = 'local-process';
    });
    const report = generateExecutionMetrics(data);
    expect(report.cohorts).toHaveLength(3);
    expect(report.cohorts.map((c: { pairCount: number }) => c.pairCount)).toEqual([1, 1, 1]);
    expect(report.productSpeedClaimSupported).toBe(false);
    expect(report.nativeEvidenceAuthenticated).toBe(false);
  });

  it.each([
    'orphan',
    'duplicate-trial',
    'duplicate-arm',
    'duplicate-usage',
    'reused-execution',
    'duplicate-check',
  ])('rejects %s data instead of double counting or selecting favourable records', (kind) => {
    const data = input();
    if (kind === 'orphan') data.trials.pop();
    if (kind === 'duplicate-trial') data.trials.push(structuredClone(data.trials[0]));
    if (kind === 'duplicate-arm')
      data.trials.push({ ...structuredClone(data.trials[0]), trialId: 'extra' });
    if (kind === 'duplicate-usage')
      data.trials[0].usage.entries.push(structuredClone(data.trials[0].usage.entries[0]));
    if (kind === 'reused-execution')
      data.trials[1].usage.entries[0].executionId = data.trials[0].usage.entries[0].executionId;
    if (kind === 'duplicate-check')
      data.trials[0].checks.push(structuredClone(data.trials[0].checks[0]));
    expect(() => generateExecutionMetrics(data)).toThrow();
  });

  it.each([-1, Infinity, NaN, '10'])('rejects invalid duration or costs: %s', (value) => {
    const data = input();
    Object.assign(data.trials[0], { elapsedMs: value });
    expect(() => generateExecutionMetrics(data)).toThrow();
    data.trials[0].elapsedMs = 100;
    Object.assign(data.trials[0].usage.entries[0], { costUsd: value });
    expect(() => generateExecutionMetrics(data)).toThrow();
  });

  it('rejects unsupported schemas, invalid states and unsupported fields', () => {
    const data = input();
    expect(() => generateExecutionMetrics({ ...data, schemaVersion: 2 })).toThrow();
    data.trials[0].status = 'success';
    expect(() => generateExecutionMetrics(data)).toThrow();
    data.trials[0].status = 'verified';
    Object.assign(data.trials[0].usage.entries[0], { cost: 1 });
    expect(() => generateExecutionMetrics(data)).toThrow();
  });

  it.each(['calls', 'inputTokens', 'outputTokens', 'attempt'])(
    'rejects fractional %s rather than rounding usage down',
    (metric) => {
      const data = input();
      Object.assign(data.trials[0].usage.entries[0], { [metric]: 1.5 });
      expect(() => generateExecutionMetrics(data)).toThrow();
    }
  );

  it('rejects oversized trial populations, usage ledgers, and overflowing totals', () => {
    const data = input();
    expect(() =>
      generateExecutionMetrics({ ...data, trials: Array(2001).fill(data.trials[0]) })
    ).toThrow(/COUNT/);
    expect(() =>
      summarizeUsage({
        complete: true,
        entries: Array(10001).fill(data.trials[0].usage.entries[0]),
      })
    ).toThrow(/USAGE/);
    data.trials[0].usage.entries.forEach((e) => {
      e.calls = Number.MAX_SAFE_INTEGER;
    });
    expect(() => generateExecutionMetrics(data)).toThrow(/OVERFLOW/);
  });

  it('does not pool different cases or environments into a misleading aggregate gain', () => {
    const data = input([
      [100, 10],
      [10000, 20000],
    ]);
    data.trials.slice(2).forEach((t) => {
      t.caseId = 'dependent-tasks';
    });
    const report = generateExecutionMetrics(data);
    expect(report.cohorts).toHaveLength(2);
    expect(report).not.toHaveProperty('observedMedianReductionFraction');
  });

  it('reads a JSON file without modifying it, and reports file access errors', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gofer-metrics-'));
    const file = path.join(root, 'trials.json');
    const body = JSON.stringify(input());
    try {
      writeFileSync(file, body);
      const result = spawnSync(process.execPath, [script, '--input', file, '--json'], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).pairCount).toBe(1);
      expect(readFileSync(file, 'utf8')).toBe(body);
      expect(
        spawnSync(process.execPath, [script, '--input', path.join(root, 'missing')]).status
      ).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('prints read-only JSON from stdin, help, and nonzero errors for bad input', () => {
    const run = (args: string[], body?: string) =>
      spawnSync(process.execPath, [script, ...args], { input: body, encoding: 'utf8' });
    const json = run(['--input', '-', '--json'], JSON.stringify(input()));
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout).trialCount).toBe(2);
    expect(run(['--help']).stdout).toContain('--input');
    expect(run(['--bogus']).status).toBe(1);
    expect(run(['--input']).status).toBe(1);
    expect(run(['--input', '-'], '{').status).toBe(1);
    expect(run(['--input', '-'], 'x'.repeat(8 * 1024 * 1024 + 1)).status).toBe(1);
  });

  it('formats unknowns explicitly without presenting a product gain', () => {
    const data = input();
    Object.assign(data.trials[1], { usage: null });
    const markdown = formatMarkdown(generateExecutionMetrics(data));
    expect(markdown).toContain('UNKNOWN');
    expect(markdown).toContain('synthetic');
    expect(markdown).toMatch(/not supported/i);
  });
});
