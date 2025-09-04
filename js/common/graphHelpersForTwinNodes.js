/** @typedef {import('@comfyorg/litegraph/dist/litegraph').LGraph} LGraph */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').Subgraph} Subgraph */
import { log } from "./logger.js";

export const GraphHelpers = {
    /**
     * @param {LGraph | Subgraph} graph
     * @returns {(LGraphNode | SubgraphNode)[]}
     */
    getAllNodes(graph) {
        if (!graph) return [];
        return Array.isArray(graph?._nodes) ? graph._nodes : [];
    },

    /**
     * @param {LGraph | Subgraph} graph
     * @param {number} id
     * @returns {(LGraphNode | SubgraphNode)|null}
     */
    getNodeById(graph, id) {
        if (!graph || id == null) return null;
        if (typeof graph.getNodeById === "function") {
            try {
                const n = graph.getNodeById(id);
                if (n) return n;
            } catch (_) {}
        }
        log({ class: "GraphHelpers", method: "getNodeById", severity: "warn", tag: "fallback" }, `[TwinNodes] getNodeById: graph of type ${graph.constructor.name} did not have getNodeById method: using fallback`);
        const nodes = this.getAllNodes(graph);
        return nodes.find(n => n && n.id == id) || null;
    },

    /**
     * Retrieves a link from the given graph based on the provided link ID.
     *
     * @param {Object} graph - The graph object containing the links or a method to access links.
     * @param {string|number} linkId - The unique identifier for the link to be retrieved.
     * @return {Object|null} The link object if found, or null if the link does not exist or an error occurs.
     */
    getLink(graph, linkId) {
        if (!graph || linkId == null) return null;
        if (typeof graph.getLink === "function") {
            try {
                return graph.getLink(linkId) || null;
            } catch (_) {
                log({ class: "GraphHelpers", method: "getLink", severity: "error", tag: "exception" }, `[TwinNodes] getLink: exception while calling graph.getLink: ${_}`);
            }
        }
        log({ class: "GraphHelpers", method: "getLink", severity: "warn", tag: "fallback" }, "[TwinNodes] getLink: using fallback");
        return graph?.links?.[linkId] ?? null;
    },

    /**
     * @param {LGraph | Subgraph} graph
     * @param {number} linkId
     * @returns {boolean}
     */
    removeLink(graph, linkId) {
        if (!graph || linkId == null) return false;
        if (typeof graph.removeLink === "function") {
            try {
                graph.removeLink(linkId);
                return true;
            } catch (_) {
                return false;
            }
        }
        log({ class: "GraphHelpers", method: "removeLink", severity: "warn", tag: "fallback" }, "[TwinNodes] removeLink: using fallback");
        // Fallback best-effort: remove from links map if present
        if (graph.links && Object.prototype.hasOwnProperty.call(graph.links, linkId)) {
            try {
                delete graph.links[linkId];
                return true;
            } catch (_) {
                return false;
            }
        }
        return false;
    },

    /**
     * @param {LGraph | Subgraph} graph
     * @param {string | string[]} typeOrTypes
     * @returns {(LGraphNode | SubgraphNode)[]}
     */
    getNodesByType(graph, typeOrTypes) {
        if (!graph) return [];
        const types = Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes];

        let matches = [];
        for (const t of types) {
            if (t == null) continue;

            // Call without the 'result' parameter so each call returns a fresh array (the native impl clears 'result')
            const newMatches = graph.findNodesByType(t, []) || [];
            matches.push(...newMatches);
        }

        return matches;
    }
};
