/**
 * Shared helpers for link operations and reroute resolution.
 */

/** @typedef {import('@comfyorg/litegraph/dist/litegraph').LGraph} LGraph */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').Subgraph} Subgraph */
/** @typedef {import('@comfyorg/litegraph/dist/LGraphNode').LGraphNode} LGraphNode */
/** @typedef {import('@comfyorg/litegraph/dist/LLink').LLink} LLink */

import { GraphHelpers } from "./graphHelpersForTwinNodes.js";

export const LinkUtils = {
    /**
     * Format a string to a safe variable-like name: lowercase and replace non [a-z0-9_] with underscores.
     * @param {string} text
     * @returns {string}
     */
    formatVariables(text) {
        if (typeof text !== 'string') {
            if (text == null) return '';
            try { text = String(text); } catch { return ''; }
        }
        return text.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    },

    /**
     * Resolve reroute chain for an input side and return the final non-reroute node and slot.
     * @param {LGraph|Subgraph} graph
     * @param {LGraphNode} node
     * @param {number} slotIndex
     * @returns {[LGraphNode, number]}
     */
    traverseInputReroute(graph, node, slotIndex = 0) {
        if (!node || node.type !== 'Reroute') return [node, slotIndex];

        const inputLinkId = node.inputs?.[0]?.link;
        if (!inputLinkId) return [node, slotIndex];

        const link = GraphHelpers.getLink(graph, inputLinkId);
        if (!link) return [node, slotIndex];

        const upstream = GraphHelpers.getNodeById(graph, link.origin_id);
        if (!upstream) return [node, slotIndex];

        return this.traverseInputReroute(graph, upstream, link.origin_slot ?? 0);
    },

    /**
     * Resolve reroute chain for an output side and return the final non-reroute node.
     * @param {LGraph|Subgraph} graph
     * @param {LGraphNode} node
     * @returns {LGraphNode}
     */
    traverseOutputReroute(graph, node) {
        if (!node || node.type !== 'Reroute') return node;
        const outputLinks = node.outputs?.[0]?.links;
        if (!outputLinks || !outputLinks.length) return node;
        const firstLinkId = outputLinks[0];
        if (!firstLinkId) return node;
        const link = GraphHelpers.getLink(graph, firstLinkId);
        if (!link) return node;
        const downstream = GraphHelpers.getNodeById(graph, link.target_id);
        if (!downstream) return node;
        return this.traverseOutputReroute(graph, downstream);
    },

    /**
     * Compute a name from link info similar to convertLinkToGetSetNode.
     * @param {LGraph|Subgraph} graph
     * @param {LLink} link
     * @returns {string}
     */
    computeNameFromLink(graph, link) {
        const type = link?.type;
        let { origin_id: originId, target_id: targetId, target_slot: targetSlot } = link ?? {};
        const originNode = GraphHelpers.getNodeById(graph, originId);
        const targetNode = GraphHelpers.getNodeById(graph, targetId);
        const fromToSuffix = `_from_${originId}_to_${targetId}`;
        // Try input name on target
        let name = this.formatVariables(targetNode?.getInputInfo?.(targetSlot)?.name ?? (typeof type === 'string' ? type.toLowerCase() : ''));
        if (!name) {
            const outName = originNode?.outputs?.[link?.origin_slot ?? 0]?.name;
            const outType = originNode?.outputs?.[link?.origin_slot ?? 0]?.type?.toString?.();
            name = this.formatVariables(outName ?? outType ?? fromToSuffix);
        }
        return name;
    },

    /**
     * Ensure a unique node title within the graph.
     * @param {LGraph|Subgraph} graph
     * @param {string} base
     * @returns {string}
     */
    uniqueTitle(graph, base) {
        if (!base) base = 'node';
        const existing = new Set((GraphHelpers.getAllNodes(graph) || []).map(n => n?.title).filter(Boolean));
        if (!existing.has(base)) return base;
        let i = 2;
        while (existing.has(`${base} (${i})`)) i++;
        return `${base} (${i})`;
    }
};
