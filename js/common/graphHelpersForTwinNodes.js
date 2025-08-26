export const GraphHelpers = {
    getAllNodes(graph) {
        if (!graph) return [];
        // Prefer public accessor if available in the environment
        if (typeof graph.getNodes === "function") {
            try {
                const nodes = graph.getNodes();
                if (Array.isArray(nodes)) return nodes;
            } catch (_) {}
        }
        return Array.isArray(graph?._nodes) ? graph._nodes : [];
    },

    getNodeById(graph, id) {
        if (!graph || id == null) return null;
        if (typeof graph.getNodeById === "function") {
            try {
                const n = graph.getNodeById(id);
                if (n) return n;
            } catch (_) {}
        }
        const nodes = this.getAllNodes(graph);
        return nodes.find(n => n && n.id == id) || null;
    },

    getLink(graph, linkId) {
        if (!graph || linkId == null) return null;
        if (typeof graph.getLink === "function") {
            try {
                return graph.getLink(linkId) || null;
            } catch (_) {}
        }
        return graph?.links?.[linkId] ?? null;
    },

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

    getNodesByType(graph, type) {
        if (!graph) return [];
        return this.getAllNodes(graph).filter(n => n && n.type === type);
    }
};
