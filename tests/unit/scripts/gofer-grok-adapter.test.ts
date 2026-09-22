import { execFileSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  extractGrokUsage,
  grokSandboxPolicy,
  probeGrokSandboxBoundary,
  startLocalGrokInvocation,
} from '../../../.specify/scripts/node/gofer-grok-adapter.mjs';
import { inspectNativeWorkerEvidence } from '../../../.specify/scripts/node/gofer-native-adapter.mjs';

const roots: string[] = [];
afterEach(async () => {
  delete process.env.GROK_SANDBOX;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function temp(prefix: string, parent = tmpdir()) {
  const directory = await realpath(await mkdtemp(path.join(parent, prefix)));
  roots.push(directory);
  return directory;
}
const clean = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    env: clean,
    encoding: 'utf8',
  });

async function repository(parent = tmpdir()) {
  const root = await temp('gofer-grok-', parent);
  const base = path.join(root, 'base');
  await mkdir(base);
  await writeFile(path.join(base, 'a.txt'), 'x');
  git(base, 'init', '-q', '-b', 'main');
  git(base, 'add', '-A');
  git(base, 'commit', '-q', '-m', 'b');
  const worktree = path.join(root, 'wt');
  git(base, 'worktree', 'add', '-q', '--detach', worktree, 'HEAD');
  return {
    root,
    base,
    worktree: await realpath(worktree),
    head: git(worktree, 'rev-parse', 'HEAD').trim(),
  };
}

// Test folders live in the OS temp folder, which the real policy refuses, so
// tests name a different (empty) list of temp roots. Production never does.
const NO_TEMP = ['/nonexistent-gofer-root'];
const RESULT = JSON.stringify({
  text: 'done',
  stopReason: 'end_turn',
  total_cost_usd: 0.0123,
  usage: {
    input_tokens: 10,
    cache_read_input_tokens: 90,
    cache_creation_input_tokens: 5,
    output_tokens: 20,
    reasoning_tokens: 3,
    total_tokens: 125,
  },
});
async function fakeGrok(body: string) {
  const directory = await temp('gofer-fake-grok-');
  const script = path.join(directory, 'grok');
  await writeFile(
    script,
    `#!/bin/sh\nprintf '%s\\n' "$@" > '${directory}/argv.txt'\ncat .grok/sandbox.toml > '${directory}/profile.toml' 2>/dev/null\nprintf '%s' "$GROK_SANDBOX" > '${directory}/env.txt'\n${body}\n`
  );
  await chmod(script, 0o755);
  return { script, directory };
}
const OK = `echo '${RESULT}'`;

async function start(
  f: Awaited<ReturnType<typeof repository>>,
  command: string,
  extra: Record<string, unknown> = {}
) {
  return startLocalGrokInvocation({
    isolatedWorkspace: f.worktree,
    prompt: 'do the task',
    modelId: 'grok-4.5',
    capabilityReceiptHash: 'cap-1',
    allowedWriteScope: ['src/', 'NOTES.md'],
    command,
    expectedHead: f.head,
    usageReporting: true,
    hostOptions: { maxTurns: 5, temporaryRoots: NO_TEMP },
    receiptDirectory: await temp('gofer-grok-receipts-'),
    ...extra,
  });
}

describe.skipIf(process.platform === 'win32')('Grok sandbox policy', () => {
  it('extends strict, denies the temp folders, and uses a random profile name', async () => {
    const home = await repository(os.homedir());
    const first = grokSandboxPolicy(home.worktree);
    const second = grokSandboxPolicy(home.worktree);
    expect(first!.profileName).toMatch(/^gofer-[0-9a-f]{16}$/);
    expect(first!.profileName).not.toBe(second!.profileName);
    expect(first!.toml).toContain('extends = "strict"');
    const denied = JSON.parse(/deny = (\[.*\])/.exec(first!.toml)![1]);
    expect(denied).toContain(await realpath('/tmp'));
    expect(denied.every((item: string) => existsSync(item))).toBe(true);
    expect(first!.common).toBe(await realpath(path.join(home.base, '.git')));
  });

  it('refuses a worktree or Git store inside the temp folders, a plain repository, and an existing sandbox file', async () => {
    const inTemp = await repository();
    expect(grokSandboxPolicy(inTemp.worktree)).toBeNull();
    const home = await repository(os.homedir());
    expect(grokSandboxPolicy(home.base)).toBeNull();
    await mkdir(path.join(home.worktree, '.grok'));
    await writeFile(path.join(home.worktree, '.grok', 'sandbox.toml'), '');
    expect(grokSandboxPolicy(home.worktree)).toBeNull();
    expect(grokSandboxPolicy('')).toBeNull();
  });
});

