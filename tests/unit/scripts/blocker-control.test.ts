import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

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
const diagnosis = (blockerId: string, changes = {}) => {
  const file = 'diagnosis.json';
  fs.writeFileSync(path.join(dir, 'diagnostic-output.txt'), 'Controlled session fixture expired.');
  fs.writeFileSync(
    path.join(dir, file),
    JSON.stringify({
      evidence: 'diagnostic-output.txt',
      sha256: createHash('sha256').update('Controlled session fixture expired.').digest('hex'),
      blockerId,
      kind: 'diagnosis',
      checkedAt: new Date().toISOString(),
      classification: 'credential',
      source: 'test:session',
      command: 'read test session',
      observed: 'Controlled fixture: session expired.',
      selfCauseChecked: true,
      selfCauseCheck: 'Verified route and profile in fixture.',
      authorizedRepairAvailable: false,
      authorityCheck: 'Fixture requires user sign-in.',
      noSafeAlternativeReason: 'Do not bypass sign-in.',
      ...changes,
    })
  );
  return file;
};
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
  vi.restoreAllMocks();
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
    await event({ action: 'ask', blockerId, verification: diagnosis(blockerId) });
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

  it.each(['solvable', 'unknown'])(
    'keeps diagnosis mandatory after resuming a decision as %s and relabeling it',
    async (category) => {
      const { blockerId } = await open({ category: 'decision' });
      await event({
        action: 'resume',
        blockerId,
        category,
        evidence: proof(blockerId, 'change.json', 'change'),
      });
      await event({ action: 'classify', blockerId, category: 'decision' });
      const register = JSON.parse(fs.readFileSync(path.join(dir, 'blocker-register.json'), 'utf8'));
      expect(register.blockers[blockerId]).toMatchObject({ needsDiagnosis: true, epoch: 1 });
      await expect(event({ action: 'ask', blockerId })).rejects.toThrow();
      expect(
        (await event({ action: 'ask', blockerId, verification: diagnosis(blockerId) })).allowed
      ).toBe(true);
      expect((await event({ action: 'ask', blockerId })).allowed).toBe(false);
    }
  );

  it('preserves legacy business questions but requires diagnosis after technical resume', async () => {
    const { blockerId } = await open({ category: 'decision' });
    const file = path.join(dir, 'blocker-register.json');
    const register = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete register.blockers[blockerId].needsDiagnosis;
    fs.writeFileSync(file, JSON.stringify(register));
    await event({ action: 'classify', blockerId, category: 'decision' });
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).blockers[blockerId].needsDiagnosis).toBe(
      false
    );
    expect((await event({ action: 'ask', blockerId })).allowed).toBe(true);
    await event({
      action: 'resume',
      blockerId,
      category: 'solvable',
      evidence: proof(blockerId, 'change.json', 'change'),
    });
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).blockers[blockerId].needsDiagnosis).toBe(true);
    expect((await event({ action: 'ask', blockerId })).allowed).toBe(false);
  });

  it.each(['access', 'external', 'capability', 'solvable', 'unknown'])(
    'retains an existing technical %s classification when the diagnosis flag is absent or false',
    async (category) => {
      const { blockerId } = await open({ category });
      const file = path.join(dir, 'blocker-register.json');
      const original = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const needsDiagnosis of [undefined, false]) {
        const register = structuredClone(original);
        register.blockers[blockerId].needsDiagnosis = needsDiagnosis;
        fs.writeFileSync(file, JSON.stringify(register));
        await event({ action: 'classify', blockerId, category: 'decision' });
        await event({ action: 'classify', blockerId, category: 'decision' });
        expect(JSON.parse(fs.readFileSync(file, 'utf8')).blockers[blockerId].needsDiagnosis).toBe(
          true
        );
        await expect(event({ action: 'ask', blockerId })).rejects.toThrow();
      }
    }
  );

  it.each(['access', 'external', 'capability', 'solvable', 'unknown'])(
    'keeps a new technical %s classification sticky for a legacy decision',
    async (category) => {
      const { blockerId } = await open({ category: 'decision' });
      const file = path.join(dir, 'blocker-register.json');
      const register = JSON.parse(fs.readFileSync(file, 'utf8'));
      delete register.blockers[blockerId].needsDiagnosis;
      fs.writeFileSync(file, JSON.stringify(register));
      await event({ action: 'classify', blockerId, category });
      await event({ action: 'classify', blockerId, category: 'decision' });
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).blockers[blockerId].needsDiagnosis).toBe(
        true
      );
      await expect(event({ action: 'ask', blockerId })).rejects.toThrow();
    }
  );

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
    const verification = diagnosis(blockerId);
    const outcomes = await Promise.allSettled([
      event({ action: 'ask', blockerId, verification }),
      event({ action: 'ask', blockerId, verification }),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled' && r.value.allowed)).toHaveLength(1);
    expect((await event({ action: 'ask', blockerId })).allowed).toBe(false);
  });

  it('preserves the wait between separate CLI processes', async () => {
    const { blockerId } = await open();
    const file = path.join(dir, 'event.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ action: 'ask', blockerId, verification: diagnosis(blockerId) })
    );
    const run = () =>
      spawnSync(process.execPath, [helper, '--state-dir', dir, '--event', file], {
        encoding: 'utf8',
      });
    expect(run().status).toBe(0);
    const repeated = run();
    expect(repeated.status).toBe(1);
    expect(JSON.parse(repeated.stdout).allowed).toBe(false);
  });

  it('accepts raw binary diagnostic output and rechecks the original bytes', async () => {
    const { blockerId } = await open();
    const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x80]);
    const verification = diagnosis(blockerId, {
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    fs.writeFileSync(path.join(dir, 'diagnostic-output.txt'), bytes);
    expect((await event({ action: 'ask', blockerId, verification })).allowed).toBe(true);
    expect((await inspect()).blockers[0].reason).toBeUndefined();
    fs.writeFileSync(
      path.join(dir, 'diagnostic-output.txt'),
      Buffer.from([0xff, 0xfe, 0x01, 0x80])
    );
    expect((await inspect()).blockers[0].reason).toBe('evidence_invalid');
    await expect(event({ action: 'ask', blockerId })).rejects.toThrow();
    expect(fs.existsSync(path.join(dir, '.gofer-blocker.lock'))).toBe(false);
  });

  it('rejects changed bytes even when UTF-8 decoding produces identical text', async () => {
    const { blockerId } = await open();
    const bytes = Buffer.from([0xef, 0xbf, 0xbd]);
    const verification = diagnosis(blockerId, {
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    fs.writeFileSync(path.join(dir, 'diagnostic-output.txt'), bytes);
    await event({ action: 'ask', blockerId, verification });
    const changed = Buffer.from([0xff]);
    expect(changed.toString('utf8')).toBe(bytes.toString('utf8'));
    fs.writeFileSync(path.join(dir, 'diagnostic-output.txt'), changed);
    expect((await inspect()).blockers[0].reason).toBe('evidence_invalid');
  });

  it.each(['directory', 'oversized'])(
    'rejects %s evidence without consuming the question or leaving a lock',
    async (kind) => {
      const { blockerId } = await open();
      const verification = diagnosis(blockerId);
      const output = path.join(dir, 'diagnostic-output.txt');
      if (kind === 'directory') {
        fs.unlinkSync(output);
        fs.mkdirSync(output);
      } else {
        fs.truncateSync(output, 16 * 1024 * 1024 + 1);
      }
      const before = fs.readFileSync(path.join(dir, 'blocker-register.json'));
      await expect(event({ action: 'ask', blockerId, verification })).rejects.toThrow(
        kind === 'directory' ? 'regular file' : '16 MiB'
      );
      expect(fs.readFileSync(path.join(dir, 'blocker-register.json'))).toEqual(before);
      expect(fs.existsSync(path.join(dir, '.gofer-blocker.lock'))).toBe(false);
      fs.rmSync(output, { recursive: true });
      expect(
        (await event({ action: 'ask', blockerId, verification: diagnosis(blockerId) })).allowed
      ).toBe(true);
    }
  );

  it('accepts diagnostic output exactly at the 16 MiB boundary', async () => {
    const { blockerId } = await open();
    const bytes = Buffer.alloc(16 * 1024 * 1024, 0xff);
    const verification = diagnosis(blockerId, {
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    fs.writeFileSync(path.join(dir, 'diagnostic-output.txt'), bytes);
    expect((await event({ action: 'ask', blockerId, verification })).allowed).toBe(true);
    expect((await inspect()).blockers[0].reason).toBeUndefined();
  });

  it('bounds reads even when a regular file grows after the descriptor size check', async () => {
    const { blockerId } = await open();
    const verification = diagnosis(blockerId);
    const output = fs.realpathSync(path.join(dir, 'diagnostic-output.txt'));
    const originalOpen = fs.promises.open.bind(fs.promises);
    vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (args[0] === output) {
        const originalStat = handle.stat.bind(handle);
        vi.spyOn(handle, 'stat').mockImplementation(async () => {
          const stat = await originalStat();
          fs.truncateSync(output, 16 * 1024 * 1024 + 1);
          return stat;
        });
      }
      return handle;
    });
    await expect(event({ action: 'ask', blockerId, verification })).rejects.toThrow('16 MiB');
    expect(fs.existsSync(path.join(dir, '.gofer-blocker.lock'))).toBe(false);
  });

  it('rejects a file replaced by a nonregular entry immediately before opening it', async () => {
    const { blockerId } = await open();
    const verification = diagnosis(blockerId);
    fs.writeFileSync(
      path.join(dir, 'event.json'),
      JSON.stringify({ action: 'ask', blockerId, verification })
    );
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
          import fs from 'node:fs';
          import path from 'node:path';
          import { pathToFileURL } from 'node:url';
          import { spawnSync } from 'node:child_process';
          const dir = process.argv[2];
          const output = fs.realpathSync(path.join(dir, 'diagnostic-output.txt'));
          const open = fs.promises.open.bind(fs.promises);
          fs.promises.open = async (...args) => {
            if (args[0] === output) {
              fs.unlinkSync(output);
              if (process.platform === 'win32') fs.mkdirSync(output);
              else if (spawnSync('mkfifo', [output]).status !== 0) throw new Error('FIFO setup failed');
            }
            return open(...args);
          };
          const script = process.argv[1];
          process.argv[1] = 'controlled-race-harness';
          const { applyBlockerEvent } = await import(pathToFileURL(script).href);
          try {
            await applyBlockerEvent(dir, JSON.parse(fs.readFileSync(path.join(dir, 'event.json'))));
          } catch (error) {
            console.error(error.code || error.message);
            process.exitCode = 1;
          }
        `,
        helper,
        dir,
      ],
      { encoding: 'utf8', timeout: 5000 }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    if (process.platform === 'win32')
      expect(result.stderr).toMatch(/regular file|EISDIR|EPERM|EACCES/);
    else expect(result.stderr).toContain('regular file');
    expect(fs.existsSync(path.join(dir, '.gofer-blocker.lock'))).toBe(false);
  });

  it.each(['diagnostic-output.txt', 'diagnosis.json', 'blocker-register.json', 'event.json'])(
    'rejects nonregular %s promptly, without leaving a writer lock',
    async (file) => {
      const { blockerId } = await open();
      const verification = diagnosis(blockerId);
      const input = path.join(dir, 'event.json');
      fs.writeFileSync(input, JSON.stringify({ action: 'ask', blockerId, verification }));
      const fifo = path.join(dir, file);
      fs.unlinkSync(fifo);
      if (process.platform === 'win32') fs.mkdirSync(fifo);
      else expect(spawnSync('mkfifo', [fifo]).status).toBe(0);
      const result = spawnSync(process.execPath, [helper, '--state-dir', dir, '--event', input], {
        encoding: 'utf8',
        timeout: 5000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Blocker check stopped.');
      expect(result.stdout).toBe('');
      expect(fs.existsSync(path.join(dir, '.gofer-blocker.lock'))).toBe(false);
    }
  );

  it.each(['diagnosis.json', 'blocker-register.json', 'event.json'])(
    'bounds %s before parsing and keeps CLI errors private',
    async (file) => {
      const { blockerId } = await open();
      const verification = diagnosis(blockerId);
      const input = path.join(dir, 'event.json');
      fs.writeFileSync(input, JSON.stringify({ action: 'ask', blockerId, verification }));
      fs.writeFileSync(path.join(dir, file), 'PRIVATE_TEST_MARKER');
      const run = () =>
        spawnSync(process.execPath, [helper, '--state-dir', dir, '--event', input], {
          encoding: 'utf8',
          timeout: 5000,
        });
      for (const oversized of [false, true]) {
        if (oversized) fs.truncateSync(path.join(dir, file), 16 * 1024 * 1024 + 1);
        const result = run();
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Blocker check stopped.');
        expect(result.stderr).not.toContain('PRIVATE_TEST_MARKER');
        expect(result.stderr).not.toContain(dir);
        expect(result.stdout).toBe('');
        expect(fs.existsSync(path.join(dir, '.gofer-blocker.lock'))).toBe(false);
      }
    }
  );

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
