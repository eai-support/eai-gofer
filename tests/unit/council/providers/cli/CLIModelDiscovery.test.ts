import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCLIModelCatalogResolver } from '../../../../../extension/src/council/providers/cli/CLIModelDiscovery';
import type { DiscoveryResult } from '../../../../../.specify/scripts/node/lib/model-discovery.mjs';

const { spawnProcess } = vi.hoisted(() => ({ spawnProcess: vi.fn() }));
vi.mock('node:child_process', async () => {
  // mock-justified: verify the metadata process boundary without starting a real host.
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, spawn: spawnProcess };
});

function advertised(): DiscoveryResult {
  return {
    status: 'advertised',
    reason: 'model_advertised',
    host: 'codex',
    surface: 'cli',
    profile: null,
    source: { kind: 'codex-app-server', ref: 'account/read + model/list', accountScoped: true },
    authMode: 'chatgpt',
    authContextId: 'live-probe:account-context',
    accountBinding: 'live-probe',
    observedAtMs: Date.now(),
    models: [
      {
        id: 'account:exact-model',
        isDefault: true,
        reasoningEfforts: null,
        defaultReasoningEffort: null,
      },
    ],
    defaultModelId: 'account:exact-model',
    configurationRead: true,
    configuredModelId: null,
    configuredModelAdvertised: null,
    configuredReasoningEffort: null,
    check: {
      modelId: 'account:exact-model',
      selectedFrom: 'requested',
      modelAdvertised: true,
      reasoningEffort: null,
      reasoningAdvertised: null,
    },
    executionVerified: false,
    guidance: 'Synthetic catalog only',
  };
}

function request() {
  return {
    providerId: 'codex-cli' as const,
    cliCommand: '/same executable/codex',
    requestedModelId: 'account:exact-model',
    signal: new AbortController().signal,
  };
}

beforeEach(() => spawnProcess.mockReset());

