/** Authenticate a held-out benchmark report before it can govern routing. */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { resolveTrustedEvaluatorPublicKey } from './gofer-trusted-evaluator.mjs';

const text = value => typeof value === 'string' && value.trim().length > 0;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const denied = () => new Error('TRUSTED_BENCHMARK_REQUIRED');
const VERIFIER = 'gofer-heldout-benchmark-verifier';

/**
 * A signed attestation binds all report fields, including every run verdict,
 * cost, review receipt, and provenance field. Only a separately registered
 * verifier key may authorize this evidence for the native runtime.
 */
export async function verifyTrustedBenchmarkEvidence({ host, receiptHash, evidence,
  attestation, capabilityKeyId, capabilityPublicKey, workspaceRoot, now = Date.now() } = {}) {
  if (!text(host) || !/^[a-f0-9]{64}$/.test(receiptHash ?? '') || !text(capabilityKeyId) ||
      !capabilityPublicKey || !text(workspaceRoot) || !Number.isFinite(now) || !attestation ||
      attestation.schemaVersion !== 1 || attestation.host !== host ||
      attestation.capabilityReceiptHash !== receiptHash ||
      attestation.verification !== 'functional-tests+independent-review' ||
      !text(attestation.verifierVersion) || attestation.provenance?.evaluator !== VERIFIER ||
      !text(attestation.provenance?.keyId) || attestation.provenance.keyId === capabilityKeyId ||
      !text(attestation.provenance?.source) || attestation.signature?.algorithm !== 'ed25519' ||
      attestation.signature.keyId !== attestation.provenance.keyId ||
      !/^[A-Za-z0-9_-]+$/.test(attestation.signature.value ?? '')) throw denied();
  const verifiedAt = Date.parse(attestation.verifiedAt);
  const expiresAt = Date.parse(attestation.expiresAt);
  if (!Number.isFinite(verifiedAt) || !Number.isFinite(expiresAt) ||
      verifiedAt > now || expiresAt <= now || expiresAt <= verifiedAt) throw denied();
  let bytes;
  try { bytes = JSON.stringify(evidence); } catch { throw denied(); }
  if (!text(bytes) || attestation.evidenceHash !== sha256(bytes)) throw denied();
  const { signature, ...payload } = attestation;
  const publicKey = await resolveTrustedEvaluatorPublicKey(attestation,
    { workspaceRoot }).catch(() => { throw denied(); });
  try {
    const capabilityKey = capabilityPublicKey?.type === 'public'
      ? capabilityPublicKey : createPublicKey(capabilityPublicKey);
    if (publicKey.export({ type: 'spki', format: 'der' }).equals(
      capabilityKey.export({ type: 'spki', format: 'der' }))) throw denied();
  } catch { throw denied(); }
  if (!verify(null, Buffer.from(JSON.stringify(payload)), publicKey,
    Buffer.from(signature.value, 'base64url'))) throw denied();
  return Object.freeze({ valid: true, receiptHash, receipt: `benchmark:${sha256(JSON.stringify(attestation))}` });
}
