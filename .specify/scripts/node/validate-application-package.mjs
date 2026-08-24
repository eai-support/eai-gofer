import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const APPLICATION_PACKAGE_SCHEMA_VERSION = 'eai.application-package.v1';
export const APP_CAPABILITY_SCHEMA_VERSION = 'eai.app_capabilities.v1';

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const OCI_REPOSITORY = /^[a-z0-9.-]+(?:\/[a-z0-9._-]+)+$/;
const SECRET_FIELD = /(secret|password|credential|accessToken|refreshToken|privateKey|connectionString)/i;
const PROVIDER_ROUTE = /(?:documents\.azure\.com|blob\.core\.windows\.net|search\.windows\.net|postgres(?:ql)?:\/\/|mongodb(?:\+srv)?:\/\/)/i;
const TOP_LEVEL_FIELDS = new Set([
  'schemaVersion', 'packageId', 'appKey', 'displayName', 'version', 'publisher',
  'distribution', 'source', 'artifact', 'manifestDigest', 'runtime', 'routes',
  'objectTypes', 'services', 'capabilities', 'dataGovernance', 'callbacks',
  'commercial', 'support', 'compatibility', 'lifecycle', 'evidence',
]);

/** Return deterministic machine findings without mutating the package or workspace. */
export function validateApplicationPackage(value) {
  const findings = [];
  if (!isRecord(value)) return [finding('APP_MARKETPLACE_PACKAGE_OBJECT_REQUIRED', '$', 'Application package must be an object.')];
  for (const field of TOP_LEVEL_FIELDS) {
    if (!(field in value)) findings.push(finding('APP_MARKETPLACE_REQUIRED_FIELD', field, 'Canonical package field is required.'));
  }
  for (const field of Object.keys(value)) {
    if (!TOP_LEVEL_FIELDS.has(field)) findings.push(finding('APP_MARKETPLACE_UNKNOWN_FIELD', field, 'Unknown canonical package field.'));
  }
  if (value.schemaVersion !== APPLICATION_PACKAGE_SCHEMA_VERSION) {
    findings.push(finding('APP_MARKETPLACE_SCHEMA_VERSION_REQUIRED', 'schemaVersion', `Expected ${APPLICATION_PACKAGE_SCHEMA_VERSION}.`));
  }
  if (typeof value.appKey !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.appKey)) {
    findings.push(finding('APP_MARKETPLACE_APP_KEY_INVALID', 'appKey', 'App key must be lowercase kebab-case.'));
  }
  const artifact = isRecord(value.artifact) ? value.artifact : {};
  if (!SHA256.test(String(artifact.digest ?? '')) || !OCI_REPOSITORY.test(String(artifact.repository ?? ''))) {
    findings.push(finding('APP_MARKETPLACE_IMMUTABLE_ARTIFACT_REQUIRED', 'artifact', 'Artifact requires an untagged OCI repository plus immutable sha256 digest.'));
  }
  if (!SHA256.test(String(value.manifestDigest ?? ''))) {
    findings.push(finding('APP_MARKETPLACE_MANIFEST_DIGEST_REQUIRED', 'manifestDigest', 'Manifest digest must be sha256:<64 hex>.'));
  }
  const runtime = isRecord(value.runtime) ? value.runtime : {};
  if (!['trusted-embedded', 'isolated-hosted'].includes(String(runtime.type ?? ''))) {
    findings.push(finding('APP_MARKETPLACE_RUNTIME_TYPE_INVALID', 'runtime.type', 'Runtime type must be trusted-embedded or isolated-hosted.'));
  }
  if (!['eai-owned-embedded', 'eai-hosted', 'buyer-hosted'].includes(String(runtime.topology ?? ''))) {
    findings.push(finding('APP_MARKETPLACE_RUNTIME_TOPOLOGY_INVALID', 'runtime.topology', 'Runtime topology must use the canonical hosting enum.'));
  }
  const capabilities = isRecord(value.capabilities) ? value.capabilities : {};
  if (capabilities.contractVersion !== APP_CAPABILITY_SCHEMA_VERSION) {
    findings.push(finding('APP_MARKETPLACE_CAPABILITY_CONTRACT_REQUIRED', 'capabilities.contractVersion', `Capabilities must compose ${APP_CAPABILITY_SCHEMA_VERSION}.`));
  }
  for (const capabilityClass of ['interactive', 'workload']) {
    for (const [index, capability] of array(capabilities[capabilityClass]).entries()) {
      if (typeof capability !== 'string' || !capability || capability.includes('*')) {
        findings.push(finding('APP_MARKETPLACE_CAPABILITY_WILDCARD', `capabilities.${capabilityClass}.${index}`, 'Capabilities must be explicit and bounded.'));
      }
    }
  }
  visit(value, [], (path, field, child) => {
    if (SECRET_FIELD.test(field) || (typeof child === 'string' && /\b(?:Bearer\s+|client_secret=|password=)/i.test(child))) {
      findings.push(finding('APP_MARKETPLACE_SECRET_FORBIDDEN', path, 'Application packages cannot contain credentials or secret values.'));
    }
    if (typeof child === 'string' && PROVIDER_ROUTE.test(child)) {
      findings.push(finding('APP_MARKETPLACE_DIRECT_PROVIDER_ROUTE', path, 'Packages must use the regional PublicAPI boundary, not provider routes.'));
    }
  });
  return uniqueFindings(findings);
}

/** Local conformance is not marketplace approval; readiness requires both platform authorities. */
export function evaluateMarketplaceReadiness(packageValue, evidence) {
  const missing = [];
  if (!isRecord(evidence?.approvedListing)) missing.push('approvedListing');
  if (!isRecord(evidence?.installedApp) || evidence.installedApp.status !== 'READY') missing.push('installedApp');
  return missing.length > 0
    ? { ready: false, status: 'prepared-only', missing }
    : { ready: true, status: 'installed', missing: [] };
}

export async function readAndValidateApplicationPackage(path) {
  const value = JSON.parse(await readFile(path, 'utf8'));
  return { value, findings: validateApplicationPackage(value) };
}

function finding(ruleId, path, message) {
  return { ruleId, path, severity: 'error', message };
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function visit(value, path, callback) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => visit(child, [...path, String(index)], callback));
    return;
  }
  if (!isRecord(value)) return;
  for (const [field, child] of Object.entries(value)) {
    const next = [...path, field];
    callback(next.join('.'), field, child);
    visit(child, next, callback);
  }
}

function uniqueFindings(findings) {
  return [...new Map(findings.map((item) => [`${item.ruleId}:${item.path}`, item])).values()]
    .sort((left, right) => `${left.ruleId}:${left.path}`.localeCompare(`${right.ruleId}:${right.path}`));
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: validate-application-package.mjs <eai.application.json>');
  const result = await readAndValidateApplicationPackage(path);
  process.stdout.write(`${JSON.stringify({ valid: result.findings.length === 0, findings: result.findings }, null, 2)}\n`);
  process.exitCode = result.findings.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
