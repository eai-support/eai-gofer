import { describe, expect, it } from 'vitest';

import {
  APP_CAPABILITY_SCHEMA_VERSION,
  evaluateMarketplaceReadiness,
  validateApplicationPackage,
} from '../../.specify/scripts/node/validate-application-package.mjs';

describe('Gofer application package validator', () => {
  it('composes the existing app capability authority', () => {
    expect(APP_CAPABILITY_SCHEMA_VERSION).toBe('eai.app_capabilities.v1');
    expect(validateApplicationPackage(validPackage())).toEqual([]);
  });

  it.each([
    [
      'wildcard capability',
      {
        capabilities: {
          contractVersion: APP_CAPABILITY_SCHEMA_VERSION,
          interactive: ['*'],
          workload: [],
        },
      },
      'APP_MARKETPLACE_CAPABILITY_WILDCARD',
    ],
    ['secret field', { clientSecret: 'unsafe' }, 'APP_MARKETPLACE_SECRET_FORBIDDEN'],
    [
      'raw provider route',
      {
        routes: [
          {
            id: 'raw.provider',
            path: 'https://account.documents.azure.com/dbs/x',
            methods: ['GET'],
          },
        ],
      },
      'APP_MARKETPLACE_DIRECT_PROVIDER_ROUTE',
    ],
    [
      'mutable artifact',
      {
        artifact: { repository: 'registry.example/app:latest', digest: `sha256:${'a'.repeat(64)}` },
      },
      'APP_MARKETPLACE_IMMUTABLE_ARTIFACT_REQUIRED',
    ],
  ])('rejects %s', (_name, change, ruleId) => {
    const candidate = deepMerge(validPackage(), change);
    expect(validateApplicationPackage(candidate)).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId })])
    );
  });

  it('never calls a locally valid package marketplace ready without approval and install evidence', () => {
    expect(evaluateMarketplaceReadiness(validPackage(), {})).toEqual({
      ready: false,
      status: 'prepared-only',
      missing: ['approvedListing', 'installedApp'],
    });
    expect(
      evaluateMarketplaceReadiness(validPackage(), {
        approvedListing: { listingId: 'listing-1', packageDigest: `sha256:${'b'.repeat(64)}` },
        installedApp: { installationId: 'install-1', status: 'READY' },
      })
    ).toEqual({ ready: true, status: 'installed', missing: [] });
  });
});

function validPackage(): Record<string, unknown> {
  return {
    schemaVersion: 'eai.application-package.v1',
    packageId: 'testing-studio',
    appKey: 'testing-studio',
    displayName: 'Testing Studio',
    version: '1.0.0',
    publisher: { id: 'example-partner', kind: 'partner', displayName: 'Example Partner' },
    distribution: { visibility: 'distributable' },
    source: {
      repository: 'https://github.com/example/testing-studio',
      digest: `sha256:${'b'.repeat(64)}`,
    },
    artifact: {
      repository: 'registry.example/testing-studio',
      digest: `sha256:${'a'.repeat(64)}`,
      provenanceRef: 'evidence/provenance.json',
      signatureRef: 'evidence/signature.json',
      sbomRef: 'evidence/sbom.spdx.json',
    },
    manifestDigest: `sha256:${'c'.repeat(64)}`,
    runtime: { type: 'isolated-hosted', topology: 'buyer-hosted', healthPath: '/health' },
    routes: [{ id: 'testing.home', path: '/testing', methods: ['GET'] }],
    objectTypes: [{ name: 'TestRun', slug: 'test-run', manifestRef: 'object-types/test-run.json' }],
    services: [{ id: 'curate', minimumContractVersion: 'v4' }],
    capabilities: {
      contractVersion: APP_CAPABILITY_SCHEMA_VERSION,
      interactive: ['resource.read'],
      workload: [],
    },
    dataGovernance: {
      purposes: ['Application quality assurance'],
      classifications: ['internal'],
      residency: ['AU'],
      retentionDays: 30,
      export: 'none',
      deletionPolicyRef: 'legal/deletion.md',
    },
    callbacks: [],
    commercial: { model: 'manual-pilot', termsRef: 'legal/terms.md' },
    support: {
      owner: 'Example Partner Support',
      runbookRef: 'support/runbook.md',
      slaRef: 'support/sla.md',
    },
    compatibility: { platformContract: 'eai.app-marketplace/v1', minimumTemplateVersion: '1.0.0' },
    lifecycle: {
      installRef: 'lifecycle/install.json',
      updateRef: 'lifecycle/update.json',
      uninstallRef: 'lifecycle/uninstall.json',
      migrationRef: 'lifecycle/migrate.json',
      rollbackRef: 'lifecycle/rollback.json',
    },
    evidence: {
      ciRef: 'evidence/ci.json',
      securityRef: 'evidence/security.json',
      tenantIsolationRef: 'evidence/tenant-isolation.json',
      accessibilityRef: 'evidence/accessibility.json',
    },
  };
}

function deepMerge(
  left: Record<string, unknown>,
  right: Record<string, unknown>
): Record<string, unknown> {
  const output = structuredClone(left);
  for (const [key, value] of Object.entries(right)) {
    if (isRecord(value) && isRecord(output[key]))
      output[key] = deepMerge(output[key] as Record<string, unknown>, value);
    else output[key] = value;
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
