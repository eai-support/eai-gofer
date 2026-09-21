import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

import { runTests } from '@vscode/test-electron';

export async function main(): Promise<void> {
  let testRoot: string | undefined;
  try {
    // macOS's normal temp path can exceed the IPC socket length limit.
    testRoot = await fs.mkdtemp(
      path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'gofer-test-')
    );
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Download VS Code, unzip it and run the integration test
    await runTests({
      version: process.env.VSCODE_TEST_VERSION || '1.127.0',
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        `--user-data-dir=${path.join(testRoot, 'user')}`,
        `--extensions-dir=${path.join(testRoot, 'extensions')}`,
        '--skip-welcome',
        '--skip-release-notes',
      ],
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exitCode = 1;
  } finally {
    // runTests settles after Electron exits; never remove an active test profile.
    if (testRoot) {
      try {
        await fs.rm(testRoot, { recursive: true, force: true });
      } catch (err) {
        console.error('Failed to clean up the isolated test directories', err);
        process.exitCode = 1;
      }
    }
  }
}

if (require.main === module) {
  void main();
}
