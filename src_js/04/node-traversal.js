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
/** @typedef {import("@comfyorg/comfyui-frontend-types").LLink} LLink */
/** @typedef {import("@comfyorg/comfyui-frontend-types").ComfyNode} ComfyNode */

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
    Logger.log(
        { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'start' },
        'Begin traversal',
        { startNodeId: startNode?.id, startNodeType: startNode?.type, slotIndex, checksProvided: Array.isArray(checks) ? checks.length : 0 }
    );
    if (!graph || !startNode) {
        Logger.log(
            { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'warn', tag: 'invalid_input' },
            'Missing graph or startNode',
            { hasGraph: !!graph, hasStartNode: !!startNode }
        );
        return traversed;
    }
    const checkFns = Array.isArray(checks) && checks.length ? checks : defaultInputTraversalChecks;

    let node = startNode;
    let slot = slotIndex;
    let outputNode = null; // previous (downstream) node in the sequence
    const seen = new Set();
    let guard = 0;
    while (node && guard++ < 100) {
        const iter = guard; // guard was incremented in condition
        const key = `${node.id}|${slot}`;
        if (seen.has(key)) {
            Logger.log(
                { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'warn', tag: 'cycle_detected' },
                'Cycle detected, stopping traversal',
                { iter, key, nodeId: node?.id, nodeType: node?.type, slot }
            );
            break;
        }
        seen.add(key);
        Logger.log(
            { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'visit' },
            'Visiting node',
            { iter, key, nodeId: node?.id, nodeType: node?.type, slot, outputNodeId: outputNode?.id, outputNodeType: outputNode?.type }
        );

        let anyTruthy = false;
        let explicitNextNode = null;
        let explicitNextSlot = undefined;

        for (const check of checkFns) {
            if (typeof check !== 'function') {
                Logger.log(
                    { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'skip_non_function_check' },
                    'Skipping non-function check',
                    { iter }
                );
                continue;
            }
            let res = false;
            const checkName = check?.name || '<anonymous>';
            Logger.log(
                { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'check_run' },
                'Running check',
                { iter, checkName, nodeId: node?.id, nodeType: node?.type, slot, outputNodeId: outputNode?.id }
            );
            try {
                res = check(node, slot, outputNode);
            } catch (err) {
                Logger.log({ class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'warn', tag: 'check_exception' }, 'Check threw exception:', err, check?.name);
                res = false;
            }
            if (res === false) {
                Logger.log(
                    { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'check_false' },
                    'Check returned false',
                    { iter, checkName }
                );
                continue;
            }
            anyTruthy = true;
            if (res?.origin_id != null && res?.target_id != null) {
                explicitNextNode = GraphHelpers.getNodeById(graph, res.origin_id);
                explicitNextSlot = res.origin_slot ?? 0;
                Logger.log(
                    {
                        class: 'NodeTraversal',
                        method: 'traverseInputsWhile',
                        severity: 'debug',
                        tag: 'check_explicit_next_link'
                    },
                    'Check provided explicit next via link',
                    {
                        iter,
                        checkName,
                        nextNodeId: explicitNextNode?.id,
                        nextNodeType: explicitNextNode?.type,
                        nextSlot: explicitNextSlot
                    }
                );
                break;
            } else if (Array.isArray(res) && res.length) {
                explicitNextNode = res[0] ?? null;
                explicitNextSlot = res[1];
                Logger.log(
                    { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'check_explicit_next_array' },
                    'Check provided explicit next via array',
                    { iter, checkName, nextNodeId: explicitNextNode?.id, nextNodeType: explicitNextNode?.type, nextSlot: explicitNextSlot }
                );
                break;
            } else if (res && typeof res === 'object') {
                explicitNextNode = res;
                explicitNextSlot = undefined;
                Logger.log(
                    { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'check_explicit_next_object' },
                    'Check provided explicit next via object',
                    { iter, checkName, nextNodeId: explicitNextNode?.id, nextNodeType: explicitNextNode?.type }
                );
                break;
            } else if (res === true) {
                Logger.log(
                    { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'check_true' },
                    'Check returned true (continue with default link-follow if needed)',
                    { iter, checkName }
                );
                // noinspection UnnecessaryContinueJS
                continue;
            }
        }

        if (!anyTruthy) {
            Logger.log(
                { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'no_checks_passed' },
                'No checks passed, stopping traversal',
                { nodeId: node?.id, nodeType: node?.type, slot }
            );
            break;
        }

        traversed.push(node);
        Logger.log(
            { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'push_node' },
            'Added node to traversed list',
            { count: traversed.length, nodeId: node?.id, nodeType: node?.type }
        );

        let nextNode = explicitNextNode;
        let nextSlot = explicitNextSlot;
        if (!nextNode) {
            const input = node.inputs?.[slot];
            const linkId = input?.link;
            if (linkId == null) {
                Logger.log(
                    { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'no_link_on_slot' },
                    'No link on current slot, stopping traversal',
                    { nodeId: node?.id, nodeType: node?.type, slot }
                );
                break;
            }
            Logger.log(
                { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'follow_link' },
                'Following link upstream',
                { nodeId: node?.id, slot, linkId }
            );
            const link = GraphHelpers.getLink(graph, linkId);
            if (!link) {
                Logger.log(
                    { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'warn', tag: 'link_not_found' },
                    'Link not found in graph, stopping traversal',
                    { linkId }
                );
                break;
            }
            nextNode = GraphHelpers.getNodeById(graph, link.origin_id);
            nextSlot = link.origin_slot ?? 0;
            Logger.log(
                { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'resolved_next_from_link' },
                'Resolved next from link',
                { nextNodeId: nextNode?.id, nextNodeType: nextNode?.type, nextSlot }
            );
        } else {
            Logger.log(
                { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'using_explicit_next' },
                'Using explicit next from check',
                { nextNodeId: nextNode?.id, nextNodeType: nextNode?.type, nextSlot }
            );
        }

        Logger.log(
            { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'advance' },
            'Advancing to next node',
            { fromNodeId: node?.id, toNodeId: nextNode?.id, toSlot: nextSlot ?? 0 }
        );
        outputNode = node;
        node = nextNode;
        slot = nextSlot ?? 0;
    }

    Logger.log(
        { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'end' },
        'Traversal complete',
        { traversedCount: traversed.length }
    );
    return traversed;
}

