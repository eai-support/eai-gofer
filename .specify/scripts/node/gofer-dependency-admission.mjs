#!/usr/bin/env node

import { open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const POLICY_SCHEMA = 'gofer.dependency-security-policy/v1';
const EVIDENCE_SCHEMA = 'gofer.dependency-evidence/v1';
const EXCEPTIONS_SCHEMA = 'gofer.dependency-exceptions/v1';
const REPORT_SCHEMA = 'gofer.dependency-admission-report/v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_PACKAGES = 10_000;
const MAX_EXCEPTIONS = 1_000;
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/;
const SEVERITIES = new Set(['low', 'moderate', 'medium', 'high', 'critical']);

export class AdmissionInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdmissionInputError';
  }
}

function fail(message) {
  throw new AdmissionInputError(message);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
  return value.trim();
}

function finiteInteger(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) fail(`${label} must be an integer of at least ${minimum}`);
  return value;
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    fail(`${label} must be an array of non-empty strings`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function timestamp(value, label) {
  const raw = nonEmptyString(value, label);
  const milliseconds = Date.parse(raw);
  if (!Number.isFinite(milliseconds)) fail(`${label} must be a valid ISO-8601 timestamp`);
  return { raw: new Date(milliseconds).toISOString(), milliseconds };
}

function validatePolicy(value) {
  const policy = object(value, 'Policy');
  if (policy.schemaVersion !== POLICY_SCHEMA) fail(`Unsupported policy schema: ${policy.schemaVersion ?? 'missing'}`);
  const blockingSeverities = stringArray(policy.blockVulnerabilitySeverities, 'blockVulnerabilitySeverities');
  if (blockingSeverities.some((severity) => !SEVERITIES.has(severity))) fail('Policy has an invalid vulnerability severity');
  const reviewSignals = stringArray(policy.reviewSignals, 'reviewSignals');
  const waivableFindings = stringArray(policy.waivableFindings, 'waivableFindings');
  if (waivableFindings.length !== 1 || waivableFindings[0] !== 'release-age') {
    fail('Only release-age can be configured as waivable');
  }
  for (const key of ['blockKnownMalware', 'requireExactVersion', 'requireIntegrity', 'requireScannerEvidence']) {
    if (typeof policy[key] !== 'boolean') fail(`${key} must be boolean`);
  }
  return {
    ...policy,
    policyVersion: nonEmptyString(policy.policyVersion, 'policyVersion'),
    minimumReleaseAgeDays: finiteInteger(policy.minimumReleaseAgeDays, 'minimumReleaseAgeDays'),
    maximumExceptionDays: finiteInteger(policy.maximumExceptionDays, 'maximumExceptionDays', 1),
    blockVulnerabilitySeverities: blockingSeverities,
    reviewSignals,
    waivableFindings,
  };
}

function validateEvidence(value, policy, nowMs) {
  const evidence = object(value, 'Evidence');
  if (evidence.schemaVersion !== EVIDENCE_SCHEMA) fail(`Unsupported evidence schema: ${evidence.schemaVersion ?? 'missing'}`);
  timestamp(evidence.generatedAt, 'generatedAt');
  if (policy.requireScannerEvidence) {
    const scanner = object(evidence.scanner, 'scanner');
    nonEmptyString(scanner.name, 'scanner.name');
    nonEmptyString(scanner.version, 'scanner.version');
  }
  if (!Array.isArray(evidence.packages) || evidence.packages.length > MAX_PACKAGES) {
    fail(`packages must be an array with at most ${MAX_PACKAGES} records`);
  }
  const identities = new Set();
  return evidence.packages.map((candidate, index) => {
    const item = object(candidate, `packages[${index}]`);
    const name = nonEmptyString(item.name, `packages[${index}].name`).toLowerCase();
    const version = nonEmptyString(item.version, `packages[${index}].version`);
    if (!PACKAGE_NAME.test(name)) fail(`packages[${index}].name is not a valid npm package name`);
    if (policy.requireExactVersion && !EXACT_VERSION.test(version)) fail(`packages[${index}].version must be an exact version`);
    const identity = `${name}@${version}`;
    if (identities.has(identity)) fail(`Duplicate package identity: ${identity}`);
    identities.add(identity);
    const published = timestamp(item.publishedAt, `packages[${index}].publishedAt`);
    if (published.milliseconds > nowMs) fail(`packages[${index}].publishedAt cannot be in the future`);
    if (typeof item.malware !== 'boolean') fail(`packages[${index}].malware must be boolean`);
    if (!Array.isArray(item.vulnerabilities)) fail(`packages[${index}].vulnerabilities must be an array`);
    const vulnerabilities = item.vulnerabilities.map((candidateVulnerability, vulnerabilityIndex) => {
      const vulnerability = object(candidateVulnerability, `packages[${index}].vulnerabilities[${vulnerabilityIndex}]`);
      const severity = nonEmptyString(vulnerability.severity, 'vulnerability.severity').toLowerCase();
      if (!SEVERITIES.has(severity)) fail(`packages[${index}] has an invalid vulnerability severity`);
      if (typeof vulnerability.fixed !== 'boolean') fail(`packages[${index}] vulnerability.fixed must be boolean`);
      return {
        id: nonEmptyString(vulnerability.id, 'vulnerability.id'),
        severity,
        fixed: vulnerability.fixed,
      };
    });
    return {
      name,
      version,
      publishedAt: published.raw,
      publishedAtMs: published.milliseconds,
      integrity: typeof item.integrity === 'string' ? item.integrity.trim() : '',
      malware: item.malware,
      vulnerabilities,
      signals: stringArray(item.signals, `packages[${index}].signals`),
    };
  });
}

function normalizeExceptions(value) {
  if (value === undefined || value === null) return [];
  const document = object(value, 'Exceptions');
  if (document.schemaVersion !== EXCEPTIONS_SCHEMA || !Array.isArray(document.exceptions) || document.exceptions.length > MAX_EXCEPTIONS) {
    return [];
  }
  return document.exceptions;
}

function validUrgentException(candidate, pkg, policy, nowMs) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  if (candidate.type !== 'urgent-security-fix' || candidate.package !== pkg.name || candidate.version !== pkg.version) return false;
  const requiredStrings = ['id', 'owner', 'reason', 'evidence', 'createdAt', 'expiresAt'];
  if (requiredStrings.some((key) => typeof candidate[key] !== 'string' || !candidate[key].trim())) return false;
  if (!Array.isArray(candidate.vulnerabilityIds) || candidate.vulnerabilityIds.length === 0 || candidate.vulnerabilityIds.some((id) => typeof id !== 'string' || !id.trim())) return false;
  const createdMs = Date.parse(candidate.createdAt);
  const expiresMs = Date.parse(candidate.expiresAt);
  if (!Number.isFinite(createdMs) || !Number.isFinite(expiresMs)) return false;
  if (createdMs > nowMs || expiresMs <= nowMs || expiresMs <= createdMs) return false;
  if (expiresMs - createdMs > policy.maximumExceptionDays * DAY_MS) return false;
  const fixedIds = new Set(pkg.vulnerabilities.filter((item) => item.fixed).map((item) => item.id));
  return candidate.vulnerabilityIds.some((id) => fixedIds.has(id));
}

