export type GoferTaskTier =
  | 'simple'
  | 'mechanical'
  | 'medium'
  | 'hard'
  | 'arbiter'
  | 'highThroughputCoding';

export interface ModelRoute {
  /** Empty means omit the model override and preserve the host's current selection. */
  model: string;
  selection?: 'host-current' | 'verified-catalog';
  requiresQualification?: boolean;
  /** Exact native catalog value; the host defines the supported strings. */
  reasoningEffort?: string;
  contextWindowTokens?: number;
  /** Legacy preference only; never expand an alias into a guessed model ID. */
  claudeCodeAlias?: 'haiku' | 'sonnet' | 'opus';
  useFor: string;
}

export interface HostModelPolicy {
  simple: ModelRoute;
  medium: ModelRoute;
  hard: ModelRoute;
  mechanical?: ModelRoute;
  arbiter?: ModelRoute;
  highThroughputCoding?: ModelRoute;
  note?: string;
}

export interface GoferModelPolicy {
  version: number;
  lastVerified: string;
  profile: 'balanced';
  surfaces: {
    claude: HostModelPolicy;
    codex: HostModelPolicy;
    antigravity: HostModelPolicy;
    copilot: HostModelPolicy;
  };
}

// Tier preferences may be shared; catalog and approval identities may not.
export type GoferModelSurface = keyof GoferModelPolicy['surfaces'] | 'antigravity-desktop';
export type ModelReasoningEffort = NonNullable<ModelRoute['reasoningEffort']>;

export const GOFER_MODEL_POLICY_PATH = '.specify/memory/gofer-model-policy.yaml';
export const MAX_MODEL_CATALOG_AGE_MS = 5 * 60 * 1000;
export const GOFER_TASK_TIERS: readonly GoferTaskTier[] = [
  'mechanical',
  'simple',
  'medium',
  'hard',
  'arbiter',
  'highThroughputCoding',
];

const TIER_PURPOSES: Record<GoferTaskTier, string> = {
  mechanical: 'locate, classify, extract, summarize, and transform text',
  simple: 'focused low-risk coding, routine edits, and test fixes',
  medium: 'normal planning, implementation, research synthesis, and validation',
  hard: 'hard debugging, security, architecture, and release-critical review',
  arbiter: 'independent arbitration of contradictory or release-critical findings',
  highThroughputCoding: 'high-throughput coding only after capability and cost checks',
};

function nativeRoute(tier: GoferTaskTier): ModelRoute {
  return {
    model: '',
    selection: 'host-current',
    requiresQualification: tier === 'hard' || tier === 'arbiter',
    useFor: TIER_PURPOSES[tier],
  };
}

function nativeHostPolicy(): HostModelPolicy {
  return {
    mechanical: nativeRoute('mechanical'),
    simple: nativeRoute('simple'),
    medium: nativeRoute('medium'),
    hard: nativeRoute('hard'),
    arbiter: nativeRoute('arbiter'),
    highThroughputCoding: nativeRoute('highThroughputCoding'),
    note: 'Discover the exact current host, surface and authenticated account catalog before any explicit model choice.',
  };
}

export const DEFAULT_GOFER_MODEL_POLICY: GoferModelPolicy = {
  version: 1,
  // A shipped policy is not evidence that any host/account catalog was verified.
  lastVerified: '',
  profile: 'balanced',
  surfaces: {
    claude: nativeHostPolicy(),
    codex: nativeHostPolicy(),
    antigravity: nativeHostPolicy(),
    copilot: nativeHostPolicy(),
  },
};

export function getDefaultModelRoute(
  surface: GoferModelSurface,
  tier: GoferTaskTier,
  policy: GoferModelPolicy = DEFAULT_GOFER_MODEL_POLICY
): ModelRoute {
  if (String(surface) === 'gemini' || String(surface) === 'gemini-cli') {
    throw new Error('Gemini CLI is retired. Choose antigravity or antigravity-desktop explicitly.');
  }
  const policySurface = surface === 'antigravity-desktop' ? 'antigravity' : surface;
  if (policySurface === 'antigravity' && Object.hasOwn(policy.surfaces, 'gemini')) {
    throw new Error('Legacy Gemini CLI model policy requires explicit migration to antigravity.');
  }
  const hostPolicy = policy.surfaces[policySurface];
  const route = hostPolicy[tier] ?? (tier === 'arbiter' ? hostPolicy.hard : hostPolicy.medium);
  return {
    ...route,
    requiresQualification:
      tier === 'hard' || tier === 'arbiter' || route.requiresQualification === true,
  };
}

