import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { encryptSigningKey } from '../../.specify/scripts/node/gofer-encrypted-key.mjs';

export const PASSPHRASE = 'correct horse battery staple';
export const VERIFIER = 'gofer-heldout-benchmark-verifier';

export type VerifierInstall = {
  keys: { publicKey: KeyObject; privateKey: KeyObject };
  protectedDirectory: string;
  protectedRegistry: { path: string; ownerUid: number };
  getPassphrase: () => Promise<string>;
};

/**
 * Directory for a stand-in protected registry. `loadProtectedVerifierKey`
 * walks every ancestor and refuses group/world-writable directories, so this
 * cannot live under `os.tmpdir()` (`/tmp` is 1777 on Linux CI).
 */
export async function makeProtectedDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(homedir(), '.gofer-protected-registry-'));
  await chmod(directory, 0o755);
  return directory;
}

/**
 * Builds the two custody pieces the production loader requires: an encrypted
 * key envelope in the account trust root, and a verifier registry in a
 * separate protected directory. The test uid stands in for root.
 */
export async function installVerifier({
  trustRoot,
  keyId = 'verifier-key',
  activate = true,
  registered = true,
  passphrase = PASSPHRASE,
}: {
  trustRoot: string;
  keyId?: string;
  activate?: boolean;
  registered?: boolean;
  passphrase?: string;
}): Promise<VerifierInstall> {
  const keys = generateKeyPairSync('ed25519');
  const protectedDirectory = await makeProtectedDirectory();
  const registryPath = path.join(protectedDirectory, 'verifier-registry.json');
  if (registered) {
    await writeFile(
      registryPath,
      JSON.stringify({
        schemaVersion: 1,
        evaluators: [
          {
            keyId,
            host: 'codex',
            evaluator: VERIFIER,
            publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
          },
        ],
      }),
      { mode: 0o644 }
    );
  }
  if (activate) {
    const active = path.join(trustRoot, 'active-keys');
    await mkdir(active, { mode: 0o700, recursive: true });
    await writeFile(
      path.join(active, 'heldout-verifier.json'),
      JSON.stringify({ schemaVersion: 1, host: 'codex', evaluator: VERIFIER, keyId }),
      { mode: 0o600 }
    );
    await writeFile(
      path.join(active, 'heldout-verifier.private.enc.json'),
      JSON.stringify(await encryptSigningKey(keys.privateKey, passphrase)),
      { mode: 0o600 }
    );
  }
  return {
    keys,
    protectedDirectory,
    protectedRegistry: { path: registryPath, ownerUid: process.getuid?.() ?? 0 },
    getPassphrase: async () => passphrase,
  };
}