describe.skipIf(process.platform === 'win32')('Grok invocation through the shared launcher', () => {
  it('writes the profile before start, removes it after, builds a bounded command, and prices the usage', async () => {
    const f = await repository();
    const grok = await fakeGrok(`mkdir -p src; printf 'x' > src/file.txt\n${OK}`);
    process.env.GROK_SANDBOX = 'off';
    const invocation = await start(f, grok.script);
    const result = await invocation.wait();
    const argv = (await readFile(path.join(grok.directory, 'argv.txt'), 'utf8')).split('\n');
    const profile = await readFile(path.join(grok.directory, 'profile.toml'), 'utf8');
    const name = argv[argv.indexOf('--sandbox') + 1];
    expect(profile).toContain(`[profiles.${name}]`);
    expect(profile).toContain('extends = "strict"');
    expect(argv).toEqual(
      expect.arrayContaining([
        '-p',
        'do the task',
        '--cwd',
        f.worktree,
        '--always-approve',
        '--max-turns',
        '5',
        '--no-subagents',
      ])
    );
    expect(await readFile(path.join(grok.directory, 'env.txt'), 'utf8')).toBe('');
    expect(existsSync(path.join(f.worktree, '.grok'))).toBe(false);
    expect(result.usage).toEqual({
      inputTokens: 105,
      cachedInputTokens: 90,
      outputTokens: 20,
      reportedCostUsd: 0.0123,
    });
    expect(result.invocationId).toMatch(/^grok-/);
  });

  it('kills the process at once when the sandbox could not be applied, and rejects the run', async () => {
    const f = await repository();
    const grok = await fakeGrok(
      `echo 'warning: sandbox could not be applied: profile not found' >&2\nsleep 3\ntouch '${f.worktree}/ran-unsandboxed.txt'\n${OK}`
    );
    const evidence = await temp('gofer-grok-evidence-');
    const started = Date.now();
    // As in production, run with process-group evidence so the whole group is killed.
    const invocation = await start(f, grok.script, {
      evidenceDirectory: path.join(evidence, 'e'),
      objectiveRevision: 'rev',
      leaseId: 'lease',
      worktreeReceipt: 'wt',
    });
    await expect(invocation.wait()).rejects.toThrow('NATIVE_HOST_SANDBOX_NOT_APPLIED');
    expect(Date.now() - started).toBeLessThan(2500);
    expect(existsSync(path.join(f.worktree, 'ran-unsandboxed.txt'))).toBe(false);
    expect(existsSync(path.join(f.worktree, '.grok'))).toBe(false);
  });

  it('removes the profile even if the worker rewrote it, and still flags any other file in .grok', async () => {
    const f = await repository();
    const rewriter = await fakeGrok(`printf 'weakened' > .grok/sandbox.toml\n${OK}`);
    const result = await (await start(f, rewriter.script)).wait();
    expect(result.changedFiles).toEqual([]);
    expect(existsSync(path.join(f.worktree, '.grok'))).toBe(false);
    const hider = await fakeGrok(`printf 'x' > .grok/hidden\n${OK}`);
    await expect((await start(f, hider.script)).wait()).rejects.toThrow('NATIVE_SCOPE_VIOLATION');
  });

  it('fails a write outside the allowed scope and a commit', async () => {
    const f = await repository();
    const outside = await fakeGrok(`printf 'x' > outside.txt\n${OK}`);
    await expect((await start(f, outside.script)).wait()).rejects.toThrow('NATIVE_SCOPE_VIOLATION');
    const commit = await fakeGrok(
      `mkdir -p src; printf 'x' > src/f.txt; git -c user.name=x -c user.email=x@x add -A; git -c user.name=x -c user.email=x@x commit -q -m sneaky\n${OK}`
    );
    await expect((await start(f, commit.script)).wait()).rejects.toThrow(
      'NATIVE_UNAUTHORIZED_GIT_CHANGE'
    );
  });

  it('fails when Grok stops for any reason other than finishing, or returns something unreadable', async () => {
    const f = await repository();
    const limited = await fakeGrok(`echo '{"text":"x","stopReason":"max_turns"}'`);
    await expect((await start(f, limited.script)).wait()).rejects.toThrow(
      'NATIVE_HOST_REPORTED_ERROR'
    );
    const garbage = await fakeGrok('echo not-json');
    await expect((await start(f, garbage.script)).wait()).rejects.toThrow(
      'NATIVE_HOST_RESULT_UNPARSEABLE'
    );
  });

  it('rejects an unpinned command, missing or excessive turn limits, and a layout it cannot protect', async () => {
    const f = await repository();
    const grok = await fakeGrok(OK);
    await expect(start(f, 'grok')).rejects.toThrow('NATIVE_HOST_COMMAND_MUST_BE_PINNED');
    await expect(
      start(f, grok.script, { hostOptions: { temporaryRoots: NO_TEMP } })
    ).rejects.toThrow('INVALID_NATIVE_REQUEST');
    await expect(
      start(f, grok.script, { hostOptions: { maxTurns: 500, temporaryRoots: NO_TEMP } })
    ).rejects.toThrow('INVALID_NATIVE_REQUEST');
    await expect(start(f, grok.script, { hostOptions: { maxTurns: 5 } })).rejects.toThrow(
      'LOCAL_SANDBOX_REQUIRED'
    );
    await expect(
      start({ ...f, worktree: f.base }, grok.script, { expectedHead: undefined })
    ).rejects.toThrow('LOCAL_SANDBOX_REQUIRED');
    expect(existsSync(path.join(f.worktree, '.grok'))).toBe(false);
  });

  it('records stop evidence and a confirmed cancellation the shared verifier accepts', async () => {
    const f = await repository();
    const evidence = await temp('gofer-grok-evidence-');
    const grok = await fakeGrok('sleep 30');
    const invocation = await start(f, grok.script, {
      evidenceDirectory: path.join(evidence, 'e'),
      objectiveRevision: 'rev-1',
      leaseId: 'lease-1',
      worktreeReceipt: 'wt-1',
    });
    await invocation.cancel();
    expect(await invocation.inspect()).toMatchObject({ cancelled: true, state: 'exited' });
    const names = await readdir(path.join(evidence, 'e'));
    expect(names[0]).toMatch(/^native-worker-grok-[0-9a-f-]+\.jsonl$/);
    const proof = await inspectNativeWorkerEvidence({
      evidenceDirectory: path.join(evidence, 'e'),
      revision: 'rev-1',
      journalHash: 'journal',
      authorizations: [
        {
          leaseId: 'lease-1',
          capabilityReceiptHash: 'cap-1',
          worktreeReceipt: 'wt-1',
          isolatedWorkspace: f.worktree,
        },
      ],
    });
    expect(proof).toMatchObject({ allStopped: true, cancelledLeases: ['lease-1'] });
    expect(existsSync(path.join(f.worktree, '.grok'))).toBe(false);
  });
});

