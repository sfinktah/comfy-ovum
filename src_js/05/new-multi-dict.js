/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").INodeInputSlot} INodeInputSlot */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */
/** @typedef {import("../../typings/ComfyNode").ComfyNode} ComfyNode */

import { app } from "../../../scripts/app.js";
import { chainCallback } from "../01/utility.js";
import { ensureDynamicInputsImpl, getDynamicInputs } from "../01/dynamicInputHelpers.js";
import { Logger as _Logger } from "../common/logger.js";

const Logger = _Logger;

function getConfig() {
    return {
        dynamicInputs: {
            // Inputs named key-value-1, key-value-2, ...
            nameRegex: /^key-value-\d+$/,
            nameFormat: "key-value-${index}",
            nameIndex: 1, // start numbering from 1
            // Display labels as key-value-1, key-value-2, ... (user can edit the label to set dict key)
            labelFormat: "key-value-${index}",
            labelIndex: 1,
            type: "*",
            preserveUserLabels: true,
        }
    };
}

// Inject mapping of input name -> label into workflow.extra per node
function attachGraphToPromptHook() {
    const original = app.graphToPrompt;
    app.graphToPrompt = async function() {
        const res = await original.apply(this, arguments);
        try {
            const g = app.graph;
            const nodes = Array.isArray(g?._nodes) ? g._nodes : [];
            res.workflow = res.workflow || {};
            res.workflow.extra = res.workflow.extra || {};
            for (const n of nodes) {
                try {
                    if (n?.type !== "NewMultiDictionaryOvum" && n?.comfyClass !== "NewMultiDictionaryOvum") continue;
                    const inputs = n?.inputs || [];
                    const pairs = [];
                    for (const inp of inputs) {
                        if (!inp || typeof inp.name !== 'string') continue;
                        if (!/^key-value-\d+$/.test(inp.name)) continue;
                        // store [name, label]
                        const label = typeof inp.label === 'string' && inp.label ? inp.label : inp.name;
                        pairs.push([inp.name, label]);
                    }
                    const key = `ovum.multi.dict:(${n.id})`;
                    res.workflow.extra[key] = pairs;
                } catch (err) {
                    Logger.log({class:'ovum.new_multi_dict', method:'graphToPrompt', severity:'warn', tag:'node_iter'}, 'Failed processing node for extras', err);
                }
            }
        } catch (err) {
            Logger.log({class:'ovum.new_multi_dict', method:'graphToPrompt', severity:'warn', tag:'hook'}, 'graphToPrompt hook error', err);
        }
        return res;
    }
}

app.registerExtension({
    name: "ovum.new_multi_dict",
    async setup() {
        // Install the graphToPrompt wrapper once
        attachGraphToPromptHook();
    },
    /**
     * @param {ComfyNode} nodeType
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} nodeData
     * @param {ComfyApp} app
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData?.name !== 'NewMultiDictionaryOvum') return;

        // Provide dynamic input configuration to generic helper
        nodeType.getDynamicInput = () => getConfig();
        if (nodeType.prototype) {
            if (!nodeType.prototype.getParsedDynamicInputs) {
                nodeType.prototype.getParsedDynamicInputs = function() { return getConfig(); };
            }
        }

        chainCallback(nodeType.prototype, "onNodeCreated", function () {
            /** @type {ComfyNode} */
            const node = this;

            const ensure = (isConnecting = true) => ensureDynamicInputsImpl(node, isConnecting);

            // Initialize on creation
            ensure(false);

            // Also enforce after loading from saved graph
            chainCallback(node, "onConfigure", function () {
                try { ensure(false); } catch (err) { Logger.log({class:'ovum.new_multi_dict',method:'onConfigure',severity:'warn',tag:'error'}, err?.message); }
            });

            // React to connections to grow/shrink
            chainCallback(node, "onConnectionsChange",
                function (type, index, connected, link_info, inputOrOutput) {
                    try { ensure(!!connected); } catch (err) { Logger.log({class:'ovum.new_multi_dict',method:'onConnectionsChange',severity:'warn',tag:'error'}, err?.message); }
                }
            );
        });
    },
});
