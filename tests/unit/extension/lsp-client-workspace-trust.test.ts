import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscodeTypes from 'vscode';

const harness = vi.hoisted(() => ({
  workspaceTrust: false as unknown,
  trustListener: undefined as (() => Promise<void>) | undefined,
  clientOptions: [] as Array<Record<string, unknown>>,
  starts: 0,
  stops: 0,
  outputLines: [] as string[],
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => []),
}));

vi.mock('vscode', () => ({
  workspace: {
    get isTrusted(): unknown {
      return harness.workspaceTrust;
    },
    createFileSystemWatcher: vi.fn(() => ({ dispose: vi.fn() })),
    onDidGrantWorkspaceTrust: vi.fn((listener: () => Promise<void>) => {
      harness.trustListener = listener;
      return { dispose: vi.fn() };
    }),
    workspaceFolders: [],
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: (line: string) => harness.outputLines.push(line),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
    showErrorMessage: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

const languageClientModule = vi.hoisted(() => ({
  TransportKind: { ipc: 1 },
  LanguageClient: class MockLanguageClient {
    constructor(
      _id: string,
      _name: string,
      _serverOptions: unknown,
      clientOptions: Record<string, unknown>
    ) {
      harness.clientOptions.push(clientOptions);
    }

    async start(): Promise<void> {
      harness.starts += 1;
    }

    async stop(): Promise<void> {
      harness.stops += 1;
    }

    onNotification(): void {}
    sendNotification(): void {}

    async sendRequest(): Promise<unknown> {
      return undefined;
    }
  },
}));

vi.mock(
  '../../../extension/node_modules/vscode-languageclient/node.js',
  () => languageClientModule
);
vi.mock('../../../node_modules/vscode-languageclient/node.js', () => languageClientModule);

import { GoferLSPClient } from '../../../extension/src/lspClient';

function createContext(): vscodeTypes.ExtensionContext {
  return {
    extensionPath: '/packaged/gofer-extension',
    asAbsolutePath: (relativePath: string) => `/packaged/gofer-extension/${relativePath}`,
    subscriptions: [],
  } as unknown as vscodeTypes.ExtensionContext;
}

describe('Gofer LSP workspace trust propagation', () => {
  beforeEach(() => {
    harness.workspaceTrust = false;
    harness.trustListener = undefined;
    harness.clientOptions.length = 0;
    harness.starts = 0;
    harness.stops = 0;
    harness.outputLines.length = 0;
  });

  it('passes only a literal trusted decision to LSP initialization', async () => {
    harness.workspaceTrust = 'true';
    const client = new GoferLSPClient(createContext());

    await client.start();

    expect(harness.clientOptions).toHaveLength(1);
    expect(harness.clientOptions[0]?.initializationOptions).toEqual({
      workspaceTrusted: false,
    });
  });

  it('restarts the active language server after VS Code grants workspace trust', async () => {
    const context = createContext();
    const client = new GoferLSPClient(context);
    await client.start();

    expect(context.subscriptions).toHaveLength(1);
    expect(harness.clientOptions[0]?.initializationOptions).toEqual({
      workspaceTrusted: false,
    });

    harness.workspaceTrust = true;
    await harness.trustListener?.();

    expect(harness.stops).toBe(1);
    expect(harness.starts).toBe(2);
    expect(harness.clientOptions[1]?.initializationOptions).toEqual({
      workspaceTrusted: true,
    });
    expect(client.isRunning()).toBe(true);
  });

  it('does not restart for a non-boolean trust signal', async () => {
    const client = new GoferLSPClient(createContext());
    await client.start();

    harness.workspaceTrust = 1;
    await harness.trustListener?.();

    expect(harness.stops).toBe(0);
    expect(harness.starts).toBe(1);
    expect(harness.clientOptions).toHaveLength(1);
  });
});
