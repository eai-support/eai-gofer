type DeliveryLineagePlane = 'customer' | 'eai-internal';
type DeliveryLineageStatus = 'current' | 'suspect' | 'anchor-lost' | 'broken' | 'superseded';

/** Repository-relative evidence location that the panel may open safely. */
export interface DeliveryLineageSource {
  repository: string;
  path: string;
  anchor?: string;
  commit?: string;
  contentHash?: string;
}

interface DeliveryLineageViewNode {
  id: string;
  kind: string;
  label: string;
  stage: string;
  visibility: string;
  status: DeliveryLineageStatus;
  decisionOutcome?: 'selected' | 'rejected' | 'superseded';
  summary?: string;
  capabilityId?: string;
  contractVersion?: string;
  source?: DeliveryLineageSource;
}

interface DeliveryLineageViewEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  visibility: string;
  status: DeliveryLineageStatus;
  claim?: string;
}

/** Validated, customer-safe graph accepted by the Gofer webview. */
export interface DeliveryLineageViewGraph {
  schemaVersion: 'eai.delivery_lineage.v1';
  plane: DeliveryLineagePlane;
  featureId: string;
  generatedAt: string;
  nodes: DeliveryLineageViewNode[];
  edges: DeliveryLineageViewEdge[];
}

interface DeliveryLineageParseOptions {
  expectedPlane: DeliveryLineagePlane;
  forbiddenTerms?: readonly string[];
}

const STAGES = new Set([
  'intent',
  'requirements',
  'architecture',
  'delivery',
  'validation',
  'outcome',
]);
const VISIBILITIES = new Set(['customer', 'public-contract', 'eai-internal']);
const STATUSES = new Set(['current', 'suspect', 'anchor-lost', 'broken', 'superseded']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
  return value;
}

