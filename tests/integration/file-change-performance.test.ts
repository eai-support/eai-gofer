/**
 * Performance test for Chokidar file change detection
 * Task: T016a
 *
 * Tests verify:
 * - File change detection <300ms (SC-006)
 * - Debouncing works correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import chokidar from 'chokidar';

// File watching is unreliable in CI environments (containers, VMs)
const isCI = !!process.env.CI;

describe.skipIf(isCI)('File Change Performance (SC-006)', () => {
  let testDir: string;
  let watcher: chokidar.FSWatcher | null = null;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-perf-'));
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should detect file changes within 300ms', async () => {
    const testFile = path.join(testDir, 'test.txt');
    let changeDetected = false;
    let detectionTime = 0;

    // Create watcher
    watcher = chokidar.watch(testFile, {
      persistent: true,
      ignoreInitial: true,
    });

    // Setup change handler
    const changePromise = new Promise<number>((resolve) => {
      watcher!.on('change', () => {
        changeDetected = true;
        detectionTime = Date.now();
        resolve(detectionTime);
      });
    });

    // Create initial file
    await fs.writeFile(testFile, 'initial content');
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Modify file and measure time
    const writeTime = Date.now();
    await fs.writeFile(testFile, 'updated content');

    // Wait for change detection
    await changePromise;

    const duration = detectionTime - writeTime;

    expect(changeDetected).toBe(true);
    expect(duration).toBeLessThan(300); // SC-006 requirement
  });

  it('should handle rapid file changes with debouncing', async () => {
    const testFile = path.join(testDir, 'test.txt');
    let changeCount = 0;

    // Create watcher with 300ms debounce
    watcher = chokidar.watch(testFile, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    watcher.on('change', () => {
      changeCount++;
    });

    // Create initial file
    await fs.writeFile(testFile, 'initial');
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Make rapid changes
    await fs.writeFile(testFile, 'change1');
    await fs.writeFile(testFile, 'change2');
    await fs.writeFile(testFile, 'change3');

    // Wait for debouncing
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Should have debounced to 1 or 2 events, not 3
    expect(changeCount).toBeLessThan(3);
  });
});
