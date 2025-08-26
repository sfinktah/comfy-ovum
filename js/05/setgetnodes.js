import { app } from "../../../scripts/app.js";
import { GraphHelpers } from "../common/graphHelpersForTwinNodes.js";

// mostly written by GPT-5
// based on KJ's SetGet: https://github.com/kj-comfy/ComfyUI-extensions which was
// based on diffus3's SetGet: https://github.com/diffus3/ComfyUI-extensions

function setColorAndBgColor(type) {
    const colorMap = {
        "MODEL": LGraphCanvas.node_colors.blue,
        "LATENT": LGraphCanvas.node_colors.purple,
        "VAE": LGraphCanvas.node_colors.red,
        "CONDITIONING": LGraphCanvas.node_colors.brown,
        "IMAGE": LGraphCanvas.node_colors.pale_blue,
        "CLIP": LGraphCanvas.node_colors.yellow,
        "FLOAT": LGraphCanvas.node_colors.green,
        "MASK": { color: "#1c5715", bgcolor: "#1f401b"},
        "INT": { color: "#1b4669", bgcolor: "#29699c"},
        "CONTROL_NET": { color: "#156653", bgcolor: "#1c453b"},
        "NOISE": { color: "#2e2e2e", bgcolor: "#242121"},
        "GUIDER": { color: "#3c7878", bgcolor: "#1c453b"},
        "SAMPLER": { color: "#614a4a", bgcolor: "#3b2c2c"},
        "SIGMAS": { color: "#485248", bgcolor: "#272e27"},

    };

    const colors = colorMap[type];
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
    return `${base}*`;
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
                        previousName: "",
                        constCount: 2,
                    };
                }
                this.properties.showOutputText = SetTwinNodes.defaultVisibility;

                const node = this;

                // Helper to compute and set the combined title from connected widgets' values,
                // and update node color from the first connected typed link
                this.updateTitle = function () {
                    const parts = [];
                    const widgetCount = (this.widgets?.length || 0);
                    for (let i = 0; i < widgetCount; i++) {
                        const connected = this.inputs?.[i]?.link != null;
                        if (!connected) continue;
                        const raw = this.widgets?.[i]?.value;
                        const val = (raw && String(raw).trim())
                            ? String(raw).trim()
                            : (i === 0 ? "Itchy" : i === 1 ? "Scratchy" : `Constant ${i + 1}`);
                        parts.push(val);
                    }
                    const joined = parts.join(" & ");
                    if (parts.length === 0) {
                        this.title = "SetTwinNodes";
                    } else {
                        this.title = (!disablePrefix ? "Set_" : "") + joined;
                    }

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
                    if (pickedType && app.ui.settings.getSettingValue("KJNodes.nodeAutoColor")) {
                        setColorAndBgColor.call(this, pickedType);
                    }
                    if (!pickedType) {
                        // reset to default look if nothing connected
                        this.color = undefined;
                        this.bgcolor = undefined;
                    }
                };

                // Ensure there are N inputs and outputs matching widget count
                this.ensureSlotCount = function(count) {
                    // grow inputs/outputs
                    while ((this.inputs?.length || 0) < count) this.addInput("*", "*");
                    while ((this.outputs?.length || 0) < count) this.addOutput("*", "*");
                    // shrink inputs/outputs if needed
                    while ((this.inputs?.length || 0) > count) this.removeInput(this.inputs.length - 1);
                    while ((this.outputs?.length || 0) > count) this.removeOutput(this.outputs.length - 1);
                };

                // Get a human-friendly label from the connected output: prefer label, then name, then type
                this.getPreferredSlotLabel = function(fromNode, originSlotIndex) {
                    const srcSlot = fromNode?.outputs?.[originSlotIndex];
                    const lbl = srcSlot?.label || srcSlot?.name || srcSlot?.type;
                    return (lbl && String(lbl).trim()) || "";
                };

                // Normalize labels without adding numbers; keep duplicates as-is.
                // Sync outputs to inputs and fill empty widget values from labels.
                this.applyDuplicateNumbering = function() {
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

                        // Sync outputs to inputs verbatim
                        if (this.outputs?.[i]) {
                            this.outputs[i].name = base;
                            this.outputs[i].label = base;
                        }

                        // Only fill widget value if empty or '*'
                        if (this.widgets?.[i] && (!this.widgets[i].value || this.widgets[i].value === '*')) {
                            this.widgets[i].value = base;
                            // Keep uniqueness enforcement for widget values if defined
                            if (typeof this.validateWidgetName === "function") {
                                this.validateWidgetName(this.graph, i);
                            }
                        }
                    }
                };

                // Create an arbitrary number of constants/links
                const initialCount = this.properties.constCount || 2;
                for (let i = 0; i < initialCount; i++) {
                    const idx = i;
                    this.addWidget(
                        "text",
                        `Constant ${idx + 1}`,
                        '',
                        () => {
                            // Ensure unique name for this specific widget index
                            if (typeof node.validateWidgetName === "function") {
                                node.validateWidgetName(node.graph, idx);
                            }
                            // TODO: Check - only the first widget's value is tracked as previousName (primary constant)
                            if (idx === 0) {
                                // TODO
                                this.properties.previousName = this.widgets[0].value;
                            }
                            this.updateTitle();
                            this.update();
                        },
                        {}
                    );
                }
                this.ensureSlotCount(initialCount);
                this.updateTitle();

                this.onConnectionsChange = function(
                    slotType,	//1 = input, 2 = output
                    slot,
                    isChangeConnect,
                    link_info,
                    output
                ) {
                    const propagateToGetters = () => {
                        const types = (this.inputs || []).map(inp => inp?.type || '*');
                        const getters = this.findGetters(this.graph);
                        getters.forEach(getter => {
                            if (getter.setTypesArray) {
                                getter.setTypesArray(types);
                            } else if (getter.setTypes) {
                                getter.setTypes(types[0] || '*', types[1] || '*');
                            }
                        });
                    };

                    const mirrorOutputFromInput = (s) => {
                        if (this.inputs && this.outputs && this.inputs[s] && this.outputs[s]) {
                            this.outputs[s].type = this.inputs[s].type || '*';
                            this.outputs[s].name = this.inputs[s].name || '*';
                            this.outputs[s].label = this.inputs[s].label || this.inputs[s].name || '*';
                        }
                    };

                    // Input disconnected
                    if (slotType === LiteGraph.INPUT && !isChangeConnect) {
                        if (this.inputs?.[slot]) {
                            this.inputs[slot].type = '*';
                            this.inputs[slot].name = '*';
                            this.inputs[slot].label = '*';
                        }
                        if (this.outputs?.[slot]) {
                            this.outputs[slot].type = '*';
                            this.outputs[slot].name = '*';
                        }
                        if (this.widgets?.[slot]) {
                            this.widgets[slot].value = '';
                        }
                        // Re-number duplicates among remaining connected inputs
                        if (typeof this.applyDuplicateNumbering === "function") {
                            this.applyDuplicateNumbering();
                        }
                        this.updateTitle();
                        propagateToGetters();
                        this.update();
                        return;
                    }

                    // Output disconnected
                    if (slotType === LiteGraph.OUTPUT && !isChangeConnect) {
                        if (this.outputs?.[slot]) {
                            this.outputs[slot].type = '*';
                            this.outputs[slot].name = '*';
                        }
                        this.updateTitle();
                        this.update();
                        return;
                    }

                    // Input connected
                    if (link_info && this.graph && slotType === LiteGraph.INPUT && isChangeConnect) {
                        const fromNode = GraphHelpers.getNodeById(this.graph, link_info.origin_id);
                        if (fromNode?.outputs?.[link_info.origin_slot]) {
                            const srcSlot = fromNode.outputs[link_info.origin_slot];
                            const type = srcSlot.type;
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
                            this.inputs[slot].type = type || '*';
                            this.inputs[slot].name = preferred;
                            this.inputs[slot].label = preferred;

                            // Auto-name the corresponding widget for this slot if empty or '*'
                            if (this.widgets?.[slot] && (!this.widgets[slot].value || this.widgets[slot].value === '*')) {
                                this.widgets[slot].value = preferred;
                                // Enforce graph-wide uniqueness for this widget index
                                if (typeof this.validateWidgetName === "function") {
                                    this.validateWidgetName(this.graph, slot);
                                }
                            }

                            // Mirror type/name to the corresponding output
                            mirrorOutputFromInput(slot);

                            // Normalize duplicates among all connected inputs
                            if (typeof this.applyDuplicateNumbering === "function") {
                                this.applyDuplicateNumbering();
                            }

                            // Update title/color and propagate
                            this.updateTitle();
                            propagateToGetters();

                            // Note: we don't actually have a settings panel yet
                            if (app.ui.settings.getSettingValue("KJNodes.nodeAutoColor")) {
                                const firstTyped = (this.inputs || []).find(i => i?.type && i.type !== '*');
                                if (firstTyped) setColorAndBgColor.call(this, firstTyped.type);
                            }
                        } else {
                            showAlert("node input undefined.");
                        }
                        this.update();
                        return;
                    }

                    // Output connected
                    if (link_info && this.graph && slotType === LiteGraph.OUTPUT && isChangeConnect) {
                        mirrorOutputFromInput(slot);
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
                    cloned.properties.previousName = '';
                    cloned.size = cloned.computeSize();
                    return cloned;
                };

                this.onAdded = function(graph) {
                    if (typeof this.validateWidgetName === "function" && Array.isArray(this.widgets)) {
                        for (let i = 0; i < this.widgets.length; i++) {
                            this.validateWidgetName(graph, i);
                        }
                    }
                }

                this.update = function() {
                    if (!node.graph) {
                        return;
                    }

                    const getters = this.findGetters(node.graph);
                    const types = (this.inputs || []).map(inp => inp?.type || '*');
                    getters.forEach(getter => {
                        if (getter.setTypesArray) {
                            getter.setTypesArray(types);
                        } else if (getter.setTypes) {
                            getter.setTypes(types[0] || '*', types[1] || '*');
                        }
                    });

                    // TODO: Check - propagation keyed only to widgets[0] (primary constant naming)
                    if (this.widgets[0].value) {
                        // TODO
                        const gettersWithPreviousName = this.findGetters(node.graph, true);
                        gettersWithPreviousName.forEach(getter => {
                            getter.setName(this.widgets[0].value);
                        });
                    }

                    const allGetters = GraphHelpers.getNodesByType(node.graph, "GetTwinNodes");
                    allGetters.forEach(otherNode => {
                        if (otherNode.setComboValues) {
                            otherNode.setComboValues();
                        }
                    });
                }

                // TODO: Check - matching GetTwinNodes by widgets[0] only (primary-key semantics)
                this.findGetters = function(graph, checkForPreviousName) {
                    // TODO
                    const name = checkForPreviousName ? this.properties.previousName : this.widgets[0].value;
                    return GraphHelpers.getAllNodes(graph).filter(otherNode => otherNode.type === 'GetTwinNodes' && otherNode.widgets[0].value === name && name !== '');
                }

                // This node is purely frontend and does not impact the resulting prompt so should not be serialized
                this.isVirtualNode = true;
            }


            onRemoved() {
                const allGetters = GraphHelpers.getNodesByType(this.graph, "GetTwinNodes");
                allGetters.forEach((otherNode) => {
                    if (otherNode.setComboValues) {
                        otherNode.setComboValues([this]);
                    }
                })
            }
            getExtraMenuOptions(_, options) {
                // TODO: -
                //     - Uses this.currentGetters[0].outputs[0].type to derive a color for the “Show connections” highlight.
                //     - Rationale: sampling the first getter’s first output only. Probably fine for a quick color, but could be generalized to first connected/typed output
                this.menuEntry = this.drawConnection ? "Hide connections" : "Show connections";
                options.unshift(
                    {
                        content: this.menuEntry,
                        callback: () => {
                            this.currentGetters = this.findGetters(this.graph);
                            if (this.currentGetters.length == 0) return;
                            // Generalize: pick first connected, typed output across all getters
                            let linkType = '*';
                            for (const g of this.currentGetters) {
                                const found = (g.outputs || []).find(o => o && o.type && o.type !== '*');
                                if (found) { linkType = found.type; break; }
                            }
                            this.slotColor = this.canvas.default_connection_color_byType[linkType]
                            this.menuEntry = this.drawConnection ? "Hide connections" : "Show connections";
                            this.drawConnection = !this.drawConnection;
                            this.canvas.setDirty(true, true);

                        },
                        has_submenu: true,
                        submenu: {
                            title: "Color",
                            options: [
                                {
                                    content: "Highlight",
                                    callback: () => {
                                        this.slotColor = "orange"
                                        this.canvas.setDirty(true, true);
                                    }
                                }
                            ],
                        },
                    },
                    {
                        content: "Hide all connections",
                        callback: () => {
                            const allGetters = GraphHelpers.getAllNodes(this.graph).filter(otherNode => otherNode.type === "GetTwinNodes" || otherNode.type === "SetTwinNodes");
                            allGetters.forEach(otherNode => {
                                otherNode.drawConnection = false;
                                console.log(otherNode);
                            });

                            this.menuEntry = "Show connections";
                            this.drawConnection = false
                            this.canvas.setDirty(true, true);

                        },

                    },
                );
                // Dynamically add a submenu for all getters
                this.currentGetters = this.findGetters(this.graph);
                if (this.currentGetters) {

                    let gettersSubmenu = this.currentGetters.map(getter => ({

                        content: `${getter.title} id: ${getter.id}`,
                        callback: () => {
                            this.canvas.centerOnNode(getter);
                            this.canvas.selectNode(getter, false);
                            this.canvas.setDirty(true, true);

                        },
                    }));

                    options.unshift({
                        content: "Getters",
                        has_submenu: true,
                        submenu: {
                            title: "GetNodes",
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
                        this.addWidget(
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
                    }
                    // Normalize widget labels to Constant 1, Constant 2, ...
                    if (typeof this.normalizeGetterWidgetLabels === "function") {
                        this.normalizeGetterWidgetLabels();
                    }
                };

                // Ensure the number of outputs matches count
                this.ensureOutputCount = function(count) {
                    console.log("[Timer]");
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
                    console.log("[Timer] onConfigure");
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
                    console.log("[Timer] onConnectionsChange");
                    if (this.__restoring) return;

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
                                    let knownNames = [];
                                    if (typeof this.getCombinedConstantNames === "function") {
                                        knownNames = this.getCombinedConstantNames()
                                            .filter(n => n && n !== "(unset)");
                                    }
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
                        const matched = this.findSetter(node.graph);
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
                    node.widgets[0].value = name;
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

                this.onRename = function() {
                    // Respect serialized data on restore: skip auto-derive during deserialization
                    console.log("[Timer] onRename");
                    if (this.__restoring) return;

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
                            if (typeof this.removeOutput === "function") {
                                this.removeOutput(removeIdx);
                            }
                            if (Array.isArray(this.widgets)) {
                                this.widgets.splice(removeIdx, 1);
                            }
                            // Recompute node size after removal
                            this.size = this.computeSize();
                        }

                        // Always normalize labels after unset/removal
                        if (typeof this.normalizeGetterWidgetLabels === "function") {
                            this.normalizeGetterWidgetLabels();
                        }
                        // Keep outputs count aligned to widgets after any removals
                        this.ensureOutputCount(this.widgets?.length || 0);
                    }

                    const setter = this.findSetter(node.graph);
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
                        if (typeof this.normalizeGetterWidgetLabels === "function") {
                            this.normalizeGetterWidgetLabels();
                        }

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

                        // Build title from selected widget values; fallback to Itchy/Scratchy/Constant n
                        const parts = [];
                        const wCount = this.widgets?.length || 0;
                        for (let i = 0; i < wCount; i++) {
                            const raw = this.widgets?.[i]?.value;
                            if (!raw) continue;
                            const name = String(raw).trim();
                            if (name) parts.push(name);
                        }
                        const joined = parts.join(" & ");
                        if (parts.length === 0) {
                            this.title = "GetTwinNodes";
                        } else {
                            this.title = (!disablePrefix ? "Get_" : "") + joined;
                        }

                        // Note: we don't actually have a settings panel yet
                        // Only colorize when a constant is selected; follow same rule as SetTwinNodes (based on constant type)
                        if (anySelected && pickedType && app.ui.settings.getSettingValue("KJNodes.nodeAutoColor")) {
                            setColorAndBgColor.call(this, pickedType);
                        } else if (!anySelected) {
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
                        const parts = [];
                        const wCount = this.widgets?.length || 0;
                        for (let i = 0; i < wCount; i++) {
                            const raw = this.widgets?.[i]?.value;
                            if (!raw) continue;
                            const name = String(raw).trim();
                            if (name) parts.push(name);
                        }
                        const joined = parts.join(" & ");
                        if (parts.length === 0) {
                            this.title = "GetTwinNodes";
                        } else {
                            this.title = (!disablePrefix ? "Get_" : "") + joined;
                        }

                        // No selection or unknown type: reset color
                        this.color = undefined;
                        this.bgcolor = undefined;
                    }

                    // Finally, validate existing links against updated types
                    if (typeof this.validateLinks === "function") this.validateLinks();
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
                                console.log("[Timer] Removing invalid link", linkId);
                                GraphHelpers.removeLink(node.graph, linkId);
                            });
                        }
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

                this.findSetter = function(graph) {
                    const chosen = (this.widgets || []).map(w => w?.value).map(v => (v ? String(v).trim() : "")).filter(v => !!v);
                    const setters = GraphHelpers.getNodesByType(graph, 'SetTwinNodes');
                    if (chosen.length === 0) return null;

                    // Match any setter that contains all chosen constants, regardless of position
                    let found = setters.find(s => {
                        const sw = (s.widgets || []).map(w => (w?.value ? String(w.value).trim() : ""));
                        return chosen.every(v => sw.includes(v));
                    });

                    // TODO: Check - fallback prioritizes the first chosen constant
                    // Fallback: match any setter that contains at least the first chosen value
                    if (!found && chosen[0]) {
                        found = setters.find(s => (s.widgets || []).some(w => String(w?.value || "").trim() === chosen[0]));
                    }
                    return found || null;
                };

                this.goToSetter = function() {
                    const setter = this.findSetter(this.graph);
                    if (setter) {
                        this.canvas.centerOnNode(setter);
                        this.canvas.selectNode(setter, false);
                    }
                };

                // This node is purely frontend and does not impact the resulting prompt so should not be serialized
                this.isVirtualNode = true;
            }

            getInputLink(slot) {
                const setter = this.findSetter(this.graph);

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
            }
            getExtraMenuOptions(_, options) {
                let menuEntry = this.drawConnection ? "Hide connections" : "Show connections";

                options.unshift(
                    {
                        content: "Go to setter",
                        callback: () => {
                            this.goToSetter();
                        },
                    },
                    {
                        content: menuEntry,
                        callback: () => {
                            this.currentSetter = this.findSetter(this.graph);
                            if (!this.currentSetter) return;
                            // Generalize: pick first typed input on setter
                            let linkType = '*';
                            if (Array.isArray(this.currentSetter.inputs)) {
                                const fin = this.currentSetter.inputs.find(i => i && i.type && i.type !== '*');
                                if (fin) linkType = fin.type;
                            }
                            this.drawConnection = !this.drawConnection;
                            this.slotColor = this.canvas.default_connection_color_byType[linkType]
                            menuEntry = this.drawConnection ? "Hide connections" : "Show connections";
                            this.canvas.setDirty(true, true);
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
