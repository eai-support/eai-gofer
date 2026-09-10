import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const helper = '.specify/scripts/node/gofer-priority-check.mjs';
const { reviewPriority } = await import(pathToFileURL(path.join(root, helper)).href);
const { applyBlockerEvent } = await import(
  pathToFileURL(path.join(root, '.specify/scripts/node/gofer-blocker-control.mjs')).href
);
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
let dir: string;
const write = (name: string, data: unknown) =>
  fs.writeFileSync(path.join(dir, name), typeof data === 'string' ? data : JSON.stringify(data));
const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');
const plan = () => JSON.parse(read('priority-plan.json'));
const review = (options = {}) => reviewPriority(dir, { workspaceRoot: dir, ...options });
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-priority-'));
  write('spec.md', '# Local MVP\nFR-001: Save a draft, without sign-in.');
  write('tasks.md', '- [ ] T001 Build\n- [ ] T002 Prove\n- [ ] T003 Prepare\n- [ ] T004 Notes');
  write('decisions.md', 'D001: Prove the local draft.\nD002: Notes can run alongside build.');
  write('traceability.md', '| FR-001 | T002 | outcome.json |');
  write('priority-plan.json', {
    schemaVersion: 1,
    revision: 'direction-1',
    objective: 'Prove local draft save.',
    lastInstruction: { id: 'D001', text: 'Prove the local draft.' },
    criticalPath: ['T001', 'T002'],
    tasks: {
      T001: { dependsOn: ['T003'], allowedEditScope: ['src/'] },
      T002: { dependsOn: ['T001'], allowedEditScope: ['tests/save.ts'] },
      T003: { dependsOn: [], allowedEditScope: [] },
      T004: {
        dependsOn: [],
        allowedEditScope: ['docs/'],
        parallelFor: 'T001',
        reason: 'Independent notes.',
        decisionId: 'D002',
      },
    },
    outcome: {
      id: 'draft-save',
      statement: 'The draft persists.',
      requirements: ['FR-001'],
      receipt: 'outcome.json',
      target: { environment: 'local-mvp', revision: 'test-revision' },
    },
  });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
