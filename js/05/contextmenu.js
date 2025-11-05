/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').ComfyApp} ComfyApp */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').LiteGraph} LiteGraph */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').LGraphCanvas} LGraphCanvas */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").LGraphNode} LGraphNode */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").LLink} LLink */

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

// LGraphCanvas.onMenuAdd
/*
function onMenuAdd(event, _t, mouseEvent, parentMenu, onNodeAdded) {
    const canvas = LGraphCanvas.active_canvas;
    const canvasWindow = canvas.getCanvasWindow();
    const graph = canvas.graph;

    if (!graph) {
        return false;
    }

    function buildCategoryMenu (prefix, parent) {
        const filter = canvas.filter || graph.filter;

        // Collect subcategories under current prefix
        const categories = LiteGraph
            .getNodeTypesCategories(filter)
            .filter(cat => cat.startsWith(prefix));

        let entries = [];

        categories.map(cat => {
            if (!cat) {
                return;
            }

            const regex = new RegExp("^(" + prefix + ")");
            const top = cat.replace(regex, "").split("/")[0]; // immediate child
            const nextPrefix = (prefix === "") ? top + "/" : prefix + top + "/";
            let label = top;

            // If label contains ::, show the suffix only
            if (label.indexOf("::") !== -1) {
                label = label.split("::")[1];
            }

            // Avoid duplicates by value
            const exists = entries.findIndex(e => e.value === nextPrefix) !== -1;
            if (!exists) {
                entries.push({
                    value: nextPrefix,
                    content: label,
                    has_submenu: true,
                    callback: (item, _target, _opts, submenuParent) => {
                        buildCategoryMenu(item.value, submenuParent);
                    }
                });
            }
        });

        // Add nodes in this exact category (prefix without trailing slash)
        const nodes = LiteGraph.getNodeTypesInCategory(prefix.slice(0, -1), filter);
        nodes.map(nodeType => {
            if (nodeType.skip_list) {
                return;
            }

            const item = {
                value: nodeType.type,
                content: nodeType.title,
                has_submenu: false,
                callback: (item, _target, _opts, menuInstance) => {
                    const firstEvt = menuInstance.getFirstEvent();

                    canvas.graph.beforeChange();
                    const node = LiteGraph.createNode(item.value);
                    if (node) {
                        node.pos = canvas.convertEventToCanvasOffset(firstEvt);
                        canvas.graph.add(node);
                    }
                    if (onNodeAdded) {
                        onNodeAdded(node);
                    }
                    canvas.graph.afterChange();
                }
            };

            entries.push(item);
        });

        // Optional sorting/serialization for root menu
        const sortSetting = getSetting("EasyUse.ContextMenu.NodesSort", null);
        if (prefix === "" && sortSetting) {
            entries = serializeParentNodeMenu(entries);
        }

        // Render context menu
        new LiteGraph.ContextMenu(
            entries,
            {
                event: mouseEvent,
                parentMenu: parent
            },
            canvasWindow
        );
    }

    buildCategoryMenu("", parentMenu);
    return false;
}
*/