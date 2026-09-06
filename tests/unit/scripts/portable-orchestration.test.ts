import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateUsage,
  planOrchestration,
} from '../../../.specify/scripts/node/lib/portable-orchestration.mjs';
import type {
  Attempt,
  Evidence,
  OrchestrationInput,
  Pattern,
  Phase,
} from '../../../.specify/scripts/node/lib/portable-orchestration.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = path.join(ROOT, '.specify/scripts/node/gofer-orchestration.mjs');
const HOSTS = ['claude', 'codex', 'copilot', 'gemini', 'vscode', 'grok'];
const NOW = 1_800_000_000_000;
// Synthetic adapter fixtures, NOT claims about live provider models or capabilities.
function snapshot(pattern: Pattern = 'single', host = 'codex'): OrchestrationInput {
  return {
    policy: {
      enabled: true,
      approved: true,
      route: {
        pattern,
        worker: 'adapter:worker',
        escalator: 'adapter:escalator',
        critic: 'adapter:critic',
      },
      maxAttempts: 6,
      maxElapsedMs: 60_000,
      maxEvidenceAgeMs: 10_000,
    },
    host,
    nowMs: NOW,
    startedAtMs: NOW - 5_000,
    cancelled: false,
    revision: 'revision-2',
    criterion: 'FR-05',
    context: {
      spec: ['spec.md#FR-05'],
      acceptance: ['acceptance.md#FR-05'],
      platform: ['platform.md#rules'],
      language: ['language.md#rules'],
      permissions: ['approval.md#bounded-scope'],
    },
    capabilities: {
      host,
      verified: true,
      observedAtMs: NOW - 100,
      modelSelection: true,
      readOnlyIsolation: true,
      models: [
        { id: 'adapter:worker', family: 'family-a', available: true, nativeCompound: false },
        { id: 'adapter:escalator', family: 'family-a', available: true, nativeCompound: false },
        { id: 'adapter:critic', family: 'family-b', available: true, nativeCompound: false },
      ],
    },
    attempts: [],
    evidence: [],
  };
}
function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'attempt-1',
    phase: 'worker',
    modelId: 'adapter:worker',
    family: 'family-a',
    revision: 'revision-2',
    criterion: 'FR-05',
    status: 'succeeded',
    startedAtMs: NOW - 4_000,
    finishedAtMs: NOW - 3_000,
    usage: { inputTokens: 100, cachedInputTokens: 50, outputTokens: 20, costUsd: 0.125 },
    ...overrides,
  };
}
function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    ref: 'checks.json#FR-05',
    attemptId: 'attempt-1',
    revision: 'revision-2',
    criterion: 'FR-05',
    kind: 'test',
    status: 'fail',
    deterministic: true,
    observedAtMs: NOW - 2_000,
    ...overrides,
  };
}
function completed(pattern: Pattern = 'cascade'): OrchestrationInput {
  const input = snapshot(pattern);
  input.attempts = [attempt()];
  input.evidence = [evidence()];
  return input;
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

describe.each(HOSTS)('portable planning on %s (synthetic evidence)', (host) => {
  it.each(['single', 'cascade', 'critique'] as const)(
    'plans the approved %s route from exact host evidence',
    (pattern) => {
      const input = snapshot(pattern, host);
      expect(planOrchestration(input)).toMatchObject({
        status: 'delegate',
        pattern,
        canClaimDone: false,
        action: {
          role: 'worker',
          modelId: 'adapter:worker',
          limits: { remainingAttempts: 6, remainingMs: 55_000 },
        },
      });
    }
  );
  it('retains the existing path without capability evidence', () => {
    const input = snapshot('cascade', host);
    delete input.capabilities;
    expect(planOrchestration(input)).toMatchObject({ status: 'legacy', action: null });
  });
  it('does not look up capabilities or history when disabled', () => {
    const input = { policy: { enabled: false }, host };
    for (const field of ['capabilities', 'attempts', 'evidence', 'context', 'nowMs']) {
      Object.defineProperty(input, field, {
        get() {
          throw new Error('Disabled mode must not inspect this');
        },
      });
    }
    expect(planOrchestration(input)).toEqual(planOrchestration({ policy: { enabled: false } }));
    expect(planOrchestration(input)).toMatchObject({
      status: 'legacy',
      reason: 'disabled',
      usage: null,
    });
  });
  it('retains the existing path when read-only isolation is absent', () => {
    const input = snapshot('critique', host);
    input.capabilities!.readOnlyIsolation = false;
    expect(planOrchestration(input)).toMatchObject({
      status: 'legacy',
      reason: 'read_only_unavailable',
      action: null,
    });
  });
});

describe('approval, capabilities and explicit context', () => {
  it.each([undefined, null, {}, { policy: null }, { policy: {} }])(
    'preserves unconfigured parity: %j',
    (input) => {
      expect(planOrchestration(input)).toEqual(planOrchestration());
    }
  );
  it('requires approval separately from capabilities', () => {
    const input = snapshot();
    input.policy.approved = false;
    expect(planOrchestration(input)).toMatchObject({
      status: 'legacy',
      reason: 'approval_required',
    });
  });
  it('does not substitute available models for the approved route', () => {
    const input = snapshot();
    input.policy.route.worker = 'an-unapproved-substitution';
    expect(planOrchestration(input)).toMatchObject({
      status: 'legacy',
      reason: 'capability_unavailable',
    });
    input.policy.route.worker = input.capabilities!.models[1].id;
    expect(planOrchestration(input).action?.modelId).toBe('adapter:escalator');
  });
  it.each(['worker', 'escalator', 'critic'] as const)(
    'falls back for unavailable %s models',
    (role) => {
      const input = snapshot(role === 'critic' ? 'critique' : 'cascade');
      input.capabilities!.models.find((model) => model.id === input.policy.route[role])!.available =
        false;
      expect(planOrchestration(input)).toMatchObject({ status: 'legacy', action: null });
    }
  );
  it.each(['host', 'verified', 'observedAtMs', 'modelSelection', 'models'])(
    'falls back for missing capability field %s',
    (field) => {
      const input = snapshot();
      Reflect.deleteProperty(input.capabilities!, field);
      expect(planOrchestration(input)).toMatchObject({ status: 'legacy', action: null });
    }
  );
  it.each([
    ['wrong host', { host: 'claude' }],
    ['unverified', { verified: false }],
    ['no model selection', { modelSelection: false }],
    ['stale', { observedAtMs: NOW - 10_001 }],
    ['future', { observedAtMs: NOW + 1 }],
    ['NaN', { observedAtMs: NaN }],
  ])('rejects %s capability evidence', (_name, change) => {
    const input = snapshot();
    Object.assign(input.capabilities!, change);
    expect(planOrchestration(input)).toMatchObject({ status: 'legacy', action: null });
  });
  it('accepts evidence exactly at its freshness boundary, not a millisecond beyond', () => {
    const input = snapshot();
    input.capabilities!.observedAtMs = NOW - 10_000;
    expect(planOrchestration(input).status).toBe('delegate');
    input.capabilities!.observedAtMs -= 1;
    expect(planOrchestration(input).status).toBe('legacy');
  });
  it('does not infer support or lack of support from a host name', () => {
    const input = snapshot('single', 'new-canonical-host');
    expect(planOrchestration(input).status).toBe('delegate');
    delete input.capabilities;
    expect(planOrchestration(input).status).toBe('legacy');
  });
  it.each(HOSTS)('CLI and desktop adapters share the canonical %s host', (host) => {
    const cli = snapshot('single', host);
    const desktop = snapshot('single', host);
    expect(planOrchestration(cli)).toEqual(planOrchestration(desktop));
    expect(planOrchestration(desktop).status).toBe('delegate');
  });
  it('accepts an explicit non-app decision record without app setup', () => {
    const input = snapshot();
    input.context.spec = ['maintenance-record:portable-orchestration'];
    expect(planOrchestration(input).status).toBe('delegate');
  });
  it.each(['spec', 'acceptance', 'platform', 'language', 'permissions'] as const)(
    'requires explicit %s references',
    (field) => {
      const input = snapshot();
      input.context[field] = [];
      expect(planOrchestration(input)).toMatchObject({ status: 'invalid', action: null });
      Reflect.deleteProperty(input.context, field);
      expect(planOrchestration(input).status).toBe('invalid');
    }
  );
  it('copies only compact explicit refs, never overrides checks, risk or approval', () => {
    const input = snapshot();
    const result = planOrchestration(input);
    expect(result.action?.context).toEqual(input.context);
    expect(result.action?.inheritContext).toBe(false);
    expect(result.action?.context.permissions).not.toBe(input.context.permissions);
    expect(Object.keys(result.action!)).toEqual([
      'role',
      'phase',
      'modelId',
      'family',
      'readOnly',
      'inheritContext',
      'context',
      'revision',
      'criterion',
      'evidenceRef',
      'limits',
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /completion|riskFloor|mandatoryChecks|approvalOverride/
    );
  });
  it.each([
    'inheritContext',
    'command',
    'credentials',
    'riskFloor',
    'mandatoryChecks',
    'approvalOverride',
  ])('rejects an attempted %s override', (field) => {
    expect(planOrchestration({ ...snapshot(), [field]: true })).toMatchObject({
      status: 'invalid',
      action: null,
    });
  });
  it('is deterministic and does not mutate frozen input or sample wall-clock time', () => {
    const input = completed();
    const before = JSON.stringify(input);
    freeze(input);
    expect(planOrchestration(input)).toEqual(planOrchestration(JSON.parse(before)));
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('bounded routes and independent critique', () => {
  it('single returns to existing validation after one attempt, including failed quality checks', () => {
    expect(planOrchestration(completed('single'))).toMatchObject({
      status: 'validate',
      action: null,
      canClaimDone: false,
    });
  });
  it('cascade escalates only with linked current failed deterministic evidence', () => {
    expect(planOrchestration(completed())).toMatchObject({
      status: 'delegate',
      pattern: 'cascade',
      canClaimDone: false,
      action: { role: 'escalator', modelId: 'adapter:escalator', evidenceRef: 'checks.json#FR-05' },
    });
  });
  it('critique plans a different-family read-only critic, then a bounded repair', () => {
    const input = completed('critique');
    input.evidence = [];
    expect(planOrchestration(input)).toMatchObject({
      status: 'delegate',
      action: {
        role: 'critic',
        phase: 'critic',
        family: 'family-b',
        readOnly: true,
        inheritContext: false,
      },
    });
    input.attempts.push(
      attempt({
        id: 'attempt-2',
        phase: 'critic',
        modelId: 'adapter:critic',
        family: 'family-b',
        startedAtMs: NOW - 2_000,
        finishedAtMs: NOW - 1_000,
      })
    );
    expect(planOrchestration(input)).toMatchObject({ status: 'validate', action: null });
    input.evidence = [evidence({ attemptId: 'attempt-2', observedAtMs: NOW })];
    expect(planOrchestration(input)).toMatchObject({
      status: 'delegate',
      action: { role: 'worker', phase: 'repair', readOnly: false },
    });
  });
  it.each(['family-a', 'FAMILY-A'])('rejects a critic in worker family %s', (family) => {
    const input = snapshot('critique');
    input.capabilities!.models[2].family = family;
    expect(planOrchestration(input)).toMatchObject({
      status: 'legacy',
      reason: 'independent_family_unavailable',
    });
  });
  it('compares the critic with the actual previous worker, not just the planned worker', () => {
    const input = completed('critique');
    input.attempts[0].family = 'family-b';
    expect(planOrchestration(input)).toMatchObject({
      status: 'validate',
      reason: 'critique_history_invalid',
      action: null,
    });
  });
  it('does not allow the same model as worker and critic', () => {
    const input = snapshot('critique');
    input.policy.route.critic = input.policy.route.worker;
    expect(planOrchestration(input).status).toBe('legacy');
  });
  it.each(['cascade'] as const)('does not nest %s around a native compound worker', (pattern) => {
    const input = snapshot(pattern);
    input.capabilities!.models[0].nativeCompound = true;
    input.capabilities!.readOnlyIsolation = false;
    expect(planOrchestration(input)).toMatchObject({
      status: 'delegate',
      pattern: 'single',
      reason: 'native_compound_single',
    });
    input.attempts = [attempt()];
    input.evidence = [evidence()];
    expect(planOrchestration(input)).toMatchObject({
      status: 'validate',
      pattern: 'single',
      action: null,
    });
  });
  it.each(['critique', 'peer-review'] as const)(
    'preserves required %s instead of downgrading a compound worker',
    (pattern) => {
      const input = snapshot(pattern);
      input.capabilities!.models[0].nativeCompound = true;
      const expected = {
        status: 'stop',
        reason: 'native_compound_review_unavailable',
        pattern,
        action: null,
        canClaimDone: false,
      };
      expect(planOrchestration(input)).toMatchObject(expected);
      input.attempts = [attempt()];
      expect(planOrchestration(input)).toMatchObject(expected);
      input.capabilities!.models[0].nativeCompound = false;
      input.capabilities!.models.push({
        id: 'previous-compound',
        family: 'native-family',
        available: false,
        nativeCompound: true,
      });
      input.attempts[0].modelId = 'previous-compound';
      input.attempts[0].family = 'native-family';
      expect(planOrchestration(input)).toMatchObject(expected);
      expect(input.policy.route.pattern).toBe(pattern);
    }
  );
  it.each(['cascade', 'critique'] as const)(
    'falls back rather than silently omitting the native compound companion in %s',
    (pattern) => {
      const input = snapshot(pattern);
      input.capabilities!.models[pattern === 'cascade' ? 1 : 2].nativeCompound = true;
      expect(planOrchestration(input)).toMatchObject({
        status: 'legacy',
        reason: 'native_compound_companion_unsupported',
        action: null,
      });
    }
  );
  it('does not add an outer loop to a completed native model after the approved route changes', () => {
    const input = completed();
    input.capabilities!.models.push({
      id: 'adapter:previous-native',
      family: 'family-n',
      available: false,
      nativeCompound: true,
    });
    input.attempts[0].modelId = 'adapter:previous-native';
    input.attempts[0].family = 'family-n';
    expect(planOrchestration(input)).toMatchObject({
      status: 'validate',
      pattern: 'single',
      action: null,
    });
  });
});

describe('cascade history and distinct escalation', () => {
  it.each([false, true])(
    'falls back for identical approved worker/escalator IDs (has history: %s)',
    (hasHistory) => {
      const input = hasHistory ? completed() : snapshot('cascade');
      input.policy.route.escalator = input.policy.route.worker;
      expect(planOrchestration(input)).toMatchObject({
        status: 'legacy',
        reason: 'escalation_unavailable',
        action: null,
      });
    }
  );
  it.each([
    ['unapproved worker', { modelId: 'adapter:unrelated' }],
    ['escalator relabelled worker', { modelId: 'adapter:escalator' }],
    ['worker relabelled escalator', { phase: 'escalator' }],
    ['wrong worker family', { family: 'family-b' }],
    ['noncanonical worker family', { family: 'FAMILY-A' }],
    [
      'wrong escalator family',
      { phase: 'escalator', modelId: 'adapter:escalator', family: 'family-b' },
    ],
    ['critic phase', { phase: 'critic' }],
    ['repair phase', { phase: 'repair' }],
    ['synthesis phase', { phase: 'synthesis' }],
    ['validation phase', { phase: 'validation' }],
  ] as const)(
    'rejects unrelated previous work despite linked failed evidence: %s',
    (_name, change) => {
      const input = completed();
      Object.assign(input.attempts[0], change);
      expect(planOrchestration(input)).toMatchObject({
        status: 'validate',
        reason: 'cascade_history_invalid',
        action: null,
        canClaimDone: false,
      });
    }
  );
  it('does not infer model rank or price, and allows distinct approved models in the same family', () => {
    const input = completed();
    input.capabilities!.models[1].id = 'host:approved-next-model';
    input.policy.route.escalator = 'host:approved-next-model';
    expect(planOrchestration(input)).toMatchObject({
      status: 'delegate',
      action: { modelId: 'host:approved-next-model', phase: 'escalator', family: 'family-a' },
    });
  });
  it('does not label another attempt with the already-used escalator as a new escalation', () => {
    const input = completed();
    input.attempts.push(
      attempt({
        id: 'attempt-2',
        phase: 'escalator',
        modelId: 'adapter:escalator',
        startedAtMs: NOW - 2_000,
        finishedAtMs: NOW - 1_000,
      })
    );
    input.evidence = [evidence({ attemptId: 'attempt-2', observedAtMs: NOW })];
    expect(planOrchestration(input)).toMatchObject({
      status: 'validate',
      reason: 'escalation_exhausted',
      action: null,
    });
  });
});

describe('critique history identity and sequence', () => {
  function reviewed(): OrchestrationInput {
    const input = completed('critique');
    input.attempts.push(
      attempt({
        id: 'attempt-2',
        phase: 'critic',
        modelId: 'adapter:critic',
        family: 'family-b',
        startedAtMs: NOW - 2_000,
        finishedAtMs: NOW - 1_000,
      })
    );
    input.evidence = [evidence({ attemptId: 'attempt-2', observedAtMs: NOW })];
    return input;
  }
  function rejectsHistory(input: OrchestrationInput): void {
    expect(planOrchestration(input)).toMatchObject({
      status: 'validate',
      reason: 'critique_history_invalid',
      pattern: 'critique',
      action: null,
      canClaimDone: false,
    });
  }
  it('rejects the reviewer reproduction: worker relabelled as an orphan critic', () => {
    const input = completed('critique');
    input.attempts[0].phase = 'critic';
    rejectsHistory(input);
  });
  it('rejects an orphan critic even with its exact approved identity and current failed check', () => {
    const input = reviewed();
    input.attempts.shift();
    rejectsHistory(input);
  });
  it.each([
    ['self-critic', { modelId: 'adapter:worker', family: 'family-a' }],
    ['self-critic with relabelled family', { modelId: 'adapter:worker' }],
    ['unapproved independent model', { modelId: 'adapter:other-critic' }],
    ['mismatched family', { family: 'family-c' }],
    ['same family as worker', { family: 'family-a' }],
    ['noncanonical family', { family: 'FAMILY-B' }],
  ] as const)('rejects recorded critic identity: %s', (_name, change) => {
    const input = reviewed();
    Object.assign(input.attempts[1], change);
    rejectsHistory(input);
  });
  it.each([
    ['unapproved model', { modelId: 'adapter:other-worker' }],
    ['same-family escalator', { modelId: 'adapter:escalator' }],
    ['mismatched family', { family: 'family-c' }],
    ['noncanonical family', { family: 'FAMILY-A' }],
    ['old revision', { revision: 'revision-1' }],
    ['other criterion', { criterion: 'FR-06' }],
    ['synthesis phase', { phase: 'synthesis' }],
    ['another critic', { phase: 'critic' }],
    ['failed work', { status: 'failed' }],
    ['cancelled work', { status: 'cancelled' }],
    ['timed out work', { status: 'timed_out' }],
  ] as const)('rejects mismatched critic predecessor: %s', (_name, change) => {
    const input = reviewed();
    Object.assign(input.attempts[0], change);
    rejectsHistory(input);
  });
  it('does not skip an unrelated intervening phase to find an older matching worker', () => {
    const input = reviewed();
    input.attempts.splice(
      1,
      0,
      attempt({
        id: 'intervening',
        phase: 'validation',
        startedAtMs: NOW - 3_000,
        finishedAtMs: NOW - 2_000,
      })
    );
    rejectsHistory(input);
  });
  it.each(['worker', 'repair'] as const)(
    'rejects an unapproved %s identity before delegating a critic',
    (phase) => {
      for (const change of [{ modelId: 'adapter:escalator' }, { family: 'family-c' }]) {
        const input = completed('critique');
        Object.assign(input.attempts[0], { phase }, change);
        rejectsHistory(input);
      }
    }
  );
  it.each(['worker', 'repair'] as const)(
    'permits repair after a verified critic of the approved %s',
    (phase) => {
      const input = reviewed();
      input.attempts[0].phase = phase;
      expect(planOrchestration(input)).toMatchObject({
        status: 'delegate',
        action: { role: 'worker', phase: 'repair', evidenceRef: 'checks.json#FR-05' },
      });
    }
  );
  it('preserves the legitimate worker, critic, repair, critic progression', () => {
    const input = reviewed();
    input.attempts.push(
      attempt({ id: 'attempt-3', phase: 'repair', startedAtMs: NOW - 1_000, finishedAtMs: NOW })
    );
    expect(planOrchestration(input)).toMatchObject({
      status: 'delegate',
      action: { role: 'critic', readOnly: true },
    });
  });
});

describe('current quality evidence, not confidence', () => {
  it('does not escalate when quality evidence is missing', () => {
    const input = completed();
    input.evidence = [];
    expect(planOrchestration(input)).toMatchObject({
      status: 'validate',
      reason: 'current_failed_check_required',
    });
  });
  it.each([
    ['pass', { status: 'pass' }],
    ['unknown', { status: 'unknown' }],
    ['blocked', { status: 'blocked' }],
    ['subjective', { deterministic: false }],
    ['confidence', { kind: 'confidence' }],
    ['review opinion', { kind: 'review' }],
    ['old revision', { revision: 'revision-1' }],
    ['other criterion', { criterion: 'FR-06' }],
    ['old attempt', { attemptId: 'attempt-0' }],
    ['before result', { observedAtMs: NOW - 3_001 }],
    ['future', { observedAtMs: NOW + 1 }],
  ])('does not escalate from %s evidence', (_name, change) => {
    const input = completed();
    Object.assign(input.evidence[0], change);
    expect(planOrchestration(input)).toMatchObject({ status: 'validate', action: null });
  });
  it('rejects stale failure even when the capability evidence is fresh', () => {
    const input = completed();
    input.policy.maxEvidenceAgeMs = 1_000;
    expect(planOrchestration(input)).toMatchObject({ status: 'validate', action: null });
  });
  it.each(['pass', 'unknown', 'blocked'] as const)(
    'a later %s supersedes old failed evidence regardless of array order',
    (status) => {
      const input = completed();
      input.evidence.unshift(evidence({ status, observedAtMs: NOW - 1_000 }));
      expect(planOrchestration(input).status).toBe('validate');
    }
  );
  it('a tied observation is ambiguous, not an escalation trigger', () => {
    const input = completed();
    input.evidence.push(evidence({ status: 'pass' }));
    expect(planOrchestration(input).status).toBe('validate');
  });
  it('future evidence cannot expose an older otherwise-valid failure', () => {
    const input = completed();
    input.evidence.push(evidence({ observedAtMs: NOW + 1 }));
    expect(planOrchestration(input).status).toBe('validate');
  });
  it.each(['revision', 'criterion'] as const)(
    'does not review or escalate work after the active %s changes',
    (field) => {
      const input = completed('critique');
      input[field] = 'changed';
      expect(planOrchestration(input)).toMatchObject({
        status: 'validate',
        reason: 'active_work_changed',
      });
    }
  );
  it('does not reuse failure evidence after another escalation attempt', () => {
    const input = completed();
    input.attempts.push(
      attempt({ id: 'attempt-2', phase: 'escalator', startedAtMs: NOW - 1_000, finishedAtMs: NOW })
    );
    expect(planOrchestration(input).status).toBe('validate');
  });
});

describe('stop conditions and whole-run accounting', () => {
  it('stops cancellation before capability fallback', () => {
    const input = completed();
    input.cancelled = true;
    delete input.capabilities;
    expect(planOrchestration(input)).toMatchObject({
      status: 'stop',
      reason: 'cancelled',
      action: null,
      canClaimDone: false,
    });
  });
  it.each(['failed', 'cancelled', 'timed_out'] as const)(
    'stops a %s execution without treating it as failed quality evidence',
    (status) => {
      const input = completed();
      input.attempts[0].status = status;
      expect(planOrchestration(input)).toMatchObject({
        status: 'stop',
        reason: `attempt_${status}`,
        action: null,
      });
    }
  );
  it('waits for a running attempt and retains its partial usage', () => {
    const input = completed();
    input.attempts[0].status = 'running';
    delete input.attempts[0].finishedAtMs;
    delete input.attempts[0].usage!.costUsd;
    expect(planOrchestration(input)).toMatchObject({
      status: 'wait',
      action: null,
      usage: { attempts: 1, total: { costUsd: null } },
    });
  });
  it('stops a running attempt at the cumulative time boundary', () => {
    const input = completed();
    input.attempts[0].status = 'running';
    delete input.attempts[0].finishedAtMs;
    input.policy.maxElapsedMs = 5_000;
    expect(planOrchestration(input)).toMatchObject({ status: 'stop', reason: 'time_limit' });
  });
  it('counts every phase and never resets elapsed time for review or synthesis', () => {
    const input = snapshot('critique');
    input.startedAtMs = NOW - 6_000;
    const phases: Phase[] = ['worker', 'critic', 'repair', 'escalator', 'synthesis', 'validation'];
    input.attempts = phases.map((phase, index) =>
      attempt({
        id: `attempt-${index}`,
        phase,
        status: index === 0 ? 'failed' : 'succeeded',
        startedAtMs: NOW - 6_000 + index * 1_000,
        finishedAtMs: NOW - 5_000 + index * 1_000,
      })
    );
    input.policy.maxAttempts = 7;
    input.policy.maxElapsedMs = 6_000;
    expect(planOrchestration(input)).toMatchObject({
      status: 'stop',
      reason: 'time_limit',
      usage: { attempts: 6, total: { costUsd: 0.75 } },
    });
    input.policy.maxElapsedMs = 6_001;
    input.policy.maxAttempts = 6;
    expect(planOrchestration(input)).toMatchObject({
      status: 'stop',
      reason: 'attempt_limit',
      usage: { attempts: 6 },
    });
  });
  it('aggregates all cost legs, phases, failed attempts and tokens', () => {
    const phases: Phase[] = ['worker', 'escalator', 'critic', 'repair', 'synthesis', 'validation'];
    const summary = aggregateUsage(
      phases.flatMap((phase) => [attempt({ phase, status: 'failed' }), attempt({ phase })])
    );
    expect(summary.attempts).toBe(12);
    expect(summary.total).toEqual({
      inputTokens: 1_200,
      cachedInputTokens: 600,
      outputTokens: 240,
      costUsd: 1.5,
    });
    for (const phase of phases)
      expect(summary.byPhase[phase]).toMatchObject({ attempts: 2, total: { costUsd: 0.25 } });
  });
  it.each([undefined, null, {}, { inputTokens: 5 }, { costUsd: null }])(
    'missing usage is unknown, not free: %j',
    (usage) => {
      const summary = aggregateUsage([attempt(), attempt({ phase: 'critic', usage })]);
      expect(summary.total.costUsd).toBeNull();
      expect(summary.reported.costUsd).toBe(0.125);
      expect(summary.byPhase.critic!.total.costUsd).toBeNull();
    }
  );
  it('preserves explicitly reported zero and the empty ledger', () => {
    expect(aggregateUsage([]).total.costUsd).toBe(0);
    expect(
      aggregateUsage([attempt({ usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } })]).total
        .costUsd
    ).toBe(0);
  });
  it.each([NaN, Infinity, -Infinity, -1, '1'])('rejects invalid cost or tokens: %s', (value) => {
    for (const metric of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'costUsd']) {
      const input = completed();
      Object.assign(input.attempts[0].usage!, { [metric]: value });
      expect(planOrchestration(input)).toMatchObject({ status: 'invalid', action: null });
      expect(() => aggregateUsage(input.attempts)).toThrow(TypeError);
    }
  });
  it('rejects fractional tokens and overflow even when another cost leg is unknown', () => {
    expect(() => aggregateUsage([attempt({ usage: { inputTokens: 0.5 } })])).toThrow(TypeError);
    expect(() =>
      aggregateUsage([
        attempt({ usage: {} }),
        attempt({ usage: { costUsd: Number.MAX_SAFE_INTEGER } }),
        attempt({ usage: { costUsd: 1 } }),
      ])
    ).toThrow(TypeError);
  });
  it('reports missing cache metrics independently without changing the known bill', () => {
    const summary = aggregateUsage([attempt({ usage: { inputTokens: 10, costUsd: 0.25 } })]);
    expect(summary.total).toMatchObject({
      cachedInputTokens: null,
      inputTokens: 10,
      costUsd: 0.25,
    });
  });
  it('supplies the exact remaining spend allowance, or null when uncapped', () => {
    const input = completed();
    expect(planOrchestration(input).action?.limits.remainingCostUsd).toBeNull();
    input.policy.maxCostUsd = 0.5;
    expect(planOrchestration(input).action?.limits.remainingCostUsd).toBe(0.375);
  });
  it.each([0, 0.125, 0.1])('stops at or beyond spend limit %s', (maxCostUsd) => {
    const input = completed();
    input.policy.maxCostUsd = maxCostUsd;
    expect(planOrchestration(input)).toMatchObject({
      status: 'stop',
      reason: 'cost_limit',
      action: null,
    });
  });
  it('stops before the first attempt when the approved spend is zero', () => {
    const input = snapshot();
    input.policy.maxCostUsd = 0;
    expect(planOrchestration(input).reason).toBe('cost_limit');
  });
  it('stops capped spend when any attempted phase has unknown cost, without treating it as zero', () => {
    const input = completed();
    input.policy.maxCostUsd = 100;
    input.attempts[0].usage = { inputTokens: 100 };
    expect(planOrchestration(input)).toMatchObject({
      status: 'stop',
      reason: 'cost_unknown',
      usage: { total: { costUsd: null } },
    });
    delete input.policy.maxCostUsd;
    expect(planOrchestration(input)).toMatchObject({
      status: 'delegate',
      usage: { total: { costUsd: null } },
    });
  });
  it.each(['worker', 'escalator', 'critic', 'repair', 'synthesis', 'validation'] as const)(
    'includes the %s leg in spend stops',
    (phase) => {
      const input = completed();
      input.policy.maxCostUsd = 0.25;
      input.attempts.push(
        attempt({ id: 'attempt-2', phase, startedAtMs: NOW - 1_000, finishedAtMs: NOW })
      );
      expect(planOrchestration(input)).toMatchObject({
        status: 'stop',
        reason: 'cost_limit',
        usage: { total: { costUsd: 0.25 } },
      });
      delete input.attempts[1].usage!.costUsd;
      expect(planOrchestration(input)).toMatchObject({ status: 'stop', reason: 'cost_unknown' });
    }
  );
  it.each([NaN, Infinity, -1, null, '1'])(
    'rejects invalid optional spend limit %s',
    (maxCostUsd) => {
      const input = snapshot();
      Object.assign(input.policy, { maxCostUsd });
      expect(planOrchestration(input).status).toBe('invalid');
    }
  );
});

describe('fail-closed schema validation', () => {
  it.each([true, 1, 'enabled', [], { policy: [] }, { policy: { enabled: 'true' } }])(
    'rejects malformed opt-in: %j',
    (input) => {
      expect(planOrchestration(input)).toMatchObject({
        status: 'invalid',
        action: null,
        canClaimDone: false,
      });
    }
  );
  it.each(['maxAttempts', 'maxElapsedMs', 'maxEvidenceAgeMs'])(
    'rejects unbounded or invalid %s',
    (key) => {
      for (const value of [undefined, 0, -1, NaN, Infinity, 0.5, '3']) {
        const input = snapshot();
        Object.assign(input.policy, { [key]: value });
        expect(planOrchestration(input)).toMatchObject({ status: 'invalid', action: null });
      }
    }
  );
  it.each(['nowMs', 'startedAtMs'])('rejects invalid %s clocks', (key) => {
    for (const value of [undefined, -1, NaN, Infinity, 'now']) {
      expect(planOrchestration({ ...snapshot(), [key]: value }).status).toBe('invalid');
    }
  });
  it('rejects future run starts, duplicate models and oversized context', () => {
    expect(planOrchestration({ ...snapshot(), startedAtMs: NOW + 1 }).status).toBe('invalid');
    const input = snapshot();
    input.capabilities!.models.push(input.capabilities!.models[0]);
    expect(planOrchestration(input).status).toBe('invalid');
    const large = snapshot();
    large.context.spec = Array(9).fill('ref');
    expect(planOrchestration(large).status).toBe('invalid');
    large.context.spec = ['a'.repeat(513)];
    expect(planOrchestration(large).status).toBe('invalid');
  });
  it('rejects duplicate, out-of-order, incomplete and future attempts', () => {
    const input = completed();
    input.attempts.push(attempt());
    expect(planOrchestration(input).status).toBe('invalid');
    input.attempts[1].id = 'unique';
    expect(planOrchestration(input).status).toBe('invalid');
    input.attempts = [attempt({ finishedAtMs: NOW + 1 })];
    expect(planOrchestration(input).status).toBe('invalid');
    input.attempts = [attempt({ finishedAtMs: undefined })];
    expect(planOrchestration(input).status).toBe('invalid');
  });
});

describe('read-only CLI', () => {
  let directory: string;
  let fixture: string;
  beforeAll(() => {
    // Own a unique directory; never remove or replace another suite's artifacts.
    directory = mkdtempSync(path.join(ROOT, '.portable-orchestration-test-'));
    fixture = path.join(directory, 'input with spaces.json');
    writeFileSync(fixture, JSON.stringify(snapshot()));
  });
  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  function cli(args: string[]) {
    return spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      cwd: directory,
      shell: false,
    });
  }
  it('verifies --help, schema, trust boundary and no input reads', () => {
    const result = cli(['--help', '--input', 'missing.json']);
    expect(result.status).toBe(0);
    for (const text of [
      '--input',
      '--json',
      '--help',
      'policy:',
      'route:',
      'capabilities:',
      'context:',
      'attempts:',
      'cryptographic',
      'risk floors',
    ]) {
      expect(result.stdout).toContain(text);
    }
  });
  it('runs without configuration and leaves the legacy path intact', () => {
    expect(JSON.parse(cli(['--json']).stdout)).toEqual(planOrchestration());
  });
  it('reads an enabled snapshot without writing or altering its input', () => {
    const before = readFileSync(fixture, 'utf8');
    const files = readdirSync(directory);
    const result = cli(['--input', fixture, '--json']);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual(planOrchestration(snapshot()));
    expect(readFileSync(fixture, 'utf8')).toBe(before);
    expect(readdirSync(directory)).toEqual(files);
  });
  it('prints a concise human decision without claiming delivery', () => {
    expect(cli(['--input', fixture]).stdout).toContain('delivery remains unverified');
  });
  it.each(
    [
      ['--input'],
      ['--input', '--json'],
      ['--unknown'],
      ['--json', '--json'],
      ['--input', 'missing.json'],
      ['--input', CLI],
      ['--input', 'a', '--input', 'b'],
    ].map((args) => [args])
  )('rejects invalid CLI arguments/input: %j', (args) => {
    const result = cli([...args, ...(args.includes('--json') ? [] : ['--json'])]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'invalid',
      action: null,
      canClaimDone: false,
    });
  });
  it('handles disabled JSON, invalid schemas, malformed JSON and sensitive input safely', () => {
    const target = path.join(directory, 'invalid.json');
    for (const [input, status] of [
      ['{"policy":{"enabled":false}}', 0],
      ['{"policy":{"enabled":"true"}}', 1],
      ['{"credential":"do-not-echo-this",', 1],
    ] as const) {
      writeFileSync(target, input);
      const result = cli(['--input', target, '--json']);
      expect(result.status).toBe(status);
      expect(result.stdout + result.stderr).not.toContain('do-not-echo-this');
      expect(JSON.parse(result.stdout).action).toBeNull();
    }
  });
  it('contains no provider, process execution, credential access or file writes in production code', () => {
    const lib = readFileSync(
      path.join(ROOT, '.specify/scripts/node/lib/portable-orchestration.mjs'),
      'utf8'
    );
    const cliSource = readFileSync(CLI, 'utf8');
    expect(lib).not.toMatch(/\bimport\b|Date\.now|Math\.random|process\./);
    expect(cliSource).not.toMatch(
      /child_process|execSync|spawn|writeFile|mkdir|process\.env|fetch\(/
    );
    expect(execFileSync(process.execPath, ['--check', CLI], { encoding: 'utf8' })).toBe('');
  });
});
