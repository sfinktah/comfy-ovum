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

import { app } from "../../../scripts/app.js";
import { GraphHelpers } from "../common/graphHelpersForTwinNodes.js";
import { analyzeNamesForAbbrev, computeTwinNodeTitle, extractWidgetNames } from "../01/stringHelper.js";

// mostly written by GPT-5
// based on KJ's SetGet: https://github.com/kj-comfy/ComfyUI-extensions which was
// based on diffus3's SetGet: https://github.com/diffus3/ComfyUI-extensions

/**
 * @param {string} type
 */
function setColorAndBgColor(type) {
    /*
black : {color: '#222', bgcolor: '#000', groupcolor: '#444'}
blue : {color: '#223', bgcolor: '#335', groupcolor: '#88A'}
brown : {color: '#332922', bgcolor: '#593930', groupcolor: '#b06634'}
cyan : {color: '#233', bgcolor: '#355', groupcolor: '#8AA'}
green : {color: '#232', bgcolor: '#353', groupcolor: '#8A8'}
pale_blue : {color: '#2a363b', bgcolor: '#3f5159', groupcolor: '#3f789e'}
purple : {color: '#323', bgcolor: '#535', groupcolor: '#a1309b'}
red : {color: '#322', bgcolor: '#533', groupcolor: '#A88'}
yellow : {color: '#432', bgcolor: '#653', groupcolor: '#b58b2a'}
     */
    const colorMap = {
        "MODEL": LGraphCanvas.node_colors.blue,
        "LATENT": LGraphCanvas.node_colors.purple,
        "VAE": LGraphCanvas.node_colors.red,
        "WANVAE": LGraphCanvas.node_colors.red,
        "CONDITIONING": LGraphCanvas.node_colors.brown,
        "EMBEDS": LGraphCanvas.node_colors.orange,
        "IMAGE": LGraphCanvas.node_colors.pale_blue,
        "CLIP": LGraphCanvas.node_colors.yellow,
        "FLOAT": LGraphCanvas.node_colors.green,
        "STRING": { color: "#880", bgcolor: "#660"},
        "MASK": { color: "#1c5715", bgcolor: "#1f401b"},
        "INT": { color: "#1b4669", bgcolor: "#29699c"},
        "CONTROL_NET": { color: "#156653", bgcolor: "#1c453b"},
        "NOISE": { color: "#2e2e2e", bgcolor: "#242121"},
        "GUIDER": { color: "#3c7878", bgcolor: "#1c453b"},
        "SAMPLER": { color: "#614a4a", bgcolor: "#3b2c2c"},
        "SIGMAS": { color: "#485248", bgcolor: "#272e27"},
    };

    let colors = colorMap[type];
    if (!colors) {
        for (const key in colorMap) {
            if (~type.indexOf(key)) {
                this.color = colorMap[key].color || colorMap[key];
                this.bgcolor = colorMap[key].bgcolor;
                return;
            }
        }
        return;
    }
    if (colors) {
        this.color = colors.color;
        this.bgcolor = colors.bgcolor;
    }
}

// Helpers for handling "unlinked" markers (star-suffix)
function isUnlinkedName(str) {
    if (typeof str !== 'string') return false;
    return str.trim().endsWith('*');
}
function stripUnlinkedPrefix(str) {
    if (typeof str !== 'string') return '';
    // Remove one or more trailing asterisks
    return str.replace(/\*+$/, '').trim();
}
function makeUnlinkedName(name) {
    const base = stripUnlinkedPrefix(name);
    // Do not alter the text on disconnect; preserve the original value
    return `${base}`;
}

// Hook the 'value' setter to record the previous value on change
function wrapWidgetValueSetter(widget) {
    try {
        if (!widget || typeof widget !== 'object') return;
        if (widget.__previousHooked) return;

        // Find the accessor descriptor up the prototype chain
        let proto = widget;
        let desc = null;
        while (proto && !desc) {
            desc = Object.getOwnPropertyDescriptor(proto, 'value');
            proto = Object.getPrototypeOf(proto);
        }
        if (!desc || typeof desc.set !== 'function') {
            widget.__previousHooked = true; // avoid repeated attempts
            return;
        }
        const origGet = typeof desc.get === 'function' ? desc.get : null;
        const origSet = desc.set;

        Object.defineProperty(widget, 'value', {
            configurable: true,
            enumerable: desc.enumerable ?? true,
            get: function () {
                return origGet ? origGet.call(this) : undefined;
            },
            set: function (v) {
                const current = origGet ? origGet.call(this) : undefined;
                // Consider invalid a string that is empty (after trim) or equals '*'
                const vt = (typeof v === 'string') ? v.trim() : v;
                const isInvalidString = (typeof v === 'string') && (vt === '' || vt === '*');

                if (current !== v && !isInvalidString) {
                    try {
                        // Store previous value on change
                        this["#previous"] = current;
                    } catch (_e) {
                        // ignore if we cannot set
                    }
                }
                return origSet.call(this, v);
            }
        });

        // Expose a method to fetch the previous name/value
        if (typeof widget.getPreviousName !== 'function') {
            Object.defineProperty(widget, 'getPreviousName', {
                value: function () {
                    return this["#previous"];
                },
                writable: false,
                enumerable: false,
                configurable: true
            });
        }

        Object.defineProperty(widget, '__previousHooked', {
            value: true,
            writable: false,
            enumerable: false,
            configurable: false
        });
    } catch (_err) {
        // best-effort; ignore errors
    }
}


