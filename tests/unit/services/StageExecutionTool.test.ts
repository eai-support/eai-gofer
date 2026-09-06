import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  loadBundledStageRuntime,
  registerStageExecutionTool,
  StageExecutionTool,
  StageModelDiscoveryTool,
  VSCodeStageAdapter,
  type StageRuntime,
} from '../../../extension/src/services/StageExecutionTool';

vi.mock('vscode', () => {
  class Disposable {
    constructor(private callback = () => {}) {}
    dispose() {
      this.callback();
    }
  }
  class CancellationError extends Error {
    constructor() {
      super('Cancelled');
    }
  }
  class CancellationTokenSource {
    private listeners = new Set<() => void>();
    token = {
      isCancellationRequested: false,
      onCancellationRequested: (callback: () => void) => {
        this.listeners.add(callback);
        return new Disposable(() => this.listeners.delete(callback));
      },
    };
    cancel() {
      if (this.token.isCancellationRequested) return;
      this.token.isCancellationRequested = true;
      for (const listener of this.listeners) listener();
    }
    dispose() {
      this.listeners.clear();
    }
  }
  class LanguageModelTextPart {
    constructor(public value: string) {}
  }
  class LanguageModelThinkingPart {
    constructor(
      public value: string | string[],
      public id?: string,
      public metadata?: Record<string, unknown>
    ) {}
  }
  class LanguageModelDataPart {
    constructor(
      public data: Uint8Array,
      public mimeType: string
    ) {}
  }
  class LanguageModelToolCallPart {
    constructor(
      public callId: string,
      public name: string,
      public input: object
    ) {}
  }
  class LanguageModelToolResult {
    constructor(public content: LanguageModelTextPart[]) {}
  }
  class MarkdownString {
    value = '';
    appendText(text: string) {
      this.value += text;
      return this;
    }
  }
  return {
    Disposable,
    CancellationError,
    CancellationTokenSource,
    LanguageModelTextPart,
    LanguageModelThinkingPart,
    LanguageModelDataPart,
    LanguageModelToolCallPart,
    LanguageModelToolResult,
    MarkdownString,
    LanguageModelChatMessage: { User: vi.fn((content) => ({ role: 1, content })) },
    workspace: { isTrusted: true, workspaceFolders: [] },
    lm: { selectChatModels: vi.fn(), registerTool: vi.fn(), invokeTool: vi.fn() },
    commands: { registerCommand: vi.fn(), executeCommand: vi.fn() },
  };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, realpath: vi.fn(actual.realpath) };
});

// New stable APIs intentionally remain structural while the repo pins 1.93 types.
const native = vscode as unknown as {
  LanguageModelTextPart: new (value: string) => { value: string };
  LanguageModelDataPart: new (data: Uint8Array, mimeType: string) => unknown;
  LanguageModelThinkingPart?: new (
    value: string | string[],
    id?: string,
    metadata?: Record<string, unknown>
  ) => unknown;
  lm: { registerTool: ReturnType<typeof vi.fn>; invokeTool: ReturnType<typeof vi.fn> };
};
const workspace = vscode.workspace as unknown as {
  isTrusted: boolean;
  workspaceFolders: Array<{ uri: { scheme: string; fsPath: string } }>;
};
const root = '/trusted/workspace';
const extensionUri = { scheme: 'file', fsPath: '/trusted/extension' } as vscode.Uri;
const bounds = { timeoutMs: 1000, maxOutputBytes: 4096 };
const request = () => ({
  host: 'vscode',
  surface: 'vscode-extension',
  stage: '6_gofer_validate',
  workType: 'non-app',
  trigger: 'review',
  task: 'Review this proposal',
  context: { spec: ['spec.md'], acceptance: [], platform: [], language: [], permissions: [] },
  policy: {
    enabled: true,
    approved: true,
    route: { pattern: 'critique', worker: 'native-a', critic: 'native-b' },
    maxAttempts: 2,
    maxElapsedMs: 1000,
    maxEvidenceAgeMs: 1000,
  },
});

function model(
  id: string,
  family = id,
  parts: unknown[] = [new native.LanguageModelTextPart('proposal')]
) {
  return {
    id,
    family,
    name: id,
    vendor: 'copilot',
    version: '1',
    maxInputTokens: 1000,
    countTokens: vi.fn().mockResolvedValue(10),
    sendRequest: vi.fn().mockImplementation(async () => ({
      stream: (async function* () {
        for (const part of parts) yield part;
      })(),
    })),
  };
}

const access = { canSendRequest: vi.fn(), onDidChange: vi.fn() };
const context = () =>
  ({
    extensionUri,
    languageModelAccessInformation: access,
    subscriptions: [],
  }) as unknown as vscode.ExtensionContext;
const token = () => new vscode.CancellationTokenSource().token;
const select = vi.mocked(vscode.lm.selectChatModels);
let toolsToDispose: vscode.Disposable[] = [];

function toolWithRuntime(
  executeStage = vi.fn().mockResolvedValue({ proposals: ['review'], canClaimDone: false })
) {
  const loader = vi.fn().mockResolvedValue({ executeStage });
  const tool = new StageExecutionTool(context(), loader);
  toolsToDispose.push(tool);
  return { tool, loader, executeStage };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  workspace.isTrusted = true;
  workspace.workspaceFolders = [{ uri: { scheme: 'file', fsPath: root } }];
  select.mockResolvedValue([]);
  access.canSendRequest.mockReturnValue(undefined);
  native.lm.registerTool.mockImplementation(() => new vscode.Disposable());
  native.lm.invokeTool.mockResolvedValue({ content: [] });
  vi.mocked(vscode.commands.registerCommand).mockImplementation(() => new vscode.Disposable());
});

afterEach(() => {
  toolsToDispose.forEach((tool) => tool.dispose());
  toolsToDispose = [];
  vi.useRealTimers();
});

