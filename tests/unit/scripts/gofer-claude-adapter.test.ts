import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  claudeSandboxPolicy,
  extractClaudeUsage,
  probeClaudeSandboxBoundary,
  startLocalClaudeInvocation,
} from '../../../.specify/scripts/node/gofer-claude-adapter.mjs';
import { inspectNativeWorkerEvidence } from '../../../.specify/scripts/node/gofer-native-adapter.mjs';

const roots: string[] = [];
afterEach(async () => {
  delete process.env.CLAUDECODE;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function temp(prefix: string) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), prefix)));
  roots.push(directory);
  return directory;
}
const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { env: clean, encoding: 'utf8' });

async function repository() {
  const root = await temp('gofer-claude-');
  const base = path.join(root, 'base');
  await mkdir(base);
  await writeFile(path.join(base, 'a.txt'), 'x');
  git(base, 'init', '-q', '-b', 'main');
  git(base, 'add', '-A');
  git(base, 'commit', '-q', '-m', 'b');
  const worktree = path.join(root, 'wt');
  git(base, 'worktree', 'add', '-q', '--detach', worktree, 'HEAD');
  return { root, base, worktree: await realpath(worktree), head: git(worktree, 'rev-parse', 'HEAD').trim() };
}

const RESULT = JSON.stringify({
  type: 'result', subtype: 'success', is_error: false, result: 'done', total_cost_usd: 0.0123,
  usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 5, output_tokens: 20 },
});
async function fakeClaude(body: string) {
  const directory = await temp('gofer-fake-claude-');
  const script = path.join(directory, 'claude');
  await writeFile(script, `#!/bin/sh\nprintf '%s\\n' "$@" > '${directory}/argv.txt'\nprintf '%s' "$CLAUDECODE" > '${directory}/env.txt'\n${body}\n`);
  await chmod(script, 0o755);
  return { script, directory };
}
const OK = `echo '${RESULT}'`;

async function start(f: Awaited<ReturnType<typeof repository>>, command: string, extra: Record<string, unknown> = {}) {
  return startLocalClaudeInvocation({
    isolatedWorkspace: f.worktree, prompt: 'do the task', modelId: 'haiku', capabilityReceiptHash: 'cap-1',
    allowedWriteScope: ['src/', 'NOTES.md'], command, expectedHead: f.head, usageReporting: true,
    hostOptions: { maxBudgetUsd: 0.5 }, receiptDirectory: await temp('gofer-claude-receipts-'), ...extra,
  });
}

describe.skipIf(process.platform === 'win32')('Claude sandbox policy', () => {
  it('denies the shared Git store, disables the unsandboxed fallback, and refuses a plain repository', async () => {
    const f = await repository();
    const policy = claudeSandboxPolicy(f.worktree);
    expect(policy?.common).toBe(await realpath(path.join(f.base, '.git')));
    const settings = JSON.parse(policy!.settings);
    expect(settings.sandbox).toMatchObject({
      enabled: true,
      allowUnsandboxedCommands: false,
      filesystem: { denyWrite: [policy!.common] },
    });
    expect(claudeSandboxPolicy(f.base)).toBeNull();
    expect(claudeSandboxPolicy('')).toBeNull();
  });

  it('can also deny reads of protected folders for the shell and the file tools', async () => {
    const f = await repository();
    const secret = await temp('gofer-claude-secret-');
    const settings = JSON.parse(claudeSandboxPolicy(f.worktree, { protectedReadPaths: [secret] })!.settings);
    expect(settings.sandbox.filesystem.denyRead).toEqual([secret]);
    expect(settings.permissions.deny).toEqual([`Read(/${secret}/**)`, `Edit(/${secret}/**)`, `Write(/${secret}/**)`]);
    expect(claudeSandboxPolicy(f.worktree, { protectedReadPaths: ['relative'] })).toBeNull();
  });
});

