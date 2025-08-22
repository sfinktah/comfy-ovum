import { app } from "../../../scripts/app.js";

// mostly written by GPT-5
// based on KJ's SetGet: https://github.com/kj-comfy/ComfyUI-extensions which was
// based on diffus3's SetGet: https://github.com/diffus3/ComfyUI-extensions


// Nodes that allow you to tunnel connections for cleaner graphs
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
                    this.title = (!disablePrefix ? "Set_" : "") + (joined || "Itchy & Scratchy");

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
                            if (idx === 0) {
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
                    if (slotType === 1 && !isChangeConnect) {
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
                    if (slotType === 2 && !isChangeConnect) {
                        if (this.outputs?.[slot]) {
                            this.outputs[slot].type = '*';
                            this.outputs[slot].name = '*';
                        }
                        this.updateTitle();
                        this.update();
                        return;
                    }

                    // Input connected
                    if (link_info && this.graph && slotType === 1 && isChangeConnect) {
                        const fromNode = this.graph._nodes.find((otherNode) => otherNode.id == link_info.origin_id);
                        if (fromNode?.outputs?.[link_info.origin_slot]) {
                            const srcSlot = fromNode.outputs[link_info.origin_slot];
                            const type = srcSlot.type;
                            const preferred = this.getPreferredSlotLabel(fromNode, link_info.origin_slot) || type || '*';

                            // Always reflect the connected label on the input
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
                    if (link_info && this.graph && slotType === 2 && isChangeConnect) {
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
                    if (typeof this.validateWidgetName === "function") {
                        this.validateWidgetName(graph, 0);
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

                    if (this.widgets[0].value) {
                        const gettersWithPreviousName = this.findGetters(node.graph, true);
                        gettersWithPreviousName.forEach(getter => {
                            getter.setName(this.widgets[0].value);
                        });
                    }

                    const allGetters = node.graph._nodes.filter(otherNode => otherNode.type === "GetTwinNodes");
                    allGetters.forEach(otherNode => {
                        if (otherNode.setComboValues) {
                            otherNode.setComboValues();
                        }
                    });
                }

                this.findGetters = function(graph, checkForPreviousName) {
                    const name = checkForPreviousName ? this.properties.previousName : this.widgets[0].value;
                    return graph._nodes.filter(otherNode => otherNode.type === 'GetTwinNodes' && otherNode.widgets[0].value === name && name !== '');
                }

                // This node is purely frontend and does not impact the resulting prompt so should not be serialized
                this.isVirtualNode = true;
            }


            onRemoved() {
                const allGetters = this.graph._nodes.filter((otherNode) => otherNode.type == "GetTwinNodes");
                allGetters.forEach((otherNode) => {
                    if (otherNode.setComboValues) {
                        otherNode.setComboValues([this]);
                    }
                })
            }
            getExtraMenuOptions(_, options) {
                this.menuEntry = this.drawConnection ? "Hide connections" : "Show connections";
                options.unshift(
                    {
                        content: this.menuEntry,
                        callback: () => {
                            this.currentGetters = this.findGetters(this.graph);
                            if (this.currentGetters.length == 0) return;
                            let linkType = (this.currentGetters[0].outputs[0].type);
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
                            const allGetters = this.graph._nodes.filter(otherNode => otherNode.type === "GetTwinNodes" || otherNode.type === "SetTwinNodes");
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
                var title = this.getTitle ? this.getTitle() : this.title;
                var title_width = ctx.measureText(title).width;
                if (!this.flags.collapsed) {
                    var start_node_slotpos = [
                        this.size[0],
                        LiteGraph.NODE_TITLE_HEIGHT * 0.5,
                    ];
                }
                else {

                    var start_node_slotpos = [
                        title_width + 55,
                        -15,

                    ];
                }
                // Provide a default link object with necessary properties, to avoid errors as link can't be null anymore
                const defaultLink = { type: 'default', color: this.slotColor };

                for (const getter of this.currentGetters) {
                    if (!this.flags.collapsed) {
                        var end_node_slotpos = this.getConnectionPos(false, 0);
                        end_node_slotpos = [
                            getter.pos[0] - end_node_slotpos[0] + this.size[0],
                            getter.pos[1] - end_node_slotpos[1]
                        ];
                    }
                    else {
                        var end_node_slotpos = this.getConnectionPos(false, 0);
                        end_node_slotpos = [
                            getter.pos[0] - end_node_slotpos[0] + title_width + 50,
                            getter.pos[1] - end_node_slotpos[1] - 30
                        ];
                    }
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
                    this.properties = {};
                }
                this.properties.showOutputText = GetTwinNodes.defaultVisibility;
                const node = this;

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
                                    const setterNodes = node.graph?._nodes?.filter((n) => n.type === 'SetTwinNodes') || [];
                                    // Collect ALL constants from ALL positions across all setters
                                    const names = [];
                                    for (const s of setterNodes) {
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
                            }
                        );
                    }
                };

                // Ensure the number of outputs matches count
                this.ensureOutputCount = function(count) {
                    while ((this.outputs?.length || 0) < count) this.addOutput("*", "*");
                    while ((this.outputs?.length || 0) > count) this.removeOutput(this.outputs.length - 1);
                };

                // Start with one selector; expand after matching a setter
                this.ensureGetterWidgetCount(1);
                this.ensureOutputCount(1);
                // Ensure the first output exists with label and type "*"
                if (this.outputs?.[0]) {
                    this.outputs[0].name = "*";
                    // superfluous
                    // this.outputs[0].label = "*";
                    this.outputs[0].type = "*";
                }

                this.onConnectionsChange = function(
                    slotType,	//0 = output, 1 = input
                    slot,	//self-explanatory
                    isChangeConnect,
                    link_info,
                    output
                ) {
                    this.validateLinks();

                    // If an output is connected and the constant for that slot is unset,
                    // auto-select if there's only one known option for that index.
                    if (slotType === 0 && isChangeConnect) {
                        const idx = slot;
                        const val = this.widgets?.[idx]?.value;
                        const allSetters = node.graph?._nodes?.filter(n => n.type === 'SetTwinNodes') || [];
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
                            this.ensureGetterWidgetCount(needed);
                            for (let i = 0; i < needed; i++) {
                                if (!this.widgets?.[i]?.value && matched.widgets?.[i]?.value) {
                                    this.widgets[i].value = matched.widgets[i].value;
                                }
                            }
                        }
                        this.onRename();
                    }

                    // Also refresh on output disconnects to update color/title when links are removed
                    if (slotType === 0 && !isChangeConnect) {
                        this.onRename();
                    }
                }

                // Backward-compatible single-name setter
                this.setName = function(name) {
                    node.widgets[0].value = name;
                    node.onRename();
                    node.serialize();
                }

                // New two-name setter
                this.setNames = function(nameA, nameB) {
                    node.widgets[0].value = nameA;
                    if (node.widgets[1]) {
                        node.widgets[1].value = nameB;
                    }
                    node.onRename();
                    node.serialize();
                }

                this.onRename = function() {
                    // Support "(unset)" option: clear widget value and possibly remove the first extra unset widget and its output
                    const RESET_LABEL = "(unset)";
                    let didUnset = false;
                    if (Array.isArray(this.widgets)) {
                        for (let i = 0; i < this.widgets.length; i++) {
                            if (this.widgets[i] && this.widgets[i].value === RESET_LABEL) {
                                this.widgets[i].value = "";
                                didUnset = true;
                            }
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
                                    const link = node.graph.links?.[linkId];
                                    if (link) node.graph.removeLink(linkId);
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
                        this.ensureGetterWidgetCount(wNeeded || 1);
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
                        const joined = parts.join(" & ") || "Itchy & Scratchy";
                        this.title = (!disablePrefix ? "Get_" : "") + joined;

                        // Note: we don't actually have a settings panel yet
                        // Only colorize when a constant is selected; follow same rule as SetTwinNodes (based on constant type)
                        if (anySelected && pickedType && app.ui.settings.getSettingValue("KJNodes.nodeAutoColor")) {
                            setColorAndBgColor.call(this, pickedType);
                        } else if (!anySelected) {
                            this.color = undefined;
                            this.bgcolor = undefined;
                        }
                    } else {
                        // No matching setter: outputs mirror current selections with '*' type
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
                        const joined = parts.join(" & ") || "Itchy & Scratchy";
                        this.title = (!disablePrefix ? "Get_" : "") + joined;

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
                                const link = node.graph.links[linkId];
                                return link && (!link.type.split(",").includes(this.outputs[i].type) && link.type !== '*');
                            }).forEach(linkId => {
                                node.graph.removeLink(linkId);
                            });
                        }
                    }
                };

                this.setTypes = function(typeA, typeB) {
                    if (this.outputs[0]) {
                        this.outputs[0].name = typeA;
                        this.outputs[0].type = typeA;
                    }
                    if (this.outputs[1]) {
                        this.outputs[1].name = typeB;
                        this.outputs[1].type = typeB;
                    }
                    this.validateLinks();
                }

                this.findSetter = function(graph) {
                    const chosen = (this.widgets || []).map(w => w?.value).map(v => (v ? String(v).trim() : "")).filter(v => !!v);
                    const setters = graph?._nodes?.filter(n => n.type === 'SetTwinNodes') || [];
                    if (chosen.length === 0) return null;

                    // Match any setter that contains all chosen constants, regardless of position
                    let found = setters.find(s => {
                        const sw = (s.widgets || []).map(w => (w?.value ? String(w.value).trim() : ""));
                        return chosen.every(v => sw.includes(v));
                    });

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
                    const link = this.graph.links[slotInfo.link];
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
                            let linkType = (this.currentSetter.inputs[0]?.type) || '*';
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

                let start_node_slotpos = this.currentSetter.getConnectionPos(false, 0);
                start_node_slotpos = [
                    start_node_slotpos[0] - this.pos[0],
                    start_node_slotpos[1] - this.pos[1],
                ];
                let end_node_slotpos = [0, -LiteGraph.NODE_TITLE_HEIGHT * 0.5];
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
