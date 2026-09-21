import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../../../extension/src/test/runTest.ts', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(platform = 'darwin') {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const temporary = platform === 'win32' ? 'C:\\Temp' : '/ordinary-temp';
  const fs = {
    mkdtemp: vi.fn(async (prefix: string) => `${prefix}ABC123`),
    rm: vi.fn(async () => undefined),
  };
  const runTests = vi.fn(async () => undefined);
  const process = {
    platform,
    env: {} as Record<string, string>,
    exitCode: undefined as number | undefined,
  };
  const exports = {} as { main: () => Promise<void> };
  const require = (name: string) => {
    if (name === 'path') return paths;
    if (name === 'os') return { tmpdir: () => temporary };
    if (name === 'fs/promises') return fs;
    if (name === '@vscode/test-electron') return { runTests };
    throw new Error(`Unexpected dependency: ${name}`);
  };
  runInNewContext(compiled, {
    exports,
    module: { exports },
    require,
    process,
    console: { error: vi.fn() },
    __dirname: paths.join(
      temporary,
      'very-long-worktree-name'.repeat(8),
      'extension',
      'out',
      'test'
    ),
  });
  return { ...fs, runTests, process, main: exports.main, paths, temporary };
}

describe('isolated Electron test launcher', () => {
  it.each(['darwin', 'linux', 'win32'])(
    'isolates user data and extensions on %s',
    async (platform) => {
      const h = harness(platform);
      await h.main();
      const prefix = h.paths.join(platform === 'darwin' ? '/tmp' : h.temporary, 'gofer-test-');
      expect(h.mkdtemp).toHaveBeenCalledExactlyOnceWith(prefix);
      const root = `${prefix}ABC123`;
      expect(h.runTests).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          version: '1.127.0',
          launchArgs: [
            `--user-data-dir=${h.paths.join(root, 'user')}`,
            `--extensions-dir=${h.paths.join(root, 'extensions')}`,
            '--skip-welcome',
            '--skip-release-notes',
          ],
        })
      );
      expect(h.rm).toHaveBeenCalledExactlyOnceWith(root, { recursive: true, force: true });
      expect(h.process.exitCode).toBeUndefined();
      if (platform === 'darwin')
        expect(h.paths.join(root, 'user', '1.12-main.sock').length).toBeLessThan(103);
    }
  );

  it.each(['success', 'failure'])(
    'waits for Electron %s before removing the profile',
    async (outcome) => {
      const h = harness();
      let finish!: () => void;
      const started = new Promise<void>((resolve) => {
        h.runTests.mockImplementation(
          () =>
            new Promise<void>((done, reject) => {
              finish = () =>
                outcome === 'success' ? done() : reject(new Error('Electron failed'));
              resolve();
            })
        );
      });
      const running = h.main();
      await started;
      expect(h.rm).not.toHaveBeenCalled();
      finish();
      await running;
      expect(h.rm).toHaveBeenCalledOnce();
      expect(h.process.exitCode).toBe(outcome === 'success' ? undefined : 1);
    }
  );

  it('reports cleanup failures and keeps an explicit version override', async () => {
    const h = harness();
    h.process.env.VSCODE_TEST_VERSION = '1.136.1';
    h.rm.mockRejectedValue(new Error('busy'));
    await h.main();
    expect(h.runTests).toHaveBeenCalledWith(expect.objectContaining({ version: '1.136.1' }));
    expect(h.process.exitCode).toBe(1);
  });
});
