import {
  GOFER_RELEASE_CONTRACT_VERSION,
  GOFER_RELEASE_REPOSITORY,
  type GoferReleaseDescriptor,
} from './contracts.js';

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const REF_PATTERN = /^v\d+\.\d+\.\d+$/;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Validates the immutable runtime release identity accepted by the headless contract.
 *
 * Takes `unknown` because persisted runs and repository handoffs are replayed
 * from storage: every rejection must be a deterministic contract error, never a
 * TypeError from reading a field off a non-object.
 */
export function assertGoferReleaseDescriptor(
  descriptor: unknown
): asserts descriptor is GoferReleaseDescriptor {
  if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor)) {
    throw new Error('goferRelease must be an object.');
  }
  const candidate = descriptor as Record<string, unknown>;
  if (candidate.contractVersion !== GOFER_RELEASE_CONTRACT_VERSION) {
    throw new Error(`goferRelease.contractVersion must be ${GOFER_RELEASE_CONTRACT_VERSION}.`);
  }
  if (candidate.repository !== GOFER_RELEASE_REPOSITORY) {
    throw new Error(`goferRelease.repository must be ${GOFER_RELEASE_REPOSITORY}.`);
  }
  if (typeof candidate.version !== 'string' || !VERSION_PATTERN.test(candidate.version)) {
    throw new Error('goferRelease.version must be an exact semantic version.');
  }
  if (typeof candidate.ref !== 'string' || !REF_PATTERN.test(candidate.ref)) {
    throw new Error('goferRelease.ref must be an exact release tag.');
  }
  if (candidate.ref !== `v${candidate.version}`) {
    throw new Error('goferRelease.ref must match goferRelease.version.');
  }
  if (typeof candidate.commitSha !== 'string' || !COMMIT_SHA_PATTERN.test(candidate.commitSha)) {
    throw new Error('goferRelease.commitSha must be a lowercase 40-character Git SHA.');
  }
  if (
    typeof candidate.inventoryDigest !== 'string' ||
    !SHA256_PATTERN.test(candidate.inventoryDigest)
  ) {
    throw new Error('goferRelease.inventoryDigest must be a lowercase SHA-256 digest.');
  }
}
