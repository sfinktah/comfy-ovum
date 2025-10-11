/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").INodeInputSlot} INodeInputSlot */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").INodeOutputSlot} INodeOutputSlot */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").ISlotType} ISlotType */
/** @typedef {import("@comfyorg/litegraph/dist/LLink").LLink} LLink */
/** @typedef {import("@comfyorg/litegraph/dist/types/serialisation").SubgraphIO} SubgraphIO */
/** @typedef {import("../../typings/ComfyNode").ComfyNode} ComfyNode */

import { app } from "../../../scripts/app.js";
import { chainCallback } from "../01/utility.js";
import { Logger } from "../common/logger.js";
import { setupDynamicConnections, setupDynamicIOMixin } from "../mtb/utils/dynamic_connections.js";

// Dynamic input/output management for AssertOvum similar to convert-any-2.js
app.registerExtension({
    name: "ovum.assertovum.dynamicio",
    /**
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} appInstance
     */
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeType.comfyClass !== "AssertOvum") return;
        Logger.log({class:'ovum.assertovum.dynamicio',method:'beforeRegisterNodeDef',severity:'info',tag:'registered', nodeName:'AssertOvum'}, 'registered');

        // Use generic dynamic IO mixin: passthru_, true_, false_ inputs and mirror outputs
        setupDynamicIOMixin(nodeType, {
            inputs: [
                { prefix: 'passthru_', type: '*' , start: 1 },
                { prefix: 'true_', type: 'BOOLEAN,*' , start: 1 },
                { prefix: 'false_', type: 'BOOLEAN,*' , start: 1 },
            ],
            outputs: { mirrorInputs: true }
        });
        return; 
        chainCallback(nodeType.prototype, "onNodeCreated", function () {
            /** @type {ComfyNode} */
            const node = this;

            // Ensure we start with passthru_1 and paired true_1 / false_1 inputs
            if (!node.inputs || node.inputs.length === 0) {
                node.addInput("passthru_1", "*");
                node.addInput("true_1", "BOOLEAN,*");
                node.addInput("false_1", "BOOLEAN,*");
            }

            // Keep outputs aligned with inputs and mirror actual connected type
            function syncOutputs() {
                // Ensure there are as many outputs as inputs, same names
                const inCount = node.inputs?.length || 0;
                node.outputs = node.outputs || [];
                // Resize outputs
                while (node.outputs.length < inCount) node.addOutput("any", "*");
                while (node.outputs.length > inCount) node.removeOutput(node.outputs.length - 1);
                // Rename outputs to match input names
                for (let i = 0; i < inCount; i++) {
                    const inSlot = node.inputs[i];
                    const outSlot = node.outputs[i];
                    if (outSlot.name !== inSlot.name) outSlot.name = inSlot.name;
                    // Try infer type from connected input link
                    let typ = "*";
                    const linkId = inSlot.link;
                    if (linkId != null && node.graph?.links?.[linkId]) {
                        const link = node.graph.links[linkId];
                        const fromNode = node.graph.getNodeById(link.origin_id);
                        const fromSlot = fromNode?.outputs?.[link.origin_slot];
                        typ = fromSlot?.type || "*";
                    }
                    outSlot.type = typ;
                }
            }

            // Connection changes: dynamic add/remove and renumber "passthru_#/true_#/false_#"
            chainCallback(node, "onConnectionsChange", function (type, index, connected, link_info, inputOrOutput) {
                if (!link_info || type !== LiteGraph.INPUT) return;
                const stackTrace = new Error().stack;

                // When disconnecting manually, remove that input
                if (!connected) {
                    if (!stackTrace.includes('LGraphNode.prototype.connect') &&
                        !stackTrace.includes('convertToSubgraph') &&
                        !stackTrace.includes('pasteFromClipboard') &&
                        !stackTrace.includes('LGraphNode.connect') &&
                        !stackTrace.includes('loadGraphData')) {
                        this.removeInput(index);
                    }
                }

                // Renumber passthru, true and false inputs independently.
                let p = 1;
                let t = 1;
                let f = 1;
                let hasEmptyPass = false;
                let hasEmptyTrue = false;
                let hasEmptyFalse = false;
                for (const input of this.inputs) {
                    if (input.name.startsWith("passthru_")) {
                        const newName = `passthru_${p++}`;
                        if (input.name !== newName) input.name = newName;
                        if (input.link == null) hasEmptyPass = true;
                    } else if (input.name.startsWith("true_")) {
                        const newName = `true_${t++}`;
                        if (input.name !== newName) input.name = newName;
                        if (input.link == null) hasEmptyTrue = true;
                    } else if (input.name.startsWith("false_")) {
                        const newName = `false_${f++}`;
                        if (input.name !== newName) input.name = newName;
                        if (input.link == null) hasEmptyFalse = true;
                    }
                }

                // Ensure there's an empty slot for passthru, true and false.
                if (!hasEmptyPass) this.addInput(`passthru_${p}`, "*");
                if (!hasEmptyTrue) this.addInput(`true_${t}`, "BOOLEAN,*");
                if (!hasEmptyFalse) this.addInput(`false_${f}`, "BOOLEAN,*");

                syncOutputs();
                this.setDirtyCanvas(true, true);
            });

            // Also keep outputs in sync on execute, load, etc.
            chainCallback(node, "onExecute", function () { syncOutputs(); });
            chainCallback(node, "onConfigure", function () { syncOutputs(); });
        });
    },
});
