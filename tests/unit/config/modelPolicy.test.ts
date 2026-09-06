import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOFER_MODEL_POLICY,
  GOFER_MODEL_POLICY_PATH,
  GOFER_TASK_TIERS,
  MAX_MODEL_CATALOG_AGE_MS,
  getDefaultModelRoute,
  resolveModelRoute,
  type GoferModelPolicy,
  type GoferModelSurface,
  type HostModelCatalog,
  type ModelCatalogContext,
  type ModelResolutionRequest,
  type ModelRouteResolution,
  type ModelSelectionAuthorization,
} from '../../../extension/src/config/modelPolicy';

const NOW = Date.UTC(2026, 8, 6, 0, 0);
const CONTEXT: ModelCatalogContext = {
  hostId: 'local-coding-desktop:profile-a',
  surface: 'codex',
  authContextId: 'authenticated-session-a',
  permissionContextId: 'workspace-only',
  costContextId: 'approved-budget-a',
};
const SURFACES: GoferModelSurface[] = [
  ...(Object.keys(DEFAULT_GOFER_MODEL_POLICY.surfaces) as GoferModelSurface[]),
  'antigravity-desktop',
];

function catalog(): HostModelCatalog {
  return {
    ...CONTEXT,
    verified: true,
    verificationSource: 'host-account-discovery:test-evidence',
    verifiedAtMs: NOW - 1000,
    expiresAtMs: NOW + 60_000,
    models: [
      {
        id: 'choice-b',
        available: true,
        reasoningEfforts: ['low', 'high'],
        contextWindowTokens: 123_456,
        qualifications: [],
      },
      { id: 'choice-z', available: true },
    ],
  };
}

function authorization(): ModelSelectionAuthorization {
  return {
    ...CONTEXT,
    modelId: 'choice-b',
    catalogVerifiedAtMs: NOW - 1000,
    permissionApproved: true,
    costApproved: true,
    evidence: 'selection-approval:test-evidence',
  };
}

function request(overrides: Partial<ModelResolutionRequest> = {}): ModelResolutionRequest {
  return {
    context: { ...CONTEXT },
    tier: 'medium',
    requestedModelId: 'choice-b',
    catalog: catalog(),
    authorization: authorization(),
    nowMs: NOW,
    ...overrides,
  };
}

function expectBlocked(result: ModelRouteResolution, reason: string): void {
  expect(result).toEqual({ status: 'blocked', model: '', reason });
}

function policyWithPreference(model: string): GoferModelPolicy {
  const policy = structuredClone(DEFAULT_GOFER_MODEL_POLICY);
  policy.surfaces.codex.medium = { model, useFor: 'Existing user preference' };
  return policy;
}

