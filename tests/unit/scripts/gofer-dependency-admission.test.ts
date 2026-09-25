import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  AdmissionInputError,
  evaluateDependencyAdmission,
} from '../../../.specify/scripts/node/gofer-dependency-admission.mjs';

const execFileAsync = promisify(execFile);
const NOW = '2026-09-25T00:00:00.000Z';

const policy = {
  schemaVersion: 'gofer.dependency-security-policy/v1',
  policyVersion: '1.0.0',
  minimumReleaseAgeDays: 15,
  maximumExceptionDays: 7,
  blockKnownMalware: true,
  blockVulnerabilitySeverities: ['high', 'critical'],
  requireExactVersion: true,
  requireIntegrity: true,
  requireScannerEvidence: true,
  reviewSignals: [
    'install-scripts',
    'native-code',
    'binary-artifact',
    'maintainer-change',
    'missing-provenance',
  ],
  waivableFindings: ['release-age'],
};

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'gofer.dependency-evidence/v1',
    generatedAt: NOW,
    scanner: { name: 'test-scanner', version: '1.0.0' },
    packages: [
      {
        name: 'safe-package',
        version: '1.2.3',
        publishedAt: '2026-09-01T00:00:00.000Z',
        integrity: 'sha512-safe',
        malware: false,
        vulnerabilities: [],
        signals: [],
        ...overrides,
      },
    ],
  };
}

function urgentException(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'gofer.dependency-exceptions/v1',
    exceptions: [
      {
        id: 'SEC-2026-001',
        type: 'urgent-security-fix',
        package: 'safe-package',
        version: '1.2.3',
        owner: 'security@example.com',
        reason: 'Moves the application away from CVE-2026-0001.',
        evidence: 'https://example.invalid/CVE-2026-0001',
        vulnerabilityIds: ['CVE-2026-0001'],
        createdAt: '2026-09-24T00:00:00.000Z',
        expiresAt: '2026-10-01T00:00:00.000Z',
        ...overrides,
      },
    ],
  };
}

describe('dependency admission', () => {
  it('allows safe evidence older than the minimum release age', () => {
    const report = evaluateDependencyAdmission({ policy, evidence: evidence(), now: NOW });

    expect(report.decision).toBe('allow');
    expect(report.packages[0].findings).toEqual([]);
  });

  it('blocks a release younger than 15 complete days', () => {
    const report = evaluateDependencyAdmission({
      policy,
      evidence: evidence({ publishedAt: '2026-09-11T00:00:01.000Z' }),
      now: NOW,
    });

    expect(report.decision).toBe('block');
    expect(report.packages[0].findings).toContainEqual(
      expect.objectContaining({ code: 'release-age', blocking: true })
    );
  });

  it.each([
    ['malware', { malware: true }, 'known-malware'],
    ['missing integrity', { integrity: '' }, 'missing-integrity'],
    [
      'an unresolved high vulnerability',
      { vulnerabilities: [{ id: 'CVE-2026-0002', severity: 'high', fixed: false }] },
      'blocking-vulnerability',
    ],
  ])('blocks %s', (_label, overrides, findingCode) => {
    const report = evaluateDependencyAdmission({
      policy,
      evidence: evidence(overrides),
      now: NOW,
    });

    expect(report.decision).toBe('block');
    expect(report.packages[0].findings).toContainEqual(
      expect.objectContaining({ code: findingCode, blocking: true })
    );
  });

  it('marks configured risk signals for review without blocking', () => {
    const report = evaluateDependencyAdmission({
      policy,
      evidence: evidence({ signals: ['native-code', 'missing-provenance'] }),
      now: NOW,
    });

    expect(report.decision).toBe('review');
    expect(report.packages[0].findings.map((finding) => finding.code)).toEqual([
      'risk-signal:missing-provenance',
      'risk-signal:native-code',
    ]);
  });

  it('rejects duplicate package identities and non-exact versions', () => {
    const duplicate = evidence();
    duplicate.packages.push({ ...duplicate.packages[0] });

    expect(() => evaluateDependencyAdmission({ policy, evidence: duplicate, now: NOW })).toThrow(
      AdmissionInputError
    );
    expect(() =>
      evaluateDependencyAdmission({
        policy,
        evidence: evidence({ version: '^1.2.3' }),
        now: NOW,
      })
    ).toThrow(/exact version/i);
  });

  it('allows a young fixed version through a valid urgent security exception', () => {
    const report = evaluateDependencyAdmission({
      policy,
      evidence: evidence({
        publishedAt: '2026-09-24T00:00:00.000Z',
        vulnerabilities: [{ id: 'CVE-2026-0001', severity: 'critical', fixed: true }],
      }),
      exceptions: urgentException(),
      now: NOW,
    });

    expect(report.decision).toBe('allow');
    expect(report.packages[0].appliedExceptions).toEqual(['SEC-2026-001']);
    expect(report.packages[0].findings).toContainEqual(
      expect.objectContaining({ code: 'release-age', blocking: false, waived: true })
    );
  });

  it.each([
    ['expired', { expiresAt: '2026-09-24T23:59:59.000Z' }],
    ['overlong', { expiresAt: '2026-10-02T00:00:01.000Z' }],
    ['wrong version', { version: '1.2.4' }],
    ['missing owner', { owner: '' }],
    ['missing vulnerability', { vulnerabilityIds: ['CVE-2026-9999'] }],
  ])('does not apply an %s exception', (_label, overrides) => {
    const report = evaluateDependencyAdmission({
      policy,
      evidence: evidence({
        publishedAt: '2026-09-24T00:00:00.000Z',
        vulnerabilities: [{ id: 'CVE-2026-0001', severity: 'critical', fixed: true }],
      }),
      exceptions: urgentException(overrides),
      now: NOW,
    });

    expect(report.decision).toBe('block');
    expect(report.packages[0].appliedExceptions).toEqual([]);
  });

  it('never lets an age exception bypass malware or integrity blocks', () => {
    for (const overrides of [{ malware: true }, { integrity: '' }]) {
      const report = evaluateDependencyAdmission({
        policy,
        evidence: evidence({
          publishedAt: '2026-09-24T00:00:00.000Z',
          vulnerabilities: [{ id: 'CVE-2026-0001', severity: 'critical', fixed: true }],
          ...overrides,
        }),
        exceptions: urgentException(),
        now: NOW,
      });

      expect(report.decision).toBe('block');
      expect(report.packages[0].appliedExceptions).toEqual(['SEC-2026-001']);
      expect(report.packages[0].findings.some((finding) => finding.blocking)).toBe(true);
    }
  });

  it('returns exit code 1 and writes a deterministic blocking report', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gofer-admission-'));
    const inputPath = path.join(directory, 'input.json');
    const policyPath = path.join(directory, 'policy.json');
    const outputPath = path.join(directory, 'report.json');
    await writeFile(inputPath, JSON.stringify(evidence({ malware: true })));
    await writeFile(policyPath, JSON.stringify(policy));

    let exitCode = 0;
    try {
      await execFileAsync(process.execPath, [
        '.specify/scripts/node/gofer-dependency-admission.mjs',
        '--input',
        inputPath,
        '--policy',
        policyPath,
        '--output',
        outputPath,
        '--now',
        NOW,
      ]);
    } catch (error) {
      exitCode = (error as { code?: number }).code ?? -1;
    }

    expect(exitCode).toBe(1);
    expect(JSON.parse(await readFile(outputPath, 'utf8'))).toMatchObject({
      schemaVersion: 'gofer.dependency-admission-report/v1',
      evaluatedAt: NOW,
      decision: 'block',
    });
  });
});
