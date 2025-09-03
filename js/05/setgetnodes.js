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

import { app } from "../../../scripts/app.js";
import { GraphHelpers } from "../common/graphHelpersForTwinNodes.js";
import { analyzeNamesForAbbrev, computeTwinNodeTitle, extractWidgetNames, safeStringTrim } from "../01/stringHelper.js";
import { 
    isUnlinkedName,
    stripUnlinkedPrefix, 
    makeUnlinkedName, 
    wrapWidgetValueSetter, 
    showAlert, 
    findGetters,
    propagateToGetters,
    ensureSlotCounts,
    validateWidgetName,
    getPreferredSlotLabel,
    getPreviousWidgetName
} from "../01/twinnodeHelpers.js";
import { TwinNodes } from "../common/twinNodes.js";
import { drawTextWithBg, getWidgetBounds } from "../01/canvasHelpers.js";
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
let disablePrefix = app.ui.settings.getSettingValue("KJNodes.disablePrefix")
const LGraphNode = LiteGraph.LGraphNode

// TwinNodes base moved to ../common/twinNodes.js and imported above

app.registerExtension({
    name: "SetTwinNodes",
    registerCustomNodes() {
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
                if (!this.properties) {
                    this.properties = {
                        previousNames: [],
                        constCount: 2,
                    };
                }
                this.properties.showOutputText = SetTwinNodes.defaultVisibility;

                const node = this;

                // Storage for deferred disconnect handling and relink detection
                this.__disconnectTimers = this.__disconnectTimers || Object.create(null);
                this.__pendingRelinkInfo = this.__pendingRelinkInfo || Object.create(null);

                // Helper to compute and set the combined title from connected widgets' values,
                // and update node color from the first connected typed link
                this.updateTitle = function () {
                    console.log("[SetTwinNodes] updateTitle");
                    const names = extractWidgetNames(this);
                    this.title = computeTwinNodeTitle(names, "Set", disablePrefix);

                    // After updating the title/color, apply shortened labels to outputs when appropriate
                    this.applyAbbreviatedOutputLabels();
                };

                // Normalize labels without adding numbers; keep duplicates as-is.
                // Sync outputs to inputs and fill empty widget values from labels.
                this.applyDuplicateNumbering = function() {
                    console.log("[SetTwinNodes] applyDuplicateNumbering");
                    const count = this.inputs?.length || 0;
                    for (let i = 0; i < count; i++) {
                        if (!this.inputs?.[i] || this.inputs[i].link == null) continue;

                        const raw =
                            this.inputs[i].label ||
                            this.inputs[i].name ||
                            safeStringTrim(this.widgets?.[i]?.value) ||
                            `Constant ${i + 1}`;

                        const base = safeStringTrim(raw);

                        // Set input label/name verbatim (no numbering)
                        if (this.inputs?.[i]) {
                            this.inputs[i].name = base;
                            this.inputs[i].label = base;
                        }

                        // Sync outputs to inputs verbatim (temporary; may be shortened later)
                        if (this.outputs?.[i]) {
                            this.outputs[i].name = base;
                            this.outputs[i].label = base;
                        }

                        // Only fill widget value if empty or '*'
                        if (this.widgets?.[i] && (!this.widgets[i].value || this.widgets[i].value === '*')) {
                            this.widgets[i].value = base;
                            validateWidgetName(this, i);
                        }
                    }
                };

                // Compute and apply abbreviated labels to SetTwinNodes outputs where appropriate
                this.applyAbbreviatedOutputLabels = function() {
                    console.log("[SetTwinNodes] applyAbbreviatedOutputLabels");

                    // Build items from widget names using helper (allow duplicates, preserve order)
                    const names = extractWidgetNames(this, { unique: false });
                    const items = names.map((name, i) => ({ index: i, name }));

                    if (!items.length) return;

                    const analysis = analyzeNamesForAbbrev(items.map(it => it.name));
                    if (analysis && analysis.use) {
                        items.forEach((it, j) => {
                            if (this.outputs?.[it.index]) {
                                const short = analysis.shortNames[j] || it.name;
                                this.outputs[it.index].name = short;
                                this.outputs[it.index].label = short;
                            }
                        });
                    }
                };

                // Create an arbitrary number of constants/links
                const initialCount = this.properties.constCount || 2;
                for (let i = 0; i < initialCount; i++) {
                    const idx = i;
                    const widget = this.addWidget(
                        "text",
                        `Constant ${idx + 1}`,
                        '',
                        callback,
                        {}
                    );
                    // Hook the value setter to track previous value
                    wrapWidgetValueSetter(widget);

                    // callback?(value: any, canvas?: LGraphCanvas, node?: LGraphNode, pos?: Point, e?: CanvasPointerEvent): void;
                    function callback(value, canvas, node, pos, e) {
                        console.log("[SetTwinNodes] widget callback", {
                            value: value,
                            previousValue: node.widgets[idx]?.previousValue,
                            old_value: node.widgets[idx]?.value,
                            // node: node,
                            // pos: pos,
                            // e: e
                        });
                        if (node && node.graph) {
                            validateWidgetName(node, idx);
                            node.properties.previousNames[idx] = value;
                            node.updateTitle();
                            node.update();
                        }
                    }
                }
                ensureSlotCounts(this);
                // Initialize previousNames snapshot to current widget values
                this.properties.previousNames = (this.widgets || []).map(w => safeStringTrim(w?.value));
                this.updateTitle();

                /**
                 * Callback invoked by {@link connect} to override the target slot index.
                 * Its return value overrides the target index selection.
                 * @this {ComfyNode}
                 * @param {number} target_slot The current input slot index
                 * @param {number|string} requested_slot The originally requested slot index - could be negative, or if using (deprecated) name search, a string
                 * @returns {number|false|null} If a number is returned, the connection will be made to that input index.
                 * If an invalid index or non-number (false, null, NaN etc) is returned, the connection will be cancelled.
                 */
                this.onBeforeConnectInput = function (target_slot, requested_slot) {
                    console.log("[SetTwinNodes] onBeforeConnectInput", { target_slot, requested_slot });
                }
                this.onWidgetChanged = function (name, value, old_value, w) {
                    // [SetTwinNodes] onWidgetChanged {name: 'Constant 2', value: 'con2', old_value: 'IMAGE', w: TextWidget}
                    console.log("[SetTwinNodes] onWidgetChanged", {name, value, old_value, w});
                    node.graph.sendEventToAllNodes("setnodeNameChange", {
                        old_value,
                        value,
                        index: node.widgets.indexOf(w),
                        setterId: node.id
                    });
                }

                /**
                 * @this {ComfyNode}
                 * @param {number} type LiteGraph.INPUT (1) for input, LiteGraph.OUTPUT (2) for output.
                 * @param {number} index The slot index being affected.
                 * @param {boolean} isConnected True when connecting; false when disconnecting.
                 * @param {LLink|null|undefined} link_info The link descriptor involved in the change.
                 * @param {INodeInputSlot|INodeOutputSlot|SubgraphIO} inputOrOutput The slot object for the affected side.
                 */
                this.onConnectionsChange = function(
                    type,	//1 = input, 2 = output
                    index,
                    isConnected,
                    link_info,
                    inputOrOutput
                ) {
                    console.log("[SetTwinNodes] onConnectionsChange", { type, index, isConnected, link_info, inputOrOutput });
                    const mirrorOutputFromInput = (s) => {
                        if (this.inputs && this.outputs && this.inputs[s] && this.outputs[s]) {
                            this.outputs[s].type = this.inputs[s].type || '*';
                            // Do not overwrite with placeholders on disconnect
                            if (this.inputs[s].name && this.inputs[s].name !== '*') {
                                this.outputs[s].name = this.inputs[s].name;
                            }
                            const nextLabel = this.inputs[s].label || this.inputs[s].name;
                            if (nextLabel && nextLabel !== '*') {
                                this.outputs[s].label = nextLabel;
                            }
                        }
                    };

                    // Input disconnected
                    if (type === LiteGraph.INPUT && !isConnected) {
                        const slotKey = `${type}:${index}`;
                        // Capture the previous type at the moment of disconnect
                        const prevTypeAtDisconnect = this.inputs?.[index]?.type;
                        console.log("[SetTwinNodes] onConnectionsChange input disconnected", { slotKey, prevTypeAtDisconnect });

                        // Clear any existing timer for this slot
                        if (this.__disconnectTimers && this.__disconnectTimers[slotKey]) {
                            clearTimeout(this.__disconnectTimers[slotKey]);
                            delete this.__disconnectTimers[slotKey];
                        }

                        // Store relink info so a fast reconnection can be treated as a relink
                        if (!this.__pendingRelinkInfo) this.__pendingRelinkInfo = Object.create(null);
                        this.__pendingRelinkInfo[slotKey] = { hadLink: true, prevType: prevTypeAtDisconnect };

                        // Schedule the actual disconnect logic after 500ms unless a reconnection cancels it
                        if (!this.__disconnectTimers) this.__disconnectTimers = Object.create(null);
                        this.__disconnectTimers[slotKey] = setTimeout(() => {
                            // If not canceled by a reconnection, perform the original disconnect work
                            if (this.inputs?.[index]) {
                                this.inputs[index].type = '*';
                                this.inputs[index].name = '*';
                                this.inputs[index].label = '*';
                            }
                            if (this.outputs?.[index]) {
                                this.outputs[index].type = '*';
                                this.outputs[index].name = '*';
                                this.outputs[index].label = '*';
                            }
                            if (this.widgets?.[index]) {
                                this.widgets[index].value = '';
                            }
                            // Re-number duplicates among remaining connected inputs
                            this.applyDuplicateNumbering();
                            this.updateTitle();
                            // propagateToGetters(this);
                            // this.update();

                            // Cleanup
                            if (this.__disconnectTimers) delete this.__disconnectTimers[slotKey];
                            if (this.__pendingRelinkInfo) delete this.__pendingRelinkInfo[slotKey];
                        }, 500);

                        return;
                    }

                    // Output disconnected
                    if (type === LiteGraph.OUTPUT && !isConnected) {
                        if (this.outputs?.[index]) {
                            this.outputs[index].type = '*';
                            this.outputs[index].name = '*';
                            this.outputs[index].label = '*';
                        }
                        this.updateTitle();
                        // this.update();
                        return;
                    }

                    // Input connected
                    if (link_info && this.graph && type === LiteGraph.INPUT && isConnected) {
                        const fromNode = GraphHelpers.getNodeById(this.graph, link_info.origin_id);
                        if (fromNode?.outputs?.[link_info.origin_slot]) {
                            const srcSlot = fromNode.outputs[link_info.origin_slot];
                            const type = srcSlot.type;

                            // Cancel pending disconnect if we quickly reconnected the same slot
                            const slotKey = `${LiteGraph.INPUT}:${index}`;
                            if (this.__disconnectTimers && this.__disconnectTimers[slotKey]) {
                                clearTimeout(this.__disconnectTimers[slotKey]);
                                delete this.__disconnectTimers[slotKey];
                            }

                            // Otherwise, proceed with normal naming behavior (type changed or no previous link)

                            // Detect relink: consult pending relink info first, else derive from current state
                            let hadLink, prevType;
                            if (this.__pendingRelinkInfo && this.__pendingRelinkInfo[slotKey]) {
                                ({ hadLink, prevType } = this.__pendingRelinkInfo[slotKey]);
                                delete this.__pendingRelinkInfo[slotKey];
                            } else {
                                hadLink = null;
                                prevType = null;
                            }

                            // If relinking and type didn't change, don't auto-rename input/output/widget
                            if (hadLink && prevType && prevType === type) {
                                // Ensure type is updated and mirror to output, but keep names/labels/values unchanged
                                if (this.inputs?.[index]) {
                                    this.inputs[index].type = type || '*';
                                }
                                if (this.outputs?.[index]) {
                                    this.outputs[index].type = type || '*';
                                }

                                // Propagate updated types to getters without altering names
                                // propagateToGetters(this);

                                // this.update();
                                return;
                            }

                            const basePreferred = getPreferredSlotLabel(fromNode, link_info.origin_slot) || type || '*';

                            // If the preferred label is a "lame name" (equals type), see if exactly one GetTwinNodes
                            // has a starred constant and an output typed to this 'type'. If so, adopt that label,
                            // but DO NOT adopt the trailing '*'. Also update the remote origin output label.
                            let preferred = basePreferred;
                            if (basePreferred === type) {
                                const candidates = (this.graph?._nodes || []).filter(n => {
                                    if (n.type !== 'GetTwinNodes') return false;
                                    const hasUnlinked = Array.isArray(n.widgets) && n.widgets.some(w => typeof w?.value === 'string' && isUnlinkedName(w.value.trim()));
                                    const matchesType = Array.isArray(n.outputs) && n.outputs.some(out => out?.type === type);
                                    return hasUnlinked && matchesType;
                                });
                                if (candidates.length === 1) {
                                    const unlinkedVal = candidates[0].widgets.find(w => typeof w?.value === 'string' && isUnlinkedName(w.value.trim()))?.value;
                                    if (unlinkedVal) {
                                        const destarred = stripUnlinkedPrefix(String(unlinkedVal));
                                        preferred = destarred || basePreferred;

                                        // Update the remote origin (fromNode) output label/name to the new de-unlinked name
                                        if (fromNode.outputs?.[link_info.origin_slot]) {
                                            fromNode.outputs[link_info.origin_slot].label = preferred;
                                            fromNode.outputs[link_info.origin_slot].name = preferred;
                                            if (app?.canvas?.setDirty) app.canvas.setDirty(true, true);
                                        }

                                        // Also update the GetTwinNodes widget value to the de-unlinked name
                                        const gwidgets = candidates[0].widgets || [];
                                        const starredIdx = gwidgets.findIndex(w => typeof w?.value === 'string' && isUnlinkedName(w.value.trim()));
                                        if (starredIdx !== -1) {
                                            gwidgets[starredIdx].value = destarred;
                                            if (app?.canvas?.setDirty) app.canvas.setDirty(true, true);
                                        }
                                    }
                                }
                            }

                            // Always reflect the connected (possibly adopted) label on the input
                            this.inputs[index].type = type || '*';
                            this.inputs[index].name = preferred;
                            this.inputs[index].label = preferred;

                            // Auto-name the corresponding widget for this slot if empty or '*'
                            if (this.widgets?.[index] && (!this.widgets[index].value || this.widgets[index].value === '*')) {
                                this.widgets[index].value = preferred;
                                // Enforce graph-wide uniqueness for this widget index
                                validateWidgetName(this, index);
                            }

                            // Mirror type/name to the corresponding output
                            mirrorOutputFromInput(index);

                            // Normalize duplicates among all connected inputs
                            this.applyDuplicateNumbering();

                            // Update title/color and propagate
                            this.updateTitle();
                            // propagateToGetters(this);

                            this.updateColors();

                            // Cleanup any snapshot for this slot after a normal connect
                            if (this.__lastDisconnected) delete this.__lastDisconnected[index];
                        } else {
                            showAlert("node input undefined.");
                        }
                        // this.update();
                        return;
                    }

                    // Output connected
                    if (link_info && this.graph && type === LiteGraph.OUTPUT && isConnected) {
                        mirrorOutputFromInput(index);
                        this.updateTitle();
                        // this.update();
                        return;
                    }
                }

                /**
                 * Creates a copy of this node.
                 * Conforms to LGraphNode.clone by returning a cloned node instance; resets slots and recomputes size.
                 * @this {ComfyNode}
                 * @returns {ComfyNode} The cloned node.
                 */
                this.clone = function () {
                    const cloned = SetTwinNodes.prototype.clone.apply(this);
                    // Reset all inputs
                    if (cloned.inputs) {
                        for (let i = 0; i < cloned.inputs.length; i++) {
                            cloned.inputs[i].name = '*';
                            cloned.inputs[i].type = '*';
                            cloned.inputs[i].label = '*';
                        }
                    }
                    cloned.value = '';
                    cloned.properties.previousNames = [];
                    cloned.size = cloned.computeSize();
                    return cloned;
                };

                /**
                 * Called when the node is added to a graph.
                 * Mirrors LGraphNode.onAdded.
                 * @param {LGraph} graph The graph this node was added to.
                 * @returns {void}
                 */
                this.onAdded = function(graph) {
                    if (Array.isArray(this.widgets)) {
                        for (let i = 0; i < this.widgets.length; i++) {
                            validateWidgetName(this, i);
                        }
                    }
                }

                this.checkGetters = function() {
                    this.currentGetters = this.widgets.map((v, k) => k).map(k => findGetters(this, null, k));
                    this.canvas.setDirty(true, true);
                    console.log("[SetTwinNodes] checkGetters", this.currentGetters);
                }

                this.update = function() {
                    console.log("[SetTwinNodes] update");
                    if (!node.graph) {
                        return;
                    }
                    if (node !== this)
                        console.log("[SetTwinNodes] update (hmmmm)", {
                            node: node,
                            this: this
                        });

                    // Propagate types to all getters that share at least one of this node's names
                    // this line only used for debug output
                    const getters = findGetters(node);
                    console.log("[SetTwinNodes] getters (propagation targets)", getters);
                    // propagateToGetters(this, getters);

                    // Rename propagation across all widget indices:
                    // compare previousNames snapshot vs current widget values and
                    // update any GetTwinNodes widgets that still reference the old name.
                    const currNames = Array.isArray(this.widgets)
                        ? this.widgets.map(widget => safeStringTrim(widget?.value))
                        : [];
                    const prevNames = Array.isArray(this.properties.previousNames) ? this.properties.previousNames : [];

                    for (let i = 0; i < Math.max(prevNames.length, currNames.length); i++) {
                        const prev = prevNames[i] || "";
                        const curr = currNames[i] || "";
                        if (prev && curr && prev !== curr) {
                            const allGettersForRename = GraphHelpers.getNodesByType(node.graph, "GetTwinNodes");
                            allGettersForRename.forEach(/** ComfyNode */ getter => {
                                if (!Array.isArray(getter.widgets)) return;
                                let changed = false;
                                for (let gi = 0; gi < getter.widgets.length; gi++) {
                                    const gv = getter.widgets[gi]?.value;
                                    if (gv && safeStringTrim(gv) === prev) {
                                        getter.widgets[gi].value = curr;
                                        changed = true;
                                    }
                                }
                                if (changed && typeof getter.onRename === "function") {
                                    getter.onRename();
                                }
                            });
                        }
                    }

                    // Update the previousNames snapshot
                    this.properties.previousNames = currNames;
                }

            }


            /**
             * Called when the node is removed from the graph.
             * Mirrors LGraphNode.onRemoved.
             * @returns {void}
             */
            onRemoved() {
                console.log("[SetTwinNodes] onRemoved (kinda think something should happen here)");
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
                            node.checkGetters();
                            console.log("[SetTwinNodes] context menu, found getters", node.currentGetters);
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
                        content: "Check getters",
                        callback: () => {
                            node.checkGetters();
                        },
                    },
                    {
                        content: "Hide all connections",
                        callback: () => {
                            const allGetters = GraphHelpers.getNodesByType(node.graph, ["GetTwinNodes", "SetTwinNodes"]);
                            allGetters.forEach(otherNode => {
                                otherNode.drawConnection = false;
                                console.log(otherNode);
                            });

                            menuEntry = "Show connections";
                            node.drawConnection = false
                            node.canvas.setDirty(true, true);

                        },

                    },
                );
                // Dynamically add a submenu for all getters
                this.checkGetters();
                if (node.currentGetters) {

                    let gettersSubmenu = node.currentGetters.flat(0).map(getter => ({
                        content: `${getter.title} id: ${getter.id}`,
                        callback: () => {
                            node.canvas.centerOnNode(getter);
                            node.canvas.selectNode(getter, false);
                            node.canvas.setDirty(true, true);

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
                    const defaultLink = {type: 'default', color: this.slotColor};

                    for (const getter of getters) {
                        // Add validation for getter
                        if (!getter || typeof getter.getConnectionPos !== 'function') continue;

                        // Determine a sensible end anchor on the getter: first typed input, else input 0
                        let inIdx = 0;
                        if (Array.isArray(getter.inputs)) {
                            const fin = getter.inputs.findIndex(input => input && input.type && input.type !== '*');
                            if (fin >= 0) inIdx = fin;
                        }

                        const absEnd = getter.getConnectionPos(true, inIdx);
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
                            this.slotColor,
                            LiteGraph.RIGHT,
                            LiteGraph.LEFT
                        );
                    }
                });
            }
        }

        LiteGraph.registerNodeType(
            "SetTwinNodes",
            Object.assign(SetTwinNodes, {
                title: "Set",
            })
        );

        SetTwinNodes.category = "ovum";
    },
});

