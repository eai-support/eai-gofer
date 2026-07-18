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
    expect(html).toContain('Evidence status legend');
    expect(html).toContain('Anchor lost / broken');
    expect(html).toContain("heading.textContent = 'Connections (' + nodeEdges.length + ')'");
    expect(html).toContain(
      "sourceLink.textContent = 'Open ' + node.source.repository + ' · ' + node.source.path"
    );
    expect(html).toContain("'Open ' + node.source.repository + ' document'");
    expect(html).not.toContain('label.textContent = title(edge.relation)');
  });

  it('renders every evidence status for nodes, relationships, and the worklist', () => {
    const statuses = ['current', 'suspect', 'anchor-lost', 'broken', 'superseded'];
    for (const status of statuses) {
      const candidate = newCustomerFeatureGraph() as {
        nodes: Array<{ status: string }>;
        edges: Array<{ status: string }>;
      };
      candidate.nodes[0].status = status;
      candidate.edges[0].status = status;
      expect(() =>
        parseDeliveryLineageViewGraph(candidate, { expectedPlane: 'customer' })
      ).not.toThrow();
    }

    const graph = parseDeliveryLineageViewGraph(newCustomerFeatureGraph(), {
      expectedPlane: 'customer',
    });
    const html = renderDeliveryLineageHtml(
      graph,
      { productName: 'Gofer', boundaryLabel: 'PublicAPI boundary', portableCommand: 'render' },
      'nonce'
    );
    expect(html).toContain('.status-current');
    expect(html).toContain('.status-suspect');
    expect(html).toContain('.status-anchor-lost, .status-broken');
    expect(html).toContain('.status-superseded');
    expect(html).toContain("'work-item status-' + edge.status");
    expect(html).toContain("'connection status-' + edge.status");
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