describe.skipIf(process.platform === 'win32')('Claude invocation through the shared launcher', () => {
  it('builds a sandboxed, budget-capped, scope-limited command and prices the usage', async () => {
    const f = await repository();
    const claude = await fakeClaude(`mkdir -p src; printf 'x' > src/file.txt\n${OK}`);
    process.env.CLAUDECODE = '1';
    const invocation = await start(f, claude.script);
    const result = await invocation.wait();
    const argv = (await readFile(path.join(claude.directory, 'argv.txt'), 'utf8')).split('\n');
    expect(argv).toEqual(expect.arrayContaining(['-p', 'do the task', '--permission-mode', 'dontAsk', '--max-budget-usd', '0.5', '--strict-mcp-config']));
    const settings = JSON.parse(argv[argv.indexOf('--settings') + 1]);
    expect(settings.sandbox.allowUnsandboxedCommands).toBe(false);
    expect(argv[argv.indexOf('--allowedTools') + 1]).toBe('Bash,Read,Glob,Grep,Edit(src/**),Write(src/**),Edit(NOTES.md),Write(NOTES.md)');
    expect(await readFile(path.join(claude.directory, 'env.txt'), 'utf8')).toBe('');
    expect(result.usage).toEqual({ inputTokens: 105, cachedInputTokens: 90, outputTokens: 20, reportedCostUsd: 0.0123 });
    expect(result.isolation).toBe('git-worktree+local-os-sandbox');
    expect(result.invocationId).toMatch(/^claude-/);
  });

  it('fails a write outside the allowed scope', async () => {
    const f = await repository();
    const claude = await fakeClaude(`printf 'x' > outside.txt\n${OK}`);
    await expect((await start(f, claude.script)).wait()).rejects.toThrow('NATIVE_SCOPE_VIOLATION');
  });

  it('removes only an empty Claude bookkeeping folder, and still flags a file placed there', async () => {
    const f = await repository();
    const empty = await fakeClaude(`mkdir -p .claude/.cc-writes\n${OK}`);
    const result = await (await start(f, empty.script)).wait();
    expect(result.changedFiles).toEqual([]);
    expect(existsSync(path.join(f.worktree, '.claude'))).toBe(false);
    const hiding = await fakeClaude(`mkdir -p .claude/.cc-writes; printf 'x' > .claude/.cc-writes/hidden\n${OK}`);
    await expect((await start(f, hiding.script)).wait()).rejects.toThrow('NATIVE_SCOPE_VIOLATION');
  });

  it('fails a worker that commits to git', async () => {
    const f = await repository();
    const claude = await fakeClaude(`mkdir -p src; printf 'x' > src/f.txt; git -c user.name=x -c user.email=x@x add -A; git -c user.name=x -c user.email=x@x commit -q -m sneaky\n${OK}`);
    await expect((await start(f, claude.script)).wait()).rejects.toThrow('NATIVE_UNAUTHORIZED_GIT_CHANGE');
  });

  it('fails when Claude reports an error or returns something unreadable, even with exit code 0', async () => {
    const f = await repository();
    const errored = await fakeClaude(`echo '{"type":"result","subtype":"error_max_turns","is_error":true,"result":"x"}'`);
    await expect((await start(f, errored.script)).wait()).rejects.toThrow('NATIVE_HOST_REPORTED_ERROR');
    const garbage = await fakeClaude('echo not-json');
    await expect((await start(f, garbage.script)).wait()).rejects.toThrow('NATIVE_HOST_RESULT_UNPARSEABLE');
  });

  it('rejects an unpinned command, a missing budget, and a worktree without a separate Git store', async () => {
    const f = await repository();
    const claude = await fakeClaude(OK);
    await expect(start(f, 'claude')).rejects.toThrow('NATIVE_HOST_COMMAND_MUST_BE_PINNED');
    await expect(start(f, claude.script, { hostOptions: {} })).rejects.toThrow('INVALID_NATIVE_REQUEST');
    await expect(start(f, claude.script, { hostOptions: { maxBudgetUsd: 500 } })).rejects.toThrow('INVALID_NATIVE_REQUEST');
    await expect(start({ ...f, worktree: f.base }, claude.script, { expectedHead: undefined })).rejects.toThrow('LOCAL_SANDBOX_REQUIRED');
  });

  it('records stop evidence and a confirmed cancellation the shared verifier accepts', async () => {
    const f = await repository();
    const evidence = await temp('gofer-claude-evidence-');
    const claude = await fakeClaude('sleep 30');
    const invocation = await start(f, claude.script, {
      evidenceDirectory: path.join(evidence, 'e'), objectiveRevision: 'rev-1', leaseId: 'lease-1', worktreeReceipt: 'wt-1',
    });
    expect((await invocation.inspect()).state).toBe('running');
    await invocation.cancel();
    const state = await invocation.inspect();
    expect(state).toMatchObject({ cancelled: true, state: 'exited' });
    const names = await readdir(path.join(evidence, 'e'));
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^native-worker-claude-[0-9a-f-]+\.jsonl$/);
    const proof = await inspectNativeWorkerEvidence({
      evidenceDirectory: path.join(evidence, 'e'), revision: 'rev-1', journalHash: 'journal',
      authorizations: [{ leaseId: 'lease-1', capabilityReceiptHash: 'cap-1', worktreeReceipt: 'wt-1', isolatedWorkspace: f.worktree }],
    });
    expect(proof).toMatchObject({ allStopped: true, cancelledLeases: ['lease-1'] });
  });
});

