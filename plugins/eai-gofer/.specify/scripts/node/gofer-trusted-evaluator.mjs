/** Read a locally provisioned evaluator key. The worker never chooses it. */
import { createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';

const text = value => typeof value === 'string' && value.trim().length > 0;
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};
const denied = () => new Error('TRUSTED_EVALUATOR_REQUIRED');

function accountTrustRoot() {
  // HOME is caller-controlled. Read the macOS account record instead.
  if (process.platform !== 'darwin') throw denied();
  const name = execFileSync('/usr/bin/id', ['-un'], { encoding: 'utf8', timeout: 3000 }).trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw denied();
  const record = execFileSync('/usr/bin/dscl', ['.', '-read', path.join(path.sep, 'Users', name), 'NFSHomeDirectory'],
    { encoding: 'utf8', timeout: 3000 }).trim();
  const home = /^NFSHomeDirectory: (\/[^\n]+)$/.exec(record)?.[1];
  if (!home) throw denied();
  return path.join(home, '.eai-gofer-trust');
}

/**
 * The default trust root is fixed outside the checkout. `trustRoot` exists for
 * isolated tests; the production composition root never accepts an override.
 */
export async function resolveTrustedEvaluatorPublicKey(receipt, { workspaceRoot, trustRoot } = {}) {
  if (process.platform === 'win32' || typeof process.getuid !== 'function' ||
      !text(workspaceRoot) || !text(receipt?.host) || !text(receipt?.provenance?.keyId) ||
      !text(receipt?.provenance?.evaluator)) throw denied();
  const root = trustRoot ?? accountTrustRoot();
  if (!path.isAbsolute(root)) throw denied();
  try {
    const [workspace, parent, rootInfo] = await Promise.all([
      realpath(workspaceRoot), realpath(path.dirname(root)), lstat(root),
    ]);
    const canonicalRoot = path.join(parent, path.basename(root));
    if (inside(workspace, canonicalRoot) || !rootInfo.isDirectory() ||
        rootInfo.uid !== process.getuid() || (rootInfo.mode & 0o077) !== 0) throw denied();
    const filename = path.join(canonicalRoot, 'trusted-evaluators.json');
    const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    let registry;
    try {
      const actual = await file.stat();
      if (!actual.isFile() || actual.uid !== process.getuid() ||
          (actual.mode & 0o077) !== 0 || actual.size < 2 || actual.size > 65536) throw denied();
      registry = JSON.parse(await file.readFile('utf8'));
    } finally { await file.close(); }
    if (registry?.schemaVersion !== 1 || !Array.isArray(registry.evaluators) ||
        registry.evaluators.length < 1 || registry.evaluators.length > 32 ||
        registry.evaluators.some(item => !text(item?.keyId) || !text(item?.host) ||
          !text(item?.evaluator) || !text(item?.publicKeyPem)) ||
        new Set(registry.evaluators.map(item => item.keyId)).size !== registry.evaluators.length) throw denied();
    const entry = registry.evaluators.find(item => item.keyId === receipt.provenance.keyId &&
      item.host === receipt.host && item.evaluator === receipt.provenance.evaluator);
    if (!entry) throw denied();
    const key = createPublicKey(entry.publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') throw denied();
    return key;
  } catch { throw denied(); }
}
