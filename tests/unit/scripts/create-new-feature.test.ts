import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('create-new-feature', () => {
  it('keeps remote fetch output out of the generated branch number', async () => {
    const script = await readFile(
      path.resolve('.specify/scripts/bash/create-new-feature.sh'),
      'utf8'
    );

    expect(script).toContain('git fetch --all --prune >/dev/null 2>&1 || true');
  });
});