describe('bundled live Codex discovery adapter', () => {
  it('uses the exact launch executable, live account evidence and read-only configuration discovery', async () => {
    const discoverModels = vi.fn().mockResolvedValue(advertised());
    const resolver = createCLIModelCatalogResolver(async () => ({ discoverModels }));
    const input = request();
    const catalog = await resolver(input);
    expect(catalog).toMatchObject({
      providerId: 'codex-cli',
      cliCommand: input.cliCommand,
      source: 'live',
      accountScoped: true,
      availableModelIds: ['account:exact-model'],
    });
    expect(discoverModels.mock.calls[0]?.[0]).toEqual({
      host: 'codex',
      surface: 'cli',
      expectedAuthMode: 'chatgpt',
      requestedModelId: input.requestedModelId,
      readConfig: true,
      timeoutMs: 4000,
    });
    const adapters = discoverModels.mock.calls[0]?.[1];
    expect(adapters.invocation()).toEqual({
      command: input.cliCommand,
      args: ['app-server', '--stdio'],
    });
    adapters.spawnProcess(input.cliCommand, ['app-server', '--stdio'], {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: true,
    });
    expect(spawnProcess).toHaveBeenCalledExactlyOnceWith(
      input.cliCommand,
      ['app-server', '--stdio'],
      {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: true,
        signal: input.signal,
      }
    );
  });

  it.each([
    { status: 'unavailable' },
    { status: 'invalid' },
    { host: 'claude' },
    { surface: 'desktop' },
    { profile: 'other-profile' },
    { authMode: 'apiKey' },
    { source: { kind: 'native-catalog', accountScoped: true } },
    { source: { kind: 'codex-app-server', accountScoped: false } },
    { accountBinding: 'caller-asserted' },
    { accountBinding: null },
    { accountBinding: undefined },
    { configurationRead: false },
    { configurationRead: undefined },
    { configurationRead: 'true' },
    { configuredReasoningEffort: undefined },
    { check: { modelId: 'other-model', modelAdvertised: true } },
    { check: { modelId: 'account:exact-model', modelAdvertised: false } },
    { observedAtMs: null },
  ])('blocks mismatched or unverified metadata without fallback: %j', async (change) => {
    const discoverModels = vi.fn().mockResolvedValue({ ...advertised(), ...change });
    const resolver = createCLIModelCatalogResolver(async () => ({ discoverModels }));
    expect(await resolver(request())).toBeNull();
    expect(discoverModels).toHaveBeenCalledTimes(1);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it.each([
    null,
    undefined,
    '',
    ' context',
    'context ',
    'context\n',
    'account@example.com',
    'a'.repeat(129),
    42,
  ])('rejects an invalid or missing live account context: %j', async (authContextId) => {
    const discoverModels = vi.fn().mockResolvedValue({ ...advertised(), authContextId });
    const resolver = createCLIModelCatalogResolver(async () => ({ discoverModels }));
    expect(await resolver(request())).toBeNull();
  });

  it.each(['configured', 'host-default', 'none', undefined])(
    'rejects evidence for a selection other than the requested override: %j',
    async (selectedFrom) => {
      const result = advertised();
      const discoverModels = vi.fn().mockResolvedValue({
        ...result,
        check: { ...result.check, selectedFrom },
      });
      const resolver = createCLIModelCatalogResolver(async () => ({ discoverModels }));
      expect(await resolver(request())).toBeNull();
    }
  );

  it.each(['max', 'ultra', 'provider-defined-effort'])(
    'preserves advertised inherited effort %s across an explicit model change',
    async (effort) => {
      const result = advertised();
      result.configuredModelId = 'account:previous-model';
      result.configuredReasoningEffort = effort;
      result.models[0].reasoningEfforts = [effort];
      result.check!.reasoningEffort = effort;
      result.check!.reasoningAdvertised = true;
      const before = structuredClone(result);
      const discoverModels = vi.fn().mockResolvedValue(result);
      const resolver = createCLIModelCatalogResolver(async () => ({ discoverModels }));
      expect(await resolver(request())).toMatchObject({
        availableModelIds: ['account:exact-model'],
      });
      expect(result).toEqual(before);
      expect(discoverModels.mock.calls[0]?.[0]).not.toHaveProperty('requestedReasoningEffort');
    }
  );

  it.each([
    { effort: 'ultra', checked: null, supported: ['low'], advertised: false },
    { effort: 'ultra', checked: null, supported: null, advertised: null },
    { effort: 'ultra', checked: 'low', supported: ['low'], advertised: true },
    { effort: 'ultra', checked: 'ultra', supported: ['low'], advertised: true },
    { effort: 'ultra', checked: 'ultra', supported: null, advertised: true },
    { effort: '', checked: '', supported: [''], advertised: true },
    { effort: null, checked: null, supported: ['low'], advertised: false },
  ])('blocks unsupported or substituted inherited reasoning: %j', async (change) => {
    const result = advertised();
    result.configuredModelId = 'account:previous-model';
    result.configuredReasoningEffort = change.effort;
    result.models[0].reasoningEfforts = change.supported;
    result.check!.reasoningEffort = change.checked;
    result.check!.reasoningAdvertised = change.advertised;
    const discoverModels = vi.fn().mockResolvedValue(result);
    const resolver = createCLIModelCatalogResolver(async () => ({ discoverModels }));
    expect(await resolver(request())).toBeNull();
    expect(discoverModels).toHaveBeenCalledTimes(1);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('blocks Claude without guessing models or starting Codex discovery', async () => {
    const load = vi.fn();
    const resolver = createCLIModelCatalogResolver(load);
    expect(await resolver({ ...request(), providerId: 'claude-cli' })).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('fails safely when the installed helper cannot be loaded', async () => {
    const resolver = createCLIModelCatalogResolver(async () => {
      throw new Error('private path or account details');
    });
    expect(await resolver(request())).toBeNull();
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('does not start discovery after cancellation during resource loading', async () => {
    const controller = new AbortController();
    const discoverModels = vi.fn();
    const resolver = createCLIModelCatalogResolver(async () => {
      controller.abort();
      return { discoverModels };
    });
    expect(await resolver({ ...request(), signal: controller.signal })).toBeNull();
    expect(discoverModels).not.toHaveBeenCalled();
  });
});
