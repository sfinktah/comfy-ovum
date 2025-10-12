/// <reference lib="es2015.collection" />
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LiteGraph} LiteGraph */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LGraphCanvas} LGraphCanvas */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LGraph} LGraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LLink} LLink */
/** @typedef {import("@comfyorg/comfyui-frontend-types").INodeInputSlot} INodeInputSlot */
/** @typedef {import("@comfyorg/comfyui-frontend-types").INodeOutputSlot} INodeOutputSlot */
/** @typedef {import("@comfyorg/comfyui-frontend-types").ISlotType} ISlotType */
/** @typedef {import("@comfyorg/comfyui-frontend-types").SubgraphIO} SubgraphIO */
/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import("@comfyorg/comfyui-frontend-types").IWidget} IWidget */
/** @typedef {import("@comfyorg/comfyui-frontend-types").ContextMenuItem} ContextMenuItem */
/** @typedef {import("@comfyorg/comfyui-frontend-types").ComfyNode} ComfyNode */
/** @typedef {import("@comfyorg/comfyui-frontend-types").Subgraph} Subgraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").Point} Point */
// 1. **Removed potentially invalid types**: `NodeInputSlot`, `NodeOutputSlot`, and `Subgraph` - these don't appear to be standard exports from the comfyui-frontend-types package
/** @typedef {import("../common/graphHelpersForTwinNodes.js").GraphHelpers} GraphHelpers */

import {app} from "../../../scripts/app.js";
import {GraphHelpers} from "../common/graphHelpersForTwinNodes.js";
import {analyzeNamesForAbbrev, computeTwinNodeTitle, extractWidgetNames, safeStringTrim} from "../01/stringHelper.js";
import {
    ensureSlotCounts, findGetters, validateWidgetValue, wrapWidgetValueSetter, setWidgetValue,
    setWidgetValueWithValidation, suggestValidWidgetValue, showAlert
} from "../01/twinnodeHelpers.js";
import { chainCallback } from "../01/utility.js";
import {TwinNodes} from "../common/twinNodes.js";
import {drawTextWithBg, getWidgetBounds} from "../01/canvasHelpers.js";
import {log} from "../common/logger.js";
import {pushCurrentView, showTwinTipIfNeeded} from "./navigation-stack.js";

// Helper to collect unmatched getter-selected names (present in GetTwinNodes but not in any SetTwinNodes)
function getUnmatchedGetterValues(graph) {
    try {
        const getterNodes = GraphHelpers.getNodesByType(graph, 'GetTwinNodes') || [];
        const setterNodes = GraphHelpers.getNodesByType(graph, 'SetTwinNodes') || [];
        const getterValues = new Set();
        const setterValues = new Set();
        // Collect non-empty getter selections (excluding the explicit unset sentinel)
        for (const g of getterNodes) {
            const ws = g?.widgets || [];
            for (const w of ws) {
                const v = safeStringTrim(w?.value);
                if (v && v !== '(unset)') getterValues.add(v);
            }
        }
        // Collect existing setter widget names
        for (const s of setterNodes) {
            const ws = s?.widgets || [];
            for (const w of ws) {
                const v = safeStringTrim(w?.value);
                if (v) setterValues.add(v);
            }
        }
        // Compute unmatched: getter - setter
        const unmatched = Array.from(getterValues).filter(v => !setterValues.has(v));
        unmatched.sort((a, b) => a.localeCompare(b));
        return unmatched;
    } catch (_e) {
        return [];
    }
}

// Convert a specific widget to a plain text widget (STRING) in-place
function convertWidgetToText(node, idx) {
    try {
        const w = node?.widgets?.[idx];
        if (!w) return;
        // Change type first so renderer stops treating it as a ComboWidget
        w.type = "text";
        if (w.options) {
            delete w.options.values;
        } else {
            w.options = {};
        }
        // Force a redraw to apply the change immediately
        node?.setDirty?.(true, true);
    } catch (_e) { /* ignore */ }
}

