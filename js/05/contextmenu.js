/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LiteGraph} LiteGraph */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LGraphCanvas} LGraphCanvas */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LiteGraph} LiteGraph */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LGraphCanvas} LGraphCanvas */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LGraph} LGraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LLink} LLink */
/** @typedef {import("@comfyorg/comfyui-frontend-types").INodeInputSlot} INodeInputSlot */
/** @typedef {import("@comfyorg/comfyui-frontend-types").INodeOutputSlot} INodeOutputSlot */
/** @typedef {import("@comfyorg/comfyui-frontend-types").ISlotType} ISlotType */
/** @typedef {import("@comfyorg/comfyui-frontend-types").SubgraphIO} SubgraphIO */
/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import("@comfyorg/comfyui-frontend-types").IWidget} IWidget */
/** @typedef {import("@comfyorg/comfyui-frontend-types").Subgraph} Subgraph */
/** @typedef {import('../01/typedefs.js').INodeInputSlot} INodeInputSlot */

import {app} from "../../../scripts/app.js";
import {GraphHelpers} from "../common/graphHelpersForTwinNodes.js";
import {setWidgetValue, setWidgetValueWithValidation} from "../01/twinnodeHelpers.js";

// Stolen from Kijai
// Adds context menu entries, code partly from pyssssscustom-scripts

function addMenuHandler(nodeType, cb) {
    const getOpts = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function () {
        const r = getOpts.apply(this, arguments);
        cb.apply(this, arguments);
        return r;
    };
}

function jumpToNodeWithLinkId(id) {
    app.canvas.selectNode(app.graph.getNodeById(app.graph._links.get(id).origin_id), false); app.canvas.fitViewToSelectionAnimated()
}

window.jumpToNodeWithLinkId = jumpToNodeWithLinkId;

function addNode(name, nextTo, options) {
    options = {side: "left", select: true, shiftY: 0, shiftX: 0, ...(options || {})};
    const node = LiteGraph.createNode(name);
    app.graph.add(node);

    node.pos = [
        options.side === "left" ? nextTo.pos[0] - (node.size[0] + options.offset) : nextTo.pos[0] + nextTo.size[0] + options.offset,

        nextTo.pos[1] + options.shiftY,
    ];
    if (options.select) {
        app.canvas.selectNode(node, false);
    }
    return node;
}

