/**
 * Memory and Learning System - VSCode Commands
 *
 * Provides VSCode commands for memory management:
 * - Gofer: Remember - Save a new memory
 * - Gofer: Search Memory - Search existing memories
 * - Gofer: Forget Memory - Delete a memory
 * - Gofer: Clear Memory - Clear memories by scope
 * - Gofer: View Memories - Open memory panel
 */

import * as vscode from 'vscode';
import { MemoryManager } from '../autonomous/MemoryManager';
import { type Memory } from '../autonomous/memory';
import { MemoryPanel } from '../ui/MemoryPanel';

let registeredMemoryCommandDisposables: vscode.Disposable[] = [];

export function disposeMemoryCommands(): void {
  for (const disposable of registeredMemoryCommandDisposables) {
    disposable.dispose();
  }
  registeredMemoryCommandDisposables = [];
}

/**
 * Registers all memory-related commands.
 *
 * @param context - VSCode extension context
 * @param memoryManager - MemoryManager instance
 */
export function registerMemoryCommands(
  context: vscode.ExtensionContext,
  memoryManager: MemoryManager
): void {
  // Workspace reinitialization creates a fresh MemoryManager in the same
  // extension host. Dispose old command handlers first so VS Code does not
  // reject duplicate command ids such as `gofer.remember`.
  disposeMemoryCommands();
  const disposables: vscode.Disposable[] = [];

  try {
    // Register "Gofer: Remember" command
    disposables.push(
      vscode.commands.registerCommand('gofer.remember', async () => {
        await rememberCommand(memoryManager);
      })
    );

    // Register "Gofer: Search Memory" command
    disposables.push(
      vscode.commands.registerCommand('gofer.searchMemory', async () => {
        await searchMemoryCommand(memoryManager);
      })
    );

    // Register "Gofer: Forget Memory" command
    disposables.push(
      vscode.commands.registerCommand('gofer.forgetMemory', async () => {
        await forgetMemoryCommand(memoryManager);
      })
    );

    // Register "Gofer: Clear Memory" command
    disposables.push(
      vscode.commands.registerCommand('gofer.clearMemory', async () => {
        await clearMemoryCommand(memoryManager);
      })
    );

    // Register "Gofer: View Memories" command
    disposables.push(
      vscode.commands.registerCommand('gofer.viewMemories', async () => {
        MemoryPanel.createOrShow(context.extensionUri, memoryManager);
      })
    );

    // Register "Gofer: Create Hint File" command (T072)
    disposables.push(
      vscode.commands.registerCommand('gofer.createHintFile', async () => {
        await createHintFileCommand(context);
      })
    );
  } catch (error) {
    for (const disposable of disposables) {
      disposable.dispose();
    }
    throw error;
  }

  registeredMemoryCommandDisposables = disposables;
  context.subscriptions.push(...disposables);
}

/**
 * "Gofer: Remember" command implementation.
 * Prompts user for memory content, scope, category, and tags.
 *
 * @param memoryManager - MemoryManager instance
 */
