/// <reference lib="es2015.collection" />
/** @typedef {import("@comfyorg/litegraph/dist/LGraphNode").LGraphNode} LGraphNode */
/** @typedef {import("@comfyorg/litegraph/dist/LLink").LLink} LLink */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").INodeInputSlot} INodeInputSlot */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").INodeOutputSlot} INodeOutputSlot */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").ISlotType} ISlotType */
/** @typedef {import("@comfyorg/litegraph/dist/litegraph").LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/litegraph/dist/types/serialisation").SubgraphIO} SubgraphIO */
/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').LGraphCanvas} LGraphCanvas */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').LGraph} LGraph */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').LLink} LLink */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').NodeInputSlot} NodeInputSlot */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').NodeOutputSlot} NodeOutputSlot */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').Subgraph} Subgraph */
/** @typedef {import("../../typings/ComfyNode").ComfyNode} ComfyNode */
/** @typedef {import("../common/graphHelpersForTwinNodes.js").GraphHelpers} GraphHelpers */
/** @typedef {import("@comfyorg/litegraph/dist/types/widgets").IWidget} IWidget */
/** @typedef {import("@comfyorg/litegraph/dist/litegraph").ContextMenuItem} ContextMenuItem */
/** @typedef {import("@comfyorg/litegraph/dist/litegraph").SerializedLGraphNode} SerializedLGraphNode */

import {app} from "../../../scripts/app.js";
import {GraphHelpers} from "../common/graphHelpersForTwinNodes.js";
import {computeTwinNodeTitle, extractWidgetNames, safeStringTrim} from "../01/stringHelper.js";
import {
    ensureSlotCounts,
    ensureWidgetCount,
    findSetter,
    getPreviousWidgetName,
    makeUnlinkedName,
    normalizeWidgetLabels, setWidgetValue,
    showAlert,
    validateNodeLinks,
    wrapWidgetValueSetter
} from "../01/twinnodeHelpers.js";
import {TwinNodes} from "../common/twinNodes.js";
import {log} from "../common/logger.js";

// mostly written by GPT-5
// based on KJ's SetGet: https://github.com/kj-comfy/ComfyUI-extensions which was
// based on diffus3's SetGet: https://github.com/diffus3/ComfyUI-extensions

// Note: we don't actually have a settings , so lets use Kijai's
let disablePrefix = app.ui.settings.getSettingValue("ovum.disablePrefix")
const LGraphNode = LiteGraph.LGraphNode

