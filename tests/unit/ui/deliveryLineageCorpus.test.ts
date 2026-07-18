import { describe, expect, it } from 'vitest';
import { augmentDeliveryLineageWithFeatureCorpus } from '@extension/ui/deliveryLineageCorpus';
import type { DeliveryLineageViewGraph } from '@extension/ui/deliveryLineageModel';

const encode = (value: string) => new TextEncoder().encode(value);

function emptyGraph(): DeliveryLineageViewGraph {
  return {
    schemaVersion: 'eai.delivery_lineage.v1',
    plane: 'customer',
    featureId: 'complete-gofer-feature',
    generatedAt: '2026-07-18T06:30:00.000Z',
    nodes: [],
    edges: [],
  };
}

describe('Gofer feature corpus lineage', () => {
  it('indexes the complete P1-P6 corpus and explicit customer decisions', () => {
    const root = '.specify/specs/complete-gofer-feature';
    const graph = augmentDeliveryLineageWithFeatureCorpus(emptyGraph(), 'gofer', root, [
      {
        path: `${root}/research.md`,
        content: encode(
          '# Permit status research\n\n## Approved Direction\n\nUse the public contract.'
        ),
      },
      { path: `${root}/spec.md`, content: encode('# Permit status specification') },
      { path: `${root}/plan.md`, content: encode('# Permit status plan') },
      { path: `${root}/tasks.md`, content: encode('# Permit status tasks') },
      { path: `${root}/implementation-status.md`, content: encode('# Implementation status') },
      { path: `${root}/validation.md`, content: encode('# Validation evidence') },
      { path: `${root}/delivery-lineage.json`, content: encode('{}') },
    ]);

    expect(graph.nodes).toHaveLength(7);
    expect(graph.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining([
        'P1 Research · Permit status research',
        'P2 Specify · Permit status specification',
        'P3 Plan · Permit status plan',
        'P4 Tasks · Permit status tasks',
        'P5 Implement · Implementation status',
        'P6 Validate · Validation evidence',
        'P1 Decision · Approved Direction',
      ])
    );
    expect(graph.edges.filter((edge) => edge.relation === 'records-decision')).toHaveLength(1);
  });

  it('rejects an internal EAI term discovered in a customer feature artifact', () => {
    const root = '.specify/specs/complete-gofer-feature';
    expect(() =>
      augmentDeliveryLineageWithFeatureCorpus(
        emptyGraph(),
        'gofer',
        root,
        [{ path: `${root}/research.md`, content: encode('# Internal ResourceAPI design') }],
        ['ResourceAPI', 'tech-docs']
      )
    ).toThrow(/forbidden internal term ResourceAPI/);
  });
});