describe('Claude usage', () => {
  it('maps Claude token counts and rejects incomplete usage', () => {
    expect(extractClaudeUsage(RESULT)).toEqual({ inputTokens: 105, cachedInputTokens: 90, outputTokens: 20, reportedCostUsd: 0.0123 });
    expect(extractClaudeUsage(`log line\n${RESULT}`)).not.toBeNull();
    expect(extractClaudeUsage('not json')).toBeNull();
    expect(extractClaudeUsage('{"usage":{"input_tokens":1}}')).toBeNull();
    expect(extractClaudeUsage('{"usage":{"input_tokens":-1,"output_tokens":1}}')).toBeNull();
  });
});

describe.skipIf(process.platform === 'win32')('Claude boundary probe', () => {
  // The probe spends real model tokens, so these tests inject the model call.
  const REFUSED = '1 ok. 2 Operation not permitted. 3 Operation not permitted. 4 denied.';
  const modelThat = (behaviour: (paths: { inside: string; outside: string; store: string; tool: string }) => void, report = REFUSED) =>
    (_exe: string, args: string[]) => {
      const prompt = args[1];
      const paths = {
        inside: /touch (\S+) \(2\)/.exec(prompt)![1], outside: /\(2\) touch (\S+) \(3\)/.exec(prompt)![1],
        store: /\(3\) touch (\S+)\./.exec(prompt)![1], tool: /create (\S+) with/.exec(prompt)![1],
      };
      behaviour(paths);
      return { status: 0, stdout: JSON.stringify({ is_error: false, result: report }) };
    };
  const touch = (file: string) => execFileSync('touch', [file]);

  it('passes when only the allowed write happens, and cleans up', async () => {
    const f = await repository();
    const before = await readdir(f.root);
    const held = probeClaudeSandboxBoundary({ workspaceRoot: f.worktree, executable: '/x/claude',
      run: modelThat((p) => touch(p.inside)) as never });
    expect(held).toBe('/x/claude');
    expect(await readdir(f.root)).toEqual(before);
  });

  it.each(['outside', 'store', 'tool'] as const)('fails when the %s write leaks', async (leak) => {
    const f = await repository();
    const held = probeClaudeSandboxBoundary({ workspaceRoot: f.worktree, executable: '/x/claude',
      run: modelThat((p) => { touch(p.inside); touch(p[leak]); }) as never });
    expect(held).toBeNull();
    expect(existsSync(path.join(f.base, '.git', `.gofer-claude-probe-${process.pid}`))).toBe(false);
  });

  it('fails when the model did not report the refusals, even though nothing leaked', async () => {
    const f = await repository();
    const silent = probeClaudeSandboxBoundary({ workspaceRoot: f.worktree, executable: '/x/claude',
      run: modelThat((p) => touch(p.inside), 'All done.') as never });
    expect(silent).toBeNull();
  });

  it('fails when the allowed write did not happen, and for an unpinned command or plain repository', async () => {
    const f = await repository();
    expect(probeClaudeSandboxBoundary({ workspaceRoot: f.worktree, executable: '/x/claude', run: modelThat(() => {}) as never })).toBeNull();
    expect(probeClaudeSandboxBoundary({ workspaceRoot: f.worktree, executable: 'claude' })).toBeNull();
    expect(probeClaudeSandboxBoundary({ workspaceRoot: f.base, executable: '/x/claude' })).toBeNull();
  });
});
