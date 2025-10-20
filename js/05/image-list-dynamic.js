/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").INodeInputSlot} INodeInputSlot */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */
/** @typedef {import("../../typings/ComfyNode").ComfyNode} ComfyNode */

import { app } from "../../../scripts/app.js";
import { chainCallback } from "../01/utility.js";
import { ensureDynamicInputsImpl } from "../01/dynamicInputHelpers.js";
import get from "/ovum/node_modules/lodash-es/get.js";
import { inspectUpstream } from "../common/ovum_helpers.js";

// This extension adapts the generic argN dynamic-input helper to MakeFlatImageList,
// mapping UI argN inputs to backend kwargs image_1, image_2, ...
app.registerExtension({
    name: "ovum.image_list.dynamic_inputs",
    async beforeRegisterNodeDef (nodeType, nodeData, appInstance) {

        // 1) Cheap presence check without parsing
        const hidden = nodeData?.input?.hidden;
        const hasDynamicInputs =
            !!hidden && Object.prototype.hasOwnProperty.call(hidden, "dynamicInputs");

        if (nodeData?.name.match(/^MakeFlatImageList$/) && !hasDynamicInputs) {
            Logger.log({
                class: 'ovum.image_list.dynamic_inputs',
                method: 'beforeRegisterNodeDef',
                severity: 'debug',
                tag: 'event',
                nodeName: 'ovum.image_list.dynamic_inputs'
            },
                "beforeRegisterNodeDef didn't find dynamic inputs",
                {hasDynamicInputs, hidden, nodeDataInput: nodeData?.input})
        }

        if (!hasDynamicInputs) {
            return;
        }

        // 2) Store a fast-access flag and lazy getter on the nodeType
        nodeType.hasDynamicInputs = hasDynamicInputs;

        // Optional: cache raw JSON string for zero-cost reuse
        const rawDynamicInputsJson = hasDynamicInputs ? hidden.dynamicInputs?.[1] : undefined;
        Logger.log({
                class: 'ovum.image_list.dynamic_inputs',
                method: 'beforeRegisterNodeDef',
                severity: 'debug',
                tag: 'event',
                nodeName: 'ovum.image_list.dynamic_inputs'
            },
            'beforeRegisterNodeDef',
            {hasDynamicInputs, nodeDataInput: nodeData?.input, rawDynamicInputsJson})

        nodeType.getRawDynamicInputsJson = () => rawDynamicInputsJson;

        // Optional: lazy parsed cache shared across instances
        let parsedCache; // closed over
        // If keyPath is provided (dot-separated), return nested value using lodash-es get
        nodeType.getDynamicInput = (keyPath) => {
            if (!hasDynamicInputs) {
                return undefined;
            }
            if (parsedCache === undefined) {
                try {
                    parsedCache = JSON.parse(rawDynamicInputsJson || "{}");
                } catch {
                    parsedCache = {};
                }
            }
            if (keyPath == null || keyPath === "") {
                return parsedCache;
            }
            return get(parsedCache, keyPath);
        };

        // 3) Make it accessible from node instances (prototype)
        if (nodeType.prototype) {
            if (nodeType.prototype.hasDynamicInputs === undefined) {
                Object.defineProperty(nodeType.prototype, "hasDynamicInputs", {
                    get () {
                        return nodeType.hasDynamicInputs === true;
                    },
                });
            }
            if (nodeType.prototype.getParsedDynamicInputs === undefined) {
                nodeType.prototype.getParsedDynamicInputs = function (keyPath) {
                    return nodeType.getDynamicInput?.(keyPath);
                };
            }
            if (nodeType.prototype.getRawDynamicInputsJson === undefined) {
                nodeType.prototype.getRawDynamicInputsJson = function () {
                    return nodeType.getRawDynamicInputsJson?.();
                };
            }
        }

        // Example: use flag without parsing
        if (nodeType.hasDynamicInputs) {
            // lightweight tweaks knowing meta exists
            // e.g., adjust title without touching JSON
            nodeType.title = (nodeType.title || nodeData?.name) + " • meta";
        }

        // When node created, set up dynamic inputs and rename labels based on python-provided config
        chainCallback(nodeType.prototype, "onNodeCreated", function () {
            /** @type {ComfyNode & LGraphNode} */
            const node = this;

            // Ensure dynamic behavior (adds trailing input and trims extras)
            const refresh = (isConnecting = true) => ensureDynamicInputsImpl(node, isConnecting);

            // Initial normalisation after creation and after configure
            refresh(false);
            chainCallback(node, "onConfigure", function () {
                try {
                    refresh(false);
                } catch {
                }
            });

            // Display labels using labelFormat/labelIndex and nameRegex from config
            const relabel = () => {
                const cfg = node.getParsedDynamicInputs?.();
                const nameRegex = cfg?.dynamicInputs?.nameRegex ? new RegExp(cfg.dynamicInputs.nameRegex) : /^arg\d+$/;
                const labelFmt = cfg?.dynamicInputs?.labelFormat || "image_${index}";
                const labelIndexBase = Number.isFinite(cfg?.dynamicInputs?.labelIndex) ? cfg.dynamicInputs.labelIndex : 1;
                let logical = 0;
                for (const input of node.inputs || []) {
                    if (typeof input.name === "string" && nameRegex.test(input.name)) {
                        input.label = labelFmt.replaceAll("${index}", String(labelIndexBase + logical));
                        logical++;
                    }
                }
                node.setDirtyCanvas(true, true);
            };

            // Hook connection changes to maintain inputs and labels
            chainCallback(node, "onConnectionsChange", function (type, index, connected, link_info) {
                // Run generic logic; pass true for connect events, false for disconnect
                refresh(!!connected);
                relabel();

                // Handle changeInputs rules when a new link is connected
                try {
                    if (!connected) return;
                    const cfg = node.getParsedDynamicInputs?.();
                    const changeInputs = Array.isArray(cfg?.changeInputs) ? cfg.changeInputs : [];
                    if (!changeInputs.length) return;

                    const inp = (node.inputs || [])[index];
                    const inputName = inp?.name;
                    if (!inputName) return;

                    for (const rule of changeInputs) {
                        const re = rule?.nameRegex ? new RegExp(rule.nameRegex) : null;
                        if (!re || !re.test(String(inputName))) continue;
                        if (String(rule?.condition) !== "OUTPUT_IS_LIST") continue;

                        // Inspect upstream to see if the connected output is a list
                        app.graphToPrompt().then((_prompt) => {
                            return inspectUpstream(_prompt, node.id, inputName);
                        }).then((info) => {
                            const isList = !!info?.source_output_is_list;
                            const shapeArr = Array.isArray(rule?.shape) ? rule.shape : [];
                            let newShape = isList ? shapeArr?.[0] : shapeArr?.[1];
                            if (newShape == null) newShape = undefined;
                            try { inp.shape = newShape; } catch (_e) {}
                            try { node.setDirtyCanvas(true, true); } catch (_e) {}
                        }).catch(() => {});
                    }
                } catch (_e) {}
            });

            // Also relabel right away
            relabel();
        });
    },

    // Cosmetic: as nodes are created, make sure labels are correct too (defensive)
    nodeCreated (node) {
        if (!node?.hasDynamicInputs) {
            return;
        }
        const cfg = node.getParsedDynamicInputs?.();
        const nameRegex = cfg?.dynamicInputs?.nameRegex ? new RegExp(cfg.dynamicInputs.nameRegex) : /^arg\d+$/;
        const labelFmt = cfg?.dynamicInputs?.labelFormat || "image_${index}";
        const labelIndexBase = Number.isFinite(cfg?.dynamicInputs?.labelIndex) ? cfg.dynamicInputs.labelIndex : 1;
        let logical = 0;
        for (const inp of node.inputs || []) {
            if (typeof inp.name === "string" && nameRegex.test(inp.name)) {
                inp.label = labelFmt.replaceAll("${index}", String(labelIndexBase + logical));
                logical++;
            }
        }
        setTimeout(() => {
            let o = node.badges[0]();
            Object.assign(o, {'text': `#${node.id} ${node.comfyClass} 🥚`, fontSize: 10});
        }, 500);
    }
});
