/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LiteGraph} LiteGraph */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LGraphCanvas} LGraphCanvas */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LLink} LLink */

import {app} from "../../../scripts/app.js";
import {GraphHelpers} from "../common/graphHelpersForTwinNodes.js";
import {LinkUtils} from "../common/linkUtils.js";

// Utility: extend node getExtraMenuOptions safely
export function addContextMenuHandler(nodeType, callback) {
    const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
        const r = getExtraMenuOptions.apply(this, arguments);
        callback.apply(this, arguments);
        return r;
    };
}

export function jumpToNodeWithLinkId(id) {
    app.canvas.selectNode(app.graph.getNodeById(app.graph._links.get(id).origin_id), false); app.canvas.fitViewToSelectionAnimated()
}

export function addNode(name, nextTo, options) {
    options = {side: "left", select: true, shiftY: 0, shiftX: 0, ...(options || {})};
    const node = LiteGraph.createNode(name);
    app.graph.add(node);

    node.pos = [
        options.side === "left" ? nextTo.pos[0] - (node.size[0] + options.offset) : nextTo.pos[0] + nextTo.size[0] + options.offset,
        nextTo.pos[1] + options.shiftY,
    ];
    if (options.select) {
        app.canvas.selectNode(node, false);
    }
    return node;
}

export const possibleUniversalNodesToAdd = [
    "easy showAnything",
];
export const universalNodesToAddToOutput = new Set();
export const loggedUniversalNodesToAddToOutput = [];

export const updateSlots = (value) => {
    const valuesToAddToIn = ["GetTwinNodes"];
    const valuesToAddToOut = ["SetTwinNodes", ...universalNodesToAddToOutput];
    // Remove entries if they exist and re-add by position
    for (const slotTypes of Object.values(LiteGraph.slot_types_default_in)) {
        for (const valueToAdd of valuesToAddToIn) {
            const idx = slotTypes.indexOf(valueToAdd);
            if (idx !== -1) slotTypes.splice(idx, 1);
            if (value === "top") slotTypes.unshift(valueToAdd); else slotTypes.push(valueToAdd);
        }
    }

    Logger.log({
        class: 'ovum.contextmenu', method: 'updateSlots', severity: 'trace', tag: '', nodeName: 'ovum.contextmenu'
    }, `Adding context menu entries to universal nodes, position: ${value}: `, valuesToAddToOut);
    for (const slotTypes of Object.values(LiteGraph.slot_types_default_out)) {
        for (const valueToAdd of value !== "bottom" ? valuesToAddToOut.toReversed() : valuesToAddToOut) {
            const idx = slotTypes.indexOf(valueToAdd);
            if (idx !== -1) slotTypes.splice(idx, 1);
            if (value !== "bottom") slotTypes.unshift(valueToAdd); else slotTypes.push(valueToAdd);
        }
    }
};

/**
 * Inserts a PassthruOvum node between every outgoing link of a given node and its target,
 * unless the target node's type starts with "Passthru".
 * Title is based on widget value or `${node.title}_${outputIndex}` and made unique.
 * @param {LGraphNode} sourceNode
 */
export const insertPassthruBetweenOutputs = (sourceNode) => {
    if (!sourceNode) return;

    const graph = app.graph;
    const allLinks = graph.links ?? {};

    const getWidgetValue = (node, index = 0) => {
        if (!node) return undefined;
        const w = node.widgets?.[index];
        if (w && w.value !== undefined) return w.value;
        if (Array.isArray(node.widgets_values)) return node.widgets_values[index];
        return undefined;
    };

    const getOutputName = (node, index = 0) => {
        if (!node) return undefined;
        return node.outputs?.[0].name;
    }

    const isValidTitleValue = (val) => {
        const t = typeof val;
        if (t === 'number' || t === 'boolean') return true;
        if (t === 'string') return val.trim().length > 0;
        return false;
    };

    for (let outputIndex = 0; outputIndex < (sourceNode.outputs?.length ?? 0); outputIndex++) {
        const links = sourceNode.outputs?.[outputIndex]?.links;
        if (!Array.isArray(links) || links.length === 0) continue;

        let baseTitle;
        const outputName = getOutputName(sourceNode, outputIndex);
        baseTitle = isValidTitleValue(outputName) ? String(outputName) : `${sourceNode.title}_${outputIndex}`;

        for (const linkId of [...links]) {
            /** @type {LLink} */
            const link = allLinks[linkId];
            if (!link) continue;

            let { origin_id: originId, target_id: targetId, origin_slot: originSlot, target_slot: targetSlot, type } = link;
            let originNode = app.graph.getNodeById(originId);
            let targetNode = app.graph.getNodeById(targetId);
            if (!originNode || !targetNode) continue;

            if (originNode.type === 'Reroute') {
                let resolvedSlot;
                [originNode, resolvedSlot] = LinkUtils.traverseInputReroute(graph, originNode);
                originId = originNode?.id;
                originSlot = resolvedSlot ?? 0;
                if (originSlot === undefined || originSlot === -1) originSlot = 0;
            }

            if (targetNode.type === 'Reroute') {
                targetNode = LinkUtils.traverseOutputReroute(graph, targetNode);
                targetId = targetNode?.id;
                const idxByType = targetNode?.inputs?.findIndex(inp => inp.type === type);
                targetSlot = (idxByType == null || idxByType === -1) ? (targetSlot ?? 0) : idxByType;
            }

            if (!originNode || !targetNode) continue;
            if (typeof targetNode.type === 'string' && targetNode.type.startsWith('Passthru')) continue;

            try { GraphHelpers.removeLink(graph, linkId); } catch (_) {}

            const passthru = LiteGraph.createNode('PassthruOvum');
            const [ox, oy] = originNode.getConnectionPos(false, originSlot);
            const [tx, ty] = targetNode.getConnectionPos(true, targetSlot);
            const px = Math.round((ox + tx) / 2) - 40;
            const py = Math.round((oy + ty) / 2) - 10;
            passthru.pos = [px, py];

            const safeBase = LinkUtils.formatVariables(String(baseTitle));
            passthru.title = LinkUtils.uniqueTitle(graph, safeBase);

            graph.add(passthru);

            try { originNode.connect(originSlot, passthru, 0); } catch (_) {}
            try { passthru.connect(0, targetNode, targetSlot); } catch (_) {}
        }
    }
};

