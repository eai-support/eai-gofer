import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const helper = path.join(root, '.specify/scripts/node/gofer-blocker-control.mjs');
const controller = await import(pathToFileURL(helper).href);
let dir: string;
const event = (value: Record<string, unknown>) => controller.applyBlockerEvent(dir, value);
const open = (extra = {}) =>
  event({
    action: 'open',
    goalKey: 'delivery',
    subjectKey: 'login',
    conditionKey: 'missing-access',
    category: 'unknown',
    owner: 'user',
    question: 'Can you grant access?',
    requiredChange: 'Access is granted.',
    tasks: ['T001'],
    ...extra,
  });
const inspect = (taskId?: string) => controller.inspectBlockers(dir, { taskId });
const proof = (
  blockerId: string,
  file = 'proof.json',
  kind = 'resolution',
  source = 'test:verified-check'
) => {
  fs.writeFileSync(
    path.join(dir, file),
    JSON.stringify({
      blockerId,
      kind,
      result: kind === 'change' ? 'changed' : 'pass',
      source,
      summary: 'A controlled test fixture, not live permission evidence.',
    })
  );
  return file;
};
const finish = (blockerId: string, attemptId: string) =>
  event({
    action: 'result',
    blockerId,
    attemptId,
    result: 'no_progress',
    summary: 'Check found no change.',
  });
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-blocker-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('persistent blocker mediation', () => {
  it('retains identity, question history and wider scope across surfaces', async () => {
    const a = await open({ category: 'decision' });
    expect((await event({ action: 'ask', blockerId: a.blockerId })).allowed).toBe(true);
    const b = await open({
      goalKey: 'DELIVERY',
      question: 'Different words?',
      tasks: ['T002'],
      host: 'claude',
    });
    expect(b.blockerId).toBe(a.blockerId);
    expect(b.allowed).toBe(false);
    expect((await event({ action: 'ask', blockerId: a.blockerId })).allowed).toBe(false);
    expect((await inspect('T002')).status).toBe('blocked');
    expect((await inspect('T003')).status).toBe('clear');
    await open({ tasks: [] });
    expect((await inspect('T003')).status).toBe('blocked');
  });

  it.each(['decision', 'access', 'external', 'capability'])(
    'does not retry a known %s dependency',
    async (category) => {
      const b = await open({ category });
      expect(
        (await event({ action: 'attempt', blockerId: b.blockerId, approachKey: 'read-docs' }))
          .allowed
      ).toBe(false);
      await event({ action: 'classify', blockerId: b.blockerId, category: 'solvable' });
      expect(
        (await event({ action: 'attempt', blockerId: b.blockerId, approachKey: 'another-model' }))
          .allowed
      ).toBe(false);
    }
  );

  it('reserves one investigation and one different recovery, without treating progress as done', async () => {
    const { blockerId } = await open();
    const a = await event({ action: 'attempt', blockerId, approachKey: 'check-local' });
    expect(a.decision).toBe('investigate_once');
    expect(
      (await event({ action: 'attempt', blockerId, approachKey: 'check-remote' })).allowed
    ).toBe(false);
    await finish(blockerId, a.attemptId);
    const b = await event({ action: 'attempt', blockerId, approachKey: 'check-remote' });
    expect(b.decision).toBe('recover_once');
    await event({
      action: 'result',
      blockerId,
      attemptId: b.attemptId,
      result: 'progress',
      summary: 'Some progress.',
    });
    expect((await event({ action: 'attempt', blockerId, approachKey: 'third' })).allowed).toBe(
      false
    );
    expect((await inspect()).status).toBe('blocked');
  });

  it('rejects a reworded retry of the same approach', async () => {
    const { blockerId } = await open();
    const a = await event({ action: 'attempt', blockerId, approachKey: 'check-local' });
    await finish(blockerId, a.attemptId);
    expect(
      (await event({ action: 'attempt', blockerId, approachKey: 'CHECK-LOCAL' })).allowed
    ).toBe(false);
  });

  it('allows one changed-evidence resumption without asking the question again', async () => {
    const { blockerId } = await open({ category: 'access' });
    await event({ action: 'ask', blockerId });
    const evidence = proof(blockerId, 'change.json', 'change');
    expect(
      (await event({ action: 'resume', blockerId, category: 'solvable', evidence })).allowed
    ).toBe(true);
    expect((await event({ action: 'ask', blockerId })).allowed).toBe(false);
    const a = await event({ action: 'attempt', blockerId, approachKey: 'verify-access' });
    await finish(blockerId, a.attemptId);
    await event({ action: 'classify', blockerId, category: 'external' });
    expect(
      (
        await event({
          action: 'resume',
          blockerId,
          category: 'solvable',
          evidence: proof(blockerId, 'new.json', 'change', 'new:check'),
        })
      ).allowed
    ).toBe(false);
  });

  it('does not reset ready work or resolve unfinished tool execution', async () => {
    const { blockerId } = await open();
    await expect(
      event({
        action: 'resume',
        blockerId,
        category: 'solvable',
        evidence: proof(blockerId, 'change.json', 'change'),
      })
    ).rejects.toThrow();
    await event({ action: 'attempt', blockerId, approachKey: 'inspect' });
    await expect(
      event({ action: 'resolve', blockerId, evidence: proof(blockerId) })
    ).rejects.toThrow();
    await expect(
      event({
        action: 'result',
        blockerId,
        attemptId: 'wrong',
        result: 'progress',
        summary: 'Wrong attempt.',
      })
    ).rejects.toThrow();
  });

  it('requires current resolution evidence and detects later tampering', async () => {
    const { blockerId } = await open();
    const evidence = proof(blockerId);
    expect((await event({ action: 'resolve', blockerId, evidence })).allowed).toBe(true);
    expect((await inspect()).status).toBe('clear');
    fs.appendFileSync(path.join(dir, evidence), ' ');
    expect((await inspect()).blockers[0].reason).toBe('evidence_invalid');
    await expect(open()).rejects.toThrow();
  });

  it('rejects reused evidence sources even in a different file', async () => {
    const { blockerId } = await open();
    await event({ action: 'resolve', blockerId, evidence: proof(blockerId) });
    await expect(
      event({
        action: 'resume',
        blockerId,
        category: 'solvable',
        evidence: proof(blockerId, 'change.json', 'change'),
      })
    ).rejects.toThrow();
    expect((await inspect()).status).toBe('clear');
  });

  it('rejects a corrupt stored attempt budget', async () => {
    const { blockerId } = await open();
    const file = path.join(dir, 'blocker-register.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.blockers[blockerId].epoch = 2;
    fs.writeFileSync(file, JSON.stringify(data));
    await expect(inspect()).rejects.toThrow();
  });

  it('only permits one simultaneous tool reservation', async () => {
    const { blockerId } = await open();
    const outcomes = await Promise.allSettled(
      ['first', 'second'].map((approachKey) => event({ action: 'attempt', blockerId, approachKey }))
    );
    expect(outcomes.filter((r) => r.status === 'fulfilled' && r.value.allowed)).toHaveLength(1);
    expect((await event({ action: 'attempt', blockerId, approachKey: 'third' })).allowed).toBe(
      false
    );
  });

  it.each(['missing.json', '../escape.json', '/tmp/escape.json'])(
    'rejects unsafe or missing evidence: %s',
    async (evidence) => {
      const { blockerId } = await open();
      await expect(event({ action: 'resolve', blockerId, evidence })).rejects.toThrow();
    }
  );

  it('rejects unrelated evidence and escaping symlinks', async () => {
    const { blockerId } = await open();
    await expect(
      event({ action: 'resolve', blockerId, evidence: proof('wrong') })
    ).rejects.toThrow();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gofer-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'proof.json'), '{}');
      fs.symlinkSync(
        outside,
        path.join(dir, 'outside'),
        process.platform === 'win32' ? 'junction' : 'dir'
      );
      await expect(
        event({ action: 'resolve', blockerId, evidence: 'outside/proof.json' })
      ).rejects.toThrow();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('fails closed on corrupt state and an existing writer lock', async () => {
    fs.writeFileSync(path.join(dir, 'blocker-register.json'), 'not-json');
    await expect(open()).rejects.toThrow();
    expect(fs.existsSync(path.join(dir, '.gofer-blocker.lock'))).toBe(false);
    fs.writeFileSync(path.join(dir, '.gofer-blocker.lock'), 'other writer');
    await expect(open()).rejects.toThrow();
    expect(fs.readFileSync(path.join(dir, '.gofer-blocker.lock'), 'utf8')).toBe('other writer');
  });

  it('only permits one simultaneous question reservation', async () => {
    const { blockerId } = await open();
    const outcomes = await Promise.allSettled([
      event({ action: 'ask', blockerId }),
      event({ action: 'ask', blockerId }),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled' && r.value.allowed)).toHaveLength(1);
    expect((await event({ action: 'ask', blockerId })).allowed).toBe(false);
  });

  it('preserves the wait between separate CLI processes', async () => {
    const { blockerId } = await open();
    const file = path.join(dir, 'event.json');
    fs.writeFileSync(file, JSON.stringify({ action: 'ask', blockerId }));
    const run = () =>
      spawnSync(process.execPath, [helper, '--state-dir', dir, '--event', file], {
        encoding: 'utf8',
      });
    expect(run().status).toBe(0);
    const repeated = run();
    expect(repeated.status).toBe(1);
    expect(JSON.parse(repeated.stdout).allowed).toBe(false);
  });

  it('blocks strict loop validation at an early stage and clears only after resolution', async () => {
    fs.writeFileSync(path.join(dir, 'spec.md'), '# Controlled non-app test\n');
    const audit = () =>
      spawnSync(
        process.execPath,
        [
          path.join(root, '.specify/scripts/node/gofer-loop-audit.mjs'),
          '--feature-dir',
          dir,
          '--stage',
          '1_research',
          '--init',
          '--json',
          '--strict',
        ],
        { encoding: 'utf8' }
      );
    const initial = audit();
    expect(initial.status).toBe(0);
    const { blockerId } = await open({ category: 'decision' });
    const blocked = audit();
    expect(blocked.status).toBe(1);
    expect(JSON.parse(blocked.stdout).blockerReview.status).toBe('blocked');
    await event({ action: 'resolve', blockerId, evidence: proof(blockerId) });
    expect(audit().status).toBe(0);
  });
});