describe('Host-current model policy defaults', () => {
  it('keeps the user-owned policy path and makes no catalog verification claim', () => {
    expect(GOFER_MODEL_POLICY_PATH).toBe('.specify/memory/gofer-model-policy.yaml');
    expect(DEFAULT_GOFER_MODEL_POLICY.lastVerified).toBe('');
  });

  it.each(SURFACES)(
    'preserves all six tiers without pins or capability claims for %s',
    (surface) => {
      for (const tier of GOFER_TASK_TIERS) {
        const route = getDefaultModelRoute(surface, tier);
        expect(route.model).toBe('');
        expect(route.selection).toBe('host-current');
        expect(route.requiresQualification).toBe(tier === 'hard' || tier === 'arbiter');
        expect(route.reasoningEffort).toBeUndefined();
        expect(route.contextWindowTokens).toBeUndefined();
        expect(route.claudeCodeAlias).toBeUndefined();
        expect(route.useFor).not.toBe('');
      }
    }
  );

  it('ships exactly the same unpinned routes in the YAML template', () => {
    const template = fs.readFileSync(
      path.join(process.cwd(), '.specify/templates/gofer-model-policy.yaml'),
      'utf8'
    );
    const parsed = matter('---\n' + template + '\n---\n').data;
    expect(parsed.surfaces).toEqual(DEFAULT_GOFER_MODEL_POLICY.surfaces);
    expect(parsed.lastVerified).toBe('');
    expect(parsed.principles).toEqual(
      expect.arrayContaining([
        'Preserve the current native host selection for standard work; omit model and reasoning overrides.',
        'When a delegated tier choice is needed, prefer the lowest-cost verified-capable advertised option, including for repetitive work, using current supported cost evidence; never rank by name or guess prices.',
      ])
    );
    expect(parsed.contextPolicy).toEqual({
      healthyBelowPercent: 40,
      summarizeAtPercent: 55,
      compactAtPercent: 70,
      checkpointAtPercent: 85,
      durableArtifact: '.specify/specs/{feature}/context-bundle.md',
    });
    expect(template).toContain('never overwrite it on an update');
  });

  it('falls back from a missing arbiter preference to hard, never medium', () => {
    const policy = policyWithPreference('routine-choice');
    policy.surfaces.codex.hard = { model: 'review-choice', useFor: 'Hard review' };
    delete policy.surfaces.codex.arbiter;
    const route = getDefaultModelRoute('codex', 'arbiter', policy);
    expect(route.model).toBe('review-choice');
    expect(route.requiresQualification).toBe(true);
  });

  it('retains optional-tier compatibility and does not mutate returned or user-owned policy', () => {
    const policy = policyWithPreference('user-choice');
    delete policy.surfaces.codex.mechanical;
    delete policy.surfaces.codex.highThroughputCoding;
    const original = JSON.stringify(policy);
    for (const tier of ['mechanical', 'highThroughputCoding'] as const) {
      expect(getDefaultModelRoute('codex', tier, policy).model).toBe('user-choice');
    }
    getDefaultModelRoute('codex', 'medium', policy).model = 'local-copy-edit';
    resolveModelRoute(request({ policy, requestedModelId: undefined }));
    expect(JSON.stringify(policy)).toBe(original);
  });

  it('does not write the existing repo-owned policy while resolving routes', () => {
    const file = path.join(process.cwd(), GOFER_MODEL_POLICY_PATH);
    const hash = () => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const before = hash();
    resolveModelRoute(request());
    resolveModelRoute({ context: CONTEXT, tier: 'hard' });
    expect(hash()).toBe(before);
  });
});

