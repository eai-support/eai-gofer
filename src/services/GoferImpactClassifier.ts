import type { RepositoryAtlas } from './RepositoryAtlas.js';

export const GOFER_EXECUTION_PROFILES = ['fast', 'standard', 'full', 'dynamic'] as const;

/** Exactly one mutually-exclusive runtime depth selected for a Gofer run. */
export type GoferExecutionProfile = (typeof GOFER_EXECUTION_PROFILES)[number];

/** Backward-compatible alias for callers that still use the older depth name. */
export type GoferExecutionDepth = GoferExecutionProfile;

export type GoferRiskLabel =
  | 'docs-only'
  | 'single-repo-code'
  | 'cross-repo'
  | 'api-contract'
  | 'auth-security'
  | 'data-model'
  | 'infra-config'
  | 'release-critical'
  | 'broad-fanout'
  | 'unknown-blast-radius'
  | 'unknown';

export type GoferExecutionProfileOverrideStatus =
  'none' | 'deeper-accepted' | 'shallower-requires-approval' | 'shallower-approved';

export interface GoferExecutionProfileOptions {
  requestedProfile?: GoferExecutionProfile | null;
  approveRiskyDownshift?: boolean;
}

export interface GoferExecutionProfileDecision {
  classificationVersion: 1;
  requestedProfile: GoferExecutionProfile | null;
  profileFloor: GoferExecutionProfile;
  effectiveProfile: GoferExecutionProfile;
  riskLabels: GoferRiskLabel[];
  overrideStatus: GoferExecutionProfileOverrideStatus;
  requiresConfirmation: boolean;
  classificationReason: string;
}

export interface GoferImpactClassification {
  depth: GoferExecutionDepth;
  recommendedExecutionProfile: GoferExecutionProfile;
  profileFloor: GoferExecutionProfile;
  effectiveProfile: GoferExecutionProfile;
  executionProfileDecision: GoferExecutionProfileDecision;
  confidence: 'low' | 'medium' | 'high';
  labels: GoferRiskLabel[];
  rationale: string[];
  recommendedArtifacts: string[];
}

const GOFER_RISK_LABELS: readonly GoferRiskLabel[] = [
  'docs-only',
  'single-repo-code',
  'cross-repo',
  'api-contract',
  'auth-security',
  'data-model',
  'infra-config',
  'release-critical',
  'broad-fanout',
  'unknown-blast-radius',
  'unknown',
];

const EXECUTION_PROFILE_RANK: Record<GoferExecutionProfile, number> = {
  fast: 0,
  standard: 1,
  full: 2,
  dynamic: 3,
};

const FULL_RISK_LABELS: readonly GoferRiskLabel[] = [
  'cross-repo',
  'api-contract',
  'auth-security',
  'data-model',
  'infra-config',
  'release-critical',
];

const DYNAMIC_RISK_LABELS: readonly GoferRiskLabel[] = ['broad-fanout', 'unknown-blast-radius'];

const LABEL_RULES: Array<[GoferRiskLabel, RegExp]> = [
  ['docs-only', /\b(readme|docs?|documentation|copy|markdown|typo|changelog)\b/i],
  [
    'broad-fanout',
    /\b(workspace-wide|whole workspace|every repo|all repos|audit every repo|broad fan-?out|fan-?out|shard|sweep|mass migration)\b/i,
  ],
  [
    'unknown-blast-radius',
    /\b(unknown blast radius|unclear blast radius|unbounded blast radius)\b/i,
  ],
  ['cross-repo', /\b(cross-repo|multi-repo|multiple repos|across repos|shared package)\b/i],
  [
    'api-contract',
    /\b(api|endpoint|route|contract|schema|request|response|webhook|graphql|openapi)\b/i,
  ],
  [
    'auth-security',
    /\b(auth|login|permission|role|security|token|session|secret|tenant|policy)\b/i,
  ],
  ['data-model', /\b(database|migration|model|entity|table|collection|field|schema|seed)\b/i],
  ['infra-config', /\b(infra|terraform|bicep|cloud|deploy|pipeline|ci|cd|config|environment)\b/i],
  ['release-critical', /\b(release|rollback|flag|migration|backward compatible|breaking)\b/i],
  ['single-repo-code', /\b(component|function|class|service|helper|bug|feature|implementation)\b/i],
];

