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
    setWidgetValueWithValidation, suggestValidWidgetValue
} from "../01/twinnodeHelpers.js";
import { chainCallback } from "../01/utility.js";
import {TwinNodes} from "../common/twinNodes.js";
import {drawTextWithBg, getWidgetBounds} from "../01/canvasHelpers.js";
import {log} from "../common/logger.js";

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
    onPropertyChanged(name, value, previousValue) {
        log({ class: "SetTwinNodes", method: "onPropertyChanged", severity: "trace", tag: "function_entered" }, `onPropertyChanged ${name} = ${value}`);
        try {
            // Only react to title changes explicitly made by the user
            if (name !== "title") return;
            const oldTitle = typeof previousValue === 'string' ? previousValue.trim() : '';
            const newTitle = typeof value === 'string' ? value.trim() : '';
            if (!newTitle) return;
            // Regex: anything_from_<digits>_to_<digits> at end
            const re = /.*_from_\d+_to_\d+$/;
            if (!oldTitle || !re.test(oldTitle)) return;
            // Must have widgets
            if (!Array.isArray(this.widgets) || this.widgets.length === 0) return;
            // Count non-empty widget values
            const nonEmptyIdx = [];
            for (let i = 0; i < this.widgets.length; i++) {
                const v = this.widgets[i]?.value;
                if (typeof v === 'string' && v.trim()) nonEmptyIdx.push(i);
            }
            // Only one widget with a value, and it must be the first (index 0)
            if (nonEmptyIdx.length !== 1 || nonEmptyIdx[0] !== 0) return;
            const firstVal = (this.widgets[0]?.value ?? '').trim();
            // Old title must equal the first widget's value
            if (firstVal !== oldTitle) return;
            // Validate originality. Only proceed if validator returns the same value (no change)
            const suggested = suggestValidWidgetValue(this, 0, newTitle);
            if (suggested !== newTitle) return;
            // Apply the rename to the widget, and propagate change similarly to manual edit
            const widget = this.widgets[0];
            const oldWidgetValue = widget?.value;
            if (widget) {
                // Directly set since we already validated uniqueness matches exactly
                widget.value = newTitle;
                // Keep node title as the user set it. Update computed state, colors, and connections.
                this.updateTitle(false); // do not force override user title
                this.updateColors?.();
                this.checkConnections?.();
                this.update?.();
                // Broadcast rename so getters can update
                this.onWidgetChanged(widget?.name, newTitle, oldWidgetValue, widget);
            }
        } catch (err) {
            try { log({ class: "SetTwinNodes", method: "onPropertyChanged", severity: "error", tag: "exception" }, String(err)); } catch (_) {}
        }
    }
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
            const widget = this.addWidget(
                "text",
                `Constant ${idx + 1}`,
                '',
                callback,
                {}
            );
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

        // Input connected
        if (type === LiteGraph.INPUT && isConnected && link_info && this.graph) {
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
                validateWidgetValue(this, i);
            }
        }
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
                    this.slotColor,
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

