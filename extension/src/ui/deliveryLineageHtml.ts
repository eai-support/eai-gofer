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
    .toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
    .legend { margin-left: auto; display: flex; flex-wrap: wrap; gap: 8px; color: var(--muted); font-size: 11px; }
    .legend-item { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
    .legend-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--status-color); }
    .decision-banner { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-bottom: 1px solid var(--line); border-left: 5px solid var(--vscode-focusBorder); background: color-mix(in srgb, var(--vscode-focusBorder) 10%, var(--vscode-editor-background)); }
    .decision-copy { min-width: 0; flex: 1; }
    .decision-eyebrow { display: block; color: var(--vscode-focusBorder); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
    .decision-label { display: block; font-size: 13px; font-weight: 700; }
    .decision-summary { display: block; overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    input, select, button { border: 1px solid var(--vscode-input-border, var(--line)); color: var(--vscode-input-foreground); background: var(--vscode-input-background); padding: 6px 9px; }
    input { min-width: 280px; }
    button { cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button:hover { background: var(--vscode-button-hoverBackground); }
    main { display: grid; grid-template-columns: minmax(0, 1fr) 360px; height: calc(100vh - 158px); }
    .graph-scroll { overflow: auto; padding: 18px; }
    .canvas { position: relative; min-width: 1540px; min-height: 560px; }
    svg { position: absolute; inset: 0; z-index: 0; overflow: visible; pointer-events: none; }
    .edge { fill: none; stroke: var(--vscode-descriptionForeground); stroke-width: 1.6; opacity: .16; }
    .edge.status-suspect { stroke: #f59e0b; opacity: .72; }
    .edge.status-anchor-lost, .edge.status-broken { stroke: #e53935; opacity: .78; }
    .edge.status-superseded { stroke: #8b949e; opacity: .5; stroke-dasharray: 7 5; }
    .edge.active { stroke: var(--vscode-focusBorder); stroke-width: 3; opacity: 1; filter: drop-shadow(0 0 2px var(--vscode-focusBorder)); }
    .edge.selected-path { stroke: var(--vscode-focusBorder); stroke-width: 3; opacity: .9; }
    .edge.dim { opacity: .025; }
    .stage-grid { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(6, minmax(230px, 1fr)); gap: 24px; align-items: start; }
    .canvas.attention-mode { min-width: 0; }
    .stage-grid.attention-mode { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
    .stage { min-height: 510px; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--vscode-sideBar-background) 65%, transparent); }
    .stage h2 { position: sticky; top: 0; z-index: 2; margin: 0; padding: 10px 12px; border-bottom: 1px solid var(--line); background: var(--vscode-sideBar-background); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .stage-nodes { display: grid; gap: 12px; padding: 12px; }
    .node-shell { display: grid; gap: 3px; }
    .status-current { --status-color: #2ea043; }
    .status-suspect { --status-color: #f59e0b; }
    .status-anchor-lost, .status-broken { --status-color: #e53935; }
    .status-superseded { --status-color: #8b949e; }
    .node { position: relative; z-index: 2; text-align: left; width: 100%; min-height: 86px; padding: 11px; border: 1px solid var(--line); border-left: 5px solid var(--status-color, #2ea043); border-radius: 6px; color: var(--vscode-foreground); background: var(--vscode-editor-background); box-shadow: 0 2px 8px rgba(0,0,0,.12); transition: opacity .12s ease, border-color .12s ease; }
    .node:hover, .node.selected { border-top-color: var(--vscode-focusBorder); border-right-color: var(--vscode-focusBorder); border-bottom-color: var(--vscode-focusBorder); outline: 1px solid var(--vscode-focusBorder); }
    .node.connected { border-top-color: var(--vscode-focusBorder); border-right-color: var(--vscode-focusBorder); border-bottom-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
    .node.unrelated { opacity: .42; }
    .node.path-selected { opacity: 1; box-shadow: 0 0 0 1px color-mix(in srgb, var(--vscode-focusBorder) 65%, transparent); }
    .node.path-unselected { opacity: .16; }
    .node.final-decision { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .node.internal { background: color-mix(in srgb, #5e35b1 12%, var(--vscode-editor-background)); }
    .node.public { background: color-mix(in srgb, #2e7d32 12%, var(--vscode-editor-background)); }
    .node-kind { display: block; margin-bottom: 4px; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
    .node-label { display: block; font-size: 14px; line-height: 1.35; font-weight: 650; }
    .node-status { display: block; margin-top: 5px; color: var(--muted); font-size: 11px; }
    .decision-badge { display: inline-block; margin-top: 7px; padding: 2px 5px; border-radius: 3px; color: var(--vscode-button-foreground); background: var(--vscode-focusBorder); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .node-source-link { overflow: hidden; padding: 3px 5px; border: 0; text-align: left; color: var(--vscode-textLink-foreground); background: transparent; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .node-source-link:hover { color: var(--vscode-textLink-activeForeground); background: transparent; text-decoration: underline; }
    aside { overflow: auto; padding: 16px; border-left: 1px solid var(--line); background: var(--vscode-sideBar-background); }
    aside h2, aside h3 { margin: 0 0 10px; font-size: 13px; }
    .empty { color: var(--muted); }
    .details { display: grid; gap: 9px; margin-bottom: 22px; }
    .field { overflow-wrap: anywhere; }
    .field span { display: block; color: var(--muted); font-size: 10px; text-transform: uppercase; }
    .connections { display: grid; gap: 8px; margin-top: 4px; }
    .connection { width: 100%; padding: 9px; text-align: left; border: 1px solid var(--line); border-left: 3px solid var(--vscode-focusBorder); border-radius: 4px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    .connection-direction { display: block; color: var(--muted); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
    .connection-relation { display: block; margin: 2px 0; color: var(--vscode-focusBorder); font-size: 11px; font-weight: 600; }
    .connection-label { display: block; font-size: 12px; }
    .connection-status { display: block; margin-top: 3px; color: var(--status-color); font-size: 10px; font-weight: 650; text-transform: uppercase; }
    .worklist { display: grid; gap: 8px; }
    .work-item { padding: 8px; border: 1px solid var(--line); border-left: 4px solid var(--status-color); border-radius: 4px; color: var(--vscode-foreground); background: var(--vscode-editor-background); text-align: left; }
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
    <div class="legend" aria-label="Evidence status legend"><span class="legend-item status-current"><span class="legend-dot"></span>Current</span><span class="legend-item status-suspect"><span class="legend-dot"></span>Suspect</span><span class="legend-item status-anchor-lost"><span class="legend-dot"></span>Anchor lost / broken</span><span class="legend-item status-superseded"><span class="legend-dot"></span>Superseded</span></div>
  </div>
  <section id="decisionBanner" class="decision-banner hidden"><div class="decision-copy"><span class="decision-eyebrow">Final selected decision</span><span id="finalDecisionLabel" class="decision-label"></span><span id="finalDecisionSummary" class="decision-summary"></span></div><button id="showSelectedPath">Show selected delivery path</button></section>
  <main>
    <section class="graph-scroll"><div class="canvas" id="canvas"><svg id="edges" aria-hidden="true"></svg><div class="stage-grid" id="stageGrid"></div></div></section>
    <aside><h2 id="feature"></h2><div id="details" class="details empty">Select a node to inspect its evidence. Unrelated paths will fade and connections will be listed here.</div><h3>Evidence worklist</h3><div id="worklist" class="worklist"></div></aside>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const graph = ${encodedGraph};
    const stages = ['intent','requirements','architecture','delivery','validation','outcome'];
    const stageRank = new Map(stages.map(function(stage, index) { return [stage, index]; }));
    const nodeById = new Map(graph.nodes.map(function(node) { return [node.id, node]; }));
    const finalDecision = graph.nodes.reduce(function(selected, node) { if (node.kind !== 'decision' || node.decisionOutcome !== 'selected' || node.status !== 'current') return selected; if (!selected || (stageRank.get(node.stage) || 0) >= (stageRank.get(selected.stage) || 0)) return node; return selected; }, null);
    const selectedPathIds = new Set(graph.nodes.filter(function(node) { return node.status === 'current' && node.decisionOutcome !== 'rejected' && node.decisionOutcome !== 'superseded'; }).map(function(node) { return node.id; }));
    const selectedPathEdgeIds = new Set(graph.edges.filter(function(edge) { return edge.status === 'current' && selectedPathIds.has(edge.source) && selectedPathIds.has(edge.target); }).map(function(edge) { return edge.id; }));
    let selectedId = null;
    let selectedPathMode = false;
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
      const attentionOnly = document.getElementById('statusFilter').value === 'attention';
      grid.classList.toggle('attention-mode', attentionOnly); document.getElementById('canvas').classList.toggle('attention-mode', attentionOnly);
      visibleIds = new Set(graph.nodes.filter(matches).map(function(node) { return node.id; }));
      stages.forEach(function(stageName) {
        const visibleStageNodes = graph.nodes.filter(function(node) { return node.stage === stageName && visibleIds.has(node.id); });
        if (attentionOnly && !visibleStageNodes.length) return;
        const stage = document.createElement('section'); stage.className = 'stage';
        const heading = document.createElement('h2'); heading.textContent = title(stageName); stage.appendChild(heading);
        const nodes = document.createElement('div'); nodes.className = 'stage-nodes';
        visibleStageNodes.forEach(function(node) {
          const shell = document.createElement('div'); shell.className = 'node-shell';
          const card = document.createElement('button'); card.className = 'node status-' + node.status; card.dataset.nodeId = node.id;
          if (finalDecision && node.id === finalDecision.id) card.classList.add('final-decision');
          if (node.visibility === 'eai-internal') card.classList.add('internal');
          if (node.visibility === 'public-contract') card.classList.add('public');
          addText(card, 'node-kind', title(node.kind)); addText(card, 'node-label', node.label); addText(card, 'node-status', title(node.status)); if (finalDecision && node.id === finalDecision.id) addText(card, 'decision-badge', 'Final selected decision');
          card.addEventListener('click', function() { selectNode(node.id); }); shell.appendChild(card);
          if (node.source) { const sourceLink = document.createElement('button'); sourceLink.className = 'node-source-link'; sourceLink.textContent = 'Open ' + node.source.repository + ' · ' + node.source.path; sourceLink.title = 'Open ' + node.source.repository + '/' + node.source.path; sourceLink.addEventListener('click', function() { vscode.postMessage({ type:'openSource', nodeId:node.id }); }); shell.appendChild(sourceLink); }
          nodes.appendChild(shell);
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
        const path = document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d','M ' + x1 + ' ' + y1 + ' C ' + (x1 + bend) + ' ' + y1 + ', ' + (x2 - bend) + ' ' + y2 + ', ' + x2 + ' ' + y2); path.setAttribute('marker-end','url(#arrow)'); path.classList.add('edge', 'status-' + edge.status);
        if (selectedPathMode) path.classList.add(selectedPathEdgeIds.has(edge.id) ? 'selected-path' : 'dim'); else { const connected = selectedId && (edge.source === selectedId || edge.target === selectedId); if (selectedId) path.classList.add(connected ? 'active' : 'dim'); } svg.appendChild(path);
      });
    }
    function selectNode(id, showSelectedPath) {
      selectedPathMode = Boolean(showSelectedPath);
      selectedId = id; const connected = new Set([id]); graph.edges.forEach(function(edge) { if (edge.source === id) connected.add(edge.target); if (edge.target === id) connected.add(edge.source); });
      document.querySelectorAll('.node').forEach(function(card) { const isSelected = card.dataset.nodeId === id; const isConnected = !isSelected && connected.has(card.dataset.nodeId); card.classList.toggle('selected', isSelected); card.classList.toggle('connected', !selectedPathMode && isConnected); card.classList.toggle('unrelated', !selectedPathMode && !isSelected && !isConnected); card.classList.toggle('path-selected', selectedPathMode && selectedPathIds.has(card.dataset.nodeId)); card.classList.toggle('path-unselected', selectedPathMode && !selectedPathIds.has(card.dataset.nodeId)); });
      const node = nodeById.get(id); const details = document.getElementById('details'); details.className = 'details'; details.replaceChildren();
      if (selectedPathMode) { const note = document.createElement('div'); note.className = 'decision-banner'; note.textContent = 'Selected delivery path · ' + selectedPathIds.size + ' current evidence nodes · alternatives and unhealthy evidence faded'; details.appendChild(note); }
      [['Kind',title(node.kind)],['Stage',title(node.stage)],['Status',title(node.status)],['Decision outcome',node.decisionOutcome && title(node.decisionOutcome)],['Visibility',title(node.visibility)],['Summary',node.summary],['Capability',node.capabilityId],['Contract',node.contractVersion],['Repository',node.source && node.source.repository],['Path',node.source && node.source.path],['Anchor',node.source && node.source.anchor],['Commit',node.source && node.source.commit]].forEach(function(pair) { if (!pair[1]) return; const field = document.createElement('div'); field.className = 'field'; addText(field,'',pair[0]); field.lastChild.className = ''; field.lastChild.style.display = 'block'; field.lastChild.style.color = 'var(--muted)'; addText(field,'',String(pair[1])); details.appendChild(field); });
      if (node.source) { const button = document.createElement('button'); button.textContent = node.kind === 'documentation-file' ? 'Open ' + node.source.repository + ' document' : 'Open ' + node.source.repository + ' source'; button.title = 'Open ' + node.source.repository + '/' + node.source.path; button.addEventListener('click',function() { vscode.postMessage({ type:'openSource', nodeId:id }); }); details.appendChild(button); }
      const nodeEdges = graph.edges.filter(function(edge) { return edge.source === id || edge.target === id; });
      if (nodeEdges.length) { const heading = document.createElement('h3'); heading.textContent = 'Connections (' + nodeEdges.length + ')'; details.appendChild(heading); const list = document.createElement('div'); list.className = 'connections'; nodeEdges.forEach(function(edge) { const outgoing = edge.source === id; const other = nodeById.get(outgoing ? edge.target : edge.source); if (!other) return; const item = document.createElement('button'); item.className = 'connection status-' + edge.status; addText(item,'connection-direction',outgoing ? 'Outgoing' : 'Incoming'); addText(item,'connection-relation',title(edge.relation)); addText(item,'connection-label',other.label); addText(item,'connection-status',title(edge.status)); item.addEventListener('click',function() { selectNode(other.id); }); list.appendChild(item); }); details.appendChild(list); }
      drawEdges();
    }
    function renderWorklist() { const list = document.getElementById('worklist'); list.replaceChildren(); const nodes = graph.nodes.filter(function(node) { return node.status !== 'current'; }); const edges = graph.edges.filter(function(edge) { return edge.status !== 'current'; }); if (!nodes.length && !edges.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'All evidence is current.'; list.appendChild(empty); return; } nodes.forEach(function(node) { const item = document.createElement('button'); item.className = 'work-item status-' + node.status; item.textContent = title(node.status) + ' node: ' + node.label; item.addEventListener('click',function() { selectNode(node.id); }); list.appendChild(item); }); edges.forEach(function(edge) { const source = nodeById.get(edge.source); const target = nodeById.get(edge.target); const item = document.createElement('button'); item.className = 'work-item status-' + edge.status; item.textContent = title(edge.status) + ' relationship: ' + (source ? source.label : edge.source) + ' → ' + (target ? target.label : edge.target); item.addEventListener('click',function() { selectNode(edge.source); }); list.appendChild(item); }); }
    document.getElementById('search').addEventListener('input',render); document.getElementById('statusFilter').addEventListener('change',render); document.getElementById('refresh').addEventListener('click',function(){ vscode.postMessage({type:'refresh'}); }); document.getElementById('portable').addEventListener('click',function(){ vscode.postMessage({type:'openPortable', command:${JSON.stringify(options.portableCommand)} }); }); document.getElementById('showSelectedPath').addEventListener('click',function(){ if (finalDecision) selectNode(finalDecision.id, true); }); window.addEventListener('resize',function(){ requestAnimationFrame(drawEdges); });
    if (finalDecision) { document.getElementById('decisionBanner').classList.remove('hidden'); document.getElementById('finalDecisionLabel').textContent = finalDecision.label; document.getElementById('finalDecisionSummary').textContent = finalDecision.summary || 'Accepted decision recorded in the feature evidence.'; }
    render();
  </script>
</body>
</html>`;
}