// Note: we don't actually have a settings , so lets use Kijai's
let disablePrefix = app.ui.settings.getSettingValue("KJNodes.disablePrefix")
const LGraphNode = LiteGraph.LGraphNode

function showAlert(message) {
    app.extensionManager.toast.add({
        severity: 'warn',
        summary: "Get/SetTwinNodes",
        detail: `${message}. Most likely you're missing custom nodes`,
        life: 5000,
    })
}

// function findSetter(node) {
//     if (!(node instanceof LGraphNode)) {
//         throw new Error("node parameter must be instance of LGraphNode");
//     }
//     const chosen = (node.widgets || []).map(w => w?.value).map(v => (v ? String(v).trim() : "")).filter(v => !!v);
//     if (chosen.length === 0) return null;
//     const sourceNames = (Array.isArray(node.widgets) ? node.widgets.map(w => (w && w.value != null ? String(w.value).trim() : "")) : []).filter(v => !!v);
//     const setters = GraphHelpers.getNodesByType(node.graph, 'SetTwinNodes');
//     console.log("[findSetter]", { node: node, chosen: chosen, sourceNames: sourceNames, setters: setters });
//     if (sourceNames.length === 0) return null;
//
//     // Match any setter that contains all chosen constants, regardless of position
//     let found = setters.find(s => {
//         const sw = (s.widgets || []).map(w => (w?.value ? String(w.value).trim() : ""));
//         return chosen.every(v => sw.includes(v));
//     });
//
//     // TODO: Check - fallback prioritizes the first chosen constant
//     // Fallback: match any setter that contains at least the first chosen value
//     if (!found && chosen[0]) {
//         console.log("[findSetter] fallback", { node: node, chosen: chosen, setters: setters });
//         found = setters.find(s => (s.widgets || []).some(w => String(w?.value || "").trim() === chosen[0]));
//     }
//     else if (found) {
//         console.log("[findSetter] found", {node: node, chosen: chosen, setters: setters, found: found});
//     }
//     return found || null;
// };

function findSetters(node, name = undefined) {
    // noinspection DuplicatedCode
    if (!(node instanceof LGraphNode)) {
        throw new Error("node parameter must be instance of LGraphNode");
    }
    const sourceNames = Array.isArray(node.widgets) ? node.widgets.map(w => (w && w.value != null ? String(w.value).trim() : "")) : [];
    const names = name ? [name] : sourceNames.filter(v => !!v);
    console.log("[findSetters]", { node: node, names: names });
    if (names.length === 0) return [];
    const nameSet = new Set(names);
    return GraphHelpers.getNodesByType(node.graph, ['SetTwinNodes', 'SetNode']).filter(otherNode =>
        Array.isArray(otherNode.widgets) &&
        otherNode.widgets.some(widget => {
            console.log("[findSetters] widget", { widget: widget });
            const widgetValue = widget && widget.value != null ? String(widget.value).trim() : "";
            return widgetValue && nameSet.has(widgetValue);
        })
    );
}

/**
 * @param {GetTwinNodes|ComfyNode} node - The input node containing widgets and a graph. This node is used to determine
 *                        the set of values to filter getter nodes against. The `node` object is expected
 *                        to have the properties `widgets` (an array) and `graph` (a reference to the graph instance).
 * @return {ComfyNode} - An array of getter nodes that meet the matching criteria. If no matches or values are found,
 *                   an empty array is returned.
 */
function findSetter(node, name = undefined) {
    const setters = findSetters(node, name);
    if (setters.length) {
        return setters[0];
    }
    return null;
}

// Match GetTwinNodes if they share at least one name with this node
// If checkForPreviousName is true, use the previousNames snapshot; otherwise use current widget values.
function findGetters(node, checkForPreviousName) {
    if (!(node instanceof LGraphNode)) {
        throw new Error("node parameter must be instance of LGraphNode");
    }
    const sourceNames = checkForPreviousName
        ? (Array.isArray(node.properties.previousNames) ? node.properties.previousNames : [])
        : (Array.isArray(node.widgets) ? node.widgets.map(w => (w && w.value != null ? String(w.value).trim() : "")) : []);
    const names = sourceNames.filter(v => !!v);
    console.log("[findGetters]", { node: node, checkForPreviousName: checkForPreviousName, names: names });
    if (!node.graph || names.length === 0) return [];
    const nameSet = new Set(names);
    return GraphHelpers.getNodesByType(node.graph, 'GetTwinNodes').filter(otherNode =>
        Array.isArray(otherNode.widgets) &&
        otherNode.widgets.some(w => {
            const val = w && w.value != null ? String(w.value).trim() : "";
            return val && nameSet.has(val);
        })
    );
}

/**
 * Identifies and returns a list of getter nodes from the graph that match certain criteria
 * based on the values of the widgets in the provided node.
 *
 * The method first extracts widget values from the input node, processes them into a list of
 * constants, and then searches for getter nodes in the graph that match all or some of these constants.
 * If no exact match is found, a fallback mechanism is applied where getter nodes containing
 * at least the first selected constant are considered.
 *
 * @param {SetTwinNodes|LGraphNode|ComfyNode} node - The input node containing widgets and a graph. This node is used to determine
 *                        the set of values to filter getter nodes against. The `node` object is expected
 *                        to have the properties `widgets` (an array) and `graph` (a reference to the graph instance).
 * @return {Array} - An array of getter nodes that meet the matching criteria. If no matches or values are found,
 *                   an empty array is returned.
 */
