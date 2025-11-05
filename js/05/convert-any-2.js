/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').ComfyApp} ComfyApp */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/litegraph.js').LiteGraph} LiteGraph */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").INodeInputSlot} INodeInputSlot */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").INodeOutputSlot} INodeOutputSlot */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ISlotType} ISlotType */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").LLink} LLink */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").SubgraphIO} SubgraphIO */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").LGraphNode} LGraphNode */
/** @typedef {import("../../typings/ComfyNode.js").ComfyNode} ComfyNode */

import { app } from "../../../scripts/app.js";
import { chainCallback } from "../01/utility.js";
import { Logger } from "../common/logger.js";

app.registerExtension({
    name: "ovum.convertany2.listish",
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
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyApp} app
     */
    /**
     * @param {import("../../typings/ComfyNode.js").ComfyNode} nodeType
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyNodeDef} nodeData
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyApp} app
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Target the Python class that supports many dynamic inputs
        if (!nodeType.comfyClass.match(/^ConvertAny2.*(Tuple|Dict|List|Set)$/)) {
            return;
        }
        Logger.log({class:'ovum.convertany2.listish',method:'beforeRegisterNodeDef',severity:'info',tag:'registered', nodeName:'ovum.convertany2.listish'}, 'registered');
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
                    Logger.log({class:'ovum.convertany2.listish',method:'onConnectionsChange',severity:'debug',tag:'event', nodeName:'ovum.convertany2.listish'}, 'onConnectionsChange', { type, index, isConnected: connected, link_info, inputOrOutput });
                    if (!link_info || type !== LiteGraph.INPUT) return;

                    const stackTrace = new Error().stack;

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

                    let inputIndex = 1;
                    this.inputs.forEach(input => {
                        const newName = `input_${inputIndex}`;
                        if (input.name !== newName) {
                            input.name = newName;
                        }
                        inputIndex++;
                    });

                    const lastInput = this.inputs[this.inputs.length - 1];
                    if (lastInput?.link != null) {
                        this.addInput(`input_${inputIndex}`, "*");
                    }

                    this.setDirtyCanvas(true, true);
            });
        });
    },
});
