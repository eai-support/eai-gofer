import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
// Persisted commands must survive a later change to template defaults.
const savedEvaluations = [
  'node .specify/scripts/node/gofer-loop-audit.mjs --feature-dir {FEATURE_DIR} --stage 5_implement --json --strict',
  'node .specify/scripts/node/gofer-closed-loop-audit.mjs --feature-dir {FEATURE_DIR} --json --strict --completion',
];
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
let dir: string;
let feature: string;
let runtime: string;
const write = (file: string, value: unknown) =>
  writeFileSync(
    path.join(feature, file),
    typeof value === 'string' ? value : JSON.stringify(value)
  );
const snapshot = () =>
  Object.fromEntries(
    readdirSync(feature)
      .sort()
      .map((file) => [file, readFileSync(path.join(feature, file)).toString('base64')])
  );

beforeEach(() => {
  dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'gofer-forward-recovery-')));
  feature = path.join(dir, 'existing feature');
  runtime = path.join(dir, 'retained-runtime');
  mkdirSync(feature);
  const scripts = path.join(runtime, '.specify/scripts/node');
  mkdirSync(scripts, { recursive: true });
  for (const name of [
    'gofer-blocker-control',
    'gofer-loop-audit',
    'gofer-closed-loop-audit',
    'gofer-priority-check',
    'gofer-delivery-check',
  ]) {
    copyFileSync(
      path.join(root, '.specify/scripts/node', `${name}.mjs`),
      path.join(scripts, `${name}.mjs`)
    );
  }
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function savedBlocker(modern: boolean, resolved: boolean) {
  const id = hash(JSON.stringify(['g1', 'session', 'expired']));
  write('diagnostic-output.txt', 'Previously recorded expired session.');
  write('diagnosis.json', {
    blockerId: id,
    kind: 'diagnosis',
    checkedAt: '2026-01-01T00:00:00Z',
    classification: 'credential',
    source: 'fixture:diagnosis',
    command: 'read session',
    observed: 'Session expired.',
    evidence: 'diagnostic-output.txt',
    sha256: hash(readFileSync(path.join(feature, 'diagnostic-output.txt'))),
    selfCauseChecked: true,
    selfCauseCheck: 'Correct route and profile.',
    authorizedRepairAvailable: false,
    authorityCheck: 'User sign-in required.',
    noSafeAlternativeReason: 'Cannot bypass authentication.',
  });
  for (const kind of ['change', 'resolution']) {
    write(`${kind}.json`, {
      blockerId: id,
      kind,
      result: kind === 'change' ? 'changed' : 'pass',
      source: `fixture:${kind}`,
      summary: 'Previously verified fixture state.',
    });
  }
  const kinds = [...(modern ? ['diagnosis'] : []), ...(resolved ? ['change', 'resolution'] : [])];
  write('blocker-register.json', {
    schemaVersion: 1,
    blockers: {
      [id]: {
        goalKey: 'g1',
        subjectKey: 'session',
        conditionKey: 'expired',
        category: modern ? 'access' : 'decision',
        owner: 'user',
        question: 'Restore access?',
        requiredChange: 'Session restored.',
        tasks: ['T001'],
        ...(modern ? { needsDiagnosis: true } : {}),
        state: resolved ? 'resolved' : 'waiting',
        asked: true,
        epoch: resolved ? 1 : 0,
        attempts: resolved
          ? [{ id: 'saved-attempt', approach: 'verify-session', epoch: 1, result: 'progress' }]
          : [],
        history: [
          { at: '2026-01-01T00:00:00Z', action: 'ask', allowed: true, decision: 'ask_once' },
        ],
        proofs: kinds.map((kind) => ({
          kind,
          file: `${kind}.json`,
          source: `fixture:${kind}`,
          hash: hash(readFileSync(path.join(feature, `${kind}.json`))),
        })),
      },
    },
  });
}

function inspect() {
  return spawnSync(
    process.execPath,
    [path.join(runtime, '.specify/scripts/node/gofer-blocker-control.mjs'), '--state-dir', feature],
    { cwd: runtime, encoding: 'utf8', timeout: 10000 }
  );
}

