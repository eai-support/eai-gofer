import * as fs from 'fs/promises';
import * as path from 'path';
import { validateEventPayload } from '../contracts/EventPayloadSchemas';
import { validateInternalApiPayload } from '../contracts/InternalApiSchemas';
import { type WorkflowProfile } from '../models/Workflow';
import {
  type MarketAnalysisSummary,
  validateMarketAnalysisSummary,
} from '../validation/MarketAnalysisValidator';
import { validateSecretSafety } from '../validation/SecretSafetyValidator';

export interface GenerateBusinessAndMarketArtifactsRequest {
  runId: string;
  workflowProfile: WorkflowProfile;
  includeCompetitiveAnalysis: boolean;
  minimumAlternativeCount: number;
  requireSpecAndPlanReferences: boolean;
  discoveryArtifactPath: string;
  businessAnalysisPath?: string;
  marketAnalysisPath?: string;
  competitiveAlternatives?: readonly string[];
}

export interface GenerateBusinessAndMarketArtifactsResponse {
  status: 'completed';
  businessAnalysisPath: string;
  marketAnalysisPath: string;
  competitiveAnalysisEnabled: boolean;
  marketAnalysisSummary?: MarketAnalysisSummary;
}

export interface ResearchArtifactsGeneratedEventPayload {
  eventId: string;
  runId: string;
  workflowProfile: WorkflowProfile;
  businessAnalysisPath: string;
  marketAnalysisPath: string;
  competitiveAnalysisEnabled: boolean;
}

export interface GenerateBusinessAndMarketArtifactsEvent {
  contractId: 'EVT-005';
  eventName: 'artifacts.research.generated.v1';
  payload: ResearchArtifactsGeneratedEventPayload;
}

export interface GenerateBusinessAndMarketArtifactsResult {
  contractId: 'IAP-005';
  operationName: 'research.generateBusinessAndMarketArtifacts';
  response: GenerateBusinessAndMarketArtifactsResponse;
  emittedEvent: GenerateBusinessAndMarketArtifactsEvent;
}

export interface GenerateBusinessAndMarketArtifactsOptions {
  eventId?: string;
  generatedAt?: string;
  workspaceRoot?: string;
  eventPublisher?: (payload: ResearchArtifactsGeneratedEventPayload) => void;
}

interface ResolvedWorkspacePath {
  absolutePath: string;
  reportPath: string;
}

const DIRECTION_RATIONALE_HEADING = 'EnterpriseAI-selected direction rationale';

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

function resolveCompetitiveAnalysisEnabled(
  workflowProfile: WorkflowProfile,
  includeCompetitiveAnalysis: boolean
): boolean {
  return workflowProfile === 'enterpriseai' && includeCompetitiveAnalysis;
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
    throw new Error(`RESEARCH_INPUT_MISSING: ${label} path must be provided.`);
  }

  const normalizedInput = trimmedPath.replace(/\\/g, '/');
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const absolutePath = path.isAbsolute(normalizedInput)
    ? path.resolve(normalizedInput)
    : path.resolve(resolvedWorkspaceRoot, normalizedInput);

  if (!isWithinWorkspace(resolvedWorkspaceRoot, absolutePath)) {
    throw new Error(
      `RESEARCH_INPUT_MISSING: ${label} path must resolve within workspace root (${normalizedInput}).`
    );
  }

  return {
    absolutePath,
    reportPath: normalizePathForOutput(path.relative(resolvedWorkspaceRoot, absolutePath)),
  };
}

function isNodeErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

async function readRequiredArtifact(
  pathInfo: ResolvedWorkspacePath,
  label: string
): Promise<string> {
  try {
    const content = await fs.readFile(pathInfo.absolutePath, 'utf8');
    if (!content.trim()) {
      throw new Error(
        `RESEARCH_INPUT_MISSING: ${label} artifact is empty at ${pathInfo.reportPath}.`
      );
    }
    return content;
  } catch (error) {
    if (
      isNodeErrorWithCode(error) &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES')
    ) {
      throw new Error(
        `RESEARCH_INPUT_MISSING: ${label} artifact not readable at ${pathInfo.reportPath}.`,
        { cause: error }
      );
    }

    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`RESEARCH_INPUT_MISSING: failed to read ${label} artifact.`, {
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
      `RESEARCH_INPUT_MISSING: ${label} artifact must include summary-ready content.`
    );
  }

  return summaryLines.join(' ');
}

function buildFallbackAlternatives(minimumAlternativeCount: number): readonly string[] {
  const baselineAlternatives = [
    'Generic no-code AI app builders',
    'Manual enterprise cloud implementation',
    'Standalone AI workflow assistants',
  ];
  const requiredCount = Math.max(3, Math.floor(minimumAlternativeCount));
  if (requiredCount <= baselineAlternatives.length) {
    return baselineAlternatives.slice(0, requiredCount);
  }

  const additionalAlternatives = Array.from(
    { length: requiredCount - baselineAlternatives.length },
    (_value: unknown, index: number): string =>
      `Alternative-${index + baselineAlternatives.length + 1}`
  );
  return [...baselineAlternatives, ...additionalAlternatives];
}

