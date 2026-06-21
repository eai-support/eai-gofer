import * as fs from 'fs/promises';
import * as path from 'path';
import { validateEventPayload } from '../contracts/EventPayloadSchemas';
import { validateInternalApiPayload } from '../contracts/InternalApiSchemas';
import { type WorkflowProfile } from '../models/Workflow';
import { validateSecretSafety } from '../validation/SecretSafetyValidator';

export interface StakeholderCommsInputArtifacts {
  discovery: string;
  spec: string;
  plan: string;
  implementationSummary: string;
}

export interface GenerateStakeholderArtifactsRequest {
  runId: string;
  workflowProfile: WorkflowProfile;
  enableMarpDeck: boolean;
  inputArtifacts: StakeholderCommsInputArtifacts;
  enablePersonaDecks?: boolean;
  personaDecks?: readonly StakeholderPersona[];
  releaseNotesPath?: string;
  demoScriptPath?: string;
  marpDeckPath?: string;
}

export const STAKEHOLDER_PERSONAS = [
  'executive',
  'business',
  'internal-delivery',
  'enterprise-architecture',
  'ciso',
  'data-architecture',
  'cio',
  'cfo',
  'coo',
  'risk-compliance',
] as const;

export type StakeholderPersona = (typeof STAKEHOLDER_PERSONAS)[number];

export interface PersonaDeckRecord {
  persona: StakeholderPersona;
  path: string;
}

export interface GenerateStakeholderArtifactsResponse {
  status: 'completed';
  releaseNotesPath: string;
  demoScriptPath: string;
  marpDeckPath: string;
  marpEnabled: boolean;
  marpDeckGenerated: boolean;
  marpRecommendedByDefault: boolean;
  personaDeckPaths?: readonly PersonaDeckRecord[];
}

export interface StakeholderCommsGeneratedEventPayload {
  eventId: string;
  runId: string;
  releaseNotesPath: string;
  demoScriptPath: string;
  marpDeckPath: string;
  marpEnabled: boolean;
  personaDeckPaths?: readonly string[];
  personaDeckPersonas?: readonly string[];
}

export interface GenerateStakeholderArtifactsEvent {
  contractId: 'EVT-007';
  eventName: 'artifacts.stakeholder-comms.generated.v1';
  payload: StakeholderCommsGeneratedEventPayload;
}

export interface GenerateStakeholderArtifactsResult {
  contractId: 'IAP-007';
  operationName: 'comms.generateStakeholderArtifacts';
  response: GenerateStakeholderArtifactsResponse;
  emittedEvent: GenerateStakeholderArtifactsEvent;
}

export interface GenerateStakeholderArtifactsOptions {
  eventId?: string;
  generatedAt?: string;
  workspaceRoot?: string;
  eventPublisher?: (payload: StakeholderCommsGeneratedEventPayload) => void;
}

interface ResolvedWorkspacePath {
  absolutePath: string;
  reportPath: string;
}

interface LoadedInputArtifacts {
  discovery: string;
  spec: string;
  plan: string;
  implementationSummary: string;
}

interface StakeholderSections {
  problemStatement: string;
  solutionOverview: string;
  aiAugmentedJourney?: string;
  architectureReference: string;
  demoSummary: string;
  successMetrics: string;
}

interface PersonaDeckProfile {
  label: string;
  title: string;
  decisionFocus: string;
  primaryDecision: string;
  diagram: readonly string[];
  valueRows: readonly (readonly [string, string, string])[];
  requiredControls: readonly string[];
}

const REQUIRED_SECTION_TITLES: readonly string[] = [
  'Problem Statement',
  'EnterpriseAI Solution Overview',
  'Architecture Diagram Reference',
  'Demo Script Summary',
  'Success Metrics',
];

const DEFAULT_SUCCESS_METRIC_LINES: readonly string[] = [
  'Deployment readiness gate passes (runtime contract and smoke evidence), parity',
  'checks pass, and stakeholder demo completes within 5 minutes.',
];

const DEFAULT_DEMO_SUCCESS_METRIC_LINES: readonly string[] = [
  'Deployment readiness gate passes (runtime contract and smoke evidence),',
  'parity checks pass, and stakeholder demo completes within 5 minutes.',
];