function completed() {
  write('tasks.md', read('tasks.md').replaceAll('[ ]', '[x]'));
}
function receipt() {
  write('test-output.txt', 'Controlled executable test evidence.');
  write('outcome.json', {
    result: 'pass',
    outcomeId: 'draft-save',
    planHash: hash(read('priority-plan.json')),
    specHash: hash(read('spec.md')),
    target: plan().outcome.target,
    requirements: ['FR-001'],
    checks: [
      {
        command: 'controlled acceptance test',
        result: 'pass',
        evidence: 'test-output.txt',
        sha256: hash(read('test-output.txt')),
      },
    ],
  });
}
describe('priority and outcome protection', () => {
  it('selects a prerequisite without adding auth or deployment gates', async () => {
    expect(await review({ task: 'T003' })).toMatchObject({
      status: 'pass',
      nextTask: 'T003',
      outcomeStatus: 'not_checked',
    });
    expect((await review({ task: 'T001' })).status).toBe('fail');
  });
  it('allows recorded independent parallel work', async () => {
    expect((await review({ task: 'T004', changedFiles: ['docs/result.md'] })).status).toBe('pass');
  });
  it('requires prerequisites even for an approved parallel task', async () => {
    const p = plan();
    p.tasks.T004.dependsOn = ['T003'];
    write('priority-plan.json', p);
    const result = await review({ task: 'T004' });
    expect(result.findings).toEqual(['TASK_DEPENDENCIES_OPEN']);
    write('tasks.md', read('tasks.md').replace('[ ] T003', '[x] T003'));
    expect((await review({ task: 'T004' })).status).toBe('pass');
  });
  it('rejects a silent side trip and unapproved parallel work', async () => {
    const p = plan();
    delete p.tasks.T004.parallelFor;
    write('priority-plan.json', p);
    expect((await review({ task: 'T004' })).findings).toContain('TASK_NOT_ON_APPROVED_PATH');
    p.tasks.T004.parallelFor = 'T001';
    p.tasks.T004.decisionId = 'missing';
    write('priority-plan.json', p);
    expect((await review({ task: 'T004' })).status).toBe('fail');
  });
  it.each([
    '../secret',
    '/etc/passwd',
    'C:/secret',
    'src/../other',
    'src\\file',
    'docs/../src/app.ts',
  ])('rejects unsafe edit syntax %s', async (file) => {
    expect((await review({ task: 'T004', changedFiles: [file] })).findings).toContain(
      'PRIORITY_CHECK_INVALID:UNSAFE_RELATIVE_PATH'
    );
  });
  it('rejects a valid path outside the named scope', async () => {
    expect(
      (await review({ task: 'T004', changedFiles: ['docs-unapproved/file'] })).findings
    ).toContain('EDIT_OUTSIDE_SCOPE:docs-unapproved/file');
  });
  it('honors read-only tasks and rejects edits with no task', async () => {
    expect((await review({ task: 'T003', changedFiles: ['src/app.ts'] })).status).toBe('fail');
    expect((await review({ changedFiles: ['src/app.ts'] })).status).toBe('fail');
  });
  it('requires an explicit repo root for edit checks', async () => {
    expect(
      (await review({ task: 'T004', changedFiles: ['docs/new.md'], workspaceRoot: undefined }))
        .findings
    ).toContain('PRIORITY_CHECK_INVALID:WORKSPACE_ROOT_REQUIRED');
  });
  it('rejects symlink edits outside scope, including proposed and dangling paths', async () => {
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.mkdirSync(path.join(dir, 'other'));
    fs.symlinkSync(path.join(dir, 'other'), path.join(dir, 'docs/link'), 'junction');
    expect((await review({ task: 'T004', changedFiles: ['docs/link/new.md'] })).findings).toContain(
      'EDIT_OUTSIDE_SCOPE:docs/link/new.md'
    );
    fs.symlinkSync(root, path.join(dir, 'docs/external'), 'junction');
    expect(
      (await review({ task: 'T004', changedFiles: ['docs/external/new.md'] })).findings
    ).toContain('PRIORITY_CHECK_INVALID:EDIT_OUTSIDE_REPOSITORY');
    fs.symlinkSync(path.join(dir, 'absent'), path.join(dir, 'docs/dangling'), 'junction');
    expect(
      (await review({ task: 'T004', changedFiles: ['docs/dangling/new.md'] })).findings
    ).toContain('PRIORITY_CHECK_INVALID:DANGLING_EDIT_SYMLINK');
  });
  it('handles a deep valid dependency graph without recursion', async () => {
    const p = plan();
    p.tasks = {};
    const lines = [];
    for (let i = 1; i <= 10000; i++) {
      const id = `T${i}`;
      p.tasks[id] = { dependsOn: i === 10000 ? [] : [`T${i + 1}`], allowedEditScope: [] };
      lines.push(`- [ ] ${id} Task`);
    }
    p.criticalPath = ['T1'];
    write('tasks.md', lines.join('\n'));
    write('priority-plan.json', p);
    expect(await review()).toMatchObject({ status: 'pass', nextTask: 'T10000' });
  });
  it('rejects redirected scope roots and allows only separately listed destinations', async () => {
    fs.mkdirSync(path.join(dir, 'other'));
    fs.symlinkSync(path.join(dir, 'other'), path.join(dir, 'docs'), 'junction');
    expect((await review({ task: 'T004', changedFiles: ['docs/new.md'] })).findings).toContain(
      'EDIT_OUTSIDE_SCOPE:docs/new.md'
    );
    const p = plan();
    p.tasks.T004.allowedEditScope.push('other/');
    write('priority-plan.json', p);
    expect((await review({ task: 'T004', changedFiles: ['docs/new.md'] })).status).toBe('pass');
  });
  it('does not expose malformed private input in findings', async () => {
    write('priority-plan.json', '{"secret":"FAKEKEY123" unexpected }');
    const result = await review();
    expect(result.status).toBe('fail');
    expect(JSON.stringify(result)).not.toContain('FAKEKEY123');
    expect(result.findings).toContain('PRIORITY_CHECK_INVALID:INVALID_INPUT_OR_EVIDENCE');
  });
  it('rejects dependency cycles, unknown dependencies and uncovered tasks', async () => {
    const baseline = plan();
    for (const variant of ['cycle', 'unknown', 'missing']) {
      const p = structuredClone(baseline);
      if (variant === 'cycle') p.tasks.T003.dependsOn = ['T001'];
      if (variant === 'unknown') p.tasks.T003.dependsOn = ['T999'];
      if (variant === 'missing') delete p.tasks.T003;
      write('priority-plan.json', p);
      expect((await review()).status).toBe('fail');
    }
  });
  it('returns the saved direction and rejects an unrecorded instruction', async () => {
    expect((await review()).lastInstruction.text).toBe('Prove the local draft.');
    write('decisions.md', 'Other work.');
    expect((await review()).status).toBe('fail');
  });
  it('does not report completion from a receipt while priority work remains open', async () => {
    receipt();
    expect((await review({ finish: true })).findings).toContain('PRIORITY_TASKS_OPEN');
  });
  it('requires the current outcome receipt, not just completed task boxes', async () => {
    completed();
    expect((await review({ finish: true })).status).toBe('fail');
    receipt();
    expect((await review({ finish: true })).status).toBe('pass');
  });
  it.each(['spec', 'plan', 'target', 'revision', 'output', 'trace', 'failure', 'empty-checks'])(
    'rejects stale or incomplete %s evidence',
    async (kind) => {
      completed();
      receipt();
      if (kind === 'spec') write('spec.md', read('spec.md') + '\nFR-002: Changed scope.');
      if (kind === 'plan') {
        const p = plan();
        p.revision = 'direction-2';
        write('priority-plan.json', p);
      }
      if (kind === 'output') write('test-output.txt', 'changed');
      if (kind === 'trace') write('traceability.md', 'FR-001 without receipt');
      const r = JSON.parse(read('outcome.json'));
      if (kind === 'target') r.target.environment = 'prod';
      if (kind === 'revision') r.target.revision = 'wrong-revision';
      if (kind === 'failure') r.checks[0].result = 'fail';
      if (kind === 'empty-checks') r.checks = [];
      write('outcome.json', r);
      expect((await review({ finish: true })).status).toBe('fail');
    }
  );
  it('rejects an outcome symlink outside the feature', async () => {
    completed();
    receipt();
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-external-receipt-'));
    try {
      fs.copyFileSync(path.join(dir, 'outcome.json'), path.join(external, 'valid.json'));
      fs.unlinkSync(path.join(dir, 'outcome.json'));
      fs.symlinkSync(path.join(external, 'valid.json'), path.join(dir, 'outcome.json'));
      expect((await review({ finish: true })).findings).toContain(
        'PRIORITY_CHECK_INVALID:EVIDENCE_OUTSIDE_FEATURE'
      );
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });
  it('hashes binary evidence bytes and rejects UTF-8 replacement collisions', async () => {
    completed();
    receipt();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]);
    fs.writeFileSync(path.join(dir, 'test-output.txt'), bytes);
    const r = JSON.parse(read('outcome.json'));
    r.checks[0].sha256 = hash(bytes);
    write('outcome.json', r);
    expect((await review({ finish: true })).status).toBe('pass');
    fs.writeFileSync(path.join(dir, 'test-output.txt'), Buffer.from([0xef, 0xbf, 0xbd]));
    r.checks[0].sha256 = hash(Buffer.from([0xef, 0xbf, 0xbd]));
    write('outcome.json', r);
    expect((await review({ finish: true })).status).toBe('pass');
    fs.writeFileSync(path.join(dir, 'test-output.txt'), Buffer.from([0xff]));
    expect((await review({ finish: true })).findings).toContain(
      'PRIORITY_CHECK_INVALID:OUTCOME_CHECK_INVALID'
    );
  });
  it('rejects a receipt substring instead of the exact path', async () => {
    completed();
    receipt();
    write('traceability.md', '| FR-001 | T002 | old-outcome.json.bak |');
    expect((await review({ finish: true })).findings).toContain('OUTCOME_TRACE_MISSING:FR-001');
    write('traceability.md', '| FR-001 | T002 | [outcome.json](wrong.json) |');
    expect((await review({ finish: true })).findings).toContain('OUTCOME_TRACE_MISSING:FR-001');
    write('traceability.md', '| FR-001 | T002 | [outcome.json](wrong.json "Old receipt") |');
    expect((await review({ finish: true })).findings).toContain('OUTCOME_TRACE_MISSING:FR-001');
    write('traceability.md', '| FR-001 | T002 | [outcome.json][wrong] |\n[wrong]: wrong.json');
    expect((await review({ finish: true })).findings).toContain('OUTCOME_TRACE_MISSING:FR-001');
    write('traceability.md', '| FR-001 | T002 | [proof](outcome.json) |');
    expect((await review({ finish: true })).status).toBe('pass');
  });
  it('rejects oversized and non-regular evidence without waiting for input', async () => {
    completed();
    receipt();
    fs.truncateSync(path.join(dir, 'test-output.txt'), 64 * 1024 * 1024 + 1);
    expect((await review({ finish: true })).findings).toContain(
      'PRIORITY_CHECK_INVALID:INVALID_FILE_TYPE_OR_SIZE'
    );
    fs.unlinkSync(path.join(dir, 'test-output.txt'));
    if (process.platform === 'win32') fs.mkdirSync(path.join(dir, 'test-output.txt'));
    else expect(spawnSync('mkfifo', [path.join(dir, 'test-output.txt')]).status).toBe(0);
    const result = spawnSync(
      process.execPath,
      [path.join(root, helper), '--feature-dir', dir, '--finish'],
      { encoding: 'utf8', timeout: 5000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).status).toBe('fail');
  });
  it('reuses raw-file hashes through aliases and bounds total unique evidence', async () => {
    completed();
    receipt();
    const bytes = Buffer.alloc(48 * 1024 * 1024, 42);
    const r = JSON.parse(read('outcome.json'));
    fs.writeFileSync(path.join(dir, 'test-output.txt'), bytes);
    r.checks[0].sha256 = hash(bytes);
    r.checks = Array.from({ length: 4 }, (_, i) => {
      const name = `alias-${i}.txt`;
      fs.linkSync(path.join(dir, 'test-output.txt'), path.join(dir, name));
      return { ...r.checks[0], evidence: name };
    });
    write('outcome.json', r);
    expect((await review({ finish: true })).status).toBe('pass');
    for (let i = 1; i < 4; i++) {
      fs.unlinkSync(path.join(dir, `alias-${i}.txt`));
      fs.writeFileSync(path.join(dir, `alias-${i}.txt`), bytes);
    }
    expect((await review({ finish: true })).findings).toContain(
      'PRIORITY_CHECK_INVALID:TOTAL_EVIDENCE_LIMIT'
    );
  });
  it('bounds malformed Markdown parsing work', () => {
    completed();
    receipt();
    write('traceability.md', `FR-001 ${'['.repeat(100000)} [outcome.json][wrong]`);
    const result = spawnSync(
      process.execPath,
      [path.join(root, helper), '--feature-dir', dir, '--finish'],
      { encoding: 'utf8', timeout: 3000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).findings).toContain('OUTCOME_TRACE_MISSING:FR-001');
  });
  it('connects priority and outcome checks to stage-aware loop validation', () => {
    const audit = (stage: string, init = false) => {
      const result = spawnSync(
        process.execPath,
        [
          path.join(root, '.specify/scripts/node/gofer-loop-audit.mjs'),
          '--feature-dir',
          dir,
          '--stage',
          stage,
          '--json',
          '--strict',
          '--no-report',
          ...(init ? ['--init'] : []),
        ],
        { encoding: 'utf8' }
      );
      return JSON.parse(result.stdout);
    };
    expect(audit('0_gofer_start', true).priorityReview).toBeUndefined();
    expect(JSON.parse(read('loop-contract.json')).requirePriorityPlan).toBe(true);
    expect(audit('4_tasks').priorityReview.status).toBe('pass');
    expect(audit('6_validate').priorityReview.status).toBe('fail');
    completed();
    receipt();
    expect(audit('6_validate').priorityReview.status).toBe('pass');
    fs.unlinkSync(path.join(dir, 'priority-plan.json'));
    expect(audit('4_tasks').priorityReview.status).toBe('fail');
    const contract = JSON.parse(read('loop-contract.json'));
    delete contract.requirePriorityPlan;
    write('loop-contract.json', contract);
    expect(audit('4_tasks').coverageNotes.join(' ')).toContain(
      'priority and outcome receipts are unverified'
    );
  });
  it.each([
    '.specify/scripts/node',
    'extension/resources/node-scripts',
    'plugins/eai-gofer/.specify/scripts/node',
    'plugins/eai-gofer/plugins/eai-gofer/.specify/scripts/node',
  ])('runs the shipped helper in %s', (folder) => {
    const script = path.join(root, folder, 'gofer-priority-check.mjs');
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [script, '--feature-dir', dir, ...args], { encoding: 'utf8' });
    expect(run('--task', 'T003').status).toBe(0);
    expect(run('--finish').status).toBe(1);
    completed();
    receipt();
    expect(run('--finish').status).toBe(0);
  });
});

