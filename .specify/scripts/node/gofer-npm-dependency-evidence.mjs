#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const EVIDENCE_SCHEMA = 'gofer.dependency-evidence/v1';
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_CHANGED_PACKAGES = 500;
const NPM_ECOSYSTEM = 'npm';

export class EvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EvidenceError';
  }
}

function fail(message) {
  throw new EvidenceError(message);
}

function packageNameFromPath(packagePath, entry) {
  if (typeof entry.name === 'string' && entry.name.trim()) return entry.name.trim().toLowerCase();
  const marker = 'node_modules/';
  const index = packagePath.lastIndexOf(marker);
  if (index < 0) return '';
  return packagePath.slice(index + marker.length).toLowerCase();
}

export function lockfilePackages(lockfile) {
  if (!lockfile || typeof lockfile !== 'object' || !lockfile.packages || typeof lockfile.packages !== 'object') {
    fail('Only npm package-lock files with a packages object are supported');
  }
  const result = [];
  for (const [packagePath, entry] of Object.entries(lockfile.packages)) {
    if (!packagePath.includes('node_modules/') || !entry || typeof entry !== 'object') continue;
    const name = packageNameFromPath(packagePath, entry);
    const version = typeof entry.version === 'string' ? entry.version.trim() : '';
    if (!name || !version) fail(`Lockfile package ${packagePath} has no exact name or version`);
    result.push({ name, version, integrity: typeof entry.integrity === 'string' ? entry.integrity.trim() : '', packagePath });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version) || a.packagePath.localeCompare(b.packagePath));
}

export function changedLockfilePackages(current, base) {
  const known = new Set(lockfilePackages(base).map((item) => `${item.name}\u0000${item.version}\u0000${item.integrity}`));
  const changed = lockfilePackages(current).filter((item) => !known.has(`${item.name}\u0000${item.version}\u0000${item.integrity}`));
  return [...new Map(changed.map((item) => [`${item.name}@${item.version}`, item])).values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    fail(`${label} is unavailable or invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function gitFile(ref, filePath) {
  try {
    const { stdout } = await execFileAsync('git', ['show', `${ref}:${filePath}`], { maxBuffer: 32 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch {
    fail(`Base lockfile is unavailable at ${ref}:${filePath}`);
  }
}

async function gitText(ref, filePath) {
  try {
    const { stdout } = await execFileAsync('git', ['show', `${ref}:${filePath}`], { maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  } catch {
    fail(`Base file is unavailable at ${ref}:${filePath}`);
  }
}

async function boundedJson(response, label) {
  if (!response.ok) fail(`${label} returned HTTP ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_RESPONSE_BYTES) fail(`${label} response exceeds size limit`);
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) fail(`${label} response exceeds size limit`);
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} returned invalid JSON`);
  }
}

async function fetchJson(url, label, fetchImpl = fetch, headers = {}) {
  let response;
  try {
    response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    fail(`${label} is unavailable: ${error instanceof Error ? error.name : String(error)}`);
  }
  return boundedJson(response, label);
}

export async function npmRegistryMetadata(pkg, { fetchImpl = fetch } = {}) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`;
  const packument = await fetchJson(url, `npm registry metadata for ${pkg.name}`, fetchImpl, { accept: 'application/json' });
  const version = packument?.versions?.[pkg.version];
  const publishedAt = packument?.time?.[pkg.version];
  if (!version || typeof publishedAt !== 'string') fail(`npm registry has no metadata for ${pkg.name}@${pkg.version}`);
  const registryIntegrity = typeof version?.dist?.integrity === 'string' ? version.dist.integrity.trim() : '';
  const provenance = Boolean(version?.dist?.attestations?.provenance?.predicateType);
  return { publishedAt, registryIntegrity, provenance };
}

export async function npmAudit(lockfilePath) {
  const cwd = path.dirname(path.resolve(lockfilePath));
  let stdout = '';
  try {
    ({ stdout } = await execFileAsync('npm', ['audit', '--json', '--package-lock-only', '--ignore-scripts'], {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
    }));
  } catch (error) {
    // npm returns 1 when it successfully found vulnerabilities. The JSON output is still evidence.
    const captured = typeof error === 'object' && error !== null && 'stdout' in error ? error.stdout : '';
    if (typeof captured !== 'string' || !captured.trim()) {
      const stderr = typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim().replace(/\s+/g, ' ').slice(0, 300)
        : '';
      fail(`npm audit is unavailable for ${lockfilePath}${stderr ? `: ${stderr}` : ''}`);
    }
    stdout = captured;
  }
  try {
    return JSON.parse(stdout);
  } catch {
    fail(`npm audit returned invalid JSON for ${lockfilePath}`);
  }
}

