#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

function parseSemver(value) {
  const match = String(value).match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  );
  if (!match) throw new Error(`Invalid release version: ${value}`);
  const prerelease = match[4]?.split('.') ?? [];
  if (prerelease.some((identifier) => /^\d+$/.test(identifier) && /^0\d+/.test(identifier))) {
    throw new Error(`Invalid release version: ${value}`);
  }
  return {
    core: match.slice(1, 4).map((part) => BigInt(part)),
    prerelease,
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    const leftNumeric = /^\d+$/.test(left[index]);
    const rightNumeric = /^\d+$/.test(right[index]);
    if (leftNumeric && rightNumeric) {
      return BigInt(left[index]) < BigInt(right[index]) ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

export function compareReleaseVersions(leftValue, rightValue) {
  const left = parseSemver(leftValue);
  const right = parseSemver(rightValue);
  for (let index = 0; index < left.core.length; index++) {
    if (left.core[index] === right.core[index]) continue;
    return left.core[index] < right.core[index] ? -1 : 1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4) {
    console.error('Usage: compare-release-versions.mjs <left> <right>');
    process.exit(2);
  }
  try {
    console.log(compareReleaseVersions(process.argv[2], process.argv[3]));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
