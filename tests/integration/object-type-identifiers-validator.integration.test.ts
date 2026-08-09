import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  deriveObjectTypeSlugV1,
  loadIdentifierValidationContract,
  sortIdentifierFindings,
  validateInventoryReport,
  validateSourceManifest,
} from '../../.specify/scripts/node/validate-object-type-identifiers.mjs';

const script = path.resolve('.specify/scripts/node/validate-object-type-identifiers.mjs');
const contractPath = path.resolve('.specify/contracts/object-type-routing-v1.json');
const schemaPath = path.resolve('.specify/schemas/object-type-identifier-audit-v1.schema.json');
const configPath = path.resolve('.specify/config/object-type-routing.json');
const fixtureRoot = path.resolve('tests/fixtures/object-type-routing');
const temporaryRoots: string[] = [];

const orderedVectors = [
  { input: 'FeedItem', output: 'feed-item', manifestNameValid: true },
  { input: 'APIKey', output: 'api-key', manifestNameValid: true },
  { input: 'HTTPFeedItem', output: 'http-feed-item', manifestNameValid: true },
  { input: 'V2FeedItem', output: 'v2-feed-item', manifestNameValid: true },
  { input: 'GitHubConnection', output: 'git-hub-connection', manifestNameValid: true },
  { input: 'Sent_Post', output: 'sent-post', manifestNameValid: false },
  { input: '  Feed  Item  ', output: 'feed-item', manifestNameValid: false },
  { input: 'Draft--Item', output: 'draft-item', manifestNameValid: false },
  { input: 'operations', output: 'operations', manifestNameValid: false },
  { input: '', output: '', manifestNameValid: false },
  { input: '---', output: '', manifestNameValid: false },
] as const;

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
}

async function fixtureInventory(): Promise<Record<string, unknown>> {
  return readJson(path.join(fixtureRoot, 'valid-inventory.json'));
}

async function runCli(inputKind: '--manifest' | '--inventory', value: unknown) {
  const root = await mkdtemp(path.join(tmpdir(), 'object-type-identifiers-'));
  temporaryRoots.push(root);
  const input = path.join(root, 'input.json');
  await writeFile(input, `${JSON.stringify(value, null, 2)}\n`);
  const before = await readFile(input, 'utf8');
  const result = spawnSync(
    process.execPath,
    [
      script,
      inputKind,
      input,
      '--contract',
      contractPath,
      '--schema',
      schemaPath,
      '--config',
      configPath,
      '--json',
    ],
    { encoding: 'utf8' }
  );
  expect(await readFile(input, 'utf8')).toBe(before);
  return result;
}

