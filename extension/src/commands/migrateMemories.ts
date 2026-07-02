/**
 * Migrate Memories to Layered Format Command - T023
 * Feature 029: Memory System v2
 *
 * VSCode command to manually trigger migration of pre-layered memories
 * to the schemaVersion 2 layered format (L0/L1/L2 tiers).
 */

import * as vscode from 'vscode';
import { MemoryManager } from '../autonomous/MemoryManager';

let registeredMigrateMemoriesCommand: vscode.Disposable | undefined;

export function disposeMigrateMemoriesCommand(): void {
  registeredMigrateMemoriesCommand?.dispose();
  registeredMigrateMemoriesCommand = undefined;
}

/**
 * Registers the migrateMemoriesToLayered command.
 *
 * @param context - VSCode extension context
 * @param memoryManager - Initialized MemoryManager instance
 */
export function registerMigrateMemoriesCommand(
  context: vscode.ExtensionContext,
  memoryManager: MemoryManager
): void {
  disposeMigrateMemoriesCommand();
  registeredMigrateMemoriesCommand = vscode.commands.registerCommand(
    'gofer.migrateMemoriesToLayered',
    async () => {
      await migrateMemoriesToLayeredCommand(memoryManager);
    }
  );
  context.subscriptions.push(registeredMigrateMemoriesCommand);
}

/**
 * Executes the migration from pre-layered to layered memory format.
 *
 * Shows progress, reports counts, and surfaces errors via VSCode UI.
 */
async function migrateMemoriesToLayeredCommand(memoryManager: MemoryManager): Promise<void> {
  const answer = await vscode.window.showInformationMessage(
    'Migrate memories to layered format (L0/L1/L2)? ' +
      'Existing memories without layers will have abstract and overview generated via truncation.',
    { modal: true },
    'Migrate'
  );

  if (answer !== 'Migrate') {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Gofer: Migrating memories to layered format...',
      cancellable: false,
    },
    async () => {
      try {
        await memoryManager.initializeStorage();
        const migrated = await memoryManager.migrateToLayered();

        if (migrated === 0) {
          vscode.window.showInformationMessage(
            'Gofer: All memories are already in layered format. No migration needed.'
          );
        } else {
          vscode.window.showInformationMessage(
            `Gofer: Migration complete. ${migrated} memor${migrated === 1 ? 'y' : 'ies'} migrated to layered format.`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Gofer: Migration failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
