import { createHash } from 'node:crypto';
import * as path from 'node:path';
import type { DeliveryLineageViewGraph } from './deliveryLineageModel';

/** Feature-local artifact read from the same Gofer corpus as the manifest. */
export interface DeliveryLineageCorpusArtifact {
  path: string;
  content: Uint8Array;
}

interface CorpusPhase {
  code: string;
  name: string;
  stage: string;
  kind: string;
  preferred: readonly string[];
}

interface ClassifiedArtifact {
  phase: CorpusPhase;
  relativePath: string;
  title: string;
  decisions: readonly string[];
}

const PHASES = {
  p1: {
    code: 'P1',
    name: 'Research',
    stage: 'intent',
    kind: 'artifact',
    preferred: ['research.md', 'discovery.md', 'problem-brief.md'],
  },
  p2: {
    code: 'P2',
    name: 'Specify',
    stage: 'requirements',
    kind: 'requirement',
    preferred: ['spec.md', 'spec-summary.md', 'assumptions.md'],
  },
  p3: {
    code: 'P3',
    name: 'Plan',
    stage: 'architecture',
    kind: 'architecture',
    preferred: ['plan.md', 'data-model.md', 'quickstart.md'],
  },
  p4: {
    code: 'P4',
    name: 'Tasks',
    stage: 'delivery',
    kind: 'work-order',
    preferred: ['tasks.md', 'traceability.md', 'issues.md'],
  },
  p5: {
    code: 'P5',
    name: 'Implement',
    stage: 'delivery',
    kind: 'artifact',
    preferred: ['implementation-status.md', 'tdd-session.md', 'audit-history.md'],
  },
  p6: {
    code: 'P6',
    name: 'Validate',
    stage: 'validation',
    kind: 'test',
    preferred: ['validation.md', 'validation-report.md', 'engineering-review-report.md'],
  },
  other: {
    code: 'Feature',
    name: 'Artifact',
    stage: 'requirements',
    kind: 'documentation-file',
    preferred: [],
  },
} as const satisfies Record<string, CorpusPhase>;

const P1_NAMES = new Set([
  'research',
  'discovery',
  'problem-brief',
  'working-backwards-prfaq',
  'business-analysis',
  'market-analysis',
  'proposal-review',
  'context-bundle',
  'reuse-scan',
  'build-map',
  'eai-preflight',
  'ui-preview-brief',
  'execution-profile',
]);
const P2_NAMES = new Set([
  'spec',
  'spec-summary',
  'glossary',
  'assumptions',
  'contract-pack',
  'business-owner-summary',
]);
const P3_NAMES = new Set([
  'plan',
  'data-model',
  'quickstart',
  'cto-architecture-summary',
  'service-fit-matrix',
  'ui-review-log',
  'ui-show-and-tell',
]);
const P4_NAMES = new Set(['tasks', 'traceability', 'issues', 'workflow-dag', 'loop-contract']);
const P5_NAMES = new Set([
  'implementation-status',
  'implementation-skill-evidence',
  'tdd-session',
  'diagnose-report',
  'doc-consistency-scan',
  'audit-history',
  'session-checkpoint',
]);
const P6_NAMES = new Set([
  'validation',
  'validation-report',
  'engineering-review-report',
  'blast-radius-report',
  'remediation-report',
  'goal-rebaseline-report',
  'loop-audit-report',
]);

function fileStem(relativePath: string): string {
  return path.posix.basename(relativePath, path.posix.extname(relativePath)).toLowerCase();
}

