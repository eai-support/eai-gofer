import { getEventListeners } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runOwnedCommand } from '../../../language-server/src/mcp/ownedCommand.js';

describe('owned command startup failures', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'gofer-spawn-failure-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  for (const scenario of ['missing executable', 'missing working directory']) {
    it(`rejects ${scenario} promptly and removes its abort listener`, async () => {
      const controller = new AbortController();
      const command = scenario === 'missing executable' ? path.join(root, 'missing-command') : process.execPath;
      const cwd = scenario === 'missing executable' ? root : path.join(root, 'missing-directory');
      // The test deadline is shorter than the command deadline: a hanging promise
      // cannot pass by waiting for command timeout or test cleanup.
      await expect(runOwnedCommand(command, ['-e', ''], cwd, 30000, controller.signal))
        .rejects.toMatchObject({ code: 'ENOENT', stdout: '', stderr: '' });
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    }, 3000);
  }

  it('retains output on nonzero exit and removes its abort listener', async () => {
    const controller = new AbortController();
    await expect(runOwnedCommand(process.execPath, ['-e',
      'process.stdout.write("result"); process.stderr.write("failure"); process.exitCode = 7;'],
    root, 30000, controller.signal)).rejects.toMatchObject({ code: 7, stdout: 'result', stderr: 'failure' });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  }, 3000);
});
