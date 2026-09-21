import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createAcceptanceChecker } from '../../../.specify/scripts/node/gofer-acceptance-check.mjs';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(source: string, extra = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'gofer-real-check-'));
  roots.push(root);
  const options = {
    workspaceRoot: root,
    evidenceDir: path.join(root, 'evidence'),
    commands: { acceptance: { program: process.execPath, args: ['-e', source] } },
    getInputRevision: async () => 'input-1',
    // This fixture runs known Node snippets; it is not a native containment proof.
    verifyCleanup: async (r: any) => ({ ...r, allStopped: true, receipt: 'fixture-cleanup' }),
    timeoutMs: 2000,
    ...extra,
  };
  return {
    root,
    options,
    check: createAcceptanceChecker(options),
    request: { taskId: 'T001', revision: 'goal-1', inputRevision: 'input-1', check: 'acceptance' },
  };
}
describe('Approved real acceptance execution (not native model proof)', () => {
  it('does not publish passing evidence when cancellation occurs during cleanup', async () => {
    const controller = new AbortController();
    const f = await fixture('', {
      verifyCleanup: async (r: any) => {
        controller.abort();
        return { ...r, allStopped: true, receipt: 'fixture' };
      },
    });
    const result = await f.check({ ...f.request, signal: controller.signal });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(await readFile(result.receipt, 'utf8')).reason).toBe('cancelled');
  });
  it('does not pass without independent process cleanup evidence', async () => {
    const f = await fixture('', { verifyCleanup: undefined });
    expect((await f.check(f.request)).reason).toBe('cleanup-unverified');
  });
  it('keeps check identity immutable across asynchronous work', async () => {
    const f = await fixture('');
    const pending = f.check(f.request);
    f.request.check = 'NOT-APPROVED';
    const result = await pending;
    expect(result.check).toBe('acceptance');
    expect(JSON.parse(await readFile(result.receipt, 'utf8')).check).toBe('acceptance');
  });
  it('preserves failure output when the post-check input read fails', async () => {
    let calls = 0;
    const f = await fixture('console.log("measured failure"); process.exit(7)', {
      getInputRevision: async () => {
        if (++calls > 1) throw new Error('missing input');
        return 'input-1';
      },
    });
    const result = await f.check(f.request);
    expect(result.reason).toBe('input-unverifiable');
    expect(JSON.parse(await readFile(result.receipt, 'utf8')).output).toBe('measured failure\n');
  });
  it.skipIf(process.platform === 'win32')(
    'bounds a POSIX detached descendant keeping output pipes open',
    async () => {
      const f = await fixture(
        'const {spawn}=require("child_process"); const c=spawn(process.execPath,["-e","setInterval(()=>{},100)"],{detached:true,stdio:["ignore",1,2]}); console.log(c.pid); c.unref()',
        { timeoutMs: 100, verifyCleanup: undefined }
      );
      let pid: number | undefined;
      try {
        const started = Date.now();
        const result = await f.check(f.request);
        const receipt = JSON.parse(await readFile(result.receipt, 'utf8'));
        pid = Number(receipt.output.trim());
        expect(result.exitCode).not.toBe(0);
        expect(result.cleanupVerified).toBe(false);
        expect(Date.now() - started).toBeLessThan(4000);
      } finally {
        if (pid && Number.isInteger(pid)) {
          try {
            process.kill(-pid, 'SIGKILL');
          } catch {
            /* fixture already stopped */
          }
        }
      }
    }
  );
  it('executes a real process and saves private evidence', async () => {
    const f = await fixture('console.log("actual result")');
    const result = await f.check(f.request);
    expect(result.executed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.nativeModelProof).toBe(false);
    const receipt = JSON.parse(await readFile(result.receipt, 'utf8'));
    expect(receipt.output).toBe('actual result\n');
    expect(receipt.outputSha256).toMatch(/^[a-f0-9]{64}$/);
    if (process.platform !== 'win32') expect((await stat(result.receipt)).mode & 0o777).toBe(0o600);
    expect(result).not.toHaveProperty('output');
  });
  it('does not accept successful-looking output from a failing process', async () => {
    const f = await fixture('console.log("PASS"); process.exit(7)');
    expect((await f.check(f.request)).exitCode).toBe(7);
  });
  it('rejects a check not approved in host configuration', async () => {
    const f = await fixture('');
    await expect(f.check({ ...f.request, check: 'other' })).rejects.toThrow('UNAPPROVED_CHECK');
  });
  it('copies configuration so workers cannot replace approved commands', async () => {
    const f = await fixture('process.exit(4)');
    f.options.commands.acceptance.args = ['-e', 'process.exit(0)'];
    expect((await f.check(f.request)).exitCode).toBe(4);
  });
  it('never opens a shell for argument metacharacters', async () => {
    const f = await fixture('');
    const check = createAcceptanceChecker({
      ...f.options,
      commands: {
        acceptance: {
          program: process.execPath,
          args: ['-e', 'console.log(process.argv[1])', '$(whoami); && echo bad'],
        },
      },
    });
    const result = await check(f.request);
    expect(JSON.parse(await readFile(result.receipt, 'utf8')).output).toBe(
      '$(whoami); && echo bad\n'
    );
  });
  it('fails bounded oversized output', async () => {
    const f = await fixture('console.log("x".repeat(10000))', { maxOutputBytes: 32 });
    const result = await f.check(f.request);
    expect(result.exitCode).toBe(1);
    expect(result.reason).toBe('output-limit');
    expect(JSON.parse(await readFile(result.receipt, 'utf8')).capturedBytes).toBe(32);
  });
  it('stops a process that exceeds its timeout', async () => {
    const f = await fixture('setInterval(() => {}, 100)', { timeoutMs: 150 });
    const result = await f.check(f.request);
    expect(result.reason).toBe('timeout');
    expect(result.exitCode).toBe(1);
  });
  it('does not start an already cancelled check', async () => {
    const f = await fixture('');
    await expect(f.check({ ...f.request, signal: AbortSignal.abort() })).rejects.toThrow(
      'CANCELLED'
    );
  });
  it('fails rather than passing after cancellation during execution', async () => {
    const f = await fixture('setInterval(() => {}, 100)');
    const controller = new AbortController();
    const pending = f.check({ ...f.request, signal: controller.signal });
    const timer = setTimeout(() => controller.abort(), 100);
    try {
      expect((await pending).reason).toBe('cancelled');
    } finally {
      clearTimeout(timer);
    }
  });
  it('rejects stale inputs before execution', async () => {
    const f = await fixture('', { getInputRevision: async () => 'other' });
    await expect(f.check(f.request)).rejects.toThrow('STALE_INPUT');
  });
  it('fails if inputs changed during a successful check', async () => {
    let count = 0;
    const f = await fixture('', {
      getInputRevision: async () => (++count === 1 ? 'input-1' : 'changed'),
    });
    expect((await f.check(f.request)).reason).toBe('stale-input');
  });
  it('reports an unavailable executable as unexecuted and failed', async () => {
    const f = await fixture('');
    const check = createAcceptanceChecker({
      ...f.options,
      commands: { acceptance: { program: path.join(f.root, 'missing'), args: [] } },
    });
    const result = await check(f.request);
    expect(result.executed).toBe(false);
    expect(result.exitCode).toBe(1);
  });
  it('rejects relative executables, shell wrappers and unlimited output', async () => {
    const f = await fixture('');
    for (const program of ['node', path.join(f.root, 'eai.cmd'), path.join(f.root, 'run.bat')]) {
      expect(() =>
        createAcceptanceChecker({ ...f.options, commands: { acceptance: { program, args: [] } } })
      ).toThrow();
    }
    expect(() => createAcceptanceChecker({ ...f.options, maxOutputBytes: Infinity })).toThrow();
  });
});
