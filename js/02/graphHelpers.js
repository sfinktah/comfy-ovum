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
 * @param {string} id 
 * @returns {object|null} Found node or null if not found.
 */
export function graphGetNodeById(id) {
    const g = app?.graph;
    if (!g) return null;
    if (typeof g.getNodeById === "function") return g.getNodeById(id);
    if (g._nodes_by_id) return g._nodes_by_id[id] ?? null;
    const nodes = g._nodes || g.nodes;
    return Array.isArray(nodes) ? (nodes.find(n => n?.id === id) ?? null) : null;
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
    const node = graphGetNodeById(id);
    if (!node) return `id:${id}`;
    const name = node.title || node.name || node.type || "";

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