const possibleUniversalNodesToAdd = [
    "easy showAnything",
];
const universalNodesToAddToOutput = new Set();
const loggedUniversalNodesToAddToOutput = [];
const updateSlots = (value) => {
    const valuesToAddToIn = ["GetTwinNodes"];
    const valuesToAddToOut = ["SetTwinNodes", ...universalNodesToAddToOutput];
    // Remove entries if they exist
    for (const slotTypes of Object.values(LiteGraph.slot_types_default_in)) {
        for (const valueToAdd of valuesToAddToIn) {
            const idx = slotTypes.indexOf(valueToAdd);
            if (idx !== -1) {
                slotTypes.splice(idx, 1);
            }
            if (value === "top") {
                slotTypes.unshift(valueToAdd);
            } else {
                slotTypes.push(valueToAdd);
            }
        }
    }

    Logger.log({
        class: 'ovum.contextmenu',
        method: 'updateSlots',
        severity: 'trace',
        tag: '',
        nodeName: 'ovum.contextmenu'
    }, `Adding context menu entries to universal nodes, position: ${value}: `, valuesToAddToOut);
    for (const slotTypes of Object.values(LiteGraph.slot_types_default_out)) {
        for (const valueToAdd of value !== "bottom" ? valuesToAddToOut.toReversed() : valuesToAddToOut) {
            let idx = slotTypes.indexOf(valueToAdd);
            if (idx !== -1) {
                // continue;
                slotTypes.splice(idx, 1);
            }
            if (value !== "bottom") {
                slotTypes.unshift(valueToAdd);
            } else {
                slotTypes.push(valueToAdd);
            }
        }
    }
};
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
            }, "Adding context menu entries to universal nodes: ", universalNodesToAddToOutput);
        }

        // if (nodeData.input && nodeData.input.required) {
        //     addMenuHandler(nodeType, function (_, options) {
        //         options.unshift(
        //             {
        //                 content: "Add GetTwinNodes",
        //                 callback: () => {
        //                     addNode("GetTwinNodes", this, {side: "left", offset: 30});
        //                 }
        //             },
        //             {
        //                 content: "Add SetTwinNodes",
        //                 callback: () => {
        //                     addNode("SetTwinNodes", this, {side: "right", offset: 30});
        //                 },
        //             });
        //     });
        // }
    },
    /** @param {MissingNodeType[]} missingNodeTypes */
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
    },
    init() {
        const graph = app.graph;

        // Compose multiple callbacks sequentially
        const useChainCallback = (fallback, ...callbacks) => function (...args) {
            if (fallback) {
                fallback.call(this, ...args);
            }
            callbacks.forEach(cb => cb.call(this, ...args));
        };

        // Wrap callbacks in try/catch and delegate errors to fallback
        const useTryCatchCallback = (fallback, ...callbacks) => function (...args) {
            try {
                callbacks.forEach(cb => cb?.call(this, ...args));
            } catch (error) {
                fallback?.call(this, ...args, error);
            }
        };

        const getWidgetByName = (node, name) => node.widgets.find(w => w.name === name);

        const doesInputWithNameLink = (node, inputName, ignoreIfEmpty) =>
            node.inputs && node.inputs.some(input => input.name === inputName && input.link && !ignoreIfEmpty);

        const getWidgetValue = (node, index = 0) => {
            if (!node) return undefined;
            const widget = node.widgets?.[index];
            if (widget) return widget.value;
            return node.widgets_values ? node.widgets_values?.[index] : node.widgets?.[index]?.value;
        };

        const updateNodeHeight = (node) => node.setSize([node.size[0], node.computeSize()[1]]);

        const getSelectedNodes = () => {
            try {
                return Object.values(graph?.list_of_graphcanvas?.[0]?.selected_nodes);
            } catch {
                return [];
            }
        };

        const getNodeById = (id) => graph.getNodeById(id);
        const getLinks = () => graph.links ?? [];
        const getLinkById = (id, links = getLinks()) => links[id];
        const getAllNodes = () => graph._nodes ?? [];
        // const formatVariables = (text) => text.toLowerCase().replace(/_./g, m => m.replace("_", "").toUpperCase());
        const formatVariables = (text) => text.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
        const isGetTwinNode = (node) => node.type === "GetTwinNodes";
        const isSetTwinNode = (node) => node.type === "SetTwinNodes";
        const isGetSetTwinNode = (node) => isGetTwinNode(node) || isSetTwinNode(node);
        const getGetSetTwinNodes = (nodes = getAllNodes()) => nodes.filter(n => isGetSetTwinNode(n));

        // Support detection for KJNodes and EasyUse Get/Set nodes
        const KJ_SET_TYPE = "SetNode";
        const EASY_USE_SET_TYPE = "easy setNode";
        const toGetType = (setType) => {
            if (!setType || typeof setType !== "string") return setType;
            // Replace the first occurrence of "set"/"Set" with "get"/"Get"
            return setType.replace(/set/i, (m) => (m[0] === "S" ? "Get" : "get"));
        };
        const isKJSetNode = (node) => node?.type === KJ_SET_TYPE;
        const isEasyUseSetNode = (node) => node?.type === EASY_USE_SET_TYPE;
        const isKJGetNode = (node) => node?.type === toGetType(KJ_SET_TYPE);          // "GetNode"
        const isEasyUseGetNode = (node) => node?.type === toGetType(EASY_USE_SET_TYPE); // "easy getNode"

        const isAnyGetNode = (node) => node?.type === isGetTwinNode(node) || isKJGetNode(node) || isEasyUseGetNode(node);
        const isAnySetNode = (node) => isGetTwinNode(node) || isKJSetNode(node) || isEasyUseSetNode(node);
        const isAnyGetSetNode = (node) => isAnyGetNode(node) || isAnySetNode(node);
        const getAnyGetSetNodes = (nodes = getAllNodes()) => nodes.filter(n => isAnyGetSetNode(n))
            .sort((a, b) => {
                // isGetSetTwinNode nodes first
                if (isGetSetTwinNode(a) && !isGetSetTwinNode(b)) return -1;
                if (!isGetSetTwinNode(a) && isGetSetTwinNode(b)) return 1;
                // Then sort by id
                return a.id - b.id;
            });


        const easySetWidgetValue = (node, value, index = 0) => {
            if (!node.widgets_values) node.widgets_values = [];
            node.widgets_values[index] = value;
            node.widgets[index].value = value;
            return node.widgets[index];
        };

        const graphAdd = (node) => graph.add(node);
        const graphRemove = (node) => graph.remove(node);

        /**
         * Recursively traverses through a series of reroute nodes to find the originating non-reroute node and slot index.
         *
         * If the provided node is not of type "Reroute", the function immediately returns the node and slot index.
         * If the node is a reroute node, the function will recursively follow the input links
         * of the reroute nodes to find the originating node that is not of type "Reroute".
         *
         * The reroute node is scheduled for removal from the graph once it is processed.
         *
         * @param {Object} node - The node to start traversing from. This can be a reroute node or any other type of node.
         * @param {number} [slotIndex=0] - The slot index associated with the given node, defaulting to 0.
         * @returns {Array} An array containing the resolved node (non-reroute) and its associated slot index.
         */
        const traverseInputReroute = (node, slotIndex = 0) => {
            if (node.type !== "Reroute") return [node, slotIndex];

            const reroute = node;
            const inputLinkId = reroute.inputs?.[0]?.link;
            if (!inputLinkId) return [reroute, slotIndex];

            const link = getLinkById(inputLinkId);
            if (!link) return [reroute, slotIndex];

            const upstream = getNodeById(link.origin_id);
            if (!upstream) return [reroute, slotIndex];

            setTimeout(() => {
                graphRemove(reroute);
            });

            return traverseInputReroute(upstream, link.origin_slot);
        };

        const traverseOutputReroute = (node) => {
            if (node.type !== "Reroute") return node;

            const reroute = node;
            const outputLinks = reroute.outputs?.[0]?.links;
            if (!outputLinks) return reroute;

            const firstLinkId = outputLinks[0];
            if (!firstLinkId) return reroute;

            const link = getLinkById(firstLinkId);
            if (!link) return reroute;

            const downstream = getNodeById(link.target_id);
            if (!downstream) return reroute;

            if (reroute.outputs[0].links?.length === 1) {
                setTimeout(() => {
                    graphRemove(reroute);
                });
            }

            return traverseOutputReroute(downstream);
        };

        /**
         * Converts a standard link between nodes into a "Get" and "Set" node connection,
         * allowing for easier data management through variable-like connections in the graph.
         *
         * @param {Object} link - The link object representing the connection between two nodes.
         * @param {boolean} excludeIfAlreadyGetSet - Optional. A flag indicating whether nodes that are
         *     already "Get" or "Set" types should be skipped during conversion. Defaults to `false`.
         * @returns {boolean|undefined} Returns `false` if the conversion fails for any reason, or `undefined` otherwise.
         *
         * The function performs the following operations:
         * - Validates the link type and retrieves the origin/target nodes from the given link.
         * - Resolves "Reroute" nodes for origin and target, if present, and adjusts the relevant slots.
         * - Ensures that the origin and target nodes are valid and skips processing if they are already
         *   "Get" or "Set" nodes (based on the `excludeIfAlreadyGetSet` parameter).
         * - Constructs variable names for the new "Get" and "Set" nodes using target node input names,
         *   origin outputs, or a fallback "_from_..._to_..." suffix.
         * - Checks for existing "Set" nodes linked to the origin node and ensures no naming conflicts
         *   occur for the variable.
         * - If no existing "Set" node is found, creates a new "Set" node connected to the specified graph
         *   and links the origin node to it.
         * - Creates a corresponding "Get" node linked to the target node input slot.
         * - Sets appropriate widget values, node positions, and flags for the newly created nodes.
         */
        const convertLinkToGetSetNode = (link, excludeIfAlreadyGetSet = false) => {
            const { type } = link;
            if (type === "*") return;

            let { origin_id: originId, target_id: targetId, origin_slot: originSlot, target_slot: targetSlot } = link;

            let originNode = getNodeById(originId);
            let targetNode = getNodeById(targetId);
            if (!originNode || !targetNode) return false;

            // Resolve Reroute at origin
            if (originNode.type === "Reroute") {
                let resolvedSlot;
                [originNode, resolvedSlot] = traverseInputReroute(originNode);
                originId = originNode?.id;
                originSlot = resolvedSlot;
                if (originSlot === undefined || originSlot === -1) originSlot = 0;
            }

            // Resolve Reroute at target
            if (targetNode.type === "Reroute") {
                targetNode = traverseOutputReroute(targetNode);
                targetId = targetNode?.id;
                targetSlot = targetNode?.inputs.findIndex(inp => inp.type === type);
                if (targetSlot === undefined || targetSlot === -1) targetSlot = 0;
            }

            if (originId === undefined || targetId === undefined || !originNode || !targetNode) return false;

            if (excludeIfAlreadyGetSet && (isGetSetTwinNode(originNode) || isGetSetTwinNode(targetNode))) return false;

            const fromToSuffix = `_from_${originId}_to_${targetId}`;
            let variableName = formatVariables(targetNode.getInputInfo(targetSlot)?.name ?? type.toLowerCase());
            Logger.log({
                class: 'ovum.contextmenu',
                method: 'convertLinkToGetSetNode',
                severity: 'trace',
                tag: 'variableName',
                nodeName: 'ovum.contextmenu'
            }, `1variableName = '${variableName}'`);

            if (!variableName) {
                const outName = originNode.outputs?.[originSlot]?.name;
                const outType = originNode.outputs?.[originSlot]?.type?.toString();
                variableName = formatVariables(outName ?? outType ?? fromToSuffix);
                Logger.log({
                    class: 'ovum.contextmenu',
                    method: 'convertLinkToGetSetNode',
                    severity: 'trace',
                    tag: 'variableName',
                    nodeName: 'ovum.contextmenu'
                }, `2variableName = '${variableName}'`);
            }

            let hasConflict = false;
            let foundExisting = false;

            if (isGetSetTwinNode(originNode)) {
                variableName = getWidgetValue(originNode);
                Logger.log({
                    class: 'ovum.contextmenu',
                    method: 'convertLinkToGetSetNode',
                    severity: 'trace',
                    tag: 'variableName',
                    nodeName: 'ovum.contextmenu'
                }, `3variableName = '${variableName}'`);
                foundExisting = true;
            } else {
                const originOutputLinks = originNode.outputs?.[originSlot]?.links;
                if (originOutputLinks) {
                    for (const linkId of originOutputLinks) {
                        /** @type {LLink} */
                        const l = getLinkById(linkId);
                        const maybeSet = getNodeById(l?.target_id ?? -1);
                        if (maybeSet && isSetTwinNode(maybeSet)) {
                            variableName = getWidgetValue(maybeSet);
                            Logger.log({
                                class: 'ovum.contextmenu',
                                method: 'convertLinkToGetSetNode',
                                severity: 'trace',
                                tag: 'variableName',
                                nodeName: 'ovum.contextmenu'
                            }, `4variableName = '${variableName}'`);
                            foundExisting = true;
                        }
                    }
                }

                if (!foundExisting) {
                    for (const node of getGetSetTwinNodes()) {
                        if (!(variableName === getWidgetValue(node) && isSetTwinNode(node))) continue;
                        const incomingLinkId = node.inputs[0]?.link;
                        const incomingLink = getLinkById(incomingLinkId);
                        if (incomingLink?.origin_id === originNode.id) {
                            foundExisting = true;
                        } else {
                            hasConflict = true;
                        }
                    }
                    if (hasConflict) {
                        variableName += fromToSuffix;
                        Logger.log({
                            class: 'ovum.contextmenu',
                            method: 'convertLinkToGetSetNode',
                            severity: 'trace',
                            tag: 'variableName',
                            nodeName: 'ovum.contextmenu'
                        }, `5variableName = '${variableName}'`);
                    }
                }
            }

            if (!foundExisting) {
                /** @type {SetTwinNodes} */
                const setNode = LiteGraph.createNode("SetTwinNodes");
                setNode.is_auto_link = true;

                const [x, y] = originNode.getConnectionPos(false, originSlot);
                setNode.pos = [x + 20, y + 15];

                // setNode.setInputAndOutput(0, { name: variableName, type })
                // setNode.inputs[0].name = variableName;
                // setNode.inputs[0].type = type;
                // setNode.inputs[0].widget = targetNode.inputs[targetSlot].widget;

                graphAdd(setNode);
                Logger.log({
                    class: 'ovum.contextmenu',
                    method: 'convertLinkToGetSetNode',
                    severity: 'trace',
                    tag: 'variableName',
                    nodeName: 'ovum.contextmenu'
                }, `6variableName = '${variableName}'`);
                // setTimeout(() => {
                    // (value, canvas, node,...
                    const w = easySetWidgetValue(setNode, variableName);
                    Logger.log({
                        class: 'ovum.contextmenu',
                        method: 'convertLinkToGetSetNode',
                        severity: 'trace',
                        tag: 'setWidgetValue',
                        nodeName: 'ovum.contextmenu',
                    }, `setNode: setWidgetValue(${variableName}) returned widget`, w);
                    setNode.widgets[0].callback(variableName, app.canvas, setNode);
                // }, 0);
                setNode.flags.collapsed = true;

                let savedWidgetValues = [];
                if (originNode.widgets) {
                    savedWidgetValues = Object.values(originNode.widgets).map(w => w.value);
                } else if (originNode.widgets_values) {
                    savedWidgetValues = JSON.parse(JSON.stringify(originNode.widgets_values));
                }
                Logger.log({
                    class: 'ovum.contextmenu',
                    method: 'convertLinkToGetSetNode',
                    severity: 'trace',
                    tag: '',
                    nodeName: 'ovum.contextmenu'
                }, "convertLinkToGetSetNode", originNode, targetNode, originSlot, targetSlot, variableName, savedWidgetValues);

                originNode.connect(originSlot, setNode, 0);
                originNode.widgets_values = savedWidgetValues;

                if (originNode.type === "PrimitiveNode") {
                    setTimeout(() => {
                        if (originNode) {
                            originNode.connect(originSlot, setNode, 0);
                            for (const [idx, val] of savedWidgetValues.entries()) {
                                easySetWidgetValue(originNode, val, idx);
                            }
                            if (setNode !== null) setNode.setSize(setNode.computeSize());
                        }
                    });
                }
            }

            /** @type {GetTwinNodes} */
            const getNode = LiteGraph.createNode("GetTwinNodes");
            const [tx, ty] = targetNode.getConnectionPos(true, targetSlot);
            getNode.pos = [tx - 150, ty + 15];

            // getNode.outputs[0].name = variableName;
            // getNode.outputs[0].type = type;
            // getNode.outputs[0].widget = targetNode.inputs[targetSlot].widget;

            graphAdd(getNode);
            // setWidgetValue(getNode, variableName);

            // graphAdd(setNode);
            // variableName = setWidgetValueWithValidation(setNode, variableName);
            // setTimeout(() => {
                // (value, canvas, node,...
                const w = easySetWidgetValue(getNode, variableName); // .callback(variableName, app.canvas, getNode);
                Logger.log({
                    class: 'ovum.contextmenu',
                    method: 'convertLinkToGetSetNode',
                    severity: 'trace',
                    tag: 'setWidgetValue',
                    nodeName: 'ovum.contextmenu',
                }, `getNode: setWidgetValue(${variableName}) returned widget`, w);
                getNode.widgets[0].callback(variableName, app.canvas, getNode);
            // }, 0);

            getNode.flags.collapsed = true;
            getNode.setSize(getNode.computeSize());
            getNode.connect(0, targetNode, targetSlot);
        };

        const originalHandler = LGraphCanvas.prototype.showLinkMenu;


        const orig = LGraphCanvas.prototype.getCanvasMenuOptions;
        LGraphCanvas.prototype.getCanvasMenuOptions = function () {
            const options = orig.apply(this, arguments);
            const nodes = app.graph._nodes;
            const types = nodes.reduce((p, n) => {
                if (n.type in p) {
                    p[n.type].push(n);
                } else {
                    p[n.type] = [n];
                }
                return p;
            }, {});
            options.push({
                content: "Select all nodes of type",
                has_submenu: true,
                submenu: {
                    options: Object.keys(types)
                        .sort()
                        .map((t) => ({
                            content: t,
                            callback: () => {
                                const nodes = GraphHelpers.getNodesByType(app.graph, t);
                                if (nodes.length) {
                                    app.canvas.selectNodes(nodes, false);
                                    app.canvas.fitViewToSelectionAnimated();
                                }
                            }
                        })),
                },
            });

            return options;
        };

        setTimeout(() => {
            LGraphCanvas.prototype.showLinkMenu = useTryCatchCallback(
                originalHandler,
                function (link, event) {
                    Logger.log({
                        class: 'ovum.contextmenu',
                        method: 'showLinkMenu',
                        severity: 'trace',
                        tag: '',
                        nodeName: 'ovum.contextmenu'
                    }, "showLinkMenu", link, event);

                    // If shift key is pressed, convert the link to a Get/Set pair
                    // Firstly, if the shift key is pressed, showLinkMenu won't even
                    // get called.  All the modifier keys have this result.
                    // TODO: Do something like that fancy alignment node I used that hijacks (configurable) ~ key
                    if (1 || event.shiftKey) {
                        convertLinkToGetSetNode(link);
                        return false;
                    }

                    // Otherwise, execute the original handler
                    originalHandler.apply(this, [link, event]);
                    return false;
                }
            );
        }, 1000);
    }
});
