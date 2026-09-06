import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexCLIProvider } from '../../../../../extension/src/council/providers/cli/CodexCLIProvider';
import { ClaudeCodeCLIProvider } from '../../../../../extension/src/council/providers/cli/ClaudeCodeCLIProvider';
import { assertCLIModelOverride } from '../../../../../extension/src/council/providers/cli/CLIModelSelection';
import { ProviderErrorCode } from '../../../../../extension/src/council/providers/ProviderError';
import {
  DEFAULT_MODELS,
  HOST_DEFAULT_MODEL,
  type CLIModelCatalog,
  type CLIModelCatalogResolver,
  type CLIProviderId,
} from '../../../../../extension/src/council/types';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('child_process', async () => {
  // mock-justified: intercept the actual process boundary; never launch a model in tests.
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  const { promisify } = await import('util');
  const execFile = Object.assign(vi.fn(), { [promisify.custom]: execute });
  return { ...actual, execFile };
});

function catalog(providerId: CLIProviderId, cliCommand: string): CLIModelCatalog {
  return {
    providerId,
    cliCommand,
    source: 'live',
    accountScoped: true,
    observedAtMs: Date.now(),
    availableModelIds: ['account:exact-model'],
  };
}

beforeEach(() => {
  execute.mockReset().mockResolvedValue({ stdout: 'Response', stderr: '' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each([
  {
    Provider: CodexCLIProvider,
    id: 'codex-cli' as const,
    command: '/approved/codex',
    prefix: ['exec'],
  },
  {
    Provider: ClaudeCodeCLIProvider,
    id: 'claude-cli' as const,
    command: '/approved/claude',
    prefix: ['--print'],
  },
])('$id native defaults and launch authorization', ({ Provider, id, command, prefix }) => {
  it('does not select a static model or discover models for the native default', async () => {
    const discover = vi.fn<CLIModelCatalogResolver>();
    const provider = new Provider(command, undefined, discover);
    provider.status = 'available';
    const response = await provider.query({ prompt: 'Hello', systemPrompt: 'System context' });
    expect(discover).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledExactlyOnceWith(
      command,
      [...prefix, '--', 'System context\n\nHello'],
      {
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    expect(response.model).toBe(HOST_DEFAULT_MODEL);
    expect(response.model).not.toBe(DEFAULT_MODELS[id]);
    expect(provider.getConversationHistory()).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Response' },
    ]);
  });

  it.each([
    '--model other --dangerously-skip-permissions',
    'resume',
    'two\nlines "quoted" $(echo ignored)',
  ])('keeps prompt text separate from flags: %s', async (prompt) => {
    const provider = new Provider(command);
    provider.status = 'available';
    await provider.query({ prompt });
    expect(execute.mock.calls[0]?.[1]).toEqual([...prefix, '--', prompt]);
  });

  it('checks the exact live account catalog immediately before each launch', async () => {
    const discover = vi
      .fn<CLIModelCatalogResolver>()
      .mockImplementation(async ({ providerId, cliCommand }) => catalog(providerId, cliCommand));
    const provider = new Provider(command, 'account:exact-model', discover);
    provider.status = 'available';
    await provider.query({ prompt: 'First' });
    await provider.query({ prompt: 'Second' });
    expect(discover).toHaveBeenCalledTimes(2);
    expect(discover).toHaveBeenCalledWith({
      providerId: id,
      cliCommand: command,
      requestedModelId: 'account:exact-model',
      signal: expect.any(AbortSignal),
    });
    expect(execute).toHaveBeenLastCalledWith(
      command,
      [...prefix, '--model', 'account:exact-model', '--', 'Second'],
      expect.any(Object)
    );
  });

  it('does not launch or change history when discovery is unavailable', async () => {
    const provider = new Provider(command, 'account:exact-model');
    provider.status = 'available';
    await expect(provider.query({ prompt: 'Sensitive request' })).rejects.toMatchObject({
      code: ProviderErrorCode.NOT_CONFIGURED,
      retryable: false,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(provider.getConversationHistory()).toEqual([]);
    expect(provider.rateLimit.currentCount).toBe(0);
  });

  it('rejects aliases, prefixes and unavailable exact models without fallback', async () => {
    const discover = vi
      .fn<CLIModelCatalogResolver>()
      .mockImplementation(async () => catalog(id, command));
    for (const model of ['account', 'account:exact-model-v2', 'ACCOUNT:EXACT-MODEL']) {
      const provider = new Provider(command, model, discover);
      provider.status = 'available';
      await expect(provider.query({ prompt: 'Hello' })).rejects.toMatchObject({
        code: ProviderErrorCode.INVALID_REQUEST,
        retryable: false,
      });
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it('rechecks availability after a host account change', async () => {
    const discover = vi
      .fn<CLIModelCatalogResolver>()
      .mockImplementationOnce(async () => catalog(id, command))
      .mockImplementationOnce(async () => ({ ...catalog(id, command), availableModelIds: [] }));
    const provider = new Provider(command, 'account:exact-model', discover);
    provider.status = 'available';
    await provider.query({ prompt: 'First' });
    await expect(provider.query({ prompt: 'Second' })).rejects.toMatchObject({
      code: ProviderErrorCode.INVALID_REQUEST,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(discover).toHaveBeenCalledTimes(2);
  });
});

describe('live model catalog evidence', () => {
  const id = 'codex-cli';
  const command = '/approved/codex';
  const model = 'account:exact-model';

  it.each([
    null,
    { providerId: 'claude-cli' },
    { cliCommand: '/other/codex' },
    { source: 'cache' },
    { accountScoped: false },
    { observedAtMs: 0 },
    { observedAtMs: Number.MAX_SAFE_INTEGER },
    { observedAtMs: NaN },
    { availableModelIds: null },
    { availableModelIds: [model, 42] },
  ])('rejects unavailable, mismatched, stale or malformed catalog: %j', async (change) => {
    const discover = vi
      .fn()
      .mockImplementation(async () =>
        change === null ? null : { ...catalog(id, command), ...change }
      );
    await expect(assertCLIModelOverride(id, command, model, discover)).rejects.toMatchObject({
      code: ProviderErrorCode.NOT_CONFIGURED,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['', ' model', 'model ', '--model', 'a\nb', 'a\0b', HOST_DEFAULT_MODEL])(
    'rejects an invalid explicit override without discovery: %j',
    async (model) => {
      const discover = vi.fn<CLIModelCatalogResolver>();
      await expect(assertCLIModelOverride(id, command, model, discover)).rejects.toMatchObject({
        code: ProviderErrorCode.INVALID_REQUEST,
      });
      expect(discover).not.toHaveBeenCalled();
    }
  );

  it('does not expose account or credential details from discovery errors', async () => {
    const discover = vi
      .fn<CLIModelCatalogResolver>()
      .mockRejectedValue(new Error('private-account /private/config secret-value'));
    const failure = await assertCLIModelOverride(id, command, model, discover).catch(
      (error: unknown) => error
    );
    expect(failure).toMatchObject({ code: ProviderErrorCode.NOT_CONFIGURED, retryable: false });
    expect(String(failure)).not.toMatch(/private-account|private\/config|secret-value/);
  });

  it('bounds discovery, aborts it and never launches when it stalls', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const discover: CLIModelCatalogResolver = (request) => {
      signal = request.signal;
      return new Promise(() => {});
    };
    const result = expect(
      assertCLIModelOverride(id, command, model, discover)
    ).rejects.toMatchObject({ code: ProviderErrorCode.NOT_CONFIGURED, retryable: false });
    await vi.advanceTimersByTimeAsync(5000);
    await result;
    expect(signal?.aborted).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});
