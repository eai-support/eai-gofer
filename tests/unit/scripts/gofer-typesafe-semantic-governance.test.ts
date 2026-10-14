import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const credentialsUrl = new URL(
  '../../../.specify/scripts/node/gofer-typesafe-credentials.mjs',
  import.meta.url
);
const semanticUrl = new URL(
  '../../../.specify/scripts/node/gofer-semantic-drift.mjs',
  import.meta.url
);
const directories: string[] = [];
let previousSharedCredentialSetting: string | undefined;

beforeEach(() => {
  previousSharedCredentialSetting = process.env.GOFER_DISABLE_SHARED_CREDENTIALS;
  process.env.GOFER_DISABLE_SHARED_CREDENTIALS = '1';
});

async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'gofer-typesafe-'));
  directories.push(workspace);
  const featureDir = path.join(workspace, '.specify', 'specs', '002-typesafe');
  await mkdir(path.join(workspace, '.specify', 'config'), { recursive: true });
  await mkdir(featureDir, { recursive: true });
  await writeFile(
    path.join(workspace, '.specify', 'config', 'typesafe-semantic-review.json'),
    JSON.stringify({
      schemaVersion: 1,
      enabled: false,
      provider: 'typesafe',
      events: ['before_validation', 'chat_readiness'],
      minimumConfidence: 0.85,
      uncertainAction: 'reconcile',
      conflictAction: 'block_affected_task',
    })
  );
  await writeFile(
    path.join(workspace, '.specify', 'config', 'typesafe-learning-review.json'),
    JSON.stringify({ schemaVersion: 1, enabled: false, provider: 'typesafe' })
  );
  await writeFile(path.join(featureDir, 'goal-ledger.json'), '{"goal":"deliver"}');
  await writeFile(path.join(featureDir, 'spec.md'), '# Spec');
  await writeFile(path.join(featureDir, 'plan.md'), '# Plan');
  await writeFile(path.join(featureDir, 'tasks.md'), '# Tasks');
  await writeFile(path.join(featureDir, 'decisions.md'), '# Decisions');
  await writeFile(path.join(featureDir, 'traceability.md'), '# Traceability');
  await writeFile(path.join(featureDir, 'test-spec.md'), '# Test specification');
  await writeFile(path.join(featureDir, 'change-manifest.json'), '{"files":["src/change.ts"]}');
  await writeFile(path.join(featureDir, 'blast-radius-report.md'), '# Blast radius\n\nCONTAINED');
  return { workspace, featureDir };
}

function alignedAnswers(confidence = 0.95) {
  const alignmentProbabilities = { aligned: confidence, partial: 1 - confidence, conflict: 0 };
  const actionProbabilities = { continue: confidence, reconcile: 1 - confidence, ask_user: 0 };
  return {
    goal_alignment: {
      type: 'choice',
      choice: 'aligned',
      confidence,
      probabilities: alignmentProbabilities,
    },
    specification_currency: {
      type: 'choice',
      choice: 'aligned',
      confidence,
      probabilities: alignmentProbabilities,
    },
    test_coverage: {
      type: 'choice',
      choice: 'aligned',
      confidence,
      probabilities: alignmentProbabilities,
    },
    blast_radius: {
      type: 'choice',
      choice: 'aligned',
      confidence,
      probabilities: alignmentProbabilities,
    },
    required_action: {
      type: 'choice',
      choice: 'continue',
      confidence,
      probabilities: actionProbabilities,
    },
  };
}

function validResponsePayload(answers: Record<string, unknown>) {
  return {
    model: 'jev-1.13.0',
    answers,
    usage: { input_tokens: 100, output_tokens: 12 },
  };
}

function alignedResponse(confidence = 0.95) {
  return new Response(JSON.stringify(validResponsePayload(alignedAnswers(confidence))), {
    status: 200,
  });
}

