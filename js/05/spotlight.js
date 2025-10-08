import {app} from "../../../scripts/app.js";
import {Fzf} from "/ovum/node_modules/fzf/dist/fzf.es.js";
// Minimal Alfred-like spotlight for ComfyUI graph
// Uses fzf from npm

const LEFT_MOUSE_BUTTON = 0;

// Module-level variables to track pointer movement and keyboard navigation
let lastPointerMoveTime = 0;
let lastKeyboardNavigationTime = 0;
let ignoreHoverUntilMove = false;
let lastPointerX = 0;
let lastPointerY = 0;
const HOVER_SUPPRESSION_WINDOW_MS = 250;
const MINIMUM_POINTER_DISTANCE = 5; // pixels

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
    .ovum-spotlight-list { overflow:auto; padding: 10px 0; }
    .ovum-spotlight-item { display:flex; gap:10px; align-items:center; padding: 12px 18px; font-size: 20px; border-top: 1px solid rgba(255,255,255,.04); cursor: pointer; transition: background 0.15s ease; }
    .ovum-spotlight.hover-enabled .ovum-spotlight-item:hover { background: #2f7574; }
    .ovum-spotlight-item .item-main { flex: 1; }
    .ovum-spotlight-item .item-title-row { display:flex; align-items:center; gap:8px; }
    .ovum-spotlight-item .state-badges { display:flex; gap:6px; align-items:center; }
    .ovum-spotlight-item .badge { font-size: 11px; padding: 2px 6px; border-radius: 6px; background: rgba(255,255,255,.08); color:#ddd; text-transform: uppercase; letter-spacing: .4px; }
    .ovum-spotlight-item .badge-muted { background: #734b4b; color: #ffd9d9; }
    .ovum-spotlight-item .badge-bypassed { background: #6b6b6b; color: #e6e6e6; }
    .ovum-spotlight-item .item-details { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
    .ovum-spotlight-item .sub { opacity:.6; font-size: 14px; }
    .ovum-spotlight-item .widget-match { opacity:.5; font-size: 12px; font-family: monospace; background: rgba(255,255,255,.05); padding: 2px 8px; border-radius: 4px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ovum-spotlight-item .subgraph-path { display: flex; gap: 6px; align-items: center; font-size: 12px; opacity: .5; margin-top: 4px; flex-wrap: wrap; }
    .ovum-spotlight-item .subgraph-path-item { background: rgba(255,255,255,.08); padding: 2px 8px; border-radius: 4px; }
    .ovum-spotlight-item.active { background: #2f7574; }
    .ovum-spotlight-highlight { color: #4fd1c5; font-weight: 600; }
    .ovum-spotlight-bigbox { border-top: 1px solid rgba(255,255,255,.08); max-height: 60vh; overflow: auto; width: 100%; box-sizing: border-box; padding: 10px 18px 18px; border-radius: 0 0 14px 14px; }
    .ovum-spotlight-bigbox.hidden { display:none; }
    .ovum-spotlight-bigbox, .ovum-spotlight-bigbox * { max-width: 100%; }
    `;
    document.head.appendChild(style);
}

function buildUI() {
    createStyles();
    const wrap = document.createElement("div");
    wrap.className = "ovum-spotlight hidden";
    const header = document.createElement("div");
    header.className = "ovum-spotlight-header";
    const badge = document.createElement("div");
    badge.className = "ovum-spotlight-badge hidden";
    const input = document.createElement("input");
    input.className = "ovum-spotlight-input";
    input.placeholder = "Search nodes, links, ids…";
    const list = document.createElement("div");
    list.className = "ovum-spotlight-list";
    const bigbox = document.createElement("div");
    bigbox.className = "ovum-spotlight-bigbox hidden";
    header.appendChild(badge);
    header.appendChild(input);
    wrap.appendChild(header);
    wrap.appendChild(list);
    wrap.appendChild(bigbox);
    document.body.appendChild(wrap);
    return {wrap, input, list, badge, bigbox};
}

function getGraph() {
    return app?.graph;
}

function allNodes() {
    return getGraph()?._nodes ?? [];
}

function allLinks() {
    return getGraph()?.links ?? {};
}

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
        result.push({node, id: nodeId, displayId: nodeId, parentChain: [...parentChain]});

        // Check if this node has a subgraph
        if (node.subgraph && node.subgraph._nodes) {
            const subgraph = node.subgraph;
            const newParentChain = [...parentChain, node];
            const collectSubgraphNodes = (sg, path, chain) => {
                for (const subNode of sg._nodes) {
                    const subNodeId = `${path}:${subNode.id}`;
                    result.push({node: subNode, id: subNodeId, displayId: subNodeId, parentChain: [...chain]});

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

function isNumericLike(t) {
    return /^\d[:\d]*$/.test(t.trim());
}

function findWidgetMatch(node, searchText) {
    if (!node.widgets || !Array.isArray(node.widgets) || !searchText) return null;
    const lower = searchText.toLowerCase();

    for (let i = 0; i < node.widgets.length; i++) {
        const widget = node.widgets[i];
        const val = widget.value;
        const str = String(val);
        const lowerStr = str.toLowerCase();
        const idx = lowerStr.indexOf(lower);

        if (idx !== -1) {
            // Extract snippet with context
            const start = Math.max(0, idx - 10);
            const end = Math.min(str.length, idx + searchText.length + 40);
            let snippet = str.substring(start, end);
            let prefix = "";
            let suffix = "";
            if (start > 0) prefix = "…";
            if (end < str.length) suffix = "...";

            // Calculate match positions within the snippet
            const matchPositions = new Set();
            const snippetLower = snippet.toLowerCase();
            const matchIdx = snippetLower.indexOf(lower);
            if (matchIdx !== -1) {
                for (let j = 0; j < searchText.length; j++) {
                    matchPositions.add(matchIdx + j);
                }
            }

            return {
                name: widget.name || `Widget ${i}`,
                snippet: snippet,
                prefix: prefix,
                suffix: suffix,
                matchPositions: matchPositions
            };
        }
    }
    return null;
}

// Simple plugin registry to allow external nodes to inject spotlight search providers
const SpotlightRegistry = {
    keywordHandlers: new Map(), // keyword -> (text:string)=>{items, handler}
    defaultHandlers: [],        // list of () => {items, handler:""}
    registerKeywordHandler(keyword, callback) {
        if (!keyword || typeof callback !== "function") return;
        this.keywordHandlers.set(String(keyword).toLowerCase(), callback);
    },
    registerDefaultHandler(callback) {
        if (typeof callback === "function") this.defaultHandlers.push(callback);
    }
};

// Expose a global hook so custom nodes can register from their JS
// Usage: window.OvumSpotlight?.registerKeywordHandler("mykey", (text)=>({...}))
//        window.OvumSpotlight?.registerDefaultHandler(()=>({...}))
window.OvumSpotlight = window.OvumSpotlight || SpotlightRegistry;

function parseHandler(q) {
    // Accept any registered keyword first
    const m = q.match(/^\s*(\w+)\s+(.*)$/i);
    if (m) {
        const kw = m[1].toLowerCase();
        if (kw === "node" || kw === "link" || SpotlightRegistry.keywordHandlers.has(kw)) {
            return {handler: kw, text: m[2], matched: true};
        }
    }
    return {handler: "", text: q, matched: false};
}

function searchData(q) {
    const {handler, text} = parseHandler(q);
    const g = getGraph();
    if (!g) return {items: [], handler};

    // Built-in: "link" handler: search link ids
    if (handler === "link") {
        const links = allLinks();
        const arr = Object.entries(links).map(([id, l]) => ({
            type: "link",
            id: Number(id),
            title: `Link ${id}: ${l.origin_id} -> ${l.target_id}`,
            link: l
        }));
        return {items: arr, handler};
    }

    // Built-in: "node" handler: search node ids including subgraphs
    if (handler === "node") {
        const allNodesWithSubgraphs = collectAllNodesRecursive();
        const items = allNodesWithSubgraphs.map(({node, id, displayId, parentChain}) => {
            const title = `${node.title || node.type}  [${displayId}]`;
            return {type: "node", id: displayId, title, sub: node.type, node, parentChain};
        });
        return {items, handler};
    }

    // Custom keyword handler
    if (handler && SpotlightRegistry.keywordHandlers.has(handler)) {
        try {
            const fn = SpotlightRegistry.keywordHandlers.get(handler);
            const res = fn?.(text, {app, getGraph, allNodes, allLinks, collectAllNodesRecursive});
            if (res && Array.isArray(res.items)) return {items: res.items, handler};
        } catch (e) {
            console.warn("OvumSpotlight keyword handler error", handler, e);
        }
    }

    // default (no handler): core list + contributions from default handlers
    const allNodesWithSubgraphs = collectAllNodesRecursive();
    let items = allNodesWithSubgraphs.map(({node, id, displayId, parentChain}) => {
        const widgetText = node.widgets && Array.isArray(node.widgets) ? node.widgets.map(w => `${w.name} ${w.value}`).join(" ") : "";
        const title = `${node.title || node.type}  [${displayId}]`;
        const className = node.comfyClass || "";
        return {
            type: "node",
            id: displayId,
            title,
            sub: node.type,
            node,
            parentChain,
            widgetText,
            searchText: `${node.title || node.type} ${node.type} ${className} ${displayId} ${widgetText}`
        };
    });

    // Let default handlers add more items
    for (const fn of SpotlightRegistry.defaultHandlers) {
        try {
            const res = fn?.({app, getGraph, allNodes, allLinks, collectAllNodesRecursive});
            if (res && Array.isArray(res.items)) items = items.concat(res.items);
        } catch (e) {
            console.warn("OvumSpotlight default handler error", e);
        }
    }

    return {items, handler: ""};
}

function getPositionsInRange(positions, start, end) {
    if (!positions) return new Set();
    const rangePositions = new Set();
    for (let pos of positions) {
        if (pos >= start && pos < end) {
            rangePositions.add(pos - start);
        }
    }
    return rangePositions;
}

function highlightText(text, positions) {
    if (!positions || positions.size === 0) {
        return text;
    }

    // Create an array of characters with their highlight status
    const chars = text.split('').map((char, idx) => ({
        char,
        highlighted: positions.has(idx)
    }));

    // Build HTML string with highlighted spans
    let result = '';
    let i = 0;
    while (i < chars.length) {
        if (chars[i].highlighted) {
            // Start a highlighted span
            let highlightedChars = '';
            while (i < chars.length && chars[i].highlighted) {
                highlightedChars += chars[i].char;
                i++;
            }
            result += `<span class="ovum-spotlight-highlight">${highlightedChars}</span>`;
        } else {
            // Add non-highlighted character
            result += chars[i].char;
            i++;
        }
    }

    return result;
}

function updateActiveState(listEl, activeIdx) {
    // Update active class on items
    Array.from(listEl.children).forEach((child, idx) => {
        if (idx === activeIdx) {
            child.classList.add("active");
        } else {
            child.classList.remove("active");
        }
    });

    // Scroll active item into view
    const activeItem = listEl.children[activeIdx];
    if (activeItem) {
        activeItem.scrollIntoView({block: "nearest", behavior: "smooth"});
    }
}

function showResult(listEl, results, activeIdx, searchText, onActiveChange, onSelect) {
    listEl.innerHTML = "";
    results.forEach((r, idx) => {
        const div = document.createElement("div");
        div.className = "ovum-spotlight-item" + (idx === activeIdx ? " active" : "");

        // Reconstruct the searchText to map positions correctly
        let highlightedTitle = r.item.title;
        let highlightedSub = r.item.sub;
        let highlightedId = r.item.id;

        if (r.positions && r.item.searchText) {
            // Map positions to different parts of searchText
            const searchText = r.item.searchText;
            const titleText = r.item.node?.title || r.item.node?.type || r.item.title || '';
            const typeText = r.item.node?.type || r.item.sub || '';
            const classText = r.item.node?.comfyClass || '';
            const idText = String(r.item.id);

            // Calculate positions in searchText
            let currentPos = 0;

            // Title positions
            const titleStart = currentPos;
            currentPos += titleText.length + 1; // +1 for space
            const titlePositions = getPositionsInRange(r.positions, titleStart, titleStart + titleText.length);
            highlightedTitle = highlightText(r.item.title, titlePositions);

            // Type positions
            const typeStart = currentPos;
            currentPos += typeText.length + 1;
            const typePositions = getPositionsInRange(r.positions, typeStart, typeStart + typeText.length);
            if (r.item.sub) {
                highlightedSub = highlightText(r.item.sub, typePositions);
            }

            // Class positions
            currentPos += classText.length + 1;

            // ID positions - find where ID appears in the title string
            const titleMatch = r.item.title.match(/\[([^\]]+)\]$/);
            if (titleMatch) {
                const idInTitle = titleMatch[1];
                const idStart = r.item.title.lastIndexOf('[' + idInTitle);
                const idEnd = idStart + idInTitle.length + 2; // +2 for brackets
                const idPositions = getPositionsInRange(r.positions, titleStart + idStart + 1, titleStart + idStart + 1 + idInTitle.length);
                if (idPositions.size > 0) {
                    const highlightedIdText = highlightText(idInTitle, idPositions);
                    highlightedTitle = r.item.title.substring(0, idStart) + '[' + highlightedIdText + ']';
                }
            }
        }

        // Determine node state badges (muted/bypassed)
                const n = r.item.node;
                const isMuted = !!(n && (n.muted || n?.flags?.muted));
                const isBypassed = !!(n && (n.bypassed || n?.flags?.bypassed));
                const badgesHtml = (isMuted || isBypassed)
                    ? `<span class="state-badges">${isMuted ? '<span class="badge badge-muted">muted</span>' : ''}${isBypassed ? '<span class=\"badge badge-bypassed\">bypassed</span>' : ''}</span>`
                    : "";

                let html = `<div class="item-main"><div class="item-title-row">${highlightedTitle} ${badgesHtml}</div>`;

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

        html += `</div>`;

        // Create flex container for .sub and .widget-match
        let detailsHtml = '';
        if (r.item.sub) {
            detailsHtml += `<div class="sub">${highlightedSub}</div>`;
        }

        // Check if there's a widget match to display
        if (r.item.node && r.item.widgetText && searchText) {
            const widgetMatch = findWidgetMatch(r.item.node, searchText);
            if (widgetMatch) {
                const highlightedSnippet = highlightText(widgetMatch.snippet, widgetMatch.matchPositions);
                detailsHtml += `<div class="widget-match"><strong>${widgetMatch.name}:</strong> ${widgetMatch.prefix}${highlightedSnippet}${widgetMatch.suffix}</div>`;
            }
        }

        if (detailsHtml) {
            html += `<div class="item-details">${detailsHtml}</div>`;
        }

        div.innerHTML = html;

        // Add mouseover handler to update active state (only when the pointer actually moved recently and no recent keyboard navigation)
        div.addEventListener("mouseover", () => {
            // Ignore hover if we're explicitly ignoring until mouse moves
            if (ignoreHoverUntilMove) return;

            const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
            const pointerMovedRecently = (now - lastPointerMoveTime) < HOVER_SUPPRESSION_WINDOW_MS;
            const keyboardNavigatedRecently = (now - lastKeyboardNavigationTime) < HOVER_SUPPRESSION_WINDOW_MS;

            // Only update active state if pointer moved recently and no recent keyboard navigation
            if (pointerMovedRecently && !keyboardNavigatedRecently) {
                if (onActiveChange) onActiveChange(idx);
            }
        });

        // Add mousedown handler to select item (fires before blur)
        div.addEventListener("mousedown", (e) => {
            if (e.button !== LEFT_MOUSE_BUTTON) return; // Only react to left mouse button
            e.preventDefault(); // Prevent input from losing focus
            if (onSelect) onSelect(r);
        });

        listEl.appendChild(div);
    });

    // Scroll active item into view
    updateActiveState(listEl, activeIdx);
}

function jump(item) {
    const g = getGraph();
    if (!g) return;
    if (item.type === "node" && item.node) {
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
    if (item.type === "link" && item.link) {
        const origin = g.getNodeById(item.link.origin_id);
        if (origin) {
            app.canvas.selectNode(origin, false);
            app.canvas.fitViewToSelectionAnimated?.();
        }
    }
}

app.registerExtension({
    name: "ovum.spotlight",
    async setup(app) {
        const ui = buildUI();
        // Track actual pointer movement to avoid hover overriding keyboard selection when mouse is stationary
        const updatePointerMoveTime = (e) => {
            const deltaX = Math.abs(e.clientX - lastPointerX);
            const deltaY = Math.abs(e.clientY - lastPointerY);
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // Only count as real movement if pointer moved a minimum distance
            if (ignoreHoverUntilMove && distance < MINIMUM_POINTER_DISTANCE) {
                return;
            }

            lastPointerX = e.clientX;
            lastPointerY = e.clientY;
            lastPointerMoveTime = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

            // Enable CSS hover once the mouse actually moves
            ignoreHoverUntilMove = false;
            ui.wrap.classList.add('hover-enabled');
        };

        ui.wrap.addEventListener("pointermove", updatePointerMoveTime);
        ui.wrap.addEventListener("mousemove", updatePointerMoveTime);
        ui.list.addEventListener("pointermove", updatePointerMoveTime);
        ui.list.addEventListener("mousemove", updatePointerMoveTime);
        let state = {
            open: false,
            active: 0,
            results: [],
            items: [],
            handler: "",
            handlerActive: false,
            fullQuery: "",
            preventHandlerActivation: false,
            reactivateAwaitingSpaceToggle: false,
            reactivateSpaceRemoved: false,
            restoredHandler: ""
        };

        const isHTMLElement = (v) => !!(v && typeof v === 'object' && v.nodeType === 1);
        const clearBigbox = () => {
            ui.bigbox.innerHTML = "";
            ui.bigbox.classList.add("hidden");
        };
        const updateBigboxContent = () => {
            const r = state.results[state.active];
            const content = r?.item?.bigbox;
            // Only accept existing HTMLElement, ignore strings or falsey
            if (isHTMLElement(content)) {
                ui.bigbox.innerHTML = "";
                ui.bigbox.appendChild(content);
                ui.bigbox.classList.remove("hidden");
            } else {
                clearBigbox();
            }
        };

        const updateActiveItem = (newActive) => {
            state.active = newActive;
            updateActiveState(ui.list, state.active);
            updateBigboxContent();
        };

        const handleSelect = (result) => {
            const it = result.item;
            if (it && typeof it.onSelect === "function") {
                try {
                    it.onSelect(it);
                } catch (e) {
                    console.warn("Spotlight item onSelect error", e);
                }
                close();
                return;
            }
            if (it && (it.type === "node" || it.type === "link")) {
                jump(it);
            }
            close();
        };

        const refresh = () => {
            const q = ui.input.value;
            const fullQuery = state.handlerActive ? `${state.handler} ${q}` : q;
            state.fullQuery = fullQuery;

            const parseResult = parseHandler(fullQuery);
            const {items, handler} = searchData(fullQuery);

            // Manage reactivation gating: require removal of ALL spaces before reactivation is allowed
            if (state.reactivateAwaitingSpaceToggle) {
                const val = ui.input.value;
                const hasAnySpace = /\s/.test(val);
                if (hasAnySpace) {
                    // As long as there is any whitespace in the input, block reactivation
                    state.preventHandlerActivation = true;
                } else {
                    // No spaces remain: lift prevention and end gating
                    state.preventHandlerActivation = false;
                    state.reactivateAwaitingSpaceToggle = false;
                    state.reactivateSpaceRemoved = false;
                    state.restoredHandler = "";
                }
            } else {
                state.preventHandlerActivation = false;
            }

            // Activate handler if pattern matched and not already active (and not prevented)
            if (parseResult.matched && !state.handlerActive && !state.preventHandlerActivation) {
                state.handler = handler;
                state.handlerActive = true;
                // Remove the handler keyword and space from input
                ui.input.value = parseResult.text;
                ui.badge.classList.remove("hidden");
                ui.badge.textContent = handler;
                return; // Re-call refresh with updated input
            }

            if (state.handlerActive) {
                ui.badge.classList.remove("hidden");
                ui.badge.textContent = state.handler;
            } else {
                ui.badge.classList.add("hidden");
                state.handler = "";
            }

            state.items = items;
            const searchText = parseResult.text;
            const maxMatches = app.ui.settings.getSettingValue("ovum.spotlightMaxMatches") ?? 100;
            const visibleItems = app.ui.settings.getSettingValue("ovum.spotlightVisibleItems") ?? 6;
            const fzf = new Fzf(items, {selector: (it) => it.searchText || (it.title + (it.sub ? " " + it.sub : "") + " " + it.id)});
            const matches = fzf.find(searchText).slice(0, maxMatches);
            state.results = matches;
            state.active = 0;

            // Update list max-height based on visible items setting
            // Each item is approximately 47px (12px padding top + 12px padding bottom + 20px font-size + 1px border + ~2px for spacing)
            const itemHeight = 47;
            ui.list.style.maxHeight = `${itemHeight * visibleItems}px`;

            showResult(ui.list, matches, state.active, searchText, updateActiveItem, handleSelect);
                        updateBigboxContent();
        };

        function open() {
            ui.wrap.classList.remove("hidden");
            ui.wrap.classList.remove("hover-enabled");
            ui.input.focus();
            ui.input.select();
            state.open = true;
            state.handlerActive = false;
            state.handler = "";
            state.fullQuery = "";
            state.preventHandlerActivation = false;
            state.reactivateAwaitingSpaceToggle = false;
            state.reactivateSpaceRemoved = false;
            state.restoredHandler = "";
            // Reset pointer tracking to ignore hover until mouse actually moves
            lastPointerMoveTime = 0;
            lastKeyboardNavigationTime = 0;
            lastPointerX = 0;
            lastPointerY = 0;
            ignoreHoverUntilMove = true;
            clearBigbox();
            refresh();
        }

        function close() {
            ui.wrap.classList.add("hidden");
            clearBigbox();
            state.open = false;
            state.handlerActive = false;
            state.handler = "";
            state.fullQuery = "";
            state.preventHandlerActivation = false;
            state.reactivateAwaitingSpaceToggle = false;
            state.reactivateSpaceRemoved = false;
            state.restoredHandler = "";
        }

        // Handle backspace on input to deactivate handler
        ui.input.addEventListener("keydown", (e) => {
            if (e.key === "Backspace" && state.handlerActive && ui.input.value === "") {
                e.preventDefault();
                e.stopPropagation();
                // Deactivate handler and restore the keyword with space
                const restoredText = state.handler + " ";
                state.handlerActive = false;
                const oldHandler = state.handler;
                state.handler = "";
                state.preventHandlerActivation = true; // Prevent immediate reactivation
                // Require user to remove the trailing space and add it again before reactivation
                state.reactivateAwaitingSpaceToggle = true;
                state.reactivateSpaceRemoved = false;
                state.restoredHandler = oldHandler;
                ui.badge.classList.add("hidden");
                ui.input.value = restoredText;
                // Move cursor to end
                setTimeout(() => {
                    ui.input.setSelectionRange(restoredText.length, restoredText.length);
                    refresh();
                }, 0);
            }
        });

        // Keyboard handling for both settings-based hotkeys and internal navigation
        document.addEventListener("keydown", (e) => {
            const setting = app.ui.settings.getSettingValue("ovum.spotlightHotkey") ?? "/";
            const alternateSetting = app.ui.settings.getSettingValue("ovum.spotlightAlternateHotkey") ?? "Ctrl+Space";
            const matchesPrimary = e.key === setting && !state.open && !e.ctrlKey && !e.metaKey && !e.altKey;
            const matchesAlternate = matchesHotkey(e, alternateSetting) && !state.open;

            if (matchesPrimary || matchesAlternate) {
                e.preventDefault();
                open();
            } else if (state.open) {
                if (e.key === "Escape") {
                    close();
                } else if (e.key === "ArrowDown") {
                    lastKeyboardNavigationTime = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
                    ui.wrap.classList.remove('hover-enabled');
                    updateActiveItem(Math.min((state.results?.length || 1) - 1, state.active + 1));
                    e.preventDefault();
                } else if (e.key === "ArrowUp") {
                    lastKeyboardNavigationTime = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
                    ui.wrap.classList.remove('hover-enabled');
                    updateActiveItem(Math.max(0, state.active - 1));
                    e.preventDefault();
                } else if (e.key === "Enter") {
                    const r = state.results[state.active];
                    if (r) {
                        handleSelect(r);
                    }
                }
            }
        });
        ui.input.addEventListener("input", refresh);
        ui.input.addEventListener("blur", () => setTimeout(() => {
            if (state.open) close();
        }, 150));

        app.ui.settings.addSetting({
            id: "ovum.spotlightHotkey",
            name: "ovum: Spotlight hotkey",
            type: "text",
            defaultValue: "/"
        });
        app.ui.settings.addSetting({
            id: "ovum.spotlightAlternateHotkey",
            name: "ovum: Spotlight alternate hotkey",
            type: "text",
            defaultValue: "Ctrl+Space"
        });
        app.ui.settings.addSetting({
            id: "ovum.spotlightHandlers",
            name: "ovum: Spotlight handlers",
            type: "text",
            defaultValue: "node,link"
        });
        app.ui.settings.addSetting({
            id: "ovum.spotlightMaxMatches",
            name: "ovum: Spotlight max matches",
            type: "number",
            defaultValue: 100
        });
        app.ui.settings.addSetting({
            id: "ovum.spotlightVisibleItems",
            name: "ovum: Spotlight visible items",
            type: "number",
            defaultValue: 6
        });

        // Store open function for command access
        this._spotlightOpen = open;
    },
    commands: [
        {
            id: "ovum.spotlight.activate",
            icon: "pi pi-search",
            label: "Activate Spotlight",
            function: () => {
                // Access the open function through the extension instance
                if (app.extensions?.extensions?.["ovum.spotlight"]?._spotlightOpen) {
                    app.extensions.extensions["ovum.spotlight"]._spotlightOpen();
                }
            }
        }
    ]
});
