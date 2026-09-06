import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';

afterEach(() => vi.restoreAllMocks());

describe('workspace authority error order', () => {
  it('reports the first contract path even when another required read fails first', async () => {
    const original = fs.readFile.bind(fs);
    vi.spyOn(fs, 'readFile').mockImplementation((async (file: unknown, ...args: unknown[]) => {
      const name = String(file).replace(/\\/g, '/');
      if (name.includes('/ops/tech-docs/') || name.includes('/ops/gofer/')) {
        if (name.endsWith('/contracts/object-type-routing-v1.json')) {
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        throw Object.assign(new Error('missing fixture authority'), { code: 'ENOENT' });
      }
      return (original as (...parameters: unknown[]) => unknown)(file, ...args);
    }) as typeof fs.readFile);
    const url = new URL(
      '../../../.specify/scripts/node/validate-object-type-routing-workspace.mjs',
      import.meta.url
    );
    const { reduceObjectTypeRoutingWorkspace } = await import(url.href);
    await expect(reduceObjectTypeRoutingWorkspace(os.tmpdir())).rejects.toMatchObject({
      code: 'AUTHORITY_UNREADABLE',
      message:
        'ops/tech-docs/static/contracts/object-type-routing-v1.json is not readable (ENOENT).',
    });
  });
});
