/** Schema discriminator shared by Gofer, QProcess, and documentation viewers. */
export const DELIVERY_LINEAGE_SCHEMA_VERSION = 'eai.delivery_lineage.v1' as const;

export const DELIVERY_LINEAGE_PLANES = ['customer', 'eai-internal'] as const;
export const DELIVERY_LINEAGE_VISIBILITIES = [
  'customer',
  'public-contract',
  'eai-internal',
] as const;
export const DELIVERY_LINEAGE_STAGES = [
  'intent',
  'requirements',
  'architecture',
  'delivery',
  'validation',
  'outcome',
] as const;
export const DELIVERY_LINEAGE_NODE_KINDS = [
  'customer-need',
  'roadmap-item',
  'requirement',
  'architecture',
  'decision',
  'work-order',
  'artifact',
  'repository',
  'code-file',
  'documentation-file',
  'public-api-capability',
  'service',
  'test',
  'release',
  'feedback',
  'owner',
  'approver',
] as const;
export const DELIVERY_LINEAGE_RELATIONS = [
  'supports',
  'constrains',
  'contradicts',
  'informs',
  'implements',
  'depends-on',
  'records-decision',
  'produces',
  'changes-code',
  'updates-documentation',
  'validated-by',
  'released-by',
  'responds-to',
  'owned-by',
  'approved-by',
] as const;
export const DELIVERY_LINEAGE_STATUSES = [
  'current',
  'suspect',
  'anchor-lost',
  'broken',
  'superseded',
] as const;
export const DELIVERY_LINEAGE_ORIGINS = ['human-directed', 'agent-initiated'] as const;
export const DELIVERY_LINEAGE_VERIFIERS = ['human', 'agent', 'none'] as const;

/** Trust plane controlling whether a complete graph may leave EAI. */
export type DeliveryLineagePlane = (typeof DELIVERY_LINEAGE_PLANES)[number];
/** Classification enforced on every node and edge during projection. */
export type DeliveryLineageVisibility = (typeof DELIVERY_LINEAGE_VISIBILITIES)[number];
/** Stable left-to-right delivery phase used by every viewer. */
export type DeliveryLineageStage = (typeof DELIVERY_LINEAGE_STAGES)[number];
/** Durable artifact or governing concept represented by a graph node. */
export type DeliveryLineageNodeKind = (typeof DELIVERY_LINEAGE_NODE_KINDS)[number];
/** Authored claim connecting two lineage nodes. */
export type DeliveryLineageRelation = (typeof DELIVERY_LINEAGE_RELATIONS)[number];
/** Evidence health retained for drift and repair worklists. */
export type DeliveryLineageStatus = (typeof DELIVERY_LINEAGE_STATUSES)[number];
/** Whether a relationship originated from human direction or agent initiative. */
export type DeliveryLineageOrigin = (typeof DELIVERY_LINEAGE_ORIGINS)[number];
/** Actor that last verified the relationship claim. */
export type DeliveryLineageVerifier = (typeof DELIVERY_LINEAGE_VERIFIERS)[number];

/** Immutable repository location used to verify a lineage claim. */
export interface DeliveryLineageSource {
  repository: string;
  path: string;
  anchor?: string;
  commit?: string;
  contentHash?: string;
}

/** A durable delivery artifact or governing concept rendered as a graph node. */
export interface DeliveryLineageNode {
  id: string;
  kind: DeliveryLineageNodeKind;
  label: string;
  stage: DeliveryLineageStage;
  visibility: DeliveryLineageVisibility;
  status: DeliveryLineageStatus;
  summary?: string;
  capabilityId?: string;
  contractVersion?: string;
  source?: DeliveryLineageSource;
}

/** An authored, reviewable relationship between two durable lineage nodes. */
export interface DeliveryLineageEdge {
  id: string;
  source: string;
  target: string;
  relation: DeliveryLineageRelation;
  visibility: DeliveryLineageVisibility;
  status: DeliveryLineageStatus;
  origin: DeliveryLineageOrigin;
  verifiedBy: DeliveryLineageVerifier;
  claim?: string;
  verifiedAt?: string;
}

/** Portable graph manifest consumed by the documentation viewer. */
export interface DeliveryLineageGraph {
  schemaVersion: typeof DELIVERY_LINEAGE_SCHEMA_VERSION;
  plane: DeliveryLineagePlane;
  featureId: string;
  generatedAt: string;
  nodes: readonly DeliveryLineageNode[];
  edges: readonly DeliveryLineageEdge[];
}

/** Integrity result returned without filesystem or Git lookups. */
export interface DeliveryLineageValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Explicit export allowlist and optional deployment-specific leak terms. */
export interface CustomerLineageProjectionOptions {
  allowedRepositories: readonly string[];
  prohibitedTerms?: readonly string[];
}

