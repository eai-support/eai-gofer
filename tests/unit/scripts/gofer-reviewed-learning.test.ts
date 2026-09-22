import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildEvaluationProjection,
  evaluateTrace,
  learningReport,
  listCandidates,
  normalizeJournal,
  normalizeTrace,
  recordMemoryOutcome,
  reviewCandidate,
  searchApprovedMemory,
} from '../../../.specify/scripts/node/gofer-reviewed-learning.mjs';

const roots: string[] = [];

async function fixture(enabled = false) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'gofer-learning-'));
  roots.push(workspace);
  await mkdir(path.join(workspace, '.specify', 'config'), { recursive: true });
  await writeFile(
    path.join(workspace, '.specify', 'config', 'typesafe-learning-review.json'),
    JSON.stringify({
      schemaVersion: 1,
      enabled,
      provider: 'typesafe',
      model: 'jev-latest',
      endpoint: 'https://api.typesafe.ai/v1/systemone',
      timeoutMs: 10000,
      maxEvents: 100,
      maxTextBytes: 2000,
      maxProjectionBytes: 262144,
      thresholds: {
        taskSuccess: 0.6,
        reusableLesson: 0.75,
        evidenceSupport: 0.85,
      },
    })
  );
  const events = [
    {
      schemaVersion: 1,
      revision: 'r1',
      time: '2026-09-22T00:00:00.000Z',
      event: 'started',
      authorization: 'Bearer secret-token-value',
    },
    {
      schemaVersion: 1,
      revision: 'r1',
      time: '2026-09-22T00:01:00.000Z',
      event: 'check',
      task: 'T001',
      passed: true,
      receipt: 'proof-1',
    },
    {
      schemaVersion: 1,
      revision: 'r1',
      time: '2026-09-22T00:02:00.000Z',
      event: 'verified',
      task: 'T001',
      receipt: 'commit-1',
    },
  ];
  const journal = path.join(workspace, 'verified-execution.jsonl');
  await writeFile(journal, events.map((event) => JSON.stringify(event)).join('\n') + '\n');
  const normalized = await normalizeJournal({
    workspace,
    input: journal,
    host: 'codex',
    objective: 'Repair the payment validation fault',
    sessionId: 'session-1',
  });
  return { workspace, journal, trace: normalized.trace, tracePath: normalized.tracePath };
}

function response(
  probabilities = { task_success: 0.9, reusable_lesson: 0.9, evidence_support: 0.95 }
) {
  return new Response(
    JSON.stringify({
      answers: Object.fromEntries(
        Object.entries(probabilities).map(([key, probability]) => [key, { probability }])
      ),
    }),
    { status: 200 }
  );
}

