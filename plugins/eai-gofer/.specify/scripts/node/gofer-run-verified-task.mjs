#!/usr/bin/env node
/**
 * Production entrypoint for the verified native runtime. Composes the real
 * capability issuer, the real append-only ledger, and `createVerifiedNativeRuntime`
 * to run one bounded, ledger-authorized native task in an isolated worktree.
 *
 * This is deliberately the only command that calls `createVerifiedNativeRuntime`
 * outside of a test. It fails closed with TRUSTED_EVALUATOR_REQUIRED when no
 * local trust identity is registered — that is expected until the account
 * trust store is provisioned; it is not a sign the wiring is missing.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'process';
import { createVerifiedNativeRuntime } from './gofer-native-runtime.mjs';
import { createVerifiedWorktree, disposeVerifiedWorktree } from './gofer-native-adapter.mjs';
import { createRuntimeLedger } from './gofer-runtime-ledger.mjs';
import { issueLocalCapabilityReceipt } from './gofer-local-capability-issuer.mjs';
import { inspectEaiLocalIsolation } from './gofer-local-isolation.mjs';

const SMOKE_TASK_ID = 'T001';
const SMOKE_CHECK_NAME = 'smoke-file-check';
const SMOKE_FILE_NAME = 'NATIVE_SMOKE_PROOF.md';
const SMOKE_FILE_CONTENT = 'native wiring smoke test passed.\n';

function parseArgs(argv) {
  const args = { workspace: '', featureDir: '', capabilityReceipt: '', benchmark: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--workspace') args.workspace = argv[++index] || '';
    else if (arg === '--feature-dir') args.featureDir = argv[++index] || '';
    else if (arg === '--capability-receipt') args.capabilityReceipt = argv[++index] || '';
    else if (arg === '--benchmark') args.benchmark = argv[++index] || '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!path.isAbsolute(args.workspace)) throw new Error('--workspace <absolute-path> is required');
  // A receipt and a signed benchmark only make sense together.
  if (Boolean(args.capabilityReceipt) !== Boolean(args.benchmark) ||
      [args.capabilityReceipt, args.benchmark].some(value => value && !path.isAbsolute(value))) {
    throw new Error('--capability-receipt and --benchmark need absolute paths and must be given together');
  }
  return args;
}

async function readJsonFile(filename) {
  const file = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error('JSON input must be a regular file under 1 MiB');
    return JSON.parse(await file.readFile('utf8'));
  } finally { await file.close(); }
}

function gitHead(workspaceRoot) {
  return execFileSync('git', ['-C', workspaceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

/** Build the minimal set of controller documents `reviewPriority` requires,
 * describing exactly one bounded, inert smoke task. Kept in the controller's
 * source-side feature directory, never the isolated task worktree (D029). */