function normalizeCompetitiveAlternatives(
  alternatives: readonly string[] | undefined,
  minimumAlternativeCount: number
): readonly string[] {
  if (!alternatives || alternatives.length < 1) {
    return buildFallbackAlternatives(minimumAlternativeCount);
  }

  const normalizedAlternatives = alternatives
    .map((alternative: string): string => alternative.trim())
    .filter((alternative: string): boolean => alternative.length > 0);

  if (normalizedAlternatives.length < 1) {
    return buildFallbackAlternatives(minimumAlternativeCount);
  }

  return normalizedAlternatives;
}

function buildMarketAnalysisSummary(
  request: GenerateBusinessAndMarketArtifactsRequest,
  competitiveAnalysisEnabled: boolean,
  alternatives: readonly string[]
): MarketAnalysisSummary | undefined {
  if (!competitiveAnalysisEnabled) {
    return undefined;
  }

  const summary: MarketAnalysisSummary = {
    alternativeCount: alternatives.length,
    referencedInSpec: request.requireSpecAndPlanReferences,
    referencedInPlan: request.requireSpecAndPlanReferences,
  };

  const validation = validateMarketAnalysisSummary(summary, {
    minimumAlternativeCount: request.minimumAlternativeCount,
    requireSpecAndPlanReferences: request.requireSpecAndPlanReferences,
  });
  if (!validation.valid) {
    throw new Error(
      `RESEARCH_MARKET_ANALYSIS_INSUFFICIENT_ALTERNATIVES: ${validation.errors.join(' ')}`
    );
  }

  return summary;
}

function buildDirectionRationale(problemSummary: string): string {
  return `EnterpriseAI vertical app delivery is the selected direction because it maps directly to the identified business problem ("${problemSummary}") while preserving deployment governance, reusable integration patterns, and student-friendly implementation guidance.`;
}

function buildBusinessAnalysisContent(
  runId: string,
  generatedAt: string,
  problemSummary: string,
  directionRationale: string
): string {
  return [
    '# Business Analysis',
    '',
    `- Run ID: ${runId}`,
    `- Generated At: ${generatedAt}`,
    '',
    '## Problem Statement',
    problemSummary,
    '',
    `## ${DIRECTION_RATIONALE_HEADING}`,
    directionRationale,
    '',
    '## Recommended EnterpriseAI Outcome',
    'Deliver an EnterpriseAI vertical application with explicit architecture approvals and deployment readiness checks.',
    '',
  ].join('\n');
}

function buildMarketAnalysisContent(
  alternatives: readonly string[],
  competitiveAnalysisEnabled: boolean,
  marketAnalysisSummary: MarketAnalysisSummary | undefined,
  directionRationale: string
): string {
  const alternativesSection = competitiveAnalysisEnabled
    ? alternatives.map((alternative: string): string => `- ${alternative}`).join('\n')
    : '- Competitive analysis disabled for this run; baseline market artifact retained for traceability.';

  const summarySection = marketAnalysisSummary
    ? [
        '- Alternative count threshold satisfied.',
        `- Referenced in spec: ${marketAnalysisSummary.referencedInSpec}`,
        `- Referenced in plan: ${marketAnalysisSummary.referencedInPlan}`,
      ].join('\n')
    : '- No comparative metrics calculated because competitive analysis is disabled.';

  return [
    '# Market Analysis',
    '',
    '## Comparative Alternatives',
    alternativesSection,
    '',
    `## ${DIRECTION_RATIONALE_HEADING}`,
    directionRationale,
    '',
    '## Traceability',
    summarySection,
    '',
  ].join('\n');
}

function assertArtifactContent(content: string, artifactName: string): void {
  if (!content.includes(DIRECTION_RATIONALE_HEADING)) {
    throw new Error(
      `RESEARCH_ARTIFACT_WRITE_FAILED: ${artifactName} must include "${DIRECTION_RATIONALE_HEADING}".`
    );
  }

  const secretValidation = validateSecretSafety(content);
  if (!secretValidation.valid) {
    const details = secretValidation.violations
      .map((violation): string => `${violation.ruleId}@line${violation.line}`)
      .join(', ');
    throw new Error(
      `RESEARCH_ARTIFACT_WRITE_FAILED: ${artifactName} contains restricted secret patterns (${details}).`
    );
  }
}

async function writeArtifact(pathInfo: ResolvedWorkspacePath, content: string): Promise<void> {
  await fs.mkdir(path.dirname(pathInfo.absolutePath), { recursive: true });
  await fs.writeFile(pathInfo.absolutePath, content, 'utf8');
}

