import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

import { runTests } from '@vscode/test-electron';

async function main() {
  // macOS IPC sockets fail when a worktree makes the default profile path too long.
  const profile = await fs.mkdtemp(
    path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'gofer-test-')
  );
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Download VS Code, unzip it and run the integration test
    await runTests({
      version: process.env.VSCODE_TEST_VERSION || '1.127.0',
      vscodeExecutablePath: process.env.VSCODE_TEST_EXECUTABLE,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [`--user-data-dir=${profile}`, '--skip-welcome', '--skip-release-notes'],
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exitCode = 1;
  } finally {
    await fs.rm(profile, { recursive: true, force: true });
  }
}

main();
