/** @typedef {import('@comfyorg/litegraph/dist/litegraph').LGraph} LGraph */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').Subgraph} Subgraph */

export const GraphHelpers = {
    /**
     * @param {LGraph | Subgraph} graph
     * @returns {(LGraphNode | SubgraphNode)[]}
     */
    getAllNodes(graph) {
        if (!graph) return [];
        // Prefer public accessor if available in the environment
        if (typeof graph.getNodes === "function") {
            try {
                const nodes = graph.getNodes();
                if (Array.isArray(nodes)) return nodes;
            } catch (_) {}
        }
        console.log("[TwinNodes] getAllNodes: using fallback");
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
        console.log(`[TwinNodes] getNodeById: graph of type ${graph.constructor.name} did not have getNodeById method: using fallback`);
        const nodes = this.getAllNodes(graph);
        return nodes.find(n => n && n.id == id) || null;
    },

    /**
     * @param {LGraph | Subgraph} graph
     * @param {number} linkId
     * @returns {LLink | null}
     */
    getLink(graph, linkId) {
        if (!graph || linkId == null) return null;
        if (typeof graph.getLink === "function") {
            try {
                return graph.getLink(linkId) || null;
            } catch (_) {}
        }
        console.log("[TwinNodes] getLink: using fallback");
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
        console.log("[TwinNodes] removeLink: using fallback");
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
     * @param {string} type
     * @returns {(LGraphNode | SubgraphNode)[]}
     */
    getNodesByType(graph, type) {
        if (!graph) return [];
        return this.getAllNodes(graph).filter(n => n && n.type === type);
    }
};
