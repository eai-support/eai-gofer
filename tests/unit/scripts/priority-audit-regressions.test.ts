import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const scripts = path.join(process.cwd(), '.specify/scripts/node');
const stages = [
  '0_gofer_start',
  '1_gofer_research',
  '1_research',
  '2_gofer_specify',
  '2_specify',
  '3_gofer_plan',
  '3_plan',
  '4_gofer_tasks',
  '4_tasks',
  '5_gofer_implement',
  '5_implement',
  '6_gofer_validate',
  '6_validate',
];
let dir: string;
const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');
const write = (name: string, value: unknown) =>
  fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value));
const hash = (name: string) => createHash('sha256').update(read(name)).digest('hex');

function run(script: string, ...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [path.join(scripts, script), '--feature-dir', dir, ...args],
    { encoding: 'utf8' }
  );
  expect(result.error).toBeUndefined();
  return {
    code: result.status,
    body: result.stdout ? JSON.parse(result.stdout) : null,
    stderr: result.stderr,
  };
}
const loop = (...args: string[]) =>
  run('gofer-loop-audit.mjs', '--workspace', dir, '--json', '--no-report', ...args);
const closed = (...args: string[]) =>
  run(
    'gofer-closed-loop-audit.mjs',
    '--workspace',
    dir,
    '--json',
    '--no-report',
    '--strict',
    ...args
  );
const capture = () =>
  run(
    'gofer-delivery-check.mjs',
    '--capture',
    '--evidence-map',
    path.join(dir, 'evidence-map.json')
  );
