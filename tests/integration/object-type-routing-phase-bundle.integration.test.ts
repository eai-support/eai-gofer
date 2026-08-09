import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryRoots: string[] = [];
const tool = path.resolve('.specify/scripts/node/object-type-routing-phase-bundle.mjs');
const CALLER_GIT_CONTEXT_KEYS = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_WORK_TREE',
];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

function isolatedGitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of CALLER_GIT_CONTEXT_KEYS) delete environment[key];
  return environment;
}

function git(repository: string, args: string[]): string {
  return execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    env: isolatedGitEnvironment(),
  }).trim();
}

async function createFixtureRepository(): Promise<{ repository: string; baseline: string }> {
  const repository = await mkdtemp(path.join(tmpdir(), 'object-type-phase-bundle-'));
  temporaryRoots.push(repository);
  git(repository, ['init', '-q']);
  git(repository, ['config', 'user.email', 'fixture@example.com']);
  git(repository, ['config', 'user.name', 'Fixture']);
  await mkdir(path.join(repository, 'src'), { recursive: true });
  await writeFile(path.join(repository, 'src', 'modified.txt'), 'before\n');
  await writeFile(path.join(repository, 'src', 'deleted.txt'), 'delete me\n');
  await writeFile(path.join(repository, 'src', 'mode.sh'), '#!/bin/sh\nexit 0\n');
  git(repository, ['add', '.']);
  git(repository, ['commit', '-qm', 'baseline']);
  return { repository, baseline: git(repository, ['rev-parse', 'HEAD']) };
}

function run(args: string[]) {
  return spawnSync(process.execPath, [tool, ...args], {
    encoding: 'utf8',
    env: isolatedGitEnvironment(),
  });
}

describe('Object Type routing phase bundle', () => {
  it('captures cumulative modified, untracked, deleted, binary, symlink, and mode changes deterministically', async () => {
    const { repository, baseline } = await createFixtureRepository();
    const output = path.join(repository, 'bundle.json');
    await writeFile(path.join(repository, 'src', 'modified.txt'), 'after\n');
    await rm(path.join(repository, 'src', 'deleted.txt'));
    await chmod(path.join(repository, 'src', 'mode.sh'), 0o755);
    await writeFile(path.join(repository, 'src', 'binary.bin'), Buffer.from([0, 255, 1, 2]));
    await writeFile(path.join(repository, 'src', 'untracked.txt'), 'new\n');
    await symlink('modified.txt', path.join(repository, 'src', 'link'));
    const statusBefore = git(repository, ['status', '--porcelain=v1']);
    const refsBefore = git(repository, ['show-ref']);

    const first = run([
      'create',
      '--repository',
      repository,
      '--phase',
      'P0',
      '--baseline',
      baseline,
      '--output',
      output,
      '--json',
    ]);
    expect(first.status).toBe(0);
    const bundle = JSON.parse(await readFile(output, 'utf8'));
    const paths = bundle.entries.map((entry: { path: string }) => entry.path);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toEqual([
      'src/binary.bin',
      'src/deleted.txt',
      'src/link',
      'src/mode.sh',
      'src/modified.txt',
      'src/untracked.txt',
    ]);
    expect(bundle).toMatchObject({
      schemaVersion: 'eai.object-type-routing.phase-bundle/v1',
      phase: 'P0',
      baselineSha: baseline,
      semantics: 'cumulative_from_baseline',
    });
    expect(
      bundle.entries.find((entry: { path: string }) => entry.path === 'src/deleted.txt')
    ).toMatchObject({
      deleted: true,
      kind: 'deletion',
    });
    expect(
      bundle.entries.find((entry: { path: string }) => entry.path === 'src/mode.sh').mode
    ).toBe('100755');

    const secondOutput = path.join(repository, 'bundle-second.json');
    const second = run([
      'create',
      '--repository',
      repository,
      '--phase',
      'P0',
      '--baseline',
      baseline,
      '--output',
      secondOutput,
      '--exclude',
      'bundle.json',
      '--exclude',
      'bundle-second.json',
      '--json',
    ]);
    expect(second.status).toBe(0);
    const secondBundle = JSON.parse(await readFile(secondOutput, 'utf8'));
    expect(secondBundle.rootDigest).toBe(bundle.rootDigest);
    expect(git(repository, ['status', '--porcelain=v1'])).toContain(statusBefore.split('\n')[0]);
    expect(git(repository, ['show-ref'])).toBe(refsBefore);
  });

  it('verifies digests and reconstructs without mutating the source index or refs', async () => {
    const { repository, baseline } = await createFixtureRepository();
    const output = path.join(repository, 'bundle.json');
    await writeFile(path.join(repository, 'src', 'modified.txt'), 'phase one\n');
    const created = run([
      'create',
      '--repository',
      repository,
      '--phase',
      'A0',
      '--baseline',
      baseline,
      '--output',
      output,
      '--exclude',
      'bundle.json',
      '--json',
    ]);
    expect(created.status).toBe(0);
    const statusBefore = git(repository, ['status', '--porcelain=v1']);
    const refsBefore = git(repository, ['show-ref']);

    const verified = run(['verify', '--bundle', output, '--reconstruct', '--json']);
    expect(verified.status).toBe(0);
    expect(JSON.parse(verified.stdout)).toMatchObject({ valid: true, reconstructed: true });
    expect(git(repository, ['status', '--porcelain=v1'])).toBe(statusBefore);
    expect(git(repository, ['show-ref'])).toBe(refsBefore);

    const bundle = JSON.parse(await readFile(output, 'utf8'));
    bundle.entries[0].contentBase64 = Buffer.from('tampered').toString('base64');
    await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`);
    const invalid = run(['verify', '--bundle', output, '--json']);
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout)).toMatchObject({ valid: false });
  });
});
