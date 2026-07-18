import { describe, expect, it } from 'vitest';
import { renderDeliveryLineageHtml } from '@extension/ui/deliveryLineageHtml';
import { parseDeliveryLineageViewGraph } from '@extension/ui/deliveryLineageModel';

function customerGraph(): unknown {
  return {
    schemaVersion: 'eai.delivery_lineage.v1',
    plane: 'customer',
    featureId: 'customer-onboarding',
    generatedAt: '2026-07-18T00:00:00.000Z',
    nodes: [
      {
        id: 'requirement:onboarding',
        kind: 'requirement',
        label: 'Customer onboarding',
        stage: 'requirements',
        visibility: 'customer',
        status: 'current',
        source: { repository: 'customer-app', path: 'docs/onboarding.md', anchor: '#scope' },
      },
      {
        id: 'capability:onboarding',
        kind: 'public-api-capability',
        label: 'Onboarding API',
        stage: 'architecture',
        visibility: 'public-contract',
        status: 'current',
        capabilityId: 'eai.publicapi.capability.onboarding.v1',
        contractVersion: 'v1',
      },
    ],
    edges: [
      {
        id: 'edge:onboarding',
        source: 'requirement:onboarding',
        target: 'capability:onboarding',
        relation: 'depends-on',
        visibility: 'public-contract',
        status: 'current',
      },
    ],
  };
}

describe('Gofer delivery lineage viewer', () => {
  it('parses and renders a customer-safe graph', () => {
    const graph = parseDeliveryLineageViewGraph(customerGraph(), {
      expectedPlane: 'customer',
      forbiddenTerms: ['ResourceAPI', 'tech-docs'],
    });
    const html = renderDeliveryLineageHtml(
      graph,
      { productName: 'Gofer', boundaryLabel: 'PublicAPI boundary', portableCommand: 'render' },
      'nonce'
    );

    expect(html).toContain('Gofer Delivery Lineage');
    expect(html).toContain('Customer onboarding');
    expect(html).toContain("script-src 'nonce-nonce'");
  });

  it('fails closed for internal visibility and forbidden repositories', () => {
    const graph = customerGraph() as {
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
    const graph = customerGraph() as {
      nodes: Array<{ source?: { repository: string; path: string } }>;
    };
    graph.nodes[0].source = { repository: 'customer-app', path: '../secret.md' };
    expect(() => parseDeliveryLineageViewGraph(graph, { expectedPlane: 'customer' })).toThrow(
      /repository-relative/
    );
  });
});