function finding(code, message, blocking, extra = {}) {
  return { code, message, blocking, waived: false, ...extra };
}

function decisionFor(findings) {
  if (findings.some((item) => item.blocking)) return 'block';
  if (findings.some((item) => !item.waived)) return 'review';
  return 'allow';
}

export function evaluateDependencyAdmission({ policy: rawPolicy, evidence: rawEvidence, exceptions, now = new Date().toISOString() }) {
  const evaluated = timestamp(now, 'now');
  const policy = validatePolicy(rawPolicy);
  const packages = validateEvidence(rawEvidence, policy, evaluated.milliseconds);
  const exceptionRecords = normalizeExceptions(exceptions);
  const blockingSeverities = new Set(policy.blockVulnerabilitySeverities);
  const reviewSignals = new Set(policy.reviewSignals);

  const packageReports = packages
    .map((pkg) => {
      const findings = [];
      if (policy.blockKnownMalware && pkg.malware) findings.push(finding('known-malware', 'Scanner evidence classifies this package version as malware.', true));
      if (policy.requireIntegrity && !pkg.integrity) findings.push(finding('missing-integrity', 'Required package integrity evidence is missing.', true));
      for (const vulnerability of pkg.vulnerabilities) {
        if (!vulnerability.fixed && blockingSeverities.has(vulnerability.severity)) {
          findings.push(finding('blocking-vulnerability', `${vulnerability.id} has ${vulnerability.severity} severity and remains unresolved.`, true, { vulnerabilityId: vulnerability.id }));
        }
      }
      const ageMs = evaluated.milliseconds - pkg.publishedAtMs;
      const ageDays = Math.floor(ageMs / DAY_MS);
      const appliedExceptions = [];
      if (ageMs < policy.minimumReleaseAgeDays * DAY_MS) {
        const validException = exceptionRecords.find((candidate) => validUrgentException(candidate, pkg, policy, evaluated.milliseconds));
        if (validException) {
          appliedExceptions.push(validException.id.trim());
          findings.push(finding('release-age', `Package is ${ageDays} complete days old; the urgent security exception waives only this finding.`, false, { waived: true }));
        } else {
          findings.push(finding('release-age', `Package is ${ageDays} complete days old; policy requires ${policy.minimumReleaseAgeDays}.`, true));
        }
      }
      for (const signal of pkg.signals) {
        if (reviewSignals.has(signal)) findings.push(finding(`risk-signal:${signal}`, `Package evidence includes the ${signal} review signal.`, false));
      }
      findings.sort((left, right) => left.code.localeCompare(right.code) || (left.vulnerabilityId ?? '').localeCompare(right.vulnerabilityId ?? ''));
      return {
        name: pkg.name,
        version: pkg.version,
        decision: decisionFor(findings),
        releaseAgeDays: ageDays,
        appliedExceptions: appliedExceptions.sort(),
        findings,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));

  return {
    schemaVersion: REPORT_SCHEMA,
    policyVersion: policy.policyVersion,
    evaluatedAt: evaluated.raw,
    decision: packageReports.some((item) => item.decision === 'block')
      ? 'block'
      : packageReports.some((item) => item.decision === 'review')
        ? 'review'
        : 'allow',
    summary: {
      packages: packageReports.length,
      blocked: packageReports.filter((item) => item.decision === 'block').length,
      review: packageReports.filter((item) => item.decision === 'review').length,
      allowed: packageReports.filter((item) => item.decision === 'allow').length,
    },
    packages: packageReports,
  };
}

async function readJson(filePath, label) {
  const handle = await open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) fail(`${label} exceeds the ${MAX_INPUT_BYTES}-byte input limit or is not a file`);
    const content = await handle.readFile('utf8');
    try {
      return JSON.parse(content);
    } catch {
      fail(`${label} is not valid JSON`);
    }
  } finally {
    await handle.close();
  }
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--input', '--policy', '--exceptions', '--output', '--now'].includes(flag) || !args[index + 1] || args[index + 1].startsWith('--')) {
      fail(`Invalid argument: ${flag}`);
    }
    options[flag.slice(2)] = args[++index];
  }
  if (!options.input || !options.policy) fail('--input and --policy are required');
  return options;
}

export async function runCli(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const [policy, evidence, exceptions] = await Promise.all([
    readJson(options.policy, 'Policy'),
    readJson(options.input, 'Evidence'),
    options.exceptions ? readJson(options.exceptions, 'Exceptions') : undefined,
  ]);
  const report = evaluateDependencyAdmission({ policy, evidence, exceptions, now: options.now });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) await writeFile(options.output, output, { encoding: 'utf8', flag: 'w', mode: 0o600 });
  else process.stdout.write(output);
  return report.decision === 'block' ? 1 : 0;
}

const directRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (directRun) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`Dependency admission failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    });
}