// Ensure a combo widget has a safe values provider/array to avoid runtime errors in renderer
function ensureComboValues(node, idx) {
    try {
        const w = node?.widgets?.[idx];
        if (!w || w.type !== "combo") return;
        if (!w.options) w.options = {};
        const hasValuesKey = Object.prototype.hasOwnProperty.call(w.options, "values");
        const needsFix = !hasValuesKey || w.options.values == null;
        if (!needsFix) return;
        const MANUAL_OPTION = "(enter manually…)";
        w.options.values = () => {
            try {
                const graph = node.graph;
                if (!graph) return [MANUAL_OPTION];
                const unmatched = getUnmatchedGetterValues(graph);
                return [MANUAL_OPTION, ...unmatched];
            } catch (_e) {
                return [MANUAL_OPTION];
            }
        };
    } catch (_e) { /* ignore */ }
}

/**
 * Get the bounding box of a widget in node-local coordinates
 * @param {LGraphNode} node - The node containing the widget
 * @param {Object} widget - The widget to get bounds for
 * @returns {Object} - {x, y, width, height} in node-local coordinates
 */
// mostly written by GPT-5
// based on KJ's SetGet: https://github.com/kj-comfy/ComfyUI-extensions which was
// based on diffus3's SetGet: https://github.com/diffus3/ComfyUI-extensions

// Note: we don't actually have a settings , so lets use Kijai's
let disablePrefix = app.ui.settings.getSettingValue("ovum.disablePrefix")
const LGraphNode = LiteGraph.LGraphNode

// TwinNodes base moved to ../common/twinNodes.js and imported above
class SetTwinNodes extends TwinNodes {
    currentGetters = null;
    menuEntry = "Show connections";

    /**
     * Constructs a new SetTwinNodes instance.
     * Mirrors the LGraphNode constructor semantics by creating a node with an optional title and initializing defaults.
     * @param {string} title Optional title displayed in the editor UI.
     */
    constructor(title) {
        super(title)

        const node = this;

        // Create an arbitrary number of constants/links
        const initialCount = this.numberOfWidgets || 2;
        for (let i = 0; i < initialCount; i++) {
            const idx = i;
            const MANUAL_OPTION = "(enter manually…)";
            const widget = this.addWidget(
                "combo",
                `Constant ${idx + 1}`,
                '',
                callback,
                {
                    values: () => {
                        try {
                            const graph = node.graph;
                            if (!graph) return [MANUAL_OPTION];
                            const unmatched = getUnmatchedGetterValues(graph);
                            return [MANUAL_OPTION, ...unmatched];
                        } catch (_e) {
                            return [MANUAL_OPTION];
                        }
                    }
                }
            );
            // Ensure values provider remains present even after deserialization/edits
            ensureComboValues(node, idx);
            // Hook the value setter to track previous value
            // wrapWidgetValueSetter(widget);

            // callback?(value: any, canvas?: LGraphCanvas, node?: LGraphNode, pos?: Point, e?: CanvasPointerEvent): void;
            /**
             * A callback function triggered during widget interaction, performing actions such as updating node properties and validation.
             *
             * @param {string} value - The current value of the widget.
             * @param {LGraphCanvas} canvas - The canvas where the widget is rendered.
             * @param {SetTwinNodes} node - The node object associated with the widget.
             * @param {number} pos - The position of the widget.
             * @param {Object} e - The event object triggering the callback.
             * @return {void} Returns nothing.
             */
            function callback(value, canvas, node, pos, e) {
                log({ class: "SetTwinNodes", method: "callback", severity: "trace", tag: "function_entered" }, "widget callback", {
                    value: value,
                    previousValue: node.widgets[idx]?.previousValue,
                    value2: node.widgets[idx]?.value,
                    // node: node,
                    pos: pos,
                    // e: e
                });
                try {
                    if (value === MANUAL_OPTION) {
                        // Let user type a custom name via prompt, then validate and apply
                        const entered = (typeof window !== 'undefined' && typeof window.prompt === 'function')
                            ? window.prompt('Enter constant name:', '')
                            : '';
                        if (entered == null) {
                            // user cancelled; clear selection
                            setWidgetValue(node, idx, '');
                        } else {
                            setWidgetValueWithValidation(node, idx, entered);
                            value = node.widgets[idx]?.value;
                            // Switch this widget to a plain text widget since the user opted to enter manually
                            convertWidgetToText(node, idx);
                        }
                    }
                } catch (_e) { /* ignore */ }
                if (node && node.graph) {
                    validateWidgetValue(node, idx);
                    node.updateTitle();
                    node.updateColors();
                    node.checkConnections();
                    node.update();
                    node.properties.previousNames[idx] = value;
                }
            }

            // chainCallback(this, 'collapse', function collapse(force) {
            //     log({ class: "SetTwinNodes", method: "onMinimize", severity: "trace", tag: "function_entered" }, `force ${force}, flags.collapsed: ${node.flags?.collapsed}`);
            //     node.updateTitle(node.flags?.collapsed);
            // });
        }
        ensureSlotCounts(this);
        // Initialize previousNames snapshot to current widget values
        this.properties.previousNames = (this.widgets || []).map(w => safeStringTrim(w?.value));
        // If there are no unmatched getter-selected names, use plain STRING widgets instead of combo
        setTimeout(() => {
            try {
                const graph = node.graph;
                if (graph) {
                    const unmatched = getUnmatchedGetterValues(graph);
                    if (Array.isArray(unmatched) && unmatched.length === 0) {
                        for (let wi = 0; wi < (node.widgets?.length || 0); wi++) {
                            convertWidgetToText(node, wi);
                        }
                        node.update?.();
                    }
                }
            } catch (_e) { /* ignore */ }
        }, 200);
        // node.updateTitle();
        // node.updateColors();


        app.api.addEventListener("getnode_rename", e => {
            log({ class: "SetTwinNodes", method: "onGetNodeRename", severity: "trace", tag: "function_entered" }, "onGetNodeRename", e.detail);
            // const { widgetIndex, widgetValue, nodeId } = e.detail;
            // const node = GraphHelpers.getNodeById(this.graph, nodeId);
            node.checkConnections();
        });

        setTimeout(() => {
            node.checkConnections();
        }, 5000);
    }

