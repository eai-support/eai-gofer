import { describe, expect, it } from 'vitest';

import {
  EvidenceError,
  buildNpmDependencyEvidence,
  changedLockfilePackages,
  githubMalware,
  vulnerabilitiesForPackage,
} from '../../.specify/scripts/node/gofer-npm-dependency-evidence.mjs';
import { evaluateDependencyAdmission } from '../../.specify/scripts/node/gofer-dependency-admission.mjs';

const NOW = '2026-09-27T00:00:00.000Z';
const policy = {
  schemaVersion: 'gofer.dependency-security-policy/v1',
  policyVersion: '1.0.0',
  minimumReleaseAgeDays: 15,
  maximumEvidenceAgeHours: 24,
  maximumExceptionDays: 7,
  blockKnownMalware: true,
  blockVulnerabilitySeverities: ['high', 'critical'],
  requireExactVersion: true,
  requireIntegrity: true,
  requireScannerEvidence: true,
  reviewSignals: ['missing-provenance'],
  waivableFindings: ['release-age'],
};

const baseLock = {
  lockfileVersion: 3,
  packages: {
    '': { name: 'fixture' },
    'node_modules/old': { version: '1.0.0', integrity: 'sha512-old' },
  },
};
const changedLock = {
  lockfileVersion: 3,
  packages: {
    '': { name: 'fixture' },
    'node_modules/old': { version: '1.0.0', integrity: 'sha512-old' },
    'node_modules/direct': { version: '2.0.0', integrity: 'sha512-direct' },
    'node_modules/direct/node_modules/transitive': {
      name: 'transitive',
      version: '3.0.0',
      integrity: 'sha512-transitive',
    },
  },
};

describe('npm dependency evidence integration', () => {
  it('discovers new direct and transitive lockfile packages', () => {
    expect(
      changedLockfilePackages(changedLock, baseLock).map((item) => `${item.name}@${item.version}`)
    ).toEqual(['direct@2.0.0', 'transitive@3.0.0']);
  });

  it('builds trusted evidence that the admission engine can evaluate', async () => {
    const evidence = await buildNpmDependencyEvidence({
      lockfiles: ['package-lock.json'],
      baseRef: 'base',
      now: NOW,
      lockfileReader: async () => changedLock,
      baseLoader: async () => baseLock,
      auditLoader: async () => ({ vulnerabilities: {} }),
      baseAuditLoader: async () => ({ vulnerabilities: {} }),
      registryLoader: async (pkg: { version: string; integrity: string }) => ({
        publishedAt: '2026-09-01T00:00:00.000Z',
        registryIntegrity: pkg.integrity,
        provenance: true,
      }),
      malwareLoader: async () => false,
    });

    expect(evidence.packages.map((item) => item.name)).toEqual(['direct', 'transitive']);
    expect(evaluateDependencyAdmission({ policy, evidence, now: NOW }).decision).toBe('allow');
  });

  it('fails closed when a trusted source is unavailable', async () => {
    await expect(
      buildNpmDependencyEvidence({
        lockfiles: ['package-lock.json'],
        baseRef: 'base',
        now: NOW,
        lockfileReader: async () => changedLock,
        baseLoader: async () => baseLock,
        auditLoader: async () => ({ vulnerabilities: {} }),
        baseAuditLoader: async () => ({ vulnerabilities: {} }),
        registryLoader: async () => {
          throw new EvidenceError('registry unavailable');
        },
        malwareLoader: async () => false,
      })
    ).rejects.toThrow(/registry unavailable/);
  });

  it('blocks a package that trusted malware evidence identifies', async () => {
    const evidence = await buildNpmDependencyEvidence({
      lockfiles: ['package-lock.json'],
      baseRef: 'base',
      now: NOW,
      lockfileReader: async () => changedLock,
      baseLoader: async () => baseLock,
      auditLoader: async () => ({ vulnerabilities: {} }),
      baseAuditLoader: async () => ({ vulnerabilities: {} }),
      registryLoader: async (pkg: { integrity: string }) => ({
        publishedAt: '2026-09-01T00:00:00.000Z',
        registryIntegrity: pkg.integrity,
        provenance: true,
      }),
      malwareLoader: async (pkg: { name: string }) => pkg.name === 'transitive',
    });

    expect(evaluateDependencyAdmission({ policy, evidence, now: NOW })).toMatchObject({
      decision: 'block',
    });
  });

  it('maps npm audit severity into normalized vulnerability evidence', () => {
    expect(
      vulnerabilitiesForPackage(
        {
          vulnerabilities: {
            direct: {
              name: 'direct',
              severity: 'high',
              via: [
                {
                  source: 1,
                  name: 'CVE-2026-0001',
                  severity: 'high',
                  url: 'https://example.invalid/CVE-2026-0001',
                },
              ],
            },
          },
        },
        'direct'
      )
    ).toEqual([{ id: 'CVE-2026-0001', severity: 'high', fixed: false }]);
  });

  it('records a vulnerability as fixed only when it existed in the base lockfile audit', async () => {
    const evidence = await buildNpmDependencyEvidence({
      lockfiles: ['package-lock.json'],
      baseRef: 'base',
      now: NOW,
      lockfileReader: async () => changedLock,
      baseLoader: async () => baseLock,
      auditLoader: async () => ({ vulnerabilities: {} }),
      baseAuditLoader: async () => ({
        vulnerabilities: {
          direct: {
            name: 'direct',
            severity: 'high',
            via: [
              {
                name: 'GHSA-fixed',
                severity: 'high',
                url: 'https://github.com/advisories/GHSA-fixed',
              },
            ],
          },
        },
      }),
      registryLoader: async (pkg: { integrity: string }) => ({
        publishedAt: '2026-09-01T00:00:00.000Z',
        registryIntegrity: pkg.integrity,
        provenance: true,
      }),
      malwareLoader: async () => false,
    });

    expect(evidence.packages.find((item) => item.name === 'direct')?.vulnerabilities).toEqual([
      { id: 'GHSA-fixed', severity: 'high', fixed: true },
    ]);
  });

  it('recognises exact GitHub malware advisory matches', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          {
            vulnerabilities: [
              {
                package: { ecosystem: 'npm', name: 'malware-package' },
                vulnerable_version_range: '= 1.2.3',
              },
            ],
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    await expect(
      githubMalware({ name: 'malware-package', version: '1.2.3' }, { fetchImpl })
    ).resolves.toBe(true);
  });

  it('fails closed for malware advisory ranges it cannot evaluate', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          {
            vulnerabilities: [
              {
                package: { ecosystem: 'npm', name: 'malware-package' },
                vulnerable_version_range: '^1.2.3',
              },
            ],
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    await expect(
      githubMalware({ name: 'malware-package', version: '9.9.9' }, { fetchImpl })
    ).resolves.toBe(true);
  });
});