async function rememberCommand(memoryManager: MemoryManager): Promise<void> {
  try {
    // Prompt for content
    const content = await vscode.window.showInputBox({
      prompt: 'What would you like me to remember?',
      placeHolder: 'e.g., Use Vitest for all unit tests',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Content cannot be empty';
        }
        if (value.length > 10000) {
          return 'Content must be 10,000 characters or less';
        }
        return undefined;
      },
    });

    if (!content) {
      return; // User cancelled
    }

    // Prompt for scope
    const scopeChoice = await vscode.window.showQuickPick(
      [
        {
          label: 'Local (this project only)',
          description: 'Memory will only apply to this workspace',
          value: 'local' as const,
        },
        {
          label: 'Global (all projects)',
          description: 'Memory will apply across all workspaces',
          value: 'global' as const,
        },
      ],
      {
        placeHolder: 'Choose memory scope',
      }
    );

    if (!scopeChoice) {
      return; // User cancelled
    }

    // Prompt for category
    const category = await vscode.window.showInputBox({
      prompt: 'Category (e.g., testing, api_patterns, preferences)',
      placeHolder: 'testing',
      value: 'preferences',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Category cannot be empty';
        }
        if (!/^[a-z0-9_-]+$/i.test(value)) {
          return 'Category must contain only letters, numbers, hyphens, and underscores';
        }
        if (value.length > 100) {
          return 'Category must be 100 characters or less';
        }
        return undefined;
      },
    });

    if (!category) {
      return; // User cancelled
    }

    // Prompt for tags
    const tagsInput = await vscode.window.showInputBox({
      prompt: 'Tags (comma-separated, each starting with #)',
      placeHolder: '#testing, #vitest, #unit-tests',
      validateInput: (value) => {
        if (!value) {
          return undefined; // Tags are optional
        }
        const tags = value.split(',').map((t) => t.trim());
        if (tags.length > 20) {
          return 'Maximum 20 tags allowed';
        }
        for (const tag of tags) {
          if (tag && !/^#[a-z0-9_-]+$/i.test(tag)) {
            return `Invalid tag format: ${tag} (must start with # and contain only letters, numbers, hyphens, underscores)`;
          }
        }
        return undefined;
      },
    });

    if (tagsInput === undefined) {
      return; // User cancelled
    }

    const tags = tagsInput
      ? tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];

    // Save memory
    await memoryManager.save({
      category,
      tags,
      scope: scopeChoice.value,
      content,
      lastUsed: Date.now(),
      usedCount: 0,
      learnedFrom: 'user_interaction',
    });

    vscode.window.showInformationMessage(`✓ Memory saved (${scopeChoice.value} scope)`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to save memory: ${(error as Error).message}`);
  }
}

/**
 * "Gofer: Search Memory" command implementation.
 * Prompts user for search query and displays results.
 *
 * @param memoryManager - MemoryManager instance
 */
async function searchMemoryCommand(memoryManager: MemoryManager): Promise<void> {
  try {
    // Prompt for keywords
    const keywords = await vscode.window.showInputBox({
      prompt: 'Search keywords (searches content and category)',
      placeHolder: 'e.g., testing, API, preferences',
    });

    if (keywords === undefined) {
      return; // User cancelled
    }

    // Perform search
    const result = await memoryManager.search({
      keywords: keywords || undefined,
    });

    if (result.count === 0) {
      vscode.window.showInformationMessage('No memories found');
      return;
    }

    // Display results
    const items = result.memories.map((memory) => ({
      label: memory.content.substring(0, 60) + (memory.content.length > 60 ? '...' : ''),
      description: `${memory.category} | ${memory.scope}`,
      detail: `Tags: ${memory.tags.join(', ')} | Used ${memory.usedCount} times`,
      memory,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Found ${result.count} memories (search took ${result.searchTime}ms)`,
    });

    if (selected) {
      // Show full memory details
      const panel = vscode.window.createWebviewPanel(
        'memoryDetail',
        'Memory Details',
        vscode.ViewColumn.One,
        {}
      );

      panel.webview.html = getMemoryDetailsHtml(selected.memory);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to search memories: ${(error as Error).message}`);
  }
}

/**
 * "Gofer: Forget Memory" command implementation.
 * Shows memory list and deletes selected memory.
 *
 * @param memoryManager - MemoryManager instance
 */
async function forgetMemoryCommand(memoryManager: MemoryManager): Promise<void> {
  try {
    // Load all memories
    const memories = await memoryManager.load();

    if (memories.length === 0) {
      vscode.window.showInformationMessage('No memories to forget');
      return;
    }

    // Display memories
    const items = memories.map((memory) => ({
      label: memory.content.substring(0, 60) + (memory.content.length > 60 ? '...' : ''),
      description: `${memory.category} | ${memory.scope}`,
      detail: `Tags: ${memory.tags.join(', ')} | Used ${memory.usedCount} times`,
      memory,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select memory to forget',
    });

    if (!selected) {
      return; // User cancelled
    }

    // Confirm deletion
    const confirmed = await vscode.window.showWarningMessage(
      `Are you sure you want to forget this memory?`,
      { modal: true },
      'Yes, forget it'
    );

    if (confirmed === 'Yes, forget it') {
      await memoryManager.forget(selected.memory.id);
      vscode.window.showInformationMessage('✓ Memory forgotten');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to forget memory: ${(error as Error).message}`);
  }
}

