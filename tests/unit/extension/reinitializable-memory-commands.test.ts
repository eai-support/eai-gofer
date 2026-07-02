import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscodeTypes from 'vscode';
import type { ContextBuilder } from '../../../extension/src/autonomous/ContextBuilder';
import type { MemoryManager } from '../../../extension/src/autonomous/MemoryManager';
import {
  disposeMemoryCommands,
  registerMemoryCommands,
} from '../../../extension/src/commands/memoryCommands';
import {
  disposeMigrateMemoriesCommand,
  registerMigrateMemoriesCommand,
} from '../../../extension/src/commands/migrateMemories';
import {
  disposeQueryMemoryUsageCommand,
  registerQueryMemoryUsageCommand,
} from '../../../extension/src/commands/queryMemoryUsage';

const vscodeMock = vi.hoisted(() => {
  const activeCommands = new Set<string>();
  const disposedCommands: string[] = [];
  const registerCommand = vi.fn(
    (command: string, _callback: (...args: unknown[]) => unknown) => {
      if (activeCommands.has(command)) {
        throw new Error(`command '${command}' already exists`);
      }

      activeCommands.add(command);
      return {
        dispose: vi.fn(() => {
          activeCommands.delete(command);
          disposedCommands.push(command);
        }),
      };
    }
  );

  return { activeCommands, disposedCommands, registerCommand };
});

vi.mock('vscode', () => ({
  commands: {
    registerCommand: vscodeMock.registerCommand,
  },
  window: {
    showInputBox: vi.fn(),
    showQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    withProgress: vi.fn(),
  },
  workspace: {
    openTextDocument: vi.fn(),
  },
  ProgressLocation: { Notification: 15 },
  ViewColumn: { One: 1 },
}));

function createContext(): vscodeTypes.ExtensionContext {
  return {
    subscriptions: [],
    extensionUri: {
      fsPath: '/test/extension',
      path: '/test/extension',
      scheme: 'file',
    },
  } as unknown as vscodeTypes.ExtensionContext;
}

function disposeAllReinitializableMemoryCommands(): void {
  disposeMemoryCommands();
  disposeMigrateMemoriesCommand();
  disposeQueryMemoryUsageCommand();
}

describe('reinitializable memory command registration', () => {
  beforeEach(() => {
    disposeAllReinitializableMemoryCommands();
    vscodeMock.activeCommands.clear();
    vscodeMock.disposedCommands.length = 0;
    vscodeMock.registerCommand.mockClear();
  });

  afterEach(() => {
    disposeAllReinitializableMemoryCommands();
    vscodeMock.activeCommands.clear();
  });

  it('replaces workspace memory command handlers before registering them again', () => {
    const firstContext = createContext();
    const secondContext = createContext();
    const memoryManager = {} as MemoryManager;
    const contextBuilder = { getLoadingSummary: () => 'No memories loaded.' } as ContextBuilder;

    expect(() => {
      registerMemoryCommands(firstContext, memoryManager);
      registerMigrateMemoriesCommand(firstContext, memoryManager);
      registerQueryMemoryUsageCommand(firstContext, contextBuilder, '/workspace-one');

      registerMemoryCommands(secondContext, memoryManager);
      registerMigrateMemoriesCommand(secondContext, memoryManager);
      registerQueryMemoryUsageCommand(secondContext, contextBuilder, '/workspace-two');
    }).not.toThrow();

    expect(vscodeMock.activeCommands).toEqual(
      new Set([
        'gofer.remember',
        'gofer.searchMemory',
        'gofer.forgetMemory',
        'gofer.clearMemory',
        'gofer.viewMemories',
        'gofer.createHintFile',
        'gofer.migrateMemoriesToLayered',
        'gofer.queryMemoryUsage',
      ])
    );
    expect(vscodeMock.disposedCommands).toEqual(
      expect.arrayContaining([
        'gofer.remember',
        'gofer.searchMemory',
        'gofer.forgetMemory',
        'gofer.clearMemory',
        'gofer.viewMemories',
        'gofer.createHintFile',
        'gofer.migrateMemoriesToLayered',
        'gofer.queryMemoryUsage',
      ])
    );
  });
});
