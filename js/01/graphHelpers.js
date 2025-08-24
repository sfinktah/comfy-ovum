/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @type {ComfyApp} */
import { app } from "../../../scripts/app.js";

/**
 * Removes emojis from the input string.
 * @param {string} input
 * @returns {string} String without emojis.
 */
export function removeEmojis(input) {
    if (typeof input !== "string") {
        return input == null ? "" : String(input);
    }

    try {
        const stripped = input
            .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]/gu, "")
            .replace(/\p{Emoji_Modifier_Base}\p{Emoji_Modifier}/gu, "")
            .replace(/[\u20E3]/g, "");

        return stripped.normalize();
    } catch {
        return input.replace(
            /([\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F100}-\u{1F1FF}]|[\u2460-\u24FF]|\uFE0F)/gu,
            ""
        );
    }
}

/**
 * Retrieve a node by its ID.
 * Supports nested subgraph lookup using colon-separated IDs, e.g. "126:22:11".
 * @param {string|number} id
 * @returns {object|null} Found node or null if not found.
 */
export function graphGetNodeById(id) {
    const root = app?.graph;
    if (!root) return null;

    const parts = (typeof id === "string" ? id : String(id)).split(":");

    const coerce = (v) => (/^\d+$/.test(v) ? Number(v) : v);

    const getFrom = (graph, key) => {
        if (!graph) return null;
        if (typeof graph.getNodeById === "function") return graph.getNodeById(key);
        if (graph._nodes_by_id) return graph._nodes_by_id[key] ?? null;
        const nodes = graph._nodes || graph.nodes;
        return Array.isArray(nodes) ? (nodes.find(n => n?.id === key) ?? null) : null;
    };

    let currentGraph = root;
    let node = null;

    for (let i = 0; i < parts.length; i++) {
        const key = coerce(parts[i]);
        node = getFrom(currentGraph, key);
        if (!node) return null;
        if (i < parts.length - 1) {
            currentGraph = node.subgraph ?? null;
            if (!currentGraph) return null;
        }
    }

    return node;
}

/**
 * Find nodes by type name.
 * @param {string} type 
 * @returns {Array} Array of nodes matching the type.
 */
export function findNodesByTypeName(type) {
    const g = app?.graph;
    if (!g) return [];
    if (typeof g.findNodesByType === "function") return g.findNodesByType(type);
    if (typeof g.findNodesByClass === "function") return g.findNodesByClass(type);
    const nodes = g._nodes || g.nodes || [];
    return nodes.filter(n => n?.type === type || n?.comfyClass === type || n?.name === type);
}

export function getNodeNameById(id) {
    // g = app.graph._nodes_by_id[126].subgraph._nodes_by_id[22]
    // g = app.graph.getNodeById(126).subgraph.getNodeById(22)
    const node = graphGetNodeById(id);
    if (!node) return `id:${id}`;
    const name = node.getTitle() || node.title || node.name || node.type || "";

    // RegExp to remove most common Unicode emoji/emoticon characters
    return removeEmojis(name) + ' (' + id + ')';
}

/**
 * Retrieve Timer nodes.
 * @returns {Array} Array of Timer nodes.
 */
export const findTimerNodes = () => findNodesByTypeName("Timer");

/**
 * Map graph nodes to selected key/value pairs.
 * Example:
 *  - mapGraphNodes(['title', 'type']) => [{ title: '...', type: '...' }, ...]
 *  - mapGraphNodes(['title', 'type'], 'id') => { '127': { title: '...', type: '...' }, '128': { ... } }
 * @param {string|string[]} keyNames - One or more property names to pick from each node.
 * @param {string} [groupBy] - If provided, the value of this property on each node becomes the key in the returned object.
 * @returns {Array<object>|Object<string, object>} Array of picked objects, or an object keyed by the grouping value.
 */
export function mapGraphNodes(keyNames, groupBy) {
    const g = app?.graph;
    const nodes = g ? (g._nodes || g.nodes || []) : [];
    if (!Array.isArray(nodes)) return groupBy ? {} : [];

    const keys = Array.isArray(keyNames) ? keyNames : [keyNames];

    const pickFrom = (n) =>
        keys.reduce((acc, k) => {
            acc[k] = n?.[k];
            return acc;
        }, {});

    if (groupBy) {
        return nodes.reduce((acc, n) => {
            const groupKey = n?.[groupBy];
            if (groupKey === undefined || groupKey === null) return acc;
            acc[groupKey] = pickFrom(n);
            return acc;
        }, {});
    }

    return nodes.map(pickFrom);
}

