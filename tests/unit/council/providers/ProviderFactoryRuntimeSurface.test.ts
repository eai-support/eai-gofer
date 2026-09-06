import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ProviderFactoryCliResolver } from '../../../../extension/src/council/providers/ProviderFactoryCliResolver';
import { ProviderFactory } from '../../../../extension/src/council/providers/ProviderFactory';
import { CLIHealthChecker } from '../../../../extension/src/council/providers/cli/CLIHealthChecker';

vi.mock('../../../../extension/src/council/providers/cli/CLIHealthChecker', () => ({
  CLIHealthChecker: { check: vi.fn() },
}));

describe('Google autonomous surface boundaries', () => {
  let settings: Record<string, string>;
  const createCLIProvider = vi.fn();
  const resolver = new ProviderFactoryCliResolver({
    logger: { info: vi.fn(), warn: vi.fn() },
    createCLIProvider,
    resolveWorkflowProfileContext: () => 'standard',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    settings = {};
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: (key: string, fallback: string) => settings[key] ?? fallback,
    } as unknown as vscode.WorkspaceConfiguration);
  });

  it.each(['gemini', 'gemini-cli', 'antigravity', 'antigravity-desktop'])(
    'does not health-probe, launch, or fall back for explicit %s',
    async (surface) => {
      for (const key of ['cliProvider', 'defaultCLI']) {
        settings = { [key]: surface };
        await expect(resolver.getCLIProvider()).rejects.toThrow(/retired|blocked/);
      }
      settings = { defaultCLI: surface };
      await expect(resolver.autoDetectCLI()).rejects.toThrow(/retired|blocked/);
      await expect(new ProviderFactory().createCLIProvider(surface as 'claude')).rejects.toThrow(
        /retired|blocked/
      );
      expect(CLIHealthChecker.check).not.toHaveBeenCalled();
      expect(createCLIProvider).not.toHaveBeenCalled();
    }
  );

  it('keeps existing auto detection for non-Google configurations', async () => {
    vi.mocked(CLIHealthChecker.check).mockResolvedValue({
      available: true,
      authenticated: true,
      compatible: true,
    } as Awaited<ReturnType<typeof CLIHealthChecker.check>>);
    expect(await resolver.autoDetectCLI()).toBe('claude');
    expect(CLIHealthChecker.check).toHaveBeenCalledWith('claude', 'claude');
  });
});
