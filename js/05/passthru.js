/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").INodeInputSlot} INodeInputSlot */
/** @typedef {import("@comfyorg/comfyui-frontend-types").INodeOutputSlot} INodeOutputSlot */
/** @typedef {import("@comfyorg/comfyui-frontend-types").ISlotType} ISlotType */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LLink} LLink */
/** @typedef {import("@comfyorg/comfyui-frontend-types").SubgraphIO} SubgraphIO */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */
/** @typedef {import("../../typings/ComfyNode").ComfyNode} ComfyNode */

import { app } from "../../../scripts/app.js";
import { graphGetNodeById } from "../01/graphHelpers.js";
import { chainCallback } from "../01/utility.js";
import {getDynamicInputs, ensureDynamicInputsImpl, getInputArgNumber} from "../01/dynamicInputHelpers.js";
import {GraphHelpers} from "../common/graphHelpersForTwinNodes.js";
import { Logger } from "../common/logger.js";

app.registerExtension({
    name: "ovum.debug.passthru",
    /**
     * This method is triggered when a new node is created in the application.
     * It establishes and enforces rules for dynamic input management for specific node types,
     * ensuring correct behavior during node creation, configuration, and connection changes.
     *
     * @param {Object} node - The newly created node instance.
     * @param {Object} app - The application instance where the node is being registered or managed.
     * @return {Promise<void>} Resolves when the node's dynamic input rules and behaviors are properly initialized.
     */
    // nodeCreated(node, app) {},
    /**
     * Handles the initialization and dynamic management of node inputs for a specific node type.
     * This method is designed to enforce specific rules regarding dynamic inputs for nodes,
     * ensuring proper behavior during creation, configuration, and connection changes.
     *
     * @param {Object} nodeType - The type definition of the node being registered.
     * @param {Object} nodeData - The data associated with the node being registered.
     * @param {Object} appInstance - The application instance where the node is being registered.
     * @return {Promise<void>} Resolves when the dynamic input management is set up for the specified node type.
     */
    /**
     * @param {import("../../typings/ComfyNode").ComfyNode} nodeType
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} nodeData
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} appInstance
     */
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        // Target the Python class that supports many dynamic inputs
        return;
        if (!nodeData.name.match(/^Passthr.*Ovum$/)) {
            return;
        }
        Logger.log({class:'ovum.debug.passthru',method:'beforeRegisterNodeDef',severity:'info',tag:'registered', nodeName:'ovum.debug.passthru'}, 'registered');
        /** @type {ComfyApp} */
        // this.nodeCreated()
        chainCallback(nodeType.prototype, "onNodeCreated", function () {
            /** @type {ComfyNode} */
            const node = this;
            /** @type {LGraph|Subgraph} */
            /** Called for each connection that is created, updated, or removed. This includes "restored" connections when deserialising. */
            chainCallback(node, "onConnectionsChange",
                /**
                 * @this {ComfyNode}
                 * @param {ISlotType} type
                 * @param {number} index
                 * @param {boolean} connected
                 * @param {LLink|null|undefined} link_info
                 * @param {INodeInputSlot|INodeOutputSlot|SubgraphIO} inputOrOutput
                 */
                function (type, index, connected, link_info, inputOrOutput) {
                    Logger.log({class:'ovum.debug.passthru',method:'onConnectionsChange',severity:'debug',tag:'event', nodeName:'ovum.debug.passthru'}, 'onConnectionsChange', { type, index, isConnected: connected, link_info, inputOrOutput });
                    if (!link_info || type !== LiteGraph.INPUT) return;

                    const stackTrace = new Error().stack;

                    // 处理断开连接
                    if (!connected) {
                        if (!stackTrace.includes('LGraphNode.prototype.connect') &&
                            !stackTrace.includes('convertToSubgraph') &&
                            !stackTrace.includes('pasteFromClipboard') &&
                            !stackTrace.includes('LGraphNode.connect') &&
                            !stackTrace.includes('loadGraphData')) {
                            this.removeInput(index);
                            // this.inputs[index].label = this.outputs[index].label = "any";
                        }
                    }

                    // 重新编号输入端口
                    let inputIndex = 1;
                    this.inputs.forEach(input => {
                        const newName = `input_${inputIndex}`;
                        if (input.name !== newName) {
                            input.name = newName;
                        }
                        inputIndex++;
                    });

                    // 如果最后一个端口被连接，添加新端口
                    const lastInput = this.inputs[this.inputs.length - 1];
                    if (lastInput?.link != null) {
                        this.addInput(`input_${inputIndex}`, "*");
                    }

                    this.setDirtyCanvas(true, true);
            });
        });
    },
});