describe('closed-loop completion evidence', () => {
  const audit = (finish = false) => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, '.specify/scripts/node/gofer-closed-loop-audit.mjs'),
        '--feature-dir',
        dir,
        '--json',
        '--strict',
        '--no-report',
        ...(finish ? ['--completion'] : []),
      ],
      { encoding: 'utf8' }
    );
    return JSON.parse(result.stdout);
  };
  it('keeps routine drift checking separate from the final outcome check', () => {
    expect(audit().priorityReview.outcomeStatus).toBe('not_checked');
    expect(audit(true).priorityReview.status).toBe('fail');
    completed();
    receipt();
    expect(audit(true).priorityReview.status).toBe('pass');
    fs.unlinkSync(path.join(dir, 'outcome.json'));
    expect(audit(true).priorityReview.status).toBe('fail');
  });
  it('does not silently accept a missing priority plan in explicit completion mode', () => {
    fs.unlinkSync(path.join(dir, 'priority-plan.json'));
    expect(audit().priorityReview).toBeUndefined();
    expect(audit(true).priorityReview.status).toBe('fail');
  });
});

describe('evidence before technical escalation', () => {
  async function open(category = 'access') {
    return applyBlockerEvent(dir, {
      action: 'open',
      goalKey: 'test',
      subjectKey: 'session',
      conditionKey: 'expired',
      category,
      owner: 'user',
      question: 'Can you sign in?',
      requiredChange: 'Session restored.',
      tasks: ['T001'],
    });
  }
  function diagnosis(id: string, extra = {}) {
    write('diagnostic-output.txt', 'Expired test session.');
    write('diagnosis.json', {
      blockerId: id,
      kind: 'diagnosis',
      checkedAt: new Date().toISOString(),
      classification: 'credential',
      evidence: 'diagnostic-output.txt',
      sha256: hash(read('diagnostic-output.txt')),
      command: 'read fixture session',
      observed: 'Expired fixture.',
      source: 'test:fixture',
      selfCauseChecked: true,
      selfCauseCheck: 'Route and profile checked.',
      authorizedRepairAvailable: false,
      authorityCheck: 'Interactive user sign-in required.',
      noSafeAlternativeReason: 'Cannot bypass authentication.',
      ...extra,
    });
  }
  it('rejects an unsupported escalation without consuming the question', async () => {
    const { blockerId } = await open();
    await expect(applyBlockerEvent(dir, { action: 'ask', blockerId })).rejects.toThrow();
    diagnosis(blockerId);
    expect(
      (await applyBlockerEvent(dir, { action: 'ask', blockerId, verification: 'diagnosis.json' }))
        .allowed
    ).toBe(true);
    expect((await applyBlockerEvent(dir, { action: 'ask', blockerId })).allowed).toBe(false);
  });
  it.each([
    { authorizedRepairAvailable: true },
    { selfCauseChecked: false },
    { blockerId: 'wrong' },
    { checkedAt: '2000-01-01' },
    { checkedAt: 'not-a-date' },
    { noSafeAlternativeReason: '' },
  ])('rejects insufficient diagnosis %j', async (extra) => {
    const { blockerId } = await open();
    diagnosis(blockerId, extra);
    await expect(
      applyBlockerEvent(dir, { action: 'ask', blockerId, verification: 'diagnosis.json' })
    ).rejects.toThrow();
  });
  it('allows a real business decision without a failing command', async () => {
    const { blockerId } = await open('decision');
    expect((await applyBlockerEvent(dir, { action: 'ask', blockerId })).allowed).toBe(true);
  });
  it('does not bypass diagnosis by relabeling a technical failure as a decision', async () => {
    const { blockerId } = await open();
    await applyBlockerEvent(dir, { action: 'classify', blockerId, category: 'decision' });
    await expect(applyBlockerEvent(dir, { action: 'ask', blockerId })).rejects.toThrow();
  });
  it('rejects changed diagnostic output', async () => {
    const { blockerId } = await open();
    diagnosis(blockerId);
    write('diagnostic-output.txt', 'tampered');
    await expect(
      applyBlockerEvent(dir, { action: 'ask', blockerId, verification: 'diagnosis.json' })
    ).rejects.toThrow();
  });
});
