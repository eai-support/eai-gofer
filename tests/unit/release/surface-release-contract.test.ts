import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, '../../..');

async function runVerifier(version: string, root = repoRoot) {
  return execFileAsync(
    'node',
    ['scripts/verify-surface-release-contract.mjs', '--version', version],
    {
      cwd: root,
    }
  );
}

describe('surface release contract', () => {
  it('verifies the packaged updater configures every supported surface', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const { stdout } = await runVerifier(version);

    expect(stdout).toContain(`Gofer release surface contract passed for v${version}.`);
  });

  it('catches a stale non-script runtime asset (e.g. a policy config) in extension/resources', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'gofer-release-parity-test-'));
    try {
      for (const relative of [
        'scripts/verify-surface-release-contract.mjs',
        'package.json',
        'extension/package.json',
        'extension/resources',
        'plugins/eai-gofer',
        '.specify',
        'README.md',
        'skills',
        'plugin-skills',
        '.claude',
        '.github',
        '.grok',
        '.agents',
        '.codex-plugin',
      ]) {
        const target = path.join(fixtureRoot, relative);
        await mkdir(path.dirname(target), { recursive: true });
        await cp(path.join(repoRoot, relative), target, { recursive: true });
      }
      await writeFile(
        path.join(fixtureRoot, 'extension/resources/specify-config/typesafe-semantic-review.json'),
        JSON.stringify({ tampered: true })
      );
      await expect(runVerifier(version, fixtureRoot)).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'Release runtime asset differs in extension/resources: .specify/config/typesafe-semantic-review.json'
        ),
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
