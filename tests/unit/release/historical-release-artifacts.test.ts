import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, '../../..');

describe('historical public release artifact integrity', () => {
  let fixtureRoot: string;
  const releaseRoot = path.join('docs-site', 'static', 'releases');
  const legacyVsix = path.join(releaseRoot, 'eai-gofer-0.9.0.vsix');
  const oldVsix = path.join(releaseRoot, 'eai-gofer-1.0.0.vsix');
  const oldPlugin = path.join(releaseRoot, 'eai-gofer-agent-plugin-1.0.0.zip');

  beforeEach(async () => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-release-history-'));
    fs.mkdirSync(path.join(fixtureRoot, releaseRoot), { recursive: true });
    await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: fixtureRoot });
    await execFileAsync('git', ['config', 'user.email', 'release@example.invalid'], {
      cwd: fixtureRoot,
    });
    await execFileAsync('git', ['config', 'user.name', 'Release Test'], { cwd: fixtureRoot });
    fs.writeFileSync(path.join(fixtureRoot, legacyVsix), 'legacy retention convention');
    await execFileAsync('git', ['add', '.'], { cwd: fixtureRoot });
    await execFileAsync('git', ['commit', '-m', 'release 0.9.0'], { cwd: fixtureRoot });
    await execFileAsync('git', ['tag', 'v0.9.0'], { cwd: fixtureRoot });

    fs.rmSync(path.join(fixtureRoot, legacyVsix));
    fs.writeFileSync(path.join(fixtureRoot, oldVsix), 'immutable vsix bytes');
    fs.writeFileSync(path.join(fixtureRoot, oldPlugin), 'immutable plugin bytes');
    fs.writeFileSync(path.join(fixtureRoot, releaseRoot, 'eai-gofer-latest.vsix'), 'old alias');
    fs.writeFileSync(
      path.join(fixtureRoot, releaseRoot, 'eai-gofer-agent-plugin-latest.zip'),
      'old alias'
    );
    await execFileAsync('git', ['add', '--all'], { cwd: fixtureRoot });
    await execFileAsync('git', ['commit', '-m', 'release 1.0.0'], { cwd: fixtureRoot });
    await execFileAsync('git', ['tag', 'v1.0.0'], { cwd: fixtureRoot });
  });

  afterEach(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  async function verify() {
    return execFileAsync(
      'node',
      [
        'scripts/verify-historical-release-artifacts.mjs',
        '--root',
        fixtureRoot,
        '--version',
        '1.1.0',
        '--base',
        'v1.0.0',
      ],
      { cwd: repoRoot }
    );
  }

  it('allows only new target-version artifacts while preserving all older bytes', async () => {
    fs.writeFileSync(path.join(fixtureRoot, releaseRoot, 'eai-gofer-1.1.0.vsix'), 'new vsix');
    fs.writeFileSync(
      path.join(fixtureRoot, releaseRoot, 'eai-gofer-agent-plugin-1.1.0.zip'),
      'new plugin'
    );

    await expect(verify()).resolves.toMatchObject({
      stdout: expect.stringContaining('Historical release artifacts are immutable'),
    });
  });

  it('allows mutable latest aliases to advance', async () => {
    fs.writeFileSync(path.join(fixtureRoot, releaseRoot, 'eai-gofer-latest.vsix'), 'new alias');
    fs.writeFileSync(
      path.join(fixtureRoot, releaseRoot, 'eai-gofer-agent-plugin-latest.zip'),
      'new alias'
    );

    await expect(verify()).resolves.toMatchObject({
      stdout: expect.stringContaining('Historical release artifacts are immutable'),
    });
  });

  it('uses an existing target tag as the exact retry baseline', async () => {
    await expect(
      execFileAsync(
        'node',
        [
          'scripts/verify-historical-release-artifacts.mjs',
          '--root',
          fixtureRoot,
          '--version',
          '1.0.0',
        ],
        { cwd: repoRoot }
      )
    ).resolves.toMatchObject({
      stdout: expect.stringContaining('immutable relative to v1.0.0'),
    });
  });

  it('uses the strict prior tag for first publication even when the target tag exists', async () => {
    fs.writeFileSync(path.join(fixtureRoot, oldVsix), 'mutated before first publication');
    fs.writeFileSync(path.join(fixtureRoot, releaseRoot, 'eai-gofer-1.1.0.vsix'), 'new vsix');
    await execFileAsync('git', ['add', '--all'], { cwd: fixtureRoot });
    await execFileAsync('git', ['commit', '-m', 'candidate 1.1.0'], { cwd: fixtureRoot });
    await execFileAsync('git', ['tag', 'v1.1.0'], { cwd: fixtureRoot });

    await expect(
      execFileAsync(
        'node',
        [
          'scripts/verify-historical-release-artifacts.mjs',
          '--root',
          fixtureRoot,
          '--version',
          '1.1.0',
          '--strict-prior',
        ],
        { cwd: repoRoot }
      )
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(`Historical release artifact was modified: ${oldVsix}`),
    });
  });

  it('rejects modifying an older versioned artifact', async () => {
    fs.writeFileSync(path.join(fixtureRoot, oldVsix), 'mutated historical bytes');

    await expect(verify()).rejects.toMatchObject({
      stderr: expect.stringContaining(`Historical release artifact was modified: ${oldVsix}`),
    });
  });

  it('rejects deleting an older versioned artifact', async () => {
    fs.rmSync(path.join(fixtureRoot, oldPlugin));

    await expect(verify()).rejects.toMatchObject({
      stderr: expect.stringContaining(`Historical release artifact was deleted: ${oldPlugin}`),
    });
  });
});