const PERSONA_DECK_PROFILES: Readonly<Record<StakeholderPersona, PersonaDeckProfile>> = {
  executive: {
    label: 'Executive Committee',
    title: 'Executive Committee EnterpriseAI Readout',
    decisionFocus: 'Portfolio value, strategic fit, funding, and executive risk appetite.',
    primaryDecision:
      'Approve the vertical outcome, sponsor, value target, and next investment gate.',
    diagram: [
      'flowchart LR',
      '  Need["Business need"] --> Vertical["EnterpriseAI vertical"]',
      '  Vertical --> Outcome["Measurable outcome"]',
      '  Vertical --> Governance["Decision gates"]',
      '  Outcome --> Value["Enterprise value"]',
      '  Governance --> Risk["Managed risk"]',
    ],
    valueRows: [
      ['Value case', 'Business outcome, time-to-value, adoption target', 'Fund / hold / stop'],
      [
        'Enterprise fit',
        'Alignment to platform patterns and reuse',
        'Sponsor cross-functional support',
      ],
      [
        'Risk posture',
        'Residual risk after controls and validation',
        'Accept or require mitigation',
      ],
    ],
    requiredControls: [
      'Named executive sponsor and value owner',
      'Stage gate for scope, funding, risk, and launch readiness',
      'Audit trail showing why build, reuse, or extend was chosen',
    ],
  },
  business: {
    label: 'Business Owner',
    title: 'Business Owner EnterpriseAI Readout',
    decisionFocus: 'User journey, operational change, adoption, and measurable business value.',
    primaryDecision: 'Confirm the target process, user groups, rollout plan, and success measures.',
    diagram: [
      'journey',
      '  title Business journey',
      '  section Current state',
      '    Manual handoff: 2: User',
      '    Rework loop: 2: Operations',
      '  section EnterpriseAI state',
      '    Guided intake: 5: User',
      '    Governed outcome: 5: Business',
    ],
    valueRows: [
      ['User impact', 'Before/after journey and training impact', 'Approve change plan'],
      ['Operational value', 'Cycle time, quality, and cost target', 'Confirm metric owner'],
      ['Adoption path', 'Pilot cohort, communications, support model', 'Approve launch path'],
    ],
    requiredControls: [
      'Business process owner named for each workflow',
      'Change, training, and support plan attached to launch gate',
      'Success metric baseline captured before implementation',
    ],
  },
  'internal-delivery': {
    label: 'Internal Delivery',
    title: 'Internal Delivery EnterpriseAI Readout',
    decisionFocus:
      'Delivery sequencing, dependencies, implementation risk, and validation readiness.',
    primaryDecision:
      'Commit the delivery plan, dependency order, owners, and test-first validation loop.',
    diagram: [
      'flowchart TD',
      '  Spec["Approved spec"] --> Tests["Failing tests from contract"]',
      '  Tests --> Build["Implementation"]',
      '  Build --> Validate["Validation rubric"]',
      '  Validate --> Fix["Finding fixes"]',
      '  Fix --> Validate',
      '  Validate --> Release["Stakeholder release pack"]',
    ],
    valueRows: [
      ['Plan clarity', 'Dependency-ordered tasks and owners', 'Commit sprint or phase plan'],
      ['Quality loop', 'Red/green tests before implementation', 'Approve readiness gate'],
      ['Delivery risk', 'Open blockers and mitigation owners', 'Escalate or accept'],
    ],
    requiredControls: [
      'Spec-derived tests fail before implementation and pass after',
      'Persistent finding IDs retained through review cycles',
      'Task ownership and rollback plan documented before release',
    ],
  },
  'enterprise-architecture': {
    label: 'Enterprise Architecture',
    title: 'Enterprise Architecture EnterpriseAI Readout',
    decisionFocus:
      'Platform fit, integration boundaries, contracts, reuse, and long-term maintainability.',
    primaryDecision:
      'Approve architecture, contract pack, reuse choice, and platform boundary assumptions.',
    diagram: [
      'flowchart LR',
      '  Users["User journeys"] --> App["Vertical app"]',
      '  App --> API["ResourceAPI / services"]',
      '  API --> Objects["Object types"]',
      '  API --> Events["Events / integrations"]',
      '  App --> Controls["Tenant and policy controls"]',
      '  Controls --> Platform["EnterpriseAI platform"]',
    ],
    valueRows: [
      ['Reuse decision', 'Reuse, extend, or create-new rationale', 'Approve architecture decision'],
      ['Contract pack', 'Actors, objects, APIs, events, tests', 'Approve interface boundary'],
      ['Platform posture', 'Tenant, deployment, runtime assumptions', 'Approve target pattern'],
    ],
    requiredControls: [
      'Context bundle includes relevant existing specs and APIs',
      'Lightweight contract pack is complete before build starts',
      'Architecture decision record links to reuse-before-create scan',
    ],
  },
  ciso: {
    label: 'CISO',
    title: 'CISO EnterpriseAI Readout',
    decisionFocus:
      'Identity, tenant boundary, data protection, control evidence, and residual risk.',
    primaryDecision:
      'Accept the control set, security validation evidence, and launch risk posture.',
    diagram: [
      'flowchart LR',
      '  Identity["Entra / identity"] --> App["Vertical app"]',
      '  App --> Policy["Policy enforcement"]',
      '  Policy --> Tenant["Tenant boundary"]',
      '  Tenant --> Data["Protected data"]',
      '  App --> Audit["Audit evidence"]',
      '  Audit --> Risk["Risk acceptance"]',
    ],
    valueRows: [
      ['Identity and access', 'Actors, permissions, tenant boundary', 'Approve control model'],
      ['Data protection', 'Classification, retention, logging, privacy', 'Accept residual risk'],
      ['Evidence', 'Validation report, audit history, recurring findings', 'Approve launch gate'],
    ],
    requiredControls: [
      'Threat model and abuse cases attached to validation',
      'Recurring findings escalate until remediated or accepted',
      'No credentials or sensitive configuration values in generated artifacts',
    ],
  },
  'data-architecture': {
    label: 'Data Architecture',
    title: 'Data Architecture EnterpriseAI Readout',
    decisionFocus: 'Data model, lineage, governance, quality, and analytical readiness.',
    primaryDecision:
      'Approve object types, data flows, lineage, quality checks, and stewardship model.',
    diagram: [
      'flowchart LR',
      '  Source["Source systems"] --> Ingest["EnterpriseAI ingest"]',
      '  Ingest --> Objects["Object types"]',
      '  Objects --> Workflows["Workflows"]',
      '  Objects --> Analytics["Analytics / reporting"]',
      '  Objects --> Lineage["Lineage and stewardship"]',
    ],
    valueRows: [
      ['Object model', 'Canonical object types and ownership', 'Approve data design'],
      ['Lineage', 'Source, transform, retention, reporting path', 'Approve governance evidence'],
      ['Quality', 'Validation rules, reconciliation, monitoring', 'Approve quality gate'],
    ],
    requiredControls: [
      'Object type reuse scan completed before new type creation',
      'Data lineage, classification, and retention captured in contract pack',
      'Quality checks included in acceptance tests and validation report',
    ],
  },
  cio: {
    label: 'CIO',
    title: 'CIO EnterpriseAI Readout',
    decisionFocus: 'Technology strategy, delivery confidence, platform reuse, and operating model.',
    primaryDecision:
      'Approve platform alignment, delivery readiness, operating model, and adoption path.',
    diagram: [
      'flowchart LR',
      '  Strategy["Technology strategy"] --> Platform["EnterpriseAI platform"]',
      '  Platform --> Vertical["Reusable vertical"]',
      '  Vertical --> Ops["Operating model"]',
      '  Ops --> Metrics["Run and value metrics"]',
      '  Platform --> Roadmap["Future verticals"]',
    ],
    valueRows: [
      ['Strategic alignment', 'Platform reuse and capability roadmap', 'Approve roadmap fit'],
      [
        'Delivery confidence',
        'Tasks, tests, validation, and release pack',
        'Approve launch readiness',
      ],
      ['Run model', 'Support, observability, ownership, costs', 'Approve operating model'],
    ],
    requiredControls: [
      'Platform standards and extension points are documented',
      'Reusable context bundle supports future vertical teams',
      'Runbook and operating ownership are approved before launch',
    ],
  },
  cfo: {
    label: 'CFO',
    title: 'CFO EnterpriseAI Readout',
    decisionFocus: 'Investment case, value realization, delivery cost, and measurable benefits.',
    primaryDecision:
      'Approve funding, benefit tracking, value owner, and financial risk treatment.',
    diagram: [
      'flowchart LR',
      '  Investment["Investment"] --> Build["EnterpriseAI build"]',
      '  Build --> Adoption["Adoption"]',
      '  Adoption --> Benefit["Measured benefit"]',
      '  Benefit --> Reinvest["Scale or reinvest"]',
      '  Build --> Controls["Cost and risk controls"]',
    ],
    valueRows: [
      ['Investment', 'Build, run, and change cost estimate', 'Approve funding'],
      ['Benefits', 'Baseline, target, owner, review cadence', 'Approve value tracking'],
      ['Risk cost', 'Residual risk and mitigation cost', 'Accept or require mitigation'],
    ],
    requiredControls: [
      'Baseline and target financial metrics captured before launch',
      'Benefit owner signs off on measurement method',
      'Reuse-before-create decision includes cost implication',
    ],
  },
  coo: {
    label: 'COO',
    title: 'COO EnterpriseAI Readout',
    decisionFocus: 'Process impact, operational readiness, service adoption, and support model.',
    primaryDecision:
      'Approve operational change, rollout sequencing, support readiness, and handover.',
    diagram: [
      'flowchart TD',
      '  Process["Target process"] --> Pilot["Pilot cohort"]',
      '  Pilot --> Feedback["Feedback loop"]',
      '  Feedback --> Scale["Scale rollout"]',
      '  Scale --> Run["Run operations"]',
      '  Run --> Improve["Continuous improvement"]',
    ],
    valueRows: [
      [
        'Operational impact',
        'Changed steps, teams, handoffs, exceptions',
        'Approve process change',
      ],
      ['Readiness', 'Training, support, runbook, monitoring', 'Approve go-live'],
      ['Performance', 'SLA, throughput, quality, escalation path', 'Approve run targets'],
    ],
    requiredControls: [
      'Operational runbook and support model are release blockers',
      'Exception paths are defined before rollout',
      'Adoption and support metrics reviewed during first 30 days',
    ],
  },
  'risk-compliance': {
    label: 'Risk and Compliance',
    title: 'Risk and Compliance EnterpriseAI Readout',
    decisionFocus: 'Policy obligations, evidence, auditability, exceptions, and residual risk.',
    primaryDecision:
      'Approve obligation coverage, evidence pack, exception handling, and audit trail.',
    diagram: [
      'flowchart LR',
      '  Obligations["Policy obligations"] --> Controls["Controls"]',
      '  Controls --> Evidence["Evidence pack"]',
      '  Evidence --> Audit["Audit history"]',
      '  Audit --> Exceptions["Exceptions"]',
      '  Exceptions --> Decision["Risk decision"]',
    ],
    valueRows: [
      ['Obligations', 'Relevant policies, controls, and owners', 'Approve compliance mapping'],
      ['Evidence', 'Validation artifacts and persistent finding IDs', 'Approve evidence pack'],
      ['Exceptions', 'Open issues, compensating controls, expiry', 'Approve risk treatment'],
    ],
    requiredControls: [
      'Audit history records every recurring finding and disposition',
      'Compliance obligations are mapped to acceptance tests',
      'Exceptions include owner, expiry, and review cadence',
    ],
  },
};

