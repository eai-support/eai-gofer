import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryWorkspaces: string[] = [];
const validator = path.resolve('.specify/scripts/node/validate-v4-resource-contract.mjs');

afterEach(async () => {
  await Promise.all(
    temporaryWorkspaces
      .splice(0)
      .map((workspace) => rm(workspace, { recursive: true, force: true }))
  );
});

async function workspaceWith(source: string): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), 'gofer-v4-integration-'));
  temporaryWorkspaces.push(workspace);
  await mkdir(path.join(workspace, 'src'), { recursive: true });
  await mkdir(path.join(workspace, 'tests'), { recursive: true });
  await writeFile(path.join(workspace, 'src', 'client.ts'), source);
  await writeFile(
    path.join(workspace, 'tests', 'ignored.test.ts'),
    `fetch('/v4/data/resources/tenant/project/id', { method: 'PATCH' });`
  );
  return workspace;
}

function runValidator(workspace: string) {
  return spawnSync(process.execPath, [validator, '--workspace', workspace, '--json'], {
    encoding: 'utf8',
  });
}

describe('PublicAPI v4 resource validator process integration', () => {
  it('passes a representative workspace using a member platformFetch wrapper', async () => {
    const workspace = await workspaceWith(`
      client.platformFetch('/v4/data/resources/tenant/project/id', {
        method: 'PUT',
        body: JSON.stringify({ data, version }),
      });
    `);

    const result = runValidator(workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      valid: true,
      filesScanned: 1,
      violations: [],
    });
  });

  it('fails a representative workspace with machine-readable violation evidence', async () => {
    const workspace = await workspaceWith(`
      client.platformFetch('/v4/data/resources/tenant/project/id', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    `);

    const result = runValidator(workspace);
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(output.valid).toBe(false);
    expect(output.filesScanned).toBe(1);
    expect(output.violations).toEqual([
      expect.objectContaining({
        file: path.join('src', 'client.ts'),
        ruleId: 'EAI_V4_RESOURCE_PATCH_FORBIDDEN',
      }),
    ]);
  });
});
