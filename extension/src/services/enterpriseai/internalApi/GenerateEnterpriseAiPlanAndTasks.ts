import * as path from 'path';
import { validateEventPayload } from '../contracts/EventPayloadSchemas';
import { validateInternalApiPayload } from '../contracts/InternalApiSchemas';
import { parseMajorMinorVersion } from '../EaiCliVersion';
import { type WorkflowProfile } from '../models/Workflow';

export interface ResolvedEnterpriseAiReferences {
  eaiCli: string;
  verticalTemplate?: string;
  eaiAppTemplate?: string;
  deploymentRepo: string;
}

export interface MarketAnalysisSummaryMetadata {
  alternativeCount: number;
  referencedInSpec: boolean;
  referencedInPlan: boolean;
}

export interface GenerateEnterpriseAiPlanAndTasksRequest {
  runId: string;
  workflowProfile: WorkflowProfile;
  specPath: string;
  resolvedReferences: ResolvedEnterpriseAiReferences;
  installedEaiCliVersion: string;
  planPath?: string;
  tasksPath?: string;
  integrationMapPath?: string;
  competitiveAnalysisEnabled?: boolean;
  marketAnalysisPath?: string;
  marketAnalysisSummary?: MarketAnalysisSummaryMetadata;
}

export type IntegrationMapComponent = 'vertical-app' | 'eai-services' | 'deployment-target';
export type DeploymentConvention =
  | 'branch-naming'
  | 'environment-targeting'
  | 'manifest-requirements';

export interface IntegrationMapMetadata {
  included: boolean;
  mapPath: string;
  components: readonly IntegrationMapComponent[];
}

export interface DeploymentConventionMetadata {
  included: boolean;
  referencePath: string;
  conventions: readonly DeploymentConvention[];
}

export interface RequiredReferenceIndicators {
  eaiCli: boolean;
  verticalTemplate: boolean;
  eaiAppTemplate: boolean;
  deploymentRepo: boolean;
}

export interface EaiCliPinMetadata {
  installedVersion: string;
  majorMinor: string;
  pinned: true;
}

export interface MarketAnalysisAttachmentMetadata {
  attached: true;
  marketAnalysisPath: string;
  alternativeCount: number;
  referencedInSpec: true;
  referencedInPlan: true;
}

export interface EnterpriseAiPlanTaskMetadata {
  integrationMap: IntegrationMapMetadata;
  deploymentConventions: DeploymentConventionMetadata;
  requiredReferenceIndicators: RequiredReferenceIndicators;
  pinnedEaiCli: EaiCliPinMetadata;
  marketAnalysis?: MarketAnalysisAttachmentMetadata;
}

export interface GenerateEnterpriseAiPlanAndTasksResponse {
  status: 'completed';
  planPath: string;
  tasksPath: string;
  recordedEaiCliMajorMinor: string;
  deploymentConventionsIncluded: boolean;
  metadata: EnterpriseAiPlanTaskMetadata;
}

export interface PlanTasksGeneratedEventPayload {
  eventId: string;
  runId: string;
  planPath: string;
  tasksPath: string;
  eaiCliMajorMinor: string;
  deploymentConventionsIncluded: boolean;
  metadata: EnterpriseAiPlanTaskMetadata;
}

export interface GenerateEnterpriseAiPlanAndTasksEvent {
  contractId: 'EVT-006';
  eventName: 'artifacts.plan.tasks.generated.v1';
  payload: PlanTasksGeneratedEventPayload;
}

export interface GenerateEnterpriseAiPlanAndTasksResult {
  contractId: 'IAP-006';
  operationName: 'planning.generateEnterpriseAiPlanAndTasks';
  response: GenerateEnterpriseAiPlanAndTasksResponse;
  emittedEvent: GenerateEnterpriseAiPlanAndTasksEvent;
}