    /**
     * Helper to compute and set the combined title from connected widgets' values,
     * and update node color from the first connected typed link
     */
    updateTitle(force) {
        log({ class: "SetTwinNodes", method: "updateTitle", severity: "trace", tag: "function_entered" }, `force: ${force}`);
        // can find the event for collapsing a node, so we'll just apply the title shortening all the time
        // if (collapsed) {
        //     this.fullTitle = this.title;
        //     if (this.title.length > 20) {
        //         this.title = this.title.substring(0, 19) + "…";
        //     }
        // }
        // else {
        const names = extractWidgetNames(this);
        const computedTitle = computeTwinNodeTitle(names, "set", disablePrefix);

        // Initialize properties.computedTitle if needed
        if (!this.properties?.computedTitle) {
            this.properties.computedTitle = this.title;
        }

        // Update title only if it matches the current computedTitle
        if (force || this.properties.computedTitle === this.title) {
            this.title = computedTitle;
        }

        this.properties.computedTitle = computedTitle;
        this.applyAbbreviatedOutputLabels();
    }



    /**
     * Compute and apply abbreviated labels to SetTwinNodes outputs where appropriate
     */
    applyAbbreviatedOutputLabels() {
        log({ class: "SetTwinNodes", method: "applyAbbreviatedOutputLabels", severity: "trace", tag: "function_entered" }, "applyAbbreviatedOutputLabels");

        // Build items from widget names using helper (allow duplicates, preserve order)
        const names = extractWidgetNames(this, { unique: false });
        const items = names.map((name, i) => ({ index: i, name }));

        if (!items.length) return;

        const analysis = analyzeNamesForAbbrev(items.map(it => it.name));
        log({ class: "SetTwinNodes", method: "applyAbbreviatedOutputLabels", severity: "trace", tag: "analysis" }, {analysis});
        if (analysis) {
            items.forEach((it, j) => {
                if (analysis.use) {
                    const short = analysis.shortNames[j] || it.name;
                    const evenShorter = short.length > 12 ? short.substring(0, 8) + "…" : short;
                    log({
                        class: "SetTwinNodes",
                        method: "applyAbbreviatedOutputLabels",
                        severity: "trace",
                        tag: "analysis"
                    }, {short, evenShorter});
                    this.setInputAndOutput(it.index, {
                        name: short,
                    });
                }
                else {
                    this.setInputAndOutput(it.index, {
                        name: it.name,
                    });
                }
            });
        }
    }

