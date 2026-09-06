import { validateActiveMirrorTargets } from '../models/Propagation';

export type EventContractId =
  | 'EVT-001'
  | 'EVT-002'
  | 'EVT-003'
  | 'EVT-004'
  | 'EVT-005'
  | 'EVT-006'
  | 'EVT-007'
  | 'EVT-008'
  | 'EVT-009'
  | 'EVT-010'
  | 'EVT-011'
  | 'EVT-012';

type FieldType = 'string' | 'number' | 'boolean' | 'string[]';

interface FieldRule {
  type: FieldType;
  enumValues?: readonly string[];
  pattern?: RegExp;
  min?: number;
}

export interface EventPayloadSchemaDefinition {
  contractId: EventContractId;
  eventName: string;
  required: Readonly<Record<string, FieldRule>>;
  optional?: Readonly<Record<string, FieldRule>>;
}

export interface PayloadValidationResult {
  valid: boolean;
  errors: string[];
}

const MAJOR_MINOR_PATTERN = /^\d+\.\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validateFieldRule(fieldName: string, value: unknown, rule: FieldRule): string[] {
  const errors: string[] = [];

  if (rule.type === 'string') {
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${fieldName} must be a non-empty string.`);
      return errors;
    }

    if (rule.enumValues && !rule.enumValues.includes(value)) {
      errors.push(`${fieldName} must be one of: ${rule.enumValues.join(', ')}.`);
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(`${fieldName} does not match the expected format.`);
    }

    return errors;
  }

  if (rule.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      errors.push(`${fieldName} must be a number.`);
      return errors;
    }

    if (typeof rule.min === 'number' && value < rule.min) {
      errors.push(`${fieldName} must be >= ${rule.min}.`);
    }

    return errors;
  }

  if (rule.type === 'boolean') {
    if (typeof value !== 'boolean') {
      errors.push(`${fieldName} must be a boolean.`);
    }

    return errors;
  }

  if (rule.type === 'string[]') {
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
      errors.push(`${fieldName} must be an array of strings.`);
    }

    return errors;
  }

  return errors;
}

export const EVENT_PAYLOAD_SCHEMAS: Readonly<
  Record<EventContractId, EventPayloadSchemaDefinition>
> = {
  'EVT-001': {
    contractId: 'EVT-001',
    eventName: 'workflow.profile.activated.v1',
    required: {
      eventId: { type: 'string' },
      runId: { type: 'string' },
      workflowProfile: { type: 'string', enumValues: ['standard', 'enterpriseai'] },
      activatedAt: { type: 'string' },
    },
  },
  'EVT-002': {
    contractId: 'EVT-002',
    eventName: 'governance.architecture-decision.requested.v1',
    required: {
      eventId: { type: 'string' },
      runId: { type: 'string' },
      decisionId: { type: 'string' },
      title: { type: 'string' },
      options: { type: 'string[]' },
      requiresExplicitApproval: { type: 'boolean' },
    },
  },
  'EVT-003': {
    contractId: 'EVT-003',
    eventName: 'governance.architecture-decision.recorded.v1',
    required: {
      eventId: { type: 'string' },
      runId: { type: 'string' },
      decisionId: { type: 'string' },
      approvalState: { type: 'string', enumValues: ['approved', 'rejected'] },
      approvedBy: { type: 'string' },
      recordedAt: { type: 'string' },
    },
  },
  'EVT-004': {
    contractId: 'EVT-004',
    eventName: 'references.eai-fallback.used.v1',
    required: {
      eventId: { type: 'string' },
      runId: { type: 'string' },
      fallbackPath: { type: 'string' },
      unavailableExternalReferences: { type: 'string[]' },
      userNoticeRequired: { type: 'boolean' },
    },
  },
  'EVT-005': {
    contractId: 'EVT-005',
    eventName: 'artifacts.research.generated.v1',
    required: {
      eventId: { type: 'string' },
      runId: { type: 'string' },
      workflowProfile: { type: 'string', enumValues: ['standard', 'enterpriseai'] },
      businessAnalysisPath: { type: 'string' },
      marketAnalysisPath: { type: 'string' },
      competitiveAnalysisEnabled: { type: 'boolean' },
    },
  },
  'EVT-006': {
    contractId: 'EVT-006',
    eventName: 'artifacts.plan.tasks.generated.v1',
    required: {
      eventId: { type: 'string' },
      runId: { type: 'string' },
      planPath: { type: 'string' },
      tasksPath: { type: 'string' },
      eaiCliMajorMinor: { type: 'string', pattern: MAJOR_MINOR_PATTERN },
      deploymentConventionsIncluded: { type: 'boolean' },
    },
  },
  'EVT-007': {
    contractId: 'EVT-007',
    eventName: 'artifacts.stakeholder-comms.generated.v1',
    required: {
      eventId: { type: 'string' },
      runId: { type: 'string' },
      releaseNotesPath: { type: 'string' },
      demoScriptPath: { type: 'string' },
      marpDeckPath: { type: 'string' },
      marpEnabled: { type: 'boolean' },
    },
    optional: {
      personaDeckPaths: { type: 'string[]' },
      personaDeckPersonas: { type: 'string[]' },
    },
  },
  'EVT-008': {
    contractId: 'EVT-008',
    eventName: 'artifacts.mirror-propagation.completed.v1',
    required: {
      eventId: { type: 'string' },
      changeSetId: { type: 'string' },
      mirrors: { type: 'string[]' },
      filesChanged: { type: 'number', min: 0 },
      runtimeSyncCompleted: { type: 'boolean' },
    },
  },
  'EVT-009': {
    contractId: 'EVT-009',
    eventName: 'positioning.enterpriseai-updated.v1',
    required: {
      eventId: { type: 'string' },
      releaseId: { type: 'string' },
      updatedSurfaces: { type: 'string[]' },
      multiPlatformSupportRetained: { type: 'boolean' },
    },
  },
  'EVT-010': {
    contractId: 'EVT-010',
    eventName: 'validation.compatibility-parity.completed.v1',
    required: {
      eventId: { type: 'string' },
      runId: { type: 'string' },
      parityResult: { type: 'string', enumValues: ['passed', 'failed'] },
      regressionResult: { type: 'string', enumValues: ['passed', 'failed'] },
      removedCapabilitiesDetected: { type: 'number', min: 0 },
    },
  },
  'EVT-011': {
    contractId: 'EVT-011',
    eventName: 'governance.capability-removal.approval-required.v1',
    required: {
      eventId: { type: 'string' },
      changeSetId: { type: 'string' },
      affectedCapability: { type: 'string' },
      requiresExplicitApproval: { type: 'boolean' },
      blocking: { type: 'boolean' },
    },
  },
  'EVT-012': {
    contractId: 'EVT-012',
    eventName: 'deployment.readiness.validated.v1',
    required: {
      eventId: { type: 'string' },
      runId: { type: 'string' },
      deploymentTaskId: { type: 'string' },
      readinessPassed: { type: 'boolean' },
      missingFiles: { type: 'string[]' },
      validatedAt: { type: 'string' },
    },
  },
} as const;

export const EVENT_PAYLOAD_CONTRACT_IDS: readonly EventContractId[] = Object.freeze(
  Object.keys(EVENT_PAYLOAD_SCHEMAS) as EventContractId[]
);

export function validateEventPayload(
  contractId: EventContractId,
  payload: unknown
): PayloadValidationResult {
  const schema = EVENT_PAYLOAD_SCHEMAS[contractId];
  const errors: string[] = [];

  if (!isRecord(payload)) {
    return {
      valid: false,
      errors: ['Payload must be an object.'],
    };
  }

  if (contractId === 'EVT-008') errors.push(...validateActiveMirrorTargets(payload.mirrors));

  for (const [fieldName, rule] of Object.entries(schema.required)) {
    if (!(fieldName in payload)) {
      errors.push(`Missing required field: ${fieldName}.`);
      continue;
    }

    const fieldErrors = validateFieldRule(fieldName, payload[fieldName], rule);
    errors.push(...fieldErrors);
  }

  if (schema.optional) {
    for (const [fieldName, rule] of Object.entries(schema.optional)) {
      if (!(fieldName in payload) || payload[fieldName] === undefined) {
        continue;
      }

      const fieldErrors = validateFieldRule(fieldName, payload[fieldName], rule);
      errors.push(...fieldErrors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
