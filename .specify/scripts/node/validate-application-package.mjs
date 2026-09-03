import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  APPLICATION_PACKAGE_SCHEMA_VERSION,
  APP_CAPABILITY_SCHEMA_VERSION,
  canonicalizeJson,
  digestCanonicalJson,
  validateApplicationPackageContract,
} from './generated/application-package-runtime.mjs';

const applicationPackageSchema = JSON.parse(
  readFileSync(new URL('./generated/application-package.schema.json', import.meta.url), 'utf8'),
);
const PROVIDER_ROUTE = /(?:documents\.azure\.com|blob\.core\.windows\.net|search\.windows\.net|postgres(?:ql)?:\/\/|mongodb(?:\+srv)?:\/\/)/iu;

export { APPLICATION_PACKAGE_SCHEMA_VERSION, APP_CAPABILITY_SCHEMA_VERSION };

/** Return deterministic machine findings from the exact published package contract. */
export function validateApplicationPackage(value) {
  const findings = validateApplicationPackageContract(applicationPackageSchema, value)
    .map(contractFinding);
  visit(value, [], (path, _field, child) => {
    if (typeof child === 'string' && PROVIDER_ROUTE.test(child)) {
      findings.push(finding(
        'APP_MARKETPLACE_DIRECT_PROVIDER_ROUTE',
        path,
        'Packages must use the regional PublicAPI boundary, not provider routes.',
      ));
    }
  });
  return uniqueFindings(findings);
}

/** Serialize package bytes with the platform canonicalizer. */
export function canonicalizeApplicationPackage(value) {
  return canonicalizeJson(value);
}

/** Reject invalid packages, then return their canonical lowercase digest. */
export function digestApplicationPackage(value) {
  const findings = validateApplicationPackage(value);
  if (findings.length > 0) {
    throw new Error(`Invalid application package: ${findings.map(({ message }) => message).join('; ')}`);
  }
  return digestCanonicalJson(value);
}

/** Local conformance is not marketplace approval; readiness requires both platform authorities. */
export function evaluateMarketplaceReadiness(_packageValue, evidence) {
  const missing = [];
  if (!isRecord(evidence?.approvedListing)) missing.push('approvedListing');
  if (!isRecord(evidence?.installedApp) || evidence.installedApp.status !== 'READY') missing.push('installedApp');
  return missing.length > 0
    ? { ready: false, status: 'prepared-only', missing }
    : { ready: true, status: 'installed', missing: [] };
}

/** Read and validate a package without mutating it or the workspace. */
export async function readAndValidateApplicationPackage(path) {
  const value = JSON.parse(await readFile(path, 'utf8'));
  return { value, findings: validateApplicationPackage(value) };
}

function contractFinding(message) {
  const path = message.match(/^(\$[^:]*):/u)?.[1] ?? '$';
  let ruleId = 'APP_MARKETPLACE_SCHEMA_VIOLATION';
  if (message.includes('wildcard capabilities')) ruleId = 'APP_MARKETPLACE_CAPABILITY_WILDCARD';
  else if (message.includes('credential') || message.includes('secret')) ruleId = 'APP_MARKETPLACE_SECRET_FORBIDDEN';
  else if (path.startsWith('$.artifact') && (message.includes('digest') || message.includes('pattern') || message.includes('mutable'))) {
    ruleId = 'APP_MARKETPLACE_IMMUTABLE_ARTIFACT_REQUIRED';
  } else if (path === '$' && message.includes('expected object')) {
    ruleId = 'APP_MARKETPLACE_PACKAGE_OBJECT_REQUIRED';
  } else if (message.includes('missing required property')) {
    ruleId = 'APP_MARKETPLACE_REQUIRED_FIELD';
  } else if (message.includes('additional property')) {
    ruleId = 'APP_MARKETPLACE_UNKNOWN_FIELD';
  } else if (path === '$.schemaVersion') {
    ruleId = 'APP_MARKETPLACE_SCHEMA_VERSION_REQUIRED';
  } else if (path === '$.appKey') {
    ruleId = 'APP_MARKETPLACE_APP_KEY_INVALID';
  } else if (path === '$.manifestDigest') {
    ruleId = 'APP_MARKETPLACE_MANIFEST_DIGEST_REQUIRED';
  } else if (path === '$.runtime.type') {
    ruleId = 'APP_MARKETPLACE_RUNTIME_TYPE_INVALID';
  } else if (path === '$.runtime.topology') {
    ruleId = 'APP_MARKETPLACE_RUNTIME_TOPOLOGY_INVALID';
  } else if (path === '$.capabilities.contractVersion') {
    ruleId = 'APP_MARKETPLACE_CAPABILITY_CONTRACT_REQUIRED';
  }
  return finding(ruleId, path, message);
}

function finding(ruleId, path, message) {
  return { ruleId, path, severity: 'error', message };
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