describe('Object Type identifier validator', () => {
  it('adapts the exact eleven ordered canonical corpus vectors', async () => {
    const contract = await loadIdentifierValidationContract({
      contractPath,
      schemaPath,
      configPath,
    });

    expect(contract.vectors).toEqual(orderedVectors);
    expect(contract.vectors).toHaveLength(11);
    expect(
      contract.vectors.map(({ input, manifestNameValid }) => ({
        input,
        output: deriveObjectTypeSlugV1(input),
        manifestNameValid: contract.namePattern.test(input) && manifestNameValid,
      }))
    ).toEqual(orderedVectors);
  });

  it('accepts a valid source manifest', async () => {
    const contract = await loadIdentifierValidationContract({
      contractPath,
      schemaPath,
      configPath,
    });
    expect(validateSourceManifest({ name: 'FeedItem', slug: 'feed-item' }, contract)).toEqual([]);

    const result = await runCli('--manifest', { name: 'FeedItem', slug: 'feed-item' });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 'eai.object-type-routing.validation/v1',
      contractVersion: 'eai.object-type-routing/v1',
      inputKind: 'source_manifest',
      status: 'valid',
      exitCode: 0,
      findings: [],
    });
  });

  it.each([
    [
      'invalid name',
      { name: 'sent_item', slug: 'sent-item' },
      'OBJECT_TYPE_NAME_NON_CANONICAL',
      'name',
    ],
    ['missing slug', { name: 'FeedItem' }, 'OBJECT_TYPE_SLUG_MISSING', 'slug'],
    [
      'malformed slug',
      { name: 'FeedItem', slug: 'FeedItem' },
      'OBJECT_TYPE_SLUG_NON_CANONICAL',
      'slug',
    ],
    [
      'reserved slug',
      { name: 'Operations', slug: 'operations' },
      'OBJECT_TYPE_SLUG_NON_CANONICAL',
      'slug',
    ],
    [
      'derivation mismatch',
      { name: 'FeedItem', slug: 'feeditem' },
      'OBJECT_TYPE_SLUG_DERIVATION_MISMATCH',
      'slug',
    ],
  ])('classifies %s as blocking source drift', async (_label, manifest, rule, field) => {
    const contract = await loadIdentifierValidationContract({
      contractPath,
      schemaPath,
      configPath,
    });
    expect(validateSourceManifest(manifest, contract)).toEqual([
      expect.objectContaining({
        contractVersion: 'eai.object-type-routing/v1',
        rule,
        classification: 'blocking_source_drift',
        severity: 'error',
        field,
      }),
    ]);
  });

  it('keeps a canonical persisted derivation mismatch report-only and privacy-safe', async () => {
    const inventory = await fixtureInventory();
    const finding = await readJson(path.join(fixtureRoot, 'valid-finding.json'));
    inventory.findings = [finding];
    inventory.findingsSummary = {
      blocking_source_drift: 0,
      report_only_persisted_legacy_drift: 1,
      activation_blocker: 0,
    };
    const contract = await loadIdentifierValidationContract({
      contractPath,
      schemaPath,
      configPath,
    });

    const validation = validateInventoryReport(inventory, contract);
    expect(validation).toMatchObject({ complete: true, exitCode: 0, errors: [] });
    expect(validation.findings).toEqual([
      expect.objectContaining({
        rule: 'OBJECT_TYPE_SLUG_DERIVATION_MISMATCH',
        classification: 'report_only_persisted_legacy_drift',
        severity: 'warning',
        location: {
          kind: 'persisted',
          tenantRef: 'hmac-sha256:tenant-ref',
          recordRef: 'hmac-sha256:record-ref',
        },
      }),
    ]);
    expect(JSON.stringify(validation)).not.toMatch(/tenantId|tenantName|accessToken|hmacKey/i);

    const rawReferenceInventory = structuredClone(inventory);
    (
      rawReferenceInventory.findings as Array<{ location: { tenantRef: string } }>
    )[0].location.tenantRef = 'tenant-raw-id';
    const rejected = validateInventoryReport(rawReferenceInventory, contract);
    expect(rejected).toMatchObject({ exitCode: 4, findings: [] });
    expect(JSON.stringify(rejected)).not.toContain('tenant-raw-id');
  });

  it('classifies malformed and reserved persisted slugs as activation blockers', async () => {
    const inventory = await fixtureInventory();
    inventory.findings = [
      {
        contractVersion: 'eai.object-type-routing/v1',
        rule: 'OBJECT_TYPE_SLUG_NON_CANONICAL',
        classification: 'activation_blocker',
        severity: 'error',
        location: {
          kind: 'persisted',
          tenantRef: 'hmac-sha256:tenant-ref',
          recordRef: 'hmac-sha256:record-ref',
        },
        field: 'slug',
        offendingValue: 'operations',
        expectedValue: {
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          reserved: ['operations', 'query', 'search', 'storage'],
        },
        remediation:
          'Use a separately approved tenant-scoped migration; do not rewrite stored identifiers during validation.',
      },
    ];
    inventory.findingsSummary = {
      blocking_source_drift: 0,
      report_only_persisted_legacy_drift: 0,
      activation_blocker: 1,
    };
    const result = await runCli('--inventory', inventory);

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      inputKind: 'inventory',
      status: 'blocked',
      exitCode: 2,
      findings: [
        {
          rule: 'OBJECT_TYPE_SLUG_NON_CANONICAL',
          classification: 'activation_blocker',
        },
      ],
    });
  });

  it('sorts findings by classification, canonical location, rule, and field', () => {
    const finding = (classification: string, file: string, rule: string, field: string | null) => ({
      contractVersion: 'eai.object-type-routing/v1',
      rule,
      classification,
      severity: classification === 'report_only_persisted_legacy_drift' ? 'warning' : 'error',
      location: { kind: 'source', file, line: 1 },
      field,
      offendingValue: 'value',
      remediation: 'Repair the source definition.',
    });
    const findings = [
      finding(
        'report_only_persisted_legacy_drift',
        'a.json',
        'OBJECT_TYPE_SLUG_DERIVATION_MISMATCH',
        'slug'
      ),
      finding('blocking_source_drift', 'b.json', 'OBJECT_TYPE_SLUG_MISSING', 'slug'),
      finding('activation_blocker', 'z.json', 'OBJECT_TYPE_INVENTORY_INCOMPLETE', null),
      finding('blocking_source_drift', 'a.json', 'OBJECT_TYPE_NAME_NON_CANONICAL', 'name'),
    ];

    expect(
      sortIdentifierFindings(findings).map(({ classification, location, rule, field }) => ({
        classification,
        file: (location as { file: string }).file,
        rule,
        field,
      }))
    ).toEqual([
      {
        classification: 'activation_blocker',
        file: 'z.json',
        rule: 'OBJECT_TYPE_INVENTORY_INCOMPLETE',
        field: null,
      },
      {
        classification: 'blocking_source_drift',
        file: 'a.json',
        rule: 'OBJECT_TYPE_NAME_NON_CANONICAL',
        field: 'name',
      },
      {
        classification: 'blocking_source_drift',
        file: 'b.json',
        rule: 'OBJECT_TYPE_SLUG_MISSING',
        field: 'slug',
      },
      {
        classification: 'report_only_persisted_legacy_drift',
        file: 'a.json',
        rule: 'OBJECT_TYPE_SLUG_DERIVATION_MISMATCH',
        field: 'slug',
      },
    ]);
  });

  it('uses exact exit codes for blocking source, incomplete inventory, and malformed input', async () => {
    const blocked = await runCli('--manifest', { name: 'FeedItem', slug: 'feeditem' });
    expect(blocked.status).toBe(2);

    const incompleteInventory = await fixtureInventory();
    incompleteInventory.status = 'incomplete';
    incompleteInventory.roleVisibilityComplete = false;
    const incomplete = await runCli('--inventory', incompleteInventory);
    expect(incomplete.status).toBe(3);
    expect(JSON.parse(incomplete.stdout)).toMatchObject({ status: 'incomplete', exitCode: 3 });

    const malformed = await runCli('--inventory', { status: 'complete' });
    expect(malformed.status).toBe(4);
    expect(JSON.parse(malformed.stdout)).toMatchObject({ status: 'malformed', exitCode: 4 });
  });

  it('is deterministic and contains no login, network, or write implementation', async () => {
    const manifest = { name: 'FeedItem', slug: 'feeditem' };
    const root = await mkdtemp(path.join(tmpdir(), 'object-type-identifiers-determinism-'));
    temporaryRoots.push(root);
    const input = path.join(root, 'input.json');
    await writeFile(input, `${JSON.stringify(manifest, null, 2)}\n`);
    const args = [
      script,
      '--manifest',
      input,
      '--contract',
      contractPath,
      '--schema',
      schemaPath,
      '--config',
      configPath,
      '--json',
    ];
    const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
    const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
    expect(second.stdout).toBe(first.stdout);

    const implementation = await readFile(script, 'utf8');
    expect(implementation).not.toMatch(
      /\bfetch\s*\(|node:https|node:http|eai\s+login|\bwriteFile\b|\bappendFile\b/
    );
  });
});
