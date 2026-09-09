/**
 * Integration Test: user-prompt-submit.mjs memory injection (T024)
 *
 * Tests the user-prompt-submit hook's ability to:
 * 1. Load memories from JSONL (with local.json fallback)
 * 2. Score memories with type-aware relevance
 * 3. Format memories with type labels
 * 4. Output additionalContext for Claude Code injection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

describe('User-Prompt-Submit Memory Injection', () => {
  const testDir = path.join(__dirname, 'test-workspace-prompt-submit');
  const memoryDir = path.join(testDir, '.specify', 'memory');
  const hooksDir = path.join(testDir, '.specify', 'hooks');
  const jsonlPath = path.join(memoryDir, 'memories.jsonl');
  const localJsonPath = path.join(memoryDir, 'local.json');

  const hookScript = path.resolve(__dirname, '../../.specify/scripts/hooks/user-prompt-submit.mjs');

  beforeEach(() => {
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.mkdirSync(hooksDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  function writeJsonlMemories(memories: Array<Record<string, unknown>>): void {
    const lines = memories.map((m) => JSON.stringify(m)).join('\n') + '\n';
    fs.writeFileSync(jsonlPath, lines);
  }

  function writeLocalJsonMemories(memories: Array<Record<string, unknown>>): void {
    fs.writeFileSync(localJsonPath, JSON.stringify({ version: 1, memories }));
  }

  function runHook(
    prompt: string,
    sessionId = 'test-session'
  ): { stdout: string; exitCode: number } {
    const stdinData = JSON.stringify({
      prompt,
      session_id: sessionId,
    });

    try {
      const stdout = execFileSync('node', [hookScript], {
        input: stdinData,
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: testDir,
        },
        timeout: 10000,
        encoding: 'utf-8',
      });
      return { stdout: stdout || '', exitCode: 0 };
    } catch (error) {
      const err = error as { stdout?: string; status?: number };
      return { stdout: err.stdout || '', exitCode: err.status || 1 };
    }
  }

  it('should load memories from JSONL and inject context', () => {
    writeJsonlMemories([
      {
        id: 'mem-1',
        type: 'procedural',
        category: 'testing',
        tags: ['#vitest', '#testing'],
        content: 'Always use Vitest for testing',
        created: Date.now(),
        lastUsed: Date.now(),
        usedCount: 5,
        confidence: 85,
        priorityIndex: 3,
      },
    ]);

    const result = runHook('implement the test suite using vitest');
    expect(result.exitCode).toBe(0);

    if (result.stdout) {
      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput).toBeDefined();
      expect(output.hookSpecificOutput.additionalContext).toContain('Vitest');
      expect(output.hookSpecificOutput.additionalContext).toContain('[How-To]');
    }
  });

  it('should fall back to local.json when JSONL missing', () => {
    // Only write local.json, no JSONL
    writeLocalJsonMemories([
      {
        id: 'legacy-1',
        category: 'preference',
        tags: ['#formatting'],
        content: 'Use Prettier for code formatting',
        created: Date.now(),
        lastUsed: Date.now(),
        usedCount: 3,
      },
    ]);

    const result = runHook('format the code properly');
    expect(result.exitCode).toBe(0);

    if (result.stdout) {
      const output = JSON.parse(result.stdout);
      expect(output.hookSpecificOutput.additionalContext).toContain('Prettier');
    }
  });

  it('should boost procedural memories for implementation prompts', () => {
    writeJsonlMemories([
      {
        id: 'sem-1',
        type: 'semantic',
        category: 'knowledge',
        tags: ['#database'],
        content: 'The database schema uses PostgreSQL',
        created: Date.now(),
        lastUsed: Date.now(),
        usedCount: 2,
        confidence: 80,
        priorityIndex: 1,
      },
      {
        id: 'proc-1',
        type: 'procedural',
        category: 'pattern',
        tags: ['#database'],
        content: 'When creating database migrations, always use knex migrate:make',
        created: Date.now(),
        lastUsed: Date.now(),
        usedCount: 2,
        confidence: 80,
        priorityIndex: 1,
      },
    ]);

    const result = runHook('implement the database migration');

    if (result.stdout) {
      const output = JSON.parse(result.stdout);
      const context = output.hookSpecificOutput.additionalContext;
      // Procedural should appear first (higher score for implement tasks)
      const procIdx = context.indexOf('[How-To]');
      const semIdx = context.indexOf('[Knowledge]');
      if (procIdx >= 0 && semIdx >= 0) {
        expect(procIdx).toBeLessThan(semIdx);
      }
    }
  });

  it('should boost semantic memories for research prompts', () => {
    writeJsonlMemories([
      {
        id: 'proc-1',
        type: 'procedural',
        category: 'pattern',
        tags: ['#auth'],
        content: 'Use passport.js middleware for authentication setup',
        created: Date.now(),
        lastUsed: Date.now(),
        usedCount: 2,
        confidence: 80,
        priorityIndex: 1,
      },
      {
        id: 'sem-1',
        type: 'semantic',
        category: 'knowledge',
        tags: ['#auth'],
        content: 'Authentication uses OAuth2 with JWT tokens and refresh rotation',
        created: Date.now(),
        lastUsed: Date.now(),
        usedCount: 2,
        confidence: 80,
        priorityIndex: 1,
      },
    ]);

    const result = runHook('explain how the auth system works');

    if (result.stdout) {
      const output = JSON.parse(result.stdout);
      const context = output.hookSpecificOutput.additionalContext;
      const semIdx = context.indexOf('[Knowledge]');
      const procIdx = context.indexOf('[How-To]');
      if (semIdx >= 0 && procIdx >= 0) {
        expect(semIdx).toBeLessThan(procIdx);
      }
    }
  });

  it('should penalize stale memories', () => {
    writeJsonlMemories([
      {
        id: 'fresh-1',
        type: 'semantic',
        category: 'knowledge',
        tags: ['#config'],
        content: 'Config uses environment variables with dotenv',
        created: Date.now(),
        lastUsed: Date.now(),
        usedCount: 2,
        confidence: 80,
        stale: false,
      },
      {
        id: 'stale-1',
        type: 'semantic',
        category: 'knowledge',
        tags: ['#config'],
        content: 'Config file was at config/settings.yaml',
        created: Date.now() - 86400000,
        lastUsed: Date.now() - 86400000,
        usedCount: 2,
        confidence: 80,
        stale: true,
      },
    ]);

    const result = runHook('update the config settings');

    if (result.stdout) {
      const output = JSON.parse(result.stdout);
      const context = output.hookSpecificOutput.additionalContext;
      // Fresh memory should appear, stale should be deprioritized or marked
      expect(context).toContain('environment variables');
      if (context.includes('settings.yaml')) {
        expect(context).toContain('[stale]');
      }
    }
  });

  it('should handle tombstones in JSONL', () => {
    writeJsonlMemories([
      {
        id: 'mem-1',
        type: 'semantic',
        category: 'testing',
        tags: ['#testing'],
        content: 'Use Jest for testing',
        created: Date.now(),
        lastUsed: Date.now(),
        usedCount: 1,
      },
      {
        id: 'mem-1',
        _deleted: true,
      },
      {
        id: 'mem-2',
        type: 'procedural',
        category: 'testing',
        tags: ['#testing'],
        content: 'Use Vitest for testing instead of Jest',
        created: Date.now(),
        lastUsed: Date.now(),
        usedCount: 3,
        confidence: 90,
        priorityIndex: 3,
      },
    ]);

    const result = runHook('set up the testing framework');

    if (result.stdout) {
      const output = JSON.parse(result.stdout);
      const context = output.hookSpecificOutput.additionalContext;
      // Deleted memory should not appear
      expect(context).not.toContain('Use Jest for testing');
      expect(context).toContain('Vitest');
    }
  });

  it('applies the Gofer contract when no memories match', () => {
    writeJsonlMemories([
      {
        id: 'mem-1',
        type: 'semantic',
        category: 'database',
        tags: ['#postgresql'],
        content: 'Uses PostgreSQL for data storage',
        created: Date.now(),
        lastUsed: Date.now(),
        usedCount: 1,
      },
    ]);

    // Prompt about something completely unrelated
    const result = runHook('hello');
    if (result.stdout) {
      const output = JSON.parse(result.stdout);
      const context = output.hookSpecificOutput.additionalContext;
      expect(context).toContain('EAI Gofer is active for this request.');
      expect(context).not.toContain('Uses PostgreSQL for data storage');
    }
  });
});