describe('VS Code stage adapter', () => {
  const adapter = () => new VSCodeStageAdapter(root, access);

  it('discovers only the current native catalog, without inference or guessed defaults', async () => {
    const a = model('native-a', 'family-a');
    const b = model('native-b', 'family-b');
    select.mockResolvedValue([a, b] as never);
    const before = Date.now();
    const catalog = await adapter().discover(bounds);
    expect(select).toHaveBeenCalledWith({ vendor: 'copilot' });
    expect(catalog).toMatchObject({
      host: 'vscode',
      surface: 'vscode-extension',
      verified: true,
      readOnlyIsolation: true,
      models: [
        { id: 'native-a', family: 'family-a', available: true, nativeCompound: false },
        { id: 'native-b', family: 'family-b', available: true, nativeCompound: false },
      ],
    });
    expect(catalog.observedAtMs).toBeGreaterThanOrEqual(before);
    expect(a.sendRequest).not.toHaveBeenCalled();
    expect(b.sendRequest).not.toHaveBeenCalled();
  });

  it('returns an empty catalog rather than inventing a model', async () => {
    expect((await adapter().discover(bounds)).models).toEqual([]);
  });

  it('scopes both discovery and execution to native Copilot when copilotcli advertises the same IDs', async () => {
    const nativeModel = model('shared-id', 'native-family');
    const cliModel = { ...model('shared-id', 'cli-family'), vendor: 'copilotcli' };
    const catalog = [cliModel, nativeModel];
    select.mockImplementation(
      async (selector) =>
        catalog.filter(
          (entry) =>
            (!selector?.vendor || entry.vendor === selector.vendor) &&
            (!selector?.id || entry.id === selector.id)
        ) as never
    );
    expect((await adapter().discover(bounds)).models).toEqual([
      { id: 'shared-id', family: 'native-family', available: true, nativeCompound: false },
    ]);
    const result = await adapter().execute({ ...bounds, modelId: 'shared-id', prompt: 'task' });
    expect(result.selectedModelId).toBe('shared-id');
    expect(select).toHaveBeenNthCalledWith(1, { vendor: 'copilot' });
    expect(select).toHaveBeenNthCalledWith(2, { vendor: 'copilot', id: 'shared-id' });
    expect(nativeModel.sendRequest).toHaveBeenCalledTimes(1);
    expect(cliModel.sendRequest).not.toHaveBeenCalled();
  });

  it.each(['copilotcli', 'other-provider', ''])(
    'rejects unexpected vendor %s even if native filtering returns it',
    async (vendor) => {
      const foreign = { ...model('shared-id'), vendor };
      select.mockResolvedValue([foreign] as never);
      await expect(adapter().discover(bounds)).rejects.toThrow('different vendor');
      await expect(
        adapter().execute({ ...bounds, modelId: 'shared-id', prompt: 'task' })
      ).rejects.toThrow('different vendor');
      expect(foreign.sendRequest).not.toHaveBeenCalled();
    }
  );

  it('does not silently select one of two same-vendor matches', async () => {
    const first = model('duplicate-id');
    const second = model('duplicate-id');
    select.mockResolvedValue([first, second] as never);
    await expect(adapter().discover(bounds)).rejects.toThrow('ambiguous');
    await expect(
      adapter().execute({ ...bounds, modelId: 'duplicate-id', prompt: 'task' })
    ).rejects.toThrow('ambiguous');
    expect(first.sendRequest).not.toHaveBeenCalled();
    expect(second.sendRequest).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'preserves native compound metadata %s and the exact native family',
    async (nativeCompound) => {
      const nativeModel = { ...model('opaque-id', 'opaque/family-7'), nativeCompound };
      select.mockResolvedValue([nativeModel] as never);
      expect((await adapter().discover(bounds)).models).toEqual([
        { id: 'opaque-id', family: 'opaque/family-7', available: true, nativeCompound },
      ]);
      expect(nativeModel.sendRequest).not.toHaveBeenCalled();
    }
  );

  it.each(['id', 'family', 'name'] as const)(
    'treats an exact native Auto %s as compound without rewriting its identity',
    async (field) => {
      const nativeModel = {
        ...model('opaque-id', 'opaque/family-7'),
        [field]: 'Auto',
        nativeCompound: false,
      };
      select.mockResolvedValue([nativeModel] as never);
      expect((await adapter().discover(bounds)).models[0]).toEqual({
        id: nativeModel.id,
        family: nativeModel.family,
        available: true,
        nativeCompound: true,
      });
    }
  );

  it('does not guess compound status from arbitrary model names or families', async () => {
    const nativeModel = model('auto-complete-model', 'unknown-multi-agent-family');
    nativeModel.name = 'Automatic reasoning model';
    select.mockResolvedValue([nativeModel] as never);
    expect((await adapter().discover(bounds)).models[0]).toEqual({
      id: nativeModel.id,
      family: nativeModel.family,
      available: true,
      nativeCompound: false,
    });
  });

  it('fails closed on malformed native compound metadata', async () => {
    select.mockResolvedValue([{ ...model('opaque-id'), nativeCompound: 'false' }] as never);
    await expect(adapter().discover(bounds)).rejects.toThrow('invalid compound metadata');
  });

  it('refuses write requests and hard dollar budgets without calling a model', async () => {
    await expect(
      adapter().execute({ ...bounds, modelId: 'a', prompt: 'task', readOnly: false })
    ).rejects.toThrow('read-only');
    await expect(
      adapter().execute({ ...bounds, modelId: 'a', prompt: 'task', maxCostUsd: 1 })
    ).rejects.toThrow('dollar limit');
    expect(select).not.toHaveBeenCalled();
  });

  it('rejects duplicate or missing native identities', async () => {
    select.mockResolvedValue([model('same'), model('same')] as never);
    await expect(adapter().discover(bounds)).rejects.toThrow('ambiguous');
    select.mockResolvedValue([model('a', '')] as never);
    await expect(adapter().discover(bounds)).rejects.toThrow('missing');
  });

  it('enforces discovery output and time bounds', async () => {
    select.mockResolvedValue([model('native-a')] as never);
    await expect(adapter().discover({ ...bounds, maxOutputBytes: 10 })).rejects.toThrow(
      'byte limit'
    );
    vi.useFakeTimers();
    select.mockImplementation(() => new Promise(() => {}));
    const pending = expect(adapter().discover(bounds)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('selects the exact model, sends no history/tools, and does not invent usage or reported identity', async () => {
    const a = model('native-a');
    select.mockResolvedValue([model('other'), a] as never);
    const result = await adapter().execute({ ...bounds, modelId: 'native-a', prompt: 'read this' });
    expect(select).toHaveBeenCalledWith({ vendor: 'copilot', id: 'native-a' });
    expect(a.countTokens).toHaveBeenCalledWith(
      { role: 1, content: 'read this' },
      expect.anything()
    );
    expect(a.sendRequest).toHaveBeenCalledWith(
      [{ role: 1, content: 'read this' }],
      {
        tools: [],
        justification: expect.any(String),
      },
      expect.anything()
    );
    expect(result).toEqual({
      text: 'proposal',
      selectedModelId: 'native-a',
      reportedModelId: null,
      usage: {},
    });
    expect(a.sendRequest.mock.calls[0][2]).toBe(a.countTokens.mock.calls[0][1]);
    expect(a.sendRequest.mock.calls[0][2].isCancellationRequested).toBe(true);
  });

  it('fails when the requested model disappears, without using another model', async () => {
    const a = model('native-a');
    const b = model('native-b');
    select.mockResolvedValueOnce([a] as never).mockResolvedValueOnce([b] as never);
    await adapter().discover(bounds);
    await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toThrow(
      'unavailable'
    );
    expect(a.sendRequest).not.toHaveBeenCalled();
    expect(b.sendRequest).not.toHaveBeenCalled();
  });

  it('respects denied consent and lets native consent errors propagate without retry', async () => {
    const a = model('native-a');
    select.mockResolvedValue([a] as never);
    access.canSendRequest.mockReturnValue(false);
    await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toThrow(
      'consent'
    );
    expect(a.sendRequest).not.toHaveBeenCalled();
    access.canSendRequest.mockReturnValue(undefined);
    const denial = Object.assign(new Error('native consent denied'), { code: 'NoPermissions' });
    a.sendRequest.mockRejectedValue(denial);
    await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toBe(
      denial
    );
    expect(a.sendRequest).toHaveBeenCalledTimes(1);
  });

  it('propagates native catalog denial without inference', async () => {
    select.mockRejectedValue(new Error('account consent denied'));
    await expect(adapter().discover(bounds)).rejects.toThrow('consent denied');
  });

  it.each([1001, NaN, -1])(
    'rejects an excessive or invalid input token count %s',
    async (count) => {
      const a = model('native-a');
      a.countTokens.mockResolvedValue(count);
      select.mockResolvedValue([a] as never);
      await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toThrow(
        'input token limit'
      );
      expect(a.sendRequest).not.toHaveBeenCalled();
    }
  );

  it.each([{ callId: '1', name: 'write_file', input: {} }, { value: 'not a native text part' }])(
    'fails closed on tool calls and unknown native parts',
    async (part) => {
      const a = model('native-a', 'a', [new native.LanguageModelTextPart('partial'), part]);
      select.mockResolvedValue([a] as never);
      await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toThrow(
        'forbidden'
      );
      expect(a.sendRequest.mock.calls[0][2].isCancellationRequested).toBe(true);
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    }
  );

  it('refuses a text-only response that could hide tool calls', async () => {
    const a = model('native-a');
    a.sendRequest.mockResolvedValue({
      text: (async function* () {
        yield 'text';
      })(),
    });
    select.mockResolvedValue([a] as never);
    await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toThrow(
      'inspectable stream'
    );
  });

  it.each(['opaque', ['opaque', 'chunks']])(
    'discards recognised reasoning parts without returning them',
    async (value) => {
      const part = new native.LanguageModelThinkingPart!(value, 'sequence', {
        signature: 'opaque',
      });
      const a = model('native-a', 'a', [part, new native.LanguageModelTextPart('answer')]);
      select.mockResolvedValue([a] as never);
      const result = await adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' });
      expect(result.text).toBe('answer');
      expect(JSON.stringify(result)).not.toContain('opaque');
      expect(a.sendRequest.mock.calls[0][1].tools).toEqual([]);
    }
  );

  it.each(['usage', 'stateful_marker'])('discards bounded native %s records', async (mime) => {
    const a = model('native-a', 'a', [
      new native.LanguageModelDataPart(Buffer.from('opaque'), mime),
      new native.LanguageModelTextPart('answer'),
    ]);
    select.mockResolvedValue([a] as never);
    const result = await adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' });
    expect(result.text).toBe('answer');
    expect(result.usage).toEqual({});
    expect(JSON.stringify(result)).not.toContain('opaque');
  });

  it.each(['image/png', 'application/json', 'Usage', 'usage/tool'])(
    'blocks unapproved native data type %s',
    async (mime) => {
      const a = model('native-a', 'a', [new native.LanguageModelDataPart(Buffer.from('{}'), mime)]);
      select.mockResolvedValue([a] as never);
      await expect(
        adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })
      ).rejects.toMatchObject({ stageReason: 'native_data_part_blocked' });
      expect(a.sendRequest.mock.calls[0][2].isCancellationRequested).toBe(true);
    }
  );

  it('counts discarded data with final text against one output bound', async () => {
    const a = model('native-a', 'a', [
      new native.LanguageModelDataPart(new Uint8Array(4096), 'usage'),
      new native.LanguageModelTextPart('x'),
    ]);
    select.mockResolvedValue([a] as never);
    await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toThrow(
      'byte limit'
    );
  });

  it('rejects malformed bookkeeping and a forged native data shape', async () => {
    for (const part of [
      new native.LanguageModelDataPart('bad' as never, 'usage'),
      { data: new Uint8Array(1), mimeType: 'usage' },
    ]) {
      const a = model('native-a', 'a', [part]);
      select.mockResolvedValue([a] as never);
      await expect(
        adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })
      ).rejects.toThrow();
    }
  });

  it('still blocks tool calls after approved bookkeeping', async () => {
    const a = model('native-a', 'a', [
      new native.LanguageModelDataPart(new Uint8Array(1), 'usage'),
      { callId: '1', name: 'write_file', input: {} },
    ]);
    select.mockResolvedValue([a] as never);
    await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toThrow(
      'forbidden'
    );
  });

  it('still rejects a tool call after a recognised reasoning part', async () => {
    const a = model('native-a', 'a', [
      new native.LanguageModelThinkingPart!('opaque'),
      { callId: '1', name: 'write_file', input: {} },
    ]);
    select.mockResolvedValue([a] as never);
    await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toThrow(
      'forbidden'
    );
    expect(a.sendRequest.mock.calls[0][2].isCancellationRequested).toBe(true);
  });

  it('counts discarded reasoning metadata toward the output bound', async () => {
    const part = new native.LanguageModelThinkingPart!('', undefined, {
      signature: 'x'.repeat(4096),
    });
    const a = model('native-a', 'a', [part, new native.LanguageModelTextPart('answer')]);
    select.mockResolvedValue([a] as never);
    await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toThrow(
      'byte limit'
    );
    expect(a.sendRequest.mock.calls[0][2].isCancellationRequested).toBe(true);
  });

  it('rejects malformed native reasoning values', async () => {
    const part = new native.LanguageModelThinkingPart!(17 as never);
    const a = model('native-a', 'a', [part]);
    select.mockResolvedValue([a] as never);
    await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toThrow(
      'Malformed'
    );
  });

  it('keeps text support when the optional reasoning API is absent', async () => {
    const saved = native.LanguageModelThinkingPart;
    native.LanguageModelThinkingPart = undefined;
    try {
      const a = model('native-a');
      select.mockResolvedValue([a] as never);
      expect((await adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).text).toBe(
        'proposal'
      );
    } finally {
      native.LanguageModelThinkingPart = saved;
    }
  });

  it('counts UTF-8 bytes, accepts the boundary, and cancels rather than truncates excess output', async () => {
    const a = model('native-a', 'a', [
      new native.LanguageModelTextPart('\u00e9'),
      new native.LanguageModelTextPart('\u00e9'),
    ]);
    select.mockResolvedValue([a] as never);
    expect(
      (await adapter().execute({ ...bounds, maxOutputBytes: 4, modelId: a.id, prompt: 'task' }))
        .text
    ).toBe('\u00e9\u00e9');
    await expect(
      adapter().execute({ ...bounds, maxOutputBytes: 3, modelId: a.id, prompt: 'task' })
    ).rejects.toThrow('byte limit');
    expect(a.sendRequest.mock.calls[1][2].isCancellationRequested).toBe(true);
  });

  it('rejects invalid limits and enforces its hard output ceiling', async () => {
    await expect(adapter().discover({ timeoutMs: Infinity })).rejects.toThrow('limit');
    await expect(adapter().discover({ maxOutputBytes: -1 })).rejects.toThrow('limit');
    const a = model('native-a', 'a', [
      new native.LanguageModelTextPart('x'.repeat(1024 * 1024 + 1)),
    ]);
    select.mockResolvedValue([a] as never);
    await expect(
      adapter().execute({
        timeoutMs: 1000,
        maxOutputBytes: 20_000_000,
        modelId: a.id,
        prompt: 'task',
      })
    ).rejects.toThrow('byte limit');
  });

  it('does no native work when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(adapter().discover({ ...bounds, signal: controller.signal })).rejects.toThrow(
      'Cancelled'
    );
    await expect(
      adapter().execute({ ...bounds, signal: controller.signal, modelId: 'a', prompt: 'task' })
    ).rejects.toThrow('Cancelled');
    expect(select).not.toHaveBeenCalled();
  });

  it('cancels a pending selection and prevents late results from starting inference', async () => {
    const controller = new AbortController();
    const a = model('native-a');
    let resolve!: (models: never) => void;
    select.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const pending = expect(
      adapter().execute({ ...bounds, signal: controller.signal, modelId: a.id, prompt: 'task' })
    ).rejects.toThrow('Cancelled');
    await vi.waitFor(() => expect(select).toHaveBeenCalled());
    controller.abort();
    await pending;
    resolve([a] as never);
    await Promise.resolve();
    expect(a.sendRequest).not.toHaveBeenCalled();
  });

  it.each(['request', 'stream'])(
    'bounds an unresponsive native %s and cancels its token',
    async (phase) => {
      vi.useFakeTimers();
      const a = model('native-a');
      if (phase === 'request') a.sendRequest.mockImplementation(() => new Promise(() => {}));
      else
        a.sendRequest.mockResolvedValue({
          stream: { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) },
        });
      select.mockResolvedValue([a] as never);
      const pending = expect(
        adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })
      ).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(1000);
      await pending;
      expect(a.sendRequest.mock.calls[0][2].isCancellationRequested).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('stops if trust or the workspace changes while selecting a model', async () => {
    const a = model('native-a');
    select.mockImplementation(async () => {
      workspace.isTrusted = false;
      return [a] as never;
    });
    await expect(adapter().execute({ ...bounds, modelId: a.id, prompt: 'task' })).rejects.toThrow(
      'trusted'
    );
    expect(a.sendRequest).not.toHaveBeenCalled();
  });
});

