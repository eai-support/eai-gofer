/**
 * Host-neutral execution kernel. Adapters are trusted application code, never
 * commands or capability declarations received from a worker or a document.
 */
import { open, readFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { reviewPriority } from './gofer-priority-check.mjs';

const contractFiles = ['spec.md', 'plan.md', 'decisions.md', 'priority-plan.json', 'loop-contract.json'];
const positive = value => Number.isSafeInteger(value) && value > 0;
const text = value => typeof value === 'string' && value.trim().length > 0;

export async function executionRevision(featureDir) {
  return (await snapshot(featureDir)).revision;
}

async function snapshot(featureDir) {
  const hash = createHash('sha256');
  const files = {};
  for (const file of contractFiles) {
    files[file] = await readFile(path.join(featureDir, file), 'utf8');
    hash.update(file).update(files[file]);
  }
  return { files, revision: hash.digest('hex') };
}

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

async function canonicalScopes(workspace, scopes) {
  const root = await realpath(workspace);
  return Promise.all(scopes.map(async scope => {
    const segments = scope.replace(/\/$/, '').split('/');
    let current = root;
    for (const segment of segments) {
      current = path.join(current, segment);
      try { if ((await lstat(current)).isSymbolicLink()) throw new Error('SYMLINK_SCOPE_UNQUALIFIED'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return path.relative(root, current).split(path.sep).join('/');
  }));
}

export function validateWorkGraph(plan, checks) {
  if (plan?.schemaVersion !== 1 || !text(plan.revision) || !plan.tasks ||
      !Array.isArray(plan.criticalPath) || !plan.criticalPath.length) throw new Error('INVALID_GRAPH');
  const ids = Object.keys(plan.tasks);
  if (!ids.length || ids.length > 1000 || new Set(plan.criticalPath).size !== plan.criticalPath.length ||
      plan.criticalPath.some(id => !ids.includes(id))) throw new Error('INVALID_GRAPH');
  const visited = new Set();
  function visit(id, active = new Set()) {
    if (active.has(id)) throw new Error('CYCLIC_GRAPH');
    if (visited.has(id)) return;
    const task = plan.tasks[id];
    if (!/^T\d+$/.test(id) || !task || !Array.isArray(task.dependsOn) ||
        task.dependsOn.some(dep => !ids.includes(dep)) || !Array.isArray(task.allowedEditScope) ||
        task.allowedEditScope.some(scope => !text(scope) || /(^\/|\/\/|\\|:|\0|[*?\[\]]|(^|\/)\.\.?($|\/))/.test(scope)) ||
        !Array.isArray(checks[id]) || !checks[id].length || checks[id].some(c => !text(c)) ||
        new Set(checks[id]).size !== checks[id].length) throw new Error('INVALID_WORK_ORDER');
    for (const dep of task.dependsOn) visit(dep, new Set([...active, id]));
    visited.add(id);
  }
  ids.forEach(id => visit(id));
  return ids;
}

function overlaps(a, b) {
  // Conservative on case-insensitive hosts and on parent/child directory edits.
  return a.some(left => b.some(right => {
    const x = left.toLowerCase().replace(/\/$/, '');
    const y = right.toLowerCase().replace(/\/$/, '');
    return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
  }));
}

/**
 * Run a trusted adapter against the existing priority plan. Each required check
 * runs separately from worker output. This library does not provide a sandbox.
 * An existing journal is a reconciliation gate, not permission to replay work.
 */
export async function runVerifiedGraph({ featureDir, workspaceRoot, checks, adapter,
  maxCalls, maxConcurrent = 1, deadlineMs, signal }) {
  // Copy before any await: a caller or worker must not remove required checks.
  checks = freeze(structuredClone(checks));
  const journalName = 'verified-execution.jsonl';
  if (!positive(maxCalls) || !positive(maxConcurrent) || maxConcurrent > 8 ||
      !Number.isFinite(deadlineMs) || deadlineMs <= Date.now()) throw new Error('FINITE_LIMITS_REQUIRED');
  for (const method of ['execute', 'check', 'inputRevision', 'reserve', 'verified']) {
    if (typeof adapter?.[method] !== 'function') throw new Error(`TRUSTED_ADAPTER_REQUIRED:${method}`);
  }
  const root = await realpath(featureDir);
  const captured = await snapshot(root);
  const plan = freeze(JSON.parse(captured.files['priority-plan.json']));
  const loop = freeze(JSON.parse(captured.files['loop-contract.json']));
  if (!positive(loop.maxIterations)) throw new Error('FINITE_ATTEMPTS_REQUIRED');
  if (loop.budget?.maxModelSpendUsd != null) throw new Error('SPEND_RESERVATION_NOT_IMPLEMENTED');
  if (loop.budget?.maxWallClockMinutes != null) {
    if (!(loop.budget.maxWallClockMinutes > 0)) throw new Error('INVALID_DEADLINE');
    deadlineMs = Math.min(deadlineMs, Date.now() + loop.budget.maxWallClockMinutes * 60000);
  }
  const ids = validateWorkGraph(plan, checks);
  const initial = await reviewPriority(root);
  if (initial.status !== 'pass') throw new Error(`PRIORITY_BLOCKED:${initial.findings.join(',')}`);
  const revision = captured.revision;
  if (await executionRevision(root) !== revision) throw new Error('STALE_DIRECTION');
  const tasksText = await readFile(path.join(root, 'tasks.md'), 'utf8');
  const previouslyComplete = new Set([...tasksText.matchAll(/^\s*-\s+\[[xX]\]\s+(?:\*\*)?(T\d+)\b/gm)].map(m => m[1]));
  if (previouslyComplete.size) throw new Error('BASELINE_EVIDENCE_RECONCILIATION_REQUIRED');
  const scopes = {};
  for (const id of ids) scopes[id] = await canonicalScopes(workspaceRoot, plan.tasks[id].allowedEditScope);
  const states = Object.fromEntries(ids.map(id => [id, 'pending']));
  const attempts = Object.fromEntries(ids.map(id => [id, 0]));
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('CANCELLED'));
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('DEADLINE')), Math.min(deadlineMs - Date.now(), 2147483647));
  const file = await open(path.join(root, journalName), 'wx', 0o600).catch(error => {
    clearTimeout(timer); signal?.removeEventListener('abort', cancel);
    throw new Error(error.code === 'EEXIST' ? 'RECONCILIATION_REQUIRED' : 'JOURNAL_UNAVAILABLE');
  });
  let calls = 0;
  let write = Promise.resolve();
  const record = event => {
    write = write.then(async () => { await file.writeFile(`${JSON.stringify({ schemaVersion: 1, revision, time: new Date().toISOString(), ...event })}\n`); await file.sync(); })
      .catch(() => { controller.abort(new Error('JOURNAL_FAILURE')); throw new Error('JOURNAL_FAILURE'); });
    return write;
  };
  const abortCheck = () => {
    if (Date.now() >= deadlineMs && !controller.signal.aborted) controller.abort(new Error('DEADLINE'));
    if (controller.signal.aborted) throw controller.signal.reason;
  };
  async function current() {
    abortCheck();
    if (await executionRevision(root) !== revision) {
      controller.abort(new Error('STALE_DIRECTION'));
      throw controller.signal.reason;
    }
    abortCheck();
  }
  async function invoke(method, request) {
    await current();
    if (calls >= maxCalls) throw new Error('CALL_LIMIT');
    // Reserve globally before yielding, so parallel calls cannot overdraw.
    calls++;
    await record({ event: 'call_reserved', task: request.taskId, method, call: calls });
    let listener;
    try {
      await current();
      return await Promise.race([
        Promise.resolve().then(() => { abortCheck(); return adapter[method]({ ...request, signal: controller.signal }); }),
        new Promise((_, reject) => {
          listener = () => reject(controller.signal.reason);
          controller.signal.addEventListener('abort', listener, { once: true });
          if (controller.signal.aborted) listener();
        }),
      ]);
    } finally {
      if (listener) controller.signal.removeEventListener('abort', listener);
    }
  }
  async function runTask(taskId) {
    const task = plan.tasks[taskId];
    const request = { taskId, revision, allowedEditScope: task.allowedEditScope, requiredChecks: checks[taskId] };
    try {
      while (attempts[taskId] < loop.maxIterations) {
        await current();
        const priority = await reviewPriority(root, { task: taskId });
        if (priority.status !== 'pass') throw new Error('PRIORITY_BLOCKED');
        await canonicalScopes(workspaceRoot, task.allowedEditScope);
        const attempt = ++attempts[taskId];
        await record({ event: 'attempt_reserved', task: taskId, attempt });
        // Connect to the caller's stable blocker register; denied repairs stop.
        const reservation = await invoke('reserve', { ...request, attempt });
        if (reservation?.allowed !== true) throw new Error('BLOCKER_OR_BUDGET_DENIED');
        states[taskId] = 'running';
        const result = await invoke('execute', { ...request, attempt });
        await current();
        if (!result || !Array.isArray(result.changedFiles) || result.changedFiles.some(f => !text(f))) throw new Error('INVALID_WORKER_RESULT');
        const scope = await reviewPriority(root, { task: taskId, changedFiles: result.changedFiles, workspaceRoot });
        if (scope.status !== 'pass') throw new Error('SCOPE_VIOLATION');
        const inputRevision = await invoke('inputRevision', request);
        if (!text(inputRevision)) throw new Error('INPUT_REVISION_REQUIRED');
        states[taskId] = 'awaiting-check';
        let passed = true;
        for (const check of checks[taskId]) {
          const evidence = await invoke('check', { ...request, attempt, check, inputRevision });
          await current();
          const valid = evidence?.taskId === taskId && evidence.revision === revision &&
            evidence.inputRevision === inputRevision && evidence.check === check &&
            evidence.exitCode === 0 && evidence.executed === true && text(evidence.receipt);
          await record({ event: 'check', task: taskId, attempt, check, inputRevision,
            passed: valid, receipt: text(evidence?.receipt) ? evidence.receipt : null });
          passed &&= valid;
        }
        if (await invoke('inputRevision', request) !== inputRevision) throw new Error('STALE_INPUT');
        if (passed) {
          await current();
          const assertCurrent = async () => {
            await current();
            if (await invoke('inputRevision', request) !== inputRevision) throw new Error('STALE_INPUT');
            await current();
          };
          await assertCurrent();
          // The trusted adapter must compare-and-set, not unconditionally tick tasks.
          const commit = await invoke('verified', { ...request, inputRevision, assertCurrent });
          if (commit?.committed !== true || commit.taskId !== taskId || commit.revision !== revision ||
              commit.inputRevision !== inputRevision || !text(commit.receipt)) throw new Error('COMMIT_RECONCILIATION_REQUIRED');
          await assertCurrent();
          await current();
          states[taskId] = 'verified';
          await record({ event: 'verified', task: taskId, inputRevision, receipt: commit.receipt });
          return;
        }
        await record({ event: 'repair_required', task: taskId, attempt });
      }
      throw new Error('ATTEMPT_LIMIT');
    } catch (error) {
      const reason = controller.signal.aborted ? controller.signal.reason.message : error.message;
      states[taskId] = reason.startsWith('STALE') ? 'stale' : controller.signal.aborted ? 'cancelled' : 'blocked';
      await record({ event: states[taskId], task: taskId, reason, reconciliationRequired: true }).catch(() => {});
    }
  }
  try {
    await record({ event: 'started', maxCalls, maxConcurrent, deadlineMs, baselineTasks: [...previouslyComplete] });
    while (!controller.signal.aborted) {
      const pending = ids.filter(id => states[id] === 'pending');
      if (!pending.length) break;
      const batch = [];
      for (const id of pending) {
        if (!plan.tasks[id].dependsOn.every(dep => states[dep] === 'verified')) continue;
        if ((await reviewPriority(root, { task: id })).status !== 'pass') continue;
        if (batch.some(other => overlaps(scopes[id], scopes[other]))) continue;
        batch.push(id);
        if (batch.length === maxConcurrent) break;
      }
      if (!batch.length) break;
      await Promise.all(batch.map(runTask));
    }
    const verified = ids.filter(id => states[id] === 'verified');
    const status = !controller.signal.aborted && ids.every(id => states[id] === 'verified') ? 'verified' : 'incomplete';
    // Task verification is not the feature/release outcome gate.
    const result = { status, states, verified, calls, attempts, revision, cost: null,
      nativeQualification: 'not-established', featureComplete: false };
    await record({ event: 'finished', ...result });
    return result;
  } finally {
    controller.abort(new Error('RUN_CLOSED'));
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    try { await write; } finally { await file.close(); }
  }
}
