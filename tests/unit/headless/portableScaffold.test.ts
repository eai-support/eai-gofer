import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  GOFER_CURRENT_PORTABLE_SCAFFOLD_PATHS,
  GOFER_PORTABLE_SCAFFOLD_PATHS,
  createGoferExportBundle,
  createGoferScaffoldInventoryDigest,
  getGoferPortableScaffoldPaths,
  isPortableGoferScaffoldPath,
} from '../../../src/headless/index.js';
import { createValidExportFixture, TEST_GOFER_RELEASE_DESCRIPTOR } from './fixtures.js';

const root = process.cwd();
// Synthetic release identity: this test does not assert that a release exists.
const candidateRelease = {
  ...TEST_GOFER_RELEASE_DESCRIPTOR,
  version: '99.0.0',
  ref: 'v99.0.0',
  commitSha: 'c'.repeat(40),
  inventoryDigest: createGoferScaffoldInventoryDigest(GOFER_CURRENT_PORTABLE_SCAFFOLD_PATHS),
};
const additions = [
  '.specify/references/blocker-mediation.md',
  '.specify/references/business-updates-and-goal-checks.md',
  '.specify/references/priority-outcome-protection.md',
  '.specify/scripts/node/gofer-blocker-control.mjs',
  '.specify/scripts/node/gofer-delivery-check.mjs',
  '.specify/scripts/node/gofer-priority-check.mjs',
  '.specify/scripts/node/gofer-response-check.mjs',
  '.specify/templates/priority-plan-template.json',
];
const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function candidateRequest() {
  const fixture = createValidExportFixture();
  return {
    ...fixture,
    run: { ...fixture.run, goferRelease: candidateRelease },
    files: [
      ...GOFER_CURRENT_PORTABLE_SCAFFOLD_PATHS.map((file) => ({
        path: file,
        encoding: 'utf8' as const,
        content:
          file === '.specify/.gofer-version'
            ? `${candidateRelease.version}\n`
            : fs.readFileSync(path.join(root, file), 'utf8'),
      })),
      ...fixture.files.filter((file) => !isPortableGoferScaffoldPath(file.path)),
    ],
  };
}

