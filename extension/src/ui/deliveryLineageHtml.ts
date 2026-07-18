import type { DeliveryLineageViewGraph } from './deliveryLineageModel';

interface DeliveryLineageHtmlOptions {
  productName: string;
  boundaryLabel: string;
  portableCommand: string;
}

function encodeGraph(graph: DeliveryLineageViewGraph): string {
  return JSON.stringify(graph)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Renders a CSP-restricted graph whose untrusted labels are populated as text. */
export function renderDeliveryLineageHtml(
  graph: DeliveryLineageViewGraph,
  options: DeliveryLineageHtmlOptions,
  nonce: string
): string {
  const encodedGraph = encodeGraph(graph);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    :root { color-scheme: light dark; --line: var(--vscode-panel-border); --muted: var(--vscode-descriptionForeground); }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px/1.4 var(--vscode-font-family); }
    header { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
    h1 { margin: 0; font-size: 18px; }
    .boundary { color: var(--muted); }
    .stats { margin-left: auto; display: flex; gap: 12px; color: var(--muted); }
    .toolbar { display: flex; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
    input, select, button { border: 1px solid var(--vscode-input-border, var(--line)); color: var(--vscode-input-foreground); background: var(--vscode-input-background); padding: 6px 9px; }
    input { min-width: 280px; }
    button { cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button:hover { background: var(--vscode-button-hoverBackground); }
    main { display: grid; grid-template-columns: minmax(0, 1fr) 290px; height: calc(100vh - 104px); }
    .graph-scroll { overflow: auto; padding: 18px; }
    .canvas { position: relative; min-width: 1420px; min-height: 560px; }
    svg { position: absolute; inset: 0; z-index: 0; overflow: visible; pointer-events: none; }
    .edge { fill: none; stroke: var(--vscode-descriptionForeground); stroke-width: 1.4; opacity: .32; }
    .edge.active { stroke: var(--vscode-focusBorder); stroke-width: 2.4; opacity: 1; }
    .edge.dim { opacity: .06; }
    .edge-label { fill: var(--vscode-descriptionForeground); font-size: 10px; opacity: .72; }
    .edge-label.dim { opacity: .05; }
    .stage-grid { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(6, minmax(210px, 1fr)); gap: 18px; align-items: start; }
    .stage { min-height: 510px; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--vscode-sideBar-background) 65%, transparent); }
    .stage h2 { position: sticky; top: 0; z-index: 2; margin: 0; padding: 10px 12px; border-bottom: 1px solid var(--line); background: var(--vscode-sideBar-background); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .stage-nodes { display: grid; gap: 12px; padding: 12px; }
    .node { position: relative; z-index: 2; text-align: left; width: 100%; min-height: 76px; padding: 10px; border: 1px solid var(--line); border-left: 4px solid #2e7d32; border-radius: 6px; color: var(--vscode-foreground); background: var(--vscode-editor-background); box-shadow: 0 2px 8px rgba(0,0,0,.12); }
    .node:hover, .node.selected { border-color: var(--vscode-focusBorder); outline: 1px solid var(--vscode-focusBorder); }
    .node.connected { border-color: var(--vscode-focusBorder); }
    .node.attention { border-left-color: #ef6c00; }
    .node.internal { background: color-mix(in srgb, #5e35b1 12%, var(--vscode-editor-background)); }
    .node.public { background: color-mix(in srgb, #2e7d32 12%, var(--vscode-editor-background)); }
    .node-kind { display: block; margin-bottom: 4px; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
    .node-label { display: block; font-weight: 600; }
    .node-status { display: block; margin-top: 5px; color: var(--muted); font-size: 11px; }
    aside { overflow: auto; padding: 16px; border-left: 1px solid var(--line); background: var(--vscode-sideBar-background); }
    aside h2, aside h3 { margin: 0 0 10px; font-size: 13px; }
    .empty { color: var(--muted); }
    .details { display: grid; gap: 9px; margin-bottom: 22px; }
    .field { overflow-wrap: anywhere; }
    .field span { display: block; color: var(--muted); font-size: 10px; text-transform: uppercase; }
    .worklist { display: grid; gap: 8px; }
    .work-item { padding: 8px; border: 1px solid var(--line); border-left: 3px solid #ef6c00; border-radius: 4px; }
    .hidden { display: none !important; }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; } aside { display: none; } }
  </style>
</head>
<body>
  <header>
    <div><h1>${options.productName} Delivery Lineage</h1><div class="boundary">${options.boundaryLabel}</div></div>
    <div class="stats"><span id="nodeCount"></span><span id="edgeCount"></span><span id="attentionCount"></span></div>
  </header>
  <div class="toolbar">
    <input id="search" type="search" placeholder="Search nodes, sources, capabilities…">
    <select id="statusFilter"><option value="all">All evidence</option><option value="current">Current only</option><option value="attention">Needs attention</option></select>
    <button id="refresh">Refresh</button>
    <button id="portable">Open Mermaid</button>
  </div>
  <main>
    <section class="graph-scroll"><div class="canvas" id="canvas"><svg id="edges" aria-hidden="true"></svg><div class="stage-grid" id="stageGrid"></div></div></section>
    <aside><h2 id="feature"></h2><div id="details" class="details empty">Select a node to inspect its evidence and connections.</div><h3>Evidence worklist</h3><div id="worklist" class="worklist"></div></aside>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const graph = ${encodedGraph};
    const stages = ['intent','requirements','architecture','delivery','validation','outcome'];
    const nodeById = new Map(graph.nodes.map(function(node) { return [node.id, node]; }));
    let selectedId = null;
    let visibleIds = new Set();
    const title = function(value) { return String(value || '').split('-').map(function(part) { return part.charAt(0).toUpperCase() + part.slice(1); }).join(' '); };
    const addText = function(parent, className, text) { const element = document.createElement('span'); element.className = className; element.textContent = text; parent.appendChild(element); return element; };
    const matches = function(node) {
      const query = document.getElementById('search').value.trim().toLowerCase();
      const filter = document.getElementById('statusFilter').value;
      if (filter === 'current' && node.status !== 'current') return false;
      if (filter === 'attention' && node.status === 'current') return false;
      if (!query) return true;
      return [node.label,node.kind,node.summary,node.capabilityId,node.source && node.source.repository,node.source && node.source.path].filter(Boolean).join(' ').toLowerCase().includes(query);
    };
    function render() {
      const grid = document.getElementById('stageGrid');
      grid.replaceChildren();
      visibleIds = new Set(graph.nodes.filter(matches).map(function(node) { return node.id; }));
      stages.forEach(function(stageName) {
        const stage = document.createElement('section'); stage.className = 'stage';
        const heading = document.createElement('h2'); heading.textContent = title(stageName); stage.appendChild(heading);
        const nodes = document.createElement('div'); nodes.className = 'stage-nodes';
        graph.nodes.filter(function(node) { return node.stage === stageName && visibleIds.has(node.id); }).forEach(function(node) {
          const card = document.createElement('button'); card.className = 'node'; card.dataset.nodeId = node.id;
          if (node.status !== 'current') card.classList.add('attention');
          if (node.visibility === 'eai-internal') card.classList.add('internal');
          if (node.visibility === 'public-contract') card.classList.add('public');
          addText(card, 'node-kind', title(node.kind)); addText(card, 'node-label', node.label); addText(card, 'node-status', title(node.status));
          card.addEventListener('click', function() { selectNode(node.id); }); nodes.appendChild(card);
        });
        stage.appendChild(nodes); grid.appendChild(stage);
      });
      document.getElementById('nodeCount').textContent = visibleIds.size + ' nodes';
      document.getElementById('edgeCount').textContent = graph.edges.filter(function(edge) { return visibleIds.has(edge.source) && visibleIds.has(edge.target); }).length + ' edges';
      const attention = graph.nodes.filter(function(node) { return node.status !== 'current'; }).length + graph.edges.filter(function(edge) { return edge.status !== 'current'; }).length;
      document.getElementById('attentionCount').textContent = attention + ' need attention';
      document.getElementById('feature').textContent = graph.featureId;
      renderWorklist(); requestAnimationFrame(drawEdges);
    }
    function drawEdges() {
      const svg = document.getElementById('edges'); const canvas = document.getElementById('canvas'); const canvasRect = canvas.getBoundingClientRect();
      svg.replaceChildren(); svg.setAttribute('width', String(canvas.scrollWidth)); svg.setAttribute('height', String(Math.max(canvas.scrollHeight, 560)));
      const definitions = document.createElementNS('http://www.w3.org/2000/svg','defs');
      const marker = document.createElementNS('http://www.w3.org/2000/svg','marker'); marker.setAttribute('id','arrow'); marker.setAttribute('viewBox','0 0 10 10'); marker.setAttribute('refX','9'); marker.setAttribute('refY','5'); marker.setAttribute('markerWidth','6'); marker.setAttribute('markerHeight','6'); marker.setAttribute('orient','auto-start-reverse');
      const arrow = document.createElementNS('http://www.w3.org/2000/svg','path'); arrow.setAttribute('d','M 0 0 L 10 5 L 0 10 z'); arrow.setAttribute('fill','currentColor'); marker.appendChild(arrow); definitions.appendChild(marker); svg.appendChild(definitions);
      graph.edges.filter(function(edge) { return visibleIds.has(edge.source) && visibleIds.has(edge.target); }).forEach(function(edge) {
        const from = document.querySelector('[data-node-id="' + CSS.escape(edge.source) + '"]'); const to = document.querySelector('[data-node-id="' + CSS.escape(edge.target) + '"]'); if (!from || !to) return;
        const a = from.getBoundingClientRect(); const b = to.getBoundingClientRect(); const x1 = a.right - canvasRect.left; const y1 = a.top + a.height / 2 - canvasRect.top; const x2 = b.left - canvasRect.left; const y2 = b.top + b.height / 2 - canvasRect.top; const bend = Math.max(35, Math.abs(x2 - x1) * .42);
        const path = document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d','M ' + x1 + ' ' + y1 + ' C ' + (x1 + bend) + ' ' + y1 + ', ' + (x2 - bend) + ' ' + y2 + ', ' + x2 + ' ' + y2); path.setAttribute('marker-end','url(#arrow)'); path.classList.add('edge');
        const connected = !selectedId || edge.source === selectedId || edge.target === selectedId; if (selectedId) path.classList.add(connected ? 'active' : 'dim'); svg.appendChild(path);
        const label = document.createElementNS('http://www.w3.org/2000/svg','text'); label.setAttribute('x',String((x1+x2)/2)); label.setAttribute('y',String((y1+y2)/2-5)); label.setAttribute('text-anchor','middle'); label.textContent = title(edge.relation); label.classList.add('edge-label'); if (selectedId && !connected) label.classList.add('dim'); svg.appendChild(label);
      });
    }
    function selectNode(id) {
      selectedId = id; const connected = new Set([id]); graph.edges.forEach(function(edge) { if (edge.source === id) connected.add(edge.target); if (edge.target === id) connected.add(edge.source); });
      document.querySelectorAll('.node').forEach(function(card) { card.classList.toggle('selected', card.dataset.nodeId === id); card.classList.toggle('connected', card.dataset.nodeId !== id && connected.has(card.dataset.nodeId)); });
      const node = nodeById.get(id); const details = document.getElementById('details'); details.className = 'details'; details.replaceChildren();
      [['Kind',title(node.kind)],['Stage',title(node.stage)],['Status',title(node.status)],['Visibility',title(node.visibility)],['Summary',node.summary],['Capability',node.capabilityId],['Contract',node.contractVersion],['Repository',node.source && node.source.repository],['Path',node.source && node.source.path],['Anchor',node.source && node.source.anchor],['Commit',node.source && node.source.commit]].forEach(function(pair) { if (!pair[1]) return; const field = document.createElement('div'); field.className = 'field'; addText(field,'',pair[0]); field.lastChild.className = ''; field.lastChild.style.display = 'block'; field.lastChild.style.color = 'var(--muted)'; addText(field,'',String(pair[1])); details.appendChild(field); });
      if (node.source) { const button = document.createElement('button'); button.textContent = 'Open source'; button.addEventListener('click',function() { vscode.postMessage({ type:'openSource', nodeId:id }); }); details.appendChild(button); }
      drawEdges();
    }
    function renderWorklist() { const list = document.getElementById('worklist'); list.replaceChildren(); const items = graph.nodes.filter(function(node) { return node.status !== 'current'; }); if (!items.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'All evidence is current.'; list.appendChild(empty); return; } items.forEach(function(node) { const item = document.createElement('button'); item.className = 'work-item'; item.textContent = title(node.status) + ': ' + node.label; item.addEventListener('click',function() { selectNode(node.id); }); list.appendChild(item); }); }
    document.getElementById('search').addEventListener('input',render); document.getElementById('statusFilter').addEventListener('change',render); document.getElementById('refresh').addEventListener('click',function(){ vscode.postMessage({type:'refresh'}); }); document.getElementById('portable').addEventListener('click',function(){ vscode.postMessage({type:'openPortable', command:${JSON.stringify(options.portableCommand)} }); }); window.addEventListener('resize',function(){ requestAnimationFrame(drawEdges); });
    render();
  </script>
</body>
</html>`;
}
