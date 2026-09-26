import { describe, expect, it } from 'vitest';

import { markdown } from '../../../.specify/scripts/node/gofer-dependency-admission-summary.mjs';

describe('gofer dependency admission summary', () => {
  it('reports approved packages in concise pull request language', () => {
    expect(
      markdown({
        decision: 'allow',
        policyVersion: '1.0.0',
        summary: { packages: 2 },
        packages: [],
      })
    ).toContain('## Dependency admission: Approved');
  });

  it('reports a block and a safe next action', () => {
    const output = markdown({
      decision: 'block',
      policyVersion: '1.0.0',
      summary: { packages: 1 },
      packages: [
        {
          name: 'unsafe',
          version: '1.0.0',
          decision: 'block',
          findings: [{ message: 'Known malware.' }],
        },
      ],
    });
    expect(output).toContain('## Dependency admission: Blocked');
    expect(output).toContain('`unsafe@1.0.0`: Known malware.');
    expect(output).toContain('Use a safe version');
  });
});