async function prepareSmokeFeature(featureDir, revision) {
  await fs.mkdir(featureDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(featureDir, 'spec.md'),
    '# Native Runtime Smoke Task\n\n' +
    '- FR-001: Create one fixed-content proof file and change nothing else.\n', { mode: 0o600 });
  await fs.writeFile(path.join(featureDir, 'decisions.md'),
    '## D001 - Run one bounded native smoke task\n\n' +
    'The user approved wiring the verified native runtime into a real command ' +
    'and running one bounded, inert smoke task to prove the dispatch path.\n', { mode: 0o600 });
  await fs.writeFile(path.join(featureDir, 'plan.md'),
    '# Plan\n\nRun one bounded native task in a verified local worktree.\n', { mode: 0o600 });
  await fs.writeFile(path.join(featureDir, 'loop-contract.json'), `${JSON.stringify({
    schemaVersion: 1, requirePriorityPlan: true, loopId: 'native-runtime-smoke',
    profile: 'standard', objective: 'Prove the verified native runtime dispatches one real task end to end.',
    entryStage: '0_gofer_start', maxIterations: 1, budget: {}, evalCommands: [],
    successCriteria: [], stopConditions: [],
    humanEscalation: { maxFailedIterations: 1, owner: 'Gofer maintainers', escalateWhen: ['native host authority is unavailable'] },
  }, null, 2)}\n`, { mode: 0o600 });
  await fs.writeFile(path.join(featureDir, 'tasks.md'),
    `- [ ] **${SMOKE_TASK_ID}** Create ${SMOKE_FILE_NAME} with fixed content.\n`, { mode: 0o600 });
  await fs.writeFile(path.join(featureDir, 'traceability.md'),
    '| Requirement | Task |\n| --- | --- |\n' +
    `| FR-001 | ${SMOKE_TASK_ID} |\n`, { mode: 0o600 });
  const plan = {
    schemaVersion: 2,
    revision,
    objective: 'Prove the verified native runtime dispatches one real task end to end.',
    lastInstruction: { id: 'D001', text: 'The user approved wiring the verified native runtime into a real command and running one bounded, inert smoke task to prove the dispatch path.' },
    decisionPolicy: { mode: 'goal-led', askOnlyFor: ['goal-change', 'irreversible-action', 'missing-authority'] },
    criticalPath: [SMOKE_TASK_ID],
    tasks: { [SMOKE_TASK_ID]: { dependsOn: [], allowedEditScope: [SMOKE_FILE_NAME] } },
    outcome: {
      id: 'OUTCOME-SMOKE-001',
      statement: 'A native host performs one scoped, ledger-governed smoke task in verified isolation.',
      requirements: ['FR-001'],
      target: { environment: 'local-native-host', revision },
      receipt: 'evidence/outcome.json',
    },
  };
  await fs.writeFile(path.join(featureDir, 'priority-plan.json'), `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
}

/** The worker-facing adapter. `reserve`/`lease` delegate straight to the same
 * ledger the graph engine authorizes and commits against; `check`/`verified`
 * inspect the isolated worktree directly rather than trusting worker claims. */
function createSmokeAdapter({ ledger }) {
  return {
    bindWorkspace({ workspaceRoot }) {
      return {
        workspaceRoot,
        reserve: request => ledger.reserve(request),
        lease: request => ledger.lease(request),
        async inputRevision() { return gitHead(workspaceRoot); },
        async check({ taskId, revision, inputRevision, check }) {
          const target = path.join(workspaceRoot, SMOKE_FILE_NAME);
          const actual = await fs.readFile(target, 'utf8').catch(() => null);
          const executed = true;
          const exitCode = actual === SMOKE_FILE_CONTENT ? 0 : 1;
          return { taskId, revision, inputRevision, check, exitCode, executed,
            receipt: createHash('sha256').update(`${taskId}:${inputRevision}:${actual ?? ''}`).digest('hex') };
        },
        async verified({ taskId, revision, inputRevision }) {
          const target = path.join(workspaceRoot, SMOKE_FILE_NAME);
          const actual = await fs.readFile(target, 'utf8').catch(() => null);
          if (actual !== SMOKE_FILE_CONTENT) throw new Error('SMOKE_TASK_OUTPUT_MISMATCH');
          return { committed: true, taskId, revision, inputRevision,
            receipt: createHash('sha256').update(`verified:${taskId}:${inputRevision}`).digest('hex') };
        },
      };
    },
  };
}

/** Capability issuance needs an already-isolated worktree to probe, but the
 * receipt itself attests host/model capability, not a specific worktree's
 * identity. Issue it against a disposable probe worktree, exactly like the
 * live capability diagnostic already recorded for this feature, then reuse
 * the receipt for the separate, real task worktree below. */
async function issueDisposableCapabilityReceipt(workspace, host) {
  const probe = await createVerifiedWorktree({ workspaceRoot: workspace, host,
    localIsolation: inspectEaiLocalIsolation });
  try {
    return await issueLocalCapabilityReceipt({ workspaceRoot: probe.isolatedWorkspace });
  } finally {
    await disposeVerifiedWorktree({ workspaceRoot: probe.workspace,
      isolatedWorkspace: probe.isolatedWorkspace, revision: probe.revision,
      receipt: probe.receipt }).catch(() => {});
  }
}

/** `capabilityReceipt` and `benchmark` ({ evidence, attestation }) may be supplied
 * together to route by a signed independent benchmark. Without them the runner
 * issues its own receipt and the routing gate correctly refuses to route. */
export async function runVerifiedSmokeTask({ workspace, featureDir, host = 'codex',
  capabilityReceipt: suppliedReceipt, benchmark }) {
  const capabilityReceipt = suppliedReceipt ?? await issueDisposableCapabilityReceipt(workspace, host);
  const revision = gitHead(workspace);
  const resolvedFeatureDir = featureDir || path.join(workspace, '.specify', 'specs', 'native-runtime-smoke');
  await prepareSmokeFeature(resolvedFeatureDir, revision);
  const ledger = await createRuntimeLedger({ ledgerPath: path.join(resolvedFeatureDir, 'runtime-ledger.jsonl') });
  const runtime = await createVerifiedNativeRuntime({
    workspaceRoot: workspace,
    host,
    localIsolation: inspectEaiLocalIsolation,
    capabilityReceipt,
    requiredCapabilities: { isolationClass: 'git-worktree+local-os-sandbox' },
    ledger,
    promptForRequest: async () => `Create a file named ${SMOKE_FILE_NAME} in the repository root ` +
      `containing exactly this one line: "${SMOKE_FILE_CONTENT.trim()}". Make no other change.`,
    adapter: createSmokeAdapter({ ledger }),
  });
  try {
    return await runtime.run({
      featureDir: resolvedFeatureDir,
      checks: { [SMOKE_TASK_ID]: [SMOKE_CHECK_NAME] },
      approvalReceipt: 'local-smoke-approval',
      benchmarkEvidence: benchmark?.evidence,
      benchmarkAttestation: benchmark?.attestation,
      maxCalls: 12,
      maxConcurrent: 1,
      deadlineMs: Date.now() + 300_000,
    });
  } finally {
    await runtime.dispose().catch(() => {});
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  const capabilityReceipt = args.capabilityReceipt ? await readJsonFile(args.capabilityReceipt) : undefined;
  const benchmark = args.benchmark ? await readJsonFile(args.benchmark) : undefined;
  const result = await runVerifiedSmokeTask({ workspace: args.workspace,
    featureDir: args.featureDir || undefined, capabilityReceipt, benchmark });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
