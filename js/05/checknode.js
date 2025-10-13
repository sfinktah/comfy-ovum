/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */

import { app } from "../../../scripts/app.js";
import { chainCallback } from "../01/utility.js";

// Create a lightweight checker node that mirrors Kijai's GetNode lookup logic
// but outputs a BOOLEAN indicating whether a matching SetNode input link exists.
// Title: "Does Kijai SetNode exist?"  Node type: "CheckKijaiNode"

let disablePrefix = app.ui.settings.getSettingValue("KJNodes.disablePrefix");

// https://docs.comfy.org/custom-nodes/js/javascript_hooks#web-page-load
// StyleGuide: WebPageLoad
//    invokeExtensionsAsync init
//    invokeExtensionsAsync addCustomNodeDefs
//    invokeExtensionsAsync getCustomWidgets
//    invokeExtensionsAsync beforeRegisterNodeDef    [repeated multiple times]
//    invokeExtensionsAsync registerCustomNodes
//    invokeExtensionsAsync beforeConfigureGraph
//    invokeExtensionsAsync nodeCreated
//    invokeExtensions      loadedGraphNode
//    invokeExtensionsAsync afterConfigureGraph
//    invokeExtensionsAsync setup
// LoadingWorkflow
//    invokeExtensionsAsync beforeConfigureGraph
//    invokeExtensionsAsync beforeRegisterNodeDef   [zero, one, or multiple times]
//    invokeExtensionsAsync nodeCreated             [repeated multiple times]
//    invokeExtensions      loadedGraphNode         [repeated multiple times]
//    invokeExtensionsAsync afterConfigureGraph
// AddingNewNode
//    invokeExtensionsAsync nodeCreated

app.registerExtension({
    name: "CheckKijaiNode",

    // StyleGuide: Called when a specific instance of a node gets created (right at the end of the ComfyNode() function on nodeType which serves as a constructor). In this hook you can make modifications to individual instances of your node.
    /**
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} appInstance
     */
    nodeCreated(node, appInstance) {
        // Logger.log({ class: 'CheckKijaiNode', method: 'nodeCreated', severity: 'trace', })
        // No global behavior on arbitrary nodes
    },

    // StyleGuide: Called when the Comfy webpage is loaded (or reloaded). The call is made after the graph object has been created, but before any nodes are registered or created. It can be used to modify core Comfy behavior by hijacking methods of the app, or of the graph (a LiteGraph object).
    async init() {},

    // StyleGuide: Called at the end of the startup process. A good place to add event listeners (either for Comfy events, or DOM events), or adding to the global menus, both of which are discussed elsewhere.
    async setup() {},

    // StyleGuide: https://docs.comfy.org/custom-nodes/js/javascript_hooks#beforeregisternodedef
    /**
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} appInstance
     */
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (!nodeData || nodeData.name !== "CheckKijaiNode") return;
        Logger.log({
            class: 'CheckKijaiNode',
            method: 'beforeRegisterNodeDef',
            severity: 'trace',
        }, 'nodeData.name matches "CheckKijaiNode"');

        // Add widget/output on creation and set initial title
        chainCallback(nodeType.prototype, "onNodeCreated", function () {
            const node = this;
            if (!node.properties) node.properties = {};

            node.addWidget(
                "text",
                "Constant",
                "",
                () => {
                    const val = node.widgets?.[0]?.value ?? "";
                    node.title = (!disablePrefix ? "Check_" : "") + (val !== "" ? val : "SetNode");
                },
                {}
            );

            // Initialize title immediately based on default/empty value
            {
                const val = node.widgets?.[0]?.value ?? "";
                node.title = (!disablePrefix ? "Check_" : "") + (val !== "" ? val : "SetNode");
            }

            // Single boolean output
            node.addOutput("BOOLEAN", "BOOLEAN");
            // node.isVirtualNode = true; // purely frontend if desired
        });

        // Helper: Returns the matching SetNode or null
        if (typeof nodeType.prototype.findSetter !== "function") {
            nodeType.prototype.findSetter = function (graph) {
                const name = this.widgets?.[0]?.value || "";
                if (!name || !graph || !graph._nodes) return null;
                const node = graph._nodes.find(
                    (otherNode) =>
                        otherNode?.type === "SetNode" &&
                        otherNode.widgets &&
                        otherNode.widgets[0]?.value === name
                );
                return node || null;
            };
        }

        // Helper: Check if getInputLink would succeed for slot 0
        if (typeof nodeType.prototype.wouldGetInputLinkSucceed !== "function") {
            nodeType.prototype.wouldGetInputLinkSucceed = function (slot = 0) {
                const setter = this.findSetter(this.graph);
                if (!setter) return false;
                const slotInfo = setter.inputs?.[slot];
                if (!slotInfo) return false;
                const linkId = slotInfo.link;
                if (linkId == null) return false;
                const link = this.graph?.links?.[linkId];
                return !!link;
            };
        }

        // StyleGuide: https://docs.comfy.org/development/comfyui-server/comms_messages#using-executed
        // Provide a value for the BOOLEAN output
        chainCallback(nodeType.prototype, "onExecute", function () {
            const ok = this.wouldGetInputLinkSucceed(0);
            if (this.outputs && this.outputs[0]) {
                this.setOutputData && this.setOutputData(0, ok);
            }
        });

        // Keep output up to date visually when graph changes
        chainCallback(nodeType.prototype, "onConnectionsChange", function () {
            if (this.canvas?.setDirty) this.canvas.setDirty(true, true);
        });
    },
});
