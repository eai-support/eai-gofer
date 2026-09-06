// The caller is a trusted host adapter: these assertions are not cryptographic proof.
// This module only plans; the host enforces permissions, deadlines and cancellation.
const PHASES = ['worker', 'escalator', 'critic', 'repair', 'synthesis', 'validation'];
const METRICS = ['inputTokens', 'cachedInputTokens', 'outputTokens', 'costUsd'];
const CONTEXT = ['spec', 'acceptance', 'platform', 'language', 'permissions'];
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 512;
const number = (v) => Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const integer = (v) => number(v) && Number.isSafeInteger(v);
function requireValue(ok, name) {
  if (!ok) throw new TypeError(`Invalid ${name}`);
}
function fields(value, allowed, name) {
  requireValue(object(value) && Object.keys(value).every((key) => allowed.includes(key)), name);
}
const fresh = (stamp, now, age) => integer(stamp) && stamp <= now && now - stamp <= age;
const result = (status, reason, usage = null, pattern = null, action = null) =>
  ({ status, reason, pattern, action, usage, canClaimDone: false });

/** Sum every reported phase, including failed work. Null means incomplete reporting. */
export function aggregateUsage(attempts) {
  requireValue(Array.isArray(attempts), 'attempts');
  const blank = () => ({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 });
  const summary = { attempts: attempts.length, total: blank(), reported: blank(), byPhase: {} };
  for (const attempt of attempts) {
    requireValue(object(attempt) && PHASES.includes(attempt.phase), 'attempt phase');
    if (attempt.usage != null) fields(attempt.usage, METRICS, 'usage');
    const phase = summary.byPhase[attempt.phase] ??= { attempts: 0, total: blank(), reported: blank() };
    phase.attempts += 1;
    for (const metric of METRICS) {
      const value = attempt.usage?.[metric];
      requireValue(value == null || (metric === 'costUsd' ? number(value) : integer(value)), metric);
      for (const bucket of [summary, phase]) {
        bucket.reported[metric] += value ?? 0;
        requireValue(metric === 'costUsd' ? number(bucket.reported[metric]) : integer(bucket.reported[metric]), `${metric} sum`);
        bucket.total[metric] = value == null || bucket.total[metric] === null ? null : bucket.total[metric] + value;
      }
    }
  }
  return summary;
}

function validateRun(input) {
  fields(input, ['policy', 'host', 'nowMs', 'startedAtMs', 'cancelled', 'revision', 'criterion', 'context', 'capabilities', 'attempts', 'evidence'], 'input');
  const p = input.policy;
  fields(p, ['enabled', 'approved', 'route', 'maxAttempts', 'maxElapsedMs', 'maxEvidenceAgeMs', 'maxCostUsd'], 'policy');
  requireValue(typeof p.approved === 'boolean', 'approval');
  fields(p.route, ['pattern', 'worker', 'escalator', 'critic'], 'approved route');
  requireValue(['single', 'cascade', 'critique', 'peer-review'].includes(p.route.pattern) && text(p.route.worker), 'route pattern/worker');
  for (const key of ['escalator', 'critic']) requireValue(p.route[key] === undefined || text(p.route[key]), `route ${key}`);
  for (const key of ['maxAttempts', 'maxElapsedMs', 'maxEvidenceAgeMs']) {
    requireValue(integer(p[key]) && p[key] > 0, key);
  }
  requireValue(p.maxCostUsd === undefined || number(p.maxCostUsd), 'maxCostUsd');
  requireValue(text(input.host), 'host');
  requireValue(integer(input.nowMs) && integer(input.startedAtMs) && input.startedAtMs <= input.nowMs, 'run clock');
  requireValue(typeof input.cancelled === 'boolean', 'cancellation');
  requireValue(text(input.revision) && text(input.criterion), 'active revision/criterion');
  fields(input.context, CONTEXT, 'context');
  for (const key of CONTEXT) {
    const refs = input.context[key];
    requireValue(Array.isArray(refs) && refs.length > 0 && refs.length <= 8 && refs.every(text), `${key} refs`);
  }
  requireValue(Array.isArray(input.attempts) && Array.isArray(input.evidence), 'history');
  const ids = new Set();
  let end = input.startedAtMs;
  input.attempts.forEach((a, index) => {
    fields(a, ['id', 'phase', 'modelId', 'family', 'revision', 'criterion', 'status', 'startedAtMs', 'finishedAtMs', 'usage'], 'attempt');
    requireValue(['id', 'modelId', 'family', 'revision', 'criterion'].every((key) => text(a[key])), 'attempt identity');
    requireValue(!ids.has(a.id) && PHASES.includes(a.phase), 'attempt id/phase');
    ids.add(a.id);
    requireValue(['succeeded', 'failed', 'running', 'cancelled', 'timed_out'].includes(a.status), 'attempt status');
    requireValue(integer(a.startedAtMs) && a.startedAtMs >= end && a.startedAtMs <= input.nowMs, 'attempt start');
    if (a.status === 'running') {
      requireValue(a.finishedAtMs == null && index === input.attempts.length - 1, 'running attempt');
    } else {
      requireValue(integer(a.finishedAtMs) && a.finishedAtMs >= a.startedAtMs && a.finishedAtMs <= input.nowMs, 'attempt finish');
      end = a.finishedAtMs;
    }
  });
  for (const e of input.evidence) {
    fields(e, ['ref', 'attemptId', 'revision', 'criterion', 'kind', 'status', 'deterministic', 'observedAtMs'], 'evidence');
    requireValue(['ref', 'attemptId', 'revision', 'criterion'].every((key) => text(e[key])), 'evidence identity');
    requireValue(['test', 'lint', 'typecheck', 'acceptance', 'confidence', 'review'].includes(e.kind), 'evidence kind');
    requireValue(['pass', 'fail', 'blocked', 'unknown'].includes(e.status), 'evidence status');
    requireValue(typeof e.deterministic === 'boolean' && integer(e.observedAtMs), 'evidence observation');
  }
}