async function npmAuditAtGitRef(lockfilePath, baseRef) {
  const directory = path.dirname(lockfilePath);
  const packageJsonPath = directory === '.' ? 'package.json' : `${directory}/package.json`;
  const [packageJson, lockfile] = await Promise.all([
    gitText(baseRef, packageJsonPath),
    gitText(baseRef, lockfilePath),
  ]);
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'gofer-npm-audit-'));
  try {
    await Promise.all([
      writeFile(path.join(temporaryDirectory, 'package.json'), packageJson, { encoding: 'utf8', mode: 0o600 }),
      writeFile(path.join(temporaryDirectory, 'package-lock.json'), lockfile, { encoding: 'utf8', mode: 0o600 }),
    ]);
    return await npmAudit(path.join(temporaryDirectory, 'package-lock.json'));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export function vulnerabilitiesForPackage(audit, packageName) {
  const entry = audit?.vulnerabilities?.[packageName];
  if (!entry) return [];
  const ids = new Map();
  for (const source of Array.isArray(entry.via) ? entry.via : []) {
    if (!source || typeof source !== 'object') continue;
    const id = typeof source.url === 'string' ? source.url.split('/').filter(Boolean).at(-1) : source.name;
    if (typeof id !== 'string' || !id.trim()) continue;
    const severity = typeof source.severity === 'string' ? source.severity.toLowerCase() : String(entry.severity || 'high').toLowerCase();
    ids.set(id, { id, severity, fixed: false });
  }
  if (!ids.size && typeof entry.name === 'string') {
    ids.set(`npm-audit:${entry.name}`, { id: `npm-audit:${entry.name}`, severity: String(entry.severity || 'high').toLowerCase(), fixed: false });
  }
  return [...ids.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function comparableVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function rangeMatchesVersion(range, version) {
  const actual = comparableVersion(version);
  if (!actual || typeof range !== 'string' || !range.trim()) return null;
  const alternatives = range.split('||').map((alternative) => {
    const comparators = alternative.trim().split(/\s+/).filter(Boolean);
    if (comparators.length === 1 && comparators[0] === '*') return true;
    if (comparators.length === 0) return null;
    const results = comparators.map((comparator) => {
      const match = /^(<=|>=|<|>|=)?v?(\d+\.\d+\.\d+)$/.exec(comparator);
      if (!match) return null;
      const expected = comparableVersion(match[2]);
      const comparison = compareVersions(actual, expected);
      switch (match[1] || '=') {
        case '<': return comparison < 0;
        case '<=': return comparison <= 0;
        case '>': return comparison > 0;
        case '>=': return comparison >= 0;
        default: return comparison === 0;
      }
    });
    return results.includes(null) ? null : results.every(Boolean);
  });
  if (alternatives.includes(true)) return true;
  return alternatives.includes(null) ? null : false;
}

export async function githubMalware(pkg, { fetchImpl = fetch, token = '' } = {}) {
  const query = new URLSearchParams({ ecosystem: NPM_ECOSYSTEM, type: 'malware', affects: pkg.name, per_page: '100' });
  const headers = { accept: 'application/vnd.github+json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const advisories = await fetchJson(`https://api.github.com/advisories?${query}`, `GitHub malware advisories for ${pkg.name}`, fetchImpl, headers);
  if (!Array.isArray(advisories)) fail(`GitHub malware advisories for ${pkg.name} returned an invalid response`);
  return advisories.some((advisory) => Array.isArray(advisory?.vulnerabilities) && advisory.vulnerabilities.some((item) => {
    const targetsPackage = item?.package?.ecosystem === NPM_ECOSYSTEM && item?.package?.name?.toLowerCase() === pkg.name;
    if (!targetsPackage) return false;
    // If the advisory range cannot be evaluated, block rather than treating
    // incomplete malware evidence as safe.
    const matches = rangeMatchesVersion(item.vulnerable_version_range, pkg.version);
    return matches === null ? true : matches;
  }));
}

export async function buildNpmDependencyEvidence({ lockfiles, baseRef, now = new Date().toISOString(), fetchImpl = fetch, auditLoader = npmAudit, baseAuditLoader = npmAuditAtGitRef, registryLoader = npmRegistryMetadata, malwareLoader = githubMalware, baseLoader = gitFile, lockfileReader = readJson, token = process.env.GITHUB_TOKEN || '' }) {
  if (!Array.isArray(lockfiles) || lockfiles.length === 0) fail('At least one --lockfile is required');
  if (typeof baseRef !== 'string' || !baseRef.trim()) fail('--base-ref is required');
  const grouped = new Map();
  for (const lockfilePath of [...new Set(lockfiles)].sort()) {
    const [current, base, audit, baseAudit] = await Promise.all([
      lockfileReader(lockfilePath, `Current lockfile ${lockfilePath}`),
      baseLoader(baseRef, lockfilePath),
      auditLoader(lockfilePath),
      baseAuditLoader(lockfilePath, baseRef),
    ]);
    for (const pkg of changedLockfilePackages(current, base)) {
      const key = `${pkg.name}@${pkg.version}`;
      const existing = grouped.get(key);
      grouped.set(key, existing
        ? { ...existing, lockfiles: [...existing.lockfiles, lockfilePath], audits: [...existing.audits, audit], baseAudits: [...existing.baseAudits, baseAudit] }
        : { ...pkg, lockfiles: [lockfilePath], audits: [audit], baseAudits: [baseAudit] });
    }
  }
  if (grouped.size > MAX_CHANGED_PACKAGES) fail(`Changed dependency set exceeds ${MAX_CHANGED_PACKAGES} packages`);
  const packages = [];
  for (const pkg of [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))) {
    const [registry, malware] = await Promise.all([
      registryLoader(pkg, { fetchImpl }),
      malwareLoader(pkg, { fetchImpl, token }),
    ]);
    const currentVulnerabilities = [...new Map(pkg.audits.flatMap((audit) => vulnerabilitiesForPackage(audit, pkg.name)).map((item) => [item.id, item])).values()];
    const currentIds = new Set(currentVulnerabilities.map((item) => item.id));
    const fixedVulnerabilities = pkg.baseAudits
      .flatMap((audit) => vulnerabilitiesForPackage(audit, pkg.name))
      .filter((item) => !currentIds.has(item.id))
      .map((item) => ({ ...item, fixed: true }));
    const vulnerabilities = [...new Map([...currentVulnerabilities, ...fixedVulnerabilities].map((item) => [item.id, item])).values()]
      .sort((a, b) => a.id.localeCompare(b.id));
    const integrityMatches = Boolean(pkg.integrity) && pkg.integrity === registry.registryIntegrity;
    packages.push({
      name: pkg.name,
      version: pkg.version,
      publishedAt: registry.publishedAt,
      integrity: integrityMatches ? pkg.integrity : '',
      malware: Boolean(malware),
      vulnerabilities,
      signals: registry.provenance ? [] : ['missing-provenance'],
    });
  }
  return {
    schemaVersion: EVIDENCE_SCHEMA,
    generatedAt: new Date(now).toISOString(),
    scanner: { name: 'gofer-npm-evidence-adapter', version: '1.0.0' },
    packages,
  };
}

function parseArgs(args) {
  const lockfiles = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--lockfile', '--base-ref', '--output', '--now'].includes(flag) || !args[index + 1] || args[index + 1].startsWith('--')) fail(`Invalid argument: ${flag}`);
    const value = args[++index];
    if (flag === '--lockfile') lockfiles.push(value);
    else options[flag.slice(2)] = value;
  }
  return { ...options, lockfiles };
}

export async function runCli(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const evidence = await buildNpmDependencyEvidence({ lockfiles: options.lockfiles, baseRef: options['base-ref'], now: options.now });
  const output = `${JSON.stringify(evidence, null, 2)}\n`;
  if (options.output) await writeFile(options.output, output, { encoding: 'utf8', mode: 0o600 });
  else process.stdout.write(output);
  return evidence;
}

const directRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (directRun) {
  runCli().catch((error) => {
    process.stderr.write(`Dependency evidence failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
