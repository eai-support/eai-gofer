import { createPublicKey } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initializeStagedTrust } from '../../../.specify/scripts/node/gofer-trust-bootstrap.mjs';

describe.skipIf(process.platform === 'win32')('local trust setup', () => {
  it('creates two distinct inactive identities without replacing them', async () => {
    const parent = await mkdtemp(path.join(os.homedir(), '.gofer-trust-test-'));
    const root = path.join(parent, 'trust');
    try {
      const setup = await initializeStagedTrust(root);
      expect(setup.active).toBe(false);
      expect(setup.identities).toHaveLength(2);
      expect(new Set(setup.identities.map(item => item.keyId)).size).toBe(2);
      const registry = JSON.parse(await readFile(path.join(root, 'trusted-evaluators.json'), 'utf8'));
      expect(registry).toEqual({ schemaVersion: 1, evaluators: [] });
      const staged = path.join(root, 'staged-keys');
      const evaluator = createPublicKey(await readFile(path.join(staged, 'capability-evaluator.private.pem')));
      const verifier = createPublicKey(await readFile(path.join(staged, 'heldout-verifier.private.pem')));
      expect(evaluator.export({ type: 'spki', format: 'der' })).not.toEqual(
        verifier.export({ type: 'spki', format: 'der' })
      );
      expect((await stat(root)).mode & 0o077).toBe(0);
      expect((await stat(path.join(staged, 'capability-evaluator.private.pem'))).mode & 0o077).toBe(0);
      await expect(initializeStagedTrust(root)).rejects.toThrow();
      expect(JSON.parse(await readFile(path.join(root, 'trusted-evaluators.json'), 'utf8')))
        .toEqual(registry);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
