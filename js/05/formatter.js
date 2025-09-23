/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").INodeInputSlot} INodeInputSlot */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").INodeOutputSlot} INodeOutputSlot */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").ISlotType} ISlotType */
/** @typedef {import("@comfyorg/litegraph/dist/LLink").LLink} LLink */
/** @typedef {import("@comfyorg/litegraph/dist/types/serialisation").SubgraphIO} SubgraphIO */
/** @typedef {import("@comfyorg/litegraph/dist/LGraphNode").LGraphNode} LGraphNode */
/** @typedef {import("../../typings/ComfyNode").ComfyNode} ComfyNode */

import { app } from "../../../scripts/app.js";
import { graphGetNodeById } from "../01/graphHelpers.js";
import { chainCallback } from "../01/utility.js";
import {getDynamicInputs, ensureDynamicInputsImpl, getInputArgNumber} from "../01/dynamicInputHelpers.js";
import {GraphHelpers} from "../common/graphHelpersForTwinNodes.js";
import { Logger } from "../common/logger.js";

app.registerExtension({
    name: "ovum.format",
    /**
     * This method is triggered when a new node is created in the application.
     * It establishes and enforces rules for dynamic input management for specific node types,
     * ensuring correct behavior during node creation, configuration, and connection changes.
     *
     * @param {Object} node - The newly created node instance.
     * @param {Object} app - The application instance where the node is being registered or managed.
     * @return {Promise<void>} Resolves when the node's dynamic input rules and behaviors are properly initialized.
     */
    nodeCreated(node, app) {

    },
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
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        // Target the Python class that supports many dynamic inputs
        if (nodeType?.comfyClass !== "PythonStringFormat") {
            return;
        }
        if (nodeData.name !== "PythonStringFormat") { Logger.log({class:'ovum.format',method:'beforeRegisterNodeDef',severity:'debug',tag:'early_return', nodeName:'ovum.format'}, "early return: unsupported node name", nodeData.name); return; }

        Logger.log({class:'ovum.format',method:'beforeRegisterNodeDef',severity:'info',tag:'registered', nodeName:'ovum.format'}, 'registered');
        /** @type {ComfyApp} */
        // this.nodeCreated()
        chainCallback(nodeType.prototype, "onNodeCreated", function () {
            /** @type {ComfyNode} */
            const node = this;
            /** @type {LGraph|Subgraph} */
            const graph = node.graph;

            // Guard removal: keep at least one dynamic input present at all times
            const _origRemoveInput = typeof node.removeInput === "function" ? node.removeInput.bind(node) : null;
            node.removeInput = function (index) {
                if (_origRemoveInput) {
                    _origRemoveInput(index);
                }
                try {
                    let dyn = getDynamicInputs(node);

                    // If all dynamic inputs were removed, re-add arg0
                    if (dyn.length === 0) {
                        node.addInput("arg0", "*", { forceInput: true });
                        dyn = getDynamicInputs(node);
                    }

                    // If the last dynamic input is linked, ensure a trailing empty slot exists
                    const last = dyn[dyn.length - 1]?.inp;
                    if (last && last.link != null) {
                        const lastNum = getInputArgNumber(last);
                        const nextNum = lastNum + 1;
                        node.addInput(`arg${nextNum}`, "*", { label: `arg${nextNum}` });
                    }
                } catch (err) {
                    Logger.log({class:'ovum.format',method:'removeInput',severity:'warn',tag:'error', nodeName:'ovum.format'}, 'removeInput guard error:', err);
                }
            };

            const ensureDynamicInputs = (isConnecting = true) => {
                Logger.log({class:'ovum.format',method:'ensureDynamicInputs',severity:'debug',tag:'flow', nodeName:'ovum.format'}, 'ensureDynamicInputs isConnecting:', isConnecting);
                ensureDynamicInputsImpl(node, isConnecting);
            };

            // Initialize once created
            ensureDynamicInputs(false);

            // Also enforce after loading from saved graph
            chainCallback(node, "onConfigure", function () {
                try {
                    ensureDynamicInputs(false);
                } catch (err) {
                    Logger.log({class:'ovum.format',method:'onConfigure',severity:'warn',tag:'error', nodeName:'ovum.format'}, 'onConfigure error:', err);
                }
            });

            //            onConnectionsChange(this: ComfyNode, type: ISlotType, widgetIndex: number, isConnected: boolean, link_info: LLink | null | undefined, inputOrOutput: INodeInputSlot | INodeOutputSlot | SubgraphIO): void;
            // Update labels/types and manage dynamic slots on connect/disconnect
            /** Called for each connection that is created, updated, or removed. This includes "restored" connections when deserialising. */
            chainCallback(node, "onConnectionsChange",
                /**
                 * @this {ComfyNode}
                 * @param {ISlotType} type
                 * @param {number} index
                 * @param {boolean} isConnected
                 * @param {LLink|null|undefined} link_info
                 * @param {INodeInputSlot|INodeOutputSlot|SubgraphIO} inputOrOutput
                 */
                function (type, index, isConnected, link_info, inputOrOutput) {
                    Logger.log({class:'ovum.format',method:'onConnectionsChange',severity:'debug',tag:'event', nodeName:'ovum.format'}, 'onConnectionsChange', { type, index, isConnected, link_info, inputOrOutput });
                    try {
                        const graph = node.graph;
                        if (type !== LiteGraph.INPUT) { Logger.log({class:'ovum.format',method:'onConnectionsChange',severity:'debug',tag:'early_return', nodeName:'ovum.format'}, 'early return: connection not for INPUT slot, type:', type); return; }
                        /** @type {INodeInputSlot} */
                        const input = this.inputs?.[index];
                        if (!input) { Logger.log({class:'ovum.format',method:'onConnectionsChange',severity:'debug',tag:'early_return', nodeName:'ovum.format'}, 'early return: no input found at widgetIndex', index); return; }

                        const stackTrace = new Error().stack;

                        // HOTFIX: subgraph
                        if (stackTrace.includes('convertToSubgraph') || stackTrace.includes('Subgraph.configure')) {
                            Logger.log({class:'ovum.format',method:'onConnectionsChange',severity:'debug',tag:'early_return', nodeName:'ovum.format'}, 'early return: subgraph conversion/configure in progress');
                            return;
                        }

                        if (stackTrace.includes('loadGraphData')) {
                            // might need to do stuff
                            Logger.log({class:'ovum.format',method:'onConnectionsChange',severity:'debug',tag:'early_return', nodeName:'ovum.format'}, 'early return: loadGraphData in progress');
                            return;
                        }

                        if(stackTrace.includes('pasteFromClipboard')) {
                            // might need to do stuff
                            Logger.log({class:'ovum.format',method:'onConnectionsChange',severity:'debug',tag:'early_return', nodeName:'ovum.format'}, 'early return: pasteFromClipboard in progress');
                            return;
                        }

                        if(!link_info)
                            { Logger.log({class:'ovum.format',method:'onConnectionsChange',severity:'debug',tag:'early_return', nodeName:'ovum.format'}, 'early return: no link_info provided'); return; }

                        if (!/^arg\d+$/.test(input.name)) {
                            // Only react to argN inputs, but call ensureDynamicInputs just in case
                            ensureDynamicInputs(isConnected);
                            Logger.log({class:'ovum.format',method:'onConnectionsChange',severity:'debug',tag:'early_return', nodeName:'ovum.format'}, 'early return: input name is not argN:', input.name);
                            return;
                        }

                        if (isConnected) {
                            // Check if link was already connected by looking it up in the graph's links
                            const wasConnected = Boolean(graph.links.get(link_info.id));
                            if (wasConnected === isConnected) {
                                // A change in connection
                            }

                            Logger.log({class:'ovum.format',method:'onConnectionsChange',severity:'debug',tag:'flow', nodeName:'ovum.format'}, `link_info.origin_id = ${link_info.origin_id}`);
                            const fromNode = GraphHelpers.getNodeById(graph, link_info.origin_id);
                            const type = fromNode?.outputs?.[link_info.origin_slot]?.type ?? "*";
                            input.type = type || "*";
                            if (input.type !== "*") {
                                input.label = input.name + ` ${input.type.toLowerCase()}`
                            } else {
                                input.label = input.name;
                            }
                        } else {
                            // Disconnecting:
                            // reset to wildcard and default name on disconnect
                            input.type = "*";
                            input.label = input.name;
                        }

                        ensureDynamicInputs(isConnected);
                    } catch (err) {
                    Logger.log({class:'ovum.format',method:'onConnectionsChange',severity:'warn',tag:'error', nodeName:'ovum.format'}, 'onConnectionsChange error:', err);
                }
            });
        });
    },
});
