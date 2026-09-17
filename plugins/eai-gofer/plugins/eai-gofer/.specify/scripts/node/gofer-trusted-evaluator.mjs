/** Read a locally provisioned evaluator key. The worker never chooses it. */
import { createPrivateKey, createPublicKey } from 'node:crypto';
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
  // HOME is caller-controlled. Resolve the account record by effective UID.
  if (process.platform === 'linux') {
    const uid = process.getuid();
    const record = execFileSync('/usr/bin/getent', ['passwd', String(uid)],
      { encoding: 'utf8', timeout: 3000 }).trim();
    const fields = record.split(':');
    const home = fields.length === 7 && fields[2] === String(uid) ? fields[5] : null;
    if (!home || !path.isAbsolute(home) || home.includes('\n')) throw denied();
    return path.join(home, '.eai-gofer-trust');
  }
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
    const parentInfo = await lstat(parent);
    const canonicalRoot = path.join(parent, path.basename(root));
    // No different account may rename the trust root between validation and open.
    if (!parentInfo.isDirectory() || ![0, process.getuid()].includes(parentInfo.uid) ||
        (parentInfo.mode & 0o022) !== 0 ||
        inside(workspace, canonicalRoot) || !rootInfo.isDirectory() ||
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

/** The production issuer has no caller-selected key path. Test fixtures may
 * supply a trust root, but a staged key is never eligible to sign. */
export async function loadActiveCodexEvaluatorKey({ workspaceRoot, trustRoot } = {}) {
  if (!text(workspaceRoot) || process.platform === 'win32' || typeof process.getuid !== 'function') throw denied();
  const root = trustRoot ?? accountTrustRoot();
  try {
    const active = path.join(root, 'active-keys');
    const activeInfo = await lstat(active);
    if (!activeInfo.isDirectory() || activeInfo.uid !== process.getuid() ||
        (activeInfo.mode & 0o077) !== 0) throw denied();
    const identityFile = await open(path.join(active, 'codex-evaluator.json'),
      constants.O_RDONLY | constants.O_NOFOLLOW);
    let identity;
    try {
      const info = await identityFile.stat();
      if (!info.isFile() || info.uid !== process.getuid() ||
          (info.mode & 0o077) !== 0 || info.size < 2 || info.size > 4096) throw denied();
      identity = JSON.parse(await identityFile.readFile('utf8'));
    } finally { await identityFile.close(); }
    if (identity?.schemaVersion !== 1 || identity.host !== 'codex' ||
        identity.evaluator !== 'gofer-native-host-evaluator' || !text(identity.keyId)) throw denied();
    const publicKey = await resolveTrustedEvaluatorPublicKey({ host: identity.host,
      provenance: { evaluator: identity.evaluator, keyId: identity.keyId } }, { workspaceRoot, trustRoot });
    const privateFile = await open(path.join(active, 'codex-evaluator.private.pem'),
      constants.O_RDONLY | constants.O_NOFOLLOW);
    let privateKey;
    try {
      const info = await privateFile.stat();
      if (!info.isFile() || info.uid !== process.getuid() ||
          (info.mode & 0o077) !== 0 || info.size < 32 || info.size > 8192) throw denied();
      privateKey = createPrivateKey(await privateFile.readFile('utf8'));
    } finally { await privateFile.close(); }
    if (privateKey.asymmetricKeyType !== 'ed25519' ||
        !createPublicKey(privateKey).export({ type: 'spki', format: 'der' })
          .equals(publicKey.export({ type: 'spki', format: 'der' }))) throw denied();
    return Object.freeze({ privateKey, keyId: identity.keyId });
  } catch { throw denied(); }
}
