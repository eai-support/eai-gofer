import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-expect-error Shared portable runtime ships as native ESM.
import { executeStage } from '../../../.specify/scripts/node/lib/stage-execution.mjs';

type ModelCall = { modelId: string; prompt: string; readOnly: boolean; signal: AbortSignal };
type ModelResult = {
  text: string;
  selectedModelId: string;
  reportedModelId?: string | null;
  usage?: Record<string, number>;
};
type Catalogue = {
  host: string;
  surface: string;
  verified: boolean;
  observedAtMs: number;
  readOnlyIsolation: boolean;
  models: Array<{ id: string; family: string; available: boolean; nativeCompound: boolean }>;
};
type CheckInput = {
  expected: Record<string, string>;
  attempt: {
    id: string;
    revision: string;
    criterion: string;
    phase: string;
    usage: Record<string, number>;
  };
  output: { attemptId: string; text: string };
};
type ResultIdentity = { reportedModelId: string | null; identityEvidence: string };

let root: string;
let request: {
  host: string;
  surface: string;
  stage: string;
  workType: string;
  trigger: string;
  task: string;
  context: Record<string, string[]>;
  policy: {
    enabled: boolean;
    approved: boolean;
    route: { pattern: string; worker: string; critic?: string; escalator?: string };
    maxAttempts: number;
    maxElapsedMs: number;
    maxEvidenceAgeMs: number;
    maxCostUsd?: number;
  };
};
let adapter: {
  host: string;
  surface: string;
  discover: Mock<() => Promise<Catalogue>>;
  execute: Mock<(input: ModelCall) => Promise<ModelResult>>;
};
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'gofer-stage-test-'));
  await mkdir(path.join(root, '.specify/commands'), { recursive: true });
  await writeFile(path.join(root, '.specify/commands/1_gofer_research.md'), '# Research');
  await writeFile(
    path.join(root, 'context.md'),
    'Goal: verify a proposal. Acceptance: check facts. Non-app confirmed. No edits. Use simple English.'
  );
  request = {
    host: 'test',
    surface: 'cli',
    stage: '1_gofer_research',
    workType: 'non-app',
    trigger: 'delegate',
    task: 'Propose a research outline.',
    context: Object.fromEntries(
      ['spec', 'acceptance', 'platform', 'language', 'permissions'].map((key) => [
        key,
        ['context.md'],
      ])
    ),
    policy: {
      enabled: true,
      approved: true,
      route: { pattern: 'peer-review', worker: 'native-small', critic: 'native-large' },
      maxAttempts: 3,
      maxElapsedMs: 5000,
      maxEvidenceAgeMs: 5000,
    },
  };
  adapter = {
    host: 'test',
    surface: 'cli',
    discover: vi.fn(async () => ({
      host: 'test',
      surface: 'cli',
      verified: true,
      observedAtMs: Date.now(),
      readOnlyIsolation: true,
      models: ['native-small', 'native-large'].map((id) => ({
        id,
        family: 'same-family',
        available: true,
        nativeCompound: false,
      })),
    })),
    execute: vi.fn(async ({ modelId }: ModelCall) => ({
      text: modelId === 'native-small' ? 'Worker proposal.\n' : 'Review: verify the source.',
      selectedModelId: modelId,
      reportedModelId: modelId,
      usage: {},
    })),
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function failureEvidence(
  expected: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
) {
  return {
    ...expected,
    ref: 'test-result',
    kind: 'test',
    status: 'fail',
    deterministic: true,
    observedAtMs: Date.now(),
    summary: 'Acceptance failed: expected a nonempty result.',
    ...overrides,
  };
}

function differentFamilyModels() {
  request.policy.route.pattern = 'critique';
  adapter.discover.mockImplementation(async () => ({
    host: 'test',
    surface: 'cli',
    verified: true,
    observedAtMs: Date.now(),
    readOnlyIsolation: true,
    models: [
      { id: 'native-small', family: 'family-a', available: true, nativeCompound: false },
      { id: 'native-large', family: 'family-b', available: true, nativeCompound: false },
    ],
  }));
}

describe('production stage execution bridge', () => {
  test.each(['critique', 'peer-review'])(
    'blocks required %s for a compound worker before execution',
    async (pattern) => {
      if (pattern === 'critique') differentFamilyModels();
      const catalog = await adapter.discover();
      catalog.models[0].nativeCompound = true;
      adapter.discover.mockResolvedValue(catalog);
      const result = await executeStage(request, { root, adapter });
      expect(result).toMatchObject({
        status: 'stop',
        reason: 'native_compound_review_unavailable',
        canClaimDone: false,
        attempts: [],
        outputs: [],
      });
      expect(adapter.execute).not.toHaveBeenCalled();
      expect(request.policy.route.pattern).toBe(pattern);
    }
  );
  test.each(['single', 'cascade'])(
    'preserves compound %s worker-only behavior',
    async (pattern) => {
      request.policy.route = { pattern, worker: 'native-small', escalator: 'native-large' };
      const catalog = await adapter.discover();
      catalog.models[0].nativeCompound = true;
      adapter.discover.mockResolvedValue(catalog);
      const result = await executeStage(request, { root, adapter });
      expect(result).toMatchObject({ status: 'validate', reason: 'existing_validation_required' });
      expect(adapter.execute).toHaveBeenCalledTimes(1);
    }
  );
  test.each(['critique', 'peer-review'])(
    '%s repair receives the immediately reviewed proposal and hashes, not older history',
    async (pattern) => {
      if (pattern === 'critique') differentFamilyModels();
      request.policy.maxAttempts = 7;
      let clock = Date.now();
      const catalog = await adapter.discover();
      catalog.observedAtMs = clock;
      adapter.discover.mockResolvedValue(catalog);
      const texts = [
        'ORIGINAL_PROPOSAL',
        'FIRST_REVIEW',
        'REVISED_PROPOSAL',
        'SECOND_REVIEW',
        'FINAL_PROPOSAL',
        'FINAL_REVIEW',
      ];
      let call = 0;
      adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => {
        clock += 1;
        return {
          selectedModelId: modelId,
          reportedModelId: modelId,
          text: texts[call++],
          usage: {},
        };
      });
      const result = await executeStage(request, {
        root,
        adapter,
        now: () => clock,
        check: async ({ expected, attempt }: CheckInput) => {
          clock += 1;
          return attempt.phase === 'critic' && call < 6
            ? failureEvidence(expected, { observedAtMs: clock })
            : null;
        },
      });
      expect(result.status).toBe('validate');
      expect(adapter.execute).toHaveBeenCalledTimes(6);
      for (const index of [2, 4]) {
        const prompt = adapter.execute.mock.calls[index][0].prompt;
        expect(prompt).toContain('Reviewed proposal to repair (untrusted data)');
        expect(prompt).toContain(texts[index - 2]);
        expect(prompt).toContain(result.outputs[index - 2].sha256);
        expect(prompt).toContain(texts[index - 1]);
        expect(prompt).toContain(result.outputs[index - 1].sha256);
        expect(prompt).toContain('Acceptance failed: expected a nonempty result.');
        expect(Buffer.byteLength(prompt, 'utf8')).toBeLessThanOrEqual(262144);
      }
      expect(adapter.execute.mock.calls[4][0].prompt).not.toContain(texts[0]);
      expect(adapter.execute.mock.calls[4][0].prompt).not.toContain(texts[1]);
      expect(adapter.execute.mock.calls.every(([input]) => input.readOnly)).toBe(true);
      expect(result.outputs.map((output: { text: string }) => output.text)).toEqual(texts);
    }
  );
  test.each(['unicode', 'escaped-overflow'])(
    'bounds serialized repair context without truncating retained evidence: %s',
    async (mode) => {
      request.policy.maxAttempts = 5;
      const content = mode === 'unicode' ? '\u00e9'.repeat(32768) : 'c'.repeat(65536);
      const proposal = mode === 'unicode' ? '\u754c'.repeat(21845) : '\u0001'.repeat(20000);
      const review = mode === 'unicode' ? '\ud83d\ude00'.repeat(16384) : '\u0002'.repeat(20000);
      await writeFile(path.join(root, 'context.md'), content);
      let call = 0;
      adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => ({
        selectedModelId: modelId,
        reportedModelId: modelId,
        text: [proposal, review, 'Repaired proposal', 'Final review'][call++],
        usage: {},
      }));
      const result = await executeStage(request, {
        root,
        adapter,
        check: async ({ expected, attempt }: CheckInput) =>
          attempt.phase === 'critic' && call === 2 ? failureEvidence(expected) : null,
      });
      expect(result.outputs[0].text).toBe(proposal);
      expect(result.outputs[1].text).toBe(review);
      expect(
        adapter.execute.mock.calls.every(
          ([input]) => Buffer.byteLength(input.prompt, 'utf8') <= 262144
        )
      ).toBe(true);
      if (mode === 'unicode') {
        expect(result.status).toBe('validate');
        expect(adapter.execute).toHaveBeenCalledTimes(4);
        const prompt = adapter.execute.mock.calls[2][0].prompt;
        expect(prompt).toContain(proposal);
        expect(prompt).toContain(review);
      } else {
        expect(result).toMatchObject({ status: 'stop', reason: 'input_limit' });
        expect(adapter.execute).toHaveBeenCalledTimes(2);
        expect(result.attempts).toHaveLength(2);
        expect(result.evidence).toHaveLength(1);
      }
    }
  );
  test('rejects unsupported identity-qualified review before paid calls without downgrading it', async () => {
    differentFamilyModels();
    const catalog = await adapter.discover();
    adapter.discover.mockResolvedValue({ ...catalog, reportedModelIdentity: false } as Catalogue);
    const result = await executeStage(request, { root, adapter });
    expect(result).toMatchObject({
      status: 'stop',
      reason: 'model_identity_unavailable',
      canClaimDone: false,
      attempts: [],
    });
    expect(adapter.execute).not.toHaveBeenCalled();
    expect(request.policy.route.pattern).toBe('critique');
  });
  test('executes two real adapter calls and hands the actual output to a separate reviewer', async () => {
    const result = await executeStage(request, { root, adapter });
    expect(result.status).toBe('validate');
    expect(result.canClaimDone).toBe(false);
    expect(adapter.execute).toHaveBeenCalledTimes(2);
    const second = adapter.execute.mock.calls[1][0];
    expect(second.prompt).toContain('Worker proposal.\\n');
    expect(second.prompt).toContain(result.outputs[0].sha256);
    expect(second.prompt).toContain('No EAI tenant/app setup applies');
    expect(second.readOnly).toBe(true);
    expect(result.usage.total.costUsd).toBeNull();
  });
  test('existing critique cannot use same-family review', async () => {
    request.policy.route.pattern = 'critique';
    const result = await executeStage(request, { root, adapter });
    expect(result.reason).toBe('independent_family_unavailable');
    expect(adapter.execute).not.toHaveBeenCalled();
  });
  test.each(['ordinary', 'disabled', 'unapproved', 'nested'])(
    'keeps %s in the existing path without discovery',
    async (mode) => {
      if (mode === 'ordinary') request.trigger = 'ordinary';
      if (mode === 'disabled') request.policy.enabled = false;
      if (mode === 'unapproved') request.policy.approved = false;
      const result = await executeStage(request, { root, adapter, nested: mode === 'nested' });
      expect(result.status).toBe('legacy');
      expect(adapter.discover).not.toHaveBeenCalled();
    }
  );
  test('refuses a different client even for the same vendor', async () => {
    request.surface = 'vscode-extension';
    const result = await executeStage(request, { root, adapter });
    expect(result.reason).toBe('surface_adapter_unavailable');
    expect(adapter.execute).not.toHaveBeenCalled();
  });
  test('requires native hard isolation even for a worker proposal', async () => {
    const capabilities = await adapter.discover();
    capabilities.readOnlyIsolation = false;
    adapter.discover.mockResolvedValue(capabilities);
    expect((await executeStage(request, { root, adapter })).reason).toBe('read_only_unavailable');
    expect(adapter.execute).not.toHaveBeenCalled();
  });
  test('rejects unavailable and stale catalogues before inference', async () => {
    const capabilities = await adapter.discover();
    capabilities.observedAtMs = 0;
    adapter.discover.mockResolvedValue(capabilities);
    expect((await executeStage(request, { root, adapter })).status).toBe('legacy');
    expect(adapter.execute).not.toHaveBeenCalled();
  });
  test('a claimed budget cannot create an unenforced cost ceiling', async () => {
    request.policy.maxCostUsd = 1;
    expect((await executeStage(request, { root, adapter })).reason).toBe(
      'hard_cost_limit_unavailable'
    );
    expect(adapter.execute).not.toHaveBeenCalled();
  });
  test('cancellation aborts the actual pending adapter call', async () => {
    const controller = new AbortController();
    let aborted = false;
    adapter.execute.mockImplementation(
      ({ signal }: ModelCall) =>
        new Promise<ModelResult>(() => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
          controller.abort();
        })
    );
    const result = await executeStage(request, { root, adapter, signal: controller.signal });
    expect(result.reason).toBe('cancelled');
    expect(aborted).toBe(true);
    expect(result.attempts[0].status).toBe('cancelled');
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });
  test('deadline aborts a hanging adapter', async () => {
    request.policy.maxElapsedMs = 100;
    adapter.execute.mockImplementation(() => new Promise<ModelResult>(() => {}));
    expect((await executeStage(request, { root, adapter })).reason).toBe('time_limit');
  });
  test('changed context stops before a reviewer can use stale work', async () => {
    adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => {
      await writeFile(path.join(root, 'context.md'), 'A different approved goal');
      return { text: 'Old proposal', selectedModelId: modelId };
    });
    const result = await executeStage(request, { root, adapter });
    expect(result.reason).toBe('active_work_changed');
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });
  test('a changed canonical stage invalidates its proposal', async () => {
    adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => {
      await writeFile(path.join(root, '.specify/commands/1_gofer_research.md'), '# Changed stage');
      return { text: 'Stale proposal', selectedModelId: modelId };
    });
    expect((await executeStage(request, { root, adapter })).reason).toBe('active_work_changed');
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });
  test('a same-model peer review is not a separate-model review', async () => {
    request.policy.route.critic = request.policy.route.worker;
    expect((await executeStage(request, { root, adapter })).reason).toBe(
      'distinct_model_unavailable'
    );
    expect(adapter.execute).not.toHaveBeenCalled();
  });
  test('oversized Unicode output is bounded by bytes, not characters', async () => {
    adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => ({
      text: '\u00e9'.repeat(40000),
      selectedModelId: modelId,
    }));
    expect((await executeStage(request, { root, adapter })).reason).toBe('invalid_model_response');
  });
  test('malformed usage is retained as a failed attempt, not reported as free', async () => {
    adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => ({
      text: 'Proposal',
      selectedModelId: modelId,
      usage: { costUsd: -1 },
    }));
    const result = await executeStage(request, { root, adapter });
    expect(result.status).toBe('stop');
    expect(result.usage.total.costUsd).toBeNull();
  });
  test.each(['../outside', '/etc/passwd', '.env', 'missing.md'])(
    'refuses unsafe/missing context %s',
    async (ref) => {
      request.context.spec = [ref];
      expect((await executeStage(request, { root, adapter })).status).toBe('stop');
      expect(adapter.discover).not.toHaveBeenCalled();
    }
  );
  test('rejects symlink context and oversized/secret text before inference', async () => {
    await symlink(path.join(root, 'context.md'), path.join(root, 'link.md'));
    request.context.spec = ['link.md'];
    expect((await executeStage(request, { root, adapter })).reason).toBe('unsafe_context_path');
    request.context.spec = ['context.md'];
    await writeFile(path.join(root, 'context.md'), 'x'.repeat(65537));
    expect((await executeStage(request, { root, adapter })).reason).toBe('context_limit');
    await writeFile(path.join(root, 'context.md'), '-----BEGIN PRIVATE KEY-----');
    expect((await executeStage(request, { root, adapter })).reason).toBe(
      'sensitive_or_binary_context'
    );
    expect(adapter.execute).not.toHaveBeenCalled();
  });
  test('identity mismatch and oversized output cannot become a successful proposal', async () => {
    adapter.execute.mockResolvedValue({ text: 'Wrong model', selectedModelId: 'guessed-model' });
    expect((await executeStage(request, { root, adapter })).reason).toBe('invalid_model_response');
    adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => ({
      text: 'x'.repeat(65537),
      selectedModelId: modelId,
    }));
    expect((await executeStage(request, { root, adapter })).reason).toBe('invalid_model_response');
  });
  test('cascade needs current deterministic validation, not a model opinion', async () => {
    request.policy.route = {
      pattern: 'cascade',
      worker: 'native-small',
      escalator: 'native-large',
    };
    let result = await executeStage(request, { root, adapter });
    expect(result.status).toBe('validate');
    expect(adapter.execute).toHaveBeenCalledTimes(1);
    adapter.execute.mockClear();
    result = await executeStage(request, {
      root,
      adapter,
      check: async ({ expected }: CheckInput) => failureEvidence(expected),
    });
    expect(adapter.execute).toHaveBeenCalledTimes(2);
    expect(result.reason).toBe('escalation_exhausted');
  });
  test.each([
    ['wrong attempt', { attemptId: 'another-attempt' }, 'check_evidence_mismatch'],
    ['wrong revision', { revision: 'another-revision' }, 'check_evidence_mismatch'],
    ['wrong criterion', { criterion: 'another-criterion' }, 'check_evidence_mismatch'],
    ['missing identity', { attemptId: undefined }, 'invalid_check_evidence'],
    ['missing observation', { observedAtMs: undefined }, 'invalid_check_evidence'],
    ['stale observation', { observedAtMs: 0 }, 'stale_check_evidence'],
    ['future observation', { observedAtMs: Number.MAX_SAFE_INTEGER }, 'stale_check_evidence'],
    [
      'unbounded extra object',
      { details: { arbitrary: 'must not be copied' } },
      'invalid_check_evidence',
    ],
    ['oversized summary', { summary: 'x'.repeat(4097) }, 'invalid_check_evidence'],
    ['oversized UTF-8 summary', { summary: '\u00e9'.repeat(2049) }, 'invalid_check_evidence'],
    ['secret summary', { summary: '-----BEGIN PRIVATE KEY-----' }, 'unsafe_check_evidence'],
  ])('rejects %s without relabelling evidence or escalating', async (_label, overrides, reason) => {
    request.policy.route = {
      pattern: 'cascade',
      worker: 'native-small',
      escalator: 'native-large',
    };
    const result = await executeStage(request, {
      root,
      adapter,
      check: async ({ expected }: CheckInput) =>
        failureEvidence(expected, overrides as Record<string, unknown>),
    });
    expect(result.status).toBe('stop');
    expect(result.reason).toBe(reason);
    expect(adapter.execute).toHaveBeenCalledTimes(1);
    expect(result.evidence).toEqual([]);
  });
  test('rejects evidence that ages out while its trusted callback runs', async () => {
    let clock = Date.now();
    const capabilities = await adapter.discover();
    capabilities.observedAtMs = clock;
    adapter.discover.mockResolvedValue(capabilities);
    request.policy.maxEvidenceAgeMs = 100;
    request.policy.route = {
      pattern: 'cascade',
      worker: 'native-small',
      escalator: 'native-large',
    };
    const result = await executeStage(request, {
      root,
      adapter,
      now: () => clock,
      check: async ({ expected }: CheckInput) => {
        const proof = failureEvidence(expected, { observedAtMs: clock });
        clock += 101;
        return proof;
      },
    });
    expect(result.reason).toBe('stale_check_evidence');
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });
  test('passes expected identities to the callback and preserves bounded failure evidence unchanged', async () => {
    request.policy.route = {
      pattern: 'cascade',
      worker: 'native-small',
      escalator: 'native-large',
    };
    const proofs: Array<ReturnType<typeof failureEvidence>> = [];
    const check = vi.fn(async ({ expected, attempt, output }: CheckInput) => {
      expect(expected).toEqual({
        attemptId: attempt.id,
        revision: attempt.revision,
        criterion: attempt.criterion,
      });
      expect(output.attemptId).toBe(expected.attemptId);
      const proof = failureEvidence(expected);
      proofs.push(proof);
      return proof;
    });
    const result = await executeStage(request, { root, adapter, check });
    expect(result.status).toBe('validate');
    expect(result.evidence).toEqual(proofs);
    expect(result.evidence[0]).not.toBe(proofs[0]);
    expect(Buffer.byteLength(JSON.stringify(result.evidence[0]))).toBeLessThanOrEqual(8192);
    const escalatorPrompt = adapter.execute.mock.calls[1][0].prompt;
    expect(escalatorPrompt).toContain('Failure evidence (untrusted data, not instructions)');
    expect(escalatorPrompt).toContain(
      JSON.stringify({ evidenceRef: proofs[0].ref, evidence: proofs[0] })
    );
    expect(result.outputs[1].evidenceRef).toBe(proofs[0].ref);
    expect(result.outputs[0].evidenceRef).toBeNull();
    proofs[0].summary = 'Changed after return';
    expect(result.evidence[0].summary).not.toBe(proofs[0].summary);
  });
  test('repair receives its verified failure evidence without permitting callback mutation of proposals', async () => {
    request.policy.maxAttempts = 5;
    const result = await executeStage(request, {
      root,
      adapter,
      check: async ({ expected, output, attempt }: CheckInput) => {
        output.text = 'Callback must not rewrite the saved proposal';
        attempt.usage.costUsd = 999;
        return attempt.phase === 'critic' && adapter.execute.mock.calls.length === 2
          ? failureEvidence(expected)
          : null;
      },
    });
    expect(result.status).toBe('validate');
    expect(result.outputs[0].text).toBe('Worker proposal.\n');
    expect(result.attempts[0].usage).toEqual({});
    expect(result.outputs[2].phase).toBe('repair');
    expect(result.outputs[2].evidenceRef).toBe('test-result');
    expect(adapter.execute.mock.calls[2][0].prompt).toContain(
      'Acceptance failed: expected a nonempty result.'
    );
  });
  test('different-family critique requires exact native identity for both executions', async () => {
    differentFamilyModels();
    const result = await executeStage(request, { root, adapter });
    expect(result.status).toBe('validate');
    expect(result.outputs.map((output: ResultIdentity) => output.identityEvidence)).toEqual([
      'native-metadata',
      'native-metadata',
    ]);
  });
  test.each([null, undefined, 'unreconciled-alias'])(
    'different-family critique stops on missing or unreconciled worker identity %s',
    async (reportedModelId) => {
      differentFamilyModels();
      adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => ({
        selectedModelId: modelId,
        reportedModelId,
        text: 'Proposal',
      }));
      const result = await executeStage(request, { root, adapter });
      expect(result.reason).toBe(
        reportedModelId == null ? 'model_identity_unavailable' : 'model_identity_unreconciled'
      );
      expect(adapter.execute).toHaveBeenCalledTimes(1);
      expect(result.outputs).toEqual([]);
    }
  );
  test.each([null, 'unreconciled-critic-alias'])(
    'different-family critique stops on missing or unreconciled critic identity %s',
    async (reportedModelId) => {
      differentFamilyModels();
      adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => ({
        selectedModelId: modelId,
        reportedModelId: modelId === 'native-small' ? modelId : reportedModelId,
        text: 'Proposal or review',
      }));
      const result = await executeStage(request, { root, adapter });
      expect(result.reason).toBe(
        reportedModelId == null ? 'model_identity_unavailable' : 'model_identity_unreconciled'
      );
      expect(adapter.execute).toHaveBeenCalledTimes(2);
      expect(result.outputs).toHaveLength(1);
    }
  );
  test.each(['peer-review', 'critique'])(
    'rejects the same actual model for worker and critic in %s',
    async (pattern) => {
      if (pattern === 'critique') differentFamilyModels();
      adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => ({
        selectedModelId: modelId,
        reportedModelId: 'native-small',
        text: 'Proposal or review',
      }));
      const result = await executeStage(request, { root, adapter });
      expect(result.reason).toBe('distinct_reported_model_required');
      expect(result.attempts[1].status).toBe('failed');
      expect(result.outputs).toHaveLength(1);
    }
  );
  test('preserves distinct Claude sonnet/opus native metadata for peer review without guessing aliases', async () => {
    request.host = adapter.host = 'claude';
    request.policy.route = { pattern: 'peer-review', worker: 'sonnet', critic: 'opus' };
    adapter.discover.mockImplementation(async () => ({
      host: 'claude',
      surface: 'cli',
      verified: true,
      observedAtMs: Date.now(),
      readOnlyIsolation: true,
      models: ['sonnet', 'opus'].map((id) => ({
        id,
        family: 'anthropic-unverified-family',
        available: true,
        nativeCompound: false,
      })),
    }));
    adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => ({
      selectedModelId: modelId,
      reportedModelId: modelId === 'sonnet' ? 'claude-sonnet-native' : 'claude-opus-native',
      text: 'Proposal or review',
    }));
    const result = await executeStage(request, { root, adapter });
    expect(result.status).toBe('validate');
    expect(result.outputs.map((output: ResultIdentity) => output.reportedModelId)).toEqual([
      'claude-sonnet-native',
      'claude-opus-native',
    ]);
  });
  test.each([null, undefined])(
    'keeps Codex peer-review selection-only when backend identity is unknown: %s',
    async (reportedModelId) => {
      request.host = adapter.host = 'codex';
      const capabilities = await adapter.discover();
      capabilities.host = 'codex';
      adapter.discover.mockResolvedValue(capabilities);
      adapter.execute.mockImplementation(async ({ modelId }: ModelCall) => ({
        selectedModelId: modelId,
        reportedModelId,
        text: 'Proposal or review',
      }));
      const result = await executeStage(request, { root, adapter });
      expect(result.status).toBe('validate');
      expect(result.outputs.map((output: ResultIdentity) => output.identityEvidence)).toEqual([
        'native-selection-only',
        'native-selection-only',
      ]);
      expect(
        result.outputs.every((output: ResultIdentity) => output.reportedModelId === null)
      ).toBe(true);
    }
  );
  test('app scope keeps capability gates with the controller', async () => {
    request.workType = 'app';
    const result = await executeStage(request, { root, adapter });
    expect(result.status).toBe('validate');
    expect(adapter.execute.mock.calls[0][0].prompt).toContain('capability-scoped MVP');
    expect(await readFile(path.join(root, 'context.md'), 'utf8')).toContain('Goal:');
  });
  test.each(['app', 'non-app'])(
    'all canonical stages preserve their contracts for %s work',
    async (workType) => {
      request.workType = workType;
      const stages = (await readdir('.specify/commands')).filter((name) => name.endsWith('.md'));
      expect(stages.length).toBe(26);
      for (const stage of stages) {
        await writeFile(path.join(root, '.specify/commands', stage), '# Original stage');
        request.stage = stage.slice(0, -3);
        const result = await executeStage(request, { root, adapter });
        expect(result.status, stage).toBe('validate');
        expect(result.canClaimDone, stage).toBe(false);
      }
    }
  );
});

