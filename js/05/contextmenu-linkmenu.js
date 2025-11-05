/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').ComfyApp} ComfyApp */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').LiteGraph} LiteGraph */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').LGraphCanvas} LGraphCanvas */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").LLink} LLink */

import {app} from "../../../scripts/app.js";
import {GraphHelpers} from "../common/graphHelpersForTwinNodes.js";
import {LinkUtils} from "../common/linkUtils.js";
import { isGetTwinNode, isSetTwinNode, isGetSetTwinNode, isKJSetNode, isEasyUseSetNode, isKJGetNode, isEasyUseGetNode, isAnyGetNode, isAnySetNode, isAnyGetSetNode } from "../common/twinNodeTypes.js";

// Installs canvas context menu enhancements and link conversion handler
export function installLinkMenuEnhancements() {
    const graph = app.graph;

    // Compose multiple callbacks sequentially
    const useChainCallback = (fallback, ...callbacks) => function (...args) {
        if (fallback) fallback.call(this, ...args);
        callbacks.forEach(cb => cb?.call(this, ...args));
    };

    // Wrap callbacks in try/catch and delegate errors to fallback
    const useTryCatchCallback = (fallback, ...callbacks) => function (...args) {
        try {
            callbacks.forEach(cb => cb?.call(this, ...args));
        } catch (error) {
            fallback?.call(this, ...args, error);
        }
    };

    const getWidgetValue = (node, index = 0) => {
        if (!node) return undefined;
        const widget = node.widgets?.[index];
        if (widget) return widget.value;
        return node.widgets_values ? node.widgets_values?.[index] : node.widgets?.[index]?.value;
    };

    const getNodeById = (id) => graph.getNodeById(id);
    const getLinks = () => graph.links ?? [];
    const getLinkById = (id, links = getLinks()) => links[id];
    const getAllNodes = () => graph._nodes ?? [];
    const formatVariables = (text) => LinkUtils.formatVariables(text);

    const getAnyGetSetNodes = (nodes = getAllNodes()) => nodes.filter(n => isAnyGetSetNode(n))
        .sort((a, b) => {
            if (isGetSetTwinNode(a) && !isGetSetTwinNode(b)) return -1;
            if (!isGetSetTwinNode(a) && isGetSetTwinNode(b)) return 1;
            return a.id - b.id;
        });

    const easySetWidgetValue = (node, value, index = 0) => {
        if (!node.widgets_values) node.widgets_values = [];
        node.widgets_values[index] = value;
        node.widgets[index].value = value;
        return node.widgets[index];
    };

    // Reroute traversals
    const traverseInputReroute = (node, slotIndex = 0) => {
        if (node.type !== "Reroute") return [node, slotIndex];
        const reroute = node;
        const inputLinkId = reroute.inputs?.[0]?.link;
        if (!inputLinkId) return [reroute, slotIndex];
        const link = getLinkById(inputLinkId);
        if (!link) return [reroute, slotIndex];
        const upstream = getNodeById(link.origin_id);
        if (!upstream) return [reroute, slotIndex];
        setTimeout(() => { try { graph.remove(reroute) } catch (_) {} });
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
            setTimeout(() => { try { graph.remove(reroute) } catch (_) {} });
        }
        return traverseOutputReroute(downstream);
    };

    // Main conversion logic used by link context menu
    const convertLinkToGetSetNode = (link, excludeIfAlreadyGetSet = false, excludeAnyType = false) => {
        const { type } = link;
        if (excludeAnyType && type === "*") return;

        let { origin_id: originId, target_id: targetId, origin_slot: originSlot, target_slot: targetSlot } = link;

        let originNode = getNodeById(originId);
        let targetNode = getNodeById(targetId);
        if (!originNode || !targetNode) return false;

        if (originNode.type === "Reroute") {
            let resolvedSlot; [originNode, resolvedSlot] = LinkUtils.traverseInputReroute(graph, originNode);
            originId = originNode?.id; originSlot = resolvedSlot; if (originSlot === undefined || originSlot === -1) originSlot = 0;
        }
        if (targetNode.type === "Reroute") {
            targetNode = LinkUtils.traverseOutputReroute(graph, targetNode);
            targetId = targetNode?.id; targetSlot = targetNode?.inputs.findIndex(inp => inp.type === type);
            if (targetSlot === undefined || targetSlot === -1) targetSlot = 0;
        }

        if (originId === undefined || targetId === undefined || !originNode || !targetNode) return false;
        if (excludeIfAlreadyGetSet && (isGetSetTwinNode(originNode) || isGetSetTwinNode(targetNode))) return false;

        const fromToSuffix = `_from_${originId}_to_${targetId}`;
        let variableName = formatVariables(targetNode.getInputInfo(targetSlot)?.name ?? type.toLowerCase());
        Logger.log({ class: 'ovum.contextmenu', method: 'convertLinkToGetSetNode', severity: 'trace', tag: 'variableName', nodeName: 'ovum.contextmenu' }, `1variableName = '${variableName}'`);

        if (!variableName) {
            const outName = originNode.outputs?.[originSlot]?.name;
            const outType = originNode.outputs?.[originSlot]?.type?.toString();
            variableName = formatVariables(outName ?? outType ?? fromToSuffix);
            Logger.log({ class: 'ovum.contextmenu', method: 'convertLinkToGetSetNode', severity: 'trace', tag: 'variableName', nodeName: 'ovum.contextmenu' }, `2variableName = '${variableName}'`);
        }

        let hasConflict = false;
        let foundExisting = false;

        if (isGetSetTwinNode(originNode)) {
            variableName = getWidgetValue(originNode);
            Logger.log({ class: 'ovum.contextmenu', method: 'convertLinkToGetSetNode', severity: 'trace', tag: 'variableName', nodeName: 'ovum.contextmenu' }, `3variableName = '${variableName}'`);
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
                        Logger.log({ class: 'ovum.contextmenu', method: 'convertLinkToGetSetNode', severity: 'trace', tag: 'variableName', nodeName: 'ovum.contextmenu' }, `4variableName = '${variableName}'`);
                        foundExisting = true;
                    }
                }
            }

            if (!foundExisting) {
                for (const node of getAnyGetSetNodes()) {
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
                    Logger.log({ class: 'ovum.contextmenu', method: 'convertLinkToGetSetNode', severity: 'trace', tag: 'variableName', nodeName: 'ovum.contextmenu' }, `5variableName = '${variableName}'`);
                }
            }
        }

        if (!foundExisting) {
            /** @type {SetTwinNodes} */
            const setNode = LiteGraph.createNode("SetTwinNodes");
            setNode.is_auto_link = true;
            const [x, y] = originNode.getConnectionPos(false, originSlot);
            setNode.pos = [x + 20, y + 15];
            graph.add(setNode);
            Logger.log({ class: 'ovum.contextmenu', method: 'convertLinkToGetSetNode', severity: 'trace', tag: 'variableName', nodeName: 'ovum.contextmenu' }, `6variableName = '${variableName}'`);
            const w = easySetWidgetValue(setNode, variableName);
            Logger.log({ class: 'ovum.contextmenu', method: 'convertLinkToGetSetNode', severity: 'trace', tag: 'setWidgetValue', nodeName: 'ovum.contextmenu' }, `setNode: setWidgetValue(${variableName}) returned widget`, w);
            setNode.widgets[0].callback(variableName, app.canvas, setNode);
            setNode.flags.collapsed = true;

            let savedWidgetValues = [];
            if (originNode.widgets) {
                savedWidgetValues = Object.values(originNode.widgets).map(w => w.value);
            } else if (originNode.widgets_values) {
                savedWidgetValues = JSON.parse(JSON.stringify(originNode.widgets_values));
            }
            Logger.log({ class: 'ovum.contextmenu', method: 'convertLinkToGetSetNode', severity: 'trace', tag: '', nodeName: 'ovum.contextmenu' }, "convertLinkToGetSetNode", originNode, targetNode, originSlot, targetSlot, variableName, savedWidgetValues);

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
        graph.add(getNode);
        const w = easySetWidgetValue(getNode, variableName);
        Logger.log({ class: 'ovum.contextmenu', method: 'convertLinkToGetSetNode', severity: 'trace', tag: 'setWidgetValue', nodeName: 'ovum.contextmenu' }, `getNode: setWidgetValue(${variableName}) returned widget`, w);
        getNode.widgets[0].callback(variableName, app.canvas, getNode);
        getNode.flags.collapsed = true;
        getNode.setSize(getNode.computeSize());
        getNode.connect(0, targetNode, targetSlot);
    };

    // Canvas menu option: Select all nodes of type
    const orig = LGraphCanvas.prototype.getCanvasMenuOptions;
    LGraphCanvas.prototype.getCanvasMenuOptions = function () {
        const options = orig.apply(this, arguments);
        const nodes = app.graph._nodes;
        const types = nodes.reduce((p, n) => {
            if (n.type in p) p[n.type].push(n); else p[n.type] = [n];
            return p;
        }, {});
        options.push({
            content: "🥚 Select all nodes of type",
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

    // Link context menu: intercept to optionally create Get/Set on click
    const originalHandler = LGraphCanvas.prototype.showLinkMenu;
    setTimeout(() => {
        LGraphCanvas.prototype.showLinkMenu = useTryCatchCallback(
            originalHandler,
            function (link, event) {
                Logger.log({ class: 'ovum.contextmenu', method: 'showLinkMenu', severity: 'trace', tag: '', nodeName: 'ovum.contextmenu' }, "showLinkMenu", link, event);
                const enabled = app?.ui?.settings?.getSettingValue?.("ovum.makeTwinNodesLinkClick");
                if (enabled) { convertLinkToGetSetNode(link); return false; }
                originalHandler.apply(this, [link, event]);
                return false;
            }
        );
    }, 1000);
}
