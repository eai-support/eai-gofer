import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

describe('native script checkout line endings', () => {
  let root: string;
  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'gofer-mjs-eol-')));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reproduces the CRLF shebang parser failure and loads the LF equivalent', async () => {
    const crlf = '#!/usr/bin/env node\r\nexport const value = 42;\r\n';
    // Node accepts the source; Vite hoists exports ahead of a CRLF shebang.
    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '--check'], {
        input: crlf,
      })
    ).not.toThrow();
    const broken = pathToFileURL(path.join(root, 'crlf.mjs'));
    await writeFile(broken, crlf);
    await expect(import(broken.href)).rejects.toThrow(SyntaxError);
    const normalized = pathToFileURL(path.join(root, 'lf.mjs'));
    await writeFile(normalized, crlf.replace(/\r\n/g, '\n'));
    expect(await import(normalized.href)).toMatchObject({ value: 42 });
  });

  it('forces LF checkout for native scripts even with Windows autocrlf enabled', async () => {
    const cwd = new URL('../../../', import.meta.url);
    const attributes = await readFile(new URL('.gitattributes', cwd), 'utf8');
    expect(attributes.split(/\r?\n/)).toContain('*.mjs text eol=lf');
    const result = execFileSync(
      'git',
      [
        '-c',
        'core.autocrlf=true',
        'check-attr',
        'text',
        'eol',
        '--',
        '.specify/scripts/node/gofer-surface-update.mjs',
        'scripts/verify-orchestration-preservation.mjs',
      ],
      { cwd, encoding: 'utf8' }
    );
    for (const file of [
      '.specify/scripts/node/gofer-surface-update.mjs',
      'scripts/verify-orchestration-preservation.mjs',
    ]) {
      expect(result).toContain(`${file}: text: set`);
      expect(result).toContain(`${file}: eol: lf`);
    }
  });
});