    /**
     * Callback invoked by {@link connect} to override the target slot widgetIndex.
     * Its return value overrides the target widgetIndex selection.
     * @this {SetTwinNodes}
     * @param {number} target_slot The current input slot widgetIndex
     * @param {number|string} requested_slot The originally requested slot widgetIndex - could be negative, or if using (deprecated) name search, a string
     * @returns {number|false|null} If a number is returned, the connection will be made to that input widgetIndex.
     * If an invalid widgetIndex or non-number (false, null, NaN etc) is returned, the connection will be cancelled.
     */
    onBeforeConnectInput(target_slot, requested_slot) {
        log({ class: "SetTwinNodes", method: "onBeforeConnectInput", severity: "trace", tag: "function_entered" }, "onBeforeConnectInput", { target_slot, requested_slot });

        // During restore, bypass collapsed enforcement and accept the requested/target slot
        if (this.__restoring) {
            if (typeof requested_slot === "number" && Number.isFinite(requested_slot) && requested_slot >= 0) return requested_slot | 0;
            if (typeof target_slot === "number" && Number.isFinite(target_slot) && target_slot >= 0) return target_slot | 0;
            return 0;
        }

        // If collapsed, prefer routing to the single active slot (non-empty constant)
        if (this.flags && this.flags.collapsed) {
            const active = Array.isArray(this.widgets)
                ? this.widgets.map((w, i) => ({ i, v: safeStringTrim(w?.value) }))
                    .filter(o => !!o.v)
                    .map(o => o.i)
                : [];
            if (active.length === 1) {
                return active[0] | 0;
            }
            const reason = active.length === 0 ? "no active inputs (constants unset)" : "multiple active inputs";
            showAlert(`Cannot connect while collapsed: ${reason}. Expand node to choose a slot.`, { severity: 'warn' });
            // Disallow the connection
            return false;
        }

        // Prefer explicitly requested slot if valid
        if (typeof requested_slot === "number" && Number.isFinite(requested_slot) && requested_slot >= 0) {
            return requested_slot | 0;
        }
        // Fallback to current target slot if valid
        if (typeof target_slot === "number" && Number.isFinite(target_slot) && target_slot >= 0) {
            return target_slot | 0;
        }
        // Default to 0 to avoid cancelling the connection
        return 0;
    }

    onWidgetChanged(name, value, oldValue, widget) {
        // onWidgetChanged {name: 'Constant 2', value: 'con2', oldValue: 'IMAGE', widget: TextWidget}
        const widgetIndex = this.widgets.indexOf(widget);
        const type = this.inputs?.[widgetIndex]?.type;
        const validWidgetValue = suggestValidWidgetValue(this, widgetIndex, value);
        // Somewhere a validateWidgetValue will be called to actually fix the value
        log({ class: "SetTwinNodes", method: "onWidgetChanged", severity: "trace", tag: "function_entered" }, "onWidgetChanged", {validWidgetValue, name, value, oldValue, type, w: widget});
        this.graph?.sendEventToAllNodes("setnodeNameChange", {
            oldValue,
            value: validWidgetValue,
            type,
            widgetIndex,
            nodeId: this.id
        });
    }

    onRemoved() {
        log({ class: "SetTwinNodes", method: "onRemoved", severity: "trace", tag: "function_entered" }, "onRemoved");
        for (let i = 0; i < this.widgets?.length || 0; i++) {
            this.graph.sendEventToAllNodes("setnodeNameChange", {
                oldValue: this.widgets[0]?.value,
                value: null,
                type: null,
                widgetIndex: i,
            });
        }
    }

    setType(type, widgetIndex) {
        const widget = this.widgets?.[widgetIndex];
        const widgetName = widget?.name;
        const widgetValue = widget?.value;
        log({
            class: "SetTwinNodes",
            method: "setType",
            severity: "trace",
            tag: "function_entered"
        }, {
            type: type,
            ourName: this.widgets?.[widgetIndex]?.value,
            widgetIndex: widgetIndex,
        });

        ensureSlotCounts(this);
        if (this.inputs?.[widgetIndex]) {
            this.inputs[widgetIndex].type = type;
            this.onWidgetChanged(widgetName, widgetValue, widgetValue, widget);
        }
    }