/** Opaque context identities, not credentials. Changing any field invalidates discovery/approval. */
export interface ModelCatalogContext {
  /**
   * Concrete client instance plus launch-profile identity, not just a provider name.
   * Must differ across CLI/desktop clients, executables and launch profiles, even
   * when the same provider/account is used (for example, desktop:profile-a).
   */
  hostId: string;
  surface: GoferModelSurface;
  authContextId: string;
  permissionContextId: string;
  costContextId: string;
}

export interface AdvertisedHostModel {
  id: string;
  available: boolean;
  reasoningEfforts?: readonly ModelReasoningEffort[];
  contextWindowTokens?: number;
  qualifications?: readonly {
    tier: GoferTaskTier;
    verified: boolean;
    evidence: string;
  }[];
}

/**
 * The caller must populate this from trusted, authenticated host/account discovery.
 * This pure resolver checks supplied evidence; it does not authenticate a provider.
 */
export interface HostModelCatalog extends ModelCatalogContext {
  verified: boolean;
  verificationSource: string;
  verifiedAtMs: number;
  expiresAtMs: number;
  models: readonly AdvertisedHostModel[];
}

/** Approval is for one exact choice, context and discovery snapshot, not a blanket escalation. */
export interface ModelSelectionAuthorization extends ModelCatalogContext {
  modelId: string;
  reasoningEffort?: ModelReasoningEffort;
  catalogVerifiedAtMs: number;
  permissionApproved: boolean;
  costApproved: boolean;
  evidence: string;
}

export interface ModelResolutionRequest {
  context: ModelCatalogContext;
  tier: GoferTaskTier;
  policy?: GoferModelPolicy;
  requestedModelId?: string;
  reasoningEffort?: ModelReasoningEffort;
  catalog?: HostModelCatalog;
  authorization?: ModelSelectionAuthorization;
  nowMs?: number;
}

export type ModelResolutionBlockReason =
  | 'retired_surface'
  | 'invalid_request'
  | 'invalid_policy'
  | 'invalid_preference'
  | 'model_required_for_reasoning_override'
  | 'catalog_required'
  | 'catalog_unverified'
  | 'catalog_context_mismatch'
  | 'catalog_invalid'
  | 'catalog_stale'
  | 'model_not_advertised'
  | 'model_unavailable'
  | 'reasoning_not_advertised'
  | 'selection_approval_required'
  | 'approval_context_mismatch'
  | 'approval_snapshot_mismatch';

export type ModelRouteResolution =
  | { status: 'native'; model: ''; selection: 'host-current'; qualification: 'not_required' }
  | {
      status: 'resolved';
      model: string;
      selection: 'verified-catalog';
      qualification: 'verified' | 'not_required';
      reasoningEffort?: ModelReasoningEffort;
      contextWindowTokens?: number;
    }
  | {
      status: 'requires_qualification';
      model: '';
      requiredTier: GoferTaskTier;
      requestedModelId?: string;
    }
  | { status: 'blocked'; model: ''; reason: ModelResolutionBlockReason };

const CONTEXT_FIELDS = [
  'hostId',
  'surface',
  'authContextId',
  'permissionContextId',
  'costContextId',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIdentity(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
  );
}

function sameContext(value: unknown, context: ModelCatalogContext): boolean {
  return isRecord(value) && CONTEXT_FIELDS.every((key) => value[key] === context[key]);
}

function blocked(reason: ModelResolutionBlockReason): ModelRouteResolution {
  return { status: 'blocked', model: '', reason };
}

