import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tool = path.resolve('.specify/scripts/node/validate-object-type-routing-workspace.mjs');
const workspace = path.resolve('../..');
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

function runTool(...arguments_: string[]) {
  return spawnSync(process.execPath, [tool, ...arguments_], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

describe('Object Type routing workspace reducer', () => {
  it('reduces the real local workspace deterministically without writing by default', async () => {
    const before = await readdir(path.resolve('.specify/scripts/node'));
    const first = runTool('--workspace', workspace, '--json');
    const second = runTool('--workspace', workspace, '--json');

    expect([0, 2]).toContain(first.status);
    expect(second.status).toBe(first.status);
    expect(first.stderr).toBe('');
    expect(second.stderr).toBe('');
    expect(second.stdout).toBe(first.stdout);

    const report = JSON.parse(first.stdout);
    expect(report).toMatchObject({
      schemaVersion: 'eai.object-type-routing.workspace-compatibility/v1',
      contractVersion: 'eai.object-type-routing/v1',
      authoritativeTransportIdentifier: 'slug',
      compatible: report.blockingFindingCount === 0,
      exitCode: first.status,
    });
    expect(report.adapters.map((adapter: { component: string }) => adapter.component)).toEqual([
      'Configurator',
      'eai-app-template',
      'eai-cli',
      'eai-gofer',
      'PublicAPI',
      'ResourceAPI',
    ]);
    expect(
      report.adapters.every((adapter: { vectors: unknown[] }) => adapter.vectors.length === 11)
    ).toBe(true);
    expect(report.coverageOwnership.map((owner: { component: string }) => owner.component)).toEqual(
      [
        'Configurator',
        'eai-app-template',
        'eai-cli',
        'eai-gofer',
        'PublicAPI',
        'ResourceAPI',
        'tech-docs',
      ]
    );
    expect(await readdir(path.resolve('.specify/scripts/node'))).toEqual(before);
  }, 30_000);

  it('writes only when --output is supplied and makes the file equal stdout JSON', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'object-type-routing-workspace-'));
    temporaryRoots.push(root);
    const output = path.join(root, 'nested', 'compatibility.json');

    const result = runTool('--workspace', workspace, '--output', output, '--json');
    expect([0, 2]).toContain(result.status);
    const fromStdout = JSON.parse(result.stdout);
    const fromFile = JSON.parse(await readFile(output, 'utf8'));
    expect(fromFile).toEqual(fromStdout);
    expect(fromFile.exitCode).toBe(result.status);
    expect((await readdir(path.dirname(output))).sort()).toEqual(['compatibility.json']);
  }, 30_000);

  it('returns exit 4 for malformed arguments without creating output', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'object-type-routing-workspace-'));
    temporaryRoots.push(root);
    const output = path.join(root, 'compatibility.json');

    const result = runTool('--workspace', workspace, '--output', output, '--unknown');

    expect(result.status).toBe(4);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('ARGUMENT_UNSUPPORTED');
    expect(await readdir(root)).toEqual([]);
  });
});
