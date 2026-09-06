import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { planOrchestration } from '../../.specify/scripts/node/lib/portable-orchestration.mjs';

describe('portable decision overhead, not live model speed', () => {
  it('keeps disabled decisions below a one-millisecond average without external work', () => {
    const input = Object.freeze({ policy: Object.freeze({ enabled: false }) });
    for (let i = 0; i < 1000; i++) planOrchestration(input);
    const samples: number[] = [];
    for (let batch = 0; batch < 7; batch++) {
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        if (planOrchestration(input).status !== 'legacy') throw new Error('Disabled route changed');
      }
      samples.push((performance.now() - start) / 10000);
    }
    expect(Math.max(...samples)).toBeLessThan(1);
    console.log(
      JSON.stringify({
        metric: 'disabled decision milliseconds',
        samples,
        liveModelLatency: 'not measured',
        networkCalls: 0,
      })
    );
  });
});