export interface GenerateEnterpriseAiPlanAndTasksOptions {
  eventId?: string;
  generatedAt?: string;
  eventPublisher?: (payload: PlanTasksGeneratedEventPayload) => void;
}

const ENTERPRISEAI_INTEGRATION_COMPONENTS: readonly IntegrationMapComponent[] = [
  'vertical-app',
  'eai-services',
  'deployment-target',
];

const DEPLOYMENT_CONVENTIONS: readonly DeploymentConvention[] = [
  'branch-naming',
  'environment-targeting',
  'manifest-requirements',
];

function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

function buildEventId(prefix: string, isoTimestamp: string): string {
  return `${prefix}_${isoTimestamp.replace(/[-:.TZ]/g, '')}`;
}

function hasNonEmptyValue(value: string): boolean {
  return Boolean(value.trim());
}

function deriveArtifactPath(specPath: string, artifactName: string): string {
  return path.join(path.dirname(specPath), artifactName);
}

function buildRequiredReferenceIndicators(
  references: ResolvedEnterpriseAiReferences
): RequiredReferenceIndicators {
  const templateReference = references.verticalTemplate ?? references.eaiAppTemplate ?? '';

  return {
    eaiCli: hasNonEmptyValue(references.eaiCli),
    verticalTemplate: hasNonEmptyValue(templateReference),
    eaiAppTemplate: hasNonEmptyValue(templateReference),
    deploymentRepo: hasNonEmptyValue(references.deploymentRepo),
  };
}

function assertRequiredReferenceIndicators(
  indicators: RequiredReferenceIndicators,
  workflowProfile: WorkflowProfile
): void {
  if (workflowProfile !== 'enterpriseai') {
    return;
  }

  if (!indicators.eaiCli || !indicators.verticalTemplate || !indicators.deploymentRepo) {
    throw new Error(
      'Required reference indicators are incomplete. eaiCli, verticalTemplate/eaiAppTemplate, and deploymentRepo must be present.'
    );
  }
}

function buildMarketAnalysisMetadata(
  request: GenerateEnterpriseAiPlanAndTasksRequest
): MarketAnalysisAttachmentMetadata | undefined {
  if (request.competitiveAnalysisEnabled !== true) {
    return undefined;
  }

  if (!request.marketAnalysisPath || !hasNonEmptyValue(request.marketAnalysisPath)) {
    throw new Error(
      'competitiveAnalysisEnabled=true requires marketAnalysisPath for metadata attachment.'
    );
  }

  if (!request.marketAnalysisSummary) {
    throw new Error(
      'competitiveAnalysisEnabled=true requires marketAnalysisSummary with reference indicators.'
    );
  }

  if (request.marketAnalysisSummary.alternativeCount < 3) {
    throw new Error('marketAnalysisSummary.alternativeCount must be >= 3.');
  }

  if (
    !request.marketAnalysisSummary.referencedInSpec ||
    !request.marketAnalysisSummary.referencedInPlan
  ) {
    throw new Error(
      'marketAnalysisSummary requires referencedInSpec=true and referencedInPlan=true.'
    );
  }

  return {
    attached: true,
    marketAnalysisPath: request.marketAnalysisPath,
    alternativeCount: request.marketAnalysisSummary.alternativeCount,
    referencedInSpec: true,
    referencedInPlan: true,
  };
}

function buildIntegrationMapMetadata(
  request: GenerateEnterpriseAiPlanAndTasksRequest
): IntegrationMapMetadata {
  const isEnterpriseAiProfile = request.workflowProfile === 'enterpriseai';
  const defaultMapPath = deriveArtifactPath(request.specPath, 'integration-map.md');

  return {
    included: isEnterpriseAiProfile,
    mapPath: request.integrationMapPath?.trim() ? request.integrationMapPath : defaultMapPath,
    components: isEnterpriseAiProfile ? ENTERPRISEAI_INTEGRATION_COMPONENTS : [],
  };
}