describe('stage CLI evidence boundary', () => {
  const script = path.resolve('.specify/scripts/node/gofer-stage-execute.mjs');
  test('help and non-execution do not start models or write evidence', async () => {
    const result = spawnSync(process.execPath, [script, '--help'], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No publish');
    const plan = spawnSync(process.execPath, [script, '--input', 'missing.json'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(JSON.parse(plan.stdout).reason).toBe('execution_not_requested');
  });
  test('ordinary requests persist evidence once without any model execution', async () => {
    request.host = 'codex';
    request.trigger = 'ordinary';
    await writeFile(path.join(root, 'request.json'), JSON.stringify(request));
    const args = [
      script,
      '--input',
      'request.json',
      '--execute',
      '--output',
      '.specify/specs/test/result.json',
    ];
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const output = await readFile(path.join(root, '.specify/specs/test/result.json'), 'utf8');
    expect(JSON.parse(output).reason).toBe('ordinary_request');
    expect(JSON.parse(output).attempts).toEqual([]);
    expect(spawnSync(process.execPath, args, { cwd: root }).status).toBe(1);
    expect(await readFile(path.join(root, '.specify/specs/test/result.json'), 'utf8')).toBe(output);
  });
  test('output cannot escape the private feature tree', async () => {
    const result = spawnSync(
      process.execPath,
      [script, '--input', 'missing', '--execute', '--output', '../bad.json'],
      { cwd: root, encoding: 'utf8' }
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).canClaimDone).toBe(false);
  });
});
