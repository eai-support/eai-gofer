/** Durable, append-only authority ledger for a single verified runtime. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const text = value => typeof value === 'string' && value.trim().length > 0;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function createRuntimeLedger({ ledgerPath, now = () => new Date() } = {}) {
  if (!path.isAbsolute(ledgerPath)) throw new Error('LEDGER_PATH_REQUIRED');
  await mkdir(path.dirname(ledgerPath), { recursive: true, mode: 0o700 });
  const lockPath = `${ledgerPath}.lock`;
  const events = async () => (await readFile(ledgerPath, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  })).split('\n')
    .filter(Boolean).map(line => JSON.parse(line));
  const transact = async (event, evaluate) => {
    const lock = await open(lockPath, 'wx', 0o600).catch(() => { throw new Error('LEDGER_BUSY'); });
    try {
      const history = await events();
      const result = await evaluate(history);
      if (result?.allowed !== true) return result;
      const record = { schemaVersion: 1, eventId: randomUUID(), at: now().toISOString(), ...event, ...result };
      await writeFile(`${ledgerPath}.${record.eventId}.tmp`, `${JSON.stringify(record)}\n`, { mode: 0o600, flag: 'wx' });
      const append = await open(ledgerPath, 'a', 0o600);
      try { await append.writeFile(`${JSON.stringify(record)}\n`); await append.sync(); } finally { await append.close(); }
      await unlink(`${ledgerPath}.${record.eventId}.tmp`).catch(() => {});
      return result;
    } finally { await lock.close(); await unlink(lockPath).catch(() => {}); }
  };
  const reservation = request => ({ taskId: request?.taskId, revision: request?.revision, attempt: request?.attempt,
    budgetReservation: `reservation:${digest(request).slice(0, 24)}` });
  return Object.freeze({
    reserve: request => transact({ type: 'reserve', request }, async () => text(request?.taskId) && text(request?.revision) &&
      Number.isSafeInteger(request?.attempt) ? { allowed: true, ...reservation(request) } : { allowed: false }),
    lease: request => transact({ type: 'lease', request }, async history => {
      const reserved = reservation(request);
      if (!history.some(item => item.type === 'reserve' && item.budgetReservation === reserved.budgetReservation)) return { allowed: false };
      if (history.some(item => item.type === 'lease' && item.taskId === request.taskId && Date.parse(item.expiresAt) > Date.now())) return { allowed: false };
      return { allowed: true, taskId: request.taskId, revision: request.revision, attempt: request.attempt,
        leaseId: `lease:${randomUUID()}`, expiresAt: new Date(Date.now() + 300000).toISOString() };
    }),
    authorize: request => transact({ type: 'authorize', request }, async history => {
      if (!text(request?.leaseId) || !text(request?.budgetReservation) || !text(request?.approvalReceipt)) return { allowed: false };
      const lease = history.find(item => item.type === 'lease' && item.leaseId === request.leaseId);
      if (!lease || lease.taskId !== request.taskId || lease.revision !== request.revision || Date.parse(lease.expiresAt) <= Date.now()) return { allowed: false };
      return { allowed: true, ...request, receipt: `authority:${digest(request).slice(0, 32)}` };
    }),
    authorizeNative: request => transact({ type: 'native-authorize', request }, async history => {
      const authority = history.find(item => item.type === 'authorize' && item.leaseId === request?.leaseId && item.receipt === request?.ledgerAuthorityReceipt);
      return authority ? { allowed: true, ...request, isolation: 'git-worktree+local-os-sandbox', receipt: authority.receipt } : { allowed: false };
    }),
    authorizeCommit: request => transact({ type: 'commit-authorize', request }, async history => {
      const authority = history.find(item => item.type === 'authorize' && item.leaseId === request?.leaseId);
      return authority ? { allowed: true, taskId: request.taskId, revision: request.revision, inputRevision: request.inputRevision,
        leaseId: request.leaseId, capabilityReceiptHash: request.capabilityReceiptHash, receipt: `commit:${digest(request).slice(0, 32)}` } : { allowed: false };
    }),
  });
}