afterEach(async () => {
  if (previousSharedCredentialSetting === undefined)
    delete process.env.GOFER_DISABLE_SHARED_CREDENTIALS;
  else process.env.GOFER_DISABLE_SHARED_CREDENTIALS = previousSharedCredentialSetting;
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('TypeSafe semantic governance', () => {
  it('stops reading provider output at the response byte limit', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const result = await credentials.requestTypeSafeEvaluation({
      workspace,
      env: { TYPESAFE_API_KEY: 'test-key' },
      policy: {
        endpoint: 'https://api.typesafe.ai/v1/systemone',
        model: 'jev-latest',
        timeoutMs: 1000,
      },
      projection: {},
      rubric: {},
      fetchImpl: vi.fn(async () => new Response(body, { status: 200 })),
    });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_response' });
    expect(cancelled).toBe(true);
  });

  it('writes only an ignored project secret file and enables review', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    expect(
      await readFile(path.join(workspace, '.specify', 'secrets', 'typesafe.env'), 'utf8')
    ).toBe('TYPESAFE_API_KEY=secret-value\n');
    expect(
      JSON.parse(
        await readFile(
          path.join(workspace, '.specify', 'config', 'typesafe-semantic-review.json'),
          'utf8'
        )
      ).enabled
    ).toBe(true);
    expect(
      JSON.parse(
        await readFile(
          path.join(workspace, '.specify', 'config', 'typesafe-learning-review.json'),
          'utf8'
        )
      ).enabled
    ).toBe(true);
    const result = await credentials.disconnect({ workspace });
    expect(result.removedProjectSecret).toBe(true);
    expect(
      JSON.parse(
        await readFile(
          path.join(workspace, '.specify', 'config', 'typesafe-semantic-review.json'),
          'utf8'
        )
      ).enabled
    ).toBe(false);
    expect(
      JSON.parse(
        await readFile(
          path.join(workspace, '.specify', 'config', 'typesafe-learning-review.json'),
          'utf8'
        )
      ).enabled
    ).toBe(false);
  });

  it('connects once through a shared keychain and resolves it from another workspace', async () => {
    const first = await fixture();
    const second = await fixture();
    const credentials = await import(credentialsUrl.href);
    let stored = '';
    const keychain = {
      read: vi.fn(async () => stored),
      write: vi.fn(async (key: string) => {
        stored = key;
      }),
      remove: vi.fn(async () => {
        const existed = Boolean(stored);
        stored = '';
        return existed;
      }),
    };

    const connected = await credentials.connectShared({
      workspace: first.workspace,
      key: 'shared-secret-value',
      keychain,
    });
    expect(connected).toMatchObject({
      configured: true,
      source: 'macos_keychain',
      sharedAcrossLocalWorkspaces: true,
    });
    expect(
      await credentials.resolveApiKey({
        workspace: second.workspace,
        env: {},
        keychain,
      })
    ).toEqual({ apiKey: 'shared-secret-value', source: 'macos_keychain' });

    const disconnected = await credentials.disconnectShared({
      workspace: first.workspace,
      keychain,
    });
    expect(disconnected.removedSharedCredential).toBe(true);
    expect(
      await credentials.resolveApiKey({
        workspace: second.workspace,
        env: {},
        keychain,
      })
    ).toEqual({ apiKey: '', source: 'none' });
  });

  it('rejects scoped status because status reports effective precedence', async () => {
    const credentials = await import(credentialsUrl.href);
    expect(credentials.parseArgs(['--status'])).toMatchObject({ action: 'status' });
    expect(() => credentials.parseArgs(['--status', '--scope', 'project'])).toThrow(
      '--status reports the effective credential and does not accept --scope.'
    );
  });

  it('keeps Jev optional but activates a disabled workspace when a shared key exists', async () => {
    const { workspace, featureDir } = await fixture();
    const semantic = await import(semanticUrl.href);
    const keychain = { read: vi.fn(async () => 'shared-secret-value') };
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(validResponsePayload(alignedAnswers(0.96))), { status: 200 })
    );

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
      env: {},
      keychain,
    });
    expect(result).toMatchObject({ status: 'aligned', confidence: 0.96 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer shared-secret-value');
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(Object.keys(request.questions)).toEqual(
      expect.arrayContaining([
        'goal_alignment',
        'specification_currency',
        'test_coverage',
        'blast_radius',
        'required_action',
      ])
    );
    const state = request.state;
    expect(state).toHaveProperty('test-spec.md');
    expect(state).toHaveProperty('change-manifest.json');
    expect(state).toHaveProperty('blast-radius-report.md');
  });

  it('forces reconciliation when Jev reports stale specifications, tests, or blast radius', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    for (const field of ['specification_currency', 'test_coverage', 'blast_radius']) {
      const answers = alignedAnswers(0.99);
      answers[field as keyof typeof answers] = {
        type: 'choice',
        choice: 'partial',
        confidence: 0.99,
        probabilities: { aligned: 0.005, partial: 0.99, conflict: 0.005 },
      };
      const result = await semantic.runSemanticReview({
        workspace,
        featureDir,
        event: 'before_validation',
        fetchImpl: vi.fn(
          async () => new Response(JSON.stringify(validResponsePayload(answers)), { status: 200 })
        ),
      });
      expect(result.status).toBe('reconcile');
    }
  });

  it('uses environment then project then shared keychain credential precedence', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const keychain = { read: vi.fn(async () => 'shared-value') };
    expect(await credentials.resolveApiKey({ workspace, env: {}, keychain })).toEqual({
      apiKey: 'shared-value',
      source: 'macos_keychain',
    });
    await credentials.connect({ workspace, key: 'project-value' });
    expect(await credentials.resolveApiKey({ workspace, env: {}, keychain })).toEqual({
      apiKey: 'project-value',
      source: 'project_secret_file',
    });
    expect(
      await credentials.resolveApiKey({
        workspace,
        env: { TYPESAFE_API_KEY: 'environment-value' },
        keychain,
      })
    ).toEqual({ apiKey: 'environment-value', source: 'environment' });
  });

  it('does not call the provider when review is disabled or no credential exists', async () => {
    const { workspace, featureDir } = await fixture();
    const semantic = await import(semanticUrl.href);
    const fetchImpl = vi.fn();
    expect(
      await semantic.runSemanticReview({
        workspace,
        featureDir,
        event: 'before_validation',
        fetchImpl,
      })
    ).toMatchObject({ status: 'disabled' });
    expect(fetchImpl).not.toHaveBeenCalled();
    const policyPath = path.join(workspace, '.specify', 'config', 'typesafe-semantic-review.json');
    const policy = JSON.parse(await readFile(policyPath, 'utf8'));
    policy.enabled = true;
    await writeFile(policyPath, JSON.stringify(policy));
    expect(
      await semantic.runSemanticReview({
        workspace,
        featureDir,
        event: 'before_validation',
        fetchImpl,
      })
    ).toMatchObject({ status: 'not_configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('runs an explicit chat-readiness check with bounded redacted context when policy is otherwise disabled', async () => {
    const { workspace, featureDir } = await fixture();
    const semantic = await import(semanticUrl.href);
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            validResponsePayload({
              ...alignedAnswers(0.97),
              chat_readiness: {
                type: 'choice',
                choice: 'ready',
                confidence: 0.96,
                probabilities: { ready: 0.96, reconcile: 0.04, ask_user: 0 },
              },
            })
          ),
          { status: 200 }
        )
    );
    const chatContext =
      'Request: check this chat. TYPESAFE_API_KEY=chat-secret Bearer abcdefghi ' + 'x'.repeat(6000);

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'chat_readiness',
      chatContext,
      onDemand: true,
      env: { TYPESAFE_API_KEY: 'provider-secret' },
      fetchImpl,
    });

    expect(result).toMatchObject({ status: 'aligned', confidence: 0.96 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(request.questions.chat_readiness).toMatchObject({ type: 'choice' });
    expect(request.questions.chat_readiness.instructions).toContain(
      'current goal, specification, plan, tasks, decisions, and approved edit scope'
    );
    const state = request.state;
    expect(state.chat_context.content).toContain('[REDACTED]');
    expect(state.chat_context.content).not.toContain('chat-secret');
    expect(state.chat_context.content).not.toContain('abcdefghi');
    expect(Buffer.byteLength(state.chat_context.content, 'utf8')).toBeGreaterThan(4096);
    expect(state.chat_context.content).toContain('x'.repeat(6000));
    expect(state.chat_context.summaryOnly).toBe(true);
    expect(request).not.toHaveProperty('user');
    expect(result).toHaveProperty('chatContextSha256');

    const receipt = JSON.parse(
      await readFile(
        path.join(featureDir, 'evidence', 'semantic-review', 'chat_readiness.json'),
        'utf8'
      )
    );
    expect(receipt.chatContextSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(receipt)).not.toContain('Request: check this chat');
    expect(JSON.stringify(receipt)).not.toContain('provider-secret');
  });

  it('blocks chat readiness when Jev requests reconciliation or has low confidence', async () => {
    const { workspace, featureDir } = await fixture();
    const semantic = await import(semanticUrl.href);
    const reconcile = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'chat_readiness',
      chatContext: 'The current request and feature goal.',
      onDemand: true,
      env: { TYPESAFE_API_KEY: 'test-key' },
      fetchImpl: vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              validResponsePayload({
                ...alignedAnswers(0.99),
                chat_readiness: {
                  type: 'choice',
                  choice: 'reconcile',
                  confidence: 0.99,
                  probabilities: { ready: 0.005, reconcile: 0.99, ask_user: 0.005 },
                },
              })
            ),
            { status: 200 }
          )
      ),
    });
    expect(reconcile.status).toBe('reconcile');

    const uncertain = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'chat_readiness',
      chatContext: 'The current request and feature goal.',
      onDemand: true,
      env: { TYPESAFE_API_KEY: 'test-key' },
      fetchImpl: vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              validResponsePayload({
                ...alignedAnswers(0.99),
                chat_readiness: {
                  type: 'choice',
                  choice: 'ready',
                  confidence: 0.44,
                  probabilities: { ready: 0.44, reconcile: 0.43, ask_user: 0.13 },
                },
              })
            ),
            { status: 200 }
          )
      ),
    });
    expect(uncertain.status).toBe('reconcile');
  });

  it('does not call Jev for chat readiness without a context summary', async () => {
    const { workspace, featureDir } = await fixture();
    const semantic = await import(semanticUrl.href);
    const fetchImpl = vi.fn();

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'chat_readiness',
      onDemand: true,
      env: { TYPESAFE_API_KEY: 'test-key' },
      fetchImpl,
    });

    expect(result).toMatchObject({ status: 'unavailable', reason: 'chat_context_missing' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('writes a hash-bound receipt and blocks a provider conflict', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            validResponsePayload({
              ...alignedAnswers(0.99),
              goal_alignment: {
                type: 'choice',
                choice: 'conflict',
                confidence: 0.99,
                probabilities: { aligned: 0.005, partial: 0.005, conflict: 0.99 },
              },
              required_action: {
                type: 'choice',
                choice: 'ask_user',
                confidence: 0.99,
                probabilities: { continue: 0.005, reconcile: 0.005, ask_user: 0.99 },
              },
            })
          ),
          { status: 200 }
        )
    );
    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });
    expect(result).toMatchObject({ status: 'conflict', confidence: 0.99 });
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer secret-value');
    const receipt = JSON.parse(
      await readFile(
        path.join(featureDir, 'evidence', 'semantic-review', 'before_validation.json'),
        'utf8'
      )
    );
    expect(receipt.artifacts['spec.md']).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(receipt)).not.toContain('secret-value');
  });

  it('preserves an existing version-2 receipt before writing the version-4 receipt', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const receiptDir = path.join(featureDir, 'evidence', 'semantic-review');
    await mkdir(receiptDir, { recursive: true });
    const previous =
      JSON.stringify({
        schemaVersion: 2,
        provider: 'typesafe',
        event: 'before_validation',
        status: 'reconcile',
        confidence: 0.72,
      }) + '\n';
    await writeFile(path.join(receiptDir, 'before_validation.json'), previous);

    await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify(validResponsePayload(alignedAnswers())), { status: 200 })
      ),
    });

    expect(await readFile(path.join(receiptDir, 'before_validation.v2.json'), 'utf8')).toBe(
      previous
    );
    expect(
      JSON.parse(await readFile(path.join(receiptDir, 'before_validation.json'), 'utf8'))
        .schemaVersion
    ).toBe(4);

    const previousV3 =
      JSON.stringify({ schemaVersion: 3, status: 'reconcile', confidence: 0.72 }) + '\n';
    await writeFile(path.join(receiptDir, 'before_validation.json'), previousV3);
    await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl: vi.fn(async () => alignedResponse()),
    });
    expect(await readFile(path.join(receiptDir, 'before_validation.v3.json'), 'utf8')).toBe(
      previousV3
    );
  });

  it('reports unavailable, not an uncaught exception, on a network failure or timeout', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const networkFailure = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(
      semantic.runSemanticReview({
        workspace,
        featureDir,
        event: 'before_validation',
        fetchImpl: networkFailure,
      })
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'network_error' });
    const timeout = vi.fn(async () => {
      const error = new Error('The operation was aborted');
      error.name = 'TimeoutError';
      throw error;
    });
    await expect(
      semantic.runSemanticReview({
        workspace,
        featureDir,
        event: 'before_validation',
        fetchImpl: timeout,
      })
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'timeout' });
  });

  it('fails closed on an unrecognized provider answer', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            validResponsePayload({
              ...alignedAnswers(0.99),
              goal_alignment: {
                type: 'choice',
                choice: 'unclear',
                confidence: 0.99,
                probabilities: { aligned: 0.99, partial: 0.01, conflict: 0 },
              },
            })
          ),
          { status: 200 }
        )
    );
    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_response_schema' });
  });

  it('reports unavailable on a response body that is not valid JSON', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 200 }));
    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_response_body' });
  });

  it('reports aligned when confidence is high and both answers are recognized', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(validResponsePayload(alignedAnswers())), { status: 200 })
    );
    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });
    expect(result.status).toBe('aligned');
  });

  it('rejects incomplete TypeSafe response fields instead of treating them as an aligned review', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    type MutablePayload = {
      model?: string;
      answers: Record<string, Record<string, unknown>>;
      usage?: Record<string, number>;
    };
    const invalidCases: Array<{ issue: string; mutate: (payload: MutablePayload) => void }> = [
      {
        issue: 'model_missing_or_invalid',
        mutate: (payload) => {
          delete payload.model;
        },
      },
      {
        issue: 'usage_missing_or_invalid',
        mutate: (payload) => {
          delete payload.usage;
        },
      },
      {
        issue: 'answer_goal_alignment_type_invalid',
        mutate: (payload) => {
          delete payload.answers.goal_alignment.type;
        },
      },
      {
        issue: 'answer_goal_alignment_probabilities_invalid',
        mutate: (payload) => {
          payload.answers.goal_alignment.probabilities = { aligned: 0.99, partial: 0.01 };
        },
      },
    ];

    for (const invalidCase of invalidCases) {
      const payload = structuredClone(validResponsePayload(alignedAnswers())) as MutablePayload;
      invalidCase.mutate(payload);
      const result = await semantic.runSemanticReview({
        workspace,
        featureDir,
        event: 'before_validation',
        fetchImpl: vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
      });
      expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_response_schema' });
      expect(result.responseValidation).toContain(invalidCase.issue);
    }
  });

  it('rejects a feature directory that escapes the workspace', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-typesafe-outside-'));
    directories.push(outside);
    await writeFile(path.join(outside, 'secret.txt'), 'do not read this');
    const fetchImpl = vi.fn();
    await expect(
      semantic.runSemanticReview({
        workspace,
        featureDir: outside,
        event: 'before_validation',
        fetchImpl,
      })
    ).rejects.toThrow('must remain inside the workspace');
    await expect(
      semantic.runSemanticReview({
        workspace,
        featureDir: path.join(workspace, '..', 'escape'),
        event: 'before_validation',
        fetchImpl,
      })
    ).rejects.toThrow('must remain inside the workspace');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reviews every exact UTF-8 source range when complete state exceeds one request', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    await writeFile(path.join(featureDir, 'goal-ledger.json'), '\uFEFF{"goal":"deliver"}');
    const requirementText = '- **FR-001**: The operation must preserve all approved evidence.\n';
    const oversized = `\uFEFF\n${requirementText}## Supporting evidence\n${'spec heading\nlinked evidence\n'.repeat(2_000)}${'漢🙂é'.repeat(8_000)}TAIL_DRIFT_MARKER`;
    await writeFile(path.join(featureDir, 'spec.md'), oversized);
    await writeFile(
      path.join(featureDir, 'tasks.md'),
      '# Tasks\n\nImplementation checks FR-001.\n'
    );
    const fetchImpl = vi.fn(async () => alignedResponse());
    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });
    expect(result.artifacts['spec.md']).toBe(createHash('sha256').update(oversized).digest('hex'));
    expect(result).toMatchObject({
      status: 'aligned',
      reviewMode: 'bounded_multi_pass',
      requestSent: true,
    });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    const packetStates = fetchImpl.mock.calls.map(
      ([, request]) => JSON.parse(request.body as string).state
    );
    expect(
      packetStates.every(
        (packetState: { approved_goal_context: Array<{ goal: string }> }) =>
          packetState.approved_goal_context[0].goal === 'deliver'
      )
    ).toBe(true);
    expect(
      packetStates.some(
        (packetState: { requirement_context: Array<{ id: string; content: string }> }) =>
          packetState.requirement_context.some(
            (requirement) => requirement.id === 'FR-001' && requirement.content === requirementText
          )
      )
    ).toBe(true);
    const sentSegments = fetchImpl.mock.calls
      .flatMap(([, request]) => {
        const body = JSON.parse(request.body as string);
        expect(body.state.review.mode).toBe('bounded_multi_pass');
        expect(body.state.review.packetCount).toBe(fetchImpl.mock.calls.length);
        return body.state.segments.filter(
          (segment: { artifact: string }) => segment.artifact === 'spec.md'
        );
      })
      .sort(
        (left: { startByte: number }, right: { startByte: number }) =>
          left.startByte - right.startByte
      );
    expect(sentSegments[0].startByte).toBe(0);
    expect(sentSegments.at(-1).endByte).toBe(Buffer.byteLength(oversized));
    for (let index = 0; index < sentSegments.length; index += 1) {
      expect(sentSegments[index].endByte - sentSegments[index].startByte).toBe(
        Buffer.byteLength(sentSegments[index].content)
      );
      if (index > 0) expect(sentSegments[index].startByte).toBe(sentSegments[index - 1].endByte);
    }
    expect(
      Buffer.concat(
        sentSegments.map((segment: { content: string }) => Buffer.from(segment.content))
      ).toString('utf8')
    ).toBe(oversized);
    expect(result.multiPass).toMatchObject({
      complete: true,
      packetCount: fetchImpl.mock.calls.length,
      completedPacketCount: fetchImpl.mock.calls.length,
    });
    expect(result.artifactCoverage['spec.md']).toMatchObject({
      sourceBytes: Buffer.byteLength(oversized),
      sentBytes: Buffer.byteLength(oversized),
      complete: true,
      reviewed: true,
    });
    const receipt = JSON.parse(
      await readFile(
        path.join(featureDir, 'evidence', 'semantic-review', 'before_validation.json'),
        'utf8'
      )
    );
    expect(receipt.schemaVersion).toBe(4);
    expect(receipt.inputBudget.withinLimits).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain(oversized);
  });

  it('keeps complete context for supported requirement formats and nested continuation bullets', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const continuation = (id: string, count = 3) =>
      `Description for ${id}.\n- acceptance detail for ${id}\n  - nested acceptance detail for ${id}\n${Array.from({ length: count }, (_, index) => `    - continuation ${index} for ${id}`).join('\n')}\n`;
    const requirements = [
      { id: 'FR-001', content: `### FR-001: Basic Operation\n${continuation('FR-001', 350)}` },
      {
        id: 'FR-002',
        content: `**FR-002 (P1)**: Prioritized operation\n${continuation('FR-002')}`,
      },
      {
        id: 'FR-003',
        content: `FR-003 — Plain operation\n${continuation('FR-003')}#### Acceptance subsection\n- nested heading criterion for FR-003\n`,
      },
      { id: 'FR-004', content: `- **FR-004**: Listed operation\n${continuation('FR-004')}` },
    ];
    const spec = `${requirements.map(({ content }) => content).join('')}## Supporting evidence\n${'supporting evidence after the requirement\n'.repeat(1_500)}`;
    await writeFile(path.join(featureDir, 'spec.md'), spec);
    const fetchImpl = vi.fn(async () => alignedResponse());

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(result.status).toBe('aligned');
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    const requestStates = fetchImpl.mock.calls.map(
      ([, request]) => JSON.parse(request.body as string).state
    );
    let requirementStartByte = 0;
    for (const requirement of requirements) {
      const requirementEndByte = requirementStartByte + Buffer.byteLength(requirement.content);
      const relevantPackets = requestStates.filter(
        (state: { segments: Array<{ artifact: string; startByte: number; endByte: number }> }) =>
          state.segments.some(
            (segment) =>
              segment.artifact === 'spec.md' &&
              segment.startByte < requirementEndByte &&
              requirementStartByte < segment.endByte
          )
      );
      expect(relevantPackets.length).toBeGreaterThan(requirement.id === 'FR-001' ? 1 : 0);
      const contextFragments = requestStates
        .flatMap(
          (state: { requirement_context: Array<Record<string, unknown>> }) =>
            state.requirement_context
        )
        .filter(
          (entry: { id: string }) =>
            entry.id === requirement.id && typeof entry.content === 'string'
        )
        .sort(
          (
            left: { sourceRange: { startByte: number } },
            right: { sourceRange: { startByte: number } }
          ) => left.sourceRange.startByte - right.sourceRange.startByte
        );
      expect(contextFragments.length).toBeGreaterThan(0);
      expect(contextFragments.map((entry: { content: string }) => entry.content).join('')).toBe(
        requirement.content
      );
      for (const state of relevantPackets) {
        expect(
          state.requirement_context.some((entry: { id: string }) => entry.id === requirement.id)
        ).toBe(true);
      }
      requirementStartByte = requirementEndByte;
    }
  });

  it('splits oversized requirement context into exact linked ranges within packet budgets', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const requirement = `### FR-001: Large requirement\n${'Exact acceptance detail remains available to Jev.\n'.repeat(900)}`;
    await writeFile(
      path.join(featureDir, 'spec.md'),
      `${requirement}## Supporting evidence\n${'supporting evidence\n'.repeat(1_000)}`
    );
    const fetchImpl = vi.fn(async () => alignedResponse());

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(result.status).toBe('aligned');
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    const states = fetchImpl.mock.calls.map(([, request]) => {
      const body = JSON.parse(request.body as string);
      expect(semantic.measureTypeSafeInputBudget(body.state, body.questions).withinLimits).toBe(
        true
      );
      expect(body.state.review.requirementContextComplete).toBe(true);
      return body.state;
    });
    const fragments = states
      .flatMap(
        (state: { requirement_context: Array<Record<string, unknown>> }) =>
          state.requirement_context
      )
      .filter((entry: { id: string }) => entry.id === 'FR-001')
      .sort(
        (
          left: { sourceRange: { startByte: number } },
          right: { sourceRange: { startByte: number } }
        ) => left.sourceRange.startByte - right.sourceRange.startByte
      );
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.map((entry: { content: string }) => entry.content).join('')).toBe(requirement);
    let expectedStartByte = Buffer.byteLength('');
    for (const fragment of fragments) {
      expect(fragment.contextMode).toBe('exact_source_range');
      expect(fragment.definitionRange).toEqual({
        artifact: 'spec.md',
        startByte: Buffer.byteLength(''),
        endByte: Buffer.byteLength(requirement),
      });
      expect(fragment.sourceRange.startByte).toBe(expectedStartByte);
      expect(fragment.sourceRange.endByte - fragment.sourceRange.startByte).toBe(
        Buffer.byteLength(fragment.content)
      );
      expect(Buffer.byteLength(fragment.content)).toBeLessThanOrEqual(4 * 1024);
      expectedStartByte = fragment.sourceRange.endByte;
    }
    expect(expectedStartByte).toBe(Buffer.byteLength(requirement));
  });

  it('rejects duplicate requirement IDs before sending packets', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const spec = `## Requirements\n**FR-001**: First definition\n${'supporting detail\n'.repeat(2_500)}**FR-001**: Duplicate definition\n`;
    await writeFile(path.join(featureDir, 'spec.md'), spec);
    const fetchImpl = vi.fn();

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'duplicate_requirement_id',
      requestAttempted: false,
      requestSent: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.multiPass.packets).toEqual([]);
  });

  it('indexes and links short numeric requirement, task, and story IDs', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    await writeFile(
      path.join(featureDir, 'goal-ledger.json'),
      '{"goals":[{"id":"US1","goal":"deliver"}]}'
    );
    const requirement = '### FR-1: Compact requirement\nThe first requirement.\n';
    await writeFile(
      path.join(featureDir, 'spec.md'),
      `${requirement}## Supporting evidence\n${'supporting evidence\n'.repeat(1_500)}`
    );
    await writeFile(path.join(featureDir, 'tasks.md'), '# Tasks\nT1 implements FR-1 for US1.\n');
    const fetchImpl = vi.fn(async () => alignedResponse());

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(result.status).toBe('aligned');
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    for (const [, request] of fetchImpl.mock.calls) {
      const state = JSON.parse(request.body as string).state;
      expect(state.reference_index).toEqual(
        expect.arrayContaining([
          { id: 'FR-1', artifacts: expect.arrayContaining(['spec.md', 'tasks.md']) },
          { id: 'T1', artifacts: ['tasks.md'] },
          { id: 'US1', artifacts: expect.arrayContaining(['goal-ledger.json', 'tasks.md']) },
        ])
      );
      expect(state.approved_goal_context).toContainEqual({ id: 'US1', goal: 'deliver' });
    }
    const taskState = fetchImpl.mock.calls
      .map(([, request]) => JSON.parse(request.body as string).state)
      .find((state: { segments: Array<{ artifact: string }> }) =>
        state.segments.some((segment) => segment.artifact === 'tasks.md')
      );
    expect(taskState.requirement_context).toContainEqual(
      expect.objectContaining({
        id: 'FR-1',
        content: requirement,
        definitionComplete: true,
      })
    );
  });

  it('does not align a cross-artifact reference when a large requirement cannot fit in one packet', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const requirement = `### FR-001: Large requirement\n${'Exact acceptance detail remains available to Jev.\n'.repeat(900)}`;
    await writeFile(
      path.join(featureDir, 'spec.md'),
      `${requirement}## Supporting evidence\n${'supporting evidence\n'.repeat(1_000)}`
    );
    await writeFile(path.join(featureDir, 'tasks.md'), '# Tasks\nImplement FR-001.\n');
    const fetchImpl = vi.fn(async () => alignedResponse());

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(result).toMatchObject({ status: 'reconcile', reason: 'requirement_context_incomplete' });
    expect(result.multiPass).toMatchObject({ complete: false, requirementContextComplete: false });
    const taskRequest = fetchImpl.mock.calls
      .map(([, request]) => JSON.parse(request.body as string).state)
      .find((state: { segments: Array<{ artifact: string }> }) =>
        state.segments.some((segment) => segment.artifact === 'tasks.md')
      );
    expect(taskRequest.review.requirementContextComplete).toBe(false);
    expect(taskRequest.review.requirementContextIssues).toContain(
      'requirement_context_exceeds_packet_budget:FR-001'
    );
    expect(taskRequest.requirement_context).toContainEqual(
      expect.objectContaining({
        id: 'FR-001',
        contextMode: 'linked_definition_range',
        content: null,
        definitionRange: expect.objectContaining({ artifact: 'spec.md' }),
      })
    );
  });

  it('preserves a Jev conflict when cross-artifact requirement context is incomplete', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const requirement = `### FR-001: Large requirement\n${'Exact acceptance detail remains available to Jev.\n'.repeat(900)}`;
    await writeFile(
      path.join(featureDir, 'spec.md'),
      `${requirement}## Supporting evidence\n${'supporting evidence\n'.repeat(1_000)}`
    );
    await writeFile(path.join(featureDir, 'tasks.md'), '# Tasks\nImplement FR-001.\n');
    const conflictAnswers = alignedAnswers(0.99);
    conflictAnswers.goal_alignment = {
      type: 'choice',
      choice: 'conflict',
      confidence: 0.99,
      probabilities: { aligned: 0.005, partial: 0.005, conflict: 0.99 },
    };
    conflictAnswers.required_action = {
      type: 'choice',
      choice: 'ask_user',
      confidence: 0.99,
      probabilities: { continue: 0.005, reconcile: 0.005, ask_user: 0.99 },
    };
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, request: RequestInit = {}) => {
      const body = JSON.parse(request.body as string);
      const answers = body.state.review.requirementContextComplete
        ? alignedAnswers(0.99)
        : conflictAnswers;
      return new Response(JSON.stringify(validResponsePayload(answers)), { status: 200 });
    });

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(result.status).toBe('conflict');
    expect(result.multiPass).toMatchObject({ complete: false, requirementContextComplete: false });
    expect(result.multiPass.requirementContextIssues).toContain(
      'requirement_context_exceeds_packet_budget:FR-001'
    );
    expect(
      result.multiPass.packets.some((packet: { status: string }) => packet.status === 'conflict')
    ).toBe(true);
  });

  it('links requirement IDs that cross a source segment boundary in a task artifact', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const requirement = '### FR-001: Small requirement\nThe complete requirement definition.\n';
    await writeFile(
      path.join(featureDir, 'spec.md'),
      `## Requirements\n${requirement}## Supporting evidence\n${'supporting evidence\n'.repeat(2_500)}`
    );
    await writeFile(path.join(featureDir, 'tasks.md'), `# Tasks\n${'x'.repeat(4_092)} FR-001\n`);
    const fetchImpl = vi.fn(async () => alignedResponse());

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(result.status).toBe('aligned');
    const taskStates = fetchImpl.mock.calls
      .map(([, request]) => JSON.parse(request.body as string).state)
      .filter((state: { segments: Array<{ artifact: string }> }) =>
        state.segments.some((segment) => segment.artifact === 'tasks.md')
      );
    expect(taskStates.length).toBeGreaterThan(0);
    expect(
      taskStates.every(
        (state: {
          review: { requirementContextComplete: boolean };
          requirement_context: Array<{ id: string; content: string; definitionComplete: boolean }>;
        }) =>
          state.review.requirementContextComplete &&
          state.requirement_context.some(
            (entry) =>
              entry.id === 'FR-001' && entry.content === requirement && entry.definitionComplete
          )
      )
    ).toBe(true);
    const taskSegments = taskStates
      .flatMap(
        (state: { segments: Array<{ artifact: string; startByte: number; content: string }> }) =>
          state.segments.filter((segment) => segment.artifact === 'tasks.md')
      )
      .sort((left, right) => left.startByte - right.startByte);
    expect(
      taskSegments.some(
        (segment, index) =>
          segment.content.endsWith(' FR-') && taskSegments[index + 1]?.content.startsWith('001\n')
      )
    ).toBe(true);
    const taskContent = taskSegments.map((segment) => segment.content).join('');
    expect(taskContent).toContain(' FR-001\n');
  });

  it('does not report aligned when any packet is below the confidence threshold', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    await writeFile(path.join(featureDir, 'spec.md'), 'x'.repeat(40 * 1024));
    let callCount = 0;
    const fetchImpl = vi.fn(async () => alignedResponse(++callCount === 2 ? 0.72 : 0.96));

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(callCount).toBeGreaterThan(1);
    expect(result.status).toBe('reconcile');
    expect(result.confidence).toBe(0.72);
    expect(result.confidenceGate.belowMinimum).toBe(true);
    expect(result.multiPass.complete).toBe(true);
    expect(result.usageComplete).toBe(true);
  });

  it('fails closed when a source artifact changes during a multi-pass review', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    await writeFile(path.join(featureDir, 'spec.md'), 'x'.repeat(40 * 1024));
    let changed = false;
    const fetchImpl = vi.fn(async () => {
      if (!changed) {
        changed = true;
        await writeFile(path.join(featureDir, 'spec.md'), 'changed after snapshot');
      }
      return alignedResponse();
    });

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(result).toMatchObject({ status: 'unavailable', reason: 'source_changed_during_review' });
    expect(result.multiPass.complete).toBe(false);
  });

  it('fails before provider calls when the bounded multi-pass caps are exceeded', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    await writeFile(path.join(featureDir, 'spec.md'), 'x'.repeat(800 * 1024));
    const fetchImpl = vi.fn();

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'segmentation_limits_exceeded',
      requestSent: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('stops on a packet provider error and retains safe diagnostics plus all planned packet boundaries', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    await writeFile(path.join(featureDir, 'spec.md'), 'x'.repeat(120 * 1024));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(alignedResponse())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: [{ loc: ['state'], type: 'too_large' }] }), {
          status: 400,
          headers: { 'x-typesafe-request-id': 'req-123' },
        })
      );

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'provider_http_error',
      usage: { inputTokens: 100, outputTokens: 12 },
      usageComplete: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.multiPass.complete).toBe(false);
    expect(result.multiPass.packets).toHaveLength(result.multiPass.packetCount);
    expect(result.multiPass.packetCount).toBeGreaterThan(2);
    expect(
      result.multiPass.packets.slice(0, 2).map((packet: { status: string }) => packet.status)
    ).toEqual(['aligned', 'unavailable']);
    const pendingPackets = result.multiPass.packets.slice(2);
    expect(pendingPackets.length).toBeGreaterThan(0);
    expect(
      pendingPackets.every(
        (packet: {
          status: string;
          reason: string;
          sourceRanges: unknown[];
          requestAttempted: boolean;
          requestSent: boolean;
          answers: Record<string, unknown>;
        }) =>
          packet.status === 'pending' &&
          packet.reason === 'not_attempted_after_prior_packet_failure' &&
          packet.sourceRanges.length > 0 &&
          packet.requestAttempted === false &&
          packet.requestSent === false &&
          Object.keys(packet.answers).length === 0
      )
    ).toBe(true);
    expect(result.providerError).toMatchObject({
      httpStatus: 400,
      requestId: 'req-123',
      validation: [{ location: 'state', type: 'too_large' }],
    });
    expect(JSON.stringify(result)).not.toContain('x'.repeat(100));
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('does not report a completed conflict when a later packet is unavailable', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    await writeFile(path.join(featureDir, 'spec.md'), 'x'.repeat(120 * 1024));
    const conflictAnswers = alignedAnswers(0.99);
    conflictAnswers.goal_alignment = {
      type: 'choice',
      choice: 'conflict',
      confidence: 0.99,
      probabilities: { aligned: 0.005, partial: 0.005, conflict: 0.99 },
    };
    conflictAnswers.required_action = {
      type: 'choice',
      choice: 'ask_user',
      confidence: 0.99,
      probabilities: { continue: 0.005, reconcile: 0.005, ask_user: 0.99 },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validResponsePayload(conflictAnswers)), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: [{ loc: ['state'], type: 'too_large' }] }), {
          status: 400,
        })
      );

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });

    expect(result).toMatchObject({ status: 'unavailable', reason: 'provider_http_error' });
    expect(result.multiPass.packets[0].status).toBe('conflict');
    expect(result.multiPass.packets[1].status).toBe('unavailable');
    expect(result.multiPass.complete).toBe(false);
  });

  it('stops at the total review deadline and retains the unattempted packet details', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    await writeFile(path.join(featureDir, 'spec.md'), 'x'.repeat(120 * 1024));
    const clockValues = [0, 0, 1, 120_001, 120_001];
    let clockIndex = 0;
    const now = () => clockValues[Math.min(clockIndex++, clockValues.length - 1)];
    const fetchImpl = vi.fn(async () => alignedResponse());

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
      now,
    });

    expect(result).toMatchObject({ status: 'unavailable', reason: 'review_deadline_exceeded' });
    expect(result).toMatchObject({
      usage: { inputTokens: 100, outputTokens: 12 },
      usageComplete: false,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.multiPass.limits.maxDurationMs).toBe(120_000);
    expect(result.multiPass.packets.length).toBeGreaterThan(1);
    expect(result.multiPass.packets[0].status).toBe('aligned');
    expect(
      result.multiPass.packets
        .slice(1)
        .every(
          (packet: {
            status: string;
            reason: string;
            sourceRanges: unknown[];
            requestBytes: number;
            requestAttempted: boolean;
          }) =>
            packet.status === 'pending' &&
            packet.reason === 'not_attempted_after_review_deadline' &&
            packet.sourceRanges.length > 0 &&
            packet.requestBytes > 0 &&
            !packet.requestAttempted
        )
    ).toBe(true);
  });

  it('rejects a credential path routed through a symlinked directory', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-typesafe-secrets-'));
    directories.push(outside);
    await symlink(
      outside,
      path.join(workspace, '.specify', 'secrets'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    await expect(credentials.connect({ workspace, key: 'secret-value' })).rejects.toThrow(
      'symbolic link'
    );
  });

  it('fails closed when an enabled policy has a missing or invalid minimumConfidence', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn();
    const policyPath = path.join(workspace, '.specify', 'config', 'typesafe-semantic-review.json');
    for (const malformed of [
      { schemaVersion: 1, enabled: true, provider: 'typesafe', events: ['before_validation'] },
      {
        schemaVersion: 1,
        enabled: true,
        provider: 'typesafe',
        events: ['before_validation'],
        minimumConfidence: 'high',
      },
      {
        schemaVersion: 1,
        enabled: true,
        provider: 'typesafe',
        events: ['before_validation'],
        minimumConfidence: 1.5,
      },
      {
        schemaVersion: 1,
        enabled: true,
        provider: 'typesafe',
        events: 'before_validation',
        minimumConfidence: 0.85,
      },
    ]) {
      await writeFile(policyPath, JSON.stringify(malformed));
      await expect(
        semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl })
      ).rejects.toThrow('malformed');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a symlinked policy config directory', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-typesafe-config-'));
    directories.push(outside);
    await writeFile(
      path.join(outside, 'typesafe-semantic-review.json'),
      JSON.stringify({
        schemaVersion: 1,
        enabled: true,
        provider: 'typesafe',
        events: ['before_validation'],
        minimumConfidence: 0.85,
      })
    );
    await rm(path.join(workspace, '.specify', 'config'), { recursive: true, force: true });
    await symlink(
      outside,
      path.join(workspace, '.specify', 'config'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    const fetchImpl = vi.fn();
    await expect(
      semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl })
    ).rejects.toThrow('symbolic link');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('prefers the environment key over a conflicting project secret file', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    await credentials.connect({ workspace, key: 'project-secret-value' });
    const result = await credentials.resolveApiKey({
      workspace,
      env: { TYPESAFE_API_KEY: 'environment-value' },
    });
    expect(result).toEqual({ apiKey: 'environment-value', source: 'environment' });
  });

  it('rejects an invalid confidence as a malformed provider response', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    // A malformed confidence on one answer must not be outweighed by a high
    // confidence on the other: the minimum must still fail closed to zero.
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...validResponsePayload({
              ...alignedAnswers(0.99),
              goal_alignment: {
                type: 'choice',
                choice: 'aligned',
                confidence: 'not-a-number',
                probabilities: { aligned: 0.99, partial: 0.01, conflict: 0 },
              },
            }),
          }),
          { status: 200 }
        )
    );
    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_response_schema' });
    expect(result.responseValidation).toContain('answer_goal_alignment_confidence_invalid');
  });

  it('maps each status to the exit code a CI caller must not read as a pass', async () => {
    const semantic = await import(semanticUrl.href);
    expect(semantic.exitCodeForStatus('conflict')).toBe(2);
    expect(semantic.exitCodeForStatus('reconcile')).toBe(3);
    expect(semantic.exitCodeForStatus('unavailable')).toBe(3);
    expect(semantic.exitCodeForStatus('not_configured')).toBe(3);
    expect(semantic.exitCodeForStatus('aligned')).toBe(0);
    expect(semantic.exitCodeForStatus('disabled')).toBe(0);
  });

  it('rejects a feature directory whose own path is a symlink', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-typesafe-feature-'));
    directories.push(outside);
    await writeFile(path.join(outside, 'secret.txt'), 'do not read this');
    const linkedFeatureDir = path.join(workspace, '.specify', 'specs', 'linked-feature');
    await symlink(outside, linkedFeatureDir, process.platform === 'win32' ? 'junction' : 'dir');
    const fetchImpl = vi.fn();
    await expect(
      semantic.runSemanticReview({
        workspace,
        featureDir: linkedFeatureDir,
        event: 'before_validation',
        fetchImpl,
      })
    ).rejects.toThrow('symbolic link');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on a nonexistent feature directory instead of an empty state', async () => {
    const { workspace } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn();
    await expect(
      semantic.runSemanticReview({
        workspace,
        featureDir: path.join(workspace, '.specify', 'specs', 'typo-d-feature'),
        event: 'before_validation',
        fetchImpl,
      })
    ).rejects.toThrow('does not exist');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range confidence as a malformed provider response', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...validResponsePayload({
              ...alignedAnswers(0.99),
              goal_alignment: {
                type: 'choice',
                choice: 'aligned',
                confidence: 2,
                probabilities: { aligned: 0.99, partial: 0.01, conflict: 0 },
              },
            }),
          }),
          { status: 200 }
        )
    );
    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_response_schema' });
    expect(result.responseValidation).toContain('answer_goal_alignment_confidence_invalid');
  });

  it('rejects an artifact larger than the maximum readable size', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    await writeFile(path.join(featureDir, 'spec.md'), 'x'.repeat(9 * 1024 * 1024));
    const fetchImpl = vi.fn();
    await expect(
      semantic.runSemanticReview({ workspace, featureDir, event: 'before_validation', fetchImpl })
    ).rejects.toThrow('exceeds the maximum readable size');
  });

  it('forces reconciliation when delivery evidence is missing before validation', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    await unlink(path.join(featureDir, 'test-spec.md'));
    await unlink(path.join(featureDir, 'blast-radius-report.md'));
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(validResponsePayload(alignedAnswers())), { status: 200 })
    );
    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });
    expect(result.missingArtifacts).toEqual(
      expect.arrayContaining(['test-spec.md', 'blast-radius-report.md'])
    );
    expect(result.missingRequiredEvidence).toBe(true);
    expect(result.status).toBe('reconcile');
  });

  it('measures structured request size from UTF-8 bytes rather than JavaScript code units', async () => {
    const semantic = await import(semanticUrl.href);
    const questions = {
      one: { type: 'choice', instructions: 'Check this.', criteria: { yes: 'Yes', no: 'No' } },
    };
    const ascii = semantic.measureTypeSafeInputBudget({ value: 'a'.repeat(10_000) }, questions);
    const multibyte = semantic.measureTypeSafeInputBudget({ value: '€'.repeat(10_000) }, questions);
    expect(ascii.stateBytes).toBeLessThan(multibyte.stateBytes);
    expect(multibyte.stateBytes).toBeGreaterThan(30_000);
    expect(multibyte.withinLimits).toBe(false);
  });

  it('sends complete structured artifacts and records actual usage and the weakest Jev answer', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const completeSpec = `${'S'.repeat(12_000)}END_OF_SPEC`;
    await writeFile(path.join(featureDir, 'spec.md'), completeSpec, 'utf8');
    const answers = alignedAnswers(0.96);
    answers.goal_alignment = {
      type: 'choice',
      choice: 'aligned',
      confidence: 0.72,
      probabilities: { aligned: 0.72, partial: 0.23, conflict: 0.05 },
    };
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...validResponsePayload(answers),
            usage: { input_tokens: 3210, output_tokens: 44 },
          }),
          { status: 200 }
        )
    );

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });
    expect(result.status).toBe('reconcile');
    expect(result.confidence).toBe(0.72);
    expect(result.confidenceGate).toMatchObject({
      minimum: 0.85,
      observed: 0.72,
      belowMinimum: true,
      weakestQuestion: {
        id: 'goal_alignment',
        choice: 'aligned',
        confidence: 0.72,
        closestAlternative: { choice: 'partial', probability: 0.23 },
      },
    });
    expect(result).toMatchObject({
      model: 'jev-1.13.0',
      usage: { inputTokens: 3210, outputTokens: 44 },
    });
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(typeof request.state).toBe('object');
    expect(request.state['spec.md'].content).toBe(completeSpec);
    expect(request.state['spec.md'].content).toContain('END_OF_SPEC');
    expect(request).not.toHaveProperty('user');
    expect(JSON.stringify(request)).not.toContain('secret-value');
    const receipt = JSON.parse(
      await readFile(
        path.join(featureDir, 'evidence', 'semantic-review', 'before_validation.json'),
        'utf8'
      )
    );
    expect(receipt.schemaVersion).toBe(4);
    expect(receipt.usage).toEqual({ inputTokens: 3210, outputTokens: 44 });
    expect(receipt.confidenceGate.weakestQuestion.probabilities).toEqual({
      aligned: 0.72,
      partial: 0.23,
      conflict: 0.05,
    });
    expect(JSON.stringify(receipt)).not.toContain(completeSpec);
    expect(JSON.stringify(receipt)).not.toContain('secret-value');
  });

  it('keeps provider errors bounded and reports unknown causes without storing echoed content', async () => {
    const { workspace, featureDir } = await fixture();
    const credentials = await import(credentialsUrl.href);
    const semantic = await import(semanticUrl.href);
    await credentials.connect({ workspace, key: 'secret-value' });
    const privateValue = 'PRIVATE_CUSTOMER_TEXT_98421';
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 'invalid_request',
            message: `Rejected ${privateValue}`,
            detail: [
              {
                loc: ['body', 'questions', 'goal_alignment'],
                type: 'invalid_choice',
                msg: privateValue,
              },
            ],
          }),
          { status: 400, headers: { 'x-request-id': 'req_12345' } }
        )
    );

    const result = await semantic.runSemanticReview({
      workspace,
      featureDir,
      event: 'before_validation',
      fetchImpl,
    });
    expect(result).toMatchObject({
      status: 'unavailable',
      reason: 'provider_http_error',
      requestSent: true,
    });
    expect(result.providerError).toMatchObject({
      httpStatus: 400,
      requestId: 'req_12345',
      code: 'invalid_request',
      validation: [{ location: 'body.questions.goal_alignment', type: 'invalid_choice' }],
    });
    expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(JSON.stringify(result)).not.toContain('Rejected');
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('rejects a workspace root that is itself a symlink', async () => {
    const { workspace, featureDir } = await fixture();
    const outside = await mkdtemp(path.join(os.tmpdir(), 'gofer-typesafe-root-'));
    directories.push(outside);
    const linkedWorkspace = path.join(outside, 'workspace-link');
    await symlink(workspace, linkedWorkspace, process.platform === 'win32' ? 'junction' : 'dir');
    const semantic = await import(semanticUrl.href);
    const linkedFeatureDir = featureDir.replace(workspace, linkedWorkspace);
    await expect(
      semantic.runSemanticReview({
        workspace: linkedWorkspace,
        featureDir: linkedFeatureDir,
        event: 'before_validation',
        fetchImpl: vi.fn(),
      })
    ).rejects.toThrow('must be a real directory, not a symbolic link');
    const credentials = await import(credentialsUrl.href);
    await expect(credentials.credentialStatus({ workspace: linkedWorkspace })).rejects.toThrow(
      'must be a real directory, not a symbolic link'
    );
  });

  it('fails closed on a nonexistent workspace root instead of silently resolving one', async () => {
    const { featureDir } = await fixture();
    const semantic = await import(semanticUrl.href);
    await expect(
      semantic.runSemanticReview({
        workspace: '/nonexistent/gofer-workspace-root',
        featureDir,
        event: 'before_validation',
        fetchImpl: vi.fn(),
      })
    ).rejects.toThrow('Gofer workspace root does not exist.');
  });

  it('rejects an event name that could traverse out of the receipt directory', async () => {
    const { workspace, featureDir } = await fixture();
    const semantic = await import(semanticUrl.href);
    await expect(
      semantic.runSemanticReview({ workspace, featureDir, event: '../../evil', fetchImpl: vi.fn() })
    ).rejects.toThrow('Gofer TypeSafe event name contains unsupported characters.');
  });
});