function isExecutionProfile(value: unknown): value is GoferExecutionProfile {
  return (
    typeof value === 'string' && GOFER_EXECUTION_PROFILES.includes(value as GoferExecutionProfile)
  );
}

function isRiskLabel(value: unknown): value is GoferRiskLabel {
  return typeof value === 'string' && GOFER_RISK_LABELS.includes(value as GoferRiskLabel);
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function isBoundedLowRiskPrompt(prompt: string): boolean {
  return includesAny(prompt.toLowerCase(), [
    'bounded local',
    'local helper',
    'helper utility',
    'small utility',
    'low-risk',
    'low risk',
  ]);
}

function hasExplicitDynamicProfileRequest(prompt: string): boolean {
  return includesAny(prompt.toLowerCase(), [
    'dynamic workflow',
    'dynamic execution',
    'dynamic profile',
    'dynamic mode',
    'use dynamic',
  ]);
}

function recommendExecutionProfile(
  labels: ReadonlySet<GoferRiskLabel>,
  prompt: string
): GoferExecutionProfile {
  if (
    [...labels].some((label) => DYNAMIC_RISK_LABELS.includes(label)) ||
    hasExplicitDynamicProfileRequest(prompt)
  ) {
    return 'dynamic';
  }

  if (labels.size === 1 && labels.has('docs-only')) {
    return 'fast';
  }

  if ([...labels].some((label) => FULL_RISK_LABELS.includes(label))) {
    return 'full';
  }

  if (labels.has('single-repo-code') && isBoundedLowRiskPrompt(prompt)) {
    return 'fast';
  }

  return 'standard';
}

function buildClassificationReason(
  profileFloor: GoferExecutionProfile,
  effectiveProfile: GoferExecutionProfile,
  labels: readonly GoferRiskLabel[],
  overrideStatus: GoferExecutionProfileOverrideStatus
): string {
  const riskSummary = labels.length > 0 ? labels.join(', ') : 'no explicit risk labels';

  if (overrideStatus === 'deeper-accepted') {
    return `Requested deeper profile ${effectiveProfile} is accepted above floor ${profileFloor}; risks: ${riskSummary}.`;
  }

  if (overrideStatus === 'shallower-requires-approval') {
    return `Requested shallower profile is blocked until approved; floor ${profileFloor} remains effective for risks: ${riskSummary}.`;
  }

  if (overrideStatus === 'shallower-approved') {
    return `Approved shallower profile ${effectiveProfile} is effective below floor ${profileFloor}; risks: ${riskSummary}.`;
  }

  return `Effective profile ${effectiveProfile} matches the classifier floor for risks: ${riskSummary}.`;
}

function resolveExecutionProfileDecision(
  labels: ReadonlySet<GoferRiskLabel>,
  prompt: string,
  options: GoferExecutionProfileOptions
): GoferExecutionProfileDecision {
  const labelList = [...labels];
  const requestedProfile = isExecutionProfile(options.requestedProfile)
    ? options.requestedProfile
    : null;
  const profileFloor = recommendExecutionProfile(labels, prompt);
  let effectiveProfile = profileFloor;
  let overrideStatus: GoferExecutionProfileOverrideStatus = 'none';

  if (requestedProfile) {
    const requestedRank = EXECUTION_PROFILE_RANK[requestedProfile];
    const floorRank = EXECUTION_PROFILE_RANK[profileFloor];

    if (requestedRank > floorRank) {
      effectiveProfile = requestedProfile;
      overrideStatus = 'deeper-accepted';
    } else if (requestedRank < floorRank) {
      if (options.approveRiskyDownshift) {
        effectiveProfile = requestedProfile;
        overrideStatus = 'shallower-approved';
      } else {
        effectiveProfile = profileFloor;
        overrideStatus = 'shallower-requires-approval';
      }
    }
  }

  const classifierSelectedDynamic = profileFloor === 'dynamic' && effectiveProfile === 'dynamic';
  const requiresConfirmation =
    overrideStatus === 'shallower-requires-approval' ||
    (classifierSelectedDynamic &&
      requestedProfile !== 'dynamic' &&
      !hasExplicitDynamicProfileRequest(prompt));

  return {
    classificationVersion: 1,
    requestedProfile,
    profileFloor,
    effectiveProfile,
    riskLabels: labelList,
    overrideStatus,
    requiresConfirmation,
    classificationReason: buildClassificationReason(
      profileFloor,
      effectiveProfile,
      labelList,
      overrideStatus
    ),
  };
}

function quoteYamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function formatGoferExecutionProfileFrontmatter(
  decision: GoferExecutionProfileDecision
): string {
  const riskLabels =
    decision.riskLabels.length > 0
      ? decision.riskLabels.map((label) => `  - ${label}`).join('\n')
      : '  []';

  return [
    '---',
    `classificationVersion: ${decision.classificationVersion}`,
    `requestedProfile: ${decision.requestedProfile ?? 'null'}`,
    `profileFloor: ${decision.profileFloor}`,
    `effectiveProfile: ${decision.effectiveProfile}`,
    'riskLabels:',
    riskLabels,
    `overrideStatus: ${decision.overrideStatus}`,
    `requiresConfirmation: ${decision.requiresConfirmation}`,
    `classificationReason: ${quoteYamlString(decision.classificationReason)}`,
    '---',
  ].join('\n');
}

export function validateGoferExecutionProfileContract(value: unknown): string[] {
  const errors: string[] = [];

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['execution profile contract must be an object.'];
  }

  const contract = value as Record<string, unknown>;

  if (contract.classificationVersion !== 1) {
    errors.push('classificationVersion must be 1.');
  }

  if (
    contract.requestedProfile !== undefined &&
    contract.requestedProfile !== null &&
    !isExecutionProfile(contract.requestedProfile)
  ) {
    errors.push('requestedProfile must be null or one execution profile.');
  }

  if (!isExecutionProfile(contract.profileFloor)) {
    errors.push('profileFloor must be exactly one execution profile.');
  }

  if (!isExecutionProfile(contract.effectiveProfile)) {
    errors.push('effectiveProfile must be exactly one execution profile.');
  }

  if (!Array.isArray(contract.riskLabels) || !contract.riskLabels.every(isRiskLabel)) {
    errors.push('riskLabels must be an array of known risk labels.');
  }

  if (
    !['none', 'deeper-accepted', 'shallower-requires-approval', 'shallower-approved'].includes(
      String(contract.overrideStatus)
    )
  ) {
    errors.push('overrideStatus must be a known override status.');
  }

  if (typeof contract.requiresConfirmation !== 'boolean') {
    errors.push('requiresConfirmation must be boolean.');
  }

  if (
    typeof contract.classificationReason !== 'string' ||
    contract.classificationReason.trim().length === 0
  ) {
    errors.push('classificationReason must be a non-empty string.');
  }

  return errors;
}