describe('Grok usage', () => {
  it('maps Grok token counts and rejects incomplete usage', () => {
    expect(extractGrokUsage(RESULT)).toEqual({
      inputTokens: 105,
      cachedInputTokens: 90,
      outputTokens: 20,
      reportedCostUsd: 0.0123,
    });
    expect(extractGrokUsage('not json')).toBeNull();
    expect(extractGrokUsage('{"usage":{"input_tokens":1}}')).toBeNull();
  });
});

describe.skipIf(process.platform === 'win32')('Grok boundary probe', () => {
  // The probe spends real model tokens, so these tests inject the model call.
  const REFUSED = '1 ok. 2 not permitted. 3 not permitted. 4 not permitted. 5 not permitted.';
  const touch = (file: string) => execFileSync('touch', [file]);
  const modelThat =
    (leak: number[] = [], report = REFUSED) =>
    (_exe: string, args: string[]) => {
      const prompt = args[1];
      const paths = [...prompt.matchAll(/touch (\/\S+)/g)].map((match) =>
        match[1].replace(/\.$/, '')
      );
      touch(paths[0]);
      for (const index of leak) touch(paths[index]);
      return {
        status: 0,
        stdout: JSON.stringify({ text: report, stopReason: 'end_turn' }),
        stderr: '',
      };
    };
  const probe = (f: Awaited<ReturnType<typeof repository>>, run: unknown) =>
    probeGrokSandboxBoundary({
      workspaceRoot: f.worktree,
      executable: '/x/grok',
      temporaryRoots: NO_TEMP,
      run: run as never,
    });

  it('passes when only the allowed write happens, and cleans up', async () => {
    const f = await repository();
    const before = await readdir(f.root);
    expect(probe(f, modelThat())).toBe('/x/grok');
    expect(await readdir(f.root)).toEqual(before);
    expect(existsSync(path.join(f.worktree, '.grok'))).toBe(false);
  });

  it.each([
    [1, 'sibling'],
    [2, 'Git store'],
    [3, 'temp folder'],
    [4, 'Grok home'],
  ])('fails when write %i (%s) leaks', async (index) => {
    const f = await repository();
    expect(probe(f, modelThat())).toBe('/x/grok');
    expect(probe(f, modelThat([index]))).toBeNull();
    for (const leaked of [
      path.join(os.tmpdir(), `.gofer-grok-probe-${process.pid}`),
      path.join(os.homedir(), '.grok', `.gofer-grok-probe-${process.pid}`),
    ]) {
      expect(existsSync(leaked)).toBe(false);
    }
  });

  it('fails when the model did not report the refusals, when the sandbox failed, and for a bad layout', async () => {
    const f = await repository();
    expect(probe(f, modelThat([], 'All done.'))).toBeNull();
    const failed = () => ({
      status: 0,
      stdout: JSON.stringify({ text: REFUSED, stopReason: 'end_turn' }),
      stderr: 'warning: sandbox could not be applied',
    });
    expect(probe(f, failed)).toBeNull();
    expect(probeGrokSandboxBoundary({ workspaceRoot: f.worktree, executable: 'grok' })).toBeNull();
    expect(
      probeGrokSandboxBoundary({
        workspaceRoot: f.base,
        executable: '/x/grok',
        temporaryRoots: NO_TEMP,
      })
    ).toBeNull();
    expect(
      probeGrokSandboxBoundary({ workspaceRoot: f.worktree, executable: '/x/grok' })
    ).toBeNull();
  });
});
