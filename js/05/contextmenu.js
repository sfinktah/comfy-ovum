/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LiteGraph} LiteGraph */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LGraphCanvas} LGraphCanvas */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LLink} LLink */

import {app} from "../../../scripts/app.js";
import {chainCallback} from "../01/utility.js";
import {
    possibleUniversalNodesToAdd,
    universalNodesToAddToOutput,
    loggedUniversalNodesToAddToOutput,
    updateSlots,
    insertPassthruBetweenOutputs,
    hasPassthruOutputs,
    removePassthruFromOutputs,
    cloneSubgraphNodeWithConnections,
    jumpToNodeWithLinkId,
} from "./contextmenu-helpers.js";
import {installLinkMenuEnhancements} from "./contextmenu-linkmenu.js";

// Expose for convenience (kept for backward compatibility)
window.jumpToNodeWithLinkId = jumpToNodeWithLinkId;

app.registerExtension({
    name: "ovum.contextmenu",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (possibleUniversalNodesToAdd.includes(nodeData.name)) {
            universalNodesToAddToOutput.add(nodeData.name);
        }
        if (loggedUniversalNodesToAddToOutput.length === 0) {
            loggedUniversalNodesToAddToOutput.push(true);
            Logger.log({
                class: 'ovum.contextmenu',
                method: 'beforeRegisterNodeDef',
                severity: 'trace',
                tag: '',
                nodeName: 'ovum.contextmenu'
            }, "Adding context menu entries to universal nodes: ", Array.from(universalNodesToAddToOutput).join(", "));
        }

        if (nodeData.output) {
            chainCallback(nodeType.prototype, "getExtraMenuOptions", function (canvas, options) {
                options.push({
                    content: "🥚 Add PassthruOvums to outputs",
                    callback: () => insertPassthruBetweenOutputs(this)
                });

                if (hasPassthruOutputs(this)) {
                    options.push({
                        content: "🥚 Remove PassthruOvums from outputs",
                        callback: () => removePassthruFromOutputs(this)
                    });
                }
            });
        }

        chainCallback(nodeType.prototype, "getExtraMenuOptions", function (canvas, options) {
            try {
                options.push({
                    content: "🥚 Clone with connections",
                    callback: () => cloneSubgraphNodeWithConnections(this)
                });
            } catch (_) {}
        });
    },
    async afterConfigureGraph(missingNodeTypes) {
        setTimeout(() => {
            updateSlots('timer');
        }, 1000);
    },
    async setup(app) {
        app.ui.settings.addSetting({
            id: "ovum.SetGetMenu",
            name: "ovum: Make TwinNodes default options",
            tooltip: 'Add TwinNodes to the top or bottom of the list of available node suggestions.',
            options: ['disabled', 'top', 'bottom'],
            defaultValue: 'top',
            type: "combo",
            onChange: updateSlots,
        });
        app.ui.settings.addSetting({
            id: "ovum.nodeAutoColor",
            name: "ovum: Automatically set TwinNodes colors",
            type: "boolean",
            defaultValue: true,
        });
        app.ui.settings.addSetting({
            id: "ovum.disablePrefix",
            name: "ovum: Disable automatic 'set ' and 'get ' prefix for TwinNodes titles",
            defaultValue: true,
            type: "boolean",
        });
        app.ui.settings.addSetting({
            id: "ovum.makeTwinNodesLinkClick",
            name: "ovum: Turn links into Get/SetTwinNodes by clicking the center-circle of links",
            type: "boolean",
            defaultValue: false,
        });
    },
    init() {
        installLinkMenuEnhancements();
    }
});
