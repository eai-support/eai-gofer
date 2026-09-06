import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.resolve('.specify/scripts/node/gofer-stage-execute.mjs');
let directory: string;
let root: string;
const request = {
  host: 'codex',
  surface: 'cli',
  stage: '6_gofer_validate',
  workType: 'non-app',
  trigger: 'ordinary',
  task: 'Do not run models.',
};
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'gofer-input-boundary-'));
  root = path.join(directory, 'workspace');
  await mkdir(root);
  await writeFile(path.join(directory, 'outside.json'), JSON.stringify(request));
  await writeFile(path.join(root, 'request.json'), JSON.stringify(request));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
function run(input: string) {
  return spawnSync(
    process.execPath,
    [script, '--input', input, '--execute', '--output', '.specify/specs/test/result.json'],
    { cwd: root, encoding: 'utf8' }
  );
}
test.each(['../outside.json', './request.json', 'folder/../request.json', 'C:\\outside.json'])(
  'rejects non-contained input %s before models or evidence',
  async (input) => {
    expect(run(input).status).toBe(1);
    await expect(readFile(path.join(root, '.specify/specs/test/result.json'))).rejects.toThrow();
  }
);
test('rejects absolute input even when the file exists', () => {
  expect(run(path.join(directory, 'outside.json')).status).toBe(1);
});
test('rejects an input reached through a symlinked parent', async () => {
  await symlink(
    directory,
    path.join(root, 'link'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  expect(run('link/outside.json').status).toBe(1);
});
test('accepts the contained ordinary request without inference', async () => {
  expect(run('request.json').status).toBe(0);
  const result = JSON.parse(
    await readFile(path.join(root, '.specify/specs/test/result.json'), 'utf8')
  );
  expect(result.reason).toBe('ordinary_request');
  expect(result.attempts).toEqual([]);
});
