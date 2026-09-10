import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const scripts = path.join(ROOT, '.specify/scripts/node');
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
let dir: string;
const write = (name: string, text: string) => fs.writeFileSync(path.join(dir, name), text);
const json = (name: string, value: unknown) => write(name, JSON.stringify(value));
function run(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [path.join(scripts, script), ...args], {
    encoding: 'utf8',
  });
  return {
    code: result.status,
    body: result.stdout ? JSON.parse(result.stdout) : null,
    stderr: result.stderr,
  };
}
const review = (...args: string[]) =>
  run('gofer-delivery-check.mjs', ['--feature-dir', dir, ...args]);
function complete() {
  write('tasks.md', '- [x] T001 Make the requested change.\n');
  write('traceability.md', '| T001 | FR-001 | Evidence |\n');
  json('proof.json', {
    result: 'pass',
    check: 'Executed acceptance scenario',
    requirements: ['FR-001'],
    specHash: digest(fs.readFileSync(path.join(dir, 'spec.md'), 'utf8')),
  });
  json('map.json', { T001: { requirements: ['FR-001'], evidence: 'proof.json' } });
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-delivery-check-'));
  write('spec.md', '# Agreed goal\nFR-001: Explain results in business language.\n');
  write('plan.md', 'Implement and test the agreed behavior.');
  write('tasks.md', '- [ ] T001 Make the requested change.\n');
  write('traceability.md', '| T001 | FR-001 | pending |');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('delivery checkpoint executable checks', () => {
  it('captures reviewed work without changing goals or checking task boxes', () => {
    const before = fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8');
    expect(review('--capture').code).toBe(0);
    expect(review().code).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8')).toBe(before);
  });
  it.each([
    'spec.md',
    'plan.md',
    'tasks.md',
    'traceability.md',
    'goal-ledger.json',
    'research.md',
    'discovery.md',
    'issues.md',
    'validation-report.md',
    'decisions.md',
  ])('rejects changed or newly added %s', (file) => {
    expect(review('--capture').code).toBe(0);
    write(file, 'New knowledge or scope');
    const result = review();
    expect(result.code).toBe(1);
    expect(result.body.findings).toContain(`ARTIFACT_DRIFT:${file}`);
  });
  it('rejects a deleted required artifact', () => {
    review('--capture');
    fs.unlinkSync(path.join(dir, 'plan.md'));
    expect(review().body.findings).toContain('UNREADABLE_ARTIFACT:plan.md');
  });
  it('rejects completion without proof and preserves the previous checkpoint', () => {
    review('--capture');
    const before = fs.readFileSync(path.join(dir, 'delivery-checkpoint.json'), 'utf8');
    write('tasks.md', '- [x] T001 Finished.');
    expect(review('--capture').body.findings).toContain('MISSING_TASK_EVIDENCE:T001');
    expect(fs.readFileSync(path.join(dir, 'delivery-checkpoint.json'), 'utf8')).toBe(before);
  });
  it('accepts linked passing evidence, then rejects tampering', () => {
    complete();
    expect(review('--capture', '--evidence-map', path.join(dir, 'map.json')).code).toBe(0);
    expect(review().code).toBe(0);
    fs.appendFileSync(path.join(dir, 'proof.json'), '\n');
    expect(review().body.findings).toContain('CHANGED_EVIDENCE:T001');
  });
  it.each(['fail', 'blocked', 'unknown'])('rejects %s evidence', (result) => {
    complete();
    const proof = JSON.parse(fs.readFileSync(path.join(dir, 'proof.json'), 'utf8'));
    json('proof.json', { ...proof, result });
    expect(
      review('--capture', '--evidence-map', path.join(dir, 'map.json')).body.findings
    ).toContain('INVALID_OR_STALE_EVIDENCE:T001');
  });
  it('does not accept stale proof after a spec change even during recapture', () => {
    complete();
    fs.appendFileSync(path.join(dir, 'spec.md'), '\nChanged outcome.');
    expect(
      review('--capture', '--evidence-map', path.join(dir, 'map.json')).body.findings
    ).toContain('INVALID_OR_STALE_EVIDENCE:T001');
  });
  it('rejects missing traceability and unknown requirement links', () => {
    complete();
    write('traceability.md', 'Not linked');
    json('map.json', { T001: { requirements: ['FR-999'], evidence: 'proof.json' } });
    const result = review('--capture', '--evidence-map', path.join(dir, 'map.json'));
    expect(result.body.findings).toContain('UNKNOWN_REQUIREMENT:T001');
    expect(result.body.findings).toContain('MISSING_TRACEABILITY:T001');
  });
  it('rejects path traversal in evidence', () => {
    complete();
    json('map.json', { T001: { requirements: ['FR-001'], evidence: '../outside.json' } });
    expect(
      review('--capture', '--evidence-map', path.join(dir, 'map.json')).body.findings
    ).toContain('UNREADABLE_EVIDENCE:T001');
  });
  it('rejects duplicate and unnumbered completed tasks', () => {
    write('tasks.md', '- [x] no identifier\n- [ ] T001 One\n- [ ] T001 Two');
    expect(review('--capture').body.findings).toEqual(
      expect.arrayContaining(['COMPLETED_TASK_WITHOUT_ID', 'DUPLICATE_TASK:T001'])
    );
  });
  it('connects drift to the existing strict loop audit', () => {
    expect(review('--capture').code).toBe(0);
    const args = [
      '--feature-dir',
      dir,
      '--stage',
      '4_tasks',
      '--init',
      '--strict',
      '--json',
      '--no-report',
    ];
    expect(run('gofer-loop-audit.mjs', args).code).toBe(0);
    write('plan.md', 'A changed direction');
    expect(run('gofer-loop-audit.mjs', args).body.blockingFindings).toContain(
      'Delivery review: ARTIFACT_DRIFT:plan.md'
    );
  });
  it('fails closed when a required checkpoint is missing', () => {
    const args = ['--feature-dir', dir, '--stage', '4_tasks', '--strict', '--json', '--no-report'];
    run('gofer-loop-audit.mjs', [...args, '--init']);
    const contract = JSON.parse(fs.readFileSync(path.join(dir, 'loop-contract.json'), 'utf8'));
    json('loop-contract.json', { ...contract, requireDeliveryCheckpoint: true });
    expect(run('gofer-loop-audit.mjs', args).code).toBe(1);
  });
  it('enables checkpoint checks by default for new features without blocking research', () => {
    const result = run('gofer-loop-audit.mjs', [
      '--feature-dir',
      dir,
      '--stage',
      '1_research',
      '--init',
      '--strict',
      '--json',
      '--no-report',
    ]);
    expect(result.code).toBe(0);
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, 'loop-contract.json'), 'utf8'))
        .requireDeliveryCheckpoint
    ).toBe(true);
    expect(
      run('gofer-loop-audit.mjs', [
        '--feature-dir',
        dir,
        '--stage',
        '4_tasks',
        '--strict',
        '--json',
        '--no-report',
      ]).code
    ).toBe(1);
  });
  it('rejects a symlinked evidence folder outside the feature', () => {
    complete();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-outside-'));
    try {
      fs.copyFileSync(path.join(dir, 'proof.json'), path.join(outside, 'proof.json'));
      fs.symlinkSync(outside, path.join(dir, 'linked'), 'junction');
      json('map.json', { T001: { requirements: ['FR-001'], evidence: 'linked/proof.json' } });
      expect(
        review('--capture', '--evidence-map', path.join(dir, 'map.json')).body.findings
      ).toContain('UNREADABLE_EVIDENCE:T001');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('business response executable checks', () => {
  function response(text: string, ...extra: string[]) {
    write('draft.txt', text);
    return run('gofer-response-check.mjs', ['--input', path.join(dir, 'draft.txt'), ...extra]);
  }
  it('rejects the reported technical update', () => {
    expect(
      response(
        'The repaired DEV proof is running its six authenticated access checks. The runner can execute the matched serial-versus-parallel benchmark on a verified fixture pool.'
      ).body.findings
    ).toContain('EXPLAIN_IN_BUSINESS_WORDS');
  });
  it('passes its business explanation without hiding uncertainty', () => {
    expect(
      response(
        'We are checking that test accounts cannot access another workspace. The speed comparison has not started. One setup step remains before we can compare both methods fairly.'
      ).code
    ).toBe(0);
  });
  it('rejects long and empty replies', () => {
    expect(response('Work continues. '.repeat(50)).body.findings).toContain('TOO_LONG');
    expect(response('').body.findings).toContain('EMPTY_REPLY');
    expect(response('```sh\nnpm run test\n```').body.findings).toContain(
      'TECHNICAL_BLOCK_IN_BUSINESS_REPLY'
    );
  });
  it('detects exact repetition', () => {
    write('previous.txt', 'The checks are still running.');
    expect(
      response('The checks are still running.', '--previous', path.join(dir, 'previous.txt')).body
        .findings
    ).toContain('REPEATED_UPDATE');
  });
  it('allows requested technical detail without exposing the draft in output', () => {
    const result = response('CRUD operations use the serializer.', '--technical');
    expect(result.code).toBe(0);
    expect(JSON.stringify(result.body)).not.toContain('serializer');
  });
});