function deriveArtifactPath(discoveryArtifactPath: string, artifactName: string): string {
  const discoveryDir = path.posix.dirname(discoveryArtifactPath.replace(/\\/g, '/'));
  return normalizePathForOutput(path.posix.join(discoveryDir, artifactName));
}

function assertValidInternalApiPayload(payload: GenerateBusinessAndMarketArtifactsRequest): void {
  const validation = validateInternalApiPayload('IAP-005', payload);
  if (!validation.valid) {
    throw new Error(`IAP-005 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

function assertValidEventPayload(payload: ResearchArtifactsGeneratedEventPayload): void {
  const validation = validateEventPayload('EVT-005', payload);
  if (!validation.valid) {
    throw new Error(`EVT-005 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

export async function generateBusinessAndMarketArtifacts(
  request: GenerateBusinessAndMarketArtifactsRequest,
  options: GenerateBusinessAndMarketArtifactsOptions = {}
): Promise<GenerateBusinessAndMarketArtifactsResult> {
  assertValidInternalApiPayload(request);

  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const generatedAt = options.generatedAt ?? toIsoTimestamp();
  const resolvedDiscoveryPath = resolveWorkspacePath(
    workspaceRoot,
    request.discoveryArtifactPath,
    'discoveryArtifactPath'
  );
  const discoveryContent = await readRequiredArtifact(resolvedDiscoveryPath, 'discovery');
  const discoverySummary = extractSummary(discoveryContent, 'discovery');

  const defaultBusinessAnalysisPath = deriveArtifactPath(
    resolvedDiscoveryPath.reportPath,
    'business-analysis.md'
  );
  const defaultMarketAnalysisPath = deriveArtifactPath(
    resolvedDiscoveryPath.reportPath,
    'market-analysis.md'
  );
  const businessAnalysisPath = isPathOverrideProvided(request.businessAnalysisPath)
    ? request.businessAnalysisPath
    : defaultBusinessAnalysisPath;
  const marketAnalysisPath = isPathOverrideProvided(request.marketAnalysisPath)
    ? request.marketAnalysisPath
    : defaultMarketAnalysisPath;

  const resolvedBusinessAnalysisPath = resolveWorkspacePath(
    workspaceRoot,
    businessAnalysisPath,
    'businessAnalysisPath'
  );
  const resolvedMarketAnalysisPath = resolveWorkspacePath(
    workspaceRoot,
    marketAnalysisPath,
    'marketAnalysisPath'
  );

  const competitiveAnalysisEnabled = resolveCompetitiveAnalysisEnabled(
    request.workflowProfile,
    request.includeCompetitiveAnalysis
  );
  const alternatives = normalizeCompetitiveAlternatives(
    request.competitiveAlternatives,
    request.minimumAlternativeCount
  );
  const marketAnalysisSummary = buildMarketAnalysisSummary(
    request,
    competitiveAnalysisEnabled,
    alternatives
  );
  const directionRationale = buildDirectionRationale(discoverySummary);

  const businessAnalysisContent = buildBusinessAnalysisContent(
    request.runId,
    generatedAt,
    discoverySummary,
    directionRationale
  );
  const marketAnalysisContent = buildMarketAnalysisContent(
    alternatives,
    competitiveAnalysisEnabled,
    marketAnalysisSummary,
    directionRationale
  );

  assertArtifactContent(businessAnalysisContent, 'business-analysis.md');
  assertArtifactContent(marketAnalysisContent, 'market-analysis.md');

  await writeArtifact(resolvedBusinessAnalysisPath, businessAnalysisContent);
  await writeArtifact(resolvedMarketAnalysisPath, marketAnalysisContent);

  const response: GenerateBusinessAndMarketArtifactsResponse = {
    status: 'completed',
    businessAnalysisPath: resolvedBusinessAnalysisPath.reportPath,
    marketAnalysisPath: resolvedMarketAnalysisPath.reportPath,
    competitiveAnalysisEnabled,
    marketAnalysisSummary,
  };

  const eventPayload: ResearchArtifactsGeneratedEventPayload = {
    eventId: options.eventId ?? buildEventId('evt_005', generatedAt),
    runId: request.runId,
    workflowProfile: request.workflowProfile,
    businessAnalysisPath: response.businessAnalysisPath,
    marketAnalysisPath: response.marketAnalysisPath,
    competitiveAnalysisEnabled,
  };
  assertValidEventPayload(eventPayload);

  options.eventPublisher?.(eventPayload);

  return {
    contractId: 'IAP-005',
    operationName: 'research.generateBusinessAndMarketArtifacts',
    response,
    emittedEvent: {
      contractId: 'EVT-005',
      eventName: 'artifacts.research.generated.v1',
      payload: eventPayload,
    },
  };
}
