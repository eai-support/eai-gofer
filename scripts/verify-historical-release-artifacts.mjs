#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { compareReleaseVersions } from './compare-release-versions.mjs';

const execFileAsync = promisify(execFile);
const releaseRoot = 'docs-site/static/releases';
const versionedArtifactPattern =
  /^docs-site\/static\/releases\/(?:eai-gofer-(?!agent-plugin-)([^/]+)\.vsix|eai-gofer-agent-plugin-([^/]+)\.zip)$/;

function parseArgs(argv) {
  const versionIndex = argv.indexOf('--version');
  const baseIndex = argv.indexOf('--base');
  const rootIndex = argv.indexOf('--root');
  const version = versionIndex === -1 ? undefined : argv[versionIndex + 1];
  const base = baseIndex === -1 ? undefined : argv[baseIndex + 1];
  const root = rootIndex === -1 ? process.cwd() : argv[rootIndex + 1];
  const strictPrior = argv.includes('--strict-prior');
  if (!version || version.startsWith('-')) throw new Error('Missing value for --version.');
  if (baseIndex !== -1 && (!base || base.startsWith('-'))) {
    throw new Error('Missing value for --base.');
  }
  if (!root || root.startsWith('-')) throw new Error('Missing value for --root.');
  // Validate the target before using it as an allow-listed filename version.
  compareReleaseVersions(version, version);
  if (strictPrior && base) {
    throw new Error('--strict-prior cannot be combined with an explicit --base.');
  }
  return { version, base, root: path.resolve(root), strictPrior };
}

function artifactVersion(relativePath) {
  const match = relativePath.match(versionedArtifactPattern);
  const version = match?.[1] ?? match?.[2];
  if (!version) return undefined;
  try {
    compareReleaseVersions(version, version);
    return version;
  } catch {
    // Mutable aliases such as `latest` are deliberately outside the immutable
    // numbered-artifact set.
    return undefined;
  }
}

async function git(root, args, options = {}) {
  return execFileAsync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

async function resolvePreviousTag(root, targetVersion, includeTarget) {
  const { stdout } = await git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/tags/v*']);
  let selected;
  for (const tag of stdout.split(/\r?\n/).filter(Boolean)) {
    const version = tag.startsWith('v') ? tag.slice(1) : '';
    let relative;
    try {
      relative = compareReleaseVersions(version, targetVersion);
    } catch {
      throw new Error(`Malformed release tag prevents history verification: ${tag}.`);
    }
    // Ordinary CI can use the exact existing release tag as a baseline. A
    // first-publication tag workflow must explicitly request the strict prior
    // tag so the newly created tag cannot self-validate modified old assets.
    if (relative === 0) {
      if (includeTarget) return tag;
      continue;
    }
    if (relative > 0) continue;
    if (!selected || compareReleaseVersions(version, selected.slice(1)) > 0) selected = tag;
  }
  return selected;
}

async function readBaseArtifacts(root, base) {
  const { stdout } = await git(root, ['ls-tree', '-r', '-z', base, '--', releaseRoot], {
    encoding: 'buffer',
  });
  const artifacts = new Map();
  for (const record of stdout.toString('utf8').split('\0').filter(Boolean)) {
    const separator = record.indexOf('\t');
    const metadata = record.slice(0, separator).split(' ');
    const relativePath = record.slice(separator + 1);
    if (!artifactVersion(relativePath)) continue;
    const [mode, type, oid] = metadata;
    if (!/^100(?:644|755)$/.test(mode) || type !== 'blob' || !/^[0-9a-f]{40,64}$/.test(oid)) {
      throw new Error(`Historical release artifact is not a regular Git blob: ${relativePath}.`);
    }
    artifacts.set(relativePath, oid);
  }
  return artifacts;
}

async function readCurrentArtifacts(root) {
  const absoluteRoot = path.join(root, releaseRoot);
  const entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  const artifacts = new Set();
  for (const entry of entries) {
    const relativePath = `${releaseRoot}/${entry.name}`;
    if (artifactVersion(relativePath)) artifacts.add(relativePath);
  }
  return artifacts;
}

async function assertRegularCurrentArtifact(root, relativePath) {
  let stats;
  try {
    stats = await fs.lstat(path.join(root, relativePath));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Historical release artifact was deleted: ${relativePath}.`);
    }
    throw error;
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(
      `Historical release artifact must remain a regular non-symlink file: ${relativePath}.`
    );
  }
}

async function main() {
  const {
    version: targetVersion,
    base: requestedBase,
    root,
    strictPrior,
  } = parseArgs(process.argv.slice(2));
  const base = requestedBase ?? (await resolvePreviousTag(root, targetVersion, !strictPrior));
  if (!base) {
    const currentArtifacts = await readCurrentArtifacts(root);
    const unexpected = [...currentArtifacts].filter(
      (relativePath) => artifactVersion(relativePath) !== targetVersion
    );
    if (unexpected.length > 0) {
      throw new Error(
        `No previous release tag exists, but historical artifacts are present: ${unexpected.join(', ')}.`
      );
    }
    console.log(
      `Historical release artifact integrity passed for first release v${targetVersion}.`
    );
    return;
  }

  await git(root, ['rev-parse', '--verify', `${base}^{commit}`]);
  try {
    await git(root, ['merge-base', '--is-ancestor', `${base}^{commit}`, 'HEAD']);
  } catch {
    throw new Error(`Historical release base ${base} is not an ancestor of HEAD.`);
  }

  const [baseArtifacts, currentArtifacts] = await Promise.all([
    readBaseArtifacts(root, base),
    readCurrentArtifacts(root),
  ]);
  for (const [relativePath, expectedOid] of baseArtifacts) {
    await assertRegularCurrentArtifact(root, relativePath);
    const { stdout: actualOid } = await git(root, ['hash-object', '--no-filters', relativePath]);
    if (actualOid.trim() !== expectedOid) {
      throw new Error(`Historical release artifact was modified: ${relativePath}.`);
    }
  }

  const unexpected = [...currentArtifacts].filter(
    (relativePath) =>
      !baseArtifacts.has(relativePath) && artifactVersion(relativePath) !== targetVersion
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Only v${targetVersion} artifacts may be added after ${base}; found: ${unexpected.join(', ')}.`
    );
  }
  console.log(`Historical release artifacts are immutable relative to ${base}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
