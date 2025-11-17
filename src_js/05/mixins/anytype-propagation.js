import { chainCallback } from "../../01/utility.js";
import { traverseInputsWhile, checkIsReroute, checkIsGetNode, checkIsAnytypeToAnytype } from "../../04/node-traversal.js";

/**
 * Apply a mix-in to a Comfy/LiteGraph nodeType so that when connections change
 * on input[0], it dynamically adjusts input[0] and output[0] types based on
 * the nearest upstream non-* type. If disconnected, reverts both to '*'.
 *
 * The hook is skipped when invoked from specific call sites (per stack check):
 *   - LGraphNode.prototype.connect
 *   - LGraphNode.connect
 *   - loadGraphData
 *   - convertToSubgraph
 *   - pasteFromClipboard
 *
 * @param {Function} nodeType - The node constructor whose prototype will be patched.
 */
export function applyAnytypeInput0Mixin(nodeType) {
    if (!nodeType || !nodeType.prototype) return;

    // Only patch once per prototype to avoid duplicating logic
    if (nodeType.prototype.__ovum_anytypeInput0MixinApplied) return;
    nodeType.prototype.__ovum_anytypeInput0MixinApplied = true;

    chainCallback(nodeType.prototype, "onConnectionsChange", function (type, slotIndex, isConnected /*, link_info, input_slot, output_slot */) {
        try {
            // Guard: only respond for input[0]
            const isInput = (type === 1 || type === (globalThis?.LiteGraph?.INPUT ?? -999));
            if (!isInput || slotIndex !== 0) return;

            // Guard: skip if stack indicates programmatic graph operations
            const stack = (new Error()).stack || "";
            const skipNeedles = [
                "LGraphNode.prototype.connect",
                "LGraphNode.connect",
                "loadGraphData",
                "convertToSubgraph",
                "pasteFromClipboard",
            ];
            for (const needle of skipNeedles) {
                if (stack.includes(needle)) return;
            }

            // Access input[0] and output[0]
            const inp0 = this.inputs && this.inputs[0];
            const out0 = this.outputs && this.outputs[0];
            if (!inp0 && !out0) return;

            if (!isConnected) {
                if (inp0) inp0.type = "*";
                if (out0) out0.type = "*";
                // mark canvas dirty to refresh types
                this?.graph?.canvas?.setDirty?.(true, true);
                return;
            }

            // Connected: find nearest upstream non-* type using traversal
            const graph = this.graph || this._graph || null;
            let resolvedType = null;
            const checks = [checkIsReroute, checkIsGetNode, checkIsAnytypeToAnytype];
            const visited = traverseInputsWhile(graph, this, 0, checks);

            function firstNonAnyTypeFromNode(n) {
                // Prefer outputs first (common data flow), then inputs
                const outs = n?.outputs || [];
                for (let i = 0; i < outs.length; i++) {
                    const t = outs[i]?.type;
                    if (t && t !== "*") return t;
                }
                const ins = n?.inputs || [];
                for (let i = 0; i < ins.length; i++) {
                    const t = ins[i]?.type;
                    if (t && t !== "*") return t;
                }
                return null;
            }

            // Check current node first (visited[0] is typically this)
            let t = firstNonAnyTypeFromNode(this);
            if (!t) {
                for (const n of visited) {
                    t = firstNonAnyTypeFromNode(n);
                    if (t) break;
                }
            }
            resolvedType = t || "*";

            if (inp0) inp0.type = resolvedType;
            if (out0) out0.type = resolvedType;
            this?.graph?.canvas?.setDirty?.(true, true);
        } catch (e) {
            console.warn("[ovum.anytype-propagation] error in onConnectionsChange mixin:", e);
        }
    });
}

export default applyAnytypeInput0Mixin;
