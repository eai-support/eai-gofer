import * as fs from 'fs/promises';
import * as path from 'path';

export class TestHarnessGenerator {
  constructor(private workspaceRoot: string) {}

  async ensureTestHarness(specId: string, taskId: string, description: string): Promise<string> {
    // Sanitized name
    const sanitizedTask = taskId.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const testFileName = `${sanitizedTask}.test.ts`;
    const testDir = path.join(this.workspaceRoot, 'tests', 'generated', specId);
    const testPath = path.join(testDir, testFileName);

    try {
      await fs.access(testPath);
      return testPath; // Exists
    } catch {
      // Does not exist, create it
    }

    // Keep untrusted metadata inside the comment, including embedded comment terminators.
    const metadata = JSON.stringify({ taskId, description, specId }).replace(/\//g, '\\u002f');
    const suiteTitle = JSON.stringify(`${specId} - ${taskId}`);
    const testTitle = JSON.stringify(`should fulfill acceptance criteria for ${taskId}`);
    const harnessCode = `
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * ${metadata}
 * 
 * REAL-WORLD TEST HARNESS (NO MOCKING ALLOWED)
 */
describe(${suiteTitle}, () => {
    let tempDir: string;

    beforeEach(async () => {
        // 1. Create a real temporary workspace
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-test-${sanitizedTask}-'));
        
        // 2. Setup standard environment (e.g. .specify folder)
        await fs.mkdir(path.join(tempDir, '.specify'), { recursive: true });
    });

    afterEach(async () => {
        // Cleanup real files
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it(${testTitle}, async () => {
        // TODO: Implement Logic Here
        // const result = await runLogic(tempDir);
        // expect(result).toBe(true);
        expect(true).toBe(true); // Placeholder
    });
});
`;

    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(testPath, harnessCode);
    return testPath;
  }
}