    /**
     * @this {SetTwinNodes}
     * @param {number} type LiteGraph.INPUT (1) for input, LiteGraph.OUTPUT (2) for output.
     * @param {number} index The slot widgetIndex being affected.
     * @param {boolean} isConnected True when connecting; false when disconnecting.
     * @param {LLink|null|undefined} link_info The link descriptor involved in the change.
     * @param {INodeInputSlot|INodeOutputSlot|SubgraphIO} inputOrOutput The slot object for the affected side.
     */
    onConnectionsChange(
        type,	//1 = input, 2 = output
        index,
        isConnected,
        link_info,
        inputOrOutput
    ) {
        log({
            class: "SetTwinNodes",
            method: "onConnectionsChange",
            severity: "trace",
            tag: "function_entered"
        }, "onConnectionsChange", {w: safeStringTrim(this.widgets?.[index]?.value) ?? null, isConnected, link_info});

        // Output connected/disconnected
        if (type === LiteGraph.OUTPUT) {
            return;
        }

        // Input disconnected
        if (type === LiteGraph.INPUT && !isConnected) {
            this.setInputAndOutput(index, {
                type: "*",
            });
        }

        const stackTrace = new Error().stack || "";
        const triggers = {
            'LGraphNode.prototype.connect': stackTrace.includes('LGraphNode.prototype.connect'),
            'convertToSubgraph': stackTrace.includes('convertToSubgraph'),
            'pasteFromClipboard': stackTrace.includes('pasteFromClipboard'),
            'LGraphNode.connect': stackTrace.includes('LGraphNode.connect'),
            'loadGraphData': stackTrace.includes('loadGraphData')
        };
        const isKnownTrigger = Object.values(triggers).some(v => v);
        if (isConnected) {
            if (isKnownTrigger) {
                const trigger = Object.entries(triggers).find(([_, v]) => v)?.[0];
                log({
                    class: "SetTwinNodes",
                    method: "onConnectionsChange",
                    severity: "debug",
                    tag: "stacktrace"
                }, `Known trigger identified: ${trigger}`);
            }
            else {
                log({
                    class: "SetTwinNodes",
                    method: "onConnectionsChange",
                    severity: "trace",
                    tag: "stacktrace"
                }, "Unknown trigger: ", stackTrace);
            }

        }

        // Input connected
        if (type === LiteGraph.INPUT && isConnected && link_info && this.graph) {
            // If collapsed and ambiguous or wrong slot, remove link and expand
            if (this.flags && this.flags.collapsed && !isKnownTrigger) {
                const active = Array.isArray(this.widgets)
                    ? this.widgets.map((w, i) => ({ i, v: safeStringTrim(w?.value) }))
                        .filter(o => !!o.v)
                        .map(o => o.i)
                    : [];
                const ok = active.length === 1 && active[0] === index;
                if (!ok) {
                        showAlert("Collapsed SetTwinNodes connection blocked (no single active input). Caller not recognized; stack captured to console.", { severity: 'warn' });
                        // try { console.warn('[SetTwinNodes] blocked collapsed connect; stack:', stackTrace); } catch (_) {}

                    // For now, do NOT remove the link; just warn and expand to aid user selection
                    // this.flags.collapsed = false;
                    this.canvas?.setDirty(true, true);
                    return;
                }
            }
            const fromNode = GraphHelpers.getNodeById(this.graph, link_info.origin_id);
            if (fromNode?.outputs?.[link_info.origin_slot]) {
                const srcSlot = fromNode.outputs[link_info.origin_slot];
                const srcSlotType = srcSlot.type;
                const srcSlotName = srcSlot.label || srcSlot.name

                let widgetName = safeStringTrim(this.widgets?.[index]?.value) || null;

                log({
                    class: "SetTwinNodes",
                    method: "onConnectionsChange",
                    severity: "debug",
                    tag: "input_connected"
                }, "input connected", {
                    srcSlotName,
                    srcSlotType,
                    widgetName,
                    index
                });

                // If widget exists, name the input slot after the widget value, otherwise name widget after the input
                if (!widgetName) {
                    widgetName = srcSlotName;
                    setWidgetValueWithValidation(this, index, widgetName);
                }

                // Ensure type is updated
                this.resetInput(index, {
                    type: srcSlotType,
                    name: this.inputs[index].name === "*" ? widgetName : this.inputs[index].name,
                });

                this.resetOutput(index, {
                    type: srcSlotType,
                    name: this.outputs[index].name === "*" ? widgetName : this.outputs[index].name,
                });

            }
        }

        // this.updateTitle();
        this.updateColors();

    }

