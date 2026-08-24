import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('test coverage CI alignment', () => {
  it('uses the exact GitHub check names exposed by the required CI jobs', () => {
    const coverage = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, '.eai/test-coverage.json'), 'utf8')
    ) as {
      repositories: {
        'eai-gofer': {
          features: Array<{ required_ci_checks: string[] }>;
        };
      };
    };
    const workflow = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
    const expectedChecks = ['Code Quality Gates', 'Build & Test'];

    for (const feature of coverage.repositories['eai-gofer'].features) {
      expect(feature.required_ci_checks).toEqual(expectedChecks);
    }

    expect(workflow).toMatch(/quality-gates:\n\s+name: Code Quality Gates/);
    expect(workflow).toMatch(/build-test-required:\n\s+name: Build & Test/);
  });
});
