import { beforeEach, describe, expect, it, vi } from 'vitest';

const evaluate = vi.hoisted(() => vi.fn());
const isolation = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ execFileSync: () => 'codex-cli 9.9.9\n' }));
vi.mock('../../../.specify/scripts/node/gofer-local-isolation.mjs', () => ({
  inspectEaiLocalIsolation: isolation,
}));
vi.mock('../../../.specify/scripts/node/gofer-host-capability.mjs', () => ({
  createCodexAppServerRuntime: () => ({ inspect: async () => ({ models: [] }) }),
  evaluateNativeHost: evaluate,
  verifyCapabilityReceipt: () => true,
}));
vi.mock('../../../.specify/scripts/node/gofer-trusted-evaluator.mjs', () => ({
  loadActiveCodexEvaluatorKey: async () => ({ privateKey: 'private', keyId: 'key' }),
  resolveTrustedEvaluatorPublicKey: async () => 'public',
}));

import { issueLocalCapabilityReceipt } from '../../../.specify/scripts/node/gofer-local-capability-issuer.mjs';

beforeEach(() => {
  evaluate.mockReset();
  evaluate.mockResolvedValue({ receipt: true });
  isolation.mockReset();
  isolation.mockResolvedValue({ nativeExecutable: '/native/codex' });
});

describe('capability receipt lifetime', () => {
  it('keeps the evaluator default when no lifetime is asked for', async () => {
    await issueLocalCapabilityReceipt({ workspaceRoot: '/w' });
    expect(evaluate.mock.calls[0][1]).not.toHaveProperty('ttlMs');
  });

  it('passes a requested lifetime to the evaluator', async () => {
    await issueLocalCapabilityReceipt({ workspaceRoot: '/w', ttlMs: 4 * 60 * 60 * 1000 });
    expect(evaluate.mock.calls[0][1].ttlMs).toBe(4 * 60 * 60 * 1000);
  });

  it.each([
    ['too short', 59_999],
    ['too long', 6 * 60 * 60 * 1000 + 1],
    ['fractional', 90_000.5],
    ['negative', -1],
    ['not a number', '5'],
    ['zero', 0],
  ])('rejects a lifetime that is %s before doing any work', async (_name, ttlMs) => {
    await expect(issueLocalCapabilityReceipt({ workspaceRoot: '/w', ttlMs: ttlMs as number })).rejects.toThrow(
      'RECEIPT_LIFETIME_OUT_OF_RANGE'
    );
    expect(isolation).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('accepts the exact bounds', async () => {
    await issueLocalCapabilityReceipt({ workspaceRoot: '/w', ttlMs: 60_000 });
    await issueLocalCapabilityReceipt({ workspaceRoot: '/w', ttlMs: 6 * 60 * 60 * 1000 });
    expect(evaluate).toHaveBeenCalledTimes(2);
  });
});
