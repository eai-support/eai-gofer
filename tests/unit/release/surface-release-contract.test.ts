import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, '../../..');

describe('surface release contract', () => {
  it('verifies the packaged updater configures every supported surface', async () => {
    const { version } = await import(path.join(repoRoot, 'package.json'));
    const { stdout } = await execFileAsync(
      'node',
      ['scripts/verify-surface-release-contract.mjs', '--version', version],
      { cwd: repoRoot }
    );

    expect(stdout).toContain(`Gofer release surface contract passed for v${version};`);
    expect(stdout).toContain('native app loading is not tested.');
  });
});