const proposal = {
  title: 'Validate before commit',
  lesson: 'Run the protected validation check immediately before the conditional commit.',
  kind: 'delivery-control',
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Gofer reviewed learning', () => {
  it('normalizes a verified journal with stable provenance and redaction', async () => {
    const { trace, tracePath } = await fixture();
    expect(trace.traceId).toMatch(/^trace_[a-f0-9]{32}$/);
    expect(trace.projectId).toMatch(/^project_[a-f0-9]{24}$/);
    expect(trace.events).toHaveLength(3);
    expect(trace.events[0].type).toBe('lifecycle');
    expect(trace.events[0].data.authorization).toBe('[REDACTED]');
    expect(JSON.parse(await readFile(tracePath, 'utf8')).traceHash).toBe(trace.traceHash);
  });

  it('produces the same trace for the same source', async () => {
    const { workspace, journal, trace } = await fixture();
    const second = await normalizeJournal({
      workspace,
      input: journal,
      host: 'codex',
      objective: 'Repair the payment validation fault',
      sessionId: 'session-1',
    });
    expect(second.trace).toEqual(trace);
  });

  it('requires a timestamp for every imported event', () => {
    expect(() =>
      normalizeTrace({
        workspace: '/tmp/example',
        host: 'codex',
        objective: 'Test',
        sourceContent: '{}',
        events: [{ event: 'started' }],
      })
    ).toThrow('LEARNING_EVENT_TIME_REQUIRED');
  });

  it('rejects more than 100 source events', () => {
    const events = Array.from({ length: 101 }, (_, index) => ({
      event: 'message',
      time: new Date(index * 1000).toISOString(),
    }));
    expect(() =>
      normalizeTrace({
        workspace: '/tmp/example',
        host: 'codex',
        objective: 'Test',
        sourceContent: 'events',
        events,
      })
    ).toThrow('LEARNING_NORMALIZE_INVALID');
  });

  it('builds a bounded, redacted evaluation projection', async () => {
    const { workspace, trace } = await fixture();
    const policy = JSON.parse(
      await readFile(
        path.join(workspace, '.specify', 'config', 'typesafe-learning-review.json'),
        'utf8'
      )
    );
    const result = buildEvaluationProjection(
      trace,
      { ...proposal, lesson: `${proposal.lesson} TYPESAFE_API_KEY=private-value` },
      policy
    );
    expect(JSON.stringify(result.projection)).not.toContain('private-value');
    expect(JSON.stringify(result.proposal)).not.toContain('private-value');
    expect(JSON.stringify(result.proposal)).toContain('[REDACTED]');
    expect(result.projectionHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('supports dry-run without credentials or a network call', async () => {
    const { workspace, trace } = await fixture();
    const fetchImpl = vi.fn();
    const result = await evaluateTrace({ workspace, trace, proposal, dryRun: true, fetchImpl });
    expect(result.status).toBe('dry_run');
    expect(result.networkCalled).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not call Jev while the policy is disabled', async () => {
    const { workspace, trace } = await fixture();
    const fetchImpl = vi.fn();
    const result = await evaluateTrace({ workspace, trace, proposal, fetchImpl });
    expect(result.status).toBe('disabled');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('creates a candidate only when every probability gate passes', async () => {
    const { workspace, trace } = await fixture(true);
    const fetchImpl = vi.fn(async () => response());
    const result = await evaluateTrace({
      workspace,
      trace,
      proposal,
      fetchImpl,
      env: { TYPESAFE_API_KEY: 'test-key' },
    });
    expect(result.status).toBe('candidate');
    expect(result.candidate.state).toBe('candidate');
    expect(result.evaluation.evaluator.credentialSource).toBe('environment');
    expect(await listCandidates({ workspace, state: 'candidate' })).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.typesafe.ai/v1/systemone',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('keeps evaluation identity stable and records the actual credential source', async () => {
    const { workspace, trace } = await fixture(true);
    const fetchImpl = vi.fn(async () => response());
    const first = await evaluateTrace({
      workspace,
      trace,
      proposal,
      fetchImpl,
      env: { TYPESAFE_API_KEY: 'test-key' },
    });
    const second = await evaluateTrace({
      workspace,
      trace,
      proposal,
      fetchImpl,
      env: { TYPESAFE_API_KEY: 'test-key' },
    });
    expect(second.evaluation.evaluationId).toBe(first.evaluation.evaluationId);
    expect(second.candidate.candidateId).toBe(first.candidate.candidateId);
    expect(await listCandidates({ workspace, state: 'candidate' })).toHaveLength(1);

    await mkdir(path.join(workspace, '.specify', 'secrets'), { recursive: true });
    await writeFile(
      path.join(workspace, '.specify', 'secrets', 'typesafe.env'),
      'TYPESAFE_API_KEY=project-key\n'
    );
    const projectSecret = await evaluateTrace({
      workspace,
      trace,
      proposal,
      fetchImpl,
      env: {},
    });
    expect(projectSecret.evaluation.evaluator.credentialSource).toBe('project_secret_file');
  });

  it('rejects candidate creation when evidence support misses its gate', async () => {
    const { workspace, trace } = await fixture(true);
    const result = await evaluateTrace({
      workspace,
      trace,
      proposal,
      fetchImpl: vi.fn(async () =>
        response({ task_success: 0.99, reusable_lesson: 0.99, evidence_support: 0.84 })
      ),
      env: { TYPESAFE_API_KEY: 'test-key' },
    });
    expect(result.status).toBe('not_candidate');
    expect(result.evaluation.probabilities.evidenceSupport).toBe(0.84);
    expect(await listCandidates({ workspace })).toHaveLength(0);
  });

  it('fails closed on malformed evaluator output', async () => {
    const { workspace, trace } = await fixture(true);
    const result = await evaluateTrace({
      workspace,
      trace,
      proposal,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ answers: {} }), { status: 200 })),
      env: { TYPESAFE_API_KEY: 'test-key' },
    });
    expect(result.status).toBe('not_candidate');
    expect(result.evaluation.probabilities).toEqual({
      taskSuccess: 0,
      reusableLesson: 0,
      evidenceSupport: 0,
    });
  });

  it('requires explicit approval before memory becomes searchable', async () => {
    const { workspace, trace } = await fixture(true);
    const evaluation = await evaluateTrace({
      workspace,
      trace,
      proposal,
      fetchImpl: vi.fn(async () => response()),
      env: { TYPESAFE_API_KEY: 'test-key' },
    });
    expect(await searchApprovedMemory({ workspace, query: 'protected validation' })).toEqual([]);
    const reviewed = await reviewCandidate({
      workspace,
      candidateId: evaluation.candidate.candidateId,
      decision: 'approve',
      actor: 'delivery-owner',
      reason: 'The trace contains the validation and commit receipts.',
    });
    const results = await searchApprovedMemory({ workspace, query: 'protected validation' });
    expect(results).toHaveLength(1);
    expect(results[0].memoryId).toBe(reviewed.memory.memoryId);
    expect(results[0].traceHash).toBe(trace.traceHash);
    expect(results[0].approvedBy).toBe('delivery-owner');
  });

  it('never persists proposal secrets in candidates or approved memory', async () => {
    const { workspace, trace } = await fixture(true);
    const secretProposal = {
      ...proposal,
      lesson: `${proposal.lesson} TYPESAFE_API_KEY=private-value`,
    };
    const evaluation = await evaluateTrace({
      workspace,
      trace,
      proposal: secretProposal,
      fetchImpl: vi.fn(async () => response()),
      env: { TYPESAFE_API_KEY: 'test-key' },
    });
    const reviewed = await reviewCandidate({
      workspace,
      candidateId: evaluation.candidate.candidateId,
      decision: 'approve',
      actor: 'delivery-owner',
      reason: 'Evidence is complete.',
    });
    const store = path.join(workspace, '.specify', 'memory', 'reviewed-learning');
    const persisted = [
      await readFile(path.join(store, 'candidates.jsonl'), 'utf8'),
      await readFile(path.join(store, 'review-transactions.jsonl'), 'utf8'),
    ].join('\n');
    expect(persisted).not.toContain('private-value');
    expect(persisted).toContain('[REDACTED]');
    expect(JSON.stringify(reviewed.memory)).not.toContain('private-value');
    expect(await searchApprovedMemory({ workspace, query: 'protected validation' })).toHaveLength(
      1
    );
  });

  it('allows only one concurrent review decision', async () => {
    const { workspace, trace } = await fixture(true);
    const evaluation = await evaluateTrace({
      workspace,
      trace,
      proposal,
      fetchImpl: vi.fn(async () => response()),
      env: { TYPESAFE_API_KEY: 'test-key' },
    });
    const decisions = await Promise.allSettled([
      reviewCandidate({
        workspace,
        candidateId: evaluation.candidate.candidateId,
        decision: 'approve',
        actor: 'reviewer-one',
        reason: 'Approved.',
      }),
      reviewCandidate({
        workspace,
        candidateId: evaluation.candidate.candidateId,
        decision: 'approve',
        actor: 'reviewer-two',
        reason: 'Approved.',
      }),
    ]);
    expect(decisions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await listCandidates({ workspace, state: 'approved' })).toHaveLength(1);
    expect(await searchApprovedMemory({ workspace, query: 'protected validation' })).toHaveLength(
      1
    );
  });

  it('keeps rejected candidates out of memory', async () => {
    const { workspace, trace } = await fixture(true);
    const evaluation = await evaluateTrace({
      workspace,
      trace,
      proposal,
      fetchImpl: vi.fn(async () => response()),
      env: { TYPESAFE_API_KEY: 'test-key' },
    });
    await reviewCandidate({
      workspace,
      candidateId: evaluation.candidate.candidateId,
      decision: 'reject',
      actor: 'reviewer',
      reason: 'The lesson is too specific.',
    });
    expect(await searchApprovedMemory({ workspace, query: 'validation' })).toEqual([]);
    expect((await listCandidates({ workspace }))[0].state).toBe('rejected');
  });

  it('prevents a second decision on an approved candidate', async () => {
    const { workspace, trace } = await fixture(true);
    const evaluation = await evaluateTrace({
      workspace,
      trace,
      proposal,
      fetchImpl: vi.fn(async () => response()),
      env: { TYPESAFE_API_KEY: 'test-key' },
    });
    const input = {
      workspace,
      candidateId: evaluation.candidate.candidateId,
      actor: 'reviewer',
      reason: 'Reviewed',
    };
    await reviewCandidate({ ...input, decision: 'approve' });
    await expect(reviewCandidate({ ...input, decision: 'reject' })).rejects.toThrow(
      'LEARNING_CANDIDATE_ALREADY_REVIEWED'
    );
  });

  it('records outcomes only for approved memory', async () => {
    const { workspace, trace } = await fixture(true);
    const evaluation = await evaluateTrace({
      workspace,
      trace,
      proposal,
      fetchImpl: vi.fn(async () => response()),
      env: { TYPESAFE_API_KEY: 'test-key' },
    });
    const reviewed = await reviewCandidate({
      workspace,
      candidateId: evaluation.candidate.candidateId,
      decision: 'approve',
      actor: 'reviewer',
      reason: 'Reusable',
    });
    await recordMemoryOutcome({
      workspace,
      memoryId: reviewed.memory.memoryId,
      runId: 'run-2',
      outcome: 'helped',
      note: 'Prevented a stale commit.',
    });
    expect((await learningReport({ workspace })).feedback).toEqual({
      total: 1,
      helped: 1,
      neutral: 0,
      harmed: 0,
    });
  });

  it('rejects journal paths outside the workspace', async () => {
    const { workspace } = await fixture();
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-learning-outside-'));
    roots.push(outside);
    const input = path.join(outside, 'trace.jsonl');
    await writeFile(input, '{}\n');
    await expect(
      normalizeJournal({ workspace, input, host: 'codex', objective: 'Test' })
    ).rejects.toThrow('LEARNING_PATH_OUTSIDE_WORKSPACE');
  });

  it('rejects a learning store routed through a symlink', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'gofer-learning-'));
    roots.push(workspace);
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-learning-store-'));
    roots.push(outside);
    await mkdir(path.join(workspace, '.specify'), { recursive: true });
    await symlink(
      outside,
      path.join(workspace, '.specify', 'memory'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    await expect(learningReport({ workspace })).rejects.toThrow('LEARNING_PATH_SYMLINK');
  });

  it('rejects a trace directory routed through a symlink', async () => {
    const { workspace, journal } = await fixture();
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-learning-traces-'));
    roots.push(outside);
    const traceDirectory = path.join(
      workspace,
      '.specify',
      'memory',
      'reviewed-learning',
      'traces'
    );
    await rm(traceDirectory, { recursive: true });
    await symlink(outside, traceDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(
      normalizeJournal({ workspace, input: journal, host: 'codex', objective: 'Test' })
    ).rejects.toThrow(/LEARNING_STORE_PATH_INVALID|LEARNING_PATH_SYMLINK/);
  });
});
