import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DefaultSkillDirectoryManager } from '../../../extension/src/council/SkillDirectoryManager';
import { CrossPlatformCommandRouter } from '../../../extension/src/council/CrossPlatformCommandRouter';
import { PlatformDetector } from '../../../extension/src/council/PlatformDetector';

interface TriggerableWatcher {
  _triggerDelete(uri: { fsPath: string; scheme: string; path: string }): void;
}

const GROK_SKILL = `---
name: eai
description: Start the EAI pipeline.
---

# Eai

Route through the repository-owned Gofer pipeline.
`;

const CLAUDE_COMMAND = `---
name: eai
description: Start the EAI pipeline from Claude.
---

# Eai

Route through the Claude command surface.
`;

describe('DefaultSkillDirectoryManager Grok discovery', () => {
  let workspacePath: string;
  let skillPath: string;

  beforeEach(() => {
    PlatformDetector.resetInstance();
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-grok-discovery-'));
    skillPath = path.join(workspacePath, '.grok', 'skills', 'eai', 'SKILL.md');
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, GROK_SKILL, 'utf8');
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('finds and lists a command when Grok is the only command surface', () => {
    const manager = new DefaultSkillDirectoryManager(workspacePath);

    const found = manager.findCommand('eai');

    expect(found).toMatchObject({
      name: 'eai',
      platform: 'grok',
      filePath: skillPath,
      invocationSyntax: { platform: 'grok', prefix: '/', example: '/eai' },
    });
    expect(manager.listCommands()).toEqual([
      expect.objectContaining({ name: 'eai', platform: 'grok' }),
    ]);
  });

  it('routes and lists a Grok-only public command through the complete router', async () => {
    const router = new CrossPlatformCommandRouter(workspacePath);

    await expect(router.listCommands()).resolves.toEqual(['eai']);
    await expect(router.routeCommand('eai')).resolves.toMatchObject({
      commandName: 'eai',
      platform: 'grok',
      filePath: skillPath,
      syntax: '/eai',
      isAvailable: true,
    });
    expect(router.isCommandAvailable('eai')).toBe(true);
  });

  it('watches Grok skills and invalidates a populated discovery cache', () => {
    const manager = new DefaultSkillDirectoryManager(workspacePath);
    expect(manager.listCommands()).toHaveLength(1);

    const onChange = vi.fn();
    const disposable = manager.watchDirectories(onChange);
    const watcherCalls = vi.mocked(vscode.workspace.createFileSystemWatcher).mock.calls;
    const grokCallIndex = watcherCalls.findIndex(
      ([pattern]) => (pattern as vscode.RelativePattern).pattern === '.grok/skills/*/SKILL.md'
    );
    expect(grokCallIndex).toBeGreaterThanOrEqual(0);

    fs.rmSync(skillPath);
    // The cached entry remains until a surface watcher reports the deletion.
    expect(manager.listCommands()).toHaveLength(1);

    const grokWatcher = vi.mocked(vscode.workspace.createFileSystemWatcher).mock.results[
      grokCallIndex
    ].value as unknown as TriggerableWatcher;
    grokWatcher._triggerDelete({ fsPath: skillPath, scheme: 'file', path: skillPath });

    expect(onChange).toHaveBeenCalledOnce();
    expect(manager.listCommands()).toEqual([]);
    disposable.dispose();
  });

  it('keeps discovery priority and results stable before and after caching', () => {
    const claudePath = path.join(workspacePath, '.claude', 'commands', 'eai.md');
    fs.mkdirSync(path.dirname(claudePath), { recursive: true });
    fs.writeFileSync(claudePath, CLAUDE_COMMAND, 'utf8');
    const manager = new DefaultSkillDirectoryManager(workspacePath);

    expect(manager.listCommands()).toEqual([
      expect.objectContaining({ name: 'eai', platform: 'claude', filePath: claudePath }),
    ]);
    expect(manager.listCommands()).toEqual([
      expect.objectContaining({ name: 'eai', platform: 'claude', filePath: claudePath }),
    ]);
    expect(manager.findCommand('eai')).toMatchObject({ platform: 'claude', filePath: claudePath });
  });

  it('does not confuse a direct lookup cache entry with a complete command listing', () => {
    const secondSkillPath = path.join(workspacePath, '.grok', 'skills', 'eai-update', 'SKILL.md');
    fs.mkdirSync(path.dirname(secondSkillPath), { recursive: true });
    fs.writeFileSync(
      secondSkillPath,
      GROK_SKILL.replace('name: eai', 'name: eai-update').replace('# Eai', '# Eai Update'),
      'utf8'
    );
    const manager = new DefaultSkillDirectoryManager(workspacePath);

    expect(manager.findCommand('eai')).toMatchObject({ name: 'eai', platform: 'grok' });
    expect(manager.listCommands().map((command) => command.name)).toEqual(['eai', 'eai-update']);
  });
});
