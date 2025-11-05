/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').ComfyApp} ComfyApp */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/litegraph.js').LiteGraph} LiteGraph */
/** @typedef {import('../01/typedefs.js').INodeInputSlot} INodeInputSlot */

/** @type {ComfyApp} */
import {app} from "../../../scripts/app.js";
import {chainCallback} from "../01/utility.js";
import { Logger } from "../common/logger.js";
import { api } from "../../../scripts/api.js";
// Frontend extension to apply backend "ui" updates for XRange cursor widget
// and to advance the cursor immediately after each workflow is queued.

let _queuePatched = false;

/**
 * Parse optional integer-like widget string.
 * - null/undefined/empty/whitespace => null
 * - otherwise -> parsed int (NaN -> null)
 */
function parseOptionalIntString(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (s.length === 0) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
}

/**
 * Compute range length like Python range.
 */
function rangeLength(start, stop, step) {
    if (step > 0) {
        if (start >= stop) return 0;
        return Math.floor((stop - start + step - 1) / step);
    } else {
        if (start <= stop) return 0;
        const mstep = -step;
        return Math.floor((start - stop + mstep - 1) / mstep);
    }
}

/**
 * Advance cursor on a single XRange node using its widgets.
 * Mirrors backend semantics closely for UI-only advancement.
 */
function advanceCursorForNode(node, app) {
    try {
        const wStart = node.widgets?.find(w => w?.name === "start");
        const wStop = node.widgets?.find(w => w?.name === "stop");
        const wStep = node.widgets?.find(w => w?.name === "step");
        const wRepeat = node.widgets?.find(w => w?.name === "repeat");
        const wCursor = node.widgets?.find(w => w?.name === "cursor");
        const wAdvance = node.widgets?.find(w => w?.name === "advance");
        const wReset = node.widgets?.find(w => w?.name === "reset");

        if (!wCursor) return; // nothing to do without a cursor widget

        const sOpt = parseOptionalIntString(wStart?.value);
        const start = sOpt === null ? 0 : sOpt;
        const stpOpt = parseOptionalIntString(wStep?.value);
        const step = stpOpt === null ? 1 : stpOpt;
        const stopOpt = parseOptionalIntString(wStop?.value);

        // Require stop and non-zero step to be valid
        if (stopOpt === null || step === 0) return;

        const repeat = !!(wRepeat?.value);
        const advance = wAdvance?.value !== false; // default true
        const reset = !!(wReset?.value);

        const n = rangeLength(start, stopOpt, step);

        // Handle degenerate range
        if (n === 0) {
            const uiCur = reset ? "0" : (wCursor.value ?? "0");
            if (wCursor.value !== uiCur) {
                wCursor.value = uiCur;
                if (typeof wCursor.callback === "function") {
                    try { wCursor.callback(wCursor.value, node, app); } catch {}
                }
                app.graph.setDirtyCanvas(true, true);
            }
            return;
        }

        let curOpt = parseOptionalIntString(wCursor.value);
        let cur = curOpt === null ? 0 : curOpt;

        // Apply reset for this evaluation
        if (reset) cur = 0;

        // Normalize cursor within or to border depending on repeat
        if (cur >= n) {
            if (repeat) cur = cur % n;
            else cur = n - 1;
        } else if (cur < 0) {
            if (repeat) cur = ((cur % n) + n) % n;
            else cur = 0;
        }

        // Compute next cursor (UI shows next position when advance is true)
        let nextCur = cur;
        if (advance) {
            nextCur = cur + 1;
            if (nextCur >= n) {
                if (repeat) nextCur = 0;
                else nextCur = n; // one past end keeps "exhausted" semantics
            }
        }

        const nextStr = String(nextCur);
        if (wCursor.value !== nextStr) {
            Logger.log({class:'pyobjects.xrange.ui',method:'advanceCursorForNode',severity:'info',tag:'cursor', nodeName:'pyobjects.xrange.ui'}, `advance on queue: ${wCursor.value} -> ${nextStr}`);
            wCursor.value = nextStr;

            if (typeof wCursor.callback === "function") {
                try { wCursor.callback(wCursor.value, node, app); } catch (e) {
                    Logger.log({class:'pyobjects.xrange.ui',method:'advanceCursorForNode',severity:'warn',tag:'error', nodeName:'pyobjects.xrange.ui'}, 'widget callback error:', e);
                }
            }

            app.graph.setDirtyCanvas(true, true);
        }
    } catch (e) {
        Logger.log({class:'pyobjects.xrange.ui',method:'advanceCursorForNode',severity:'warn',tag:'error', nodeName:'pyobjects.xrange.ui'}, 'advance failed:', e);
    }
}

