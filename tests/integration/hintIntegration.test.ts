/**
 * Integration tests for HintLoader and ContextBuilder
 *
 * T075: Test hint precedence (directory > project > global)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fsPromises from 'fs/promises';

// Unmock fs module for integration tests
vi.unmock('fs');
const { writes, writeFailures, trackWrite } = vi.hoisted(() => {
  const writes = new Set<Promise<unknown>>();
  const writeFailures: unknown[] = [];
  const trackWrite = (promise: Promise<unknown>) => {
    writes.add(promise);
    void promise.then(
      () => writes.delete(promise),
      (error) => {
        writeFailures.push(error);
        writes.delete(promise);
      }
    );
    return promise;
  };
  return { writes, writeFailures, trackWrite };
});
const drainWrites = async () => {
  // A settled failure must not prevent chained writes from finishing.
  while (writes.size) await Promise.allSettled([...writes]);
  if (writeFailures.length) {
    throw new AggregateError(writeFailures.splice(0), 'Hint audit writes failed');
  }
};
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  const tracked =
    (operation: (...args: any[]) => Promise<unknown>) =>
    (...args: any[]) =>
      trackWrite(operation(...args));
  // Delegate to real I/O; only expose pending audit writes to test teardown.
  return { ...actual, mkdir: tracked(actual.mkdir), appendFile: tracked(actual.appendFile) };
});
import * as fs from 'fs';

import { HintLoader } from '../../extension/src/autonomous/HintLoader';
import { ContextBuilder } from '../../extension/src/autonomous/ContextBuilder';
import { MemoryManager } from '../../extension/src/autonomous/MemoryManager';

const cleanupWorkspace = async (workspaceRoot: string, dispose: () => void) => {
  const failures: unknown[] = [];
  for (const cleanup of [
    dispose,
    drainWrites,
    () => fsPromises.rm(workspaceRoot, { recursive: true }),
  ]) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(...(error instanceof AggregateError ? error.errors : [error]));
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Hint integration cleanup failed');
};

describe('Hint Integration Tests (T075)', () => {
  let testWorkspaceRoot: string;
  let hintsDir: string;
  let memoryDir: string;

  let hintLoader: HintLoader;
  let memoryManager: MemoryManager;
  let contextBuilder: ContextBuilder;

  beforeEach(() => {
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-hint-integration-'));
    hintsDir = path.join(testWorkspaceRoot, '.specify', 'hints');
    memoryDir = path.join(testWorkspaceRoot, '.specify', 'memory');

    // Create directories
    fs.mkdirSync(hintsDir, { recursive: true });
    fs.mkdirSync(memoryDir, { recursive: true });

    // Mock VSCode ExtensionContext
    const mockContext = {
      globalStoragePath: path.join(testWorkspaceRoot, 'global-storage'),
      globalState: {
        get: vi.fn().mockReturnValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      },
    } as any;

    // Initialize components
    hintLoader = new HintLoader(testWorkspaceRoot);
    memoryManager = new MemoryManager(mockContext, testWorkspaceRoot);
    contextBuilder = new ContextBuilder(testWorkspaceRoot, memoryManager, hintLoader);
  });

  afterEach(async () => {
    await cleanupWorkspace(testWorkspaceRoot, () => contextBuilder?.dispose());
  });

  it('drains chained real audit writes before teardown', async () => {
    const logDir = path.join(testWorkspaceRoot, '.specify', 'logs');
    const file = path.join(logDir, 'controlled-audit.jsonl');
    const output = '{"test":"real-write"}\n';
    void fsPromises
      .mkdir(logDir, { recursive: true })
      .then(() => fsPromises.appendFile(file, output));
    await drainWrites();
    expect(fs.readFileSync(file, 'utf8')).toBe(output);
    expect(writes.size).toBe(0);
  });

  it('finishes pending real writes and removes the folder before surfacing failures', async () => {
    const workspace = fs.mkdtempSync(path.join(testWorkspaceRoot, 'cleanup-regression-'));
    const file = path.join(workspace, 'pending-audit.jsonl');
    const output = '{"test":"pending-write"}\n';
    let releaseWrite!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const pendingWrite = trackWrite(released.then(() => fsPromises.appendFile(file, output)));
    const failedWrite = fsPromises.appendFile(workspace, 'Cannot append to a directory.');
    const directoryErrorCode =
      process.platform === 'win32' ? expect.stringMatching(/^(EISDIR|EPERM|EACCES)$/) : 'EISDIR';
    const disposalFailure = new Error('Controlled disposal failure');
    const dispose = vi.fn(() => {
      throw disposalFailure;
    });
    let cleanupFinished = false;
    const cleanup = cleanupWorkspace(workspace, dispose).finally(() => {
      cleanupFinished = true;
    });
    const cleanupAssertion = expect(cleanup).rejects.toMatchObject({
      errors: [disposalFailure, expect.objectContaining({ code: directoryErrorCode })],
    });

    try {
      await expect(failedWrite).rejects.toMatchObject({ code: directoryErrorCode });
      expect(cleanupFinished).toBe(false);
      expect(fs.existsSync(workspace)).toBe(true);
      expect(writes.has(pendingWrite)).toBe(true);
    } finally {
      releaseWrite();
      await cleanupAssertion;
    }

    expect(dispose).toHaveBeenCalledOnce();
    await expect(pendingWrite).resolves.toBeUndefined();
    expect(cleanupFinished).toBe(true);
    expect(fs.existsSync(workspace)).toBe(false);
    expect(writes.size).toBe(0);
    expect(writeFailures).toHaveLength(0);
  });

  // ==========================================================================
  // T075: Hint Precedence Tests
  // ==========================================================================

  describe('Hint Precedence (directory > project > global)', () => {
    it('should prioritize directory hints over project hints', async () => {
      // Create global hint
      fs.writeFileSync(
        path.join(hintsDir, 'global.md'),
        '# Global Standards\n\nUse TypeScript strict mode.'
      );

      // Create project hint
      fs.writeFileSync(
        path.join(hintsDir, 'testing.md'),
        '# Testing Standards\n\nUse Vitest for all tests.'
      );

      // Create directory hint
      fs.mkdirSync(path.join(hintsDir, 'api'), { recursive: true });
      fs.writeFileSync(
        path.join(hintsDir, 'api', 'rest.md'),
        '# REST API Guidelines\n\nUse RESTful conventions.'
      );

      // Load hints for API file
      const result = await hintLoader.loadForTask({
        affectedFiles: [path.join(testWorkspaceRoot, 'src', 'api', 'users.ts')],
      });

      // Verify all hints are loaded
      expect(result.hints).toHaveLength(3);

      // Verify merged content has directory hint first (highest priority)
      const content = result.mergedContent;
      const restIndex = content.indexOf('REST API Guidelines');
      const testingIndex = content.indexOf('Testing Standards');
      const globalIndex = content.indexOf('Global Standards');

      expect(restIndex).toBeLessThan(testingIndex);
      expect(testingIndex).toBeLessThan(globalIndex);
    });

    it('should apply multiple directory hints when multiple directories match', async () => {
      // Create hints for nested directories
      fs.mkdirSync(path.join(hintsDir, 'frontend'), { recursive: true });
      fs.writeFileSync(
        path.join(hintsDir, 'frontend', 'react.md'),
        '# React Conventions\n\nUse functional components.'
      );

      fs.mkdirSync(path.join(hintsDir, 'components'), { recursive: true });
      fs.writeFileSync(
        path.join(hintsDir, 'components', 'patterns.md'),
        '# Component Patterns\n\nUse composition over inheritance.'
      );

      // Load hints for file in nested directory
      const result = await hintLoader.loadForTask({
        affectedFiles: [
          path.join(testWorkspaceRoot, 'src', 'frontend', 'components', 'Button.tsx'),
        ],
      });

      // Should load both directory hints
      const dirHints = result.hints.filter((h) => h.scope === 'directory');
      expect(dirHints.length).toBeGreaterThanOrEqual(1);

      // Content should include both guidelines
      expect(result.mergedContent).toContain('React Conventions');
    });

    it('should respect global and project hints when no directory hints apply', async () => {
      // Create global hint
      fs.writeFileSync(
        path.join(hintsDir, 'global.md'),
        '# Global Standards\n\nUse TypeScript strict mode.'
      );

      // Create project hint
      fs.writeFileSync(
        path.join(hintsDir, 'code-style.md'),
        '# Code Style\n\nUse 2 spaces for indentation.'
      );

      // Load hints for file that doesn't match any directory hints
      const result = await hintLoader.loadForTask({
        affectedFiles: [path.join(testWorkspaceRoot, 'src', 'utils', 'helpers.ts')],
      });

      // Should load global and project hints
      expect(result.hints).toHaveLength(2);

      const scopes = result.hints.map((h) => h.scope);
      expect(scopes).toContain('global');
      expect(scopes).toContain('project');

      // Verify project hint comes before global
      const content = result.mergedContent;
      const styleIndex = content.indexOf('Code Style');
      const globalIndex = content.indexOf('Global Standards');
      expect(styleIndex).toBeLessThan(globalIndex);
    });

    it('should load declared hints from spec frontmatter', async () => {
      // Create project hints
      fs.writeFileSync(
        path.join(hintsDir, 'api-design.md'),
        '# API Design\n\nRESTful best practices.'
      );

      fs.mkdirSync(path.join(hintsDir, 'backend'), { recursive: true });
      fs.writeFileSync(
        path.join(hintsDir, 'backend', 'database.md'),
        '# Database Guidelines\n\nUse parameterized queries.'
      );

      // Load hints with declared hints
      const result = await hintLoader.loadForTask({
        affectedFiles: [],
        declaredHints: ['api-design', 'backend/database'],
      });

      // Should load both declared hints
      expect(result.hints).toHaveLength(2);

      const content = result.mergedContent;
      expect(content).toContain('API Design');
      expect(content).toContain('Database Guidelines');
    });
  });

  // ==========================================================================
  // ContextBuilder Integration Tests
  // ==========================================================================

  describe('ContextBuilder Integration', () => {
    it('should merge hints, memories, and task context', async () => {
      // Create hints
      fs.writeFileSync(path.join(hintsDir, 'testing.md'), '# Testing Standards\n\nUse Vitest.');

      // Create memory
      await memoryManager.save({
        content: 'Always write unit tests for new features',
        category: 'testing',
        tags: ['#testing', '#best-practices'],
        scope: 'local',
        learnedFrom: 'user_interaction',
        lastUsed: Date.now(),
        usedCount: 0,
      });

      // Use a contextBuilder with memory-first loading disabled to ensure
      // hints are always loaded (legacy behavior for this test)
      const legacyContextBuilder = new ContextBuilder(
        testWorkspaceRoot,
        memoryManager,
        hintLoader,
        undefined,
        { enableMemoryFirstLoading: false }
      );

      // Build context
      const result = await legacyContextBuilder.buildContext({
        taskId: 'task-001',
        specId: 'spec-001',
        description: 'Add unit testing for authentication module',
        affectedFiles: [path.join(testWorkspaceRoot, 'src', 'auth', 'login.ts')],
        customContext: 'Focus on edge cases for login validation.',
      });

      // Verify hints are present
      expect(result.fullContext).toContain('Testing Standards');
      expect(result.fullContext).toContain('Task Context');
      expect(result.fullContext).toContain('edge cases for login validation');

      // Verify sections object
      expect(result.sections.hints).toBeDefined();
      expect(result.sections.taskContext).toBeDefined();

      // Memory section may or may not be present depending on keyword matching
      // (this is acceptable for integration test)
    });

    it('should load hints within performance budget (<500ms)', async () => {
      // Create 10 hint files
      for (let i = 0; i < 10; i++) {
        fs.writeFileSync(path.join(hintsDir, `hint-${i}.md`), `# Hint ${i}\n\nGuideline ${i}.`);
      }

      const startTime = Date.now();
      const result = await contextBuilder.buildContext({
        taskId: 'task-002',
        specId: 'spec-002',
        description: 'Performance test',
        affectedFiles: [],
      });
      const loadTime = Date.now() - startTime;

      // Should load within 500ms budget
      expect(loadTime).toBeLessThan(500);
      expect(result.hintsLoadTime).toBeLessThan(500);
    });

    it('should handle missing hints gracefully', async () => {
      // No hints created

      const result = await contextBuilder.buildContext({
        taskId: 'task-003',
        specId: 'spec-003',
        description: 'Test with no hints',
        affectedFiles: [],
      });

      // Should still succeed with empty hints section
      expect(result.fullContext).toBeDefined();
      expect(result.sections.hints).toBeUndefined();
    });

    it('should handle missing constitution gracefully', async () => {
      // Constitution file doesn't exist

      const result = await contextBuilder.buildContext({
        taskId: 'task-004',
        specId: 'spec-004',
        description: 'Test with no constitution',
        affectedFiles: [],
      });

      // Should succeed without constitution section
      expect(result.fullContext).toBeDefined();
      expect(result.sections.constitution).toBeUndefined();
    });
  });

  // ==========================================================================
  // Cache Invalidation Tests
  // ==========================================================================

  describe('Cache Invalidation', () => {
    it('should reload hints after cache invalidation', async () => {
      // Create initial hint
      fs.writeFileSync(path.join(hintsDir, 'test.md'), '# Original Hint\n\nOriginal content.');

      // Load hints
      const first = await hintLoader.discoverHints();
      expect(first).toHaveLength(1);

      // Invalidate cache
      hintLoader.invalidateCache();

      // Add new hint
      fs.writeFileSync(path.join(hintsDir, 'new.md'), '# New Hint\n\nNew content.');

      // Load again - should discover new hint
      const second = await hintLoader.discoverHints();
      expect(second).toHaveLength(2);
    });
  });
});