function capabilityRoles(input) {
  const c = input.capabilities;
  if (c == null) return null;
  fields(c, ['host', 'verified', 'observedAtMs', 'modelSelection', 'readOnlyIsolation', 'models'], 'capabilities');
  if (c.host !== input.host || c.verified !== true || c.modelSelection !== true ||
      !fresh(c.observedAtMs, input.nowMs, input.policy.maxEvidenceAgeMs)) return null;
  if (c.models == null) return null;
  requireValue(Array.isArray(c.models), 'models');
  const ids = new Set();
  for (const role of c.models) {
    fields(role, ['id', 'family', 'available', 'nativeCompound'], 'role model');
    requireValue(text(role.id) && text(role.family) && typeof role.available === 'boolean' && typeof role.nativeCompound === 'boolean', 'role model evidence');
    requireValue(!ids.has(role.id), 'duplicate model evidence');
    ids.add(role.id);
  }
  return Object.fromEntries(['worker', 'escalator', 'critic'].map((role) => [role, c.models.find((model) => model.id === input.policy.route[role])]));
}

function currentFailure(input, last) {
  // Pick the latest observation BEFORE testing for failure. A later pass/unknown
  // or conflicting timestamp must never resurrect an earlier failed check.
  const observations = input.evidence.filter((e) => e.revision === input.revision && e.criterion === input.criterion);
  const stamp = observations.reduce((max, e) => Math.max(max, e.observedAtMs), -1);
  const latest = observations.filter((e) => e.observedAtMs === stamp);
  if (latest.length !== 1) return null;
  const e = latest[0];
  return e.attemptId === last.id && e.observedAtMs >= last.finishedAtMs &&
    fresh(e.observedAtMs, input.nowMs, input.policy.maxEvidenceAgeMs) &&
    e.status === 'fail' && e.deterministic && ['test', 'lint', 'typecheck', 'acceptance'].includes(e.kind) ? e : null;
}