/**
 * "Gofer: Clear Memory" command implementation.
 * Prompts for scope and clears memories.
 *
 * @param memoryManager - MemoryManager instance
 */
async function clearMemoryCommand(memoryManager: MemoryManager): Promise<void> {
  try {
    // Prompt for scope
    const scopeChoice = await vscode.window.showQuickPick(
      [
        {
          label: 'Local (this project only)',
          description: 'Clear memories for this workspace only',
          value: 'local' as const,
        },
        {
          label: 'Global (all projects)',
          description: 'Clear memories across all workspaces',
          value: 'global' as const,
        },
        {
          label: 'All memories',
          description: 'Clear both local and global memories',
          value: 'all' as const,
        },
      ],
      {
        placeHolder: 'Choose which memories to clear',
      }
    );

    if (!scopeChoice) {
      return; // User cancelled
    }

    // Confirm deletion
    const confirmed = await vscode.window.showWarningMessage(
      `Are you sure you want to clear ${scopeChoice.label.toLowerCase()}? This cannot be undone.`,
      { modal: true },
      'Yes, clear them'
    );

    if (confirmed === 'Yes, clear them') {
      const count = await memoryManager.clear(scopeChoice.value);
      vscode.window.showInformationMessage(
        `✓ Cleared ${count} memories (${scopeChoice.value} scope)`
      );
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to clear memories: ${(error as Error).message}`);
  }
}

/**
 * Generates HTML for memory details webview.
 *
 * @param memory - Memory to display
 * @returns HTML string
 */
function getMemoryDetailsHtml(memory: Memory): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Memory Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .field {
            margin-bottom: 16px;
        }
        .label {
            font-weight: bold;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 4px;
        }
        .value {
            font-size: 14px;
            line-height: 1.6;
        }
        .tag {
            display: inline-block;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 3px;
            margin-right: 4px;
            font-size: 12px;
        }
        .stats {
            display: flex;
            gap: 24px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .stat {
            flex: 1;
        }
    </style>
</head>
<body>
    <div class="field">
        <div class="label">Content</div>
        <div class="value">${escapeHtml(memory.content)}</div>
    </div>

    <div class="field">
        <div class="label">Category</div>
        <div class="value">${escapeHtml(memory.category)}</div>
    </div>

    <div class="field">
        <div class="label">Tags</div>
        <div class="value">
            ${memory.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
    </div>

    <div class="field">
        <div class="label">Scope</div>
        <div class="value">${memory.scope === 'local' ? 'Local (this project)' : 'Global (all projects)'}</div>
    </div>

    <div class="stats">
        <div class="stat">
            <div class="label">Used Count</div>
            <div class="value">${memory.usedCount} times</div>
        </div>
        <div class="stat">
            <div class="label">Created</div>
            <div class="value">${new Date(memory.created).toLocaleString()}</div>
        </div>
        <div class="stat">
            <div class="label">Last Used</div>
            <div class="value">${new Date(memory.lastUsed).toLocaleString()}</div>
        </div>
    </div>

    <div class="field" style="margin-top: 20px;">
        <div class="label">Learned From</div>
        <div class="value">${escapeHtml(memory.learnedFrom)}</div>
    </div>

    <div class="field">
        <div class="label">ID</div>
        <div class="value" style="font-family: monospace; font-size: 11px;">${memory.id}</div>
    </div>
</body>
</html>
`;
}

/**
 * Escapes HTML special characters.
 *
 * @param text - Text to escape
 * @returns Escaped HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// T072: Create Hint File Command
// ============================================================================

/**
 * "Gofer: Create Hint File" command implementation.
 * Prompts user for hint location and creates a hint file from template.
 *
 * @param context - VSCode extension context
 */
async function createHintFileCommand(context: vscode.ExtensionContext): Promise<void> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open. Please open a project first.');
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const hintsDir = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), '.specify', 'hints');

    // Prompt for scope/location
    const scopeChoice = await vscode.window.showQuickPick(
      [
        {
          label: 'Global Hint',
          description: 'Applies to entire project (.specify/hints/global.md)',
          value: 'global',
          detail: 'Priority: 1 (lowest)',
        },
        {
          label: 'Project Hint',
          description: 'Applies to project level (.specify/hints/[name].md)',
          value: 'project',
          detail: 'Priority: 5 (medium)',
        },
        {
          label: 'Directory Hint',
          description: 'Applies to specific directory (.specify/hints/[dir]/[name].md)',
          value: 'directory',
          detail: 'Priority: 10 (highest)',
        },
      ],
      {
        placeHolder: 'Select hint scope',
        title: 'Create Hint File',
      }
    );

    if (!scopeChoice) {
      return; // User cancelled
    }

    let targetPath: vscode.Uri;
    let hintName: string;

    if (scopeChoice.value === 'global') {
      // Global hint at .specify/hints/global.md
      targetPath = vscode.Uri.joinPath(hintsDir, 'global.md');
      hintName = 'global';
    } else if (scopeChoice.value === 'project') {
      // Project hint - prompt for name
      const name = await vscode.window.showInputBox({
        prompt: 'Enter hint name (e.g., "api-design", "testing")',
        placeHolder: 'hint-name',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Hint name cannot be empty';
          }
          if (!/^[a-z0-9-]+$/.test(value)) {
            return 'Hint name must be lowercase with hyphens only';
          }
          return undefined;
        },
      });

      if (!name) {
        return; // User cancelled
      }

      hintName = name;
      targetPath = vscode.Uri.joinPath(hintsDir, `${name}.md`);
    } else {
      // Directory hint - prompt for directory path and name
      const dirPath = await vscode.window.showInputBox({
        prompt: 'Enter directory path (e.g., "api", "frontend/components")',
        placeHolder: 'directory/path',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Directory path cannot be empty';
          }
          return undefined;
        },
      });

      if (!dirPath) {
        return; // User cancelled
      }

      const name = await vscode.window.showInputBox({
        prompt: 'Enter hint name (e.g., "rest-conventions", "component-patterns")',
        placeHolder: 'hint-name',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Hint name cannot be empty';
          }
          if (!/^[a-z0-9-]+$/.test(value)) {
            return 'Hint name must be lowercase with hyphens only';
          }
          return undefined;
        },
      });

      if (!name) {
        return; // User cancelled
      }

      hintName = name;
      targetPath = vscode.Uri.joinPath(hintsDir, dirPath, `${name}.md`);
    }

    // Check if file already exists
    try {
      await vscode.workspace.fs.stat(targetPath);
      const overwrite = await vscode.window.showWarningMessage(
        `Hint file already exists at ${targetPath.fsPath}. Overwrite?`,
        'Yes',
        'No'
      );

      if (overwrite !== 'Yes') {
        return;
      }
    } catch (_error) {
      // File doesn't exist, continue
    }

    // Load template
    const templatePath = vscode.Uri.joinPath(
      context.extensionUri,
      'src',
      'templates',
      'hint-template.md'
    );

    let templateContent: string;
    try {
      const templateBytes = await vscode.workspace.fs.readFile(templatePath);
      templateContent = Buffer.from(templateBytes).toString('utf-8');

      // Customize template with hint name
      templateContent = templateContent.replace(
        'title: Coding Hint Template',
        `title: ${hintName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`
      );
      templateContent = templateContent.replace(
        '# Hint Title',
        `# ${hintName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`
      );
    } catch (_error) {
      vscode.window.showErrorMessage('Failed to load hint template. Creating basic template.');
      templateContent = `---
title: ${hintName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
tags:
  - ${hintName}
version: "1.0.0"
---

# ${hintName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}

Add your coding guidelines here.
`;
    }

    // Create directory if needed
    const dirUri = vscode.Uri.file(
      targetPath.fsPath.substring(0, targetPath.fsPath.lastIndexOf('/'))
    );
    await vscode.workspace.fs.createDirectory(dirUri);

    // Write hint file
    await vscode.workspace.fs.writeFile(targetPath, Buffer.from(templateContent, 'utf-8'));

    // Open the file
    const document = await vscode.workspace.openTextDocument(targetPath);
    await vscode.window.showTextDocument(document);

    vscode.window.showInformationMessage(`Created hint file: ${targetPath.fsPath}`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create hint file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
