/** Read a locally provisioned evaluator key. The worker never chooses it. */
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { loadHeldOutCorpus } from './gofer-heldout-corpus.mjs';

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

async function inspectAccountTrustRoot(root, workspaceRoot) {
  if (!path.isAbsolute(root)) throw denied();
  const [workspace, parent, rootInfo] = await Promise.all([
    realpath(workspaceRoot), realpath(path.dirname(root)), lstat(root),
  ]);
  const parentInfo = await lstat(parent);
  const canonicalRoot = path.join(parent, path.basename(root));
  // No different account may rename the trust root between validation and open.
  if (!parentInfo.isDirectory() || ![0, process.getuid()].includes(parentInfo.uid) ||
      (parentInfo.mode & 0o022) !== 0 || inside(workspace, canonicalRoot) ||
      inside(canonicalRoot, workspace) ||
      !rootInfo.isDirectory() || rootInfo.uid !== process.getuid() ||
      (rootInfo.mode & 0o077) !== 0) throw denied();
  return canonicalRoot;
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
  try {
    const canonicalRoot = await inspectAccountTrustRoot(root, workspaceRoot);
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

/** Only activated identities can sign. Production issuers never expose a
 * caller-selected trust root; the override is for isolated tests. */
async function loadActiveEvaluatorKey({ workspaceRoot, trustRoot, identityName, evaluator } = {}) {
  if (!text(workspaceRoot) || process.platform === 'win32' || typeof process.getuid !== 'function') throw denied();
  const root = trustRoot ?? accountTrustRoot();
  try {
    const active = path.join(root, 'active-keys');
    const activeInfo = await lstat(active);
    if (!activeInfo.isDirectory() || activeInfo.uid !== process.getuid() ||
        (activeInfo.mode & 0o077) !== 0) throw denied();
    const identityFile = await open(path.join(active, `${identityName}.json`),
      constants.O_RDONLY | constants.O_NOFOLLOW);
    let identity;
    try {
      const info = await identityFile.stat();
      if (!info.isFile() || info.uid !== process.getuid() ||
          (info.mode & 0o077) !== 0 || info.size < 2 || info.size > 4096) throw denied();
      identity = JSON.parse(await identityFile.readFile('utf8'));
    } finally { await identityFile.close(); }
    if (identity?.schemaVersion !== 1 || identity.host !== 'codex' ||
        identity.evaluator !== evaluator || !text(identity.keyId)) throw denied();
    const publicKey = await resolveTrustedEvaluatorPublicKey({ host: identity.host,
      provenance: { evaluator: identity.evaluator, keyId: identity.keyId } }, { workspaceRoot, trustRoot });
    const privateFile = await open(path.join(active, `${identityName}.private.pem`),
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

export async function loadActiveCodexEvaluatorKey({ workspaceRoot, trustRoot } = {}) {
  return loadActiveEvaluatorKey({ workspaceRoot, trustRoot,
    identityName: 'codex-evaluator', evaluator: 'gofer-native-host-evaluator' });
}

export async function loadActiveBenchmarkVerifierKey({ workspaceRoot, trustRoot } = {}) {
  return loadActiveEvaluatorKey({ workspaceRoot, trustRoot,
    identityName: 'heldout-verifier', evaluator: 'gofer-heldout-benchmark-verifier' });
}

/** The controller pins one corpus inside its account-owned trust root.
 * A worker cannot select a path or replace a pinned input through this API. */
export async function loadTrustedHeldOutCorpus({ workspaceRoot, trustRoot } = {}) {
  if (!text(workspaceRoot) || process.platform === 'win32' ||
      typeof process.getuid !== 'function') throw denied();
  const root = trustRoot ?? accountTrustRoot();
  try {
    const canonicalRoot = await inspectAccountTrustRoot(root, workspaceRoot);
    const configFile = await open(path.join(canonicalRoot, 'heldout-corpus.json'),
      constants.O_RDONLY | constants.O_NOFOLLOW);
    let config;
    try {
      const info = await configFile.stat();
      if (!info.isFile() || info.uid !== process.getuid() || info.nlink !== 1 ||
          (info.mode & 0o077) !== 0 || info.size < 2 || info.size > 4096) throw denied();
      config = JSON.parse(await configFile.readFile('utf8'));
    } finally { await configFile.close(); }
    if (config?.schemaVersion !== 1 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(config.corpusId ?? '') ||
        !/^[a-f0-9]{64}$/.test(config.corpusHash ?? '')) throw denied();
    const corpora = path.join(canonicalRoot, 'corpora');
    const corpusRoot = path.join(corpora, config.corpusId);
    for (const directory of [corpora, corpusRoot]) {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.uid !== process.getuid() ||
          (info.mode & 0o077) !== 0) throw denied();
    }
    const manifestFile = await open(path.join(corpusRoot, 'manifest.json'),
      constants.O_RDONLY | constants.O_NOFOLLOW);
    let manifest;
    try {
      const info = await manifestFile.stat();
      if (!info.isFile() || info.uid !== process.getuid() || info.nlink !== 1 ||
          (info.mode & 0o077) !== 0 || info.size < 2 || info.size > 65536) throw denied();
      manifest = JSON.parse(await manifestFile.readFile('utf8'));
    } finally { await manifestFile.close(); }
    if (!Array.isArray(manifest?.cases) ||
        createHash('sha256').update(JSON.stringify(manifest)).digest('hex') !== config.corpusHash) throw denied();
    for (const name of manifest.cases.map(item => item?.inputFile)) {
      if (!text(name) || name === '.' || name === '..' || name.includes('/') ||
          name.includes('\\')) throw denied();
      const info = await lstat(path.join(corpusRoot, name));
      if (!info.isFile() || info.uid !== process.getuid() || info.nlink !== 1 ||
          (info.mode & 0o077) !== 0) throw denied();
    }
    const corpus = await loadHeldOutCorpus({ corpusRoot, workspaceRoot });
    if (corpus.corpusHash !== config.corpusHash) throw denied();
    return Object.freeze({ ...corpus, corpusRoot });
  } catch { throw denied(); }
}