export function resolveModelRoute(request: ModelResolutionRequest): ModelRouteResolution {
  if (
    isRecord(request) &&
    isRecord(request.context) &&
    ['gemini', 'gemini-cli'].includes(String(request.context.surface).trim().toLowerCase())
  )
    return blocked('retired_surface');
  if (
    !isRecord(request) ||
    !isRecord(request.context) ||
    !CONTEXT_FIELDS.every((key) => isIdentity(request.context[key])) ||
    (request.context.surface !== 'antigravity-desktop' &&
      !Object.prototype.hasOwnProperty.call(
        DEFAULT_GOFER_MODEL_POLICY.surfaces,
        request.context.surface
      )) ||
    !GOFER_TASK_TIERS.includes(request.tier) ||
    (request.reasoningEffort !== undefined && !isIdentity(request.reasoningEffort))
  ) {
    return blocked('invalid_request');
  }
  const nowMs = request.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs)) return blocked('invalid_request');

  let route: ModelRoute;
  try {
    route = getDefaultModelRoute(request.context.surface, request.tier, request.policy);
  } catch {
    return blocked('invalid_policy');
  }
  if (
    typeof route.model !== 'string' ||
    (route.reasoningEffort !== undefined && !isIdentity(route.reasoningEffort)) ||
    (route.selection !== undefined &&
      !['host-current', 'verified-catalog'].includes(route.selection))
  ) {
    return blocked('invalid_policy');
  }

  // Non-empty legacy IDs/aliases are preferences, never proof of availability or strength.
  const preference = request.requestedModelId ?? (route.model || route.claudeCodeAlias || '');
  const reasoningEffort = request.reasoningEffort ?? route.reasoningEffort;
  if (preference === '' && request.requestedModelId === undefined) {
    if (route.selection === 'verified-catalog') return blocked('invalid_preference');
    if (reasoningEffort !== undefined) return blocked('model_required_for_reasoning_override');
    if (route.requiresQualification) {
      return { status: 'requires_qualification', model: '', requiredTier: request.tier };
    }
    return {
      status: 'native',
      model: '',
      selection: 'host-current',
      qualification: 'not_required',
    };
  }
  if (!isIdentity(preference)) return blocked('invalid_preference');

  const catalog = request.catalog;
  if (!catalog) return blocked('catalog_required');
  if (catalog.verified !== true || !isIdentity(catalog.verificationSource)) {
    return blocked('catalog_unverified');
  }
  if (!sameContext(catalog, request.context)) return blocked('catalog_context_mismatch');
  if (
    !Number.isFinite(catalog.verifiedAtMs) ||
    !Number.isFinite(catalog.expiresAtMs) ||
    catalog.expiresAtMs <= catalog.verifiedAtMs ||
    !Array.isArray(catalog.models) ||
    catalog.models.some(
      (model) => !isRecord(model) || !isIdentity(model.id) || typeof model.available !== 'boolean'
    ) ||
    new Set(catalog.models.map((model) => model.id)).size !== catalog.models.length
  ) {
    return blocked('catalog_invalid');
  }
  if (
    catalog.verifiedAtMs > nowMs ||
    catalog.expiresAtMs <= nowMs ||
    nowMs - catalog.verifiedAtMs > MAX_MODEL_CATALOG_AGE_MS
  ) {
    return blocked('catalog_stale');
  }

  // Exact lookup only: do not infer capability, currency, availability or cost from an ID.
  const selected = catalog.models.find((model) => model.id === preference);
  if (!selected) return blocked('model_not_advertised');
  if (!selected.available) return blocked('model_unavailable');
  if (
    reasoningEffort !== undefined &&
    (!Array.isArray(selected.reasoningEfforts) ||
      !selected.reasoningEfforts.includes(reasoningEffort))
  ) {
    return blocked('reasoning_not_advertised');
  }
  if (
    selected.contextWindowTokens !== undefined &&
    (!Number.isSafeInteger(selected.contextWindowTokens) || selected.contextWindowTokens <= 0)
  ) {
    return blocked('catalog_invalid');
  }

  const approval = request.authorization;
  if (
    !isRecord(approval) ||
    approval.permissionApproved !== true ||
    approval.costApproved !== true ||
    !isIdentity(approval.evidence) ||
    approval.modelId !== selected.id ||
    approval.reasoningEffort !== reasoningEffort
  ) {
    return blocked('selection_approval_required');
  }
  if (!sameContext(approval, request.context)) return blocked('approval_context_mismatch');
  if (approval.catalogVerifiedAtMs !== catalog.verifiedAtMs) {
    return blocked('approval_snapshot_mismatch');
  }
  if (
    route.requiresQualification &&
    (!Array.isArray(selected.qualifications) ||
      !selected.qualifications.some(
        (qualification: unknown) =>
          isRecord(qualification) &&
          qualification.tier === request.tier &&
          qualification.verified === true &&
          isIdentity(qualification.evidence)
      ))
  ) {
    return {
      status: 'requires_qualification',
      model: '',
      requiredTier: request.tier,
      requestedModelId: selected.id,
    };
  }

  return {
    status: 'resolved',
    model: selected.id,
    selection: 'verified-catalog',
    qualification: route.requiresQualification ? 'verified' : 'not_required',
    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
    ...(selected.contextWindowTokens !== undefined
      ? { contextWindowTokens: selected.contextWindowTokens }
      : {}),
  };
}