    /**
     * Creates a copy of this node.
     * Conforms to LGraphNode.clone by returning a cloned node instance; resets slots and recomputes size.
     * @this {SetTwinNodes}
     * @returns {SetTwinNodes} The cloned node.
     */
    clone() {
        const cloned = TwinNodes.prototype.clone.apply(this);
        cloned.size = cloned.computeSize();
        return cloned;
        // Reset all inputs
        if (cloned.inputs) {
            for (let i = 0; i < cloned.inputs.length; i++) {
                cloned.resetInput(i);
            }
        }
        cloned.value = '';
        cloned.properties.previousNames = [];
        cloned.size = cloned.computeSize();
        return cloned;
    }

    /**
     * Called when the node is added to a graph.
     * Mirrors LGraphNode.onAdded.
     * @param {LGraph} graph The graph this node was added to.
     * @returns {void}
     */
    onAdded(graph) {
        if (Array.isArray(this.widgets)) {
            for (let i = 0; i < this.widgets.length; i++) {
                // Ensure any combo widgets have a safe values provider after deserialization
                ensureComboValues(this, i);
                validateWidgetValue(this, i);
            }
        }
    }

    /**
     * Called after the node has been configured or deserialized.
     * Used to temporarily suppress connection enforcement while the graph restores links.
     */
    onConfigure(_data) {
        log({ class: "SetTwinNodes", method: "onConfigure", severity: "trace", tag: "function_entered" }, _data);
        // Ensure combo widgets have valid values providers after deserialization
        if (Array.isArray(this.widgets)) {
            for (let i = 0; i < this.widgets.length; i++) ensureComboValues(this, i);
        }
        this.__restoring = true;
        setTimeout(() => { this.__restoring = false; }, 1000);
    }

    checkConnections() {
        this.currentGetters = this.widgets.map((v, k) => k).map(k => findGetters(this, null, k));
        this.canvas.setDirty(true, true);
        log({ class: "SetTwinNodes", method: "checkConnections", severity: "debug", tag: "status" }, "checkConnections", this.currentGetters);
    }

    propagateNameChanges2(currNames) {
        // const prevNames = Array.isArray(this.properties.previousNames) ? this.properties.previousNames : [];
        //
        // for (let i = 0; i < Math.max(prevNames.length, currNames.length); i++) {
        //     const prev = prevNames[i] || "";
        //     const curr = currNames[i] || "";
        //     if (prev && curr && prev !== curr) {
        //         const allGettersForRename = GraphHelpers.getNodesByType(this.graph, "GetTwinNodes");
        //         allGettersForRename.forEach(/** TwinNodes */getter => {
        //             if (!Array.isArray(getter.widgets)) return;
        //             let changed = false;
        //             for (let gi = 0; gi < getter.widgets.length; gi++) {
        //                 const gv = getter.widgets[gi]?.value;
        //                 if (gv && safeStringTrim(gv) === prev) {
        //                     log({
        //                         class: "SetTwinNodes",
        //                         method: "update",
        //                         severity: "debug",
        //                         tag: "rename_propagate"
        //                     }, `update, updating getter widger ${gv} -> ${curr}`);
        //                     setWidgetValue(getter, gi, curr);
        //                     changed = true;
        //                 }
        //             }
        //             if (changed && typeof getter.onRename === "function") {
        //                 getter.onRename();
        //             }
        //         });
        //     }
        // }
    }

