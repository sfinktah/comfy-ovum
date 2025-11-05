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
import { isAnyGetNode, isAnySetNode } from "../common/twinNodeTypes.js";

// Internal small helpers to DRY link resolution logic used by multiple checks
function resolveGraph(a, b) {
    return a?.graph || a?._graph || b?.graph || b?._graph || null;
}
/**
 * Find the upstream link connecting outputNode -> node, optionally starting from a slotIndex hint.
 * Returns an object with the found link (or null) and the effective slotIndex where it was found.
 * @param {LGraphNode|ComfyNode} node
 * @param {number} [slotIndex=0]
 * @param {LGraphNode|ComfyNode|null} [outputNode=null]
 * @returns {{link: LLink|null, slotIndex: number, graph: any}}
 */
function findLinkBetween(node, slotIndex = 0, outputNode = null) {
    if (!node || !outputNode) return { link: null, slotIndex, graph: null };
    const graph = resolveGraph(node, outputNode);
    let linkId = node.inputs?.[slotIndex]?.link ?? null;
    let link = linkId != null ? GraphHelpers.getLink(graph, linkId) : null;
    if (!link || link.origin_id !== outputNode.id || link.target_id !== node.id) {
        for (let i = 0; i < (node.inputs?.length ?? 0); i++) {
            const lId = node.inputs?.[i]?.link;
            if (lId == null) continue;
            const l = GraphHelpers.getLink(graph, lId);
            if (l && l.origin_id === outputNode.id && l.target_id === node.id) {
                return { link: l, slotIndex: i, graph };
            }
        }
        return { link: null, slotIndex, graph };
    }
    return { link, slotIndex, graph };
}

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
            // Logger.log(
            //     { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'check_run' },
            //     'Running check',
            //     { iter, checkName, nodeId: node?.id, nodeType: node?.type, slot, outputNodeId: outputNode?.id }
            // );
            try {
                res = check(node, slot, outputNode);
            } catch (err) {
                Logger.log({ class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'warn', tag: 'check_exception' }, 'Check threw exception:', err, check?.name);
                res = false;
            }
            if (res === false) {
                // Logger.log(
                //     { class: 'NodeTraversal', method: 'traverseInputsWhile', severity: 'debug', tag: 'check_false' },
                //     'Check returned false',
                //     { iter, checkName }
                // );
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
        if (!isAnyGetNode(node)) return false;
        const link = node.getInputLink(slotIndex);
        const ok = link && typeof link === 'object';
        if (!ok) {
            Logger.log({ class: 'NodeTraversal', method: 'checkIsGetNode', severity: 'warn', tag: 'non_object' }, 'getInputLink did not return object', link, 'on node', node?.type);
            return false;
        }
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

    if (isAnySetNode(node)) {
        return true;
    }

    return false;

}

/**
 * @typedef {Object} CheckTypeToTypeOptions
 * @property {(t:any)=>boolean} [isEndType] - Predicate to test both origin (output) and target (input) types when specific originType/targetType are not provided.
 * @property {(t:any)=>boolean} [originType] - Predicate to test the origin (upstream output) slot's type. Overrides isEndType for the origin side when provided.
 * @property {(t:any)=>boolean} [targetType] - Predicate to test the target (current node input) slot's type. Overrides isEndType for the target side when provided.
 * @property {number|null} [maxInputsOfType=null] - Maximum number of connected inputs on the current node that may match countType. If the count exceeds this value, the check fails. When null, no max check is performed.
 * @property {(t:any)=>boolean|null} [countType=null] - Predicate used to count matching connected inputs when enforcing maxInputsOfType. Defaults to isEndType if present; when null, falls back to isEndType.
 * @property {(t:any)=>boolean|null} [requireAnyInputType=null] - If provided, at least one input on the current node must have a type for which this predicate returns true. See allowZeroInputsForRequire for zero-input behavior.
 * @property {boolean} [allowZeroInputsForRequire=true] - When true and the node has zero inputs, the requireAnyInputType requirement passes automatically.
 * @property {(t:any)=>boolean|null} [returnLinkedInputWhenType=null] - If provided and any connected input's type matches this predicate, the function returns that input's LLink object instead of a boolean.
 */

