/**
 * Node traversal utilities (04 layer)
 *
 * This module re-exports the generalized upstream traversal and checks
 * implemented in common/linkUtils.js so consumers can import from
 * "src_js/04/node-traversal" as requested.
 */

/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraph} LGraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").Subgraph} Subgraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */

import { GraphHelpers } from "../common/graphHelpersForTwinNodes.js";
import { Logger } from "../common/logger.js";

/**
 * Generalized traversal: walk upstream through input links while any check remains true.
 * Returns nodes that passed checks (excluding the final failure).
 * Each check: (node, slotIndex, outputNode) => nextNode | [nextNode, nextSlot] | true | false
 * @param {LGraph|Subgraph} graph
 * @param {LGraphNode} startNode
 * @param {number} [slotIndex=0]
 * @param {Array<Function>} [checks]
 * @returns {LGraphNode[]}
 */
export function traverseInputsWhile(graph, startNode, slotIndex = 0, checks = null) {
    const traversed = [];
    if (!graph || !startNode) return traversed;
    const checkFns = Array.isArray(checks) && checks.length ? checks : defaultInputTraversalChecks;

    let node = startNode;
    let slot = slotIndex;
    let outputNode = null; // previous (downstream) node in the sequence
    const seen = new Set();
    let guard = 0;
    while (node && guard++ < 100) {
        const key = `${node.id}|${slot}`;
        if (seen.has(key)) break;
        seen.add(key);

        let anyTruthy = false;
        let explicitNextNode = null;
        let explicitNextSlot = undefined;

        for (const check of checkFns) {
            if (typeof check !== 'function') continue;
            let res = false;
            try {
                res = check(node, slot, outputNode);
            } catch (err) {
                Logger.log({ class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'warn', tag: 'check_exception' }, 'Check threw exception:', err, check?.name);
                res = false;
            }
            if (res === false) {
                continue;
            }
            anyTruthy = true;
            if (Array.isArray(res) && res.length) {
                explicitNextNode = res[0] ?? null;
                explicitNextSlot = res[1];
                break;
            } else if (res && typeof res === 'object') {
                explicitNextNode = res;
                explicitNextSlot = undefined;
                break;
            } else if (res === true) {
                continue;
            }
        }

        if (!anyTruthy) {
            break;
        }

        traversed.push(node);

        let nextNode = explicitNextNode;
        let nextSlot = explicitNextSlot;
        if (!nextNode) {
            const input = node.inputs?.[slot];
            const linkId = input?.link;
            if (linkId == null) break;
            const link = GraphHelpers.getLink(graph, linkId);
            if (!link) break;
            nextNode = GraphHelpers.getNodeById(graph, link.origin_id);
            nextSlot = link.origin_slot ?? 0;
        }

        outputNode = node;
        node = nextNode;
        slot = nextSlot ?? 0;
    }

    return traversed;
}

// ---- Check helpers ----
/**
 * Check 1: isReroute => node.type === "Reroute"
 */
export function checkIsReroute(node) {
    return !!node && node.type === 'Reroute';
}

/**
 * Check 2: isGetNode => node.getInputLink(slotIndex) exists and returns an Object
 * Returns true to indicate caller can decide next via default link-follow.
 */
export function checkIsGetNode(node, slotIndex = 0) {
    try {
        if (!node || typeof node.getInputLink !== 'function') return false;
        const v = node.getInputLink(slotIndex);
        const ok = v && typeof v === 'object';
        if (!ok) {
            Logger.log({ class: 'NodeTraversal', method: 'checkIsGetNode', severity: 'warn', tag: 'non_object' }, 'getInputLink did not return object', v, 'on node', node?.type);
        }
        return !!ok;
    } catch (err) {
        Logger.log({ class: 'NodeTraversal', method: 'checkIsGetNode', severity: 'warn', tag: 'exception' }, 'Exception in getInputLink', err);
        return false;
    }
}

/**
 * Check 3: isStringToString => node is connected to outputNode and both ends are type STRING or *,
 * and there are 0..1 connected input links of type STRING or * on the node.
 */
export function checkIsStringToString(node, slotIndex = 0, outputNode = null) {
    const isStringish = (t) => t === 'STRING' || t === '*';
    if (!node || !outputNode) return false;

    // Try to find the link connecting outputNode -> node
    let linkId = node.inputs?.[slotIndex]?.link ?? null;
    let graph = node.graph || node._graph || outputNode.graph || outputNode._graph;
    let link = linkId != null ? GraphHelpers.getLink(graph, linkId) : null;
    if (!link || link.origin_id !== outputNode.id) {
        for (let i = 0; i < (node.inputs?.length ?? 0); i++) {
            const lId = node.inputs?.[i]?.link;
            if (lId == null) continue;
            const l = GraphHelpers.getLink(graph, lId);
            if (l && l.origin_id === outputNode.id && l.target_id === node.id) {
                link = l;
                slotIndex = i;
                break;
            }
        }
    }
    if (!link) return false;

    const originOutType = outputNode?.outputs?.[link.origin_slot ?? 0]?.type;
    const targetInType = node?.inputs?.[link.target_slot ?? slotIndex]?.type;
    if (!isStringish(originOutType) || !isStringish(targetInType)) return false;

    let stringishInputs = 0;
    for (let i = 0; i < (node.inputs?.length ?? 0); i++) {
        const inp = node.inputs[i];
        if (!inp?.link) continue;
        const t = inp?.type;
        if (isStringish(t)) stringishInputs++;
    }
    if (stringishInputs > 1) return false;
    return true;
}

export const defaultInputTraversalChecks = [
    (node, slotIndex, outputNode) => checkIsReroute(node, slotIndex, outputNode) || false,
    (node, slotIndex, outputNode) => checkIsGetNode(node, slotIndex, outputNode) || false,
    (node, slotIndex, outputNode) => checkIsStringToString(node, slotIndex, outputNode) || false,
];

const NodeTraversal = {
    traverseInputsWhile,
    checkIsReroute,
    checkIsGetNode,
    checkIsStringToString,
    get defaultInputTraversalChecks() { return defaultInputTraversalChecks; }
};
export default NodeTraversal;
