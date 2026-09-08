import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceAccess } from '../../../language-server/src/mcp/workspaceAccess.js';

describe('Bounded workspace artifact access', () => {
  let root: string;
  let access: WorkspaceAccess;
  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gofer-access-')));
    access = await WorkspaceAccess.create(root);
    await fs.mkdir(path.join(root, 'docs'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each([
    '.specify/specs/001-fixture/spec.md',
    '.specify/commands/0_gofer_start.md',
    'docs/example.md',
  ])('reads nested permitted artifact %s', async (relative) => {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'fixture');
    expect(await access.readText(target)).toEqual({
      content: 'fixture',
      bytes: 7,
      truncated: false,
    });
  });

  it.each([
    '.specify/memory/observation-cache/index.json',
    'docs/credentials.json',
    'docs/.env',
    'docs/id_rsa',
  ])('rejects private or non-artifact file %s', async (relative) => {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'PRIVATE_SENTINEL');
    await expect(access.readText(target)).rejects.toThrow('Access denied');
  });

  it('rejects hard links, oversized complete reads, and oversized cumulative reads', async () => {
    const target = path.join(root, 'docs', 'example.md');
    await fs.writeFile(target, 'x'.repeat(256 * 1024));
    for (let index = 0; index < 7; index++) await access.readText(target);
    await expect(access.readText(target)).rejects.toThrow('budget');
    access.resetBudget();
    await fs.appendFile(target, 'x');
    await expect(access.readText(target)).rejects.toThrow('bounded read limit');
    await fs.link(target, path.join(root, 'docs', 'linked.md'));
    await expect(access.readText(target)).rejects.toThrow('regular, unlinked');
  });

  it('limits directory enumeration and does not follow directory links', async () => {
    const directory = path.join(root, 'docs');
    await Promise.all(
      Array.from({ length: 513 }, (_, index) =>
        fs.writeFile(path.join(directory, `${index}.md`), '')
      )
    );
    await expect(access.readDirectory(directory)).rejects.toThrow('directory budget');
    access.resetBudget();
    await fs.symlink(
      directory,
      path.join(root, 'docs', 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    await expect(access.readText(path.join(directory, 'linked', '0.md'))).rejects.toThrow(
      'symbolic links'
    );
  });

  it('does not disclose a partial UTF-8 character at the byte boundary', async () => {
    const target = path.join(root, 'docs', 'utf8.md');
    await fs.writeFile(target, '\u00e9\u00e9');
    expect(await access.readText(target, 3, true)).toEqual({
      content: '\u00e9',
      bytes: 4,
      truncated: true,
    });
  });

  it('rejects replacement roots rather than falling back to cwd', async () => {
    await fs.rm(root, { recursive: true });
    await fs.mkdir(root);
    // Replacement can reuse an inode on some filesystems; a symlink is an unambiguous replacement.
    await fs.rm(root, { recursive: true });
    await fs.symlink(os.tmpdir(), root, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(access.assertRoot()).rejects.toThrow('Workspace root changed');
  });
});
