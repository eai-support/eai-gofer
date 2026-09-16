/**
 * Select a current model from authenticated host evidence. Static policy may
 * narrow permitted capabilities but never provides model identity or authority.
 */
import { capabilityReceiptHash, verifyCapabilityReceipt } from './gofer-host-capability.mjs';

const text = value => typeof value === 'string' && value.trim().length > 0;
const validBenchmarkMetrics = result => Number.isFinite(result?.reliability) && result.reliability >= 0 && result.reliability <= 1 &&
  Number.isFinite(result?.costUsd) && result.costUsd >= 0;

export async function selectCapabilityRoute({ receipt, publicKey, host, requiredCapabilities = {},
  advisoryConstraints = {}, benchmarkEvidence, verifyBenchmark, now = Date.now() } = {}) {
  const { reasoningEfforts = [], ...receiptRequirements } = requiredCapabilities;
  if (!verifyCapabilityReceipt(receipt, { publicKey, host, requiredCapabilities: receiptRequirements, now })) {
    throw new Error('LIVE_RECEIPT_REQUIRED');
  }
  if (typeof verifyBenchmark !== 'function' || !benchmarkEvidence || !Array.isArray(benchmarkEvidence.results)) {
    throw new Error('INDEPENDENT_BENCHMARK_REQUIRED');
  }
  const receiptHash = capabilityReceiptHash(receipt);
  const candidates = receipt.models.filter(model => {
    const requiredEfforts = reasoningEfforts;
    const permittedEfforts = advisoryConstraints.reasoningEfforts ?? requiredEfforts;
    return requiredEfforts.every(effort => model.reasoningEfforts?.includes(effort)) &&
      permittedEfforts.every(effort => model.reasoningEfforts?.includes(effort));
  });
  if (!candidates.length) throw new Error('NO_LIVE_CAPABILITY_MATCH');
  const verified = await verifyBenchmark({ host: receipt.host, receiptHash, evidence: benchmarkEvidence });
  if (verified?.valid !== true || verified.receiptHash !== receiptHash || !text(verified.receipt)) {
    throw new Error('INDEPENDENT_BENCHMARK_REQUIRED');
  }
  const scored = candidates.map(model => {
    const result = benchmarkEvidence.results.find(item => item?.modelId === model.id &&
      item.receiptHash === receiptHash && item.functionalVerified === true &&
      validBenchmarkMetrics(item));
    return { model, result };
  }).filter(item => item.result);
  if (!scored.length) throw new Error('NO_VERIFIED_BENCHMARK_MATCH');
  scored.sort((left, right) => right.result.reliability - left.result.reliability ||
    left.result.costUsd - right.result.costUsd || left.model.id.localeCompare(right.model.id));
  const selected = scored[0];
  return Object.freeze({ host: receipt.host, model: { ...selected.model }, receiptHash,
    benchmarkReceipt: verified.receipt, benchmark: { ...selected.result },
    authority: 'live-capability-and-independent-benchmark', advisoryConstraints: { ...advisoryConstraints } });
}