// function findGetters(node) {
//     if (!(node instanceof LGraphNode)) {
//         throw new Error("node parameter must be instance of LGraphNode");
//     }
//
//     const chosen = (node.widgets || []).map(w => w?.value).map(v => (v ? String(v).trim() : "")).filter(v => !!v);
//     const getters = GraphHelpers.getNodesByType(node.graph, 'GetTwinNodes');
//     console.log("[findGetters]", { node: node, chosen: chosen, getters: getters });
//     if (chosen.length === 0) return [];
//
//     // Match any setter that contains all chosen constants, regardless of position
//     let found = getters.filter(setterNode => {
//         const setterWidgets = (setterNode.widgets || []).map(w => (w?.value ? String(w.value).trim() : ""));
//         return chosen.every(v => setterWidgets.includes(v));
//     });
//
//     // TODO: Check - fallback prioritizes the first chosen constant
//     // Fallback: match any getter that contains at least the first chosen value
//     console.log("[findGetters] fallback", { node: node, chosen: chosen, getters: getters });
//     if (!found && chosen[0]) {
//         found = getters.filter(s => (s.widgets || []).some(w => String(w?.value || "").trim() === chosen[0]));
//     }
//     console.log("[findGetters] found", { node: node, chosen: chosen, getters: getters, found: found });
//     return found || [];
// }

function propagateToGetters(node) {
    const types = (node.inputs || []).map(input => input?.type || '*');
    const getters = findGetters(node);
    getters.forEach(/** GetTwinNodes */ getter => {
        if (getter.setTypesArray) {
            getter.setTypesArray(types);
        } else if (getter.setTypes) {
            getter.setTypes(types[0] || '*', types[1] || '*');
        }
    });

    // Broadcast rename events so getters can update their widget values
    try {
        const g = node && node.graph;
        if (g && typeof g.sendEventToAll === "function") {
            const currNames = Array.isArray(node.widgets)
                ? node.widgets.map(w => (w && w.value != null ? String(w.value).trim() : ""))
                : [];
            const prevNames = Array.isArray(node.properties?.previousNames)
                ? node.properties.previousNames
                : [];
            const maxLen = Math.max(prevNames.length, currNames.length);
            for (let i = 0; i < maxLen; i++) {
                const prev = (prevNames[i] || "").trim();
                const next = (currNames[i] || "").trim();
                if (prev && next && prev !== next) {
                    g.sendEventToAll("setnodeNameChange", {
                        prev,
                        next,
                        index: i,
                        setterId: node.id
                    });
                }
            }
        }
    } catch (_e) {
        // ignore broadcast errors
    }
}

