import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, '../../..');

async function runVerifier(version: string) {
  return execFileAsync('node', ['scripts/verify-surface-release-contract.mjs', '--version', version], {
    cwd: repoRoot,
  });
}

describe('surface release contract', () => {
  it('verifies the packaged updater configures every supported surface', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const { stdout } = await runVerifier(version);

    expect(stdout).toContain(`Gofer release surface contract passed for v${version}.`);
  });

  it('catches a stale non-script runtime asset (e.g. a policy config) in extension/resources', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const target = path.join(repoRoot, 'extension/resources/specify-config/typesafe-semantic-review.json');
    const original = await readFile(target, 'utf8');
    try {
      await writeFile(target, JSON.stringify({ tampered: true }));
      await expect(runVerifier(version)).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'Release runtime asset differs in extension/resources: .specify/config/typesafe-semantic-review.json'
        ),
      });
    } finally {
      await writeFile(target, original);
    }
  });
});