    /**
     * Called when the node is removed from the graph.
     * Mirrors LGraphNode.onRemoved.
     * @returns {void}
     */
    onRemoved() {
        log({ class: "SetTwinNodes", method: "onRemoved", severity: "trace", tag: "function_entered" }, "onRemoved (kinda think something should happen here)");
    }
    /**
     * Allows extending the context menu for this node.
     * Mirrors LGraphNode.getExtraMenuOptions contract by receiving the canvas and a mutable options array.
     * @param {LGraphCanvas} _ The graph canvas (unused here).
     * @param {ContextMenuItem[]} options Array of context menu option entries to extend in place.
     * @returns {void}
     */
    getExtraMenuOptions(_, options) {
        // TODO: -
        //     - Uses node.currentGetters[0].outputs[0].type to derive a color for the “Show connections” highlight.
        //     - Rationale: sampling the first getter’s first output only. Probably fine for a quick color, but could be generalized to first connected/typed output
        const node = this;
        let menuEntry = node.drawConnection ? "Hide connections" : "Show connections";
        options.unshift(
            {
                content: menuEntry,
                callback: () => {
                    node.checkConnections();
                    log({ class: "SetTwinNodes", method: "getExtraMenuOptions", severity: "info", tag: "context_menu" }, "context menu, found getters", node.currentGetters);
                    let i;
                    node.currentGetters.forEach((getters, i) => {
                        let linkType = '*';
                        for (const g of getters) {
                            const found = (g.outputs || []).find(o => o && o.type && o.type !== '*');
                            if (found) { linkType = found.type; break; }
                        }
                        node.slotColors[i] = node.canvas.default_connection_color_byType[linkType]
                        menuEntry = node.drawConnection ? "Hide connections" : "Show connections";
                    });
                    // Generalize: pick first connected, typed output across all getters
                    node.drawConnection = !node.drawConnection;
                    node.canvas.setDirty(true, true);
                },
            },
            {
                content: "Update title",
                callback: () => {
                    node.updateTitle(true);
                },
            },
            {
                content: "Update colors",
                callback: () => {
                    node.updateColors();
                },
            },
            {
                content: "Check connections",
                callback: () => {
                    node.checkConnections();
                },
            },
            {
                content: "Hide all connections",
                callback: () => {
                    const allGetters = GraphHelpers.getNodesByType(node.graph, ["GetTwinNodes", "SetTwinNodes"]);
                    allGetters.forEach(otherNode => {
                        otherNode.drawConnection = false;
                        log({ class: "SetTwinNodes", method: "getExtraMenuOptions", severity: "debug", tag: "context_menu" }, otherNode);
                    });

                    menuEntry = "Show connections";
                    node.drawConnection = false
                    node.canvas.setDirty(true, true);

                },

            },
        );
        // Dynamically add a submenu for all getters
        this.checkConnections();
        if (node.currentGetters) {

            let gettersSubmenu = node.currentGetters.flat(1).map(getter => ({
                content: `${getter.title} id: ${getter.id}`,
                callback: () => {
                    // Push current view before jumping so user can return with Shift+T
                    try { pushCurrentView(); showTwinTipIfNeeded(); } catch (_) {}
                    node.canvas.centerOnNode(getter);
                    node.canvas.selectNode(getter, false);
                    // node.canvas.setDirty(true, true);

                },
            }));

            options.unshift({
                content: "Getters",
                has_submenu: true,
                submenu: {
                    title: "GetTwinNodes",
                    options: gettersSubmenu,
                }
            });
        }
    }

