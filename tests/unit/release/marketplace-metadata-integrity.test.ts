import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const verifier = path.resolve(__dirname, '../../../scripts/verify-marketplace-metadata.mjs');

describe('Marketplace metadata integrity', () => {
  let root: string;
  let metadataPath: string;
  let vsixPath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-metadata-'));
    metadataPath = path.join(root, 'metadata.json');
    vsixPath = path.join(root, 'expected.vsix');
    fs.writeFileSync(vsixPath, 'committed bytes');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeMetadata(hash?: string) {
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({
        versions: [
          {
            version: '3.4.0',
            properties:
              hash === undefined
                ? []
                : [{ key: 'Microsoft.VisualStudio.Services.VsixSha256', value: hash }],
          },
        ],
      })
    );
  }

  it('accepts the exact target version hash', async () => {
    writeMetadata(createHash('sha256').update(fs.readFileSync(vsixPath)).digest('hex'));
    const { stdout } = await execFileAsync('node', [verifier, metadataPath, '3.4.0', vsixPath]);
    expect(stdout).toContain('SHA-256 matches the committed VSIX');
  });

  it('rejects a missing target-version hash', async () => {
    writeMetadata();
    await expect(
      execFileAsync('node', [verifier, metadataPath, '3.4.0', vsixPath])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('is missing one valid VSIX SHA-256 property'),
    });
  });

  it('rejects a different target-version hash', async () => {
    writeMetadata('0'.repeat(64));
    await expect(
      execFileAsync('node', [verifier, metadataPath, '3.4.0', vsixPath])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('does not match committed'),
    });
  });
});
