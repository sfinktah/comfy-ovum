import { app } from "../../../scripts/app.js";
import { Fzf } from "/ovum/node_modules/fzf/dist/fzf.es.js";
// Minimal Alfred-like spotlight for ComfyUI graph
// Uses fzf from npm

function createStyles() {
    if (document.getElementById("ovum-spotlight-style")) return;
    const style = document.createElement("style");
    style.id = "ovum-spotlight-style";
    style.textContent = `
    .ovum-spotlight { position: fixed; left: 50%; top: 12%; transform: translateX(-50%); width: min(800px, 90vw); border-radius: 14px; background: #2b2b2b; box-shadow: 0 20px 60px rgba(0,0,0,.7); z-index: 10000; color: #eee; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    .ovum-spotlight.hidden { display:none; }
    .ovum-spotlight-header { display: flex; align-items: center; gap: 10px; background: #1f1f1f; border-radius: 14px 14px 0 0; padding: 18px 22px; }
    .ovum-spotlight-badge { background:#3b3b3b; color:#bbb; padding:4px 10px; border-radius:10px; font-size:12px; pointer-events:none; white-space: nowrap; }
    .ovum-spotlight-badge.hidden { display: none; }
    .ovum-spotlight-input { flex: 1; box-sizing: border-box; background: transparent; border: none; padding: 0; font-size: 28px; color: #fff; outline: none; }
    .ovum-spotlight-list { max-height: 420px; overflow:auto; padding: 10px 0; }
    .ovum-spotlight-item { display:flex; gap:10px; align-items:center; padding: 12px 18px; font-size: 20px; border-top: 1px solid rgba(255,255,255,.04); cursor: pointer; }
    .ovum-spotlight-item .sub { opacity:.6; font-size: 14px; }
    .ovum-spotlight-item .widget-match { margin-left: auto; opacity:.5; font-size: 12px; font-family: monospace; background: rgba(255,255,255,.05); padding: 2px 8px; border-radius: 4px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ovum-spotlight-item .subgraph-path { display: flex; gap: 6px; align-items: center; font-size: 12px; opacity: .5; margin-top: 4px; flex-wrap: wrap; }
    .ovum-spotlight-item .subgraph-path-item { background: rgba(255,255,255,.08); padding: 2px 8px; border-radius: 4px; }
    .ovum-spotlight-item.active { background: #2f7574; }
    `;
    document.head.appendChild(style);
}

function buildUI(){
    createStyles();
    const wrap=document.createElement("div");
    wrap.className="ovum-spotlight hidden";
    const header=document.createElement("div");
    header.className="ovum-spotlight-header";
    const badge=document.createElement("div");
    badge.className="ovum-spotlight-badge hidden";
    const input=document.createElement("input");
    input.className="ovum-spotlight-input";
    input.placeholder="Search nodes, links, ids…";
    const list=document.createElement("div");
    list.className="ovum-spotlight-list";
    header.appendChild(badge); header.appendChild(input);
    wrap.appendChild(header); wrap.appendChild(list);
    document.body.appendChild(wrap);
    return {wrap,input,list,badge};
}

function getGraph() { return app?.graph; }
function allNodes(){ return getGraph()?._nodes ?? []; }
function allLinks(){ return getGraph()?.links ?? {}; }

function matchesHotkey(event, hotkeyString) {
    if (!hotkeyString) return false;

    const parts = hotkeyString.toLowerCase().split('+').map(p => p.trim());
    const key = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);

    const hasCtrl = modifiers.includes('ctrl') || modifiers.includes('control');
    const hasMeta = modifiers.includes('meta') || modifiers.includes('cmd') || modifiers.includes('command');
    const hasAlt = modifiers.includes('alt');
    const hasShift = modifiers.includes('shift');

    const eventKey = event.key.toLowerCase();
    const matchesKey = eventKey === key || (key === 'space' && eventKey === ' ');

    return matchesKey &&
           (hasCtrl ? event.ctrlKey : !event.ctrlKey) &&
           (hasMeta ? event.metaKey : !event.metaKey) &&
           (hasAlt ? event.altKey : !event.altKey) &&
           (hasShift ? event.shiftKey : !event.shiftKey);
}

