import { afterAll, describe, expect, it } from 'vitest';
import { createIsolationRepository, localIsolationReport } from './local-isolation-fixture.js';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import {
  HOSTS,
  HOST_ALIASES,
  createCapabilityReceipt,
  createCodexAppServerRuntime,
  evaluateNativeHost,
  inspectHost,
  selectLiveModel,
  verifyCapabilityReceipt,
} from '../../../.specify/scripts/node/gofer-host-capability.mjs';

describe('Gofer host capability discovery', () => {
  const fixture = createIsolationRepository();
  const localCodexIsolation = () => localIsolationReport(fixture.worktree);
  afterAll(() => fixture.cleanup());
  it('does not guess a host or model when auto detection lacks a runtime signal', async () => {
    await expect(inspectHost('auto')).resolves.toMatchObject({
      status: 'host-name-required',
      models: [],
      modelDiscovery: 'host-runtime-required',
    });
  });

  it('runs the CLI when invoked with the documented relative script path', () => {
    const result = spawnSync(
      process.execPath,
      ['.specify/scripts/node/gofer-host-capability.mjs', '--host', 'auto', '--json'],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'host-name-required' });
  });

  it('records only an executable probe, not model or isolation qualification', async () => {
    const result = await inspectHost('codex', {
      run: async () => ({ ok: true, version: 'codex 1.2.3' }),
    });
    expect(result).toMatchObject({
      host: 'codex',
      status: 'available',
      version: 'codex 1.2.3',
      models: [],
      independentExecution: 'unqualified',
    });
  });

  it('does not substitute a different host when a requested host is unavailable', async () => {
    const result = await inspectHost('claude', { run: async () => ({ ok: false, version: null }) });
    expect(result).toMatchObject({ host: 'claude', status: 'unavailable' });
  });

  it('rejects unknown host names', async () => {
    await expect(inspectHost('made-up')).rejects.toThrow('unsupported host');
  });

  it('uses one canonical host identity and executable across all aliases', async () => {
    for (const [alias, canonical] of Object.entries(HOST_ALIASES)) {
      const result = await inspectHost(alias, {
        run: async () => ({ ok: true, version: 'available' }),
      });
      expect(result.host).toBe(canonical);
      expect(result.executable).toBe(HOSTS[canonical].program);
    }
    expect(HOSTS.antigravity.program).toBe('agy');
  });

  it('selects models only from a fresh, host-bound evaluation receipt', () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = createCapabilityReceipt({
      host: 'openai-codex',
      evaluatorVersion: '1.0.0',
      evaluationId: 'eval-1',
      evaluatedAt: '2026-09-17T00:00:00.000Z',
      expiresAt: '2026-09-18T00:00:00.000Z',
      hostVersion: 'codex-cli 0.154.0',
      reasoningCapabilities: ['high'],
      toolCapabilities: ['shell'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'worktree',
      provenance: {
        evaluator: 'gofer-host-evaluator',
        source: 'codex --version',
        keyId: 'test-key',
      },
      signingKey: keys.privateKey,
      models: [{ id: 'gpt-current', reasoningEfforts: ['low', 'high'] }],
    });
    expect(
      verifyCapabilityReceipt(receipt, {
        publicKey: keys.publicKey,
        host: 'codex',
        now: Date.parse('2026-09-17T12:00:00Z'),
      })
    ).toBe(true);
    expect(
      verifyCapabilityReceipt(
        { ...receipt, host: 'unknown-host' },
        {
          publicKey: keys.publicKey,
          now: Date.parse('2026-09-17T12:00:00Z'),
        }
      )
    ).toBe(false);
    expect(
      verifyCapabilityReceipt(receipt, {
        publicKey: keys.publicKey,
        host: 'codex',
        requiredCapabilities: { reasoningEfforts: ['high'] },
        now: Date.parse('2026-09-17T12:00:00Z'),
      })
    ).toBe(true);
    expect(
      verifyCapabilityReceipt(receipt, {
        publicKey: keys.publicKey,
        host: 'codex',
        requiredCapabilities: { reasoningEfforts: ['medium'] },
        now: Date.parse('2026-09-17T12:00:00Z'),
      })
    ).toBe(false);
    expect(
      verifyCapabilityReceipt(receipt, {
        publicKey: keys.publicKey,
        host: 'codex',
        now: Date.parse('2026-09-16T23:59:59Z'),
      })
    ).toBe(false);
    expect(
      selectLiveModel(receipt, {
        host: 'codex',
        modelId: 'gpt-current',
        publicKey: keys.publicKey,
        now: Date.parse('2026-09-17T12:00:00Z'),
      })
    ).toMatchObject({ host: 'codex', evaluationId: 'eval-1', model: { id: 'gpt-current' } });
    expect(() =>
      selectLiveModel(receipt, {
        host: 'codex',
        modelId: 'gpt-current',
        publicKey: keys.publicKey,
        requiredCapabilities: { grantedPermissions: ['network'] },
      })
    ).toThrow('unavailable');
    expect(() =>
      selectLiveModel(receipt, {
        host: 'claude',
        modelId: 'gpt-current',
        publicKey: keys.publicKey,
      })
    ).toThrow('unavailable');
    expect(() =>
      selectLiveModel(receipt, { host: 'codex', modelId: 'missing', publicKey: keys.publicKey })
    ).toThrow('current host receipt');
  });

  it('issues a signed receipt from native Antigravity output and trusted session inspection', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = await evaluateNativeHost('antigravity', {
      signingKey: keys.privateKey,
      keyId: 'host-key',
      now: () => new Date('2026-09-17T12:00:00.000Z'),
      run: async ({ args }: { args: string[] }) =>
        args[0] === 'models'
          ? { ok: true, version: 'gemini-3.8-flash-high\tGemini 3.8 Flash (High)\n' }
          : { ok: true, version: 'agy 1.1.27' },
      runtime: {
        inspect: async () => ({
          reasoningCapabilities: ['high'],
          toolCapabilities: ['shell'],
          grantedPermissions: ['workspace-write'],
          isolationClass: 'worktree',
          source: 'agy session configuration',
        }),
      },
    });
    expect(
      verifyCapabilityReceipt(receipt, {
        publicKey: keys.publicKey,
        host: 'antigravity',
        now: Date.parse('2026-09-17T12:01:00Z'),
      })
    ).toBe(true);
    expect(receipt.models).toEqual([{ id: 'gemini-3.8-flash-high', reasoningEfforts: ['high'] }]);
  });

  it('uses a trusted native session integration when a host exposes no model-list command', async () => {
    const keys = generateKeyPairSync('ed25519');
    const receipt = await evaluateNativeHost('codex', {
      signingKey: keys.privateKey,
      keyId: 'host-key',
      now: () => new Date('2026-09-17T12:00:00.000Z'),
      run: async () => ({ ok: true, version: 'codex 0.154.0' }),
      runtime: {
        inspect: async () => ({
          models: [{ id: 'gpt-live', reasoningEfforts: ['high'] }],
          reasoningCapabilities: ['high'],
          toolCapabilities: ['shell'],
          grantedPermissions: ['workspace-write'],
          isolationClass: 'worktree',
          source: 'codex app-server capability endpoint',
        }),
      },
    });
    expect(
      verifyCapabilityReceipt(receipt, {
        publicKey: keys.publicKey,
        host: 'codex',
        now: Date.parse('2026-09-17T12:01:00Z'),
      })
    ).toBe(true);
  });

  it('reads live Codex models and provider capabilities from the local app-server only', async () => {
    const runtime = createCodexAppServerRuntime({
      workspaceRoot: fixture.worktree,
      localIsolation: localCodexIsolation(),
      request: async (method: string) =>
        method === 'model/list'
          ? { data: [{ id: 'gpt-live', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }] }
          : { namespaceTools: true, imageGeneration: false, webSearch: true },
    });
    await expect(runtime.inspect()).resolves.toEqual({
      models: [{ id: 'gpt-live', reasoningEfforts: ['high'] }],
      reasoningCapabilities: ['high'],
      toolCapabilities: ['namespaceTools', 'webSearch'],
      grantedPermissions: ['workspace-write'],
      isolationClass: 'git-worktree+local-os-sandbox',
      source: 'codex app-server model/list and modelProvider/capabilities/read',
    });
    expect(() =>
      createCodexAppServerRuntime({
        workspaceRoot: fixture.worktree,
        localIsolation: { ...localCodexIsolation(), cloudExecution: 'allowed' },
      })
    ).toThrow('LOCAL_SANDBOX_REQUIRED');
    expect(() =>
      createCodexAppServerRuntime({
        workspaceRoot: fixture.worktree,
        localIsolation: { ...localCodexIsolation(), nativeExecutable: undefined },
      })
    ).toThrow('NATIVE_CODEX_CATALOG_REQUIRED');
  });

  it('fails closed when a native session omits its model list', async () => {
    const keys = generateKeyPairSync('ed25519');
    await expect(
      evaluateNativeHost('codex', {
        signingKey: keys.privateKey,
        keyId: 'host-key',
        run: async () => ({ ok: true, version: 'codex 0.154.0' }),
        runtime: {
          inspect: async () => ({
            reasoningCapabilities: [],
            toolCapabilities: [],
            grantedPermissions: [],
            isolationClass: 'worktree',
            source: 'session',
          }),
        },
      })
    ).rejects.toThrow('native capability evidence is incomplete');
  });
});