function buildDeploymentConventionMetadata(
  request: GenerateEnterpriseAiPlanAndTasksRequest
): DeploymentConventionMetadata {
  const isEnterpriseAiProfile = request.workflowProfile === 'enterpriseai';
  return {
    included: isEnterpriseAiProfile,
    referencePath: request.resolvedReferences.deploymentRepo,
    conventions: isEnterpriseAiProfile ? DEPLOYMENT_CONVENTIONS : [],
  };
}

function assertValidInternalApiPayload(payload: GenerateEnterpriseAiPlanAndTasksRequest): void {
  const validation = validateInternalApiPayload('IAP-006', payload);
  if (!validation.valid) {
    throw new Error(`IAP-006 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

function assertValidEventPayload(payload: PlanTasksGeneratedEventPayload): void {
  const validation = validateEventPayload('EVT-006', payload);
  if (!validation.valid) {
    throw new Error(`EVT-006 payload validation failed: ${validation.errors.join(' ')}`);
  }
}

function resolveMajorMinorPin(installedEaiCliVersion: string): string {
  const majorMinor = parseMajorMinorVersion(installedEaiCliVersion);
  if (!majorMinor) {
    throw new Error(
      `PLAN_EAI_CLI_VERSION_UNAVAILABLE: could not parse major.minor from ${installedEaiCliVersion}.`
    );
  }

  return majorMinor;
}

export function generateEnterpriseAiPlanAndTasks(
  request: GenerateEnterpriseAiPlanAndTasksRequest,
  options: GenerateEnterpriseAiPlanAndTasksOptions = {}
): GenerateEnterpriseAiPlanAndTasksResult {
  assertValidInternalApiPayload(request);

  const eaiCliMajorMinor = resolveMajorMinorPin(request.installedEaiCliVersion.trim());
  const requiredReferenceIndicators = buildRequiredReferenceIndicators(request.resolvedReferences);
  assertRequiredReferenceIndicators(requiredReferenceIndicators, request.workflowProfile);

  const integrationMap = buildIntegrationMapMetadata(request);
  const deploymentConventions = buildDeploymentConventionMetadata(request);
  const marketAnalysis = buildMarketAnalysisMetadata(request);

  const metadata: EnterpriseAiPlanTaskMetadata = {
    integrationMap,
    deploymentConventions,
    requiredReferenceIndicators,
    pinnedEaiCli: {
      installedVersion: request.installedEaiCliVersion.trim(),
      majorMinor: eaiCliMajorMinor,
      pinned: true,
    },
    marketAnalysis,
  };

  const planPath = request.planPath?.trim()
    ? request.planPath
    : deriveArtifactPath(request.specPath, 'plan.md');
  const tasksPath = request.tasksPath?.trim()
    ? request.tasksPath
    : deriveArtifactPath(request.specPath, 'tasks.md');

  const response: GenerateEnterpriseAiPlanAndTasksResponse = {
    status: 'completed',
    planPath,
    tasksPath,
    recordedEaiCliMajorMinor: eaiCliMajorMinor,
    deploymentConventionsIncluded: deploymentConventions.included,
    metadata,
  };

  const generatedAt = options.generatedAt ?? toIsoTimestamp();
  const eventPayload: PlanTasksGeneratedEventPayload = {
    eventId: options.eventId ?? buildEventId('evt_006', generatedAt),
    runId: request.runId,
    planPath,
    tasksPath,
    eaiCliMajorMinor,
    deploymentConventionsIncluded: deploymentConventions.included,
    metadata,
  };
  assertValidEventPayload(eventPayload);

  options.eventPublisher?.(eventPayload);

  return {
    contractId: 'IAP-006',
    operationName: 'planning.generateEnterpriseAiPlanAndTasks',
    response,
    emittedEvent: {
      contractId: 'EVT-006',
      eventName: 'artifacts.plan.tasks.generated.v1',
      payload: eventPayload,
    },
  };
}
