import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, '../../..');
const verifier = path.join(repoRoot, 'scripts', 'verify-marketplace-vsix.sh');

describe('Marketplace VSIX byte verification', () => {
  let root: string;
  let expectedVsix: string;
  let alternateVsix: string;
  let fakeBin: string;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-vsix-'));
    fakeBin = path.join(root, 'bin');
    fs.mkdirSync(fakeBin);
    const fixture = path.join(root, 'fixture', 'extension');
    fs.mkdirSync(fixture, { recursive: true });
    fs.writeFileSync(path.join(fixture, 'package.json'), '{"name":"gofer","version":"3.4.0"}');
    expectedVsix = path.join(root, 'expected.vsix');
    await execFileAsync('zip', ['-qr', expectedVsix, '.'], {
      cwd: path.join(root, 'fixture'),
    });
    fs.writeFileSync(path.join(fixture, 'extra.txt'), 'different valid archive bytes');
    alternateVsix = path.join(root, 'alternate.vsix');
    await execFileAsync('zip', ['-qr', alternateVsix, '.'], {
      cwd: path.join(root, 'fixture'),
    });

    const fakeCurl = path.join(fakeBin, 'curl');
    fs.writeFileSync(
      fakeCurl,
      `#!/usr/bin/env bash
set -eu
output=''
compressed=false
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output' ]; then
    output="$2"
    shift 2
  elif [ "$1" = '--compressed' ]; then
    compressed=true
    shift
  else
    shift
  fi
done
[ "$compressed" = true ]
cp "$FAKE_MARKETPLACE_VSIX" "$output"
`
    );
    fs.chmodSync(fakeCurl, 0o755);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function verify(downloadedVsix: string) {
    return execFileAsync('bash', [verifier, '3.4.0', expectedVsix], {
      env: {
        ...process.env,
        FAKE_MARKETPLACE_VSIX: downloadedVsix,
        MARKETPLACE_VSIX_ATTEMPTS: '1',
        PATH: `${fakeBin}:${process.env.PATH}`,
      },
    });
  }

  it('accepts only exact Marketplace package bytes', async () => {
    const { stdout } = await verify(expectedVsix);
    expect(stdout).toContain('byte-identical to the committed VSIX');
  });

  it('rejects a valid same-version archive with different bytes', async () => {
    await expect(verify(alternateVsix)).rejects.toMatchObject({
      stderr: expect.stringContaining('does not match the committed VSIX bytes'),
    });
  });
});