function collectAllNodesRecursive(parentPath = "", parentChain = []) {
    const result = [];
    const nodes = allNodes();

    for (const node of nodes) {
        const nodeId = parentPath ? `${parentPath}:${node.id}` : String(node.id);
        result.push({ node, id: nodeId, displayId: nodeId, parentChain: [...parentChain] });

        // Check if this node has a subgraph
        if (node.subgraph && node.subgraph._nodes) {
            const subgraph = node.subgraph;
            const newParentChain = [...parentChain, node];
            const collectSubgraphNodes = (sg, path, chain) => {
                for (const subNode of sg._nodes) {
                    const subNodeId = `${path}:${subNode.id}`;
                    result.push({ node: subNode, id: subNodeId, displayId: subNodeId, parentChain: [...chain] });

                    // Recursively check for nested subgraphs
                    if (subNode.subgraph && subNode.subgraph._nodes) {
                        const nestedSubgraph = subNode.subgraph;
                        collectSubgraphNodes(nestedSubgraph, subNodeId, [...chain, subNode]);
                    }
                }
            };
            collectSubgraphNodes(subgraph, nodeId, newParentChain);
        }
    }

    return result;
}

function isNumericLike(t){ return /^\d[:\d]*$/.test(t.trim()); }

function findWidgetMatch(node, searchText){
    if (!node.widgets_values || !Array.isArray(node.widgets_values) || !searchText) return null;
    const lower = searchText.toLowerCase();
    for (const val of node.widgets_values){
        const str = String(val);
        const lowerStr = str.toLowerCase();
        const idx = lowerStr.indexOf(lower);
        if (idx !== -1){
            // Extract snippet with context
            const start = Math.max(0, idx - 20);
            const end = Math.min(str.length, idx + searchText.length + 20);
            let snippet = str.substring(start, end);
            if (start > 0) snippet = "..." + snippet;
            if (end < str.length) snippet = snippet + "...";
            return snippet;
        }
    }
    return null;
}

function parseHandler(q){
    const m=q.match(/^\s*(node|link)\s+(.*)$/i);
    if (m) return {handler:m[1].toLowerCase(), text:m[2]};
    return {handler:"", text:q};
}

function searchData(q){
    const {handler,text}=parseHandler(q);
    const g=getGraph();
    if (!g) return {items:[], handler};

    // "link" handler: search link ids
    if (handler==="link"){
        const links=allLinks();
        const arr = Object.entries(links).map(([id,l])=>({type:"link", id:Number(id), title:`Link ${id}: ${l.origin_id} -> ${l.target_id}`, link:l}));
        return {items:arr, handler};
    }

    // "node" handler: search node ids including subgraphs (e.g., 1:2:3)
    if (handler==="node"){
        const allNodesWithSubgraphs = collectAllNodesRecursive();
        const items = allNodesWithSubgraphs.map(({node, id, displayId, parentChain})=>{
            const title = `${node.title || node.type}  [${displayId}]`;
            return {type:"node", id:displayId, title, sub:node.type, node, parentChain};
        });
        return {items, handler};
    }

    // default (no handler): search nodes by title/type/id and widget values
    const allNodesWithSubgraphs = collectAllNodesRecursive();
    const items = allNodesWithSubgraphs.map(({node, id, displayId, parentChain})=>{
        const widgetText = node.widgets_values && Array.isArray(node.widgets_values) ? node.widgets_values.map(v => String(v)).join(" ") : "";
        const title = `${node.title || node.type}  [${displayId}]`;
        return {
            type:"node", 
            id:displayId, 
            title, 
            sub:node.type, 
            node,
            parentChain,
            widgetText,
            searchText: `${node.title || node.type} ${node.type} ${displayId} ${widgetText}`
        };
    });
    return {items, handler: ""};
}

function showResult(listEl, results, activeIdx, searchText){
    listEl.innerHTML="";
    results.forEach((r,idx)=>{
        const div=document.createElement("div");
        div.className="ovum-spotlight-item" + (idx===activeIdx?" active":"");

        let html = `<div style="flex: 1;"><div>${r.item.title}</div>`;

        // Add parent chain if exists
        if (r.item.parentChain && r.item.parentChain.length > 0) {
            html += `<div class="subgraph-path">`;
            r.item.parentChain.forEach((parent, idx) => {
                html += `<div class="subgraph-path-item">${parent.title || parent.type}</div>`;
                if (idx < r.item.parentChain.length - 1) {
                    html += `<span>›</span>`;
                }
            });
            html += `</div>`;
        }

        html += `</div>${r.item.sub?`<div class="sub">${r.item.sub}</div>`:""}`;

        // Check if there's a widget match to display
        if (r.item.node && r.item.widgetText && searchText) {
            const widgetMatch = findWidgetMatch(r.item.node, searchText);
            if (widgetMatch) {
                html += `<div class="widget-match">${widgetMatch}</div>`;
            }
        }

        div.innerHTML = html;
        listEl.appendChild(div);
    });
}