describe('native discovery chat tool', () => {
  const discovery = () => {
    const tool = new StageModelDiscoveryTool(context().languageModelAccessInformation);
    toolsToDispose.push(tool);
    return tool;
  };

  it('lists current models without inference, shell or workspace reads', async () => {
    const m = model('current-model');
    select.mockResolvedValue([m] as never);
    const result = JSON.parse((await discovery().invoke({ input: {} }, token())).content[0].value);
    expect(result).toMatchObject({
      host: 'vscode',
      surface: 'vscode-extension',
      inferencePerformed: false,
      canClaimDone: false,
      models: [{ id: 'current-model' }],
    });
    expect(m.sendRequest).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('preserves an empty catalogue instead of suggesting a fallback', async () => {
    const result = JSON.parse((await discovery().invoke({ input: {} }, token())).content[0].value);
    expect(result.models).toEqual([]);
  });

  it.each([null, [], { model: 'guessed' }, { command: 'run' }])(
    'rejects unexpected input %j',
    async (input) => {
      await expect(discovery().invoke({ input: input as never }, token())).rejects.toThrow(
        'must be {}'
      );
      expect(select).not.toHaveBeenCalled();
    }
  );

  it('blocks untrusted and multiple-folder discovery', async () => {
    const tool = discovery();
    workspace.isTrusted = false;
    await expect(tool.invoke({ input: {} }, token())).rejects.toThrow('trusted');
    workspace.isTrusted = true;
    workspace.workspaceFolders.push({ uri: { scheme: 'file', fsPath: '/another' } });
    await expect(tool.invoke({ input: {} }, token())).rejects.toThrow('exactly one');
    expect(select).not.toHaveBeenCalled();
  });

  it('honours cancellation and disposal without model selection', async () => {
    const tool = discovery();
    const source = new vscode.CancellationTokenSource();
    source.cancel();
    await expect(tool.invoke({ input: {} }, source.token)).rejects.toThrow('Cancelled');
    tool.dispose();
    await expect(tool.invoke({ input: {} }, token())).rejects.toThrow('disposed');
    expect(select).not.toHaveBeenCalled();
  });

  it('cancels a stalled discovery on disposal', async () => {
    const tool = discovery();
    const catalog = deferred<vscode.LanguageModelChat[]>();
    select.mockImplementation(() => catalog.promise);
    const result = expect(tool.invoke({ input: {} }, token())).rejects.toThrow('Cancelled');
    await Promise.resolve();
    tool.dispose();
    await result;
    catalog.resolve([]);
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('enforces output token budgets', async () => {
    await expect(
      discovery().invoke(
        {
          input: {},
          tokenizationOptions: {
            tokenBudget: 1,
            countTokens: async () => 2,
          },
        },
        token()
      )
    ).rejects.toThrow('token budget');
  });
});

describe('shared native tool admission', () => {
  it('rejects excess execution and discovery before native work, across tool instances', async () => {
    const a = model('native-a');
    const response = deferred<{ stream: AsyncIterable<unknown> }>();
    a.sendRequest.mockImplementation(() => response.promise);
    select.mockResolvedValue([a] as never);
    const engine = vi.fn(async (_request, { adapter, signal }) =>
      adapter.execute({
        ...bounds,
        signal,
        modelId: a.id,
        prompt: 'bounded proposal',
      })
    );
    const first = toolWithRuntime(engine);
    const second = toolWithRuntime(engine);
    const excess = toolWithRuntime(engine);
    const discovery = new StageModelDiscoveryTool(access);
    toolsToDispose.push(discovery);
    const running = [first, second].map(({ tool }) =>
      tool.invoke({ input: { request: request() } }, token())
    );
    await vi.waitFor(() => expect(a.sendRequest).toHaveBeenCalledTimes(2));
    for (const tool of [first.tool, excess.tool]) {
      await expect(tool.invoke({ input: { request: request() } }, token())).rejects.toMatchObject({
        stageReason: 'native_tool_busy',
      });
    }
    await expect(discovery.invoke({ input: {} }, token())).rejects.toMatchObject({
      stageReason: 'native_tool_busy',
    });
    expect(excess.loader).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledTimes(2);
    expect(a.sendRequest).toHaveBeenCalledTimes(2);
    response.resolve({
      stream: (async function* () {
        yield new native.LanguageModelTextPart('proposal');
      })(),
    });
    await Promise.all(running);
    // Retrying is explicit: rejected work was never retained in a queue.
    expect(excess.loader).not.toHaveBeenCalled();
    await discovery.invoke({ input: {} }, token());
    expect(select).toHaveBeenCalledTimes(3);
  });

  it('discovery consumes the same shared capacity and releases it on success', async () => {
    const catalog = deferred<vscode.LanguageModelChat[]>();
    select.mockImplementation(() => catalog.promise);
    const discovery = new StageModelDiscoveryTool(access);
    const otherDiscovery = new StageModelDiscoveryTool(access);
    toolsToDispose.push(discovery, otherDiscovery);
    const running = [discovery, otherDiscovery].map((tool) => tool.invoke({ input: {} }, token()));
    await vi.waitFor(() => expect(select).toHaveBeenCalledTimes(2));
    const stage = toolWithRuntime();
    await expect(
      stage.tool.invoke({ input: { request: request() } }, token())
    ).rejects.toMatchObject({
      stageReason: 'native_tool_busy',
    });
    await expect(discovery.invoke({ input: {} }, token())).rejects.toMatchObject({
      stageReason: 'native_tool_busy',
    });
    expect(stage.loader).not.toHaveBeenCalled();
    catalog.resolve([]);
    await Promise.all(running);
    await stage.tool.invoke({ input: { request: request() } }, token());
    expect(stage.executeStage).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'error', 'cancel', 'dispose', 'timeout'] as const)(
    'releases execution admission after %s and underlying settlement without releasing another call',
    async (mode) => {
      vi.useFakeTimers();
      const work = deferred<unknown>();
      const otherWork = deferred<unknown>();
      const first = toolWithRuntime(vi.fn(() => work.promise));
      const other = toolWithRuntime(vi.fn(() => otherWork.promise));
      const replacement = toolWithRuntime();
      const source = new vscode.CancellationTokenSource();
      const pending = first.tool.invoke({ input: { request: request() } }, source.token);
      const outcome =
        mode === 'success'
          ? expect(pending).resolves.toBeDefined()
          : expect(pending).rejects.toThrow(
              mode === 'error' ? 'fixture error' : mode === 'timeout' ? 'timed out' : 'Cancelled'
            );
      await vi.advanceTimersByTimeAsync(mode === 'timeout' ? 1 : 0);
      const otherPending = other.tool.invoke({ input: { request: request() } }, token());
      await vi.advanceTimersByTimeAsync(0);
      await expect(
        replacement.tool.invoke({ input: { request: request() } }, token())
      ).rejects.toMatchObject({
        stageReason: 'native_tool_busy',
      });
      if (mode === 'success') work.resolve({ canClaimDone: false });
      if (mode === 'error') work.reject(new Error('fixture error'));
      if (mode === 'cancel') source.cancel();
      if (mode === 'dispose') first.tool.dispose();
      if (mode === 'timeout') await vi.advanceTimersByTimeAsync(599_999);
      await outcome;
      if (['cancel', 'dispose', 'timeout'].includes(mode)) {
        await expect(
          replacement.tool.invoke({ input: { request: request() } }, token())
        ).rejects.toMatchObject({
          stageReason: 'native_tool_busy',
        });
        work.resolve({ canClaimDone: false });
        await vi.advanceTimersByTimeAsync(0);
      }
      await replacement.tool.invoke({ input: { request: request() } }, token());
      expect(replacement.executeStage).toHaveBeenCalledTimes(1);
      otherWork.resolve({ canClaimDone: false });
      await otherPending;
      work.resolve({ canClaimDone: false });
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(['error', 'cancel', 'dispose', 'timeout'] as const)(
    'releases discovery admission after %s and underlying settlement',
    async (mode) => {
      vi.useFakeTimers();
      const catalog = deferred<vscode.LanguageModelChat[]>();
      select.mockImplementationOnce(() => catalog.promise);
      const discovery = new StageModelDiscoveryTool(access);
      toolsToDispose.push(discovery);
      const source = new vscode.CancellationTokenSource();
      const pending = discovery.invoke({ input: {} }, source.token);
      const outcome = expect(pending).rejects.toThrow(
        mode === 'error' ? 'fixture error' : mode === 'timeout' ? 'timed out' : 'Cancelled'
      );
      await vi.advanceTimersByTimeAsync(0);
      if (mode === 'error') catalog.reject(new Error('fixture error'));
      if (mode === 'cancel') source.cancel();
      if (mode === 'dispose') discovery.dispose();
      if (mode === 'timeout') await vi.advanceTimersByTimeAsync(120_000);
      await outcome;
      catalog.resolve([]);
      await vi.advanceTimersByTimeAsync(0);
      const work = deferred<unknown>();
      const stage = toolWithRuntime(vi.fn(() => work.promise));
      const running = [0, 1].map(() =>
        stage.tool.invoke({ input: { request: request() } }, token())
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(stage.executeStage).toHaveBeenCalledTimes(2);
      work.resolve({ canClaimDone: false });
      await Promise.all(running);
      catalog.resolve([]);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(
    ['discovery', 'execution'].flatMap((kind) =>
      ['cancel', 'dispose', 'timeout'].flatMap((mode) =>
        ['resolve', 'reject'].map((settlement) => [kind, mode, settlement] as const)
      )
    )
  )(
    'retains %s selection slots after %s until native promises %s',
    async (kind, mode, settlement) => {
      vi.useFakeTimers();
      const a = model('native-a');
      const selections: ReturnType<typeof deferred<vscode.LanguageModelChat[]>>[] = [];
      let inFlight = 0;
      let peak = 0;
      select.mockImplementation(() => {
        const selection = deferred<vscode.LanguageModelChat[]>();
        selections.push(selection);
        peak = Math.max(peak, ++inFlight);
        return selection.promise.finally(() => {
          inFlight -= 1;
        });
      });
      const engine = vi.fn(async (_request, { adapter, signal }) =>
        adapter.execute({
          ...bounds,
          signal,
          modelId: a.id,
          prompt: 'proposal',
        })
      );
      const sources = [new vscode.CancellationTokenSource(), new vscode.CancellationTokenSource()];
      const tools = sources.map(() =>
        kind === 'discovery' ? new StageModelDiscoveryTool(access) : toolWithRuntime(engine).tool
      );
      toolsToDispose.push(...tools);
      const running = tools.map((tool, index) =>
        kind === 'discovery'
          ? (tool as StageModelDiscoveryTool).invoke({ input: {} }, sources[index].token)
          : (tool as StageExecutionTool).invoke(
              { input: { request: request() } },
              sources[index].token
            )
      );
      const outcomes = running.map((result) =>
        expect(result).rejects.toThrow(mode === 'timeout' ? 'timed out' : 'Cancelled')
      );
      const replacement = new StageModelDiscoveryTool(access);
      toolsToDispose.push(replacement);
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(select).toHaveBeenCalledTimes(2);
        if (mode === 'cancel') sources.forEach((source) => source.cancel());
        if (mode === 'dispose') tools.forEach((tool) => tool.dispose());
        if (mode === 'timeout')
          await vi.advanceTimersByTimeAsync(kind === 'discovery' ? 120_000 : 1000);
        await Promise.all(outcomes);
        expect(inFlight).toBe(2);
        const excess = toolWithRuntime();
        await expect(
          excess.tool.invoke({ input: { request: request() } }, token())
        ).rejects.toMatchObject({ stageReason: 'native_tool_busy' });
        expect(excess.loader).not.toHaveBeenCalled();
        await expect(replacement.invoke({ input: {} }, token())).rejects.toMatchObject({
          stageReason: 'native_tool_busy',
        });
        expect(select).toHaveBeenCalledTimes(2);
        if (settlement === 'resolve') selections[0].resolve([a] as never);
        else selections[0].reject(new Error('late native rejection'));
        await vi.advanceTimersByTimeAsync(0);
        const admitted = replacement.invoke({ input: {} }, token());
        await vi.advanceTimersByTimeAsync(0);
        expect(select).toHaveBeenCalledTimes(3);
        expect(inFlight).toBe(2);
        await expect(replacement.invoke({ input: {} }, token())).rejects.toMatchObject({
          stageReason: 'native_tool_busy',
        });
        selections[1].resolve([a] as never);
        selections[2].resolve([]);
        await admitted;
        expect(peak).toBe(2);
        expect(inFlight).toBe(0);
        expect(a.sendRequest).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        selections.forEach((selection) => selection.resolve([]));
        tools.forEach((tool) => tool.dispose());
        replacement.dispose();
        await vi.advanceTimersByTimeAsync(0);
      }
    }
  );
});

describe('native stage tool boundary', () => {
  it('prepares accurate cost/actions confirmation without loading, selecting, or inferring', () => {
    const { tool, loader } = toolWithRuntime();
    const prepared = tool.prepareInvocation({ input: { request: request() } }, token());
    expect(prepared.confirmationMessages.title).toContain('additional-model');
    const message = prepared.confirmationMessages.message.value;
    for (const text of [
      'paid quota',
      'cannot be guaranteed',
      'read-only',
      'spec.md',
      'native-a',
      'native-b',
      'maxAttempts',
      'not proof of approval',
      'not a cumulative task budget',
      'at most two concurrent calls',
      root,
    ]) {
      expect(message).toContain(text);
    }
    expect(loader).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('passes the request to the engine and executes two fresh native model sessions', async () => {
    const a = model('native-a', 'family-a');
    const b = model('native-b', 'family-b');
    select.mockImplementation(
      async (selector) =>
        (selector?.id ? [a, b].filter((m) => m.id === selector.id) : [a, b]) as never
    );
    const engine = vi.fn(async (_request, { adapter, signal }) => {
      const catalog = await adapter.discover({ ...bounds, signal });
      const first = await adapter.execute({
        ...bounds,
        signal,
        modelId: catalog.models[0].id,
        prompt: 'worker context',
      });
      const second = await adapter.execute({
        ...bounds,
        signal,
        modelId: catalog.models[1].id,
        prompt: 'critic context',
      });
      return { proposals: [first, second], canClaimDone: false, validationRequired: true };
    });
    const { tool, loader } = toolWithRuntime(engine);
    const input = { request: request() };
    const result = await tool.invoke({ input }, token());
    expect(loader).toHaveBeenCalledWith(extensionUri);
    expect(engine).toHaveBeenCalledWith(input.request, {
      root,
      adapter: expect.any(VSCodeStageAdapter),
      signal: expect.any(AbortSignal),
    });
    const output = JSON.parse(result.content[0].value);
    expect(output).toMatchObject({ canClaimDone: false, validationRequired: true });
    expect(output.proposals.map((p: { selectedModelId: string }) => p.selectedModelId)).toEqual([
      'native-a',
      'native-b',
    ]);
    expect(a.sendRequest.mock.calls[0][0]).toEqual([{ role: 1, content: 'worker context' }]);
    expect(b.sendRequest.mock.calls[0][0]).toEqual([{ role: 1, content: 'critic context' }]);
    expect(a.sendRequest.mock.calls[0][2]).not.toBe(b.sendRequest.mock.calls[0][2]);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('integrates the real shared engine with two mocked native models and retains evidence fields', async () => {
    // Test-only source import: production uses ExtensionContext bundled resources.
    const runtime =
      (await import('../../../.specify/scripts/node/lib/stage-execution.mjs')) as StageRuntime;
    const repo = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
    workspace.workspaceFolders = [{ uri: { scheme: 'file', fsPath: repo } }];
    const a = model('native-a', 'family-a');
    const b = model('native-b', 'family-b');
    select.mockImplementation(
      async (selector) =>
        (selector?.id ? [a, b].filter((m) => m.id === selector.id) : [a, b]) as never
    );
    const tool = new StageExecutionTool(context(), async () => runtime);
    toolsToDispose.push(tool);
    const input = request();
    input.context = {
      spec: ['AGENTS.md'],
      acceptance: ['AGENTS.md'],
      platform: ['AGENTS.md'],
      language: ['AGENTS.md'],
      permissions: ['AGENTS.md'],
    };
    input.policy.route.pattern = 'peer-review';
    input.policy.maxAttempts = 3;
    input.policy.maxElapsedMs = 10_000;
    const result = JSON.parse(
      (await tool.invoke({ input: { request: input } }, token())).content[0].value
    );
    expect(result).toMatchObject({
      status: 'validate',
      canClaimDone: false,
      validationRequired: true,
    });
    expect(result.attempts).toHaveLength(2);
    expect(
      result.outputs.map((output: { selectedModelId: string }) => output.selectedModelId)
    ).toEqual(['native-a', 'native-b']);
    expect(result.inputFiles).toEqual(
      expect.arrayContaining([
        { ref: 'AGENTS.md', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
        {
          ref: '.specify/commands/6_gofer_validate.md',
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ])
    );
    expect(result.usage.total.costUsd).toBeNull();
    expect(a.sendRequest).toHaveBeenCalledTimes(1);
    expect(b.sendRequest).toHaveBeenCalledTimes(1);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it.each(['worker', 'critic'] as const)(
    'prevents outer peer-review with native Auto as %s through the real engine',
    async (role) => {
      const runtime =
        (await import('../../../.specify/scripts/node/lib/stage-execution.mjs')) as StageRuntime;
      const repo = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
      workspace.workspaceFolders = [{ uri: { scheme: 'file', fsPath: repo } }];
      const auto = { ...model('auto', 'auto'), name: 'Auto', nativeCompound: false };
      const fixed = model('native-fixed', 'native-fixed-family');
      select.mockImplementation(
        async (selector) =>
          (selector?.id
            ? [auto, fixed].filter((m) => m.id === selector.id)
            : [auto, fixed]) as never
      );
      const tool = new StageExecutionTool(context(), async () => runtime);
      toolsToDispose.push(tool);
      const input = request();
      input.context = {
        spec: ['AGENTS.md'],
        acceptance: ['AGENTS.md'],
        platform: ['AGENTS.md'],
        language: ['AGENTS.md'],
        permissions: ['AGENTS.md'],
      };
      input.policy.route = {
        pattern: 'peer-review',
        worker: role === 'worker' ? auto.id : fixed.id,
        critic: role === 'critic' ? auto.id : fixed.id,
      };
      input.policy.maxAttempts = 3;
      input.policy.maxElapsedMs = 10_000;
      const result = JSON.parse(
        (await tool.invoke({ input: { request: input } }, token())).content[0].value
      );
      expect(result).toMatchObject({ canClaimDone: false, validationRequired: true });
      expect(result.attempts.some((attempt: { phase: string }) => attempt.phase === 'critic')).toBe(
        false
      );
      expect(fixed.sendRequest).not.toHaveBeenCalled();
      if (role === 'worker') {
        expect(result).toMatchObject({
          status: 'stop',
          reason: 'native_compound_review_unavailable',
        });
        expect(result.attempts).toHaveLength(0);
        expect(result.outputs).toHaveLength(0);
        expect(auto.sendRequest).not.toHaveBeenCalled();
      } else {
        expect(result).toMatchObject({
          status: 'legacy',
          reason: 'native_compound_companion_unsupported',
        });
        expect(result.attempts).toHaveLength(0);
        expect(auto.sendRequest).not.toHaveBeenCalled();
      }
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    }
  );

  it.each(['untrusted', 'empty', 'multi-root', 'virtual'])(
    'rejects %s workspaces before importing the engine',
    async (kind) => {
      const { tool, loader } = toolWithRuntime();
      if (kind === 'untrusted') workspace.isTrusted = false;
      if (kind === 'empty') workspace.workspaceFolders = [];
      if (kind === 'multi-root')
        workspace.workspaceFolders.push({ uri: { scheme: 'file', fsPath: '/other' } });
      if (kind === 'virtual') workspace.workspaceFolders[0].uri.scheme = 'vscode-vfs';
      await expect(tool.invoke({ input: { request: request() } }, token())).rejects.toThrow();
      expect(loader).not.toHaveBeenCalled();
    }
  );

  it('does not accept workspace/import overrides or a foreign host', async () => {
    const { tool, loader } = toolWithRuntime();
    await expect(
      tool.invoke({ input: { request: request(), root: '/evil' } as never }, token())
    ).rejects.toThrow('request: object');
    await expect(
      tool.invoke({ input: { request: { ...request(), host: 'codex' } } }, token())
    ).rejects.toThrow('must target');
    expect(loader).not.toHaveBeenCalled();
  });

  it('honors tool result token budgets rather than truncating evidence', async () => {
    const { tool } = toolWithRuntime();
    const countTokens = vi.fn().mockResolvedValue(101);
    await expect(
      tool.invoke(
        { input: { request: request() }, tokenizationOptions: { tokenBudget: 100, countTokens } },
        token()
      )
    ).rejects.toThrow('token budget');
    expect(countTokens).toHaveBeenCalledWith(expect.any(String), expect.anything());
  });

  it('caps total tool result bytes', async () => {
    const { tool } = toolWithRuntime(vi.fn().mockResolvedValue('x'.repeat(8 * 1024 * 1024)));
    await expect(tool.invoke({ input: { request: request() } }, token())).rejects.toThrow(
      'byte limit'
    );
  });

  it.each(['cancel', 'dispose'])('propagates %s to the shared engine', async (action) => {
    const source = new vscode.CancellationTokenSource();
    const work = deferred<unknown>();
    const { tool, executeStage } = toolWithRuntime(vi.fn(() => work.promise));
    const pending = expect(
      tool.invoke({ input: { request: request() } }, source.token)
    ).rejects.toThrow('Cancelled');
    await vi.waitFor(() => expect(executeStage).toHaveBeenCalled());
    const signal = executeStage.mock.calls[0][1].signal;
    if (action === 'dispose') tool.dispose();
    else source.cancel();
    await pending;
    expect(signal.aborted).toBe(true);
    work.resolve({});
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('loads no runtime for a pre-cancelled invocation', async () => {
    const { tool, loader } = toolWithRuntime();
    const source = new vscode.CancellationTokenSource();
    source.cancel();
    await expect(tool.invoke({ input: { request: request() } }, source.token)).rejects.toThrow(
      'Cancelled'
    );
    expect(loader).not.toHaveBeenCalled();
  });

  it('bounds the entire stage even when the engine stalls', async () => {
    vi.useFakeTimers();
    const work = deferred<unknown>();
    const { tool, executeStage } = toolWithRuntime(vi.fn(() => work.promise));
    const pending = expect(tool.invoke({ input: { request: request() } }, token())).rejects.toThrow(
      'timed out'
    );
    await vi.advanceTimersByTimeAsync(600_000);
    await pending;
    expect(executeStage.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    work.resolve({});
    await vi.advanceTimersByTimeAsync(0);
  });

  it('registers once and routes the hidden command through native confirmation, not JSON approval', async () => {
    const ctx = context();
    registerStageExecutionTool(ctx);
    registerStageExecutionTool(ctx);
    expect(native.lm.registerTool).toHaveBeenCalledTimes(2);
    expect(native.lm.registerTool).toHaveBeenCalledWith(
      'gofer_discover_models',
      expect.any(StageModelDiscoveryTool)
    );
    expect(native.lm.registerTool).toHaveBeenCalledWith(
      'gofer_execute_stage',
      expect.any(StageExecutionTool)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(1);
    const [name, handler] = vi.mocked(vscode.commands.registerCommand).mock.calls[0];
    expect(name).toBe('gofer.executeStage');
    native.lm.invokeTool.mockRejectedValue(new Error('User declined confirmation'));
    await expect(handler({ request: request() })).rejects.toThrow('declined');
    expect(native.lm.invokeTool).toHaveBeenCalledWith(
      'gofer_execute_stage',
      {
        input: { request: request() },
        toolInvocationToken: undefined,
      },
      undefined
    );
    expect(select).not.toHaveBeenCalled();
    expect(ctx.subscriptions).toHaveLength(1);
    ctx.subscriptions[0].dispose();
  });

  it('disposes the tool and command and allows clean re-registration', () => {
    const ctx = context();
    const disposeTool = vi.fn();
    const disposeCommand = vi.fn();
    native.lm.registerTool.mockReturnValue({ dispose: disposeTool });
    vi.mocked(vscode.commands.registerCommand).mockReturnValue({ dispose: disposeCommand });
    registerStageExecutionTool(ctx);
    ctx.subscriptions[0].dispose();
    expect(disposeTool).toHaveBeenCalledTimes(2);
    expect(disposeCommand).toHaveBeenCalledTimes(1);
    registerStageExecutionTool(ctx);
    expect(native.lm.registerTool).toHaveBeenCalledTimes(4);
    ctx.subscriptions[1].dispose();
  });

  it('keeps old hosts activation-safe and refuses command execution without native tool support', () => {
    const register = native.lm.registerTool;
    native.lm.registerTool = undefined as never;
    try {
      const ctx = context();
      registerStageExecutionTool(ctx);
      const handler = vi.mocked(vscode.commands.registerCommand).mock.calls[0][1];
      expect(() => handler({ request: request() })).toThrow('native language model tools');
      ctx.subscriptions[0].dispose();
      expect(select).not.toHaveBeenCalled();
    } finally {
      native.lm.registerTool = register;
    }
  });

  it('refuses symlink escape from bundled resources and missing runtime, never importing workspace JS', async () => {
    vi.mocked(fs.realpath)
      .mockResolvedValueOnce('/trusted/extension')
      .mockResolvedValueOnce('/untrusted/workspace/stage-execution.mjs');
    await expect(loadBundledStageRuntime(extensionUri)).rejects.toThrow('trusted extension');
    expect(fs.realpath).toHaveBeenLastCalledWith(
      '/trusted/extension/resources/node-scripts/lib/stage-execution.mjs'
    );
    vi.mocked(fs.realpath)
      .mockResolvedValueOnce('/trusted/extension')
      .mockRejectedValueOnce(new Error('ENOENT'));
    await expect(loadBundledStageRuntime(extensionUri)).rejects.toThrow(
      'workspace JavaScript will not be loaded'
    );
  });

  it('keeps registration out of workspace initialization, the hidden command out of the picker, and has no CLI bridge', () => {
    const source = readFileSync(
      new URL('../../../extension/src/services/StageExecutionTool.ts', import.meta.url),
      'utf8'
    );
    const extension = readFileSync(
      new URL('../../../extension/src/extension.ts', import.meta.url),
      'utf8'
    );
    const manifest = JSON.parse(
      readFileSync(new URL('../../../extension/package.json', import.meta.url), 'utf8')
    );
    expect(source).not.toMatch(/child_process|spawn\(|execFile\(|executeCommand\(|ProviderFactory/);
    expect(source).toContain('webpackIgnore: true');
    expect(extension.match(/registerStageExecutionTool\(context\)/g)).toHaveLength(1);
    expect(extension.indexOf('registerStageExecutionTool(context)')).toBeLessThan(
      extension.indexOf('async function initializeForWorkspace')
    );
    expect(
      manifest.contributes.commands.some(
        (entry: { command: string }) => entry.command === 'gofer.executeStage'
      )
    ).toBe(false);
    const contribution = manifest.contributes.languageModelTools.find(
      (entry: { name: string }) => entry.name === 'gofer_execute_stage'
    );
    expect(contribution.inputSchema).toMatchObject({
      required: ['request'],
      additionalProperties: false,
      properties: { request: { type: 'object' } },
    });
  });
});
