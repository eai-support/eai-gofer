/**
 * Production composition root for verified local native execution. It does
 * not manufacture authority: callers must provide one durable ledger that
 * governs both graph dispatch and the host launch.
 */
import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { createVerifiedWorktree, inspectVerifiedWorktree, disposeVerifiedWorktree, createLedgerBoundCodexExecutor, startLocalCodexInvocation,
  inspectNativeWorkerEvidence, createNativeCancellationVerifier } from './gofer-native-adapter.mjs';
import { createRuntimeLedger } from './gofer-runtime-ledger.mjs';
import { reconcileCancelledExecution } from './gofer-execution-recovery.mjs';
import { runVerifiedGraph } from './gofer-verified-execution.mjs';
import { inspectEaiLocalIsolation } from './gofer-local-isolation.mjs';

const text = value => typeof value === 'string' && value.trim().length > 0;
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

export async function createVerifiedNativeRuntime({ workspaceRoot, host = 'codex',
  localIsolation = inspectEaiLocalIsolation,
  capabilityReceipt, capabilityPublicKey, requiredCapabilities, ledger, nativeLedger = ledger?.authorizeNative,
  promptForRequest, adapter, baseRef } = {}) {
  if (!text(workspaceRoot) || host !== 'codex' || typeof localIsolation !== 'function' ||
      !capabilityReceipt || !capabilityPublicKey ||
      typeof ledger?.authorize !== 'function' || typeof ledger?.authorizeCommit !== 'function' ||
      typeof nativeLedger !== 'function' || typeof promptForRequest !== 'function' ||
      typeof adapter?.bindWorkspace !== 'function') {
    throw new Error('VERIFIED_NATIVE_RUNTIME_CONFIGURATION_REQUIRED');
  }
  const isolation = await createVerifiedWorktree({ workspaceRoot, host, localIsolation, baseRef });
  let boundAdapter;
  try {
    boundAdapter = await adapter.bindWorkspace(Object.freeze({ workspaceRoot: isolation.isolatedWorkspace,
      worktreeReceipt: isolation.receipt }));
    if (boundAdapter?.workspaceRoot !== isolation.isolatedWorkspace ||
        ['reserve', 'lease', 'inputRevision', 'check', 'verified'].some(method =>
          typeof boundAdapter?.[method] !== 'function')) throw new Error('NATIVE_ADAPTER_WORKSPACE_BINDING_REQUIRED');
  } catch (error) {
    await disposeVerifiedWorktree({ workspaceRoot: isolation.workspace,
      isolatedWorkspace: isolation.isolatedWorkspace, revision: isolation.revision,
      receipt: isolation.receipt }).catch(() => {});
    throw error;
  }
  let lifecycle = 'idle';
  return Object.freeze({
    isolation,
    async dispose() {
      if (lifecycle === 'disposed') return;
      if (lifecycle !== 'idle' && lifecycle !== 'verified') {
        throw new Error('NATIVE_RUNTIME_REQUIRES_RECOVERY_BEFORE_DISPOSAL');
      }
      const prior = lifecycle;
      lifecycle = 'disposing';
      try {
        await disposeVerifiedWorktree({ workspaceRoot: isolation.workspace,
          isolatedWorkspace: isolation.isolatedWorkspace, revision: isolation.revision,
          receipt: isolation.receipt });
        lifecycle = 'disposed';
      } catch (error) {
        lifecycle = prior;
        throw error;
      }
    },
    async run({ featureDir, checks, benchmarkEvidence, verifyBenchmark, advisoryConstraints,
      approvalReceipt, maxCalls, maxConcurrent, deadlineMs, signal, recovery } = {}) {
      if (lifecycle !== 'idle') throw new Error('NATIVE_RUNTIME_NOT_AVAILABLE');
      lifecycle = 'running';
      try {
        if (!text(featureDir)) throw new Error('NATIVE_EVIDENCE_DIRECTORY_REQUIRED');
        const controllerRoot = await realpath(featureDir);
        if (!inside(isolation.workspace, controllerRoot) || inside(isolation.isolatedWorkspace, controllerRoot)) {
          throw new Error('NATIVE_CONTROL_PLANE_OUTSIDE_SOURCE_WORKSPACE');
        }
        const worktree = await inspectVerifiedWorktree({ workspaceRoot: isolation.workspace,
          isolatedWorkspace: isolation.isolatedWorkspace, revision: isolation.revision,
          receipt: isolation.receipt, requireClean: true });
        if (!worktree.valid) throw new Error('NATIVE_WORKTREE_NOT_CLEAN');
        // The trusted journal stays outside the worker sandbox. The bound
        // adapter performs input reads, checks, and commits in the task worktree.
        const evidenceDirectory = path.join(controllerRoot, '.native-worker-evidence');
        const executor = createLedgerBoundCodexExecutor({ isolatedWorkspace: isolation.isolatedWorkspace,
          worktreeReceipt: isolation.receipt,
          capabilityReceipt, capabilityPublicKey, requiredCapabilities, assertLedger: nativeLedger, promptForRequest,
          start: request => startLocalCodexInvocation({ ...request, evidenceDirectory }) });
        const trustedAdapter = Object.freeze({ ...boundAdapter, worktreeReceipt: isolation.receipt,
          execute: executor.execute });
        const trustedRecovery = recovery ? { ...recovery,
          inspectWorkers: request => inspectNativeWorkerEvidence({ ...request, evidenceDirectory }) } : undefined;
        const result = await runVerifiedGraph({ featureDir: controllerRoot, workspaceRoot: isolation.isolatedWorkspace,
          checks, adapter: trustedAdapter,
          ledger, capabilityReceipt, capabilityPublicKey, requiredCapabilities, benchmarkEvidence, verifyBenchmark,
          advisoryConstraints, approvalReceipt, maxCalls, maxConcurrent, deadlineMs, signal, recovery: trustedRecovery });
        lifecycle = result.status === 'verified' && result.adapterCallsSettled ? 'verified' : 'recovery-required';
        return result;
      } catch (error) {
        lifecycle = 'recovery-required';
        throw error;
      }
    },
  });
}

/** Reopen the dispatch ledger with native cancellation proof after a controller restart. */
export async function reconcileVerifiedNativeCancellation({ featureDir, ledgerPath, workspaceRoot,
  abandonedWorkspace, replacementWorkspace, worktreeRevision, replacementWorktreeReceipt,
  inputRevision, inspectInputRevision, verifyReceipt, timeoutMs } = {}) {
  if (![featureDir, ledgerPath, workspaceRoot, abandonedWorkspace, replacementWorkspace,
    worktreeRevision, replacementWorktreeReceipt, inputRevision].every(text) ||
    !path.isAbsolute(ledgerPath) || typeof inspectInputRevision !== 'function' ||
    typeof verifyReceipt !== 'function') throw new Error('NATIVE_RECOVERY_CONFIGURATION_REQUIRED');
  const evidenceDirectory = path.join(featureDir, '.native-worker-evidence');
  const verifyCancellation = createNativeCancellationVerifier({ workspaceRoot,
    abandonedWorkspace, replacementWorkspace, worktreeRevision,
    evidenceDirectory, inspectInputRevision });
  const ledger = await createRuntimeLedger({ ledgerPath, verifyCancellation });
  return reconcileCancelledExecution({ featureDir, workspaceRoot, abandonedWorkspace,
    replacementWorkspace, worktreeRevision, replacementWorktreeReceipt, inputRevision,
    ledger, verifyReceipt, timeoutMs,
    inspectWorkers: request => inspectNativeWorkerEvidence({ ...request, evidenceDirectory }) });
}
