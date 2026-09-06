import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ProviderFactory } from '../../../../extension/src/council/providers/ProviderFactory';
import { CLIHealthChecker } from '../../../../extension/src/council/providers/cli/CLIHealthChecker';
import { CodexCLIProvider } from '../../../../extension/src/council/providers/cli/CodexCLIProvider';
import { ClaudeCodeCLIProvider } from '../../../../extension/src/council/providers/cli/ClaudeCodeCLIProvider';
import * as ModelDiscovery from '../../../../extension/src/council/providers/cli/CLIModelDiscovery';
import {
  HOST_DEFAULT_MODEL,
  type CLIModelCatalogResolver,
} from '../../../../extension/src/council/types';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('child_process', async () => {
  // mock-justified: no provider process or paid inference may run in a factory test.
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  const { promisify } = await import('util');
  return { ...actual, execFile: Object.assign(vi.fn(), { [promisify.custom]: execute }) };
});

beforeEach(() => {
  vi.spyOn(CLIHealthChecker, 'check').mockResolvedValue({
    available: true,
    compatible: true,
    authenticated: true,
    version: 'synthetic',
  });
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: <T>(key: string, fallback?: T) =>
      (
        ({
          claudeCodeCommand: '/configured/claude',
          codexCommand: '/configured/codex',
        }) as Record<string, string>
      )[key] ?? fallback,
  } as vscode.WorkspaceConfiguration);
  execute.mockReset().mockResolvedValue({ stdout: 'Response', stderr: '' });
});
afterEach(() => vi.restoreAllMocks());

describe('ProviderFactory preserves native CLI model selection', () => {
  it('wires explicit Codex requests to the default live adapter without caller injection', async () => {
    const discover = vi
      .spyOn(ModelDiscovery, 'discoverCLIModels')
      .mockImplementation(async ({ providerId, cliCommand, requestedModelId }) => ({
        providerId,
        cliCommand,
        source: 'live',
        accountScoped: true,
        observedAtMs: Date.now(),
        availableModelIds: [requestedModelId],
      }));
    const provider = await new ProviderFactory().createCLIProvider(
      'codex',
      '/custom/codex',
      'standard',
      'account:chosen-model'
    );
    provider.status = 'available';
    await provider.query({ prompt: 'Hello' });
    expect(discover).toHaveBeenCalledExactlyOnceWith({
      providerId: 'codex-cli',
      cliCommand: '/custom/codex',
      requestedModelId: 'account:chosen-model',
      signal: expect.any(AbortSignal),
    });
    expect(execute.mock.calls[0]?.[1]).toEqual([
      'exec',
      '--model',
      'account:chosen-model',
      '--',
      'Hello',
    ]);
  });

  it('leaves native defaults alone even when a live adapter is available', async () => {
    const discover = vi.spyOn(ModelDiscovery, 'discoverCLIModels');
    const provider = await new ProviderFactory().createCLIProvider(
      'codex',
      '/custom/codex',
      'standard'
    );
    provider.status = 'available';
    await provider.query({ prompt: 'Hello' });
    expect(discover).not.toHaveBeenCalled();
    expect(execute.mock.calls[0]?.[1]).toEqual(['exec', '--', 'Hello']);
  });

  it.each(['claude', 'codex'] as const)(
    'does not inject the accounting default into %s',
    async (host) => {
      const discover = vi.fn<CLIModelCatalogResolver>();
      const factory = new ProviderFactory(discover);
      const provider = await factory.createCLIProvider(host, undefined, 'standard');
      expect(provider).toBeInstanceOf(host === 'codex' ? CodexCLIProvider : ClaudeCodeCLIProvider);
      expect(provider.model).toBe(HOST_DEFAULT_MODEL);
      provider.status = 'available';
      await provider.query({ prompt: 'Hello' });
      expect(execute.mock.calls[0]?.[0]).toBe(`/configured/${host}`);
      expect(execute.mock.calls[0]?.[1]).toEqual([
        host === 'codex' ? 'exec' : '--print',
        '--',
        'Hello',
      ]);
      expect(discover).not.toHaveBeenCalled();
    }
  );

  it('passes an explicit override and the matching executable to live discovery', async () => {
    const discover = vi
      .fn<CLIModelCatalogResolver>()
      .mockImplementation(async ({ providerId, cliCommand }) => ({
        providerId,
        cliCommand,
        source: 'live',
        accountScoped: true,
        observedAtMs: Date.now(),
        availableModelIds: ['account:chosen-model'],
      }));
    const factory = new ProviderFactory(discover);
    const provider = await factory.createCLIProvider(
      'codex',
      '/custom/codex',
      'standard',
      'account:chosen-model'
    );
    expect(discover).not.toHaveBeenCalled();
    provider.status = 'available';
    await provider.query({ prompt: 'Hello' });
    expect(discover).toHaveBeenCalledWith({
      providerId: 'codex-cli',
      cliCommand: '/custom/codex',
      requestedModelId: 'account:chosen-model',
      signal: expect.any(AbortSignal),
    });
    expect(execute.mock.calls[0]?.[1]).toEqual([
      'exec',
      '--model',
      'account:chosen-model',
      '--',
      'Hello',
    ]);
  });

  it('keeps health and authentication failures blocking provider creation', async () => {
    vi.mocked(CLIHealthChecker.check).mockResolvedValue({
      available: true,
      compatible: true,
      authenticated: false,
      version: 'synthetic',
    });
    await expect(
      new ProviderFactory().createCLIProvider('codex', '/custom/codex', 'standard')
    ).rejects.toThrow('not authenticated');
    expect(execute).not.toHaveBeenCalled();
  });

  it('retains credential-redacted history when switching with native defaults', async () => {
    const factory = new ProviderFactory();
    const first = (await factory.createCLIProvider(
      'claude',
      undefined,
      'standard'
    )) as ClaudeCodeCLIProvider;
    first.setConversationHistory([{ role: 'user', content: 'Password: MySecretPass123!' }]);
    const next = (await factory.createCLIProvider(
      'codex',
      undefined,
      'standard'
    )) as CodexCLIProvider;
    const history = next.getConversationHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.content).toContain('[REDACTED:password]');
    expect(history[0]?.content).not.toContain('MySecretPass123!');
    expect(next.model).toBe(HOST_DEFAULT_MODEL);
  });
});