/** Fail-closed projection result; lineage is absent whenever validation fails. */
export interface CustomerLineageProjectionResult extends DeliveryLineageValidationResult {
  lineage?: DeliveryLineageGraph;
}

const SHA_PATTERN = /^[a-f0-9]{7,64}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PUBLIC_API_CAPABILITY_PATTERN = /^eai\.publicapi\.capability\.[a-z0-9-]+\.v[1-9][0-9]*$/;
const PERSONAL_ABSOLUTE_PATH_PATTERN =
  /(^|[\s"'])(\/Users\/[^/\s"']+|\/home\/[^/\s"']+|[A-Za-z]:\\Users\\[^\\\s"']+)/;
const DEFAULT_PROHIBITED_CUSTOMER_TERMS = [
  'AdminAPI',
  'ResourceAPI',
  'Configurator',
  'Authz',
  'AzureAPI',
  'AICore',
  'GeoService',
  'Infra2025',
  'eai-testing-dev',
  'tech-docs',
] as const;

function isIsoTimestamp(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isSafeRelativePath(value: string): boolean {
  if (!value || value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(value)) {
    return false;
  }

  return !value.split(/[\\/]/).includes('..') && !PERSONAL_ABSOLUTE_PATH_PATTERN.test(value);
}

function validateSource(source: DeliveryLineageSource, context: string, errors: string[]): void {
  if (!source.repository.trim()) {
    errors.push(`${context}.repository is required.`);
  }
  if (!isSafeRelativePath(source.path)) {
    errors.push(`${context}.path must be a safe repository-relative path.`);
  }
  if (source.commit !== undefined && !SHA_PATTERN.test(source.commit)) {
    errors.push(`${context}.commit must be a 7-64 character lowercase Git SHA.`);
  }
  if (source.contentHash !== undefined && !SHA256_PATTERN.test(source.contentHash)) {
    errors.push(`${context}.contentHash must be a lowercase SHA-256 value.`);
  }
}

function stringsInLineage(lineage: DeliveryLineageGraph): string[] {
  return [
    lineage.featureId,
    ...lineage.nodes.flatMap((node) => [
      node.id,
      node.label,
      node.summary ?? '',
      node.capabilityId ?? '',
      node.contractVersion ?? '',
      node.source?.repository ?? '',
      node.source?.path ?? '',
      node.source?.anchor ?? '',
    ]),
    ...lineage.edges.flatMap((edge) => [edge.id, edge.source, edge.target, edge.claim ?? '']),
  ];
}

/** Validates graph integrity without consulting Git or the filesystem. */
export function validateDeliveryLineage(
  lineage: DeliveryLineageGraph
): DeliveryLineageValidationResult {
  const errors: string[] = [];

  if (lineage.schemaVersion !== DELIVERY_LINEAGE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DELIVERY_LINEAGE_SCHEMA_VERSION}.`);
  }
  if (!DELIVERY_LINEAGE_PLANES.includes(lineage.plane)) {
    errors.push('plane is invalid.');
  }
  if (!lineage.featureId.trim()) {
    errors.push('featureId is required.');
  }
  if (!isIsoTimestamp(lineage.generatedAt)) {
    errors.push('generatedAt must be an ISO8601 timestamp.');
  }

  const nodeIds = new Set<string>();
  for (const node of lineage.nodes) {
    const context = `Node ${node.id || '<empty>'}`;
    if (!node.id.trim()) {
      errors.push('Every node id is required.');
    } else if (nodeIds.has(node.id)) {
      errors.push(`nodes contains duplicate id ${node.id}.`);
    }
    nodeIds.add(node.id);
    if (!node.label.trim()) {
      errors.push(`${context} label is required.`);
    }
    if (!DELIVERY_LINEAGE_NODE_KINDS.includes(node.kind)) {
      errors.push(`${context} kind is invalid.`);
    }
    if (!DELIVERY_LINEAGE_STAGES.includes(node.stage)) {
      errors.push(`${context} stage is invalid.`);
    }
    if (!DELIVERY_LINEAGE_VISIBILITIES.includes(node.visibility)) {
      errors.push(`${context} visibility is invalid.`);
    }
    if (!DELIVERY_LINEAGE_STATUSES.includes(node.status)) {
      errors.push(`${context} status is invalid.`);
    }
    if (node.kind === 'public-api-capability') {
      if (!node.capabilityId || !PUBLIC_API_CAPABILITY_PATTERN.test(node.capabilityId)) {
        errors.push(`${context} capabilityId must use the EAI PublicAPI capability format.`);
      }
      if (!node.contractVersion?.trim()) {
        errors.push(`${context} contractVersion is required for a PublicAPI capability.`);
      }
      if (node.visibility !== 'public-contract') {
        errors.push(`${context} must use public-contract visibility.`);
      }
    }
    if (node.source) {
      validateSource(node.source, `${context} source`, errors);
    }
  }

  const edgeIds = new Set<string>();
  for (const edge of lineage.edges) {
    const context = `Edge ${edge.id || '<empty>'}`;
    if (!edge.id.trim()) {
      errors.push('Every edge id is required.');
    } else if (edgeIds.has(edge.id)) {
      errors.push(`edges contains duplicate id ${edge.id}.`);
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push(`${context} must reference existing source and target nodes.`);
    }
    if (edge.source === edge.target) {
      errors.push(`${context} cannot reference the same source and target.`);
    }
    if (!DELIVERY_LINEAGE_RELATIONS.includes(edge.relation)) {
      errors.push(`${context} relation is invalid.`);
    }
    if (!DELIVERY_LINEAGE_VISIBILITIES.includes(edge.visibility)) {
      errors.push(`${context} visibility is invalid.`);
    }
    if (!DELIVERY_LINEAGE_STATUSES.includes(edge.status)) {
      errors.push(`${context} status is invalid.`);
    }
    if (!DELIVERY_LINEAGE_ORIGINS.includes(edge.origin)) {
      errors.push(`${context} origin is invalid.`);
    }
    if (!DELIVERY_LINEAGE_VERIFIERS.includes(edge.verifiedBy)) {
      errors.push(`${context} verifiedBy is invalid.`);
    }
    if (edge.verifiedAt !== undefined && !isIsoTimestamp(edge.verifiedAt)) {
      errors.push(`${context} verifiedAt must be an ISO8601 timestamp.`);
    }

    const sourceNode = lineage.nodes.find((node) => node.id === edge.source);
    const targetNode = lineage.nodes.find((node) => node.id === edge.target);
    if (
      (sourceNode?.visibility === 'eai-internal' || targetNode?.visibility === 'eai-internal') &&
      edge.visibility !== 'eai-internal'
    ) {
      errors.push(`${context} touching an internal node must use eai-internal visibility.`);
    }
  }

  if (
    lineage.plane === 'customer' &&
    (lineage.nodes.some((node) => node.visibility === 'eai-internal') ||
      lineage.edges.some((edge) => edge.visibility === 'eai-internal'))
  ) {
    errors.push('Customer lineage must not contain eai-internal nodes or edges.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * SECURITY: Builds a new customer graph from allowlisted nodes and edges; callers must never
 * expose an internal graph and rely on the viewer to hide restricted records.
 */
export function projectCustomerDeliveryLineage(
  lineage: DeliveryLineageGraph,
  options: CustomerLineageProjectionOptions
): CustomerLineageProjectionResult {
  const inputValidation = validateDeliveryLineage(lineage);
  if (!inputValidation.valid) {
    return inputValidation;
  }

  const nodes = lineage.nodes.filter((node) => node.visibility !== 'eai-internal');
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = lineage.edges.filter(
    (edge) =>
      edge.visibility !== 'eai-internal' && nodeIds.has(edge.source) && nodeIds.has(edge.target)
  );
  const customerLineage: DeliveryLineageGraph = {
    ...lineage,
    plane: 'customer',
    nodes,
    edges,
  };
  const errors = [...validateDeliveryLineage(customerLineage).errors];
  const allowedRepositories = new Set(['PublicAPI', ...options.allowedRepositories]);

  for (const node of nodes) {
    if (node.source && !allowedRepositories.has(node.source.repository)) {
      errors.push(
        `Node ${node.id} references repository ${node.source.repository}, which is not customer-allowlisted.`
      );
    }
  }

  const prohibitedTerms = [
    ...DEFAULT_PROHIBITED_CUSTOMER_TERMS,
    ...(options.prohibitedTerms ?? []),
  ];
  for (const value of stringsInLineage(customerLineage)) {
    const prohibitedTerm = prohibitedTerms.find((term) =>
      value.toLocaleLowerCase().includes(term.toLocaleLowerCase())
    );
    if (prohibitedTerm) {
      errors.push(`Customer lineage contains prohibited internal term ${prohibitedTerm}.`);
    }
    if (PERSONAL_ABSOLUTE_PATH_PATTERN.test(value)) {
      errors.push('Customer lineage contains a personal absolute path.');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], lineage: customerLineage };
}

/** Produces stable JSON for hashing, review, and documentation-viewer ingestion. */
export function serializeDeliveryLineage(lineage: DeliveryLineageGraph): string {
  return `${JSON.stringify(
    {
      ...lineage,
      nodes: [...lineage.nodes].sort((left, right) => left.id.localeCompare(right.id)),
      edges: [...lineage.edges].sort((left, right) => left.id.localeCompare(right.id)),
    },
    null,
    2
  )}\n`;
}