describe('release-pinned portable inventories', () => {
  it('preserves the historical paths, digest and export without new requirements', () => {
    expect(getGoferPortableScaffoldPaths(TEST_GOFER_RELEASE_DESCRIPTOR)).toBe(
      GOFER_PORTABLE_SCAFFOLD_PATHS
    );
    expect(GOFER_PORTABLE_SCAFFOLD_PATHS).toHaveLength(178);
    expect(createGoferScaffoldInventoryDigest(GOFER_PORTABLE_SCAFFOLD_PATHS)).toBe(
      TEST_GOFER_RELEASE_DESCRIPTOR.inventoryDigest
    );
    const bundle = createGoferExportBundle(createValidExportFixture());
    expect(bundle.files.some((file) => additions.includes(file.path))).toBe(false);
  });

  it('selects the current pinned inventory and exports real candidate content', () => {
    expect(getGoferPortableScaffoldPaths(candidateRelease)).toBe(
      GOFER_CURRENT_PORTABLE_SCAFFOLD_PATHS
    );
    expect(GOFER_CURRENT_PORTABLE_SCAFFOLD_PATHS).toHaveLength(186);
    expect(new Set(GOFER_CURRENT_PORTABLE_SCAFFOLD_PATHS).size).toBe(186);
    expect(Object.isFrozen(GOFER_CURRENT_PORTABLE_SCAFFOLD_PATHS)).toBe(true);
    const bundle = createGoferExportBundle(candidateRequest());
    for (const file of additions) {
      expect(bundle.files.find((item) => item.path === file)?.content).toBe(
        fs.readFileSync(path.join(root, file), 'utf8')
      );
    }
    const manifest = bundle.files.find((file) => file.path === '.specify/gofer-version.json');
    expect(JSON.parse(manifest!.content).goferRelease).toEqual(candidateRelease);
  });

  it.each(additions)('rejects a candidate missing %s', (missing) => {
    const request = candidateRequest();
    request.files = request.files.filter((file) => file.path !== missing);
    expect(() => createGoferExportBundle(request)).toThrow(
      `Gofer ${candidateRelease.ref} scaffold is missing ${missing}`
    );
  });

  it('rejects an unknown inventory instead of silently choosing the current one', () => {
    expect(() =>
      getGoferPortableScaffoldPaths({ ...candidateRelease, inventoryDigest: '0'.repeat(64) })
    ).toThrow('inventory digest does not match its descriptor');
  });

  it('validates the release identity before choosing an inventory', () => {
    expect(() => getGoferPortableScaffoldPaths({ ...candidateRelease, ref: 'v98.0.0' })).toThrow(
      'goferRelease.ref must match goferRelease.version'
    );
  });

  it('does not silently add current files to an older pinned release', () => {
    const request = createValidExportFixture();
    request.files = [
      ...request.files,
      { path: additions[0], content: 'New runtime reference', encoding: 'utf8' },
    ];
    expect(() => createGoferExportBundle(request)).toThrow(
      `Gofer ${TEST_GOFER_RELEASE_DESCRIPTOR.ref} scaffold does not declare ${additions[0]}`
    );
  });

  it('runs exported audits independently and rejects missing outcome evidence', () => {
    const workspace = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-portable-priority-'))
    );
    temporaryDirectories.push(workspace);
    const bundle = createGoferExportBundle(candidateRequest());
    for (const file of bundle.files) {
      const target = path.join(workspace, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(file.content, file.encoding));
    }
    const feature = path.join(workspace, '.specify/specs/portable-priority-check');
    fs.mkdirSync(feature, { recursive: true });
    const write = (name: string, value: unknown) =>
      fs.writeFileSync(
        path.join(feature, name),
        typeof value === 'string' ? value : JSON.stringify(value)
      );
    const hash = (name: string) =>
      createHash('sha256')
        .update(fs.readFileSync(path.join(feature, name)))
        .digest('hex');
    const run = (script: string, ...args: string[]) => {
      const result = spawnSync(
        process.execPath,
        [path.join(workspace, '.specify/scripts/node', script), ...args],
        {
          cwd: workspace,
          encoding: 'utf8',
          timeout: 10_000,
          env: { ...process.env, NODE_PATH: '' },
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      return { code: result.status, body: JSON.parse(result.stdout) };
    };
    const loop = (...args: string[]) =>
      run(
        'gofer-loop-audit.mjs',
        '--feature-dir',
        feature,
        '--json',
        '--strict',
        '--no-report',
        ...args
      );
    const closed = () =>
      run(
        'gofer-closed-loop-audit.mjs',
        '--feature-dir',
        feature,
        '--json',
        '--strict',
        '--no-report',
        '--completion'
      );
    const priority = () => run('gofer-priority-check.mjs', '--feature-dir', feature, '--finish');

    write(
      'spec.md',
      '# Feature Specification: Portable review\n\n- **FR-001**: Check the local result.\n'
    );
    write('plan.md', '# Plan\n\nCheck the local result.');
    write('tasks.md', '- [x] T001 Check the local result.');
    write('decisions.md', 'D001: Check the local result.');
    write('implementation.txt', 'Controlled local implementation.');
    write('checks.txt', 'Controlled acceptance check passed.');
    write(
      'traceability.md',
      '# Traceability\n\n| Requirement ID | Goal ID | Code Evidence | Test Evidence | Task | Receipts |\n| --- | --- | --- | --- | --- | --- |\n| FR-001 | G1 | implementation.txt | checks.txt | T001 | proof.json outcome.json |'
    );
    write('goal-ledger.json', {
      schemaVersion: 1,
      goals: [{ id: 'G1', goal: 'Check the local result', trace: { requirements: ['FR-001'] } }],
    });
    const target = { environment: 'local-mvp', revision: 'controlled-test-revision' };
    write('priority-plan.json', {
      schemaVersion: 1,
      revision: 'D001',
      objective: 'Check the local result.',
      lastInstruction: { id: 'D001', text: 'Check the local result.' },
      criticalPath: ['T001'],
      tasks: { T001: { dependsOn: [], allowedEditScope: [] } },
      outcome: {
        id: 'local-result',
        statement: 'Result checked.',
        requirements: ['FR-001'],
        target,
        receipt: 'outcome.json',
      },
    });
    write('proof.json', {
      result: 'pass',
      check: 'Controlled check',
      requirements: ['FR-001'],
      specHash: hash('spec.md'),
    });
    write('evidence-map.json', { T001: { requirements: ['FR-001'], evidence: 'proof.json' } });
    write('outcome.json', {
      result: 'pass',
      outcomeId: 'local-result',
      planHash: hash('priority-plan.json'),
      specHash: hash('spec.md'),
      target,
      requirements: ['FR-001'],
      checks: [
        {
          command: 'Controlled acceptance check',
          result: 'pass',
          evidence: 'checks.txt',
          sha256: hash('checks.txt'),
        },
      ],
    });
    write(
      'loop-ledger.jsonl',
      JSON.stringify({
        timestamp: new Date().toISOString(),
        stage: '6_validate',
        iteration: 1,
        action: 'acceptance',
        result: 'pass',
        summary: 'Controlled acceptance passed.',
      }) + '\n'
    );
    write('validation-report.md', '# Validation\n\nThe controlled check passed.');
    const baseline = new Date(Date.now() - 60_000);
    for (const name of fs.readdirSync(feature))
      fs.utimesSync(path.join(feature, name), baseline, baseline);
    expect(
      run(
        'gofer-delivery-check.mjs',
        '--feature-dir',
        feature,
        '--capture',
        '--evidence-map',
        path.join(feature, 'evidence-map.json')
      ).code
    ).toBe(0);
    expect(loop('--stage', '0_gofer_start', '--init').code).toBe(0);
    expect(priority()).toMatchObject({
      code: 0,
      body: { status: 'pass', outcomeStatus: 'verified_record' },
    });
    expect(loop('--stage', '6_validate')).toMatchObject({ code: 0, body: { status: 'pass' } });
    expect(closed()).toMatchObject({ code: 0, body: { status: 'healthy' } });
    fs.unlinkSync(path.join(feature, 'outcome.json'));
    expect(priority()).toMatchObject({
      code: 1,
      body: { status: 'fail', outcomeStatus: 'unverified' },
    });
    for (const result of [loop('--stage', '6_validate'), closed()]) {
      expect(result).toMatchObject({
        code: 1,
        body: { status: 'fail', priorityReview: { outcomeStatus: 'unverified' } },
      });
      expect(result.body.priorityReview.findings).toEqual([
        expect.stringMatching(/^PRIORITY_CHECK_INVALID:/),
      ]);
    }
  });
});
