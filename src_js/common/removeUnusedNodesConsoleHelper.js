// Console helpers to remove unused nodes from the current ComfyUI graph
// Usage in DevTools console (with a graph open):
//   await removeLeafNodesByClassName(["LoadImage", "KSampler"])
//   await removeLeafNodesWithoutOutputNode()
//   await removeOrphanNodes()

import { getNodeDefsCached } from "./ovum_helpers.js";

function getGraph() {
    try { return (typeof app !== "undefined") ? app.graph : null; } catch(_e) { return null; }
}

function getAllNodes() {
    const g = getGraph();
    if (!g) return [];
    // LiteGraph keeps nodes in graph._nodes; fallbacks included for safety across versions
    return Array.from(g._nodes || g.nodes || []);
}

function nodeClassName(node) {
    return node?.comfyClass || node?.type || node?.title || null;
}

function countOutgoingLinks(node) {
    try {
        const outputs = node?.outputs || [];
        let n = 0;
        for (const o of outputs) {
            if (!o) continue;
            if (Array.isArray(o.links)) n += o.links.length;
        }
        return n;
    } catch (_e) { return 0; }
}

function countIncomingLinks(node) {
    try {
        const inputs = node?.inputs || [];
        let n = 0;
        for (const i of inputs) {
            if (!i) continue;
            if (Array.isArray(i.links)) n += i.links.length;
            else if (i.link != null) n += 1;
        }
        return n;
    } catch (_e) { return 0; }
}

// Count declared input/output slots on a node (not the number of connected links)
function countInputs(node) {
    try { return Array.isArray(node?.inputs) ? node.inputs.length : 0; } catch (_e) { return 0; }
}
function countOutputs(node) {
    try { return Array.isArray(node?.outputs) ? node.outputs.length : 0; } catch (_e) { return 0; }
}

function isLeaf(node) { return countOutgoingLinks(node) === 0; }
function isOrphan(node) { return countOutgoingLinks(node) === 0 && countIncomingLinks(node) === 0; }
function hasNoInputsOrOutputs(node) { return countInputs(node) === 0 && countOutputs(node) === 0; }

function removeNode(node) {
    const g = getGraph();
    if (!g || !node) return false;
    try {
        (node.graph || g).remove(node);
        return true;
    } catch (_e) {
        try { g.remove(node); return true; } catch(__e) { return false; }
    }
}

function normalizeClassSet(classNames) {
    const set = new Set();
    if (!classNames) return set;
    const arr = Array.isArray(classNames) ? classNames : [classNames];
    for (const n of arr) if (n != null) set.add(String(n).toLowerCase());
    return set;
}

export async function removeLeafNodesByClassName(classNames, opts = {}) {
    const { dryRun = false, logger = console } = opts;
    const classes = normalizeClassSet(classNames);
    const nodes = getAllNodes();
    const removed = [];

    for (const node of nodes) {
        if (!isLeaf(node)) continue;
        const cls = (nodeClassName(node) || "").toLowerCase();
        if (!classes.has(cls)) continue;
        if (!dryRun) removeNode(node);
        removed.push({ id: node.id, class_name: nodeClassName(node) });
    }

    try { logger.info?.(`[removeLeafNodesByClassName] ${dryRun ? "Would remove" : "Removed"} ${removed.length} node(s).`); } catch(_e) {}
    return { removed_count: removed.length, removed };
}

export async function removeOrphanNodes(opts = {}) {
    const { dryRun = false, logger = console } = opts;
    const nodes = getAllNodes();
    const removed = [];

    for (const node of nodes) {
        if (!isOrphan(node)) continue;
        if (hasNoInputsOrOutputs(node)) continue;
        if (!dryRun) removeNode(node);
        removed.push({ id: node.id, class_name: nodeClassName(node) });
    }

    try { logger.info?.(`[removeOrphanNodes] ${dryRun ? "Would remove" : "Removed"} ${removed.length} node(s).`); } catch(_e) {}
    return { removed_count: removed.length, removed };
}

export async function removeLeafNodesWithoutOutputNode(opts = {}) {
    const { dryRun = false, logger = console } = opts;
    const nodes = getAllNodes();
    const defs = await getNodeDefsCached();
    const removed = [];

    if (!defs) {
        try { logger.warn?.("[removeLeafNodesWithoutOutputNode] Node defs not available; nothing removed."); } catch(_e) {}
        return { removed_count: 0, removed };
    }

    for (const node of nodes) {
        if (!isLeaf(node)) continue;
        const cls = nodeClassName(node);
        if (!cls) continue;
        const def = defs?.[cls];
        // Consider nodes whose runtime class is not 'ComfyClass' as output nodes as well
        const runtimeClassName = (node && node.constructor && node.constructor.name) ? node.constructor.name : null;
        console.log(`runtimeClassName: ${runtimeClassName}`);
        const isNonComfyRuntimeClass = !!(runtimeClassName && runtimeClassName !== 'ComfyClass');
        const isOutputNode = isNonComfyRuntimeClass || !!(def && def.output_node);
        if (isOutputNode) continue; // keep output nodes
        if (!dryRun) removeNode(node);
        removed.push({ id: node.id, class_name: cls });
    }

    try { logger.info?.(`[removeLeafNodesWithoutOutputNode] ${dryRun ? "Would remove" : "Removed"} ${removed.length} node(s).`); } catch(_e) {}
    return { removed_count: removed.length, removed };
}

// Attach to window for direct console usage without imports
if (typeof window !== 'undefined') {
    window.removeLeafNodesByClassName = window.removeLeafNodesByClassName || removeLeafNodesByClassName;
    window.removeOrphanNodes = window.removeOrphanNodes || removeOrphanNodes;
    window.removeLeafNodesWithoutOutputNode = window.removeLeafNodesWithoutOutputNode || removeLeafNodesWithoutOutputNode;
}
