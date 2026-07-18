import { describe, expect, it } from 'vitest';
import {
  DELIVERY_LINEAGE_SCHEMA_VERSION,
  projectCustomerDeliveryLineage,
  serializeDeliveryLineage,
  validateDeliveryLineage,
  type DeliveryLineageGraph,
} from '../../../src/headless/index.js';

function createInternalLineage(): DeliveryLineageGraph {
  return {
    schemaVersion: DELIVERY_LINEAGE_SCHEMA_VERSION,
    plane: 'eai-internal',
    featureId: 'customer-document-search',
    generatedAt: '2026-07-18T04:00:00.000Z',
    nodes: [
      {
        id: 'requirement:search',
        kind: 'requirement',
        label: 'Search customer documents',
        stage: 'requirements',
        visibility: 'customer',
        status: 'current',
        source: {
          repository: 'customer-app',
          path: '.specify/specs/document-search/spec.md',
          anchor: '#document-search',
          commit: '1234567',
        },
      },
      {
        id: 'capability:document-search',
        kind: 'public-api-capability',
        label: 'EAI document search',
        stage: 'architecture',
        visibility: 'public-contract',
        status: 'current',
        capabilityId: 'eai.publicapi.capability.document-search.v1',
        contractVersion: '2026-07-18',
        source: {
          repository: 'PublicAPI',
          path: 'openapi/publicapi-v4.json',
          commit: 'abcdef0',
        },
      },
      {
        id: 'service:resource-api',
        kind: 'service',
        label: 'ResourceAPI document query',
        stage: 'delivery',
        visibility: 'eai-internal',
        status: 'current',
        source: {
          repository: 'ResourceAPI',
          path: 'src/services/query.py',
          commit: 'fedcba9',
        },
      },
    ],
    edges: [
      {
        id: 'edge:requirement-capability',
        source: 'requirement:search',
        target: 'capability:document-search',
        relation: 'depends-on',
        visibility: 'public-contract',
        status: 'current',
        origin: 'human-directed',
        verifiedBy: 'human',
        verifiedAt: '2026-07-18T04:00:00.000Z',
      },
      {
        id: 'edge:capability-service',
        source: 'capability:document-search',
        target: 'service:resource-api',
        relation: 'implements',
        visibility: 'eai-internal',
        status: 'current',
        origin: 'agent-initiated',
        verifiedBy: 'agent',
        verifiedAt: '2026-07-18T04:00:00.000Z',
      },
    ],
  };
}

describe('delivery lineage contract', () => {
  it('validates a full internal graph joined at a PublicAPI capability', () => {
    expect(validateDeliveryLineage(createInternalLineage())).toEqual({ valid: true, errors: [] });
  });

  it('projects a physically separate customer graph that stops at PublicAPI', () => {
    const result = projectCustomerDeliveryLineage(createInternalLineage(), {
      allowedRepositories: ['customer-app'],
    });

    expect(result).toMatchObject({ valid: true, errors: [] });
    expect(result.lineage?.plane).toBe('customer');
    expect(result.lineage?.nodes.map((node) => node.id)).toEqual([
      'requirement:search',
      'capability:document-search',
    ]);
    expect(result.lineage?.edges.map((edge) => edge.id)).toEqual(['edge:requirement-capability']);
    expect(JSON.stringify(result.lineage)).not.toContain('ResourceAPI');
  });

  it('fails closed when a customer-visible node leaks an internal repository', () => {
    const graph = createInternalLineage();
    const leaked: DeliveryLineageGraph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'requirement:search'
          ? {
              ...node,
              label: 'Search backed by Configurator',
              source: { repository: 'tech-docs', path: 'docs/architecture/search.md' },
            }
          : node
      ),
    };

    const result = projectCustomerDeliveryLineage(leaked, {
      allowedRepositories: ['customer-app'],
    });

    expect(result.valid).toBe(false);
    expect(result.lineage).toBeUndefined();
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('not customer-allowlisted'),
        expect.stringContaining('prohibited internal term Configurator'),
        expect.stringContaining('prohibited internal term tech-docs'),
      ])
    );
  });

  it('rejects internal edges disguised as customer-visible relationships', () => {
    const graph = createInternalLineage();
    const invalid: DeliveryLineageGraph = {
      ...graph,
      edges: graph.edges.map((edge) =>
        edge.id === 'edge:capability-service' ? { ...edge, visibility: 'public-contract' } : edge
      ),
    };

    expect(validateDeliveryLineage(invalid)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        'Edge edge:capability-service touching an internal node must use eai-internal visibility.',
      ]),
    });
  });

  it('rejects unsafe paths and malformed PublicAPI capability identifiers', () => {
    const graph = createInternalLineage();
    const invalid: DeliveryLineageGraph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'capability:document-search'
          ? {
              ...node,
              capabilityId: 'document-search',
              source: { ...node.source!, path: '/Users/engineer/private/openapi.json' },
            }
          : node
      ),
    };

    expect(validateDeliveryLineage(invalid)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.stringContaining('capabilityId must use the EAI PublicAPI capability format'),
        expect.stringContaining('path must be a safe repository-relative path'),
      ]),
    });
  });

  it('serializes nodes and edges deterministically for hashing', () => {
    const graph = createInternalLineage();
    const reversed: DeliveryLineageGraph = {
      ...graph,
      nodes: [...graph.nodes].reverse(),
      edges: [...graph.edges].reverse(),
    };

    expect(serializeDeliveryLineage(reversed)).toBe(serializeDeliveryLineage(graph));
    expect(serializeDeliveryLineage(graph)).toMatch(/\n$/);
  });
});
