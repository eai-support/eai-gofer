import { describe, expect, it, vi } from 'vitest';
import { settleBackgroundWrites } from '../../helpers/settleBackgroundWrites';

describe('background write cleanup', () => {
  it('waits for pending writes after a rejection and retains the original error', async () => {
    const failure = new Error('write failed');
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const cleanup = vi.fn();
    const result = settleBackgroundWrites([Promise.reject(failure), pending], cleanup);
    const assertion = expect(result).rejects.toMatchObject({ errors: [failure] });
    await Promise.resolve();
    await Promise.resolve();
    expect(cleanup).not.toHaveBeenCalled();
    finish();
    await assertion;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('reports write and cleanup failures together', async () => {
    const writeFailure = new Error('write failed');
    const cleanupFailure = new Error('cleanup failed');
    await expect(
      settleBackgroundWrites([Promise.reject(writeFailure)], () => {
        throw cleanupFailure;
      })
    ).rejects.toMatchObject({ errors: [writeFailure, cleanupFailure] });
  });

  it('cleans up after successful writes', async () => {
    const cleanup = vi.fn();
    await settleBackgroundWrites([Promise.resolve()], cleanup);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