    /**
     * Called to render custom content on top of the node after the node background/body has been drawn.
     * Mirrors LGraphNode.onDrawForeground.
     * @param {CanvasRenderingContext2D} ctx Canvas 2D rendering context.
     * @param {LGraphCanvas} lGraphCanvas The graph canvas.
     * @returns {void}
     */
    onDrawForeground(ctx, lGraphCanvas) {
        if (this.drawConnection) {
            this._drawVirtualLinks(lGraphCanvas, ctx);
        }

        const missingGetters = (this.currentGetters ?? [])
            .map((v, k) => ({v, k}))  // Fixed: proper object literal syntax
            .filter(o => o.v.length === 0)
            .filter(o => {
                const wv = this.widgets?.[o.k]?.value;
                return typeof wv === "string" && safeStringTrim(wv).length > 0;
            })
            .map(o => o.k);

        // If minimized (collapsed) and there are missing getters, show a single message and skip the loop
        const isCollapsed = !!(this.flags && this.flags.collapsed);
        if (isCollapsed && missingGetters.length > 0) {
            const titleH = (LiteGraph && LiteGraph.NODE_TITLE_HEIGHT) ? LiteGraph.NODE_TITLE_HEIGHT : 30;
            const textX = this.size[0] + 10; // to the right of the minimized node
            const textY = Math.round(titleH * -0.3); // vertically aligned within the title bar
            const text = "← Missing GetTwinNode(s)";
            drawTextWithBg(ctx, text, textX, textY);
        } else {
            for (const widgetIndex of missingGetters) {
                const targetWidget = this.widgets?.[widgetIndex];
                if (!targetWidget) continue;

                const bounds = getWidgetBounds(this, targetWidget);

                if (bounds) {
                    // Position text to the right of the widget
                    const textX = bounds.x + bounds.width + 10; // 10px gap
                    const textY = bounds.y + bounds.height / 2 + 4; // Vertically centered (+4 for text baseline)

                    drawTextWithBg(ctx, "← No GetTwinNode", textX, textY);
                }
            }
        }

        /*
        const padX = 8, padY = 6, lineH = 14;

        const lines = [];

        // special color for scheduler + cfg: amber-ish (visible in light/dark)
        const EMP = "#ffcc66";

        lines.push({ t: `There was an old dog`, c: EMP });
        lines.push({ t: `He sat by the kennel`, c: EMP });
        lines.push({ t: `And pooped a lot` });

        const overlayH = Math.min(340, lines.length * lineH) + padY;
        if (this.__ea_overlay_h !== overlayH) { this.__ea_overlay_h = overlayH; this.graph?.setDirtyCanvas(true, true); }
        const x = padX, y = this.size[1] - overlayH;

        ctx.save();
        ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 2;

        let yy = y + 10;
        for (const line of lines) {
            ctx.fillStyle = line.c || "#ffffff";
            ctx.fillText(line.t, x, yy);
            yy += lineH;
        }
        ctx.restore();
        */

    }
    // onDrawCollapsed(ctx, lGraphCanvas) {
    // 	if (this.drawConnection) {
    // 		this._drawVirtualLinks(lGraphCanvas, ctx);
    // 	}
    // }
    _drawVirtualLinks(lGraphCanvas, ctx) {
        if (!this.currentGetters?.length) return;

        // Determine a sensible start anchor on this node: first typed output, else slot 0
        // Remove unused variable declaration and fix shadowing
        this.currentGetters.forEach((getters, slotIndex) => {
            if (!Array.isArray(getters) || !getters.length) return;
            // Add error handling for getConnectionPos
            if (typeof this.getConnectionPos !== 'function') return;

            const absStart = this.getConnectionPos(false, slotIndex);
            if (!absStart || !this.pos) return;

            const start_node_slotpos = [
                absStart[0] - this.pos[0],
                absStart[1] - this.pos[1],
            ];

            // Provide a default link object with necessary properties
            const defaultLink = {type: 'default', color: slotIndex === 0 ? '#4bbf50' : '#7d7dff'};

            for (const getter of getters) {
                // Add validation for getter
                if (!getter || typeof getter.getConnectionPos !== 'function') continue;

                // Determine a sensible end anchor on the getter: first typed input, else input 0
                let getterWidgetIndex = 0;
                if (Array.isArray(getter.inputs)) {
                    const found = getter.widgets.findIndex(inputWidget => inputWidget && safeStringTrim(inputWidget?.value) === safeStringTrim(this.widgets[slotIndex]?.value));
                    if (~found) getterWidgetIndex = found;
                }

                const absEndLeft = getter.getConnectionPos(true, getterWidgetIndex);
                const absEndRight = getter.getConnectionPos(false, getterWidgetIndex);
                const absEnd = absEndRight;
                absEnd[0] = absEndLeft[0];
                if (!absEnd) continue;

                const end_node_slotpos = [
                    absEnd[0] - this.pos[0],
                    absEnd[1] - this.pos[1],
                ];

                lGraphCanvas.renderLink(
                    ctx,
                    start_node_slotpos,
                    end_node_slotpos,
                    defaultLink,
                    false,
                    null,
                    // this.slotColor,
                    null,
                    LiteGraph.RIGHT,
                    LiteGraph.LEFT
                );
            }
        });
    }
}

app.registerExtension({
    name: "SetTwinNodes",
    SetTwinNodes,
    registerCustomNodes() {

        LiteGraph.registerNodeType(
            "SetTwinNodes",
            Object.assign(SetTwinNodes, {
                title: "Set",
            })
        );

        SetTwinNodes.category = "ovum";
        window.SetTwinNodes = SetTwinNodes;
    },
});

