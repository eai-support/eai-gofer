/** Native adapter primitives. They create real Git worktree isolation and
 * require a ledger authority record before a host integration can start work. */
import { execFile } from 'node:child_process';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { capabilityReceiptHash, verifyCapabilityReceipt } from './gofer-host-capability.mjs';
import { verifyLocalIsolationReport } from './gofer-local-isolation.mjs';

const execFileAsync = promisify(execFile);
const text = value => typeof value === 'string' && value.trim().length > 0;
const QUALIFIED_LOCAL_ISOLATION = 'git-worktree+local-os-sandbox';
const sameScope = (left, right) => Array.isArray(left) && Array.isArray(right) &&
  left.length === right.length && left.every((value, index) => value === right[index]);
const gitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'].includes(key)));

async function git(directory, args) {
  return execFileAsync('git', ['-C', directory, ...args], { encoding: 'utf8', env: gitEnvironment });
}

export async function createVerifiedWorktree({ workspaceRoot, host, localIsolation, baseRef = 'HEAD', temporaryRoot = tmpdir() } = {}) {
  if (!text(workspaceRoot) || !text(baseRef) || baseRef.startsWith('-')) throw new Error('INVALID_ISOLATION_REQUEST');
  if (!verifyLocalIsolationReport(localIsolation, { host, workspaceRoot })) throw new Error('LOCAL_SANDBOX_REQUIRED');
  const workspace = await realpath(workspaceRoot);
  const temporary = await realpath(temporaryRoot);
  const relativeTemporary = path.relative(workspace, temporary);
  if (relativeTemporary === '' || (!relativeTemporary.startsWith('..') && !path.isAbsolute(relativeTemporary))) {
    throw new Error('ISOLATION_ROOT_INSIDE_WORKSPACE');
  }
  const repository = (await git(workspace, ['rev-parse', '--is-inside-work-tree'])).stdout.trim();
  if (repository !== 'true') throw new Error('WORKSPACE_IS_NOT_GIT');
  const destination = await mkdtemp(path.join(temporary, 'gofer-isolated-worktree-'));
  try {
    await git(workspace, ['worktree', 'add', '--detach', destination, baseRef]);
    const isolated = await realpath(destination);
    if (isolated === workspace) throw new Error('ISOLATION_PATH_REUSED');
    const [head, expected] = await Promise.all([
      git(isolated, ['rev-parse', 'HEAD']), git(workspace, ['rev-parse', baseRef]),
    ]);
    if (head.stdout.trim() !== expected.stdout.trim()) throw new Error('ISOLATION_REVISION_MISMATCH');
    return Object.freeze({ isolationClass: 'git-worktree+local-os-sandbox', workspace, isolatedWorkspace: isolated,
      revision: head.stdout.trim(), receipt: `git-worktree:${head.stdout.trim()}` });
  } catch (error) {
    await git(workspace, ['worktree', 'remove', '--force', destination]).catch(() => {});
    throw error;
  }
}

/**
 * Execute only after a ledger service binds the exact objective revision,
 * scope, receipt hash, lease, budget and approval state. Cancellation must be
 * delivered and independently confirmed before an aborted invocation returns.
 */
export async function invokeLedgerBoundNative({ request, capabilityReceipt, capabilityPublicKey,
  requiredCapabilities, assertLedger, start, signal } = {}) {
  if (!request || !capabilityReceipt || typeof assertLedger !== 'function' || typeof start !== 'function' ||
      !text(request.objectiveRevision) || !Array.isArray(request.allowedWriteScope) || !text(request.leaseId) ||
      !text(request.budgetReservation) || !text(request.approvalReceipt)) throw new Error('LEDGER_AUTHORITY_REQUIRED');
  if (capabilityReceipt?.isolationClass !== QUALIFIED_LOCAL_ISOLATION ||
      !verifyCapabilityReceipt(capabilityReceipt, { publicKey: capabilityPublicKey, requiredCapabilities })) {
    throw new Error('CAPABILITY_RECEIPT_REQUIRED');
  }
  const receiptHash = capabilityReceiptHash(capabilityReceipt);
  const authority = await assertLedger({ ...request, capabilityReceiptHash: receiptHash });
  if (authority?.allowed !== true || authority.objectiveRevision !== request.objectiveRevision ||
      authority.capabilityReceiptHash !== receiptHash || authority.leaseId !== request.leaseId ||
      authority.budgetReservation !== request.budgetReservation || authority.approvalReceipt !== request.approvalReceipt ||
      !sameScope(authority.allowedWriteScope, request.allowedWriteScope) ||
      authority.isolation !== capabilityReceipt.isolationClass) {
    throw new Error('LEDGER_AUTHORITY_REQUIRED');
  }
  const invocation = await start(Object.freeze({ ...request, capabilityReceiptHash: receiptHash }));
  if (!text(invocation?.invocationId) || typeof invocation.wait !== 'function' || typeof invocation.cancel !== 'function' ||
      typeof invocation.inspect !== 'function') {
    if (typeof invocation?.cancel === 'function') await invocation.cancel();
    if (typeof invocation?.inspect === 'function') {
      const state = await invocation.inspect();
      if (state?.invocationId !== invocation.invocationId || state?.cancelled !== true || !text(state?.receipt)) {
        throw new Error('CANCELLATION_CONFIRMATION_REQUIRED');
      }
    } else if (invocation) {
      throw new Error('CANCELLATION_CONFIRMATION_REQUIRED');
    }
    throw new Error('NATIVE_INVOCATION_REQUIRED');
  }
  let cancelPromise;
  const cancel = () => {
    if (!cancelPromise) {
      cancelPromise = (async () => {
        await invocation.cancel();
        const state = await invocation.inspect();
        if (state?.invocationId !== invocation.invocationId || state?.cancelled !== true || !text(state?.receipt)) {
          throw new Error('CANCELLATION_CONFIRMATION_REQUIRED');
        }
      })();
    }
    return cancelPromise;
  };
  if (signal?.aborted) await cancel();
  const listener = () => { cancel().catch(() => {}); };
  signal?.addEventListener('abort', listener, { once: true });
  try {
    const result = await invocation.wait();
    if (signal?.aborted) await cancel();
    if (cancelPromise) {
      await cancelPromise;
      throw new Error('NATIVE_INVOCATION_CANCELLED');
    }
    if (result?.invocationId !== invocation.invocationId || result?.capabilityReceiptHash !== receiptHash || !text(result?.receipt)) {
      throw new Error('NATIVE_INVOCATION_UNVERIFIED');
    }
    return Object.freeze({ ...result, capabilityReceiptHash: receiptHash, isolation: authority.isolation });
  } finally {
    signal?.removeEventListener('abort', listener);
    if (cancelPromise) await cancelPromise;
  }
}
