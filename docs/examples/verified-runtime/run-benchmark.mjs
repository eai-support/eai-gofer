#!/usr/bin/env node
// Step: run the pinned held-out benchmark (4 cases x 3 runs) with a real worker
// and a separate real reviewer, then capture the result for signing.
//
//   node docs/examples/verified-runtime/run-benchmark.mjs \
//     --repo /abs/checkout --receipt /abs/receipt.json --out /abs/result.json \
//     --worker-model gpt-5.6-terra --worker-rate 2,12 \
//     --reviewer-model gpt-5.6-sol --reviewer-rate 4,20 \
//     --approval "approved by <name> on <date>" --max-run-usd 2 --max-total-usd 8
//
// THIS SPENDS MONEY. The cap is checked before every launch and each run is
// reserved at its worst case, so the total cannot pass --max-total-usd. The two
// models must differ. The corpus, ledgers and snapshot never enter the repo.
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ISOLATION, SCRIPTS, findCodex, log, parseArgs, rate, requireAbsolute } from './common.mjs';

const { runHeldOutBenchmark } = await import(`${SCRIPTS}/gofer-benchmark-executor.mjs`);
const { createNativeBenchmarkDispatch, createSpendCap } = await import(`${SCRIPTS}/gofer-native-benchmark-dispatch.mjs`);
const { createIndependentReviewer } = await import(`${SCRIPTS}/gofer-independent-reviewer.mjs`);
const { resolveTrustedEvaluatorPublicKey, loadTrustedHeldOutCorpus } = await import(`${SCRIPTS}/gofer-trusted-evaluator.mjs`);
const { captureHeldOutResultSnapshot } = await import(`${SCRIPTS}/gofer-heldout-snapshot.mjs`);

const a = parseArgs(process.argv.slice(2), ['repo', 'receipt', 'out', 'worker-model', 'worker-rate',
  'reviewer-model', 'reviewer-rate', 'approval', 'max-run-usd', 'max-total-usd']);
requireAbsolute(a, ['repo', 'receipt', 'out']);
const [maxRun, maxTotal] = [Number(a['max-run-usd']), Number(a['max-total-usd'])];
if (!(maxRun > 0) || !(maxTotal >= maxRun) || !a.approval || a['worker-model'] === a['reviewer-model']) {
  throw new Error('Set positive spend limits, an approval note, and two different models.');
}

const command = findCodex();
const capabilityReceipt = JSON.parse(readFileSync(a.receipt, 'utf8'));
const capabilityPublicKey = await resolveTrustedEvaluatorPublicKey(capabilityReceipt, { workspaceRoot: a.repo });
const spend = createSpendCap(maxTotal);
const scratch = path.join(os.tmpdir(), `gofer-benchmark-${process.pid}`);
await mkdir(scratch, { mode: 0o700 });
const note = message => log(`${message}  spent=$${spend.spentUsd.toFixed(3)}`);

const make = (modelId, rateCard, approvalReceipt, taskPrefix) => createNativeBenchmarkDispatch({
  ledgerPath: path.join(scratch, `${taskPrefix}-ledger.jsonl`), capabilityReceipt, capabilityPublicKey,
  requiredCapabilities: { isolationClass: ISOLATION }, modelId, approvalReceipt, command, rateCard,
  maxRunCostUsd: maxRun, spend, taskPrefix, timeoutMs: 300_000 });
const worker = await make(a['worker-model'], rate(a['worker-rate']), a.approval, 'benchmark');
const reviewerDispatch = await make(a['reviewer-model'], rate(a['reviewer-rate']), `${a.approval} (review)`, 'review');
const review = createIndependentReviewer({ dispatchReview: reviewerDispatch,
  workerModelId: a['worker-model'], reviewerModelId: a['reviewer-model'] });

const result = await runHeldOutBenchmark({ workspaceRoot: a.repo, capabilityReceipt, modelId: a['worker-model'],
  harnessId: 'gofer-native-benchmark-1',
  dispatchCase: async request => { note(`worker ${request.caseId} #${request.run}`); return worker(request); },
  review: async request => { const verdict = await review(request);
    note(`verdict ${request.caseId} #${request.run}: functional=${request.passed} approved=${verdict.approved}`);
    return verdict; } });
note(`benchmark ${result.report.status}: ${result.report.functionalPasses}/${result.report.functionalRuns}`);

// Trusted-controller capture: copies the bytes into the account trust root.
const corpus = await loadTrustedHeldOutCorpus({ workspaceRoot: a.repo });
const snapshot = await captureHeldOutResultSnapshot({ corpusRoot: corpus.corpusRoot, workspaceRoot: a.repo,
  trustRoot: path.join(os.homedir(), '.eai-gofer-trust'), expectedCorpusHash: corpus.corpusHash,
  expectedCaseIds: corpus.cases.map(item => item.id) });
await writeFile(a.out, JSON.stringify({ status: result.report.status, passes: result.report.functionalPasses,
  runs: result.report.functionalRuns, costUsd: result.report.costUsd, spentUsd: spend.spentUsd,
  snapshotId: snapshot.snapshotId }, null, 2), { flag: 'wx', mode: 0o600 });
note(`snapshot ${snapshot.snapshotId}`);
log('Next: a person signs this snapshot. See docs/verified-autonomous-runtime.md, step 6.');