app.registerExtension({
    name: "SetTwinNodes",
    registerCustomNodes() {
        class SetTwinNodes extends LGraphNode {
            defaultVisibility = true;
            serialize_widgets = true;
            drawConnection = false;
            currentGetters = null;
            slotColor = "#FFF";
            canvas = app.canvas;
            menuEntry = "Show connections";

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
                    const names = extractWidgetNames(this, { connectedOnly: true });
                    this.title = computeTwinNodeTitle(names, "Set", disablePrefix);

                    // Determine color from the first connected link with a known color
                    let pickedType = null;
                    if (this.inputs) {
                        for (let i = 0; i < this.inputs.length; i++) {
                            if (this.inputs[i]?.link != null && this.inputs[i]?.type && this.inputs[i].type !== '*') {
                                pickedType = this.inputs[i].type;
                                break;
                            }
                        }
                    }
                    // Note: we don't actually have a settings panel yet
                    const autoColor = app.ui.settings.getSettingValue("KJNodes.nodeAutoColor");
                    if (pickedType && autoColor) {
                        setColorAndBgColor.call(this, pickedType);
                    } else {
                        // reset to default look if nothing connected or auto-color disabled
                        this.color = undefined;
                        this.bgcolor = undefined;
                    }

                    // After updating the title/color, apply shortened labels to outputs when appropriate
                    this.applyAbbreviatedOutputLabels();
                };

                // Ensure there are N inputs and outputs matching widget count
                this.ensureSlotCount = function(count) {
                    console.log("[SetTwinNodes] ensureSlotCount");
                    // grow inputs/outputs
                    while ((this.inputs?.length || 0) < count) this.addInput("*", "*");
                    while ((this.outputs?.length || 0) < count) this.addOutput("*", "*");
                    // shrink inputs/outputs if needed
                    while ((this.inputs?.length || 0) > count) this.removeInput(this.inputs.length - 1);
                    while ((this.outputs?.length || 0) > count) this.removeOutput(this.outputs.length - 1);
                };

                // Get a human-friendly label from the connected output: prefer label, then name, then type
                this.getPreferredSlotLabel = function(fromNode, originSlotIndex) {
                    console.log("[SetTwinNodes] getPreferredSlotLabel");
                    const srcSlot = fromNode?.outputs?.[originSlotIndex];
                    const lbl = srcSlot?.label || srcSlot?.name || srcSlot?.type;
                    return (lbl && String(lbl).trim()) || "";
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
                            (this.widgets?.[i]?.value ? String(this.widgets[i].value).trim() : "") ||
                            `Constant ${i + 1}`;

                        const base = String(raw).trim();

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
                            this.validateWidgetName(this.graph, i);
                        }
                    }
                };

                // Compute and apply abbreviated labels to SetTwinNodes outputs where appropriate
                this.applyAbbreviatedOutputLabels = function() {
                    console.log("[SetTwinNodes] applyAbbreviatedOutputLabels");

                    const items = [];
                    const maxCount = Math.max(
                        this.widgets?.length || 0,
                        this.inputs?.length || 0,
                        this.outputs?.length || 0
                    );

                    for (let i = 0; i < maxCount; i++) {
                        const connected = !!(this.inputs?.[i]?.link != null);
                        const raw = this.widgets?.[i]?.value;
                        const val = (raw && String(raw).trim()) || "";
                        // Only consider slots that are connected or have a meaningful value
                        if (connected || val) {
                            const baseName = val || String(this.inputs?.[i]?.label || this.inputs?.[i]?.name || "").trim();
                            if (baseName) {
                                items.push({ index: i, name: baseName });
                            }
                        }
                    }

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
                    const created = this.addWidget(
                        "text",
                        `Constant ${idx + 1}`,
                        '',
                        callback,
                        {}
                    );
                    // Hook the value setter to track previous value
                    wrapWidgetValueSetter(created);

                    // callback?(value: any, canvas?: LGraphCanvas, node?: LGraphNode, pos?: Point, e?: CanvasPointerEvent): void;
                    function callback(value, canvas, node, pos, e) {
                        console.log("[SetTwinNodes] widget callback", {
                            value: value,
                            old_value: node.widgets[idx]?.value,
                            canvas: canvas,
                            node: node,
                            pos: pos,
                            e: e
                        });
                        if (node && node.graph) {
                            node.validateWidgetName(node.graph, idx);
                            node.properties.previousNames[idx] = value;
                            node.updateTitle();
                            node.update();
                        }
                    }
                }
                this.ensureSlotCount(initialCount);
                // Initialize previousNames snapshot to current widget values
                this.properties.previousNames = (this.widgets || []).map(w => (w && w.value != null ? String(w.value).trim() : ""));
                this.updateTitle();

                /**
                 * @this {ComfyNode}
                 * @param {ISlotType} type
                 * @param {number} index
                 * @param {boolean} isConnected
                 * @param {LLink|null|undefined} link_info
                 * @param {INodeInputSlot|INodeOutputSlot|SubgraphIO} inputOrOutput
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
                            }
                            if (this.widgets?.[index]) {
                                this.widgets[index].value = '';
                            }
                            // Re-number duplicates among remaining connected inputs
                            this.applyDuplicateNumbering();
                            this.updateTitle();
                            propagateToGetters(this);
                            this.update();

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
                        }
                        this.updateTitle();
                        this.update();
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
                                propagateToGetters(this);

                                this.update();
                                return;
                            }

                            const basePreferred = this.getPreferredSlotLabel(fromNode, link_info.origin_slot) || type || '*';

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
                                this.validateWidgetName(this.graph, index);
                            }

                            // Mirror type/name to the corresponding output
                            mirrorOutputFromInput(index);

                            // Normalize duplicates among all connected inputs
                            this.applyDuplicateNumbering();

                            // Update title/color and propagate
                            this.updateTitle();
                            propagateToGetters(this);

                            // Note: we don't actually have a settings panel yet
                            if (app.ui.settings.getSettingValue("KJNodes.nodeAutoColor")) {
                                const firstTyped = (this.inputs || []).find(i => i?.type && i.type !== '*');
                                if (firstTyped) setColorAndBgColor.call(this, firstTyped.type);
                            }

                            // Cleanup any snapshot for this slot after a normal connect
                            if (this.__lastDisconnected) delete this.__lastDisconnected[index];
                        } else {
                            showAlert("node input undefined.");
                        }
                        this.update();
                        return;
                    }

                    // Output connected
                    if (link_info && this.graph && type === LiteGraph.OUTPUT && isConnected) {
                        mirrorOutputFromInput(index);
                        this.updateTitle();
                        this.update();
                        return;
                    }
                }

                // Ensure a widget's name is unique across all SetTwinNodes widgets in the graph.
                // If a collision is found, append _0, _1, ... to the original base.
                this.validateWidgetName = function(graph, idx) {
                    if (!graph || !this.widgets || !this.widgets[idx]) return;
                    let base = String(this.widgets[idx].value || "").trim();
                    if (!base) return;

                    // Collect every widget value from all SetTwinNodes (excluding this exact widget)
                    const existingValues = new Set();
                    graph._nodes.forEach(otherNode => {
                        if (otherNode && otherNode.type === 'SetTwinNodes' && Array.isArray(otherNode.widgets)) {
                            otherNode.widgets.forEach((w, wi) => {
                                if (!w) return;
                                if (otherNode === this && wi === idx) return; // skip self at same index
                                const v = (w.value != null) ? String(w.value).trim() : "";
                                if (v) existingValues.add(v);
                            });
                        }
                    });

                    // If base collides, append _0, _1, ...
                    if (existingValues.has(base)) {
                        let tries = 0;
                        let candidate = `${base}_${tries}`;
                        while (existingValues.has(candidate)) {
                            tries++;
                            candidate = `${base}_${tries}`;
                        }
                        this.widgets[idx].value = candidate;
                    }
                    this.update();
                }

                // Return the previous name recorded for the widget at index 'idx'
                this.getPreviousName = function(idx) {
                    const w = this.widgets && this.widgets[idx];
                    if (!w) return undefined;
                    if (typeof w.getPreviousName === 'function') return w.getPreviousName();
                    return w["#previous"];
                };

                this.clone = function () {
                    const cloned = SetTwinNodes.prototype.clone.apply(this);
                    // Reset all inputs
                    if (cloned.inputs) {
                        for (let i = 0; i < cloned.inputs.length; i++) {
                            cloned.inputs[i].name = '*';
                            cloned.inputs[i].type = '*';
                        }
                    }
                    cloned.value = '';
                    cloned.properties.previousNames = [];
                    cloned.size = cloned.computeSize();
                    return cloned;
                };

                this.onAdded = function(graph) {
                    if (Array.isArray(this.widgets)) {
                        for (let i = 0; i < this.widgets.length; i++) {
                            this.validateWidgetName(graph, i);
                            // Hook any pre-existing widget instances
                            try { wrapWidgetValueSetter(this.widgets[i]); } catch (_e) {}
                        }
                    }
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
                    propagateToGetters(this, getters);

                    // Rename propagation across all widget indices:
                    // compare previousNames snapshot vs current widget values and
                    // update any GetTwinNodes widgets that still reference the old name.
                    const currNames = Array.isArray(this.widgets)
                        ? this.widgets.map(widget => (widget && widget.value != null ? String(widget.value).trim() : ""))
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
                                    if (gv && String(gv).trim() === prev) {
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

                // This node is purely frontend and does not impact the resulting prompt so should not be serialized
                this.isVirtualNode = true;
            }


            onRemoved() {
                console.log("[SetTwinNodes] onRemoved (kinda think something should happen here)");
            }
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
                            node.currentGetters = findGetters(node);
                            console.log("[SetTwinNodes] context menu, found getters", node.currentGetters);
                            if (node.currentGetters.length == 0) return;
                            // Generalize: pick first connected, typed output across all getters
                            let linkType = '*';
                            for (const g of node.currentGetters) {
                                const found = (g.outputs || []).find(o => o && o.type && o.type !== '*');
                                if (found) { linkType = found.type; break; }
                            }
                            node.slotColor = node.canvas.default_connection_color_byType[linkType]
                            menuEntry = node.drawConnection ? "Hide connections" : "Show connections";
                            node.drawConnection = !node.drawConnection;
                            node.canvas.setDirty(true, true);

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
                node.currentGetters = findGetters(node);
                if (node.currentGetters) {

                    let gettersSubmenu = node.currentGetters.map(getter => ({

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


            onDrawForeground(ctx, lGraphCanvas) {
                if (this.drawConnection) {
                    this._drawVirtualLinks(lGraphCanvas, ctx);
                }
            }
            // onDrawCollapsed(ctx, lGraphCanvas) {
            // 	if (this.drawConnection) {
            // 		this._drawVirtualLinks(lGraphCanvas, ctx);
            // 	}
            // }
            _drawVirtualLinks(lGraphCanvas, ctx) {
                if (!this.currentGetters?.length) return;

                // Determine a sensible start anchor on this node: first typed output, else slot 0
                let outIdx = 0;
                if (Array.isArray(this.outputs)) {
                    const found = this.outputs.findIndex(o => o && o.type && o.type !== '*');
                    if (found >= 0) outIdx = found;
                }
                const absStart = this.getConnectionPos(false, outIdx);
                const start_node_slotpos = [
                    absStart[0] - this.pos[0],
                    absStart[1] - this.pos[1],
                ];

                // Provide a default link object with necessary properties, to avoid errors as link can't be null anymore
                const defaultLink = { type: 'default', color: this.slotColor };

                for (const getter of this.currentGetters) {
                    // Determine a sensible end anchor on the getter: first typed input, else input 0
                    let inIdx = 0;
                    if (Array.isArray(getter.inputs)) {
                        const fin = getter.inputs.findIndex(i => i && i.type && i.type !== '*');
                        if (fin >= 0) inIdx = fin;
                    }
                    const absEnd = getter.getConnectionPos(true, inIdx);
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

app.registerExtension({
    name: "GetTwinNodes",
    // The setup() function was manually added, and is the only part of the extension that was not generated by AI,
    // but stolen directly from Kijai's code instead. Obviously I could have instructed AI to copy it for me, but I
    // forgot.
    async setup() {
        const value = 'top';
        const valuesToAddToIn = ["GetTwinNodes"];
        const valuesToAddToOut = ["SetTwinNodes"];
        // Remove entries if they exist
        for (const arr of Object.values(LiteGraph.slot_types_default_in)) {
            for (const valueToAdd of valuesToAddToIn) {
                const idx = arr.indexOf(valueToAdd);
                if (idx !== -1) {
                    arr.splice(idx, 1);
                }
            }
        }

        for (const arr of Object.values(LiteGraph.slot_types_default_out)) {
            for (const valueToAdd of valuesToAddToOut) {
                const idx = arr.indexOf(valueToAdd);
                if (idx !== -1) {
                    arr.splice(idx, 1);
                }
            }
        }
        if (value != "disabled") {
            for (const arr of Object.values(LiteGraph.slot_types_default_in)) {
                for (const valueToAdd of valuesToAddToIn) {
                    const idx = arr.indexOf(valueToAdd);
                    if (idx !== -1) {
                        arr.splice(idx, 1);
                    }
                    if (value === "top") {
                        arr.unshift(valueToAdd);
                    } else {
                        arr.push(valueToAdd);
                    }
                }
            }

            for (const arr of Object.values(LiteGraph.slot_types_default_out)) {
                for (const valueToAdd of valuesToAddToOut) {
                    const idx = arr.indexOf(valueToAdd);
                    if (idx !== -1) {
                        arr.splice(idx, 1);
                    }
                    if (value === "top") {
                        arr.unshift(valueToAdd);
                    } else {
                        arr.push(valueToAdd);
                    }
                }
            }
        }
    },
    registerCustomNodes() {
        class GetTwinNodes extends LGraphNode {

            defaultVisibility = true;
            serialize_widgets = true;
            drawConnection = false;
            slotColor = "#FFF";
            currentSetter = null;
            canvas = app.canvas;

            constructor(title) {
                super(title)
                if (!this.properties) {
                    this.properties = { constCount: 2 };
                } else if (this.properties.constCount == null) {
                    this.properties.constCount = 2;
                }
                this.properties.showOutputText = GetTwinNodes.defaultVisibility;
                const node = this;

                // Return combined constant names from SetTwinNodes and Kijai's SetNode (prefixed)
                this.getCombinedConstantNames = function() {
                    const names = [];

                    // Gather from SetTwinNodes (all widget values)
                    const setTwinNodes = GraphHelpers.getNodesByType(node.graph, 'SetTwinNodes');
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
                };

                // Ensure there are at least N combo widgets for constants, each with a values provider
                this.ensureGetterWidgetCount = function(count) {
                    const current = this.widgets?.length || 0;
                    for (let i = current; i < count; i++) {
                        const idx = i;
                        const created = this.addWidget(
                            "combo",
                            `Constant ${idx + 1}`,
                            "",
                            () => {
                                this.onRename();
                            },
                            {
                                values: () => {
                                    return this.getCombinedConstantNames();
                                }
                            }
                        );
                        // Hook the value setter to track previous value
                        wrapWidgetValueSetter(created);
                    }
                    // Normalize widget labels to Constant 1, Constant 2, ...
                    this.normalizeGetterWidgetLabels();
                };

                // Ensure the number of outputs matches count
                this.ensureOutputCount = function(count) {
                    console.log("[GetTwinNodes] ensureOutputCount");
                    const min = this.properties?.constCount || 2;
                    count = Math.max(min, count);
                    while ((this.outputs?.length || 0) < count) this.addOutput("*", "*");
                    while ((this.outputs?.length || 0) > count) this.removeOutput(this.outputs.length - 1);
                };

                // Normalize widget labels to "Constant N"
                this.normalizeGetterWidgetLabels = function() {
                    if (!Array.isArray(this.widgets)) return;
                    for (let i = 0; i < this.widgets.length; i++) {
                        if (this.widgets[i] && typeof this.widgets[i].name !== "undefined") {
                            this.widgets[i].name = `Constant ${i + 1}`;
                        }
                    }
                };

                // ~Start with one selector; expand after matching a setter~
                const initialCount = this.properties.constCount || 2;
                this.ensureGetterWidgetCount(initialCount);
                this.ensureOutputCount(initialCount);
                // Ensure default outputs exist with type "*"
                for (let i = 0; i < initialCount; i++) {
                    if (this.outputs?.[i]) {
                        this.outputs[i].name = "*";
                        this.outputs[i].type = "*";
                    }
                }

                // During deserialization, respect serialized widgets/outputs by suppressing auto-derivation for a tick
                this.onConfigure = function(_data) {
                    console.log("[GetTwinNodes] onConfigure");
                    this.__restoring = true;
                    // Clear restoration flag shortly after configuration to allow normal behavior thereafter
                    setTimeout(() => { this.__restoring = false; }, 1000);
                };

                this.onConnectionsChange = function(
                    slotType,
                    slot,
                    isChangeConnect,
                    link_info,
                    output
                ) {
                    // Respect serialized data on restore: skip auto-derive during deserialization
                    console.log("[GetTwinNodes] onConnectionsChange");
                    if (this.__restoring) { console.log("[GetTwinNodes] aborted due to __restoring state"); return; }

                    this.validateLinks();

                    // If an output is connected and the constant for that slot is unset,
                    // auto-select if there's only one known option for that index.
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
                                const targetNode = GraphHelpers.getNodeById(node.graph, link_info.target_id);
                                const inSlot = targetNode?.inputs?.[link_info.target_slot];
                                const preferred =
                                    (inSlot?.label && String(inSlot.label).trim()) ||
                                    (inSlot?.name && String(inSlot.name).trim()) ||
                                    (inSlot?.type && String(inSlot.type).trim()) ||
                                    "";
                                if (preferred) {
                                    // If the derived name is not present in any known constants, append '*'
                                    let knownNames = this.getCombinedConstantNames()
                                            .filter(n => n && n !== "(unset)");
                                    const known = new Set(knownNames);
                                    const needsUnlinked = !known.has(preferred);
                                    this.widgets[0].value = needsUnlinked ? makeUnlinkedName(preferred) : preferred;
                                }
                            }
                        }

                        const idx = slot;
                        const val = this.widgets?.[idx]?.value;
                        const allSetters = GraphHelpers.getNodesByType(node.graph, 'SetTwinNodes');
                        const options = Array.from(new Set(
                            allSetters.map(s => s.widgets?.[idx]?.value).filter(Boolean)
                        ));
                        if ((!val || val === '*') && options.length === 1) {
                            if (this.widgets?.[idx]) this.widgets[idx].value = options[0];
                        }

                        // Attempt to auto-pair remaining constants from a matched setter
                        const matched = findSetter(node);
                        if (matched) {
                            const needed = matched.widgets?.length || 0;
                            const min = this.properties?.constCount || 2;
                            this.ensureGetterWidgetCount(Math.max(min, needed));
                            for (let i = 0; i < needed; i++) {
                                if (!this.widgets?.[i]?.value && matched.widgets?.[i]?.value) {
                                    this.widgets[i].value = matched.widgets[i].value;
                                }
                            }
                        }
                        this.onRename();
                    }

                    // Also refresh on output disconnects to update color/title when links are removed
                    if (slotType === LiteGraph.OUTPUT && !isChangeConnect) {
                        this.onRename();
                    }
                }

                // Backward-compatible single-name setter
                this.setName = function(name) {
                    console.log("[GetTwinNodes] setName should not have been called");
                    if (this.widgets?.[0]) {
                        this.widgets[0].value = name;
                    }
                    node.onRename();
                    node.serialize();
                }

                // New names setter (array-based) for arbitrary number of names
                this.setNamesArray = function(names) {
                    const min = this.properties?.constCount || 2;
                    const targetCount = Math.max(min, Array.isArray(names) ? names.length : 0);
                    this.ensureGetterWidgetCount(targetCount);
                    const count = Array.isArray(names) ? names.length : 0;
                    for (let i = 0; i < count; i++) {
                        if (node.widgets?.[i]) {
                            node.widgets[i].value = names[i];
                        }
                    }
                    node.onRename();
                    node.serialize();
                }
                // Backward-compatible two-name setter
                this.setNames = function(nameA, nameB) {
                    this.setNamesArray([nameA, nameB]);
                }


                /* During a reload:
                    [GetTwinNodes] onConnectionsChange
                    [GetTwinNodes] onRename
                    [GetTwinNodes] ensureOutputCount
                    [GetTwinNodes] onConfigure
                 */
                this.onRename = function() {
                    // Respect serialized data on restore: skip auto-derive during deserialization
                    console.log("[GetTwinNodes] onRename");
                    if (this.__restoring) { console.log("[GetTwinNodes] aborted due to __restoring state"); return; }

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
                                        const link = GraphHelpers.getLink(node.graph, linkId);
                                        if (link) GraphHelpers.removeLink(node.graph, linkId);
                                    }
                                }
                                // Clear to empty string immediately and refresh UI
                                this.widgets[i].value = '';
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
                                    const link = GraphHelpers.getLink(node.graph, linkId);
                                    if (link) GraphHelpers.removeLink(node.graph, linkId);
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
                        this.ensureOutputCount(this.widgets?.length || 0);
                    }

                    const setter = findSetter(node);
                    // Gather current selections
                    const selected = (this.widgets || []).map(w => (w?.value ? String(w.value).trim() : ""));
                    const anySelected = selected.some(v => !!v);

                    if (setter) {
                        const setterNames = (setter.widgets || []).map(w => (w?.value ? String(w.value).trim() : ""));
                        // Map selected constant -> type (from matched setter input at that label)
                        const typeByConst = {};
                        setterNames.forEach((name, idx) => {
                            const t = setter.inputs?.[idx]?.type || '*';
                            if (name) typeByConst[name] = t;
                        });

                        // Ensure enough widgets and outputs
                        const wNeeded = setter.widgets?.length || 0;
                        this.ensureGetterWidgetCount(wNeeded || 2);
                        this.ensureOutputCount(this.widgets?.length || 0);

                        // Autofill any empty selections from the matched setter (position-agnostic)
                        // Only perform this when we didn't just unset a widget via "(unset)".
                        if (!didUnset) {
                            const setterVals = (setter.widgets || []).map(w => (w?.value ? String(w.value).trim() : "")).filter(Boolean);
                            const selectedVals = new Set(
                                (this.widgets || []).map(w => (w?.value ? String(w.value).trim() : "")).filter(Boolean)
                            );
                            for (let i = 0; i < wNeeded; i++) {
                                if (this.widgets?.[i] && (!this.widgets[i].value || this.widgets[i].value === '*')) {
                                    const next = setterVals.find(v => !selectedVals.has(v));
                                    if (next) {
                                        this.widgets[i].value = next;
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
                            const valList = (this.widgets || []).map(w => (w?.value ? String(w.value).trim() : "")).filter(Boolean);
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
                            const label = this.widgets?.[i]?.value ? String(this.widgets[i].value).trim() : "";
                            const t = label ? (typeByConst[label] || '*') : '*';

                            // Ensure output slot exists
                            if (i >= (this.outputs?.length || 0)) this.ensureOutputCount(i + 1);

                            if (this.outputs?.[i]) {
                                this.outputs[i].name = label || '*';
                                this.outputs[i].label = label || '*';
                                this.outputs[i].type = t;
                            }
                            if (!pickedType && label && t && t !== '*') {
                                pickedType = t;
                            }
                        }

                        // Note: we don't actually have a settings panel yet
                        // Only colorize when a constant is selected; follow same rule as SetTwinNodes (based on constant type)
                        const autoColor = app.ui.settings.getSettingValue("KJNodes.nodeAutoColor");
                        if (anySelected && pickedType && autoColor) {
                            setColorAndBgColor.call(this, pickedType);
                        } else {
                            // reset to default look if no selection, unknown type, or auto-color disabled
                            this.color = undefined;
                            this.bgcolor = undefined;
                        }
                    } else {
                        // No matching setter: if exactly one constant is selected, ensure we have a second empty widget
                        const selectedVals = (this.widgets || [])
                            .map(w => (w?.value ? String(w.value).trim() : ""))
                            .filter(Boolean);
                        const min = this.properties?.constCount || 2;
                        if (selectedVals.length === 1 && (this.widgets?.length || 0) < min) {
                            this.ensureGetterWidgetCount(min); // adds empty widgets up to min
                        }

                        // Outputs mirror current selections with '*' type for empties
                        const count = this.widgets?.length || 1;
                        this.ensureOutputCount(count);
                        for (let i = 0; i < count; i++) {
                            const label = this.widgets?.[i]?.value ? String(this.widgets[i].value).trim() : "";
                            if (this.outputs?.[i]) {
                                this.outputs[i].name = label || '*';
                                this.outputs[i].label = label || '*';
                                this.outputs[i].type = '*';
                            }
                        }

                        // No selection or unknown type: reset color
                        this.color = undefined;
                        this.bgcolor = undefined;
                    }

                    // Build title from selected widget values once, outside the if/else
                    const namesForTitle = extractWidgetNames(this);
                    this.title = computeTwinNodeTitle(namesForTitle, "Get", disablePrefix);

                    // Finally, validate existing links against updated types
                    this.validateLinks();
                }

                this.clone = function () {
                    const cloned = GetTwinNodes.prototype.clone.apply(this);
                    cloned.size = cloned.computeSize();
                    return cloned;
                };

                this.validateLinks = function() {
                    // Validate both outputs
                    for (let i = 0; i < this.outputs.length; i++) {
                        if (this.outputs[i].type !== '*' && this.outputs[i].links) {
                            this.outputs[i].links.filter(linkId => {
                                const link = GraphHelpers.getLink(node.graph, linkId);
                                return link && (!link.type.split(",").includes(this.outputs[i].type) && link.type !== '*');
                            }).forEach(linkId => {
                                console.log("[GetTwinNodes] Removing invalid link", linkId);
                                GraphHelpers.removeLink(node.graph, linkId);
                            });
                        }
                    }
                };

                // Return the previous name recorded for the widget at index 'idx'
                this.getPreviousName = function(idx) {
                    const w = this.widgets && this.widgets[idx];
                    if (!w) return undefined;
                    if (typeof w.getPreviousName === 'function') return w.getPreviousName();
                    return w["#previous"];
                };

                // Listen for broadcast rename events and update matching widget values
                this.onAction = function(action, param) {
                    if (action !== "setnodeNameChange" || !param) return;
                    const prev = (param.prev != null) ? String(param.prev).trim() : "";
                    const next = (param.next != null) ? String(param.next).trim() : "";
                    if (!prev || !next || prev === next) return;

                    let changed = false;
                    if (Array.isArray(this.widgets)) {
                        for (let i = 0; i < this.widgets.length; i++) {
                            const val = this.widgets[i]?.value != null ? String(this.widgets[i].value).trim() : "";
                            if (val && val === prev) {
                                this.widgets[i].value = next;
                                changed = true;
                            }
                        }
                    }
                    if (changed) {
                        if (typeof this.onRename === "function") this.onRename();
                        if (app?.canvas?.setDirty) app.canvas.setDirty(true, true);
                    }
                };

                // Support arbitrary number of types
                this.setTypesArray = function(typesArr) {
                    const min = this.properties?.constCount || 2;
                    const targetCount = Math.max(min, Array.isArray(typesArr) ? typesArr.length : 0);
                    this.ensureOutputCount(targetCount);
                    for (let i = 0; i < targetCount; i++) {
                        const t = (typesArr && typesArr[i]) ? typesArr[i] : '*';
                        if (this.outputs?.[i]) {
                            this.outputs[i].name = t;
                            this.outputs[i].type = t;
                        }
                    }
                    this.validateLinks();
                }

                // Backward-compatible two-slot setter delegates to array-based version
                this.setTypes = function(typeA, typeB) {
                    this.setTypesArray([typeA, typeB]);
                }

                // TODO: Check - legacy single-output setter kept for compatibility with callers that expect setType
                this.setType = function(type) {
                    this.ensureOutputCount(1);
                    if (this.outputs[0]) {
                        this.outputs[0].name = type;
                        this.outputs[0].type = type;
                    }
                    this.validateLinks();
                }

                this.goToSetter = function() {
                    const setter = findSetter(this);
                    if (setter) {
                        this.canvas.centerOnNode(setter);
                        this.canvas.selectNode(setter, false);
                    }
                };

                // This node is purely frontend and does not impact the resulting prompt so should not be serialized
                this.isVirtualNode = true;
            }

            // TODO: This function doesn't work for shit on the second widget, because findSetter isn't that smart
            getInputLink(slot) {
                const setter = findSetter(this, this.widgets[slot].value);

                if (setter) {
                    const slotInfo = setter.inputs[slot];
                    const link = GraphHelpers.getLink(this.graph, slotInfo.link);
                    return link;
                } else {
                    const errorMessage = "No SetTwinNodes found for " + this.widgets[0].value + "(" + this.type + ")";
                    showAlert(errorMessage);
                    //throw new Error(errorMessage);
                }
            }
            onAdded(graph) {
                if (Array.isArray(this.widgets)) {
                    for (let i = 0; i < this.widgets.length; i++) {
                        try { wrapWidgetValueSetter(this.widgets[i]); } catch (_e) {}
                    }
                }
            }

            getExtraMenuOptions(_, options) {
                const node = this;
                let menuEntry = node.drawConnection ? "Hide connections" : "Show connections";

                options.unshift(
                    {
                        content: "Go to setter",
                        callback: () => {
                            node.goToSetter();
                        },
                    },
                    {
                        content: menuEntry,
                        callback: () => {
                            node.currentSetter = findSetter(node);
                            console.log("[GetTwinNodes] context menu, found setters", node.currentSetter);
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
                if (Array.isArray(this.currentSetter.inputs)) {
                    const fin = this.currentSetter.inputs.findIndex(i => i && i.type && i.type !== '*');
                    if (fin >= 0) inIdx = fin;
                }
                const absStart = this.currentSetter.getConnectionPos(false, inIdx);
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
