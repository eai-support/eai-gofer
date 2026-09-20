#!/usr/bin/env node
// Step: check a signed attestation with the production verifier, then ask the
// routing gate to choose a model. No model runs and nothing is spent.
//
//   node docs/examples/verified-runtime/verify-routing.mjs \
//     --repo /abs/checkout --receipt /abs/receipt.json --attestation /abs/attestation.json
//
// Expected: the gate refuses without the benchmark (INDEPENDENT_BENCHMARK_REQUIRED),
// selects a model with it, and refuses a tampered verdict (TRUSTED_BENCHMARK_REQUIRED).
import { readFileSync } from 'node:fs';
import { ISOLATION, SCRIPTS, log, parseArgs, requireAbsolute } from './common.mjs';

const { selectCapabilityRoute } = await import(`${SCRIPTS}/gofer-live-routing.mjs`);
const { verifyTrustedBenchmarkEvidence } = await import(`${SCRIPTS}/gofer-trusted-benchmark.mjs`);
const { resolveTrustedEvaluatorPublicKey } = await import(`${SCRIPTS}/gofer-trusted-evaluator.mjs`);

const a = parseArgs(process.argv.slice(2), ['repo', 'receipt', 'attestation']);
requireAbsolute(a, ['repo', 'receipt', 'attestation']);
const receipt = JSON.parse(readFileSync(a.receipt, 'utf8'));
const { attestation, evidence } = JSON.parse(readFileSync(a.attestation, 'utf8'));
const publicKey = await resolveTrustedEvaluatorPublicKey(receipt, { workspaceRoot: a.repo });
const verifyBenchmark = request => verifyTrustedBenchmarkEvidence({ ...request, attestation,
  capabilityKeyId: receipt.provenance.keyId, capabilityPublicKey: publicKey, workspaceRoot: a.repo });
const base = { receipt, publicKey, host: 'codex', requiredCapabilities: { isolationClass: ISOLATION } };

try { await selectCapabilityRoute(base); log('UNEXPECTED: routed without a benchmark'); process.exitCode = 1; }
catch (error) { log(`without the benchmark: ${error.message}`); }

const route = await selectCapabilityRoute({ ...base, benchmarkEvidence: evidence, verifyBenchmark });
log(`with the signed benchmark: ${route.model.id} (reliability ${route.benchmark.reliability}, ` +
  `authority ${route.authority})`);

const tampered = structuredClone(evidence);
tampered.runs[0].functionalVerified = false;
try { await selectCapabilityRoute({ ...base, benchmarkEvidence: tampered, verifyBenchmark });
  log('UNEXPECTED: tampered evidence accepted'); process.exitCode = 1; }
catch (error) { log(`tampered verdict: ${error.message}`); }