function parseSource(value: unknown, context: string): DeliveryLineageSource | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${context}.source must be an object.`);
  const repository = requiredString(value.repository, `${context}.source.repository`);
  const sourcePath = requiredString(value.path, `${context}.source.path`);
  if (
    sourcePath.startsWith('/') ||
    sourcePath.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/.test(sourcePath) ||
    sourcePath.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`${context}.source.path must be repository-relative.`);
  }
  return {
    repository,
    path: sourcePath,
    anchor: typeof value.anchor === 'string' ? value.anchor : undefined,
    commit: typeof value.commit === 'string' ? value.commit : undefined,
    contentHash: typeof value.contentHash === 'string' ? value.contentHash : undefined,
  };
}

/** Parses untrusted workspace JSON and rejects trust-boundary or path violations. */
export function parseDeliveryLineageViewGraph(
  value: unknown,
  options: DeliveryLineageParseOptions
): DeliveryLineageViewGraph {
  if (!isRecord(value)) throw new Error('Delivery lineage must be a JSON object.');
  if (value.schemaVersion !== 'eai.delivery_lineage.v1') {
    throw new Error('Unsupported delivery lineage schemaVersion.');
  }
  if (value.plane !== options.expectedPlane) {
    throw new Error(`This viewer requires the ${options.expectedPlane} trust plane.`);
  }
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error('Delivery lineage nodes and edges must be arrays.');
  }

  const nodeIds = new Set<string>();
  const nodes = value.nodes.map((entry, index): DeliveryLineageViewNode => {
    if (!isRecord(entry)) throw new Error(`nodes[${index}] must be an object.`);
    const id = requiredString(entry.id, `nodes[${index}].id`);
    if (nodeIds.has(id)) throw new Error(`Duplicate node id ${id}.`);
    nodeIds.add(id);
    const stage = requiredString(entry.stage, `Node ${id}.stage`);
    const visibility = requiredString(entry.visibility, `Node ${id}.visibility`);
    const status = requiredString(entry.status, `Node ${id}.status`);
    if (!STAGES.has(stage)) throw new Error(`Node ${id} has an invalid stage.`);
    if (!VISIBILITIES.has(visibility)) throw new Error(`Node ${id} has invalid visibility.`);
    if (!STATUSES.has(status)) throw new Error(`Node ${id} has an invalid status.`);
    const decisionOutcome =
      typeof entry.decisionOutcome === 'string' ? entry.decisionOutcome : undefined;
    if (
      decisionOutcome !== undefined &&
      !['selected', 'rejected', 'superseded'].includes(decisionOutcome)
    ) {
      throw new Error(`Node ${id} has an invalid decisionOutcome.`);
    }
    if (decisionOutcome !== undefined && entry.kind !== 'decision') {
      throw new Error(`Node ${id} uses decisionOutcome but is not a decision.`);
    }
    if (options.expectedPlane === 'customer' && visibility === 'eai-internal') {
      throw new Error(`Node ${id} crosses the customer trust boundary.`);
    }
    return {
      id,
      kind: requiredString(entry.kind, `Node ${id}.kind`),
      label: requiredString(entry.label, `Node ${id}.label`),
      stage,
      visibility,
      status: status as DeliveryLineageStatus,
      decisionOutcome: decisionOutcome as DeliveryLineageViewNode['decisionOutcome'],
      summary: typeof entry.summary === 'string' ? entry.summary : undefined,
      capabilityId: typeof entry.capabilityId === 'string' ? entry.capabilityId : undefined,
      contractVersion:
        typeof entry.contractVersion === 'string' ? entry.contractVersion : undefined,
      source: parseSource(entry.source, `Node ${id}`),
    };
  });

  const edgeIds = new Set<string>();
  const edges = value.edges.map((entry, index): DeliveryLineageViewEdge => {
    if (!isRecord(entry)) throw new Error(`edges[${index}] must be an object.`);
    const id = requiredString(entry.id, `edges[${index}].id`);
    if (edgeIds.has(id)) throw new Error(`Duplicate edge id ${id}.`);
    edgeIds.add(id);
    const source = requiredString(entry.source, `Edge ${id}.source`);
    const target = requiredString(entry.target, `Edge ${id}.target`);
    const visibility = requiredString(entry.visibility, `Edge ${id}.visibility`);
    const status = requiredString(entry.status, `Edge ${id}.status`);
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      throw new Error(`Edge ${id} references a missing node.`);
    }
    if (!VISIBILITIES.has(visibility) || !STATUSES.has(status)) {
      throw new Error(`Edge ${id} has invalid visibility or status.`);
    }
    const touchesInternal = nodes.some(
      (node) => (node.id === source || node.id === target) && node.visibility === 'eai-internal'
    );
    if (touchesInternal && visibility !== 'eai-internal') {
      throw new Error(`Edge ${id} touching an internal node must be eai-internal.`);
    }
    if (options.expectedPlane === 'customer' && visibility === 'eai-internal') {
      throw new Error(`Edge ${id} crosses the customer trust boundary.`);
    }
    return {
      id,
      source,
      target,
      relation: requiredString(entry.relation, `Edge ${id}.relation`),
      visibility,
      status: status as DeliveryLineageStatus,
      claim: typeof entry.claim === 'string' ? entry.claim : undefined,
    };
  });

  const graph: DeliveryLineageViewGraph = {
    schemaVersion: 'eai.delivery_lineage.v1',
    plane: options.expectedPlane,
    featureId: requiredString(value.featureId, 'featureId'),
    generatedAt: requiredString(value.generatedAt, 'generatedAt'),
    nodes,
    edges,
  };
  const serialized = JSON.stringify(graph).toLowerCase();
  const leakedTerm = options.forbiddenTerms?.find((term) =>
    serialized.includes(term.toLowerCase())
  );
  if (leakedTerm)
    throw new Error(`Customer lineage contains forbidden internal term ${leakedTerm}.`);
  return graph;
}