// Returns true if any output of the node connects directly to a Passthru* node
export const hasPassthruOutputs = (sourceNode) => {
    if (!sourceNode?.outputs?.length) return false;
    const graph = app.graph;
    const allLinks = graph.links ?? graph._links ?? {};
    for (let outIdx = 0; outIdx < sourceNode.outputs.length; outIdx++) {
        const links = sourceNode.outputs[outIdx]?.links;
        if (!Array.isArray(links)) continue;
        for (const linkId of links) {
            const link = allLinks[linkId];
            if (!link) continue;
            const target = graph.getNodeById ? graph.getNodeById(link.target_id) : app.graph._nodes_by_id?.[link.target_id];
            if (target && typeof target.type === 'string' && target.type.startsWith('Passthru')) {
                return true;
            }
        }
    }
    return false;
};

// Removes Passthru* nodes that are directly attached to the outputs of sourceNode and reconnects outputs
export const removePassthruFromOutputs = (sourceNode) => {
    if (!sourceNode) return;
    const graph = app.graph;
    const allLinks = graph.links ?? graph._links ?? {};

    for (let outIdx = 0; outIdx < (sourceNode.outputs?.length ?? 0); outIdx++) {
        const links = sourceNode.outputs?.[outIdx]?.links;
        if (!Array.isArray(links) || links.length === 0) continue;

        for (const linkId of [...links]) {
            const link = allLinks[linkId];
            if (!link) continue;
            const originSlot = link.origin_slot ?? outIdx;
            const passthruNode = graph.getNodeById ? graph.getNodeById(link.target_id) : app.graph._nodes_by_id?.[link.target_id];
            if (!passthruNode) continue;
            if (!(typeof passthruNode.type === 'string' && passthruNode.type.startsWith('Passthru'))) continue;

            const outLinks = passthruNode.outputs?.[0]?.links;
            const downstreamLinkIds = Array.isArray(outLinks) ? [...outLinks] : [];

            try { GraphHelpers.removeLink(graph, linkId); } catch (_) {}

            for (const downLinkId of downstreamLinkIds) {
                const downLink = allLinks[downLinkId];
                if (!downLink) continue;
                const targetNode = graph.getNodeById ? graph.getNodeById(downLink.target_id) : app.graph._nodes_by_id?.[downLink.target_id];
                const targetSlot = downLink.target_slot ?? 0;
                try { GraphHelpers.removeLink(graph, downLinkId); } catch (_) {}
                if (targetNode) {
                    try { sourceNode.connect(originSlot, targetNode, targetSlot); } catch (_) {}
                }
            }

            try { graph.remove(passthruNode); } catch (_) {
                try { graph.removeNode(passthruNode); } catch (_) {}
            }
        }
    }
};

/**
 * Clone a subgraph-like node to the right and transfer all outgoing links to the clone.
 * @param {LGraphNode} sourceNode
 */
export const cloneSubgraphNodeWithConnections = (sourceNode) => {
    if (!sourceNode) return;
    const graph = app.graph;

    let clone = null;
    try { if (typeof sourceNode.clone === 'function') clone = sourceNode.clone(); } catch (_) {}
    if (!clone) {
        try { clone = LiteGraph.createNode(sourceNode.type); } catch (_) {}
    }
    if (!clone) return;

    const offset = 40;
    const x = Math.round((sourceNode.pos?.[0] ?? 0) + (sourceNode.size?.[0] ?? 0) + offset);
    const y = Math.round(sourceNode.pos?.[1] ?? 0);
    try { clone.pos = [x, y]; } catch (_) {}

    try {
        const base = sourceNode.title || sourceNode.type || 'Subgraph';
        clone.title = LinkUtils.uniqueTitle(graph, base);
    } catch (_) {}

    try { graph.add(clone); } catch (_) {
        try { graph.addNode(clone); } catch (_) { return; }
    }

    const linksMap = graph.links ?? {};
    const outputs = sourceNode.outputs || [];
    for (let outIdx = 0; outIdx < outputs.length; outIdx++) {
        const outLinks = outputs[outIdx]?.links;
        if (!Array.isArray(outLinks) || outLinks.length === 0) continue;
        for (const linkId of [...outLinks]) {
            const link = linksMap[linkId] || GraphHelpers.getLink(graph, linkId);
            if (!link) continue;
            const targetNode = GraphHelpers.getNodeById(graph, link.target_id);
            const targetSlot = link.target_slot ?? 0;
            try { GraphHelpers.removeLink(graph, linkId); } catch (_) {}
            try { clone.connect(outIdx, targetNode, targetSlot); } catch (_) {}
        }
    }

    try {
        app.canvas.selectNode(clone, false);
        app.canvas.fitViewToSelectionAnimated?.();
    } catch (_) {}
};

// expose a handy global (kept for backward compatibility)
window.jumpToNodeWithLinkId = jumpToNodeWithLinkId;