// ---- Check helpers ----
/**
 * Check 1: isReroute => node.type === "Reroute"
 * @param {LGraphNode|ComfyNode} node
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
export function checkIsReroute(node) {
    return !!node && node.type === 'Reroute';
}

/**
 * Check 2: isGetNode => node.getInputLink(slotIndex) exists and returns an Object.
 * Returns the link object (LLink or plain object) when available; otherwise false.
 * @param {LGraphNode|ComfyNode} node
 * @param {number} [slotIndex=0]
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
export function checkIsGetNode(node, slotIndex = 0) {
    try {
        if (!node || typeof node.getInputLink !== 'function') return false;
        const link = node.getInputLink(slotIndex);
        const ok = link && typeof link === 'object';
        if (!ok) {
            Logger.log({ class: 'NodeTraversal', method: 'checkIsGetNode', severity: 'warn', tag: 'non_object' }, 'getInputLink did not return object', link, 'on node', node?.type);
        }
        Logger.log({ class: 'NodeTraversal', method: 'checkIsGetNode', severity: 'warn', tag: 'non_object' }, 'getInputLink returned', link, 'on node', node?.type);
        return link;
    } catch (err) {
        Logger.log({ class: 'NodeTraversal', method: 'checkIsGetNode', severity: 'warn', tag: 'exception' }, 'Exception in getInputLink', err);
        return false;
    }
}

/**
 * Check: identifies Set-type twin nodes across supported packs.
 * @param {LGraphNode|ComfyNode} node
 * @param {number} [slotIndex=0]
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
export function checkIsSetNode(node, slotIndex = 0) {
    const isGetTwinNode = (node) => node.type === "GetTwinNodes";
    const isSetTwinNode = (node) => node.type === "SetTwinNodes";
    const isGetSetTwinNode = (node) => isGetTwinNode(node) || isSetTwinNode(node);

    // Support detection for KJNodes and EasyUse Get/Set nodes
    const KJ_SET_TYPE = "SetNode";
    const EASY_USE_SET_TYPE = "easy setNode";
    const toGetType = (setType) => {
        if (!setType || typeof setType !== "string") return setType;
        return setType.replace(/set/i, (m) => (m[0] === "S" ? "Get" : "get"));
    };
    const isKJSetNode = (node) => node?.type === KJ_SET_TYPE;
    const isEasyUseSetNode = (node) => node?.type === EASY_USE_SET_TYPE;
    const isKJGetNode = (node) => node?.type === toGetType(KJ_SET_TYPE);
    const isEasyUseGetNode = (node) => node?.type === toGetType(EASY_USE_SET_TYPE);

    const isAnyGetNode = (node) => node?.type === isGetTwinNode(node) || isKJGetNode(node) || isEasyUseGetNode(node);
    const isAnySetNode = (node) => isGetTwinNode(node) || isKJSetNode(node) || isEasyUseSetNode(node);
    const isAnyGetSetNode = (node) => isAnyGetNode(node) || isAnySetNode(node);

    if (isAnySetNode(node)) {
        return true;
    }

    return false;

}

/**
 * Check 3: isStringToString => node is connected to outputNode and both ends are type STRING or *,
 * and there are 0..1 connected input links of type STRING or * on the node.
 * @param {LGraphNode|ComfyNode} node
 * @param {number} [slotIndex=0]
 * @param {LGraphNode|ComfyNode|null} [outputNode=null]
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
export function checkIsStringToString(node, slotIndex = 0, outputNode = null) {
    const isStringish = (t) => t === 'STRING' || (t && String(t).includes('*'));
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
    // noinspection RedundantIfStatementJS
    if (stringishInputs > 1) return false;
    return true;
}

/**
 * Check: Conditioning to Conditioning. Ensures the connected link is between CONDITIONING-compatible ports,
 * and that the node has at most one CONDITIONING-like input connected.
 * @param {LGraphNode|ComfyNode} node
 * @param {number} [slotIndex=0]
 * @param {LGraphNode|ComfyNode|null} [outputNode=null]
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
export function checkIsConditioningToConditioning(node, slotIndex = 0, outputNode = null) {
    const isConditioningish = (t) => (t && String(t).includes('*')) || (t && String(t).toUpperCase().includes('CONDITIONING'));
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
    if (!isConditioningish(originOutType) || !isConditioningish(targetInType)) return false;

    let conditioningInputs = 0;
    for (let i = 0; i < (node.inputs?.length ?? 0); i++) {
        const inp = node.inputs[i];
        if (!inp?.link) continue;
        const t = inp?.type;
        if (isConditioningish(t)) conditioningInputs++;
    }
    if (conditioningInputs > 1) return false;
    return true;
}

/**
 * Check: Clip to Conditioning
 * Similar to checkIsConditioningToConditioning but:
 * - passes if there is at least one input whose type is CLIP or * (or there are no inputs at all)
 * - if there is a connected input link of type STRING or * it returns that LLink object instead of a boolean
 * @param {LGraphNode|ComfyNode} node
 * @param {number} [slotIndex=0]
 * @param {LGraphNode|ComfyNode|null} [outputNode=null]
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
export function checkIsClipToConditioning(node, slotIndex = 0, outputNode = null) {
    const isConditioningish = (t) => (t && String(t).includes('*')) || (t && String(t).toUpperCase().includes('CONDITIONING'));
    const isClipish = (t) => t === '*' || (t && String(t).toUpperCase().includes('CLIP'));
    const isStringish = (t) => t === 'STRING' || t === '*';

    if (!node || !outputNode) return false;

    // Find the link connecting outputNode -> node
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
    if (!isConditioningish(originOutType) || !isConditioningish(targetInType)) return false;

    // Accept if there are no inputs, or at least one input type is CLIPish
    const inputsLen = node.inputs?.length ?? 0;
    let hasClipishInputType = inputsLen === 0;
    if (!hasClipishInputType) {
        for (let i = 0; i < inputsLen; i++) {
            const t = node.inputs?.[i]?.type;
            if (isClipish(t)) {
                hasClipishInputType = true;
                break;
            }
        }
    }
    if (!hasClipishInputType) return false;

    // If there is a connected STRINGish input link, return its LLink object
    for (let i = 0; i < inputsLen; i++) {
        const inp = node.inputs?.[i];
        if (!inp?.link) continue;
        const t = inp?.type;
        if (isStringish(t)) {
            const stringLink = GraphHelpers.getLink(graph, inp.link);
            if (stringLink) return stringLink;
        }
    }

    return true;
}

// Named wrappers so logger can display check names instead of <anonymous>
/**
 * Wrapper: checkReroute
 * @param {LGraphNode|ComfyNode} node
 * @param {number} slotIndex
 * @param {LGraphNode|ComfyNode|null} outputNode
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
function checkReroute(node, slotIndex, outputNode) {
    return checkIsReroute(node, slotIndex, outputNode) || false;
}
/**
 * Wrapper: checkGetNode
 * @param {LGraphNode|ComfyNode} node
 * @param {number} slotIndex
 * @param {LGraphNode|ComfyNode|null} outputNode
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
function checkGetNode(node, slotIndex, outputNode) {
    return checkIsGetNode(node, slotIndex, outputNode) || false;
}
/**
 * Wrapper: checkSetNode
 * @param {LGraphNode|ComfyNode} node
 * @param {number} slotIndex
 * @param {LGraphNode|ComfyNode|null} outputNode
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
function checkSetNode(node, slotIndex, outputNode) {
    return checkIsSetNode(node, slotIndex, outputNode) || false;
}
/**
 * Wrapper: checkStringToString
 * @param {LGraphNode|ComfyNode} node
 * @param {number} slotIndex
 * @param {LGraphNode|ComfyNode|null} outputNode
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
function checkStringToString(node, slotIndex, outputNode) {
    return checkIsStringToString(node, slotIndex, outputNode) || false;
}
/**
 * Wrapper: checkConditioningToConditioning
 * @param {LGraphNode|ComfyNode} node
 * @param {number} slotIndex
 * @param {LGraphNode|ComfyNode|null} outputNode
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
function checkConditioningToConditioning(node, slotIndex, outputNode) {
    return checkIsConditioningToConditioning(node, slotIndex, outputNode) || false;
}
/**
 * Wrapper: checkClipToConditioning
 * @param {LGraphNode|ComfyNode} node
 * @param {number} slotIndex
 * @param {LGraphNode|ComfyNode|null} outputNode
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
function checkClipToConditioning(node, slotIndex, outputNode) {
    return checkIsClipToConditioning(node, slotIndex, outputNode) || false;
}

export const defaultInputTraversalChecks = [
    checkReroute,
    checkGetNode,
    checkSetNode,
    checkStringToString,
    checkConditioningToConditioning,
    checkClipToConditioning,
];

const NodeTraversal = {
    traverseInputsWhile,
    checkIsReroute,
    checkIsGetNode,
    checkIsStringToString,
    checkIsConditioningToConditioning,
    checkIsClipToConditioning,
    get defaultInputTraversalChecks() { return defaultInputTraversalChecks; }
};
export default NodeTraversal;
