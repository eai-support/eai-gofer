import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EAI_REFRESH_OVERLAY_MAPPINGS,
  verifyEaiRefreshLayout,
} from '../../../scripts/verify-eai-refresh-layout.mjs';

const repoRoot = path.resolve(__dirname, '../../..');
const workspaces: string[] = [];

async function createGoferReleaseFixture(): Promise<string> {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'gofer-refresh-layout-test-'));
  workspaces.push(fixtureRoot);
  await cp(
    path.join(repoRoot, 'extension', 'resources'),
    path.join(fixtureRoot, 'extension', 'resources'),
    { recursive: true }
  );
  for (const [sourceRelative] of EAI_REFRESH_OVERLAY_MAPPINGS) {
    const source = path.join(repoRoot, sourceRelative);
    const target = path.join(fixtureRoot, sourceRelative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }
  return fixtureRoot;
}

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true }))
  );
});

describe('EAI Gofer refresh layout', () => {
  it('produces every normalized resource directory required by eai update', async () => {
    await expect(verifyEaiRefreshLayout(repoRoot)).resolves.toBeUndefined();
  });

  it('fails when canonical config cannot produce the normalized config directory', async () => {
    const fixtureRoot = await createGoferReleaseFixture();
    await rm(path.join(fixtureRoot, '.specify', 'config'), { recursive: true, force: true });

    await expect(verifyEaiRefreshLayout(fixtureRoot)).rejects.toThrow(
      /missing required directories: config/
    );
  });
});