function jump(item){
    const g=getGraph(); if (!g) return;
    if (item.type==="node" && item.node){ 
        // First, always return to the root graph
        const rootGraph = app.graph;
        if (app.canvas.graph !== rootGraph) {
            if (typeof app.canvas.setGraph === 'function') {
                app.canvas.setGraph(rootGraph);
            } else {
                app.canvas.graph = rootGraph;
            }
        }

        // If the node is in a subgraph, we need to navigate to it
        if (item.parentChain && item.parentChain.length > 0) {
            // Navigate through the parent chain to reach the target node
            for (const parentNode of item.parentChain) {
                if (parentNode.subgraph) {
                    // Use canvas methods to open the subgraph
                    if (typeof app.canvas.openSubgraph === 'function') {
                        app.canvas.openSubgraph(parentNode.subgraph);
                    } else if (typeof app.canvas.setGraph === 'function') {
                        app.canvas.setGraph(parentNode.subgraph);
                    } else if (app.canvas.graph !== parentNode.subgraph) {
                        app.canvas.graph = parentNode.subgraph;
                    }
                }
            }
            // Small delay to allow subgraph to open, then select the node
            setTimeout(() => {
                app.canvas.selectNode(item.node, false); 
                app.canvas.fitViewToSelectionAnimated?.();
            }, 100);
        } else {
            app.canvas.selectNode(item.node, false); 
            app.canvas.fitViewToSelectionAnimated?.();
        }
    }
    if (item.type==="link" && item.link){ const origin=g.getNodeById(item.link.origin_id); if (origin){ app.canvas.selectNode(origin,false); app.canvas.fitViewToSelectionAnimated?.(); } }
}

app.registerExtension({
    name: "ovum.spotlight",
    async setup(app){
        const ui=buildUI();
        let state = {open:false, active:0, results:[], items:[], handler:""};

        const refresh = ()=>{
            const q = ui.input.value;
            const {items, handler}=searchData(q);
            if (handler) {
                ui.badge.classList.remove("hidden");
                ui.badge.textContent = handler;
            } else {
                ui.badge.classList.add("hidden");
            }
            state.handler=handler; state.items=items;
            const searchText = parseHandler(q).text;
            const fzf = new Fzf(items, { selector: (it)=> it.searchText || (it.title + (it.sub?" "+it.sub:"") + " " + it.id) });
            const matches = fzf.find(searchText).slice(0,5);
            state.results=matches; state.active=0;
            showResult(ui.list, matches, state.active, searchText);
        };

        function open(){ ui.wrap.classList.remove("hidden"); ui.input.focus(); ui.input.select(); state.open=true; refresh(); }
        function close(){ ui.wrap.classList.add("hidden"); state.open=false; }

        document.addEventListener("keydown", (e)=>{
            const setting = app.ui.settings.getSettingValue("ovum.spotlightHotkey") ?? "/";
            const alternateSetting = app.ui.settings.getSettingValue("ovum.spotlightAlternateHotkey") ?? "Ctrl+Space";
            const matchesPrimary = e.key === setting && !state.open && !e.ctrlKey && !e.metaKey && !e.altKey;
            const matchesAlternate = matchesHotkey(e, alternateSetting) && !state.open;

            if (matchesPrimary || matchesAlternate){
                e.preventDefault(); open();
            } else if (state.open){
                if (e.key === "Escape"){ close(); }
                else if (e.key === "ArrowDown"){ state.active = Math.min((state.results?.length||1)-1, state.active+1); showResult(ui.list, state.results, state.active, parseHandler(ui.input.value).text); e.preventDefault(); }
                else if (e.key === "ArrowUp"){ state.active = Math.max(0, state.active-1); showResult(ui.list, state.results, state.active, parseHandler(ui.input.value).text); e.preventDefault(); }
                else if (e.key === "Enter"){ const r=state.results[state.active]; if (r){ jump(r.item); close(); } }
            }
        });
        ui.input.addEventListener("input", refresh);
        ui.input.addEventListener("blur", ()=> setTimeout(()=>{ if(state.open) close(); }, 150));

        app.ui.settings.addSetting({ id:"ovum.spotlightHotkey", name:"ovum: Spotlight hotkey", type:"text", defaultValue:"/" });
        app.ui.settings.addSetting({ id:"ovum.spotlightAlternateHotkey", name:"ovum: Spotlight alternate hotkey", type:"text", defaultValue:"Ctrl+Space" });
        app.ui.settings.addSetting({ id:"ovum.spotlightHandlers", name:"ovum: Spotlight handlers", type:"text", defaultValue:"node,link" });
    }
});