/** Pure, deterministic snapshot decision. Never executes, inherits authority or certifies delivery. */
export function planOrchestration(input) {
  try {
    if (input == null) return result('legacy', 'unconfigured');
    requireValue(object(input), 'input');
    const p = input.policy;
    if (p == null) return result('legacy', 'unconfigured');
    requireValue(object(p), 'policy');
    if (p.enabled === false) return result('legacy', 'disabled');
    if (p.enabled === undefined) return result('legacy', 'unconfigured');
    requireValue(p.enabled === true, 'enabled');
    validateRun(input);
    const usage = aggregateUsage(input.attempts);
    const decision = (status, reason, pattern = null, action = null) => result(status, reason, usage, pattern, action);
    const remainingMs = p.maxElapsedMs - (input.nowMs - input.startedAtMs);
    const remainingAttempts = p.maxAttempts - input.attempts.length;
    if (input.cancelled) return decision('stop', 'cancelled');
    if (remainingMs <= 0) return decision('stop', 'time_limit');
    if (remainingAttempts <= 0) return decision('stop', 'attempt_limit');
    if (p.maxCostUsd !== undefined && usage.total.costUsd === null) return decision('stop', 'cost_unknown');
    if (p.maxCostUsd !== undefined && usage.total.costUsd >= p.maxCostUsd) return decision('stop', 'cost_limit');
    const remainingCostUsd = p.maxCostUsd === undefined ? null : p.maxCostUsd - usage.total.costUsd;
    const last = input.attempts.at(-1);
    if (last && ['failed', 'cancelled', 'timed_out'].includes(last.status)) return decision('stop', `attempt_${last.status}`);
    if (last?.status === 'running') return decision('wait', 'attempt_running');
    if (!p.approved) return decision('legacy', 'approval_required');
    const roles = capabilityRoles(input);
    if (!roles?.worker?.available) return decision('legacy', 'capability_unavailable');
    let pattern = p.route.pattern;
    const companion = pattern === 'cascade' ? 'escalator' : 'critic';
    const previousModel = input.capabilities.models.find((model) => model.id === last?.modelId);
    if (roles.worker.nativeCompound || previousModel?.nativeCompound) {
      // Avoid nested orchestration without dropping the approved review obligation.
      if (['critique', 'peer-review'].includes(pattern)) {
        return decision('stop', 'native_compound_review_unavailable', pattern);
      }
      pattern = 'single';
    }
    if (pattern !== 'single' && !roles[companion]?.available) return decision('legacy', 'model_unavailable');
    if (pattern !== 'single' && roles[companion].nativeCompound) return decision('legacy', 'native_compound_companion_unsupported');
    if (pattern === 'cascade' && roles.worker.id === roles.escalator.id) return decision('legacy', 'escalation_unavailable');
    if (['critique', 'peer-review'].includes(pattern) && input.capabilities.readOnlyIsolation !== true) return decision('legacy', 'read_only_unavailable');
    if (pattern === 'peer-review' && roles.critic.id === roles.worker.id) return decision('legacy', 'distinct_model_unavailable');
    if (pattern === 'critique' && (roles.critic.id === roles.worker.id || roles.critic.family.toLowerCase() === roles.worker.family.toLowerCase())) {
      return decision('legacy', 'independent_family_unavailable');
    }
    const delegate = (role, phase, evidence = null) => decision('delegate', pattern !== p.route.pattern ? 'native_compound_single' : 'bounded_delegate', pattern, {
      role, phase, modelId: roles[role].id, family: roles[role].family, readOnly: role === 'critic',
      inheritContext: false, context: Object.fromEntries(CONTEXT.map((key) => [key, [...input.context[key]]])),
      revision: input.revision, criterion: input.criterion, evidenceRef: evidence?.ref ?? null,
      limits: { remainingAttempts, remainingMs, remainingCostUsd },
    });
    if (!last) return delegate('worker', 'worker');
    if (last.revision !== input.revision || last.criterion !== input.criterion) return decision('validate', 'active_work_changed', pattern);
    if (pattern === 'single') return decision('validate', 'existing_validation_required', pattern);
    const matchesRole = (a, model) => a?.modelId === model.id && a.family === model.family &&
      a.status === 'succeeded' && a.revision === input.revision && a.criterion === input.criterion;
    if (pattern === 'cascade') {
      if (!['worker', 'escalator'].includes(last.phase) || !matchesRole(last, roles[last.phase])) {
        return decision('validate', 'cascade_history_invalid', pattern);
      }
      if (last.phase === 'escalator') return decision('validate', 'escalation_exhausted', pattern);
    }
    if (['critique', 'peer-review'].includes(pattern) && ['worker', 'repair', 'critic'].includes(last.phase)) {
      // A phase label cannot establish who produced or independently reviewed work.
      const worker = last.phase === 'critic' ? input.attempts.at(-2) : last;
      if (!['worker', 'repair'].includes(worker?.phase) || !matchesRole(worker, roles.worker) ||
          (last.phase === 'critic' && (!matchesRole(last, roles.critic) ||
            (pattern === 'critique' && last.family.toLowerCase() === worker.family.toLowerCase()) ||
            last.modelId === worker.modelId))) {
        return decision('validate', 'critique_history_invalid', pattern);
      }
      if (last.phase !== 'critic') return delegate('critic', 'critic');
    }
    const failure = currentFailure(input, last);
    if (!failure) return decision('validate', 'current_failed_check_required', pattern);
    if (pattern === 'cascade') return delegate('escalator', 'escalator', failure);
    if (last.phase === 'critic') return delegate('worker', 'repair', failure);
    return decision('validate', 'existing_validation_required', pattern);
  } catch (error) {
    return result('invalid', error instanceof TypeError ? error.message : 'Invalid input');
  }
}