describe('Native selection preservation', () => {
  it.each(['mechanical', 'simple', 'medium', 'highThroughputCoding'] as const)(
    'keeps native %s selection without discovery or approval',
    (tier) => {
      expect(resolveModelRoute({ context: CONTEXT, tier })).toEqual({
        status: 'native',
        model: '',
        selection: 'host-current',
        qualification: 'not_required',
      });
    }
  );

  it.each(['hard', 'arbiter'] as const)(
    'does not claim the native model qualifies for %s',
    (tier) => {
      expect(resolveModelRoute({ context: CONTEXT, tier })).toEqual({
        status: 'requires_qualification',
        model: '',
        requiredTier: tier,
      });
    }
  );

  it('never picks a model from a supplied catalog unless a preference is requested', () => {
    expect(resolveModelRoute(request({ requestedModelId: undefined }))).toMatchObject({
      status: 'native',
      model: '',
    });
  });

  it('does not apply a reasoning-only override to an unknown native model', () => {
    expectBlocked(
      resolveModelRoute({
        context: CONTEXT,
        tier: 'medium',
        reasoningEffort: 'high',
      }),
      'model_required_for_reasoning_override'
    );
  });

  it.each(GOFER_TASK_TIERS)('does not discard a saved reasoning-only preference for %s', (tier) => {
    const policy = structuredClone(DEFAULT_GOFER_MODEL_POLICY);
    policy.surfaces.codex[tier]!.reasoningEffort = 'max';
    const input = request({ policy, tier, requestedModelId: undefined });
    const before = JSON.stringify(input);
    expectBlocked(resolveModelRoute(input), 'model_required_for_reasoning_override');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('blocks a legacy reasoning-only preference without a selection field or catalog', () => {
    const policy = policyWithPreference('');
    policy.surfaces.codex.medium.reasoningEffort = 'max';
    expectBlocked(
      resolveModelRoute({ context: CONTEXT, tier: 'medium', policy }),
      'model_required_for_reasoning_override'
    );
    expect(policy.surfaces.codex.medium.reasoningEffort).toBe('max');
  });

  it('does not silently downgrade an explicit catalog-selection policy to native', () => {
    const policy = policyWithPreference('');
    policy.surfaces.codex.medium.selection = 'verified-catalog';
    expectBlocked(
      resolveModelRoute(
        request({
          policy,
          requestedModelId: undefined,
        })
      ),
      'invalid_preference'
    );
  });
});

describe('Exact authenticated catalog resolution', () => {
  it('resolves only the exact advertised, approved model without mutating inputs', () => {
    const input = request();
    const before = JSON.stringify(input);
    expect(resolveModelRoute(input)).toEqual({
      status: 'resolved',
      model: 'choice-b',
      selection: 'verified-catalog',
      qualification: 'not_required',
      contextWindowTokens: 123_456,
    });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('requires a catalog even for a legacy preference', () => {
    expectBlocked(
      resolveModelRoute(
        request({
          requestedModelId: undefined,
          policy: policyWithPreference('choice-b'),
          catalog: undefined,
        })
      ),
      'catalog_required'
    );
  });

  it('accepts a legacy preference only when exactly advertised and approved', () => {
    expect(
      resolveModelRoute(
        request({
          requestedModelId: undefined,
          policy: policyWithPreference('choice-b'),
        })
      ).status
    ).toBe('resolved');
  });

  it('rejects an unadvertised legacy ID rather than forcing or replacing it', () => {
    expectBlocked(
      resolveModelRoute(
        request({
          requestedModelId: undefined,
          policy: policyWithPreference('retired-preference'),
        })
      ),
      'model_not_advertised'
    );
  });

  it('does not expand a legacy alias into an assumed concrete model', () => {
    const policy = policyWithPreference('');
    policy.surfaces.codex.medium.claudeCodeAlias = 'sonnet';
    expectBlocked(
      resolveModelRoute(
        request({
          policy,
          requestedModelId: undefined,
        })
      ),
      'model_not_advertised'
    );
  });

  it.each(['Choice-b', 'missing-choice'])(
    'rejects non-exact catalog preference %s',
    (requestedModelId) => {
      expectBlocked(resolveModelRoute(request({ requestedModelId })), 'model_not_advertised');
    }
  );

  it.each(['', ' choice-b', 'choice-b ', 'choice-b\n'])(
    'does not normalize invalid explicit preference %j',
    (requestedModelId) => {
      expectBlocked(resolveModelRoute(request({ requestedModelId })), 'invalid_preference');
    }
  );

  it('rejects unavailable choices instead of selecting another advertised model', () => {
    const input = request();
    input.catalog!.models[0].available = false;
    expectBlocked(resolveModelRoute(input), 'model_unavailable');
  });

  it('does not infer preference or strength from lexical order', () => {
    const input = request({ tier: 'hard' });
    input.catalog = { ...input.catalog!, models: [...input.catalog!.models].reverse() };
    expect(resolveModelRoute(input)).toEqual({
      status: 'requires_qualification',
      model: '',
      requiredTier: 'hard',
      requestedModelId: 'choice-b',
    });
  });

  it.each(['hostId', 'surface', 'authContextId', 'permissionContextId', 'costContextId'] as const)(
    'rejects a catalog from a different %s',
    (field) => {
      const input = request();
      input.catalog = {
        ...input.catalog!,
        [field]: field === 'surface' ? 'claude' : 'other-context',
      };
      expectBlocked(resolveModelRoute(input), 'catalog_context_mismatch');
    }
  );

  it('rejects unverified and evidence-free catalogs', () => {
    const input = request();
    input.catalog!.verified = false;
    expectBlocked(resolveModelRoute(input), 'catalog_unverified');
    input.catalog!.verified = true;
    input.catalog!.verificationSource = '';
    expectBlocked(resolveModelRoute(input), 'catalog_unverified');
  });

  it.each([
    { verifiedAtMs: NOW - MAX_MODEL_CATALOG_AGE_MS - 1, expiresAtMs: NOW + 60_000 },
    { verifiedAtMs: NOW - 1000, expiresAtMs: NOW },
    { verifiedAtMs: NOW + 1, expiresAtMs: NOW + 60_000 },
  ])('rejects stale, expired or future discovery %j', (timing) => {
    expectBlocked(
      resolveModelRoute(request({ catalog: { ...catalog(), ...timing } })),
      'catalog_stale'
    );
  });

  it.each([
    { verifiedAtMs: NaN },
    { expiresAtMs: Infinity },
    { expiresAtMs: NOW - 2000 },
    { models: [null] },
    { models: [{ id: '', available: true }] },
    { models: [{ id: 'choice-b' }] },
    { models: [catalog().models[0], catalog().models[0]] },
    { models: null },
  ])('fails closed on malformed discovery %j', (change) => {
    const invalid = { ...catalog(), ...change } as unknown as HostModelCatalog;
    expectBlocked(resolveModelRoute(request({ catalog: invalid })), 'catalog_invalid');
  });

  it('ignores unverified policy context-window claims', () => {
    const policy = policyWithPreference('choice-b');
    policy.surfaces.codex.medium.contextWindowTokens = 999_999_999;
    expect(resolveModelRoute(request({ policy }))).toMatchObject({ contextWindowTokens: 123_456 });
  });
});

describe('Qualification, permission and cost boundaries', () => {
  it.each(['hard', 'arbiter'] as const)('requires verified %s qualification evidence', (tier) => {
    const input = request({ tier });
    for (const qualifications of [
      [],
      [{ tier, verified: false, evidence: 'unverified' }],
      [{ tier, verified: true, evidence: '' }],
    ]) {
      input.catalog!.models[0].qualifications = qualifications;
      expect(resolveModelRoute(input).status).toBe('requires_qualification');
    }
    input.catalog!.models[0].qualifications = [
      { tier, verified: true, evidence: 'evaluated-task-evidence' },
    ];
    expect(resolveModelRoute(input)).toMatchObject({
      status: 'resolved',
      model: 'choice-b',
      qualification: 'verified',
    });
  });

  it('does not turn hard qualification into arbiter qualification on fallback', () => {
    const policy = policyWithPreference('routine-choice');
    policy.surfaces.codex.hard = { model: 'choice-b', useFor: 'Hard review' };
    delete policy.surfaces.codex.arbiter;
    const input = request({ tier: 'arbiter', policy, requestedModelId: undefined });
    input.catalog!.models[0].qualifications = [
      { tier: 'hard', verified: true, evidence: 'hard-evidence' },
    ];
    expect(resolveModelRoute(input)).toMatchObject({
      status: 'requires_qualification',
      requiredTier: 'arbiter',
    });
  });

  it.each([
    undefined,
    { ...authorization(), permissionApproved: false },
    { ...authorization(), costApproved: false },
    { ...authorization(), evidence: '' },
    { ...authorization(), modelId: 'choice-z' },
  ])('does not launch without exact permission and cost approval %j', (authorization) => {
    expectBlocked(resolveModelRoute(request({ authorization })), 'selection_approval_required');
  });

  it.each(['hostId', 'surface', 'authContextId', 'permissionContextId', 'costContextId'] as const)(
    'rejects approval from another %s',
    (field) => {
      const input = request();
      input.authorization = {
        ...authorization(),
        [field]: field === 'surface' ? 'claude' : 'other-context',
      };
      expectBlocked(resolveModelRoute(input), 'approval_context_mismatch');
    }
  );

  it('invalidates approval when discovery changes', () => {
    const input = request();
    input.authorization!.catalogVerifiedAtMs -= 1;
    expectBlocked(resolveModelRoute(input), 'approval_snapshot_mismatch');
  });

  it('requires exact advertised and approved reasoning effort', () => {
    const input = request({ reasoningEffort: 'high' });
    expectBlocked(resolveModelRoute(input), 'selection_approval_required');
    input.authorization!.reasoningEffort = 'high';
    expect(resolveModelRoute(input)).toMatchObject({ status: 'resolved', reasoningEffort: 'high' });
    input.reasoningEffort = 'xhigh';
    input.authorization!.reasoningEffort = 'xhigh';
    expectBlocked(resolveModelRoute(input), 'reasoning_not_advertised');
  });

  it.each(['minimal', 'none', 'max', 'ultra', 'provider-defined-future-effort'])(
    'supports exact native reasoning value %s without a frozen enum',
    (reasoningEffort) => {
      const input = request({ reasoningEffort });
      input.catalog!.models[0].reasoningEfforts = [reasoningEffort];
      input.authorization!.reasoningEffort = reasoningEffort;
      expect(resolveModelRoute(input)).toMatchObject({
        status: 'resolved',
        reasoningEffort,
      });
      input.catalog!.models[0].reasoningEfforts = [];
      expectBlocked(resolveModelRoute(input), 'reasoning_not_advertised');
    }
  );

  it.each([
    { model: 'choice-b', requestedModelId: undefined },
    { model: '', requestedModelId: 'choice-b' },
  ])('retains saved reasoning for the advertised and approved model %j', (selection) => {
    for (const reasoningEffort of [
      'minimal',
      'none',
      'max',
      'ultra',
      'provider-defined-future-effort',
    ]) {
      const policy = policyWithPreference(selection.model);
      policy.surfaces.codex.medium.reasoningEffort = reasoningEffort;
      const input = request({ policy, requestedModelId: selection.requestedModelId });
      input.catalog!.models[0].reasoningEfforts = [reasoningEffort];
      expectBlocked(resolveModelRoute(input), 'selection_approval_required');
      input.authorization!.reasoningEffort = reasoningEffort;
      const before = JSON.stringify(input);
      expect(resolveModelRoute(input)).toMatchObject({
        status: 'resolved',
        model: 'choice-b',
        reasoningEffort,
      });
      expect(JSON.stringify(input)).toBe(before);
      input.catalog!.models[0].reasoningEfforts = [];
      expectBlocked(resolveModelRoute(input), 'reasoning_not_advertised');
    }
  });

  it('preserves direct reasoning precedence without changing the saved preference', () => {
    const policy = policyWithPreference('choice-b');
    policy.surfaces.codex.medium.reasoningEffort = 'max';
    const input = request({ policy, reasoningEffort: 'low' });
    input.authorization!.reasoningEffort = 'low';
    expect(resolveModelRoute(input)).toMatchObject({ status: 'resolved', reasoningEffort: 'low' });
    expect(policy.surfaces.codex.medium.reasoningEffort).toBe('max');
  });

  it('does not normalize or infer capability from an effort label', () => {
    const input = request({ tier: 'hard', reasoningEffort: 'MAX' });
    input.catalog!.models[0].reasoningEfforts = ['max'];
    input.authorization!.reasoningEffort = 'MAX';
    expectBlocked(resolveModelRoute(input), 'reasoning_not_advertised');
    input.reasoningEffort = 'max';
    input.authorization!.reasoningEffort = 'max';
    expect(resolveModelRoute(input).status).toBe('requires_qualification');
  });

  it.each(['', ' max', 'max ', null, 42])('rejects malformed effort %j', (effort) => {
    const input = { ...request(), reasoningEffort: effort } as unknown as ModelResolutionRequest;
    expectBlocked(resolveModelRoute(input), 'invalid_request');
  });

  it.each(['local-coding-cli:profile-a', 'local-coding-desktop:profile-b'])(
    'does not reuse discovery across client/profile %s',
    (hostId) => {
      const input = request({ context: { ...CONTEXT, hostId } });
      expectBlocked(resolveModelRoute(input), 'catalog_context_mismatch');
      input.catalog!.hostId = hostId;
      expectBlocked(resolveModelRoute(input), 'approval_context_mismatch');
    }
  );

  it('blocks an unadvertised legacy reasoning preference', () => {
    const policy = policyWithPreference('choice-b');
    policy.surfaces.codex.medium.reasoningEffort = 'xhigh';
    expectBlocked(
      resolveModelRoute(request({ policy, requestedModelId: undefined })),
      'reasoning_not_advertised'
    );
  });

  it('returns no model override for invalid runtime request or policy data', () => {
    expectBlocked(resolveModelRoute({} as ModelResolutionRequest), 'invalid_request');
    expectBlocked(resolveModelRoute(request({ nowMs: NaN })), 'invalid_request');
    expectBlocked(resolveModelRoute(request({ policy: {} as GoferModelPolicy })), 'invalid_policy');
  });
});

describe('Antigravity policy migration', () => {
  it.each(['gemini', 'gemini-cli'])(
    'rejects retired %s before reading a supplied catalog',
    (surface) => {
      const input = {
        context: { ...CONTEXT, surface },
        tier: 'medium',
        get catalog() {
          throw new Error('must not read legacy catalog');
        },
      } as ModelResolutionRequest;
      expectBlocked(resolveModelRoute(input), 'retired_surface');
      expect(() => getDefaultModelRoute(surface as GoferModelSurface, 'medium')).toThrow('retired');
    }
  );

  it('shares tier preferences, but rejects CLI evidence for desktop on the same host/account', () => {
    expect(getDefaultModelRoute('antigravity-desktop', 'medium')).toEqual(
      getDefaultModelRoute('antigravity', 'medium')
    );
    const input = request({
      context: { ...CONTEXT, surface: 'antigravity-desktop' },
      catalog: { ...catalog(), surface: 'antigravity' },
      authorization: { ...authorization(), surface: 'antigravity-desktop' },
    });
    expectBlocked(resolveModelRoute(input), 'catalog_context_mismatch');
    expect(
      resolveModelRoute({ ...input, catalog: { ...catalog(), surface: 'antigravity-desktop' } })
    ).toMatchObject({ status: 'resolved', model: 'choice-b' });
  });

  it('rejects cross-surface approval even with matching host and catalog', () => {
    expectBlocked(
      resolveModelRoute(
        request({
          context: { ...CONTEXT, surface: 'antigravity-desktop' },
          catalog: { ...catalog(), surface: 'antigravity-desktop' },
          authorization: { ...authorization(), surface: 'antigravity' },
        })
      ),
      'approval_context_mismatch'
    );
  });

  it('never silently drops saved Gemini policy preferences during migration', () => {
    const policy = structuredClone(DEFAULT_GOFER_MODEL_POLICY);
    Object.assign(policy.surfaces, {
      gemini: {
        ...policy.surfaces.antigravity,
        medium: { model: 'user-saved-choice', useFor: 'saved' },
      },
    });
    const before = JSON.stringify(policy);
    expectBlocked(
      resolveModelRoute({
        context: { ...CONTEXT, surface: 'antigravity' },
        tier: 'medium',
        policy,
      }),
      'invalid_policy'
    );
    expect(JSON.stringify(policy)).toBe(before);
  });
});