export function classifyGoferImpact(
  featurePrompt: string,
  atlas?: Pick<RepositoryAtlas, 'languages' | 'frameworks' | 'testCommands'>,
  options: GoferExecutionProfileOptions = {}
): GoferImpactClassification {
  const prompt = featurePrompt.trim();
  const labels = new Set<GoferRiskLabel>();
  const rationale: string[] = [];

  for (const [label, pattern] of LABEL_RULES) {
    if (pattern.test(prompt)) {
      labels.add(label);
      rationale.push(`Prompt matched ${label} indicators.`);
    }
  }

  if (!labels.size) {
    labels.add('unknown');
    rationale.push('No strong repository surface indicators were found.');
  }

  if (labels.has('docs-only') && labels.size > 1) {
    labels.delete('docs-only');
  }

  const executionProfileDecision = resolveExecutionProfileDecision(labels, prompt, options);
  const depth = executionProfileDecision.effectiveProfile;
  rationale.push(executionProfileDecision.classificationReason);

  const recommendedArtifacts = ['research.md', 'proposal-review.md', 'spec.md'];
  if (depth !== 'fast') {
    recommendedArtifacts.push('plan.md', 'tasks.md', 'traceability.md');
  }
  if (depth === 'full' || depth === 'dynamic') {
    recommendedArtifacts.push('blast-radius-report.md', 'validation-report.md');
  }
  if (depth === 'dynamic') {
    recommendedArtifacts.push('workflow-dag.md');
  }
  if (atlas?.testCommands?.length) {
    recommendedArtifacts.push('test-evidence.md');
  }

  return {
    depth,
    recommendedExecutionProfile: executionProfileDecision.profileFloor,
    profileFloor: executionProfileDecision.profileFloor,
    effectiveProfile: executionProfileDecision.effectiveProfile,
    executionProfileDecision,
    confidence: labels.has('unknown') ? 'low' : labels.size > 1 ? 'medium' : 'high',
    labels: [...labels],
    rationale,
    recommendedArtifacts,
  };
}