function savedFeature() {
  write('spec.md', '# Existing feature\nFR-001: Preserve the saved result.');
  write('plan.md', '# Existing plan\nPreserve the saved result.');
  write('tasks.md', '- [x] T001 Verify the saved result.');
  write('decisions.md', 'D001: Preserve the saved result.');
  write('traceability.md', '| FR-001 | T001 | outcome.json |');
  const target = { environment: 'local-mvp', revision: 'saved-revision' };
  write('priority-plan.json', {
    schemaVersion: 1,
    revision: 'saved-direction',
    objective: 'Preserve the saved result.',
    lastInstruction: { id: 'D001', text: 'Preserve the saved result.' },
    criticalPath: ['T001'],
    tasks: { T001: { dependsOn: [], allowedEditScope: [] } },
    outcome: {
      id: 'saved-result',
      statement: 'The result persists.',
      requirements: ['FR-001'],
      target,
      receipt: 'outcome.json',
    },
  });
  const contract = JSON.parse(
    readFileSync(path.join(root, '.specify/templates/loop-contract-template.json'), 'utf8')
  );
  contract.loopId = 'existing-feature';
  contract.requirePriorityPlan = true;
  contract.evalCommands.forEach((entry: { command: string }, index: number) => {
    entry.command = savedEvaluations[index];
  });
  write('loop-contract.json', contract);
  return target;
}

function audit(command: string) {
  const [executable, script, ...args] = command.split(/\s+/);
  expect(executable).toBe('node');
  const result = spawnSync(
    process.execPath,
    [
      path.join(runtime, script),
      ...args.map((arg) => (arg === '{FEATURE_DIR}' ? feature : arg)),
      '--no-report',
    ],
    { cwd: runtime, encoding: 'utf8', timeout: 10000 }
  );
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  return { result, report: JSON.parse(result.stdout) };
}

describe('forward-only policy rollback compatibility', () => {
  it.each([
    { modern: true, resolved: true },
    { modern: true, resolved: false },
    { modern: false, resolved: true },
    { modern: false, resolved: false },
  ])('reads saved state without migration: %j', ({ modern, resolved }) => {
    savedBlocker(modern, resolved);
    const before = snapshot();
    const result = inspect();
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(resolved ? 0 : 1);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe(resolved ? 'clear' : 'blocked');
    expect(report.registered).toBe(1);
    expect(
      report.blockers.every((entry: { reason?: string }) => entry.reason !== 'evidence_invalid')
    ).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it('continues rejecting tampered diagnosis instead of dropping it for compatibility', () => {
    savedBlocker(true, true);
    write('diagnostic-output.txt', 'Changed evidence.');
    const before = snapshot();
    const result = inspect();
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).blockers[0].reason).toBe('evidence_invalid');
    expect(snapshot()).toEqual(before);
  });

  it('retains persisted template arguments and explicit completion checks without rewriting state', () => {
    savedBlocker(true, true);
    const target = savedFeature();
    const before = snapshot();
    expect(audit(savedEvaluations[0]).report.priorityReview).toMatchObject({
      status: 'pass',
      outcomeStatus: 'not_checked',
    });
    const missing = audit(savedEvaluations[1]);
    expect(missing.result.status).toBe(1);
    expect(missing.report.priorityReview).toMatchObject({
      status: 'fail',
      outcomeStatus: 'unverified',
    });
    expect(snapshot()).toEqual(before);

    write('outcome-output.txt', 'Previously verified fixture output.');
    write('outcome.json', {
      result: 'pass',
      outcomeId: 'saved-result',
      target,
      requirements: ['FR-001'],
      planHash: hash(readFileSync(path.join(feature, 'priority-plan.json'))),
      specHash: hash(readFileSync(path.join(feature, 'spec.md'))),
      checks: [
        {
          command: 'read fixture',
          result: 'pass',
          evidence: 'outcome-output.txt',
          sha256: hash(readFileSync(path.join(feature, 'outcome-output.txt'))),
        },
      ],
    });
    const withReceipt = snapshot();
    // The fixture intentionally lacks other full-delivery artifacts; only outcome compatibility is asserted.
    expect(audit(savedEvaluations[1]).report.priorityReview).toMatchObject({
      status: 'pass',
      outcomeStatus: 'verified_record',
    });
    expect(snapshot()).toEqual(withReceipt);
  });
});