app.registerExtension({
    name: "GetTwinNodes",
    registerCustomNodes() {
        class GetTwinNodes extends TwinNodes {
            currentSetter = null;
            numberOfInputSlots = 0;

            /**
             * Constructs a new GetTwinNodes instance.
             * Mirrors the LGraphNode constructor semantics by creating a node with an optional title and initializing defaults.
             * @param {string} title Optional title displayed in the editor UI.
             */
            constructor(title) {
                super(title)
                // properties is not actually readable at this point, so we could probably avoid this careful non-overwriting stuff
                if (!this.properties) {
                    this.properties = {};
                }
                this.properties = {
                    bgcolors: [],
                    previousNames: Array(this.numberOfWidgets || 2).fill(""),
                    numberOfWidgets: 2,
                    showOutputText: GetTwinNodes.defaultVisibility,
                    failSilently: false,
                    ...this.properties
                };

                const node = this;

                TwinNodes.prototype.onPropertyChanged = function(name, value, previousValue) {
                    if (name === "numberOfWidgets") {
                        this.numberOfWidgets = value;
                        this.numberOfOutputSlots = value;
                        if (!Array.isArray(this.properties.previousNames) || this.properties.previousNames.length < this.numberOfWidgets) {
                            this.properties.previousNames = Array(this.numberOfWidgets).fill("");
                        }
                        node.ensureGetterWidgetCount(value);
                        ensureSlotCounts(this);
                        // ensureSlotCounts(node);
                        // node.updateTitle();
                    }
                }

                this.ensureGetterWidgetCount(this.numberOfWidgets);

                // Ensure the number of outputs matches count
                ensureSlotCounts(this);

                // Determine colors using all connected input types in order

                // bit of a nasty hack
                setTimeout(() => {
                    node.widgets.forEach((widgetValue, widgetIndex) => {
                        app.api.dispatchCustomEvent('getnode_rename', {
                            nodeId: node.id,
                            widgetIndex: widgetIndex,
                            value: widgetValue,
                        });
                    })
                }, 500);
                this.updateTitle();


                // This node is purely frontend and does not impact the resulting prompt so should not be serialized
                this.isVirtualNode = true;
            }

            /** @override */
            /** @param {MissingNodeType[]} missingNodeTypes */
            async afterConfigureGraph(missingNodeTypes) {
            }

            // Return combined constant names from SetTwinNodes and Kijai's SetNode (prefixed)
            getCombinedConstantNames() {
                const names = [];

                // Gather from SetTwinNodes (all widget values)
                const setTwinNodes = GraphHelpers.getNodesByType(this.graph, 'SetTwinNodes');
                for (const s of setTwinNodes) {
                    const ws = s.widgets || [];
                    for (const w of ws) {
                        if (w?.value) names.push(String(w.value));
                    }
                }

                const uniq = Array.from(new Set(names)).sort();
                // Add reset option to allow unsetting the selection
                uniq.unshift("(unset)");
                return uniq;
            }

            addAnotherWidget() {
                this.numberOfWidgets += 1;
                this.numberOfOutputSlots += 1;
                this.properties.numberOfWidgets = this.numberOfWidgets;
                ensureSlotCounts(this);
                this.ensureGetterWidgetCount(this.numberOfWidgets);
                this.properties.previousNames.push("");
                this.updateTitle();
                this.serialize();
            }

            // Ensure there are at least N combo widgets for constants, each with a values provider
            ensureGetterWidgetCount(count) {
                const node = this;
                ensureWidgetCount(this, count, "combo", "Constant", (idx, value, canvas, node, pos, e) => {
                    node.properties.previousNames[idx] = value;
                    this.onRename(idx);
                    // this.complicatedRenamingStuff();
                }, {
                    values: () => {
                        return this.getCombinedConstantNames();
                    }
                });
                // Normalize widget labels to Constant 1, Constant 2, ...
                this.normalizeGetterWidgetLabels();
            }

            // Normalize widget labels to "Constant N"
            normalizeGetterWidgetLabels() {
                normalizeWidgetLabels(this, "Constant");
            }

            /**
             * Called after the node has been configured or deserialized.
             * Aligns with LGraphNode.onConfigure; used here to temporarily suppress auto-derivation after restore.
             * @param {SerializedLGraphNode} _data The deserialized configuration data for this node.
             * @returns {void}
             */
            onConfigure(_data) {
                log({ class: "GetTwinNodes", method: "onConfigure", severity: "trace", tag: "function_entered" }, "[GetTwinNodes] onConfigure");
                this.__restoring = true;
                // Clear restoration flag shortly after configuration to allow normal behavior thereafter
                setTimeout(() => { this.__restoring = false; }, 1000);
            }

            onRemoved() {
                log({
                    class: "GetTwinNodes",
                    method: "onRemoved",
                    severity: "trace",
                    tag: "function_entered"
                }, "onRemoved");
                for (let i = 0; i < this.widgets?.length || 0; i++) {
                    setTimeout(() => {
                        app.api.dispatchCustomEvent('getnode_rename', {
                            nodeId: this.id,
                            widgetIndex: i,
                            value: null,
                        });
                    }, 500);
                }
            }


            /**
             * Called when a connection is created or removed for this node.
             * Mirrors LGraphNode.onConnectionsChange semantics.
             * @param {number} slotType LiteGraph.INPUT (1) for input, LiteGraph.OUTPUT (2) for output.
             * @param {number} slot The slot widgetIndex being affected.
             * @param {boolean} isChangeConnect True when connecting; false when disconnecting.
             * @param {LLink|null|undefined} link_info The link descriptor involved in the change.
             * @param {INodeInputSlot|INodeOutputSlot|SubgraphIO} output The slot object for the affected side.
             * @returns {void}
             */
            onConnectionsChange(
                slotType,
                slot,
                isChangeConnect,
                link_info,
                output
            ) {
                // Respect serialized data on restore: skip auto-derive during deserialization
                log({ class: "GetTwinNodes", method: "onConnectionsChange", severity: "trace", tag: "function_entered" }, "[GetTwinNodes] onConnectionsChange");
                // if (this.__restoring) { log({ class: "GetTwinNodes", method: "onConnectionsChange", severity: "debug", tag: "restore_skip" }, "[GetTwinNodes] aborted due to __restoring state"); return; }


                // If an output is connected and the constant for that slot is unset,
                // auto-select if there's only one known option for that widgetIndex.
                if (slotType === LiteGraph.OUTPUT && isChangeConnect) {
                    // When connecting the FIRST output and widget[0] is unset, and there are no other links,
                    // derive widget[0] from the target input's label/name/type.
                    // TODO: Check - auto-derive is intentionally limited to first output slot (slot 0)
                    if (slot === 0 && (!this.widgets?.[0]?.value || this.widgets[0].value === '*')) {
                        // Count total links across all outputs (after this connect)
                        let totalLinks = 0;
                        if (Array.isArray(this.outputs)) {
                            for (const out of this.outputs) {
                                totalLinks += (out?.links?.length || 0);
                            }
                        }
                        if (totalLinks === 1 && link_info) {
                            // Try to read the target node and its input slot
                            const targetNode = GraphHelpers.getNodeById(this.graph, link_info.target_id);
                            const inSlot = targetNode?.inputs?.[link_info.target_slot];
                            const preferred =
                                safeStringTrim(inSlot?.label) ||
                                safeStringTrim(inSlot?.name) ||
                                safeStringTrim(inSlot?.type) ||
                                "";
                            if (preferred) {
                                // If the derived name is not present in any known constants, append '*'
                                let knownNames = this.getCombinedConstantNames()
                                    .filter(n => n && n !== "(unset)");
                                const known = new Set(knownNames);
                                const needsUnlinked = !known.has(preferred);
                                setWidgetValue(this, 0, needsUnlinked ? makeUnlinkedName(preferred) : preferred);
                            }
                        }
                    }

                    const idx = slot;
                    const val = this.widgets?.[idx]?.value;
                    const allSetters = GraphHelpers.getNodesByType(this.graph, 'SetTwinNodes');
                    const options = Array.from(new Set(
                        allSetters.map(s => s.widgets?.[idx]?.value).filter(Boolean)
                    ));
                    if ((!val || val === '*') && options.length === 1) {
                        if (this.widgets?.[idx]) setWidgetValue(this, idx, options[0]);
                    }

                    // Attempt to auto-pair remaining constants from a matched setter
                    const matched = findSetter(this);
                    if (matched) {
                        const needed = matched.widgets?.length || 0;
                        const min = this.properties?.constCount || 2;
                        this.ensureGetterWidgetCount(Math.max(min, needed));
                        for (let i = 0; i < needed; i++) {
                            if (!this.widgets?.[i]?.value && matched.widgets?.[i]?.value) {
                                setWidgetValue(this, i, matched.widgets[i].value);
                            }
                        }
                    }
                    // this.complicatedRenamingStuff();
                }

                // Validate
                if (slotType === LiteGraph.OUTPUT && !isChangeConnect) {
                    // this.complicatedRenamingStuff();
                }

                this.validateLinks();
            }

            // Backward-compatible single-name setter
            setName(name, _widgetIndex) {
                log({ class: "GetTwinNodes", method: "setName", severity: "trace", tag: "function_entered" }, "[GetTwinNodes] setName should not have been called");
                if (this.widgets?.[_widgetIndex]) {
                    setWidgetValue(this, _widgetIndex, name);
                }
                // this.complicatedRenamingStuff();
                this.serialize();
            }

            onRename(widgetIndex) {
                log({ class: "GetTwinNodes", method: "onRename", severity: "trace", tag: "function_entered" });
                let widgetValue = safeStringTrim(this.widgets[widgetIndex]?.value);

                app.api.dispatchCustomEvent('getnode_rename', {
                    nodeId: this.id,
                    widgetIndex: widgetIndex,
                    value: widgetValue,
                });

                if (!widgetValue) {
                    return;
                }
                if (widgetValue === '(unset)') {
                    if (this.outputs?.[widgetIndex]?.links?.length) {
                        const links = [...this.outputs[widgetIndex].links];
                        for (const linkId of links) {
                            const link = GraphHelpers.getLink(this.graph, linkId);
                            if (link) GraphHelpers.removeLink(this.graph, linkId);
                        }
                    }
                    ensureSlotCounts(this);
                    this.setType('*', widgetIndex);
                    setWidgetValue(this, widgetIndex, '');
                    this.updateColors();
                    this.updateTitle();
                    this.serialize();

                    return;
                }


                const setter = findSetter(this, widgetValue);
                if (setter) {
                    let linkType = (setter.node.inputs[setter.widgetIndex].type);
                    this.setType(linkType, widgetIndex);
                    this.updateColors();
                    this.updateTitle();
                    this.serialize();
                } else {
                    this.setType('*', widgetIndex);
                }
            }

            /* During a reload:
                [GetTwinNodes] onConnectionsChange
                [GetTwinNodes] complicatedRenamingStuff
                [GetTwinNodes] ensureOutputCount
                [GetTwinNodes] onConfigure
             */
            complicatedRenamingStuff() {
                // Respect serialized data on restore: skip auto-derive during deserialization
                log({ class: "GetTwinNodes", method: "complicatedRenamingStuff", severity: "trace", tag: "function_entered" }, "[GetTwinNodes] onRename");
                // if (this.__restoring) { log({ class: "GetTwinNodes", method: "complicatedRenamingStuff", severity: "debug", tag: "restore_skip" }, "[GetTwinNodes] aborted due to __restoring state"); return; }

                // Support "(unset)" option: clear widget value and possibly remove the first extra unset widget and its output
                const RESET_LABEL = "(unset)";
                let didUnset = false;
                if (Array.isArray(this.widgets)) {
                    for (let i = 0; i < this.widgets.length; i++) {
                        if (this.widgets[i] && this.widgets[i].value === RESET_LABEL) {
                            // Disconnect links for this widget's corresponding output immediately
                            if (this.outputs?.[i]?.links?.length) {
                                const links = [...this.outputs[i].links];
                                for (const linkId of links) {
                                    const link = GraphHelpers.getLink(this.graph, linkId);
                                    if (link) GraphHelpers.removeLink(this.graph, linkId);
                                }
                            }
                            // Clear to empty string immediately and refresh UI
                            setWidgetValue(this, i, '');
                            didUnset = true;
                        }
                    }
                    if (didUnset && app?.canvas?.setDirty) {
                        app.canvas.setDirty(true, true);
                    }
                }
                if (didUnset) {
                    // Find all unset widgets (empty string or falsy)
                    const unsetIndices = [];
                    for (let i = 0; i < (this.widgets?.length || 0); i++) {
                        const v = this.widgets?.[i]?.value;
                        if (!v) unsetIndices.push(i);
                    }

                    // Disconnect links for every unset widget's corresponding output
                    for (const idx of unsetIndices) {
                        if (this.outputs?.[idx]?.links?.length) {
                            const links = [...this.outputs[idx].links];
                            for (const linkId of links) {
                                const link = GraphHelpers.getLink(this.graph, linkId);
                                if (link) GraphHelpers.removeLink(this.graph, linkId);
                            }
                        }
                    }

                    if (unsetIndices.length > 1) {
                        // Remove the first unset widget and its corresponding output slot
                        const removeIdx = unsetIndices[0];
                        this.removeOutput(removeIdx);
                        if (Array.isArray(this.widgets)) {
                            this.widgets.splice(removeIdx, 1);
                        }
                        // Recompute node size after removal
                        this.size = this.computeSize();
                    }

                    // Always normalize labels after unset/removal
                    this.normalizeGetterWidgetLabels();
                    // Keep outputs count aligned to widgets after any removals
                    ensureSlotCounts(this);
                }

                const setter = findSetter(this);
                // Gather current selections
                const selected = (this.widgets || []).map(w => safeStringTrim(w?.value));
                const anySelected = selected.some(v => !!v);

                if (setter) {
                    const setterNames = (setter.node.widgets || []).map(w => safeStringTrim(w?.value));
                    // Map selected constant -> type (from matched setter input at that label)
                    const typeByConst = {};
                    setterNames.forEach((name, idx) => {
                        const t = setter.node.inputs?.[idx]?.type || '*';
                        if (name) typeByConst[name] = t;
                    });

                    // Ensure enough widgets and outputs
                    const wNeeded = setter.node.widgets?.length || 0;
                    this.ensureGetterWidgetCount(wNeeded || 2);
                    ensureSlotCounts(this);

                    // Autofill any empty selections from the matched setter (position-agnostic)
                    // Only perform this when we didn't just unset a widget via "(unset)".
                    if (!didUnset) {
                        const setterVals = (setter.node.widgets || []).map(w => safeStringTrim(w?.value)).filter(Boolean);
                        const selectedVals = new Set(
                            (this.widgets || []).map(w => safeStringTrim(w?.value)).filter(Boolean)
                        );
                        for (let i = 0; i < wNeeded; i++) {
                            if (this.widgets?.[i] && (!this.widgets[i].value || this.widgets[i].value === '*')) {
                                const next = setterVals.find(v => !selectedVals.has(v));
                                if (next) {
                                    setWidgetValue(this, i, next);
                                    selectedVals.add(next);
                                }
                            }
                        }
                        // If only one constant is selected, ensure at least constCount widgets exist
                        const selectedCount = Array.from(selectedVals).length;
                        const min = this.properties?.constCount || 2;
                        if (selectedCount === 1 && (this.widgets?.length || 0) < min) {
                            this.ensureGetterWidgetCount(min);
                        }
                    } else {
                        // If didUnset but we still have only one selected and have fewer than min widgets, ensure additional empty widgets
                        const valList = (this.widgets || []).map(w => safeStringTrim(w?.value)).filter(Boolean);
                        const min = this.properties?.constCount || 2;
                        if (valList.length === 1 && (this.widgets?.length || 0) < min) {
                            this.ensureGetterWidgetCount(min);
                        }
                    }

                    // Normalize labels after any additions
                    this.normalizeGetterWidgetLabels();

                    // Set each output's name to the selected constant text and type from matched setter
                    const outCount = this.widgets?.length || 0;
                    let pickedType = null;
                    for (let i = 0; i < outCount; i++) {
                        const label = safeStringTrim(this.widgets?.[i]?.value);
                        const t = label ? (typeByConst[label] || '*') : '*';

                        // Ensure output slot exists
                        if (i >= (this.outputs?.length || 0)) ensureSlotCounts(this);

                        if (this.outputs?.[i]) {
                            this.setOutput(i, {
                                name: label || '*',
                                label: label || '*',
                                type: t
                            });
                        }
                        if (!pickedType && label && t && t !== '*') {
                            pickedType = t;
                        }
                    }
                    this.updateColors();
                } else {
                    // No matching setter: if exactly one constant is selected, ensure we have a second empty widget
                    const selectedVals = (this.widgets || [])
                        .map(w => safeStringTrim(w?.value))
                        .filter(Boolean);
                    const min = this.properties?.constCount || 2;
                    if (selectedVals.length === 1 && (this.widgets?.length || 0) < min) {
                        this.ensureGetterWidgetCount(min); // adds empty widgets up to min
                    }

                    ensureSlotCounts(this);
                }

                // Finally, validate existing links against updated types
                this.validateLinks();
            }

            /**
             * Creates a copy of this node.
             * Conforms to LGraphNode.clone by returning a cloned node instance with size recomputed.
             * @this {GetTwinNodes}
             * @returns {GetTwinNodes} The cloned node.
             */
            clone() {
                const cloned = TwinNodes.prototype.clone.apply(this);
                cloned.size = cloned.computeSize();
                return cloned;
            }

            validateLinks() {
                validateNodeLinks(this);
            }

            // Return the previous name recorded for the widget at widgetIndex 'idx'
            getPreviousName(idx) {
                return getPreviousWidgetName(this, idx);
            }

            /**
             * Handles broadcast rename events and updates matching widget values.
             * If value === oldValue then this is a type notification.
             * @param {object} e - The rename event object.
             * @param {number} e.nodeId - ID of the node where the rename occurred.
             * @param {string} e.oldValue - Previous value before the rename.
             * @param {string} e.value - New value after the rename.
             * @param {string} e.type - Type of the renamed widget.
             * @param {number} e.widgetIndex - Index (on the SetNode) of the widget that was renamed.
             * @returns {void}
             */
            setnodeNameChange(e) {
                // e: {oldValue: 'width', value: 'width', type: 'INT', widgetIndex: 0, nodeId: 4}
                log({ class: "GetTwinNodes", method: "setnodeNameChange", severity: "trace", tag: "function_entered" }, e);
                const prev = safeStringTrim(e.oldValue);
                const next = safeStringTrim(e.value);

                const changed = [];
                if (Array.isArray(this.widgets)) {
                    for (let i = 0; i < this.widgets.length; i++) {
                        const val = safeStringTrim(this.widgets[i]?.value);
                        if (val && val === prev) {
                            if (prev && next && prev !== next) {
                                setWidgetValue(this, i, next);
                            }
                            changed.push(i);
                        }
                    }
                }
                changed.forEach(i => {
                    this.setType(e.type, i);
                    this.onRename(i);
                });
            }


            setType(type, widgetIndex) {
                // Robustly find the first callsite with a function name (Class.function or function) from the stack
                let callee = "unknown";
                try {
                    const stackLines = new Error().stack.split('\n');
                    // Try to find first line with function context
                    for (let i = 1; i < stackLines.length; i++) {
                        const m = stackLines[i].match(/at\s+([A-Za-z0-9_$.[\]<>]+)\s*\(/);
                        if (m && m[1] && !/^Object\./.test(m[1]) && !/^<anonymous>/.test(m[1])) {
                            callee = m[1];
                            break;
                        }
                    }
                    if (callee === "unknown") {
                        // Show a few lines for debugging, as before
                        const contextLines = stackLines.slice(1, 6).join('\n');
                        console.warn(
                            "GetTwinNodes.setType: failed to find a function callsite in stack for callee.\n" +
                            "Stack context:\n" + contextLines
                        );
                    }
                } catch (_e) {
                    // In case anything unexpected happens, don't crash
                }

                log({
                    class: "GetTwinNodes",
                    method: "setType",
                    severity: "trace",
                    tag: "function_entered"
                }, {
                    type: type,
                    ourName: this.widgets?.[widgetIndex]?.value,
                    widgetIndex: widgetIndex,
                    callee: callee
                });


                ensureSlotCounts(this);
                if (this.outputs?.[widgetIndex]) {
                    this.setOutput(widgetIndex, {
                        name: type,
                        type: type
                    });
                }
                this.validateLinks();
            }

            goToSetter() {
                const setter = findSetter(this);
                if (setter) {
                    this.canvas.centerOnNode(setter.node);
                    this.canvas.selectNode(setter.node, false);
                }
            }

            updateTitle() {
                log({ class: "GetTwinNodes", method: "updateTitle", severity: "trace", tag: "function_entered" }, "[GetTwinNodes] updateTitle");
                const namesForTitle = extractWidgetNames(this);
                this.title = computeTwinNodeTitle(namesForTitle, "get", disablePrefix);
                this.canvas.setDirty(true, true);
            }


            /**
             * Returns the link connected to the matched setter's input corresponding to the given output slot.
             * This is a convenience helper specific to GetTwinNodes, but seems to be the magic (if undocumented)
             * glue that makes the SetNode and GetNode nodes work.
             * @param {number} slot Output slot widgetIndex on this getter.
             * @returns {LLink|undefined} The found link, or undefined if no matching setter/link exists.
             */
            getInputLink(slot) {
                const widgetValue = safeStringTrim(this.widgets?.[slot]?.value) || '';
                if (!widgetValue) return;

                const found = findSetter(this, widgetValue);
                if (!found) return;

                const setter = found.node;

                if (setter) {
                    const input = setter.inputs[found.widgetIndex];
                    return GraphHelpers.getLink(this.graph, input.link);
                } else {
                    if (this.properties.failSilently) {
                        return;
                    }
                    // No SetTwinNodes found for BOOLEAN(GetTwinNodes). Most likely you're missing custom nodes
                    const errorMessage = "No SetTwinNode found for the input (" + this.widgets[slot].value + ") of the GetTwinNodes titled " + this.title;
                    showAlert(errorMessage, {
                        summary: "GetTwinNodes Error",
                        severity: "error",
                        detail: errorMessage,
                    });

                    this.canvas.centerOnNode(this);
                    this.canvas.selectNode(this, false);
                    //throw new Error(errorMessage);
                }
            }
            /**
             * Called when the node is added to a graph.
             * Mirrors LGraphNode.onAdded.
             * @param {LGraph} graph The graph this node was added to.
             * @returns {void}
             */
            onAdded(graph) {
                // Kijai would call this.validateName(graph) on the setter, nothing on the getter
                if (Array.isArray(this.widgets)) {
                    for (let i = 0; i < this.widgets.length; i++) {
                        try { wrapWidgetValueSetter(this.widgets[i]); } catch (_e) {}
                    }
                }
            }

            /**
             * Allows extending the context menu for this node.
             * Mirrors LGraphNode.getExtraMenuOptions contract by receiving the canvas and a mutable options array.
             * @param {LGraphCanvas} _ The graph canvas (unused here).
             * @param {ContextMenuItem[]} options Array of context menu option entries to extend in place.
             * @returns {void}
             */
            getExtraMenuOptions(_, options) {
                const node = this;
                let menuEntry = node.drawConnection ? "Hide connections" : "Show connections";

                options.unshift(
                    {
                        content: "Add another entry",
                        callback: () => {
                            node.addAnotherWidget();
                        },
                    },
                    {
                        content: "Go to setter",
                        callback: () => {
                            node.goToSetter();
                        },
                    },
                    {
                        content: "Update title",
                        callback: () => {
                            node.updateTitle();
                        },
                    },
                    {
                        content: "Update colors",
                        callback: () => {
                            node.updateColors();
                        },
                    },
                    {
                        content: menuEntry,
                        callback: () => {
                            node.currentSetter = findSetter(node);
                            log({ class: "GetTwinNodes", method: "getExtraMenuOptions", severity: "info", tag: "context_menu" }, "[GetTwinNodes] context menu, found setters", node.currentSetter);
                            if (!node.currentSetter) return;
                            // Generalize: pick first typed input on setter
                            let linkType = '*';
                            if (Array.isArray(node.currentSetter.inputs)) {
                                const fin = node.currentSetter.inputs.find(i => i && i.type && i.type !== '*');
                                if (fin) linkType = fin.type;
                            }
                            node.drawConnection = !node.drawConnection;
                            node.slotColor = node.canvas.default_connection_color_byType[linkType]
                            menuEntry = node.drawConnection ? "Hide connections" : "Show connections";
                            node.canvas.setDirty(true, true);
                        },
                    },
                );
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
                    this._drawVirtualLink(lGraphCanvas, ctx);
                }
            }
            // onDrawCollapsed(ctx, lGraphCanvas) {
            // 	if (this.drawConnection) {
            // 		this._drawVirtualLink(lGraphCanvas, ctx);
            // 	}
            // }
            _drawVirtualLink(lGraphCanvas, ctx) {
                if (!this.currentSetter) return;

                // Provide a default link object with necessary properties, to avoid errors as link can't be null anymore
                const defaultLink = { type: 'default', color: this.slotColor };

                // Choose first typed input on setter as anchor (fallback to slot 0)
                let inIdx = 0;
                if (Array.isArray(this.currentSetter.node.inputs)) {
                    const fin = this.currentSetter.node.inputs.findIndex(i => i && i.type && i.type !== '*');
                    if (fin >= 0) inIdx = fin;
                }
                const absStart = this.currentSetter.node.getConnectionPos(false, inIdx);
                const start_node_slotpos = [
                    absStart[0] - this.pos[0],
                    absStart[1] - this.pos[1],
                ];

                // End near our header (consistent with prior behavior)
                const end_node_slotpos = [0, -LiteGraph.NODE_TITLE_HEIGHT * 0.5];

                lGraphCanvas.renderLink(
                    ctx,
                    start_node_slotpos,
                    end_node_slotpos,
                    defaultLink,
                    false,
                    null,
                    this.slotColor
                );
            }
        }

        LiteGraph.registerNodeType(
            "GetTwinNodes",
            Object.assign(GetTwinNodes, {
                title: "Get",
            })
        );

        GetTwinNodes.category = "ovum";
    },
});
