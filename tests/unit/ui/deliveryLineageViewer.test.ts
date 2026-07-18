import { describe, expect, it } from 'vitest';
import { renderDeliveryLineageHtml } from '@extension/ui/deliveryLineageHtml';
import { parseDeliveryLineageViewGraph } from '@extension/ui/deliveryLineageModel';

function newCustomerFeatureGraph(): unknown {
  return {
    schemaVersion: 'eai.delivery_lineage.v1',
    plane: 'customer',
    featureId: 'customer-permit-status',
    generatedAt: '2026-07-18T00:00:00.000Z',
    nodes: [
      {
        id: 'requirement:permit-status',
        kind: 'requirement',
        label: 'New customer permit status feature',
        stage: 'requirements',
        visibility: 'customer',
        status: 'current',
        source: { repository: 'customer-app', path: 'docs/permit-status.md', anchor: '#scope' },
      },
      {
        id: 'capability:permit-status',
        kind: 'public-api-capability',
        label: 'PublicAPI permit status contract',
        stage: 'architecture',
        visibility: 'public-contract',
        status: 'current',
        capabilityId: 'eai.publicapi.capability.permit-status.v1',
        contractVersion: 'v1',
      },
    ],
    edges: [
      {
        id: 'edge:permit-status',
        source: 'requirement:permit-status',
        target: 'capability:permit-status',
        relation: 'depends-on',
        visibility: 'public-contract',
        status: 'current',
      },
    ],
  };
}

describe('Gofer delivery lineage viewer', () => {
  it('shows a new customer feature only through its PublicAPI contract', () => {
    const graph = parseDeliveryLineageViewGraph(newCustomerFeatureGraph(), {
      expectedPlane: 'customer',
      forbiddenTerms: ['ResourceAPI', 'tech-docs'],
    });
    const html = renderDeliveryLineageHtml(
      graph,
      { productName: 'Gofer', boundaryLabel: 'PublicAPI boundary', portableCommand: 'render' },
      'nonce'
    );

    expect(html).toContain('Gofer Delivery Lineage');
    expect(html).toContain('New customer permit status feature');
    expect(html).toContain('PublicAPI permit status contract');
    expect(html).not.toContain('ResourceAPI');
    expect(html).not.toContain('tech-docs');
    expect(graph.nodes.every((node) => node.visibility !== 'eai-internal')).toBe(true);
    expect(html).toContain("script-src 'nonce-nonce'");
  });

  it('fails closed for internal visibility and forbidden repositories', () => {
    const graph = newCustomerFeatureGraph() as {
      nodes: Array<{ visibility: string; source?: { repository: string; path: string } }>;
    };
    graph.nodes[0].visibility = 'eai-internal';
    expect(() => parseDeliveryLineageViewGraph(graph, { expectedPlane: 'customer' })).toThrow(
      /trust boundary/
    );

    graph.nodes[0].visibility = 'customer';
    graph.nodes[0].source = { repository: 'tech-docs', path: 'docs/roadmap.md' };
    expect(() =>
      parseDeliveryLineageViewGraph(graph, {
        expectedPlane: 'customer',
        forbiddenTerms: ['tech-docs'],
      })
    ).toThrow(/forbidden internal term/);
  });

  it('rejects source paths that escape a repository', () => {
    const graph = newCustomerFeatureGraph() as {
      nodes: Array<{ source?: { repository: string; path: string } }>;
    };
    graph.nodes[0].source = { repository: 'customer-app', path: '../secret.md' };
    expect(() => parseDeliveryLineageViewGraph(graph, { expectedPlane: 'customer' })).toThrow(
      /repository-relative/
    );
  });
});
