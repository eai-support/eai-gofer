import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = path.resolve('.specify/schemas/object-type-identifier-audit-v1.schema.json');
const fixtureRoot = path.resolve('tests/fixtures/object-type-routing');

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
}

describe('Object Type identifier audit schema', () => {
  it('owns the exact finding vocabulary and privacy-safe locations', async () => {
    const schema = await readJson(schemaPath);
    const definitions = schema.$defs as Record<string, Record<string, unknown>>;
    const finding = definitions.IdentifierFinding;
    const properties = finding.properties as Record<string, Record<string, unknown>>;

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe('urn:eai:schema:object-type-identifier-audit:v1');
    expect(properties.rule.enum).toEqual([
      'OBJECT_TYPE_NAME_NON_CANONICAL',
      'OBJECT_TYPE_SLUG_MISSING',
      'OBJECT_TYPE_SLUG_NON_CANONICAL',
      'OBJECT_TYPE_SLUG_DERIVATION_MISMATCH',
      'OBJECT_TYPE_DIRECT_ROUTE_CONSTRUCTION',
      'OBJECT_TYPE_INVENTORY_INCOMPLETE',
    ]);
    expect(properties.classification.enum).toEqual([
      'blocking_source_drift',
      'report_only_persisted_legacy_drift',
      'activation_blocker',
    ]);
    expect(properties.location.oneOf as unknown[]).toHaveLength(3);
  });

  it('defines a strict complete InventoryRun with zero-write evidence', async () => {
    const schema = await readJson(schemaPath);
    const definitions = schema.$defs as Record<string, Record<string, unknown>>;
    const inventory = definitions.InventoryRun;
    const properties = inventory.properties as Record<string, Record<string, unknown>>;

    expect(inventory.additionalProperties).toBe(false);
    expect(properties.writeAttemptCount).toEqual({ type: 'integer', const: 0 });
    expect(properties.identityKind).toEqual({ const: 'USER' });
    expect(properties.digestAlgorithm).toEqual({ const: 'SHA-256/RFC8785' });
    expect(inventory.required).toEqual(
      expect.arrayContaining([
        'sourceEndpoints',
        'expectedTenantSetDigest',
        'scannedTenantSetDigest',
        'objectTypePagination',
        'findings',
        'digest',
      ])
    );
  });

  it('keeps checked fixtures privacy-safe and rejects flattened locations', async () => {
    const validFinding = await readJson(path.join(fixtureRoot, 'valid-finding.json'));
    const invalidFinding = await readJson(path.join(fixtureRoot, 'invalid-finding.json'));
    const inventory = await readJson(path.join(fixtureRoot, 'valid-inventory.json'));

    expect(validFinding.location).toMatchObject({ kind: 'persisted' });
    expect(typeof invalidFinding.location).toBe('string');
    expect(inventory).toMatchObject({
      identityKind: 'USER',
      writeAttemptCount: 0,
      sourceErrorCount: 0,
    });
    expect(JSON.stringify(inventory)).not.toMatch(/accessToken|tenantId|tenantName|hmacKey/i);
  });
});
