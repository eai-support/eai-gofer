import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  captureHeldOutResultSnapshot,
  inspectHeldOutResultSnapshot,
  loadPinnedHeldOutSnapshot,
} from '../../../.specify/scripts/node/gofer-heldout-snapshot.mjs';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gofer-snapshot-test-'));
  roots.push(root);
  const workspaceRoot = path.join(root, 'workspace');
  const trustRoot = path.join(root, 'trust');
  const corpusRoot = path.join(trustRoot, 'corpora', 'fixture');
  const receipts = path.join(corpusRoot, 'receipts');
  await mkdir(workspaceRoot, { mode: 0o700 });
  await mkdir(receipts, { mode: 0o700, recursive: true });
  await chmod(trustRoot, 0o700);
  await chmod(path.join(trustRoot, 'corpora'), 0o700);
  await chmod(corpusRoot, 0o700);
  const runs = [];
  const worktrees = [];
  for (const caseId of ['bug', 'refactor', 'contract', 'security']) {
    for (const run of [1, 2, 3]) {
      const label = `${caseId}-${run}`;
      const worktree = await mkdtemp(path.join(os.tmpdir(), `gofer-snapshot-${label}-`));
      roots.push(worktree);
      worktrees.push(worktree);
      await writeFile(path.join(worktree, 'answer.txt'), `answer ${label}`, { mode: 0o644 });
      if (label === 'bug-1') {
        await mkdir(path.join(worktree, 'nested'), { mode: 0o755 });
        await writeFile(path.join(worktree, 'nested', 'output.txt'), '', { mode: 0o644 });
      }
      await writeFile(
        path.join(receipts, `${label}.execution.json`),
        JSON.stringify({ worktree }),
        { mode: 0o600 }
      );
      await writeFile(
        path.join(receipts, `${label}.verification.json`),
        JSON.stringify({ passed: true }),
        { mode: 0o600 }
      );
      runs.push({ caseId, run });
    }
  }
  await writeFile(
    path.join(receipts, 'benchmark-report.json'),
    JSON.stringify({ corpusHash: 'a'.repeat(64), report: { repetitions: 3, runs } }),
    { mode: 0o600 }
  );
  return { workspaceRoot, trustRoot, corpusRoot, receipts, worktrees };
}

describe('held-out result snapshot custody', () => {
  it('copies each run into an owner-only content-addressed store without granting authority', async () => {
    const f = await fixture();
    const result = await captureHeldOutResultSnapshot(f);
    expect(result.authority).toBe('diagnostic-only');
    expect(result.fileCount).toBe(38);
    const folder = path.join(f.trustRoot, 'results', result.snapshotId);
    const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
    expect(manifest.entries).toHaveLength(38);
    expect(
      manifest.entries.some(
        (entry: { name: string }) => entry.name === 'worktrees/bug-1/answer.txt'
      )
    ).toBe(true);
    expect((await lstat(folder)).mode & 0o077).toBe(0);
    expect((await lstat(path.join(folder, 'manifest.json'))).mode & 0o077).toBe(0);
    expect(
      await inspectHeldOutResultSnapshot({
        trustRoot: f.trustRoot,
        workspaceRoot: f.workspaceRoot,
        snapshotId: result.snapshotId,
      })
    ).toEqual(result);
    await expect(captureHeldOutResultSnapshot(f)).rejects.toThrow('HELDOUT_SNAPSHOT_REQUIRED');
  });

  it('rejects a changed protected object', async () => {
    const f = await fixture();
    const result = await captureHeldOutResultSnapshot(f);
    const folder = path.join(f.trustRoot, 'results', result.snapshotId);
    const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
    const answer = manifest.entries.find(
      (entry: { name: string }) => entry.name === 'worktrees/bug-1/answer.txt'
    );
    await writeFile(path.join(folder, 'objects', answer.sha256), 'changed');
    await expect(
      inspectHeldOutResultSnapshot({
        trustRoot: f.trustRoot,
        workspaceRoot: f.workspaceRoot,
        snapshotId: result.snapshotId,
      })
    ).rejects.toThrow('HELDOUT_SNAPSHOT_REQUIRED');
  });

  it('rejects a linked result file and leaves no published snapshot', async () => {
    const f = await fixture();
    const answer = path.join(f.worktrees[0], 'answer.txt');
    await rm(answer);
    await symlink(path.join(f.worktrees[1], 'answer.txt'), answer);
    await expect(captureHeldOutResultSnapshot(f)).rejects.toThrow('HELDOUT_SNAPSHOT_REQUIRED');
    const results = path.join(f.trustRoot, 'results');
    expect((await lstat(results)).isDirectory()).toBe(true);
    expect(await readFile(path.join(f.receipts, 'benchmark-report.json'), 'utf8')).toContain(
      'corpusHash'
    );
  });

  it('rejects results that do not match the pinned corpus hash', async () => {
    const f = await fixture();
    await expect(
      captureHeldOutResultSnapshot({ ...f, expectedCorpusHash: 'b'.repeat(64) })
    ).rejects.toThrow('HELDOUT_SNAPSHOT_REQUIRED');
    await expect(
      captureHeldOutResultSnapshot({ ...f, expectedCaseIds: ['bug', 'refactor'] })
    ).rejects.toThrow('HELDOUT_SNAPSHOT_REQUIRED');
  });

  it('does not let the production command select a corpus or trust root', async () => {
    const command = path.resolve('.specify/scripts/node/gofer-heldout-snapshot.mjs');
    const result = spawnSync(
      process.execPath,
      [command, '--workspace-root', process.cwd(), '--trust-root', os.tmpdir()],
      { encoding: 'utf8' }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('HELDOUT_SNAPSHOT_REQUIRED');
  });

  it('loads only an owner-only pinned result matching the corpus', async () => {
    const f = await fixture();
    const snapshot = await captureHeldOutResultSnapshot(f);
    const config = path.join(f.trustRoot, 'heldout-results.json');
    await writeFile(
      config,
      JSON.stringify({
        schemaVersion: 1,
        snapshotId: snapshot.snapshotId,
        corpusHash: snapshot.corpusHash,
      }),
      { mode: 0o600 }
    );
    await expect(
      loadPinnedHeldOutSnapshot({
        trustRoot: f.trustRoot,
        workspaceRoot: f.workspaceRoot,
        corpusHash: snapshot.corpusHash,
      })
    ).resolves.toMatchObject({ snapshotId: snapshot.snapshotId });
    await chmod(config, 0o644);
    await expect(
      loadPinnedHeldOutSnapshot({
        trustRoot: f.trustRoot,
        workspaceRoot: f.workspaceRoot,
        corpusHash: snapshot.corpusHash,
      })
    ).rejects.toThrow('HELDOUT_SNAPSHOT_REQUIRED');
  });
});
