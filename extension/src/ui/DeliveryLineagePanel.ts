import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  augmentDeliveryLineageWithFeatureCorpus,
  type DeliveryLineageCorpusArtifact,
} from './deliveryLineageCorpus';
import { renderDeliveryLineageHtml } from './deliveryLineageHtml';
import {
  parseDeliveryLineageViewGraph,
  type DeliveryLineageSource,
  type DeliveryLineageViewGraph,
} from './deliveryLineageModel';

const FORBIDDEN_CUSTOMER_TERMS = [
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

interface LineageSelection extends vscode.QuickPickItem {
  uri: vscode.Uri;
}

async function selectManifest(): Promise<vscode.Uri | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    vscode.window.showErrorMessage('Open a Gofer workspace before showing delivery lineage.');
    return undefined;
  }
  const manifests = (
    await Promise.all(
      workspaceFolders.map((folder) =>
        vscode.workspace.findFiles(
          new vscode.RelativePattern(folder, '.specify/specs/*/delivery-lineage.json')
        )
      )
    )
  ).flat();
  if (manifests.length === 0) {
    vscode.window.showWarningMessage(
      'No delivery-lineage.json found. Run Gofer Start or the gofer-documentation skill first.'
    );
    return undefined;
  }
  if (manifests.length === 1) return manifests[0];

  const picks: LineageSelection[] = manifests.map((uri) => ({
    label: path.basename(path.dirname(uri.fsPath)),
    description: vscode.workspace.asRelativePath(uri, false),
    uri,
  }));
  return (await vscode.window.showQuickPick(picks, { placeHolder: 'Choose a feature graph' }))?.uri;
}

async function loadGraph(uri: vscode.Uri): Promise<DeliveryLineageViewGraph> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  let graph = parseDeliveryLineageViewGraph(JSON.parse(Buffer.from(bytes).toString('utf8')), {
    expectedPlane: 'customer',
    forbiddenTerms: FORBIDDEN_CUSTOMER_TERMS,
  });
  const manifestWorkspace = vscode.workspace.getWorkspaceFolder(uri);
  if (!manifestWorkspace)
    throw new Error('The delivery lineage manifest is outside the workspace.');
  const featureFolder = path.dirname(uri.fsPath);
  const featureRoot = path
    .relative(manifestWorkspace.uri.fsPath, featureFolder)
    .replaceAll(path.sep, '/');
  const corpusUris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(featureFolder, '**/*.{md,json}')
  );
  const corpus: DeliveryLineageCorpusArtifact[] = await Promise.all(
    corpusUris.map(async (corpusUri) => ({
      path: path.relative(manifestWorkspace.uri.fsPath, corpusUri.fsPath).replaceAll(path.sep, '/'),
      content: await vscode.workspace.fs.readFile(corpusUri),
    }))
  );
  graph = augmentDeliveryLineageWithFeatureCorpus(
    graph,
    path.basename(manifestWorkspace.uri.fsPath),
    featureRoot,
    corpus,
    FORBIDDEN_CUSTOMER_TERMS
  );
  return graph;
}

function isSafeRepositoryName(repository: string): boolean {
  return !repository.includes('/') && !repository.includes('\\') && repository !== '..';
}

async function resolveSourceUri(
  manifestUri: vscode.Uri,
  source: DeliveryLineageSource
): Promise<vscode.Uri | undefined> {
  if (!isSafeRepositoryName(source.repository)) return undefined;
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const candidates = workspaceFolders
    .filter(
      (folder) => path.basename(folder.uri.fsPath).toLowerCase() === source.repository.toLowerCase()
    )
    .map((folder) => folder.uri.fsPath);

  for (const repositoryRoot of [...new Set(candidates)]) {
    const target = path.resolve(repositoryRoot, source.path);
    const relative = path.relative(repositoryRoot, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(target));
      return vscode.Uri.file(target);
    } catch {
      continue;
    }
  }
  return undefined;
}

function anchorSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#+\s*/, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

async function openSource(
  manifestUri: vscode.Uri,
  graph: DeliveryLineageViewGraph,
  nodeId: string
) {
  const source = graph.nodes.find((node) => node.id === nodeId)?.source;
  if (!source) return;
  const sourceUri = await resolveSourceUri(manifestUri, source);
  if (!sourceUri) {
    vscode.window.showWarningMessage(
      `Source is not available in the open customer workspace: ${source.repository}/${source.path}`
    );
    return;
  }
  const document = await vscode.workspace.openTextDocument(sourceUri);
  const editor = await vscode.window.showTextDocument(document, { preview: true });
  if (!source.anchor) return;
  const wanted = anchorSlug(source.anchor);
  const line = document
    .getText()
    .split(/\r?\n/)
    .findIndex((candidate) => anchorSlug(candidate) === wanted);
  if (line >= 0) editor.revealRange(new vscode.Range(line, 0, line, 0));
}

async function openPortableDiagram(manifestUri: vscode.Uri, command: string) {
  const diagramUri = vscode.Uri.file(
    path.join(path.dirname(manifestUri.fsPath), 'delivery-lineage.md')
  );
  try {
    await vscode.workspace.fs.stat(diagramUri);
    await vscode.commands.executeCommand('markdown.showPreview', diagramUri);
  } catch {
    vscode.window.showInformationMessage(`Generate the portable diagram first: ${command}`);
  }
}

/** Opens only a validated customer-plane manifest in the interactive viewer. */
export async function showDeliveryLineagePanel(): Promise<void> {
  const manifestUri = await selectManifest();
  if (!manifestUri) return;
  let graph = await loadGraph(manifestUri);
  const panel = vscode.window.createWebviewPanel(
    'gofer.deliveryLineage',
    `Gofer Lineage: ${graph.featureId}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  const update = () => {
    const command = `node .specify/scripts/node/render-delivery-lineage.mjs --input ${vscode.workspace.asRelativePath(manifestUri, false)}`;
    panel.title = `Gofer Lineage: ${graph.featureId}`;
    panel.webview.html = renderDeliveryLineageHtml(
      graph,
      {
        productName: 'Gofer',
        boundaryLabel: 'Customer-safe view · EAI dependencies stop at PublicAPI',
        portableCommand: command,
      },
      randomBytes(16).toString('hex')
    );
  };
  update();
  panel.webview.onDidReceiveMessage(async (message: unknown) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return;
    if (
      message.type === 'openSource' &&
      'nodeId' in message &&
      typeof message.nodeId === 'string'
    ) {
      await openSource(manifestUri, graph, message.nodeId);
    } else if (
      message.type === 'openPortable' &&
      'command' in message &&
      typeof message.command === 'string'
    ) {
      await openPortableDiagram(manifestUri, message.command);
    } else if (message.type === 'refresh') {
      try {
        graph = await loadGraph(manifestUri);
        update();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Unable to refresh delivery lineage: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  });
}
