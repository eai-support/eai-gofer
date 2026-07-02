/**
 * Query Memory Usage Command - T093
 * Feature 029: Memory System v2 - US-P2-04
 *
 * CLI command to analyze memory loading patterns from context-usage.jsonl.
 * Shows which memories were loaded/skipped and why.
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ContextBuilder } from '../autonomous/ContextBuilder';

let registeredQueryMemoryUsageCommand: vscode.Disposable | undefined;

export function disposeQueryMemoryUsageCommand(): void {
  registeredQueryMemoryUsageCommand?.dispose();
  registeredQueryMemoryUsageCommand = undefined;
}

/**
 * Registers the queryMemoryUsage command.
 */
export function registerQueryMemoryUsageCommand(
  context: vscode.ExtensionContext,
  contextBuilder: ContextBuilder | undefined,
  workspaceRoot: string
): void {
  disposeQueryMemoryUsageCommand();
  registeredQueryMemoryUsageCommand = vscode.commands.registerCommand(
    'gofer.queryMemoryUsage',
    async () => {
      await queryMemoryUsageCommand(contextBuilder, workspaceRoot);
    }
  );
  context.subscriptions.push(registeredQueryMemoryUsageCommand);
}

/**
 * Shows a summary of recent memory loading decisions.
 */
async function queryMemoryUsageCommand(
  contextBuilder: ContextBuilder | undefined,
  workspaceRoot: string
): Promise<void> {
  const options = ['Current Session Summary', 'Recent Loading Events (from log)'];
  const choice = await vscode.window.showQuickPick(options, {
    placeHolder: 'Choose memory usage view',
  });

  if (!choice) {return;}

  if (choice === 'Current Session Summary') {
    if (!contextBuilder) {
      vscode.window.showInformationMessage('Gofer: No active context builder session.');
      return;
    }
    const summary = contextBuilder.getLoadingSummary();
    const document = await vscode.workspace.openTextDocument({
      content: `# Memory Loading Summary\n\n${summary}`,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(document);
    return;
  }

  // Show recent events from context-usage.jsonl
  const logPath = path.join(workspaceRoot, '.specify', 'logs', 'context-usage.jsonl');
  try {
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Parse and show last 20 loading-decision events
    const decisions = lines
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((e): e is Record<string, unknown> => e !== null && e.event === 'loading-decision')
      .slice(-20);

    if (decisions.length === 0) {
      vscode.window.showInformationMessage('Gofer: No loading decision events found in logs.');
      return;
    }

    const summary = decisions
      .map((d) => {
        const icon = d.decision === 'loaded' ? '✓' : '✗';
        return `${icon} [${String(d.source ?? '')}] ${String(d.reason ?? '')} (${String(d.tokensLoaded ?? 0)} tokens)`;
      })
      .join('\n');

    const document = await vscode.workspace.openTextDocument({
      content: `# Recent Memory Loading Events\n\n${summary}\n\n_Source: ${logPath}_`,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(document);
  } catch {
    vscode.window.showInformationMessage(
      'Gofer: No memory usage log found. Run a context build first.'
    );
  }
}