const trace = (receipt: string) => `# Traceability

| Requirement ID | Goal ID | Code Evidence | Test Evidence | Task | Receipts |
| -------------- | ------- | ------------- | ------------- | ---- | -------- |
| FR-001 | G1 | implementation.txt | checks.txt | T001 | ${receipt} outcome.json |
`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-priority-audit-regressions-'));
  write('goal-ledger.json', {
    schemaVersion: 1,
    goals: [{ id: 'G1', goal: 'Verify the requested result', trace: { requirements: ['FR-001'] } }],
  });
  write(
    'spec.md',
    '# Feature Specification: Local result\n\n- **FR-001**: Verify the requested local result.\n'
  );
  write('plan.md', '# Plan\n\nProduce and verify the requested local result.');
  write('tasks.md', '- [x] T001 Verify the requested result.');
  write('decisions.md', 'D001: Verify the requested result.');
  write('traceability.md', trace('proof.json'));
  write('implementation.txt', 'Controlled local implementation fixture.');
  write('checks.txt', 'Controlled acceptance fixture passed.');
  write('validation-report.md', '# Validation\n\nThe controlled acceptance check passed.');
  write('priority-plan.json', {
    schemaVersion: 1,
    revision: 'direction-1',
    objective: 'Verify the requested result.',
    lastInstruction: { id: 'D001', text: 'Verify the requested result.' },
    criticalPath: ['T001'],
    tasks: { T001: { dependsOn: [], allowedEditScope: [] } },
    outcome: {
      id: 'local-result',
      statement: 'The requested result was verified.',
      requirements: ['FR-001'],
      receipt: 'outcome.json',
      target: { environment: 'local-mvp', revision: 'fixture-1' },
    },
  });
  write('proof.json', {
    result: 'pass',
    check: 'Controlled acceptance check',
    requirements: ['FR-001'],
    specHash: hash('spec.md'),
  });
  write('evidence-map.json', { T001: { requirements: ['FR-001'], evidence: 'proof.json' } });
  write('outcome.json', {
    result: 'pass',
    outcomeId: 'local-result',
    planHash: hash('priority-plan.json'),
    specHash: hash('spec.md'),
    requirements: ['FR-001'],
    target: { environment: 'local-mvp', revision: 'fixture-1' },
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
      action: 'acceptance check',
      result: 'pass',
      summary: 'Controlled acceptance check passed.',
    }) + '\n'
  );
  // Keep the fixture free of unrelated timestamp drift on every filesystem.
  const baseline = new Date(Date.now() - 60_000);
  for (const name of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, name), baseline, baseline);
  expect(capture().code).toBe(0);
  expect(loop('--stage', '0_gofer_start', '--init', '--strict').code).toBe(0);
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('priority audit CLI regressions', () => {
  it.each(stages)('preserves the supported stage %s', (stage) => {
    const result = loop('--stage', stage, '--strict');
    expect(result.code).toBe(0);
    expect(result.body.status).toBe('pass');
    expect(result.body.blockingFindings).toEqual([]);
  });

  it.each(['6_validation', 'validate', 'constructor', '__proto__', ''])(
    'rejects invalid stage %j without requiring strict mode',
    (stage) => {
      const result = loop('--stage', stage);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Unknown stage');
      expect(result.body).toBeNull();
    }
  );

  it('rejects a missing stage value before initialization or recording', () => {
    fs.unlinkSync(path.join(dir, 'loop-contract.json'));
    const before = read('loop-ledger.jsonl');
    const result = loop('--init', '--record', '{}', '--stage');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Unknown stage');
    expect(fs.existsSync(path.join(dir, 'loop-contract.json'))).toBe(false);
    expect(read('loop-ledger.jsonl')).toBe(before);
  });

  it.each(['local-mvp', 'non-app'])(
    'fails overall validation only for a missing %s outcome receipt',
    (environment) => {
      const plan = JSON.parse(read('priority-plan.json'));
      plan.outcome.target.environment = environment;
      write('priority-plan.json', plan);
      const receipt = JSON.parse(read('outcome.json'));
      receipt.target = plan.outcome.target;
      receipt.planHash = hash('priority-plan.json');
      write('outcome.json', receipt);
      expect(capture().code).toBe(0);

      const healthyLoop = loop('--stage', '6_validate', '--strict');
      expect(healthyLoop.code).toBe(0);
      expect(healthyLoop.body.status).toBe('pass');
      expect(healthyLoop.body.blockingFindings).toEqual([]);
      const healthyClosed = closed('--completion');
      expect(healthyClosed.code).toBe(0);
      expect(healthyClosed.body.status).toBe('healthy');
      expect(healthyClosed.body.blockingFindings).toEqual([]);
      expect(healthyClosed.body.driftFindings).toEqual([]);

      const savedReceipt = read('outcome.json');
      fs.unlinkSync(path.join(dir, 'outcome.json'));
      const failedLoop = loop('--stage', '6_validate', '--strict');
      expect(failedLoop.code).toBe(1);
      expect(failedLoop.body.status).toBe('fail');
      expect(failedLoop.body.priorityReview.outcomeStatus).toBe('unverified');
      expect(failedLoop.body.deliveryReview.status).toBe('pass');
      expect(failedLoop.body.blockingFindings).toEqual([
        expect.stringMatching(/^PRIORITY_CHECK_INVALID:/),
      ]);
      const failedClosed = closed('--completion');
      expect(failedClosed.code).toBe(1);
      expect(failedClosed.body.status).toBe('fail');
      expect(failedClosed.body.priorityReview.outcomeStatus).toBe('unverified');
      expect(failedClosed.body.driftFindings).toEqual([]);
      expect(failedClosed.body.blockingFindings).toEqual([
        expect.objectContaining({
          source: 'priority-plan.json',
          message: expect.stringMatching(/^PRIORITY_CHECK_INVALID:/),
        }),
      ]);
      expect(closed().body.status).toBe('healthy');
      expect(closed().code).toBe(0);

      write('outcome.json', savedReceipt);
      expect(loop('--strict').code).toBe(0);
      expect(closed('--completion').code).toBe(0);
    }
  );

  it.each(stages)('preserves routine legacy behavior for %s', (stage) => {
    const contract = JSON.parse(read('loop-contract.json'));
    delete contract.requirePriorityPlan;
    delete contract.requireDeliveryCheckpoint;
    write('loop-contract.json', contract);
    fs.unlinkSync(path.join(dir, 'priority-plan.json'));
    fs.unlinkSync(path.join(dir, 'delivery-checkpoint.json'));
    fs.unlinkSync(path.join(dir, 'outcome.json'));
    const result = loop('--stage', stage, '--strict');
    expect(result.code).toBe(0);
    expect(result.body.status).toBe('pass');
    expect(result.body.priorityReview).toBeUndefined();
  });
});

describe('exact delivery receipt references', () => {
  it.each([
    'old-proof.json.bak',
    'proof.json.bak',
    'archived/proof.json',
    'proofXjson',
    '[proof.json](old-proof.json.bak)',
    '[proof.json](old-proof.json.bak "Old receipt")',
    '[proof.json][old]',
    '`old-proof.json.bak`',
    'https://example.invalid/proof.json',
    'proof.json#old',
  ])('rejects the different receipt %s', (reference) => {
    write('traceability.md', trace(reference));
    const checkpoint = read('delivery-checkpoint.json');
    const result = capture();
    expect(result.code).toBe(1);
    expect(result.body.findings).toEqual(['MISSING_NAMED_TASK_RECEIPT:T001']);
    expect(read('delivery-checkpoint.json')).toBe(checkpoint);
  });

  it.each([
    'proof.json',
    '`proof.json`',
    '[receipt](proof.json)',
    '[receipt](<proof.json>)',
    '[receipt](proof.json "Current receipt")',
  ])('accepts the exact receipt %s', (reference) => {
    write('traceability.md', trace(reference));
    expect(capture().code).toBe(0);
    const result = run('gofer-delivery-check.mjs');
    expect(result.code).toBe(0);
    expect(result.body.status).toBe('pass');
  });
});
