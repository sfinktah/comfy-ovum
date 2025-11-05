// Port of Python _inspect_upstream to JavaScript (ESM)
// See: custom_nodes/ovum/ovum_helpers.py
// This utility inspects the workflow _prompt to discover metadata about the upstream
// connection for a given node input.
/**
 * @typedef {import('@comfyorg/comfyui-frontend-types').ISerialisedGraph} ISerialisedGraph
 * @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApiWorkflow} ComfyApiWorkflow
 */


/**
 * Attempt to unwrap values that could be wrapped in a single-element array.
 * Mirrors the Python try: x = x[0] except: x = x
 */
function unwrapOne(x) {
    try {
        if (Array.isArray(x) && x.length > 0) return x[0];
    } catch(_e) {}
    return x;
}

/**
 * Extracts the this node id from _uid, similar to Python's str(_uid).rpartition('.')[-1]
 */
function extractThisNodeId(uid) {
    try {
        const s = String(uid ?? "");
        if (!s) return null;
        const idx = s.lastIndexOf(".");
        return idx >= 0 ? s.substring(idx + 1) : s;
    } catch(_e) {
        return null;
    }
}

// Module-level cache for node defs (populated asynchronously)
let _nodeDefsCache = null;
let _nodeDefsPending = null;

/**
 * Fetch and cache app.getNodeDefs() once and share across consumers.
 * Returns the defs object or null if unavailable.
 */
export async function getNodeDefsCached() {
    try {
        const canFetch = typeof app !== "undefined" && typeof app.getNodeDefs === "function";
        if (_nodeDefsCache) return _nodeDefsCache;
        if (!canFetch) return null;
        if (!_nodeDefsPending) {
            _nodeDefsPending = app.getNodeDefs()
                .then(defs => {
                    if (defs && typeof defs === "object") {
                        _nodeDefsCache = defs;
                    }
                    return _nodeDefsCache;
                })
                .catch(() => null)
                .finally(() => {
                    _nodeDefsPending = null;
                });
        }
        return await _nodeDefsPending;
    } catch (_e) {
        return null;
    }
}

/**
 * Try to read OUTPUT_IS_LIST for a class name if available on the frontend using node defs.
 * Returns the boolean for the slot index (awaits defs on first use).
 */
export async function resolveOutputIsListForSlot(_className, _slotIndex) {
    try {
        const defs = await getNodeDefsCached();
        if (!defs) return false;
        const clsDef = defs?.[_className];
        if (!clsDef) return false;
        const list =
            (Array.isArray(clsDef.output_is_list) && clsDef.output_is_list) ||
            (Array.isArray(clsDef.OUTPUT_IS_LIST) && clsDef.OUTPUT_IS_LIST) ||
            null;
        if (!list) return false;
        return !!list?.[_slotIndex];
    } catch (_e) {
        return false;
    }
}

/**
 * Inspect upstream node information for an input on a given node.
 * @param {{workflow: ISerialisedGraph, output: ComfyApiWorkflow}} _prompt - The _prompt returned by app.graphToPrompt() promise
 * @param {any} _uid - The node unique id (may be array-wrapped or dotted string)
 * @param {string} inputName - The name of the input to inspect on this node
 * @param {{contextLabel?: string, logger?: Console}} [opts]
 * @returns {Promise<{
 *   this_node_id: (string|null),
 *   source_output_is_list: boolean,
 *   source_node_id: (string|number|null),
 *   source_node_output_slot: (number|null),
 *   source_node_class_name: (string|null),
 *   source_node_output_name: (string|null),
 *   source_node_output_label?: (string|undefined),
 *   source_node_output_type?: (string|undefined)
 * }>}
 */
export async function inspectUpstream(_prompt, _uid, inputName, opts) {
    const workflow = _prompt.workflow;
    const thisNodeId = extractThisNodeId(_uid);

    let sourceNodeId = null;
    let sourceNodeOutputSlot = null;
    let sourceNodeClassName = null;
    let sourceOutputIsList = false;
    let sourceNodeOutputName = null;
    let sourceNodeOutputLabel = undefined;
    let sourceNodeOutputType = undefined;

    // try {
        const outputs = _prompt.output;
        const _nodes_by_id = Object.fromEntries(workflow.nodes.map(node => [node.id, node]));
        const wfNodes = workflow?.nodes ?? [];

        // In Comfy _prompt, inputs are at output[thisNodeId].inputs[inputName]
        const thisNode = outputs?.[thisNodeId];
        const ptr = thisNode?.inputs?.[inputName];
        if (Array.isArray(ptr) && ptr.length === 2) {
            sourceNodeId = ptr[0];
            sourceNodeOutputSlot = ptr[1];

            // Prefer class_type from graph output map if present
            const srcNodeFromOutput = outputs?.[sourceNodeId];
            sourceNodeClassName = srcNodeFromOutput?.class_type ?? null;

            // Fallback: search workflow nodes list for matching id to derive type/class
            if (!sourceNodeClassName && wfNodes?.length) {
                // noinspection EqualityComparisonWithCoercionJS
                const match = wfNodes.find(v => (v?.id == sourceNodeId));
                sourceNodeClassName = match?.type || match?.comfyClass || match?.title || null;
            }

            // Resolve slot metadata from frontend graph if available
            try {
                const srcGraphNode = _nodes_by_id?.[sourceNodeId];
                const slotMeta = srcGraphNode?.outputs?.[sourceNodeOutputSlot];
                sourceNodeOutputName = slotMeta?.name ?? null;
                sourceNodeOutputLabel = slotMeta?.label;
                sourceNodeOutputType = slotMeta?.type;
            } catch(_e) {}

            // Attempt to resolve OUTPUT_IS_LIST if available in frontend; else false
            try {
                if (sourceNodeClassName != null && sourceNodeOutputSlot != null) {
                    sourceOutputIsList = !!(await resolveOutputIsListForSlot(sourceNodeClassName, sourceNodeOutputSlot));
                }
            } catch(_e) {
                sourceOutputIsList = false;
            }
        }
    // } catch(e) {
    //     try { logger.debug?.(`[ovum] ${contextLabel}: failed to inspect upstream for input '${inputName}': ${e}`); } catch(_e) {}
    // }

    return {
        this_node_id: thisNodeId ?? null,
        source_output_is_list: !!sourceOutputIsList,
        source_node_id: sourceNodeId,
        source_node_output_slot: sourceNodeOutputSlot,
        source_node_class_name: sourceNodeClassName,
        source_node_output_name: sourceNodeOutputName,
        source_node_output_label: sourceNodeOutputLabel,
        source_node_output_type: sourceNodeOutputType,
    };
}

// Optional: attach to window for direct browser usage without imports
if (typeof window !== 'undefined') {
    // Avoid overwriting if already present
    window.ovumInspectUpstream = window.ovumInspectUpstream || inspectUpstream;
}
