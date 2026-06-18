/**
 * Debug command for AI Usage auto-discovery
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export async function debugAIUsageCommand(workspacePath: string): Promise<void> {
  const logger = Logger.for('DebugAIUsage');
  const outputChannel = vscode.window.createOutputChannel('Gofer AI Usage Debug');
  outputChannel.show();

  outputChannel.appendLine('=== AI Usage Auto-Discovery Debug ===\n');

  // Check Claude Code installation
  const claudeDir = path.join(require('os').homedir(), '.claude');
  const historyPath = path.join(claudeDir, 'history.jsonl');

  outputChannel.appendLine('1. Claude Code Installation:');

  let claudeDirExists: boolean;
  try {
    claudeDirExists = (await fs.promises.stat(claudeDir)).isDirectory();
  } catch {
    claudeDirExists = false;
  }

  let historyStats: fs.Stats | undefined;
  try {
    const stats = await fs.promises.stat(historyPath);
    if (stats.isFile()) {
      historyStats = stats;
    }
  } catch {
    historyStats = undefined;
  }
  const historyPathExists = historyStats !== undefined;

  outputChannel.appendLine(`   ~/.claude exists: ${claudeDirExists}`);
  outputChannel.appendLine(`   history.jsonl exists: ${historyPathExists}`);

  if (historyPathExists && historyStats) {
    outputChannel.appendLine(`   history.jsonl size: ${historyStats.size} bytes`);
  }

  // Check context-usage.jsonl
  const contextLogPath = path.join(workspacePath, '.specify/logs/context-usage.jsonl');
  outputChannel.appendLine('\n2. Context Usage Log:');
  outputChannel.appendLine(`   Path: ${contextLogPath}`);

  let contextLogContent: string | undefined;
  try {
    contextLogContent = await fs.promises.readFile(contextLogPath, 'utf-8');
  } catch {
    contextLogContent = undefined;
  }
  const contextLogExists = contextLogContent !== undefined;
  outputChannel.appendLine(`   Exists: ${contextLogExists}`);

  if (contextLogContent !== undefined) {
    const sizeBytes = Buffer.byteLength(contextLogContent, 'utf-8');
    outputChannel.appendLine(`   Size: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);

    // Count health_check entries
    const lines = contextLogContent.split('\n').filter(Boolean);
    const healthChecks = lines.filter((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.eventType === 'health_check';
      } catch {
        return false;
      }
    });
    outputChannel.appendLine(`   Total entries: ${lines.length}`);
    outputChannel.appendLine(`   Health check entries: ${healthChecks.length}`);

    // Show recent entry
    if (healthChecks.length > 0) {
      const recent = JSON.parse(healthChecks[healthChecks.length - 1]);
      outputChannel.appendLine(`   Most recent: ${recent.timestamp}`);
      outputChannel.appendLine(`   Tokens: ${recent.tokensUsed}`);
    }
  }

  // Try local usage summary
  outputChannel.appendLine('\n3. Local CLI Usage Summary:');
  try {
    const { ClaudeCodeUsageAdapter } = await import('../autonomous/ClaudeCodeUsageAdapter');
    const adapter = new ClaudeCodeUsageAdapter(workspacePath);

    const isInstalled = await adapter.isClaudeCodeInstalled();
    outputChannel.appendLine(`   Claude Code detected: ${isInstalled}`);

    if (isInstalled) {
      const summary = await adapter.getUsageSummary();
      outputChannel.appendLine(`   Sessions: ${summary.totalSessions}`);
      outputChannel.appendLine(`   Cost: $${summary.totalCostUsd.toFixed(2)}`);
      outputChannel.appendLine(
        `   Tokens: ${(summary.totalInputTokens + summary.totalOutputTokens).toLocaleString()}`
      );
      outputChannel.appendLine(
        `   Providers: ${Object.keys(summary.byProvider).join(', ') || 'none'}`
      );
    }
  } catch (err) {
    outputChannel.appendLine(`   ❌ Error: ${err}`);
    logger.error('Sync failed', err instanceof Error ? err : new Error(String(err)));
  }

  // Check AIUsageMonitor
  outputChannel.appendLine('\n4. Checking if AIUsageMonitor is running...');
  outputChannel.appendLine('   (Check "Gofer" output channel for monitor logs)');

  outputChannel.appendLine('\n=== Debug Complete ===');
  outputChannel.appendLine('If panel still shows $0, check:');
  outputChannel.appendLine('1. Does ~/.claude/projects contain logs for this workspace?');
  outputChannel.appendLine(
    '2. Is AIUsageMonitor wired to ClaudeCodeUsageAdapter? (check extension.ts)'
  );
  outputChannel.appendLine(
    '3. Has the usage polling interval elapsed, or did you run Gofer: Refresh AI Usage?'
  );

  vscode.window.showInformationMessage('AI Usage debug info written to output channel');
}
