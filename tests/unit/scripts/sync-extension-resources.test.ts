import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const { accessMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
}));

vi.mock('fs', () => ({
  promises: {
    access: accessMock,
  },
}));

describe('sync-extension-resources pathExists', () => {
  afterEach((): void => {
    accessMock.mockReset();
    vi.resetModules();
  });

  it('returns false for missing paths', async (): Promise<void> => {
    const error = new Error('missing') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    accessMock.mockRejectedValueOnce(error);

    const { pathExists } =
      await import('../../../.specify/scripts/node/sync-extension-resources.mjs');

    await expect(pathExists('/missing-path')).resolves.toBe(false);
  });

  it('rethrows non-ENOENT access errors', async (): Promise<void> => {
    const error = new Error('denied') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    accessMock.mockRejectedValueOnce(error);

    const { pathExists } =
      await import('../../../.specify/scripts/node/sync-extension-resources.mjs');

    await expect(pathExists('/denied-path')).rejects.toBe(error);
  });
});

describe('sync-extension-resources check mode', () => {
  it('verifies the checked-in extension resources without writing them', () => {
    const script = path.resolve('.specify/scripts/node/sync-extension-resources.mjs');
    // Other test files exercise the surface generator in parallel. It replaces
    // generated trees in several steps, so a check can briefly observe the
    // valid repository between two writes. Retry the read-only check; genuine
    // committed drift remains present and fails every attempt.
    let result = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
    for (let attempt = 1; result.status !== 0 && attempt < 5; attempt += 1) {
      result = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
    }

    expect(`${result.stdout}${result.stderr}`).toContain('extension/resources/ is in sync');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('extension/resources/ is in sync');
  });
});