/**
 * Advance all XRangeNode cursors in the current graph.
 */
function advanceAllXRangeCursors(app) {
    const nodes = app.graph?._nodes || [];
    for (const node of nodes) {
        // Match by comfyClass for robustness
        if (node?.comfyClass === "XRangeNode") {
            advanceCursorForNode(node, app);
        }
    }
}

// Frontend extension to apply backend "ui" updates for XRange cursor widget.

app.registerExtension({
    name: "pyobjects.xrange.ui",
    /**
     * @param {import("../../typings/ComfyNode.js").ComfyNode} nodeType
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyNodeDef} nodeData
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyApp} app
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Target the specific node by its displayed name or class name (support both).
        if (nodeData.name !== "XRangeNode") return;
        Logger.log({class:'pyobjects.xrange.ui',method:'beforeRegisterNodeDef',severity:'info',tag:'installed', nodeName:'pyobjects.xrange.ui'}, `xrange-ui: ${nodeData.name} installed`);

        // Patch queueing once to advance cursor after each workflow is queued
        if (!_queuePatched && api && typeof api.queuePrompt === "function") {
            const original = api.queuePrompt.bind(api);
            api.queuePrompt = function(...args) {
                const p = original(...args);
                // Advance after successful submission
                Promise.resolve(p)
                    .then(() => {
                        try {
                            advanceAllXRangeCursors(app);
                        } catch (e) {
                            Logger.log({class:'pyobjects.xrange.ui',method:'queuePatch',severity:'warn',tag:'error', nodeName:'pyobjects.xrange.ui'}, 'advanceAllXRangeCursors error:', e);
                        }
                    })
                    .catch(() => {
                        // Do not advance on failure
                    });
                return p;
            };
            _queuePatched = true;
            Logger.log({class:'pyobjects.xrange.ui',method:'beforeRegisterNodeDef',severity:'info',tag:'patch', nodeName:'pyobjects.xrange.ui'}, 'xrange-ui: queuePrompt patch installed');
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            Logger.log({class:'pyobjects.xrange.ui',method:'onNodeCreated',severity:'debug',tag:'event', nodeName:'pyobjects.xrange.ui'}, 'onNodeCreated', {'this': this});
            return onNodeCreated?.apply(this, arguments);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (e) {
            Logger.log({class:'pyobjects.xrange.ui',method:'onConfigure',severity:'debug',tag:'event', nodeName:'pyobjects.xrange.ui'}, 'onConfigure', {'this': this});
            onConfigure?.apply(this, arguments);
        };

        // const onExecuted = nodeType.prototype.onExecuted;
        // // chainCallback(nodeType.prototype, "onExecuted", function (e) {
        // nodeType.prototype.onExecuted = function (message) {
        //     Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'debug',tag:'event', nodeName:'pyobjects.xrange.ui'}, 'onExecuted', message);
        //     onExecuted?.apply(this, arguments);
        //
        //     try {
        //         if (!message) {
        //             Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'debug',tag:'early_return', nodeName:'pyobjects.xrange.ui'}, 'no message');
        //             return;
        //         }
        //
        //         // Only update the cursor widget if provided by backend.
        //         if ("cursor" in message) {
        //             const w = this.widgets?.find(w => w?.name === "cursor");
        //             if (w) {
        //                 const newVal = String(message.cursor);
        //                 if (w.value !== newVal) {
        //                     Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'info',tag:'cursor', nodeName:'pyobjects.xrange.ui'}, `cursor widget value changed ${w.value} -> ${newVal}`);
        //                     w.value = newVal;
        //
        //                     // Trigger any attached widget callback (keeps graph consistent).
        //                     if (typeof w.callback === "function") {
        //                         try {
        //                             w.callback(w.value, this, app);
        //                         } catch (e) {
        //                             Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'warn',tag:'error', nodeName:'pyobjects.xrange.ui'}, 'widget callback error:', e);
        //                         }
        //                     }
        //
        //                     // Redraw to show the updated value.
        //                     app.graph.setDirtyCanvas(true, true);
        //                 }
        //                 else {
        //                     Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'debug',tag:'cursor', nodeName:'pyobjects.xrange.ui'}, `cursor widget value unchanged ${w.value} -> ${newVal}`);
        //                 }
        //             }
        //             else {
        //                 Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'debug',tag:'cursor', nodeName:'pyobjects.xrange.ui'}, 'cursor widget not found');
        //             }
        //         }
        //         else {
        //             Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'debug',tag:'cursor', nodeName:'pyobjects.xrange.ui'}, 'no cursor in message');
        //         }
        //     } catch (e) {
        //         Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'warn',tag:'error', nodeName:'pyobjects.xrange.ui'}, 'failed applying UI updates:', e);
        //     }
        // };
    },
});