function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

function buildEventId(prefix: string, isoTimestamp: string): string {
  return `${prefix}_${isoTimestamp.replace(/[-:.TZ]/g, '')}`;
}

function normalizePathForOutput(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

function isPathOverrideProvided(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveMarpEnabled(workflowProfile: WorkflowProfile, enableMarpDeck: boolean): boolean {
  return workflowProfile === 'enterpriseai' && enableMarpDeck;
}

function isMarpRecommendedByDefault(workflowProfile: WorkflowProfile): boolean {
  return workflowProfile === 'enterpriseai';
}

function isStakeholderPersona(value: string): value is StakeholderPersona {
  return (STAKEHOLDER_PERSONAS as readonly string[]).includes(value);
}

function resolvePersonaDecks(
  request: GenerateStakeholderArtifactsRequest,
  marpEnabled: boolean
): readonly StakeholderPersona[] {
  if (!marpEnabled || request.enablePersonaDecks === false) {
    return [];
  }

  if (!request.personaDecks || request.personaDecks.length === 0) {
    return STAKEHOLDER_PERSONAS;
  }

  const normalized = request.personaDecks.filter((persona: StakeholderPersona): boolean =>
    isStakeholderPersona(persona)
  );
  return Array.from(new Set(normalized));
}

function isWithinWorkspace(resolvedWorkspaceRoot: string, absolutePath: string): boolean {
  const relativePath = path.relative(resolvedWorkspaceRoot, absolutePath);
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function resolveWorkspacePath(
  workspaceRoot: string,
  filePath: string,
  label: string
): ResolvedWorkspacePath {
  const trimmedPath = filePath.trim();
  if (!trimmedPath) {
    throw new Error(`COMMS_INPUT_ARTIFACT_MISSING: ${label} path must be provided.`);
  }

  const normalizedInput = trimmedPath.replace(/\\/g, '/');
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const absolutePath = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(resolvedWorkspaceRoot, normalizedInput);

  if (!isWithinWorkspace(resolvedWorkspaceRoot, absolutePath)) {
    throw new Error(
      `COMMS_INPUT_ARTIFACT_MISSING: ${label} path must resolve within workspace root (${normalizedInput}).`
    );
  }

  const relativePath = normalizePathForOutput(path.relative(resolvedWorkspaceRoot, absolutePath));
  return {
    absolutePath,
    reportPath: relativePath,
  };
}

function isNodeErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isMappedCommsError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  return /^(COMMS_INPUT_ARTIFACT_MISSING|COMMS_MARP_TEMPLATE_INVALID|COMMS_OUTPUT_WRITE_FAILED):/.test(
    error.message
  );
}

async function readInputArtifact(pathInfo: ResolvedWorkspacePath, label: string): Promise<string> {
  try {
    const content = await fs.readFile(pathInfo.absolutePath, 'utf8');
    if (!content.trim()) {
      throw new Error(
        `COMMS_INPUT_ARTIFACT_MISSING: ${label} artifact is empty at ${normalizePathForOutput(pathInfo.reportPath)}.`
      );
    }
    return content;
  } catch (error) {
    if (
      isNodeErrorWithCode(error) &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES')
    ) {
      throw new Error(
        `COMMS_INPUT_ARTIFACT_MISSING: ${label} artifact not readable at ${normalizePathForOutput(pathInfo.reportPath)}.`,
        { cause: error }
      );
    }

    if (isMappedCommsError(error)) {
      throw error;
    }

    if (error instanceof Error) {
      throw new Error(
        `COMMS_INPUT_ARTIFACT_MISSING: failed to read ${label} artifact (${error.message}).`,
        { cause: error }
      );
    }
    throw new Error(`COMMS_INPUT_ARTIFACT_MISSING: failed to read ${label} artifact.`, {
      cause: error,
    });
  }
}

function extractSummary(content: string, label: string): string {
  const summaryLines = content
    .split(/\r?\n/)
    .map((line: string): string => line.trim())
    .filter((line: string): boolean => line.length > 0 && !line.startsWith('#'))
    .slice(0, 3);

  if (summaryLines.length < 1) {
    throw new Error(
      `COMMS_INPUT_ARTIFACT_MISSING: ${label} artifact must include summary-ready content.`
    );
  }

  return summaryLines.join(' ');
}

function buildStakeholderSections(
  inputArtifacts: LoadedInputArtifacts,
  workflowProfile: WorkflowProfile
): StakeholderSections {
  const problemStatement = extractSummary(inputArtifacts.discovery, 'discovery');
  const solutionOverview = extractSummary(inputArtifacts.spec, 'spec');
  const architectureReference = extractSummary(inputArtifacts.plan, 'plan');
  const demoSummary = extractSummary(inputArtifacts.implementationSummary, 'implementationSummary');

  const sections: StakeholderSections = {
    problemStatement,
    solutionOverview,
    architectureReference,
    demoSummary,
    successMetrics: DEFAULT_SUCCESS_METRIC_LINES.join(' '),
  };
  if (workflowProfile === 'enterpriseai') {
    sections.aiAugmentedJourney =
      'App delivery uses a four-step-or-fewer AI-augmented journey: each step has a business goal, generative AI assistance, contextual data use, human controls, audit trail, and a completion signal. Non-app runs must carry the explicit classification rationale.';
  }
  return sections;
}

function buildAiJourneySection(
  sections: StakeholderSections,
  heading: string = '## AI-Augmented 4-Step Journey'
): readonly string[] {
  if (!sections.aiAugmentedJourney) {
    return [];
  }

  return [heading, sections.aiAugmentedJourney, ''];
}

function wrapDefaultSuccessMetric(successMetrics: string): readonly string[] {
  return successMetrics === DEFAULT_SUCCESS_METRIC_LINES.join(' ')
    ? DEFAULT_SUCCESS_METRIC_LINES
    : [successMetrics];
}

function buildReleaseNotesContent(
  runId: string,
  generatedAt: string,
  sections: StakeholderSections
): string {
  return [
    '# Release Notes',
    '',
    `- Run ID: ${runId}`,
    `- Generated At: ${generatedAt}`,
    '',
    '## Problem Statement',
    '',
    sections.problemStatement,
    '',
    '## EnterpriseAI Solution Overview',
    '',
    sections.solutionOverview,
    '',
    ...buildAiJourneySection(sections),
    '## Architecture Diagram Reference',
    '',
    sections.architectureReference,
    '',
    '## Demo Script Summary',
    '',
    sections.demoSummary,
    '',
    '## Success Metrics',
    '',
    ...wrapDefaultSuccessMetric(sections.successMetrics),
    '',
  ].join('\n');
}

function buildDemoScriptContent(runId: string, sections: StakeholderSections): string {
  const successMetricLines =
    sections.successMetrics === DEFAULT_SUCCESS_METRIC_LINES.join(' ')
      ? DEFAULT_DEMO_SUCCESS_METRIC_LINES
      : [sections.successMetrics];

  return [
    '# Demo Script (5-minute walkthrough)',
    '',
    `Run ID: ${runId}`,
    '',
    '1. **Problem Statement**',
    `   - ${sections.problemStatement}`,
    '2. **EnterpriseAI Solution Overview**',
    `   - ${sections.solutionOverview}`,
    ...(sections.aiAugmentedJourney
      ? ['3. **AI-Augmented 4-Step Journey**', `   - ${sections.aiAugmentedJourney}`]
      : []),
    `${sections.aiAugmentedJourney ? '4' : '3'}. **Architecture Diagram Reference**`,
    `   - ${sections.architectureReference}`,
    `${sections.aiAugmentedJourney ? '5' : '4'}. **Demo Script Summary**`,
    `   - ${sections.demoSummary}`,
    `${sections.aiAugmentedJourney ? '6' : '5'}. **Success Metrics**`,
    ...successMetricLines.map((line, index) => `${index === 0 ? '   -' : '    '} ${line}`),
    '',
  ].join('\n');
}

function buildMarpDeckContent(runId: string, sections: StakeholderSections): string {
  return [
    '---',
    'marp: true',
    'theme: default',
    'paginate: true',
    '---',
    '',
    '# EnterpriseAI Stakeholder Readout',
    '',
    `Run ID: ${runId}`,
    '',
    '## Problem Statement',
    sections.problemStatement,
    '',
    '## EnterpriseAI Solution Overview',
    sections.solutionOverview,
    '',
    ...buildAiJourneySection(sections),
    '## Architecture Diagram Reference',
    sections.architectureReference,
    '',
    '## Demo Script Summary',
    sections.demoSummary,
    '',
    '## Success Metrics',
    ...wrapDefaultSuccessMetric(sections.successMetrics),
    '',
  ].join('\n');
}

function buildPersonaValueRows(
  rows: readonly (readonly [string, string, string])[]
): readonly string[] {
  return [
    '| Area | What This Persona Needs | Decision Signal |',
    '| ---- | ----------------------- | --------------- |',
    ...rows.map((row): string => `| ${row[0]} | ${row[1]} | ${row[2]} |`),
  ];
}

function buildPersonaControlRows(controls: readonly string[]): readonly string[] {
  return [
    '| Control | Evidence Expected |',
    '| ------- | ----------------- |',
    ...controls.map((control, index): string => `| ${index + 1}. ${control} | Required |`),
  ];
}

function buildPersonaMarpDeckContent(
  runId: string,
  persona: StakeholderPersona,
  sections: StakeholderSections
): string {
  const profile = PERSONA_DECK_PROFILES[persona];
  return [
    '---',
    'marp: true',
    'theme: default',
    'paginate: true',
    `title: '${profile.title}'`,
    '---',
    '',
    `# ${profile.title}`,
    '',
    `Run ID: ${runId}`,
    `Audience: ${profile.label}`,
    '',
    '## Executive Summary',
    '',
    `- Problem: ${sections.problemStatement}`,
    `- EnterpriseAI value: ${sections.solutionOverview}`,
    `- Decision focus: ${profile.decisionFocus}`,
    '',
    '---',
    '',
    '# Decision Focus',
    '',
    profile.primaryDecision,
    '',
    '## Problem Statement',
    sections.problemStatement,
    '',
    '---',
    '',
    '# EnterpriseAI Solution Overview',
    '',
    sections.solutionOverview,
    '',
    ...buildAiJourneySection(sections),
    '## EnterpriseAI Value/Risk Table',
    '',
    ...buildPersonaValueRows(profile.valueRows),
    '',
    '---',
    '',
    '# Architecture Diagram Reference',
    '',
    '```mermaid',
    ...profile.diagram,
    '```',
    '',
    sections.architectureReference,
    '',
    '---',
    '',
    '# Context Bundle',
    '',
    '| Artifact | Purpose | Required For This Persona |',
    '| -------- | ------- | ------------------------- |',
    '| `context-bundle.md` | Compact bundle of spec, tasks, EnterpriseAI object types, tenant assumptions, APIs, and validation criteria | Yes |',
    '| `reuse-scan.md` | Reuse-before-create scan for object types, APIs, workflows, modules, and prior specs | Yes |',
    '| `contract-pack.md` | Actors, object types, journeys, permissions, APIs/events, runtime assumptions, and acceptance tests | Yes |',
    '',
    '---',
    '',
    '# Contract Pack',
    '',
    '| Contract Element | EnterpriseAI Decision Need |',
    '| ---------------- | -------------------------- |',
    '| Actors | Who can act, approve, administer, or consume the vertical |',
    '| Object types | Canonical entities, owners, lineage, retention, and reuse decisions |',
    '| Workflows and journeys | External user journeys, four-step AI-augmented app process, and internal orchestration flows |',
    '| AI assistance | Chat/voice/accessibility/translation, contextual prefill, recommendation, validation, controls, audit, and escalation per step |',
    '| Permissions and tenant boundaries | Identity, access, policy, and data isolation assumptions |',
    '| APIs and events | ResourceAPI surfaces, integration events, and contract tests |',
    '| Acceptance tests | Business, security, data, architecture, and operational acceptance checks |',
    '',
    '---',
    '',
    '# Reuse-Before-Create',
    '',
    '| Candidate | Decision | Evidence |',
    '| --------- | -------- | -------- |',
    '| Existing object type | Reuse / extend / create new | Link to existing spec or platform reference |',
    '| Existing workflow | Reuse / extend / create new | Link to journey or orchestration flow |',
    '| Existing API/event | Reuse / extend / create new | Link to contract and validation test |',
    '',
    '---',
    '',
    '# Audit History',
    '',
    '| Finding ID | Status | Escalation Rule |',
    '| ---------- | ------ | --------------- |',
    '| `AUD-001` | Open / fixed / accepted | Recurring findings escalate to the decision owner |',
    '| `AUD-002` | Open / fixed / accepted | Exceptions require owner, expiry, and review cadence |',
    '',
    '## Red/Green Validation Loop',
    '',
    '1. Generate acceptance tests from the contract pack.',
    '2. Confirm tests fail against missing or incomplete implementation.',
    '3. Implement in a separate delivery context.',
    '4. Re-run validation, retain stable finding IDs, and repeat until launch criteria pass.',
    '',
    '---',
    '',
    '# Demo Script Summary',
    '',
    sections.demoSummary,
    '',
    '## Success Metrics',
    sections.successMetrics,
    '',
    '---',
    '',
    '# Persona-Specific Controls',
    '',
    ...buildPersonaControlRows(profile.requiredControls),
    '',
  ].join('\n');
}

function assertStakeholderContent(
  content: string,
  artifactName: string,
  requireAiJourney: boolean
): void {
  const requiredSectionTitles = requireAiJourney
    ? [...REQUIRED_SECTION_TITLES, 'AI-Augmented 4-Step Journey']
    : REQUIRED_SECTION_TITLES;
  for (const sectionTitle of requiredSectionTitles) {
    if (!content.includes(sectionTitle)) {
      throw new Error(
        `COMMS_MARP_TEMPLATE_INVALID: ${artifactName} is missing required section "${sectionTitle}".`
      );
    }
  }

  const secretValidation = validateSecretSafety(content);
  if (!secretValidation.valid) {
    const details = secretValidation.violations
      .map((violation): string => `${violation.ruleId}@line${violation.line}`)
      .join(', ');
    throw new Error(
      `COMMS_MARP_TEMPLATE_INVALID: ${artifactName} contains restricted secret patterns (${details}).`
    );
  }
}

async function writeArtifact(pathInfo: ResolvedWorkspacePath, content: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(pathInfo.absolutePath), { recursive: true });
    await fs.writeFile(pathInfo.absolutePath, content, 'utf8');
  } catch (error) {
    throw new Error(
      `COMMS_OUTPUT_WRITE_FAILED: failed to write artifact ${pathInfo.reportPath}. ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
}

function deriveArtifactPath(specPath: string, artifactName: string): string {
  const specDir = path.posix.dirname(specPath.replace(/\\/g, '/'));
  return normalizePathForOutput(path.posix.join(specDir, artifactName));
}

function mapInternalApiValidationErrorCode(validationErrors: readonly string[]): string {
  const inputArtifactError = validationErrors.some((error: string): boolean =>
    /(inputArtifacts|discovery|spec|plan|implementationSummary)/i.test(error)
  );
  if (inputArtifactError) {
    return 'COMMS_INPUT_ARTIFACT_MISSING';
  }
  return 'COMMS_MARP_TEMPLATE_INVALID';
}

function assertValidInternalApiPayload(payload: GenerateStakeholderArtifactsRequest): void {
  const validation = validateInternalApiPayload('IAP-007', payload);
  if (!validation.valid) {
    const code = mapInternalApiValidationErrorCode(validation.errors);
    throw new Error(`${code}: ${validation.errors.join(' ')}`);
  }
}

function assertValidEventPayload(payload: StakeholderCommsGeneratedEventPayload): void {
  const validation = validateEventPayload('EVT-007', payload);
  if (!validation.valid) {
    const hasArtifactPathError = validation.errors.some((error: string): boolean =>
      /(releaseNotesPath|demoScriptPath|marpDeckPath)/.test(error)
    );
    if (hasArtifactPathError) {
      throw new Error(`EVT_COMMS_ARTIFACT_MISSING: ${validation.errors.join(' ')}`);
    }
    throw new Error(`EVT_MARP_VALIDATION_FAILED: ${validation.errors.join(' ')}`);
  }
}

export async function generateStakeholderArtifacts(
  request: GenerateStakeholderArtifactsRequest,
  options: GenerateStakeholderArtifactsOptions = {}
): Promise<GenerateStakeholderArtifactsResult> {
  assertValidInternalApiPayload(request);

  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const resolvedInputPaths = {
    discovery: resolveWorkspacePath(workspaceRoot, request.inputArtifacts.discovery, 'discovery'),
    spec: resolveWorkspacePath(workspaceRoot, request.inputArtifacts.spec, 'spec'),
    plan: resolveWorkspacePath(workspaceRoot, request.inputArtifacts.plan, 'plan'),
    implementationSummary: resolveWorkspacePath(
      workspaceRoot,
      request.inputArtifacts.implementationSummary,
      'implementationSummary'
    ),
  };

  const loadedInputArtifacts: LoadedInputArtifacts = {
    discovery: await readInputArtifact(resolvedInputPaths.discovery, 'discovery'),
    spec: await readInputArtifact(resolvedInputPaths.spec, 'spec'),
    plan: await readInputArtifact(resolvedInputPaths.plan, 'plan'),
    implementationSummary: await readInputArtifact(
      resolvedInputPaths.implementationSummary,
      'implementationSummary'
    ),
  };

  const defaultReleaseNotesPath = deriveArtifactPath(
    resolvedInputPaths.spec.reportPath,
    'release-notes.md'
  );
  const defaultDemoScriptPath = deriveArtifactPath(
    resolvedInputPaths.spec.reportPath,
    'demo-script.md'
  );
  const defaultMarpDeckPath = deriveArtifactPath(
    resolvedInputPaths.spec.reportPath,
    'presentation.marp.md'
  );

  const releaseNotesPath = isPathOverrideProvided(request.releaseNotesPath)
    ? request.releaseNotesPath
    : defaultReleaseNotesPath;
  const demoScriptPath = isPathOverrideProvided(request.demoScriptPath)
    ? request.demoScriptPath
    : defaultDemoScriptPath;
  const marpDeckPath = isPathOverrideProvided(request.marpDeckPath)
    ? request.marpDeckPath
    : defaultMarpDeckPath;

  const resolvedReleaseNotesPath = resolveWorkspacePath(
    workspaceRoot,
    releaseNotesPath,
    'releaseNotesPath'
  );
  const resolvedDemoScriptPath = resolveWorkspacePath(
    workspaceRoot,
    demoScriptPath,
    'demoScriptPath'
  );
  const resolvedMarpDeckPath = resolveWorkspacePath(workspaceRoot, marpDeckPath, 'marpDeckPath');

  const marpEnabled = resolveMarpEnabled(request.workflowProfile, request.enableMarpDeck);
  const generatedAt = options.generatedAt ?? toIsoTimestamp();
  const sections = buildStakeholderSections(loadedInputArtifacts, request.workflowProfile);
  const personaDecks = resolvePersonaDecks(request, marpEnabled);
  const personaDeckRecords: readonly PersonaDeckRecord[] = personaDecks.map(
    (persona: StakeholderPersona): PersonaDeckRecord => ({
      persona,
      path: deriveArtifactPath(
        resolvedInputPaths.spec.reportPath,
        `presentations/${persona}.marp.md`
      ),
    })
  );
  const resolvedPersonaDeckPaths = personaDeckRecords.map((record: PersonaDeckRecord) =>
    resolveWorkspacePath(workspaceRoot, record.path, `${record.persona}PersonaDeckPath`)
  );

  const releaseNotesContent = buildReleaseNotesContent(request.runId, generatedAt, sections);
  const demoScriptContent = buildDemoScriptContent(request.runId, sections);
  const marpDeckContent = buildMarpDeckContent(request.runId, sections);
  const personaDeckContents = personaDeckRecords.map((record: PersonaDeckRecord): string =>
    buildPersonaMarpDeckContent(request.runId, record.persona, sections)
  );

  const requireAiJourney = request.workflowProfile === 'enterpriseai';
  assertStakeholderContent(releaseNotesContent, 'release-notes.md', requireAiJourney);
  assertStakeholderContent(demoScriptContent, 'demo-script.md', requireAiJourney);
  assertStakeholderContent(marpDeckContent, 'presentation.marp.md', requireAiJourney);
  personaDeckContents.forEach((content: string, index: number): void => {
    assertStakeholderContent(
      content,
      `${personaDeckRecords[index].persona}.marp.md`,
      requireAiJourney
    );
  });

  await writeArtifact(resolvedReleaseNotesPath, releaseNotesContent);
  await writeArtifact(resolvedDemoScriptPath, demoScriptContent);
  if (marpEnabled) {
    await writeArtifact(resolvedMarpDeckPath, marpDeckContent);
    await Promise.all(
      resolvedPersonaDeckPaths.map((pathInfo: ResolvedWorkspacePath, index: number) =>
        writeArtifact(pathInfo, personaDeckContents[index])
      )
    );
  }

  const response: GenerateStakeholderArtifactsResponse = {
    status: 'completed',
    releaseNotesPath: resolvedReleaseNotesPath.reportPath,
    demoScriptPath: resolvedDemoScriptPath.reportPath,
    marpDeckPath: resolvedMarpDeckPath.reportPath,
    marpEnabled,
    marpDeckGenerated: marpEnabled,
    marpRecommendedByDefault: isMarpRecommendedByDefault(request.workflowProfile),
  };
  if (personaDeckRecords.length > 0) {
    response.personaDeckPaths = personaDeckRecords;
  }

  const eventPayload: StakeholderCommsGeneratedEventPayload = {
    eventId: options.eventId ?? buildEventId('evt_007', generatedAt),
    runId: request.runId,
    releaseNotesPath: response.releaseNotesPath,
    demoScriptPath: response.demoScriptPath,
    marpDeckPath: response.marpDeckPath,
    marpEnabled,
  };
  if (personaDeckRecords.length > 0) {
    eventPayload.personaDeckPaths = personaDeckRecords.map(
      (record: PersonaDeckRecord): string => record.path
    );
    eventPayload.personaDeckPersonas = personaDeckRecords.map(
      (record: PersonaDeckRecord): string => record.persona
    );
  }
  assertValidEventPayload(eventPayload);

  options.eventPublisher?.(eventPayload);

  return {
    contractId: 'IAP-007',
    operationName: 'comms.generateStakeholderArtifacts',
    response,
    emittedEvent: {
      contractId: 'EVT-007',
      eventName: 'artifacts.stakeholder-comms.generated.v1',
      payload: eventPayload,
    },
  };
}
