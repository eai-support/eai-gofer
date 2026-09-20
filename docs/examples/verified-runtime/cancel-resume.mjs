#!/usr/bin/env node
// Step: prove cancellation and resume with a real worker through the production
// runtime. Attempt 1 is cancelled while the real process runs; the ledger
// reconciles that lease against a clean replacement worktree; attempt 2 runs
// under a new lease. The cancelled attempt is never replayed.
//
//   node docs/examples/verified-runtime/cancel-resume.mjs \
//     --repo /abs/clean/checkout --receipt /abs/receipt.json \
//     --attestation /abs/attestation.json --out /abs/new-evidence-dir
//
// THIS SPENDS A SMALL AMOUNT (about US$0.15 to US$0.3). Use a clean checkout:
// the runtime creates two worktrees from its HEAD and writes the control files
// under .specify/specs/native-cancel-resume, which is git-ignored.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ISOLATION, SCRIPTS, log, parseArgs, requireAbsolute } from './common.mjs';

const { createVerifiedNativeRuntime, reconcileVerifiedNativeCancellation } = await import(`${SCRIPTS}/gofer-native-runtime.mjs`);
const { createRuntimeLedger } = await import(`${SCRIPTS}/gofer-runtime-ledger.mjs`);
const { prepareSmokeFeature, createSmokeAdapter, gitHead } = await import(`${SCRIPTS}/gofer-run-verified-task.mjs`);

const a = parseArgs(process.argv.slice(2), ['repo', 'receipt', 'attestation', 'out']);
requireAbsolute(a, ['repo', 'receipt', 'attestation', 'out']);
const receipt = JSON.parse(readFileSync(a.receipt, 'utf8'));
const { attestation, evidence } = JSON.parse(readFileSync(a.attestation, 'utf8'));

const featureDir = path.join(a.repo, '.specify/specs/native-cancel-resume');
rmSync(featureDir, { recursive: true, force: true });
await prepareSmokeFeature(featureDir, gitHead(a.repo));
const ledgerPath = path.join(featureDir, 'runtime-ledger.jsonl');
const evidenceDir = path.join(featureDir, '.native-worker-evidence');
const checks = { T001: ['smoke-file-check'] };
// The same deadline, call limit, approval and checks must be used on resume.
const common = { approvalReceipt: 'local-cancel-resume-approval', benchmarkEvidence: evidence,
  benchmarkAttestation: attestation, maxCalls: 12, maxConcurrent: 1, deadlineMs: Date.now() + 40 * 60_000 };
const promptForRequest = async () => 'Create a file named NATIVE_SMOKE_PROOF.md in the repository root containing ' +
  'exactly this one line: "native wiring smoke test passed." Make no other change.';
const make = async () => {
  const ledger = await createRuntimeLedger({ ledgerPath });
  return createVerifiedNativeRuntime({ workspaceRoot: a.repo, host: 'codex', capabilityReceipt: receipt,
    requiredCapabilities: { isolationClass: ISOLATION }, ledger, promptForRequest, adapter: createSmokeAdapter({ ledger }) });
};
const workerEvents = () => existsSync(evidenceDir) ? readdirSync(evidenceDir).flatMap(file =>
  readFileSync(path.join(evidenceDir, file), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))) : [];

let first, second;
try {
  first = await make();
  const abort = new AbortController();
  const attempt = first.run({ featureDir, checks, ...common, signal: abort.signal })
    .then(result => ({ result }), error => ({ error: error.message }));
  for (let i = 0; i < 300 && !workerEvents().some(event => event.event === 'started'); i++) await new Promise(r => setTimeout(r, 100));
  const started = workerEvents().find(event => event.event === 'started');
  if (!started) throw new Error('the worker never started');
  log(`worker pid ${started.pid} started; cancelling`);
  abort.abort();
  const outcome = await attempt;
  log(`attempt 1: ${JSON.stringify(outcome.result?.states ?? outcome.error)}`);

  second = await make();   // a replacement worktree
  const reconciled = await reconcileVerifiedNativeCancellation({ featureDir, ledgerPath,
    workspaceRoot: first.isolation.workspace, abandonedWorkspace: first.isolation.isolatedWorkspace,
    replacementWorkspace: second.isolation.isolatedWorkspace, worktreeRevision: first.isolation.revision,
    replacementWorktreeReceipt: second.isolation.receipt, inputRevision: gitHead(second.isolation.isolatedWorkspace),
    inspectInputRevision: async ({ isolatedWorkspace }) => gitHead(isolatedWorkspace),
    verifyReceipt: async request => ({ ...request, valid: false }) });
  log(`reconciled: ${reconciled.reconciled}`);

  const recoveryLedger = await createRuntimeLedger({ ledgerPath });
  const recovery = { verifyReceipt: async request => ({ ...request, valid: false }),
    verifyCancellation: async request => ({ ...request, valid: (await recoveryLedger.inspectCancellation(request)).valid }),
    inspectLedger: request => recoveryLedger.inspectRecovery(request) };
  const resumed = await second.run({ featureDir, checks, ...common, recovery });
  log(`resumed: ${resumed.status}, attempts ${JSON.stringify(resumed.attempts)}`);
  if (resumed.status !== 'verified') process.exitCode = 1;
} finally {
  cpSync(featureDir, a.out, { recursive: true });
  writeFileSync(path.join(a.out, 'summary.txt'), 'Inspect verified-execution.jsonl, runtime-ledger.jsonl and .native-worker-evidence.\n');
  // A verified run can leave its temporary worktree behind; remove both by hand.
  for (const runtime of [first, second]) {
    if (!runtime) continue;
    try { execFileSync('git', ['-C', a.repo, 'worktree', 'remove', '--force', runtime.isolation.isolatedWorkspace]); } catch { /* already gone */ }
  }
}
