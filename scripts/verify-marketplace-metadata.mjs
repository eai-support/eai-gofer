#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [metadataPath, expectedVersion, expectedVsixPath] = process.argv.slice(2);
if (!metadataPath || !expectedVersion || !expectedVsixPath) {
  throw new Error(
    'Usage: verify-marketplace-metadata.mjs <vsce-show.json> <version> <expected.vsix>'
  );
}

const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const matchingVersions = (metadata.versions ?? []).filter(
  (candidate) => candidate.version === expectedVersion
);
if (matchingVersions.length !== 1) {
  throw new Error('Marketplace metadata must contain exactly one v' + expectedVersion + ' entry.');
}
const hashProperties = (matchingVersions[0].properties ?? []).filter(
  (property) => property.key === 'Microsoft.VisualStudio.Services.VsixSha256'
);
if (hashProperties.length !== 1 || !/^[a-f0-9]{64}$/i.test(String(hashProperties[0].value ?? ''))) {
  throw new Error(
    'Marketplace v' + expectedVersion + ' is missing one valid VSIX SHA-256 property.'
  );
}
const expectedHash = createHash('sha256')
  .update(await readFile(expectedVsixPath))
  .digest('hex');
const marketplaceHash = hashProperties[0].value.toLowerCase();
if (marketplaceHash !== expectedHash) {
  throw new Error(
    'Marketplace v' +
      expectedVersion +
      ' VSIX SHA-256 ' +
      marketplaceHash +
      ' does not match committed ' +
      expectedHash +
      '.'
  );
}
console.log('Marketplace v' + expectedVersion + ' SHA-256 matches the committed VSIX.');
