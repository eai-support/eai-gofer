export type InternalApiContractId =
  | 'IAP-001'
  | 'IAP-002'
  | 'IAP-003'
  | 'IAP-004'
  | 'IAP-005'
  | 'IAP-006'
  | 'IAP-007'
  | 'IAP-008'
  | 'IAP-009'
  | 'IAP-010'
  | 'IAP-011';

type FieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'object';

interface FieldRule {
  type: FieldType;
  enumValues?: readonly string[];
  pattern?: RegExp;
  min?: number;
  customValidator?: (value: unknown) => string[];
}

export interface InternalApiSchemaDefinition {
  contractId: InternalApiContractId;
  operationName: string;
  required: Readonly<Record<string, FieldRule>>;
  optional?: Readonly<Record<string, FieldRule>>;
}

export interface InternalApiValidationResult {
  valid: boolean;
  errors: string[];
}

const MAJOR_MINOR_OR_PATCH_PATTERN = /^\d+\.\d+(?:\.\d+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validateResolvedReferences(value: unknown): string[] {
  if (!isRecord(value)) {
    return ['resolvedReferences must be an object.'];
  }

  const errors: string[] = [];

  for (const field of ['eaiCli', 'deploymentRepo'] as const) {
    if (typeof value[field] !== 'string' || !value[field].trim()) {
      errors.push(`resolvedReferences.${field} must be a non-empty string.`);
    }
  }

  const legacyTemplate =
    typeof value.eaiAppTemplate === 'string' ? value.eaiAppTemplate.trim() : '';
  const verticalTemplate =
    typeof value.verticalTemplate === 'string' ? value.verticalTemplate.trim() : '';

  if (!legacyTemplate && !verticalTemplate) {
    errors.push(
      'resolvedReferences.verticalTemplate must be a non-empty string (resolvedReferences.eaiAppTemplate is accepted as a legacy alias).'
    );
  }

  return errors;
}

function validateInputArtifacts(value: unknown): string[] {
  if (!isRecord(value)) {
    return ['inputArtifacts must be an object.'];
  }

  const requiredFields = ['discovery', 'spec', 'plan', 'implementationSummary'] as const;
  const errors: string[] = [];

  for (const field of requiredFields) {
    if (typeof value[field] !== 'string' || !value[field].trim()) {
      errors.push(`inputArtifacts.${field} must be a non-empty string.`);
    }
  }

  return errors;
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
  }

  if (rule.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      errors.push(`${fieldName} must be a number.`);
      return errors;
    }

    if (typeof rule.min === 'number' && value < rule.min) {
      errors.push(`${fieldName} must be >= ${rule.min}.`);
    }
  }

  if (rule.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${fieldName} must be a boolean.`);
  }

  if (rule.type === 'string[]') {
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
      errors.push(`${fieldName} must be an array of strings.`);
    }
  }

  if (rule.type === 'object' && !isRecord(value)) {
    errors.push(`${fieldName} must be an object.`);
  }

  if (rule.customValidator) {
    errors.push(...rule.customValidator(value));
  }

  return errors;
}

export const INTERNAL_API_SCHEMAS: Readonly<
  Record<InternalApiContractId, InternalApiSchemaDefinition>
> = {
  'IAP-001': {
    contractId: 'IAP-001',
    operationName: 'workflow.activateProfile',
    required: {
      runId: { type: 'string' },
      workflowProfile: { type: 'string', enumValues: ['standard', 'enterpriseai'] },
      stage: {
        type: 'string',
        enumValues: [
          'discovery',
          'research',
          'specification',
          'planning',
          'tasks',
          'implementation',
        ],
      },
      requestedBy: { type: 'string' },
    },
  },
  'IAP-002': {
    contractId: 'IAP-002',
    operationName: 'governance.requestArchitectureDecision',
    required: {
      runId: { type: 'string' },
      decisionId: { type: 'string' },
      title: { type: 'string' },
      options: { type: 'string[]' },
      requiresExplicitApproval: { type: 'boolean' },
    },
  },
  'IAP-003': {
    contractId: 'IAP-003',
    operationName: 'governance.recordArchitectureDecisionApproval',
    required: {
      runId: { type: 'string' },
      approvalToken: { type: 'string' },
      decisionId: { type: 'string' },
      approved: { type: 'boolean' },
      approvedBy: { type: 'string' },
    },
    optional: {
      comment: { type: 'string' },
    },
  },
  'IAP-004': {
    contractId: 'IAP-004',
    operationName: 'references.resolveEnterpriseAiReferences',
    required: {
      runId: { type: 'string' },
      referenceTypes: { type: 'string[]' },
      externalReferencesEnabled: { type: 'boolean' },
      fallbackPath: { type: 'string' },
    },
  },
  'IAP-005': {
    contractId: 'IAP-005',
    operationName: 'research.generateBusinessAndMarketArtifacts',
    required: {
      runId: { type: 'string' },
      workflowProfile: { type: 'string', enumValues: ['standard', 'enterpriseai'] },
      includeCompetitiveAnalysis: { type: 'boolean' },
      minimumAlternativeCount: { type: 'number', min: 3 },
      requireSpecAndPlanReferences: { type: 'boolean' },
      discoveryArtifactPath: { type: 'string' },
    },
  },
  'IAP-006': {
    contractId: 'IAP-006',
    operationName: 'planning.generateEnterpriseAiPlanAndTasks',
    required: {
      runId: { type: 'string' },
      workflowProfile: { type: 'string', enumValues: ['standard', 'enterpriseai'] },
      specPath: { type: 'string' },
      resolvedReferences: { type: 'object', customValidator: validateResolvedReferences },
      installedEaiCliVersion: { type: 'string', pattern: MAJOR_MINOR_OR_PATCH_PATTERN },
    },
  },
  'IAP-007': {
    contractId: 'IAP-007',
    operationName: 'comms.generateStakeholderArtifacts',
    required: {
      runId: { type: 'string' },
      workflowProfile: { type: 'string', enumValues: ['standard', 'enterpriseai'] },
      enableMarpDeck: { type: 'boolean' },
      inputArtifacts: { type: 'object', customValidator: validateInputArtifacts },
    },
    optional: {
      enablePersonaDecks: { type: 'boolean' },
      personaDecks: { type: 'string[]' },
    },
  },
  'IAP-008': {
    contractId: 'IAP-008',
    operationName: 'artifacts.propagateCanonicalMirrors',
    required: {
      changeSetId: { type: 'string' },
      canonicalSources: { type: 'string[]' },
      targetMirrors: { type: 'string[]' },
      runParityValidation: { type: 'boolean' },
    },
  },
  'IAP-009': {
    contractId: 'IAP-009',
    operationName: 'positioning.updateExtensionMessaging',
    required: {
      releaseId: { type: 'string' },
      surfaces: { type: 'string[]' },
      primaryMessage: { type: 'string' },
      preserveMultiPlatformSection: { type: 'boolean' },
    },
  },
  'IAP-010': {
    contractId: 'IAP-010',
    operationName: 'validation.runCompatibilityAndParityGate',
    required: {
      runId: { type: 'string' },
      checks: { type: 'string[]' },
      requireZeroRegression: { type: 'boolean' },
      requireRemovalApprovalLog: { type: 'boolean' },
    },
  },
  'IAP-011': {
    contractId: 'IAP-011',
    operationName: 'implementation.validateDeploymentReadiness',
    required: {
      runId: { type: 'string' },
      stage: { type: 'string', enumValues: ['implementation'] },
      deploymentTaskId: { type: 'string' },
      requiredFiles: { type: 'string[]' },
      blockCompletionOnFailure: { type: 'boolean' },
    },
  },
} as const;

export const INTERNAL_API_CONTRACT_IDS: readonly InternalApiContractId[] = Object.freeze(
  Object.keys(INTERNAL_API_SCHEMAS) as InternalApiContractId[]
);

export function validateInternalApiPayload(
  contractId: InternalApiContractId,
  payload: unknown
): InternalApiValidationResult {
  const schema = INTERNAL_API_SCHEMAS[contractId];
  const errors: string[] = [];

  if (!isRecord(payload)) {
    return {
      valid: false,
      errors: ['Payload must be an object.'],
    };
  }

  for (const [fieldName, rule] of Object.entries(schema.required)) {
    if (!(fieldName in payload)) {
      errors.push(`Missing required field: ${fieldName}.`);
      continue;
    }

    errors.push(...validateFieldRule(fieldName, payload[fieldName], rule));
  }

  if (schema.optional) {
    for (const [fieldName, rule] of Object.entries(schema.optional)) {
      if (!(fieldName in payload) || payload[fieldName] === undefined) {
        continue;
      }

      errors.push(...validateFieldRule(fieldName, payload[fieldName], rule));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