/**
 * Common helper to implement type-to-type checks between connected nodes.
 * Options allow customizing:
 *  - end type predicates (origin/target)
 *  - counting constraint for inputs of a given type
 *  - requiring presence of any input of a given type (optionally allow zero inputs)
 *  - returning a linked input when its type matches a predicate
 * @param {LGraphNode|ComfyNode} node
 * @param {number} [slotIndex=0]
 * @param {LGraphNode|ComfyNode|null} [outputNode=null]
 * @param {CheckTypeToTypeOptions} [opts]
 * @returns {boolean|object|LLink|ComfyNode|LGraphNode}
 */
function checkTypeToType(node, slotIndex = 0, outputNode = null, opts = {}) {
    if (!node || !outputNode) return false;
    const {
        isEndType,                // predicate(t) used for both ends unless originType/targetType provided
        originType,               // predicate(t) for origin output type
        targetType,               // predicate(t) for target input type
        maxInputsOfType = null,   // number | null - maximum connected inputs matching countType
        countType = null,         // predicate(t) to count, defaults to isEndType if provided
        requireAnyInputType = null, // predicate(t) that must exist on any input type (or zero allowed)
        allowZeroInputsForRequire = true, // if true and node has zero inputs, requirement passes
        returnLinkedInputWhenType = null, // predicate(t) whose connected input link should be returned
    } = opts || {};

    const { link, slotIndex: effSlot, graph } = findLinkBetween(node, slotIndex, outputNode);
    if (!link) return false;

    const originOutType = outputNode?.outputs?.[link.origin_slot ?? 0]?.type;
    const targetInType = node?.inputs?.[link.target_slot ?? effSlot]?.type;

    const originPred = originType || isEndType;
    const targetPred = targetType || isEndType;
    if (typeof originPred === 'function' && !originPred(originOutType)) return false;
    if (typeof targetPred === 'function' && !targetPred(targetInType)) return false;

    const inputsLen = node.inputs?.length ?? 0;

    if (requireAnyInputType) {
        let ok = allowZeroInputsForRequire && inputsLen === 0;
        if (!ok) {
            for (let i = 0; i < inputsLen; i++) {
                const t = node.inputs?.[i]?.type;
                if (requireAnyInputType(t)) { ok = true; break; }
            }
        }
        if (!ok) return false;
    }

    if (maxInputsOfType != null) {
        const counterPred = countType || isEndType;
        let count = 0;
        for (let i = 0; i < inputsLen; i++) {
            const inp = node.inputs?.[i];
            if (!inp?.link) continue;
            const t = inp?.type;
            if (counterPred && counterPred(t)) count++;
        }
        if (count > maxInputsOfType) return false;
    }

    if (returnLinkedInputWhenType) {
        for (let i = 0; i < inputsLen; i++) {
            const inp = node.inputs?.[i];
            if (!inp?.link) continue;
            const t = inp?.type;
            if (returnLinkedInputWhenType(t)) {
                const l = GraphHelpers.getLink(graph, inp.link);
                if (l) return l;
            }
        }
    }

    return true;
}

// Reusable type predicate helpers
// Note: keep minimal surface; export not required as these are internal to this module.
function isConditioningish(t) {
    return (t && String(t).includes('*')) || (t && String(t).toUpperCase().includes('CONDITIONING'));
}
function isStringish(t) {
    return t === 'STRING' || (t && String(t).includes('*'));
}
function isClipish(t) {
    return t === '*' || (t && String(t).toUpperCase().includes('CLIP'));
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
    return checkTypeToType(node, slotIndex, outputNode, {
        isEndType: isStringish,
        maxInputsOfType: 1,
        countType: isStringish,
    });
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
    return checkTypeToType(node, slotIndex, outputNode, {
        isEndType: isConditioningish,
        maxInputsOfType: 1,
        countType: isConditioningish,
    });
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
    return checkTypeToType(node, slotIndex, outputNode, {
        isEndType: isConditioningish,
        requireAnyInputType: isClipish,
        allowZeroInputsForRequire: true,
        returnLinkedInputWhenType: isStringish,
    });
}


export const defaultInputTraversalChecks = [
    checkIsReroute,
    checkIsGetNode,
    checkIsSetNode,
    checkIsStringToString,
    checkIsConditioningToConditioning,
    checkIsClipToConditioning,
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
