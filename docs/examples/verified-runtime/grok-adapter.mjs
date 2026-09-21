#!/usr/bin/env node
// Try the Grok Build adapter against your own Grok install. Each step uses a
// throwaway repository and worktree UNDER YOUR HOME FOLDER (the adapter refuses
// worktrees in the OS temp folder) and spends a small amount of Grok usage.
//
//   node docs/examples/verified-runtime/grok-adapter.mjs probe    (about US$0.01)
//   node docs/examples/verified-runtime/grok-adapter.mjs task     (about US$0.01)
//   node docs/examples/verified-runtime/grok-adapter.mjs cancel   (under US$0.01)
//
// probe:  asks a real model to try one allowed and four forbidden writes, then checks the disk.
// task:   runs a real task that may only create one file.
// cancel: cancels a running task and checks the stop evidence the ledger relies on.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SCRIPTS, findExecutable, log } from './common.mjs';

const { probeGrokSandboxBoundary, startLocalGrokInvocation } = await import(`${SCRIPTS}/gofer-grok-adapter.mjs`);
const { inspectNativeWorkerEvidence } = await import(`${SCRIPTS}/gofer-native-adapter.mjs`);

const step = process.argv[2];
if (!['probe', 'task', 'cancel'].includes(step)) throw new Error('Usage: grok-adapter.mjs probe|task|cancel');
const grok = findExecutable('grok');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'user.name=x', '-c', 'user.email=x@x', ...args], { env, encoding: 'utf8' });

const root = realpathSync(mkdtempSync(path.join(os.homedir(), '.gofer-grok-example-')));
const base = path.join(root, 'base');
mkdirSync(base);
writeFileSync(path.join(base, 'a.txt'), 'x');
git(base, 'init', '-q', '-b', 'main'); git(base, 'add', '-A'); git(base, 'commit', '-q', '-m', 'base');
const worktree = path.join(root, 'wt');
git(base, 'worktree', 'add', '-q', '--detach', worktree, 'HEAD');
const head = git(worktree, 'rev-parse', 'HEAD').trim();
const start = (prompt, scope, extra = {}) => startLocalGrokInvocation({ isolatedWorkspace: realpathSync(worktree), prompt,
  modelId: 'grok-4.5', capabilityReceiptHash: 'example', allowedWriteScope: scope, command: grok, expectedHead: head,
  hostOptions: { maxTurns: 10 }, receiptDirectory: root, usageReporting: true, ...extra });

try {
  if (step === 'probe') {
    const held = probeGrokSandboxBoundary({ workspaceRoot: realpathSync(worktree), executable: grok });
    log(held ? 'boundary held: worktree write allowed; sibling, shared Git store, temp folder and Grok home writes refused'
      : 'boundary did NOT hold (or the model skipped the attempts). Do not use this host for isolated work.');
    process.exitCode = held ? 0 : 1;
  } else if (step === 'task') {
    const invocation = await start('Create NATIVE_SMOKE_PROOF.md containing exactly: native wiring smoke test passed. ' +
      'Make no other change.', ['NATIVE_SMOKE_PROOF.md']);
    const result = await invocation.wait();
    log(`changed: ${result.changedFiles.join(', ')}; usage ${JSON.stringify(result.usage)}`);
    log(`proof file: ${readFileSync(path.join(worktree, 'NATIVE_SMOKE_PROOF.md'), 'utf8').trim()}`);
  } else {
    const evidence = path.join(root, 'evidence');
    const invocation = await start('Write a long, detailed 2000-word essay about version control into essay.md.', ['essay.md'],
      { evidenceDirectory: evidence, objectiveRevision: 'rev', leaseId: 'lease', worktreeReceipt: 'wt' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    await invocation.cancel();
    const proof = await inspectNativeWorkerEvidence({ evidenceDirectory: evidence, revision: 'rev', journalHash: 'j',
      authorizations: [{ leaseId: 'lease', capabilityReceiptHash: 'example', worktreeReceipt: 'wt', isolatedWorkspace: realpathSync(worktree) }] });
    log(`stopped: ${proof.allStopped}; cancelled leases: ${JSON.stringify(proof.cancelledLeases)}`);
  }
} finally {
  try { git(base, 'worktree', 'remove', '--force', worktree); } catch { /* already gone */ }
  rmSync(root, { recursive: true, force: true });
}
