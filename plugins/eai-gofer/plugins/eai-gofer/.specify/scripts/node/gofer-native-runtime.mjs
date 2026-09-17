/**
 * Production composition root for verified local native execution. It does
 * not manufacture authority: callers must provide one durable ledger that
 * governs both graph dispatch and the host launch.
 */
import { createVerifiedWorktree, createLedgerBoundCodexExecutor } from './gofer-native-adapter.mjs';
import { runVerifiedGraph } from './gofer-verified-execution.mjs';

const text = value => typeof value === 'string' && value.trim().length > 0;

export async function createVerifiedNativeRuntime({ workspaceRoot, host = 'codex', localIsolation,
  capabilityReceipt, capabilityPublicKey, requiredCapabilities, ledger, nativeLedger,
  promptForRequest, adapter, baseRef } = {}) {
  if (!text(workspaceRoot) || host !== 'codex' || !capabilityReceipt || !capabilityPublicKey ||
      typeof ledger?.authorize !== 'function' || typeof ledger?.authorizeCommit !== 'function' ||
      typeof nativeLedger !== 'function' || typeof promptForRequest !== 'function' || !adapter ||
      ['reserve', 'lease', 'inputRevision', 'check', 'verified'].some(method => typeof adapter[method] !== 'function')) {
    throw new Error('VERIFIED_NATIVE_RUNTIME_CONFIGURATION_REQUIRED');
  }
  const isolation = await createVerifiedWorktree({ workspaceRoot, host, localIsolation, baseRef });
  const executor = createLedgerBoundCodexExecutor({ isolatedWorkspace: isolation.isolatedWorkspace,
    capabilityReceipt, capabilityPublicKey, requiredCapabilities, assertLedger: nativeLedger, promptForRequest });
  const trustedAdapter = Object.freeze({ ...adapter, execute: executor.execute });
  return Object.freeze({
    isolation,
    async run({ featureDir, checks, benchmarkEvidence, verifyBenchmark, advisoryConstraints,
      approvalReceipt, maxCalls, maxConcurrent, deadlineMs, signal } = {}) {
      return runVerifiedGraph({ featureDir, workspaceRoot: isolation.isolatedWorkspace, checks, adapter: trustedAdapter,
        ledger, capabilityReceipt, capabilityPublicKey, requiredCapabilities, benchmarkEvidence, verifyBenchmark,
        advisoryConstraints, approvalReceipt, maxCalls, maxConcurrent, deadlineMs, signal });
    },
  });
}