function humanize(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function titleFromContent(relativePath: string, content: string): string {
  const frontmatter = content.match(/^---\s*[\r\n]+[\s\S]*?^title:\s*["']?([^\r\n"']+)/m)?.[1];
  const heading = content.match(/^#\s+(.+)$/m)?.[1];
  return (frontmatter ?? heading ?? humanize(fileStem(relativePath))).trim().slice(0, 120);
}

function decisionHeadings(content: string): string[] {
  const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1].trim());
  return [
    ...new Set(
      headings.filter((heading) =>
        /\b(decision|decisions|selected approach|approved direction|chosen option|recommendation)\b/i.test(
          heading
        )
      )
    ),
  ].slice(0, 30);
}

function classify(relativePath: string, content: string): ClassifiedArtifact {
  const stem = fileStem(relativePath);
  let phase: CorpusPhase = PHASES.other;
  if (P1_NAMES.has(stem)) phase = PHASES.p1;
  else if (P2_NAMES.has(stem) || relativePath.startsWith('checklists/')) phase = PHASES.p2;
  else if (
    P3_NAMES.has(stem) ||
    relativePath.startsWith('contracts/') ||
    relativePath.startsWith('visuals/') ||
    relativePath.startsWith('sequence-diagrams/')
  )
    phase = PHASES.p3;
  else if (P4_NAMES.has(stem)) phase = PHASES.p4;
  else if (P5_NAMES.has(stem)) phase = PHASES.p5;
  else if (P6_NAMES.has(stem)) phase = PHASES.p6;
  return {
    phase,
    relativePath,
    title: titleFromContent(relativePath, content),
    decisions: relativePath.endsWith('.md') ? decisionHeadings(content) : [],
  };
}

function stableId(prefix: string, value: string): string {
  return `${prefix}:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function phaseSort(phase: CorpusPhase, left: string, right: string): number {
  const leftRank = phase.preferred.indexOf(left);
  const rightRank = phase.preferred.indexOf(right);
  if (leftRank >= 0 || rightRank >= 0) {
    if (leftRank < 0) return 1;
    if (rightRank < 0) return -1;
    return leftRank - rightRank;
  }
  return left.localeCompare(right);
}

/** Adds every P1-P6 artifact and decision while preserving the customer trust boundary. */
export function augmentDeliveryLineageWithFeatureCorpus(
  graph: DeliveryLineageViewGraph,
  repository: string,
  featureRoot: string,
  artifacts: readonly DeliveryLineageCorpusArtifact[],
  forbiddenTerms: readonly string[] = []
): DeliveryLineageViewGraph {
  const normalizedRoot = featureRoot.replaceAll('\\', '/').replace(/\/$/, '');
  const nodes: DeliveryLineageViewGraph['nodes'] = graph.nodes.map((node) => ({ ...node }));
  const edges: DeliveryLineageViewGraph['edges'] = graph.edges.map((edge) => ({ ...edge }));
  const nodeBySource = new Map(
    nodes
      .filter((node) => node.source?.repository === repository)
      .map((node) => [node.source?.path, node.id] as const)
  );
  const edgeIds = new Set(edges.map((edge) => edge.id));
  const phaseArtifacts = new Map<string, Array<{ nodeId: string; relativePath: string }>>();
  const phases = new Map<string, CorpusPhase>();

  const addEdge = (edge: DeliveryLineageViewGraph['edges'][number]) => {
    if (!edgeIds.has(edge.id)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };

  for (const artifact of artifacts) {
    const sourcePath = artifact.path.replaceAll('\\', '/');
    if (!sourcePath.startsWith(`${normalizedRoot}/`)) continue;
    const relativePath = sourcePath.slice(normalizedRoot.length + 1);
    if (
      !/\.(md|json)$/i.test(relativePath) ||
      /^delivery-lineage\.(md|json)$/i.test(relativePath)
    ) {
      continue;
    }
    const content = Buffer.from(artifact.content).toString('utf8');
    const leakedTerm = forbiddenTerms.find((term) =>
      content.toLowerCase().includes(term.toLowerCase())
    );
    if (leakedTerm) {
      throw new Error(
        `Customer feature artifact ${relativePath} contains forbidden internal term ${leakedTerm}.`
      );
    }
    const classified = classify(relativePath, content);
    phases.set(classified.phase.code, classified.phase);
    let nodeId = nodeBySource.get(sourcePath);
    if (!nodeId) {
      nodeId = stableId('corpus', sourcePath);
      nodes.push({
        id: nodeId,
        kind: classified.phase.kind,
        label: `${classified.phase.code} ${classified.phase.name} · ${classified.title}`,
        stage: classified.phase.stage,
        visibility: 'customer',
        status: 'current',
        summary: `Feature artifact indexed from ${relativePath}.`,
        source: { repository, path: sourcePath },
      });
      nodeBySource.set(sourcePath, nodeId);
    }
    const phaseItems = phaseArtifacts.get(classified.phase.code) ?? [];
    phaseItems.push({ nodeId, relativePath });
    phaseArtifacts.set(classified.phase.code, phaseItems);

    for (const decision of classified.decisions) {
      const decisionId = stableId('decision', `${sourcePath}#${decision}`);
      if (!nodes.some((node) => node.id === decisionId)) {
        nodes.push({
          id: decisionId,
          kind: 'decision',
          label: `${classified.phase.code} Decision · ${decision}`,
          stage: classified.phase.stage,
          visibility: 'customer',
          status: 'current',
          source: { repository, path: sourcePath, anchor: decision },
        });
      }
      addEdge({
        id: stableId('corpus-edge', `${nodeId}:records-decision:${decisionId}`),
        source: nodeId,
        target: decisionId,
        relation: 'records-decision',
        visibility: 'customer',
        status: 'current',
      });
    }
  }

  const orderedPhases = [...phaseArtifacts.keys()].sort((left, right) => {
    const order = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'Feature'];
    return order.indexOf(left) - order.indexOf(right);
  });
  let previousAnchor: string | undefined;
  for (const code of orderedPhases) {
    const phase = phases.get(code) ?? PHASES.other;
    const items = (phaseArtifacts.get(code) ?? []).sort((left, right) =>
      phaseSort(phase, left.relativePath, right.relativePath)
    );
    const anchor = items[0]?.nodeId;
    if (!anchor) continue;
    if (previousAnchor) {
      addEdge({
        id: stableId('corpus-edge', `${previousAnchor}:informs:${anchor}`),
        source: previousAnchor,
        target: anchor,
        relation: 'informs',
        visibility: 'customer',
        status: 'current',
      });
    }
    for (const item of items.slice(1)) {
      addEdge({
        id: stableId('corpus-edge', `${anchor}:supports:${item.nodeId}`),
        source: anchor,
        target: item.nodeId,
        relation: 'supports',
        visibility: 'customer',
        status: 'current',
      });
    }
    previousAnchor = anchor;
  }

  return { ...graph, nodes, edges };
}
