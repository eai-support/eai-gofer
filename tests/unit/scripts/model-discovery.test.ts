import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkModelCatalog as checkRawCatalog,
  codexInvocation,
  discoverModels,
} from '../../../.specify/scripts/node/lib/model-discovery.mjs';
import type {
  CatalogSnapshot,
  DiscoveryAdapters,
  DiscoveryOptions,
} from '../../../.specify/scripts/node/lib/model-discovery.mjs';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, stat: vi.fn(actual.stat) };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = path.join(ROOT, '.specify/scripts/node/gofer-model-discovery.mjs');
const NOW = 1_800_000_000_000;
const AUTH_CONTEXT = 'opaque-test-account-context';
const options = (change: Partial<DiscoveryOptions> = {}): DiscoveryOptions & { nowMs: number } => ({
  host: 'codex',
  surface: 'cli',
  nowMs: NOW,
  ...change,
});
const checkModelCatalog = (snapshot: unknown, opts: DiscoveryOptions & { nowMs: number }) =>
  checkRawCatalog(snapshot, { expectedAuthContextId: AUTH_CONTEXT, ...opts });
function catalog(change: Partial<CatalogSnapshot> = {}): CatalogSnapshot {
  return {
    source: { kind: 'native-catalog', ref: 'trusted native picker', accountScoped: true },
    host: 'codex',
    surface: 'cli',
    authMode: 'chatgpt',
    authContextId: AUTH_CONTEXT,
    observedAtMs: NOW - 100,
    models: [
      {
        id: 'host-model-a',
        isDefault: true,
        reasoningEfforts: ['low', 'high'],
        defaultReasoningEffort: 'low',
      },
      {
        id: 'host-model-b',
        isDefault: false,
        reasoningEfforts: null,
        defaultReasoningEffort: null,
      },
    ],
    configurationRead: true,
    configuredModelId: 'host-model-a',
    configuredReasoningEffort: null,
    ...change,
  };
}
function nativeModel(id = 'host-model-a', isDefault = true) {
  return {
    id: `ui:${id}`,
    model: id,
    isDefault,
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: 'private metadata' },
      { reasoningEffort: 'high' },
    ],
    defaultReasoningEffort: 'low',
    displayName: 'not-an-id',
    upgrade: 'unapproved-upgrade',
  };
}
type Message = { id?: number; method: string; params: Record<string, unknown> };
function fakeServer(reply?: (message: Message) => unknown) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn((_signal?: string) => {
      void _signal;
      child.emit('close', 0);
      return true;
    }),
  });
  const messages: Message[] = [];
  const defaults = (m: Message): unknown => {
    if (m.method === 'initialize') return { userAgent: 'codex/fixture' };
    if (m.method === 'account/read')
      return {
        account: { type: 'chatgpt', email: 'private@example.com', token: 'never-print-account' },
        requiresOpenaiAuth: true,
      };
    if (m.method === 'model/list') return { data: [nativeModel()], nextCursor: null };
    if (m.method === 'config/read')
      return {
        config: {
          model: 'host-model-a',
          model_reasoning_effort: 'high',
          env: { API_KEY: 'never-print-config' },
        },
        origins: {},
      };
    return undefined;
  };
  child.stdin.on('data', (chunk) => {
    const message = JSON.parse(chunk.toString()) as Message;
    messages.push(message);
    if (message.method === 'initialized') return;
    queueMicrotask(() => {
      const result = reply ? reply(message) : defaults(message);
      if (result !== undefined)
        child.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`);
    });
  });
  const spawnProcess = vi.fn(() => child) as unknown as NonNullable<
    DiscoveryAdapters['spawnProcess']
  >;
  const adapters: DiscoveryAdapters = {
    now: () => NOW,
    spawnProcess,
    invocation: (profile) => codexInvocation(profile, { platform: 'linux' }),
    terminate: (_child, signal) => {
      child.kill(signal);
    },
  };
  return { child, messages, adapters, defaults, spawnProcess };
}

describe('strict surface/account-bound catalog checks', () => {
  it.each(['claude', 'codex', 'copilot', 'antigravity', 'vscode', 'grok', 'grok-bot'])(
    'checks %s only against its supplied native evidence',
    (host) => {
      expect(checkModelCatalog(catalog({ host }), options({ host }))).toMatchObject({
        status: 'advertised',
        executionVerified: false,
      });
    }
  );
  it.each(['cli', 'desktop', 'ide', 'vscode-extension'] as const)(
    'does not infer another surface from %s evidence',
    (surface) => {
      const snapshot = catalog({ surface });
      expect(checkModelCatalog(snapshot, options({ surface })).status).toBe('advertised');
      expect(
        checkModelCatalog(snapshot, options({ surface: surface === 'cli' ? 'desktop' : 'cli' }))
          .reason
      ).toBe('surface_mismatch');
    }
  );
  it.each([
    ['wrong host', { host: 'claude' }, 'host_mismatch'],
    ['stale', { observedAtMs: NOW - 60_001 }, 'stale_catalog'],
    ['future', { observedAtMs: NOW + 1 }, 'future_catalog'],
    ['API instead of ChatGPT', { authMode: 'apiKey' }, 'auth_mode_mismatch'],
    ['logged out', { authMode: 'loggedOut' }, 'authentication_unavailable'],
    ['unknown auth', { authMode: 'unknown' }, 'authentication_unavailable'],
  ] as const)('rejects %s evidence', (_name, change, reason) => {
    expect(checkModelCatalog(catalog(change), options())).toMatchObject({
      status: 'unavailable',
      reason,
      models: [],
    });
  });
  it('keeps API-key catalogs explicitly API-key scoped', () => {
    const result = checkModelCatalog(
      catalog({ authMode: 'apiKey' }),
      options({ expectedAuthMode: 'apiKey' })
    );
    expect(result).toMatchObject({
      status: 'advertised',
      authMode: 'apiKey',
      executionVerified: false,
    });
  });
  it('checks profile scope without changing it', () => {
    expect(checkModelCatalog(catalog(), options({ profile: 'cloud' })).reason).toBe(
      'profile_mismatch'
    );
    expect(
      checkModelCatalog(catalog({ profile: 'cloud' }), options({ profile: 'cloud' })).status
    ).toBe('advertised');
  });
  it('keeps the unavailable configured model separate from the advertised host default', () => {
    const result = checkModelCatalog(catalog({ configuredModelId: 'gpt-5.4' }), options());
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'model_not_advertised',
      defaultModelId: 'host-model-a',
      configuredModelId: 'gpt-5.4',
      configuredModelAdvertised: false,
      check: { modelId: 'gpt-5.4', selectedFrom: 'configured' },
    });
  });
  it.each([
    'not-an-id',
    'unapproved-upgrade',
    'host-model-a-not-an-advertised-id',
    'HOST-MODEL-A',
    'missing',
  ])('does not guess requested model %s', (requestedModelId) => {
    expect(checkModelCatalog(catalog(), options({ requestedModelId }))).toMatchObject({
      reason: 'model_not_advertised',
      check: { modelAdvertised: false },
    });
  });
  it('uses only a reported host default, never the first listed model', () => {
    const snapshot = catalog({ configurationRead: false, configuredModelId: null });
    expect(checkModelCatalog(snapshot, options()).check?.selectedFrom).toBe('host-default');
    snapshot.models[0].isDefault = false;
    expect(checkModelCatalog(snapshot, options())).toMatchObject({
      reason: 'host_default_unavailable',
      defaultModelId: null,
    });
  });
  it('checks reasoning against the exact requested model and omits unknown/unsupported effort', () => {
    expect(
      checkModelCatalog(catalog(), options({ requestedReasoningEffort: 'high' }))
    ).toMatchObject({ status: 'advertised', check: { reasoningEffort: 'high' } });
    expect(
      checkModelCatalog(catalog(), options({ requestedReasoningEffort: 'ultra' }))
    ).toMatchObject({
      reason: 'reasoning_not_advertised',
      check: { reasoningEffort: null, reasoningAdvertised: false },
    });
    expect(
      checkModelCatalog(
        catalog(),
        options({ requestedModelId: 'host-model-b', requestedReasoningEffort: 'high' })
      )
    ).toMatchObject({
      reason: 'reasoning_not_advertised',
      check: { reasoningEffort: null, reasoningAdvertised: null },
    });
    expect(
      checkModelCatalog(catalog(), options({ requestedModelId: 'host-model-b' }))
    ).toMatchObject({ status: 'advertised', check: { reasoningEffort: null } });
  });
  it('inherits configured reasoning when the requested model changes', () => {
    const snapshot = catalog({ configuredReasoningEffort: 'ultra' });
    snapshot.models[1].reasoningEfforts = ['minimal'];
    snapshot.models[1].defaultReasoningEffort = 'minimal';
    expect(checkModelCatalog(snapshot, options()).reason).toBe('reasoning_not_advertised');
    expect(
      checkModelCatalog(snapshot, options({ requestedModelId: 'host-model-b' }))
    ).toMatchObject({
      status: 'unavailable',
      reason: 'reasoning_not_advertised',
      configuredReasoningEffort: 'ultra',
      check: { modelId: 'host-model-b', reasoningEffort: null, reasoningAdvertised: false },
      executionVerified: false,
    });
    expect(
      checkModelCatalog(
        snapshot,
        options({ requestedModelId: 'host-model-b', requestedReasoningEffort: 'minimal' })
      )
    ).toMatchObject({
      status: 'advertised',
      check: { reasoningEffort: 'minimal', reasoningAdvertised: true },
      executionVerified: false,
    });
  });
  it('retains a supported inherited effort instead of substituting the requested model default', () => {
    const snapshot = catalog({
      configuredModelId: 'host-model-b',
      configuredReasoningEffort: 'high',
    });
    expect(
      checkModelCatalog(snapshot, options({ requestedModelId: 'host-model-a' }))
    ).toMatchObject({
      status: 'advertised',
      check: { reasoningEffort: 'high', reasoningAdvertised: true },
    });
  });
  it.each([false, undefined])(
    'reports inherited effort unverified when configurationRead is %s',
    (configurationRead) => {
      const snapshot = catalog({ configurationRead, configuredModelId: null });
      expect(
        checkModelCatalog(snapshot, options({ requestedModelId: 'host-model-a' }))
      ).toMatchObject({
        status: 'unavailable',
        reason: 'reasoning_unverified',
        check: { modelAdvertised: true, reasoningEffort: null, reasoningAdvertised: null },
      });
      expect(
        checkModelCatalog(
          snapshot,
          options({ requestedModelId: 'host-model-a', requestedReasoningEffort: 'high' })
        )
      ).toMatchObject({
        status: 'advertised',
        check: { reasoningEffort: 'high', reasoningAdvertised: true },
        executionVerified: false,
      });
    }
  );
  it('requires explicit absence of a configured effort before using a host default', () => {
    const snapshot = catalog();
    delete snapshot.configuredReasoningEffort;
    expect(checkModelCatalog(snapshot, options()).reason).toBe('reasoning_unverified');
    snapshot.configuredReasoningEffort = null;
    expect(checkModelCatalog(snapshot, options())).toMatchObject({
      status: 'advertised',
      check: { reasoningEffort: 'low' },
    });
  });
  it.each([null, undefined])('reports missing native discovery: %s', (snapshot) => {
    expect(checkModelCatalog(snapshot, options())).toMatchObject({
      reason: 'native_discovery_unavailable',
      executionVerified: false,
    });
  });
  it.each([
    { source: { kind: 'raw-catalog', ref: 'dump', accountScoped: true } },
    { source: { kind: 'native-catalog', ref: 'picker', accountScoped: false } },
    {
      source: { kind: 'native-catalog', ref: 'picker', accountScoped: true, secret: 'never-print' },
    },
    { observedAtMs: NaN },
    { observedAtMs: -1 },
    { models: 'models' },
    { credentials: 'never-print' },
  ])('rejects malformed or non-account-scoped snapshots: %j', (change) => {
    const result = checkModelCatalog({ ...catalog(), ...change }, options());
    expect(result.status).toBe('invalid');
    expect(JSON.stringify(result)).not.toContain('never-print');
  });
  it('rejects duplicate model IDs, defaults and unsupported default effort', () => {
    const snapshot = catalog();
    snapshot.models.push({ ...snapshot.models[0] });
    expect(checkModelCatalog(snapshot, options()).status).toBe('invalid');
    snapshot.models.pop();
    snapshot.models[1].isDefault = true;
    expect(checkModelCatalog(snapshot, options()).status).toBe('invalid');
    snapshot.models[1].isDefault = false;
    snapshot.models[0].defaultReasoningEffort = 'guessed';
    expect(checkModelCatalog(snapshot, options()).status).toBe('invalid');
  });
  it('does not relabel Codex app-server CLI evidence as desktop evidence', () => {
    const snapshot = catalog({
      surface: 'desktop',
      source: { kind: 'codex-app-server', ref: 'model/list', accountScoped: true },
    });
    expect(checkModelCatalog(snapshot, options({ surface: 'desktop' })).status).toBe('invalid');
  });
  it('requires an explicit expected account context for supplied snapshots', () => {
    expect(checkRawCatalog(catalog(), options())).toMatchObject({
      reason: 'auth_context_unverified',
      models: [],
    });
  });
  it('does not conflate two ChatGPT accounts with the same host, surface and profile', () => {
    expect(
      checkModelCatalog(catalog({ authContextId: 'different-account' }), options())
    ).toMatchObject({ reason: 'auth_context_mismatch', models: [] });
  });
  it('labels matching supplied evidence caller-asserted, never live account verification', () => {
    expect(checkModelCatalog(catalog(), options())).toMatchObject({
      status: 'advertised',
      accountBinding: 'caller-asserted',
      executionVerified: false,
    });
  });
});

describe('Codex read-only app-server protocol', () => {
  it('initializes, reads account without refresh, lists models and compares config without exposing metadata', async () => {
    const server = fakeServer();
    const result = await discoverModels(options({ profile: 'cloud' }), server.adapters);
    expect(result).toMatchObject({
      status: 'advertised',
      authMode: 'chatgpt',
      accountBinding: 'live-probe',
      profile: 'cloud',
      configurationRead: true,
      check: { reasoningEffort: 'high' },
      executionVerified: false,
    });
    expect(server.messages.map((m) => m.method)).toEqual([
      'initialize',
      'initialized',
      'account/read',
      'model/list',
      'config/read',
    ]);
    expect(server.messages[2].params).toEqual({ refreshToken: false });
    expect(server.messages[3].params).toEqual({ cursor: null, limit: 100, includeHidden: false });
    expect(server.messages[4].params).toEqual({ includeLayers: false });
    expect(server.spawnProcess).toHaveBeenCalledWith(
      'codex',
      ['--profile', 'cloud', 'app-server', '--listen', 'stdio://'],
      expect.objectContaining({ shell: false, windowsHide: true })
    );
    expect(JSON.stringify(result)).not.toMatch(
      /private@example|never-print|not-an-id|unapproved-upgrade|userAgent/
    );
    expect(server.child.kill).toHaveBeenCalledWith('SIGTERM');
  });
  it('paginates without hidden models and uses only exact advertised IDs', async () => {
    const server = fakeServer((m) =>
      m.method === 'model/list'
        ? m.params.cursor === null
          ? {
              data: [nativeModel(), { ...nativeModel('hidden', false), hidden: true }],
              nextCursor: 'page-two',
            }
          : { data: [nativeModel('host-model-b', false)], nextCursor: null }
        : server.defaults(m)
    );
    const result = await discoverModels(
      options({ requestedModelId: 'host-model-b' }),
      server.adapters
    );
    expect(result.models.map((m) => m.id)).toEqual(['host-model-a', 'host-model-b']);
    expect(result.status).toBe('advertised');
    expect(server.messages.filter((m) => m.method === 'model/list')[1].params).toEqual({
      cursor: 'page-two',
      limit: 100,
      includeHidden: false,
    });
  });
  it.each(['host-model-a', 'ui:host-model-a'])(
    'checks selectable native Model.model, not UI Model.id: %s',
    async (requestedModelId) => {
      const server = fakeServer();
      const result = await discoverModels(options({ requestedModelId }), server.adapters);
      expect(result.models[0].id).toBe('host-model-a');
      expect(result.defaultModelId).toBe('host-model-a');
      expect(result.check?.modelAdvertised).toBe(requestedModelId === 'host-model-a');
      expect(result.status).toBe(
        requestedModelId === 'host-model-a' ? 'advertised' : 'unavailable'
      );
    }
  );
  it('never falls back to the UI identifier when selectable native Model.model is missing', async () => {
    const server = fakeServer((m) =>
      m.method === 'model/list'
        ? { data: [{ ...nativeModel(), model: undefined }] }
        : server.defaults(m)
    );
    expect(await discoverModels(options(), server.adapters)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid_catalog',
      models: [],
    });
  });
  it.each(['loggedOut', 'apiKey', 'amazonBedrock'])(
    'stops before model/list for unexpected account mode %s',
    async (type) => {
      const server = fakeServer((m) =>
        m.method === 'account/read'
          ? { account: type === 'loggedOut' ? null : { type }, requiresOpenaiAuth: true }
          : server.defaults(m)
      );
      const result = await discoverModels(options(), server.adapters);
      expect(result.status).toBe('unavailable');
      expect(result.models).toEqual([]);
      expect(server.messages.some((m) => m.method === 'model/list')).toBe(false);
      expect(server.child.kill).toHaveBeenCalled();
    }
  );
  it('does not label explicitly requested API-key results as ChatGPT access', async () => {
    const server = fakeServer((m) =>
      m.method === 'account/read'
        ? { account: { type: 'apiKey' }, requiresOpenaiAuth: true }
        : server.defaults(m)
    );
    expect(
      await discoverModels(options({ expectedAuthMode: 'apiKey' }), server.adapters)
    ).toMatchObject({ status: 'advertised', authMode: 'apiKey' });
  });
  it('rejects a provider that does not use the account authentication', async () => {
    const server = fakeServer((m) =>
      m.method === 'account/read'
        ? { account: { type: 'chatgpt' }, requiresOpenaiAuth: false }
        : server.defaults(m)
    );
    expect((await discoverModels(options(), server.adapters)).reason).toBe('auth_mode_mismatch');
  });
  it('can omit config/read and never guesses unknown reasoning support', async () => {
    const server = fakeServer((m) =>
      m.method === 'model/list'
        ? {
            data: [
              {
                ...nativeModel(),
                supportedReasoningEfforts: null,
                defaultReasoningEffort: 'never-assume-this',
              },
            ],
          }
        : server.defaults(m)
    );
    const result = await discoverModels(options({ readConfig: false }), server.adapters);
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'reasoning_unverified',
      configurationRead: false,
      check: { reasoningEffort: null },
    });
    expect(server.messages.some((m) => m.method === 'config/read')).toBe(false);
  });
  it('treats unsupported optional config/read as unknown, not successful configuration verification', async () => {
    const server = fakeServer((m) => {
      if (m.method === 'config/read') {
        server.child.stdout.write(
          `${JSON.stringify({ id: m.id, error: { message: 'secret config error' } })}\n`
        );
        return undefined;
      }
      return server.defaults(m);
    });
    expect(await discoverModels(options(), server.adapters)).toMatchObject({
      status: 'unavailable',
      reason: 'reasoning_unverified',
      configurationRead: false,
      configuredModelId: null,
    });
  });
  it('checks inherited config/read effort against a different requested model through the live adapter', async () => {
    const server = fakeServer((m) => {
      if (m.method === 'config/read')
        return { config: { model: 'previous-model', model_reasoning_effort: 'ultra' } };
      if (m.method === 'model/list')
        return {
          data: [
            {
              ...nativeModel(),
              supportedReasoningEfforts: [{ reasoningEffort: 'minimal' }],
              defaultReasoningEffort: 'minimal',
            },
          ],
        };
      return server.defaults(m);
    });
    expect(
      await discoverModels(options({ requestedModelId: 'host-model-a' }), server.adapters)
    ).toMatchObject({
      status: 'unavailable',
      reason: 'reasoning_not_advertised',
      configurationRead: true,
      configuredReasoningEffort: 'ultra',
      check: { modelAdvertised: true, reasoningEffort: null, reasoningAdvertised: false },
      executionVerified: false,
    });
    expect(server.messages.some((m) => m.method === 'config/read')).toBe(true);
  });
  it.each(['repeat', 'too-many'])('bounds %s pagination', async (mode) => {
    let page = 0;
    const server = fakeServer((m) =>
      m.method === 'model/list'
        ? { data: [], nextCursor: mode === 'repeat' ? 'same' : `page-${page++}` }
        : server.defaults(m)
    );
    expect((await discoverModels(options(), server.adapters)).reason).toBe(
      mode === 'repeat' ? 'invalid_pagination' : 'pagination_limit'
    );
    expect(server.child.kill).toHaveBeenCalled();
  });
  it.each([
    'invalid-json',
    'server-request',
    'stdout-overflow',
    'stderr-overflow',
    'early-exit',
    'account-change',
  ])('cleans up after %s without leaking raw content', async (mode) => {
    const server = fakeServer((m) => {
      if (m.method === 'model/list') {
        if (mode === 'invalid-json') server.child.stdout.write('secret-invalid-json\n');
        if (mode === 'server-request')
          server.child.stdout.write(
            '{"id":900,"method":"account/chatgptAuthTokens/refresh","params":{"secret":"never-print"}}\n'
          );
        if (mode === 'stdout-overflow') server.child.stdout.write('x'.repeat(2_000));
        if (mode === 'stderr-overflow') server.child.stderr.write('x'.repeat(2_000));
        if (mode === 'early-exit') server.child.emit('close', 1);
        if (mode === 'account-change')
          server.child.stdout.write('{"method":"account/updated","params":{}}\n');
        return undefined;
      }
      return server.defaults(m);
    });
    const result = await discoverModels(options({ maxOutputBytes: 1_024 }), server.adapters);
    expect(result.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toMatch(/secret-invalid|never-print/);
    if (mode !== 'early-exit') expect(server.child.kill).toHaveBeenCalled();
    expect(
      server.messages.every((m) =>
        ['initialize', 'initialized', 'account/read', 'model/list', 'config/read'].includes(
          m.method
        )
      )
    ).toBe(true);
  });
  it('detects account changes in the same data chunk as the account response', async () => {
    const server = fakeServer((m) => {
      if (m.method === 'account/read') {
        server.child.stdout.write(
          `${JSON.stringify({ id: m.id, result: server.defaults(m) })}\n{"method":"account/updated","params":{}}\n`
        );
        return undefined;
      }
      return server.defaults(m);
    });
    expect((await discoverModels(options(), server.adapters)).reason).toBe('account_changed');
  });
  it('times out a silent child and force-stops one that ignores the first stop', async () => {
    const server = fakeServer(() => undefined);
    server.child.kill.mockImplementation((signal) => {
      if (signal === 'SIGKILL') server.child.emit('close', 0);
      return true;
    });
    expect((await discoverModels(options({ timeoutMs: 10 }), server.adapters)).reason).toBe(
      'discovery_timeout'
    );
    expect(server.child.kill.mock.calls.map(([signal]) => signal)).toEqual(['SIGTERM', 'SIGKILL']);
  });
  it.each(['success', 'timeout', 'early-exit'] as const)(
    'force-stops the process tree after the leader closes on %s',
    async (mode) => {
      const server = fakeServer(
        mode === 'success'
          ? undefined
          : () => {
              if (mode === 'early-exit') server.child.emit('close', 1);
              return undefined;
            }
      );
      const result = await discoverModels(options({ timeoutMs: 10 }), server.adapters);
      expect(result.reason).toBe(
        mode === 'success'
          ? 'model_advertised'
          : mode === 'timeout'
            ? 'discovery_timeout'
            : 'app_server_exited'
      );
      expect(server.child.kill.mock.calls.map(([signal]) => signal)).toEqual(
        mode === 'early-exit' ? ['SIGKILL'] : ['SIGTERM', 'SIGKILL']
      );
      expect(server.child.stdin.destroyed).toBe(true);
      expect(server.child.stdout.destroyed).toBe(true);
      expect(server.child.stderr.destroyed).toBe(true);
    }
  );
  it('still force-stops and destroys streams when graceful cleanup throws', async () => {
    const server = fakeServer();
    server.adapters.terminate = (_child, signal) => {
      if (signal === 'SIGTERM') throw new Error('private cleanup detail');
      server.child.kill(signal);
    };
    const result = await discoverModels(options(), server.adapters);
    expect(result.reason).toBe('discovery_unavailable');
    expect(JSON.stringify(result)).not.toContain('private cleanup detail');
    expect(server.child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(server.child.stdin.destroyed).toBe(true);
    expect(server.child.stdout.destroyed).toBe(true);
    expect(server.child.stderr.destroyed).toBe(true);
  });
  it('bounds cleanup and removes grace listeners if the child never closes', async () => {
    vi.useFakeTimers();
    try {
      const server = fakeServer();
      const baseline = server.child.listenerCount('close');
      server.child.kill.mockImplementation(() => true);
      const pending = discoverModels(options(), server.adapters);
      await vi.runAllTimersAsync();
      expect((await pending).reason).toBe('child_cleanup_failed');
      expect(server.child.listenerCount('close')).toBe(baseline + 1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it.skipIf(process.platform === 'win32')(
    'kills a real local descendant that ignores TERM after its parent exits',
    async () => {
      let parentPid: number | undefined;
      let descendantPid: number | undefined;
      const script = `
        const { spawn } = require('node:child_process');
        const child = spawn(process.execPath, ['-e',
          'process.on("SIGTERM", () => {}); process.send("ready"); setInterval(() => {}, 1000);'],
          { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        child.once('message', () => process.stdout.write(JSON.stringify({ fixtureDescendantPid: child.pid }) + '\\n'));
        setInterval(() => {}, 1000);
      `;
      const alive = (pid: number) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      try {
        const result = await discoverModels(options({ timeoutMs: 5000 }), {
          invocation: () => ({ command: process.execPath, args: ['-e', script] }),
          spawnProcess: (command, args, settings) => {
            const child = spawn(command, args, settings);
            parentPid = child.pid;
            let output = '';
            child.stdout.on('data', (chunk) => {
              output += chunk.toString();
              if (output.includes('\n')) descendantPid = JSON.parse(output).fixtureDescendantPid;
            });
            return child;
          },
        });
        expect(result.reason).toBe('invalid_protocol');
        expect(descendantPid).toBeTypeOf('number');
        expect(alive(parentPid!)).toBe(false);
        for (let retry = 0; retry < 100 && alive(descendantPid!); retry++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(alive(descendantPid!)).toBe(false);
      } finally {
        // Only these disposable fixture processes are ever signalled.
        if (parentPid) {
          try {
            process.kill(-parentPid, 'SIGKILL');
          } catch {
            /* Exited. */
          }
        }
        if (descendantPid && alive(descendantPid)) {
          try {
            process.kill(descendantPid, 'SIGKILL');
          } catch {
            /* Exited. */
          }
        }
      }
    }
  );
  it('cleans up a real local fixture child without invoking Codex or inference', async () => {
    let pid: number | undefined;
    const result = await discoverModels(options({ timeoutMs: 30 }), {
      invocation: () => ({
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000)'],
      }),
      spawnProcess: (command, args, settings) => {
        const child = spawn(command, args, { ...settings, stdio: 'pipe' });
        pid = child.pid;
        return child;
      },
    });
    expect(result.reason).toBe('discovery_timeout');
    expect(pid).toBeTypeOf('number');
    expect(() => process.kill(pid!, 0)).toThrow();
  });
  it.each(['desktop', 'ide', 'vscode-extension'] as const)(
    'does not spawn a CLI to infer %s support',
    async (surface) => {
      const server = fakeServer();
      expect((await discoverModels(options({ surface }), server.adapters)).reason).toBe(
        'native_discovery_unavailable'
      );
      expect(server.spawnProcess).not.toHaveBeenCalled();
    }
  );
  it('never spawns for supplied snapshots or other unsupported hosts', async () => {
    const server = fakeServer();
    expect(
      (
        await discoverModels(
          options({ snapshot: catalog(), expectedAuthContextId: AUTH_CONTEXT }),
          server.adapters
        )
      ).status
    ).toBe('advertised');
    expect((await discoverModels(options({ host: 'claude' }), server.adapters)).reason).toBe(
      'native_discovery_unavailable'
    );
    expect(server.spawnProcess).not.toHaveBeenCalled();
  });
  it.each([
    ['antigravity', 'cli', 'Antigravity CLI uses agy, not gemini'],
    ['antigravity', 'desktop', 'exact Antigravity desktop, standalone IDE'],
    ['antigravity', 'ide', 'exact Antigravity desktop, standalone IDE'],
    ['antigravity', 'vscode-extension', 'exact Antigravity desktop, standalone IDE'],
  ] as const)('keeps %s %s discovery honest and read-only', async (host, surface, guidance) => {
    const server = fakeServer();
    const result = await discoverModels(options({ host, surface }), server.adapters);
    expect(result).toMatchObject({
      host,
      surface,
      status: 'unavailable',
      reason: 'native_discovery_unavailable',
      executionVerified: false,
      models: [],
      accountBinding: null,
    });
    expect(result.guidance).toContain(guidance);
    expect(server.spawnProcess).not.toHaveBeenCalled();
  });
  it.each(['cli', 'desktop', 'vscode-extension'] as const)(
    'never treats a Gemini %s catalog as Antigravity evidence',
    (surface) => {
      expect(
        checkModelCatalog(
          catalog({ host: 'gemini', surface }),
          options({ host: 'antigravity', surface })
        ).reason
      ).toBe('host_mismatch');
      expect(
        checkModelCatalog(
          catalog({ host: 'antigravity', surface }),
          options({ host: 'gemini', surface })
        ).reason
      ).toBe('retired_host');
    }
  );
  it.each(['antigravity'])('never treats a %s CLI catalog as desktop or IDE evidence', (host) => {
    for (const surface of ['desktop', 'ide', 'vscode-extension'] as const) {
      expect(checkModelCatalog(catalog({ host }), options({ host, surface })).reason).toBe(
        'surface_mismatch'
      );
    }
  });
  it('keeps Antigravity standalone IDE and VS Code extension catalogs separate', () => {
    expect(
      checkModelCatalog(
        catalog({ host: 'antigravity', surface: 'ide' }),
        options({ host: 'antigravity', surface: 'vscode-extension' })
      ).reason
    ).toBe('surface_mismatch');
  });
  it.each(['cli', 'desktop', 'ide', 'vscode-extension'] as const)(
    'rejects retired Gemini %s even with a valid supplied catalog',
    async (surface) => {
      const server = fakeServer();
      for (const snapshot of [undefined, catalog({ host: 'gemini', surface })]) {
        const result = await discoverModels(
          options({ host: 'gemini', surface, snapshot }),
          server.adapters
        );
        expect(result).toMatchObject({
          reason: 'retired_host',
          status: 'unavailable',
          models: [],
          executionVerified: false,
        });
        expect(result.guidance).toContain('gcli-migration');
      }
      expect(server.spawnProcess).not.toHaveBeenCalled();
    }
  );
  it.each([
    ['grok', 'cli', 'Skill model and effort fields are not applied'],
    ['grok', 'desktop', 'Identify this Grok app first'],
    ['grok-bot', 'desktop', 'there is no documented model picker'],
  ] as const)('does not guess %s %s model access', async (host, surface, guidance) => {
    const server = fakeServer();
    const result = await discoverModels(options({ host, surface }), server.adapters);
    expect(result).toMatchObject({
      host,
      surface,
      status: 'unavailable',
      executionVerified: false,
      models: [],
      accountBinding: null,
    });
    expect(result.guidance).toContain(guidance);
    expect(server.spawnProcess).not.toHaveBeenCalled();
    if (host === 'grok') expect(result.guidance).not.toContain('run grok plugin update');
    if (host === 'grok-bot') expect(result.guidance).toContain('not separate security boundaries');
  });
  it('does not use Grok Build or API-only evidence for Grok Bot', () => {
    for (const host of ['grok', 'xai-api']) {
      expect(
        checkModelCatalog(
          catalog({ host, surface: 'desktop' }),
          options({ host: 'grok-bot', surface: 'desktop' })
        ).reason
      ).toBe('host_mismatch');
    }
    expect(
      checkModelCatalog(catalog({ host: 'grok' }), options({ host: 'grok', surface: 'desktop' }))
        .reason
    ).toBe('surface_mismatch');
  });
  it('classifies the real installed CLI profile rejection without printing stderr or claiming base-model support', async () => {
    const server = fakeServer(() => {
      server.child.stderr.write(
        'Error: --profile only applies to interactive runs and codex exec; private-details\n'
      );
      server.child.emit('close', 1);
      return undefined;
    });
    const result = await discoverModels(
      options({ profile: 'cloud', requestedModelId: 'gpt-5.4' }),
      server.adapters
    );
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'profile_not_supported_by_app_server',
      profile: 'cloud',
      models: [],
      accountBinding: null,
    });
    expect(result.guidance).toContain('No requested-profile catalog');
    expect(JSON.stringify(result)).not.toContain('private-details');
  });
  it.each([
    { timeoutMs: Infinity },
    { maxOutputBytes: -1 },
    { maxAgeMs: NaN },
    { profile: 'cloud;touch x' },
    { surface: 'guessed' },
    { command: 'anything' },
  ])('rejects unsafe options before spawning: %j', async (change) => {
    const server = fakeServer();
    expect(
      (await discoverModels({ ...options(), ...change } as DiscoveryOptions, server.adapters))
        .status
    ).toBe('invalid');
    expect(server.spawnProcess).not.toHaveBeenCalled();
  });
});

describe('Windows-safe installed Codex invocation', () => {
  it('uses the native executable and separate arguments including a top-level profile', () => {
    const native = 'C:\\Program Files\\Codex\\codex.exe';
    expect(
      codexInvocation('cloud', {
        platform: 'win32',
        env: { Path: 'C:\\Program Files\\Codex' },
        exists: (file) => file === native,
      })
    ).toEqual({
      command: native,
      args: ['--profile', 'cloud', 'app-server', '--listen', 'stdio://'],
    });
  });
  it('uses a verified installed npm entrypoint via Node, never cmd.exe or shell concatenation', () => {
    const dir = 'C:\\User Space\\npm';
    const entry = `${dir}\\node_modules\\@openai\\codex\\bin\\codex.js`;
    expect(
      codexInvocation(undefined, {
        platform: 'win32',
        env: { PATH: dir },
        node: 'C:\\Node\\node.exe',
        exists: (file) => [entry, `${dir}\\codex.cmd`].includes(file),
      })
    ).toEqual({
      command: 'C:\\Node\\node.exe',
      args: [entry, 'app-server', '--listen', 'stdio://'],
    });
  });
  it('fails closed for an unsupported wrapper and rejects argument injection', () => {
    expect(() =>
      codexInvocation(undefined, {
        platform: 'win32',
        env: { PATH: 'C:\\npm' },
        exists: (file) => file.endsWith('.cmd'),
      })
    ).toThrow('codex_executable_unavailable');
    expect(() => codexInvocation('cloud --model any')).toThrow();
  });
});

describe('deadline-bound asynchronous Windows discovery resolution', () => {
  let platform: PropertyDescriptor;
  const native = 'C:\\Native Tools\\codex.exe';
  const file = { isFile: () => true } as Awaited<ReturnType<typeof stat>>;
  const missing = Object.assign(new Error('fixture missing file'), { code: 'ENOENT' });
  const asyncServer = (reply?: (message: Message) => unknown) => {
    const server = fakeServer(reply);
    delete server.adapters.invocation;
    return server;
  };

  beforeEach(() => {
    platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    for (const key of Object.keys(process.env).filter((key) => key.toLowerCase() === 'path')) {
      vi.stubEnv(key, 'C:\\Native Tools');
    }
    vi.stubEnv('PATH', 'C:\\Native Tools');
    vi.mocked(stat).mockReset().mockRejectedValue(missing);
    vi.mocked(execFileSync)
      .mockReset()
      .mockImplementation(() => {
        throw new Error('Unexpected fixture tree termination');
      });
  });
  afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
    vi.unstubAllEnvs();
    vi.mocked(stat).mockReset();
    vi.mocked(execFileSync).mockReset();
    vi.useRealTimers();
  });

  it('fails closed when the parent closes before Windows tree termination fails', async () => {
    vi.mocked(stat).mockResolvedValue(file);
    const server = asyncServer();
    delete server.adapters.terminate;
    Object.assign(server.child, { pid: 4242 });
    vi.spyOn(server.child.stdin, 'end').mockImplementation(() => {
      server.child.emit('close', 0);
      return server.child.stdin;
    });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw Object.assign(new Error('private taskkill details; descendant survives'), {
        status: 128,
      });
    });
    const result = await discoverModels(options(), server.adapters);
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'child_cleanup_unverified',
      models: [],
      accountBinding: null,
    });
    expect(JSON.stringify(result)).not.toContain('private taskkill');
    expect(execFileSync).toHaveBeenCalledExactlyOnceWith(
      'taskkill.exe',
      ['/PID', '4242', '/T', '/F'],
      expect.objectContaining({ shell: false, timeout: 1000 })
    );
    expect(server.child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(server.child.stdin.destroyed).toBe(true);
    expect(server.child.stdout.destroyed).toBe(true);
    expect(server.child.stderr.destroyed).toBe(true);
  });

  it('does not substitute parent-only termination for a failed Windows tree kill', async () => {
    vi.mocked(stat).mockResolvedValue(file);
    const server = asyncServer();
    delete server.adapters.terminate;
    Object.assign(server.child, { pid: 4242 });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('fixture tree kill failed');
    });
    const result = await discoverModels(options(), server.adapters);
    expect(result.reason).toBe('child_cleanup_unverified');
    expect(result.status).toBe('unavailable');
    expect(server.child.kill.mock.calls.map(([signal]) => signal)).toEqual(['SIGTERM', 'SIGKILL']);
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('accepts a successful forced Windows tree kill without retrying the departed parent', async () => {
    vi.mocked(stat).mockResolvedValue(file);
    const server = asyncServer();
    delete server.adapters.terminate;
    Object.assign(server.child, { pid: 4242 });
    vi.mocked(execFileSync).mockImplementation(() => {
      server.child.emit('close', 0);
      return Buffer.alloc(0);
    });
    expect((await discoverModels(options(), server.adapters)).status).toBe('advertised');
    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(server.child.kill).not.toHaveBeenCalled();
  });

  it('resolves the native executable asynchronously without changing profile, account or flags', async () => {
    vi.mocked(stat).mockResolvedValue(file);
    const server = asyncServer();
    expect((await discoverModels(options({ profile: 'cloud' }), server.adapters)).status).toBe(
      'advertised'
    );
    expect(stat).toHaveBeenCalledExactlyOnceWith(native);
    expect(server.spawnProcess).toHaveBeenCalledWith(
      native,
      ['--profile', 'cloud', 'app-server', '--listen', 'stdio://'],
      expect.objectContaining({ shell: false, windowsHide: true })
    );
  });

  it('retains native-before-npm ordering and verifies both npm files without a shell', async () => {
    const dir = 'C:\\Native Tools';
    const shim = `${dir}\\codex.cmd`;
    const entry = `${dir}\\node_modules\\@openai\\codex\\bin\\codex.js`;
    vi.mocked(stat).mockRejectedValueOnce(missing).mockResolvedValue(file);
    const server = asyncServer();
    expect((await discoverModels(options(), server.adapters)).status).toBe('advertised');
    expect(vi.mocked(stat).mock.calls.map(([name]) => name)).toEqual([native, shim, entry]);
    expect(server.spawnProcess).toHaveBeenCalledWith(
      process.execPath,
      [entry, 'app-server', '--listen', 'stdio://'],
      expect.objectContaining({ shell: false })
    );
  });

  it('does not execute an npm wrapper without its verified JS entrypoint', async () => {
    vi.mocked(stat)
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce(file)
      .mockRejectedValue(missing);
    const server = asyncServer();
    expect((await discoverModels(options(), server.adapters)).reason).toBe(
      'codex_executable_unavailable'
    );
    expect(server.spawnProcess).not.toHaveBeenCalled();
  });

  it('keeps the event loop responsive and never falls back or spawns after lookup timeout', async () => {
    for (const key of Object.keys(process.env).filter((key) => key.toLowerCase() === 'path')) {
      vi.stubEnv(key, '\\\\offline-server\\tools;C:\\Native Tools');
    }
    let resolve!: (value: Awaited<ReturnType<typeof stat>>) => void;
    vi.mocked(stat).mockImplementationOnce(
      () =>
        new Promise((accept) => {
          resolve = accept;
        })
    );
    const server = asyncServer();
    let heartbeat = false;
    const timer = setTimeout(() => {
      heartbeat = true;
    }, 1);
    try {
      const result = await discoverModels(options({ timeoutMs: 30 }), server.adapters);
      expect(heartbeat).toBe(true);
      expect(result.reason).toBe('discovery_timeout');
      expect(stat).toHaveBeenCalledExactlyOnceWith('\\\\offline-server\\tools\\codex.exe');
      resolve(file);
      await new Promise((accept) => setImmediate(accept));
      expect(stat).toHaveBeenCalledTimes(1);
      expect(server.spawnProcess).not.toHaveBeenCalled();
    } finally {
      clearTimeout(timer);
      resolve?.(file);
    }
  });

  it('shares one deadline between PATH resolution and the protocol', async () => {
    vi.useFakeTimers();
    vi.mocked(stat).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(file), 75))
    );
    const server = asyncServer(() => undefined);
    let finished = false;
    const pending = discoverModels(options({ timeoutMs: 100 }), server.adapters).then((result) => {
      finished = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(75);
    expect(server.spawnProcess).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).reason).toBe('discovery_timeout');
    expect(server.child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('caps outstanding uncancellable checks and reopens admission only after they settle', async () => {
    vi.useFakeTimers();
    const complete: Array<(value: Awaited<ReturnType<typeof stat>>) => void> = [];
    vi.mocked(stat).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete.push(resolve);
        })
    );
    const first = asyncServer();
    const second = asyncServer();
    try {
      const running = [first, second].map((server) =>
        discoverModels(options({ timeoutMs: 10 }), server.adapters)
      );
      await vi.advanceTimersByTimeAsync(10);
      expect((await Promise.all(running)).map((result) => result.reason)).toEqual([
        'discovery_timeout',
        'discovery_timeout',
      ]);
      const third = asyncServer();
      expect((await discoverModels(options(), third.adapters)).reason).toBe(
        'executable_resolution_busy'
      );
      expect(stat).toHaveBeenCalledTimes(2);
      expect(third.spawnProcess).not.toHaveBeenCalled();
      complete.forEach((resolve) => resolve(file));
      await vi.advanceTimersByTimeAsync(0);
      expect(first.spawnProcess).not.toHaveBeenCalled();
      expect(second.spawnProcess).not.toHaveBeenCalled();
      vi.mocked(stat).mockResolvedValue(file);
      expect((await discoverModels(options(), third.adapters)).status).toBe('advertised');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      complete.forEach((resolve) => resolve(file));
      await vi.advanceTimersByTimeAsync(0);
    }
  });
});

describe('model discovery CLI without live inference', () => {
  let directory: string;
  let input: string;
  beforeAll(() => {
    directory = mkdtempSync(path.join(ROOT, '.model-discovery-test-'));
    input = path.join(directory, 'catalog with spaces.json');
    writeFileSync(input, JSON.stringify(catalog({ observedAtMs: Date.now() })));
  });
  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  const run = (args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', shell: false, timeout: 5_000 });
  it('provides self-contained --help without probing or opening input', () => {
    const result = run(['--help', '--input', 'missing.json']);
    expect(result.status).toBe(0);
    for (const flag of [
      '--host',
      '--surface',
      '--profile',
      '--requested-model',
      '--reasoning',
      'accountScoped',
      'executionVerified:false',
    ])
      expect(result.stdout).toContain(flag);
  });
  it('checks a snapshot without changing it or writing artifacts', () => {
    const before = readFileSync(input, 'utf8');
    const files = readdirSync(directory);
    const result = run([
      '--host',
      'codex',
      '--input',
      input,
      '--auth-context',
      AUTH_CONTEXT,
      '--requested-model',
      'host-model-a',
      '--reasoning',
      'high',
      '--json',
    ]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'advertised',
      executionVerified: false,
    });
    expect(readFileSync(input, 'utf8')).toBe(before);
    expect(readdirSync(directory)).toEqual(files);
  });
  it.each([
    ['--host'],
    ['--host', 'claude', '--unknown'],
    ['--host', 'claude', '--json', '--json'],
    ['--host', 'claude', '--timeout-ms', 'NaN'],
    ['--host', 'codex', '--input', 'missing.json'],
  ])('rejects invalid options: %j', (...args) => {
    const result = run([...args, ...(args.includes('--json') ? [] : ['--json'])]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).status).toBe('invalid');
  });
  it('returns native picker guidance rather than guessing another CLI catalog', () => {
    const result = run(['--host', 'claude', '--json']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'unavailable',
      reason: 'native_discovery_unavailable',
    });
  });
  it('bounds input reads and suppresses malformed JSON contents', () => {
    const file = path.join(directory, 'invalid.json');
    for (const content of ['{"secret":"never-echo-this",', 'x'.repeat(1_048_577)]) {
      writeFileSync(file, content);
      const result = run(['--host', 'codex', '--input', file, '--json']);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toContain('never-echo-this');
    }
  });
});
