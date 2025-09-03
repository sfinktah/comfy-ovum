/// <reference lib="es2015.collection" />
/** @typedef {import("@comfyorg/litegraph/dist/LGraphNode").LGraphNode} LGraphNode */
/** @typedef {import("@comfyorg/litegraph/dist/litegraph").LiteGraph} LiteGraph */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').LGraphCanvas} LGraphCanvas */

import { app } from "../../../scripts/app.js";
import {wrapWidgetValueSetter, getPreviousWidgetName, setColorAndBgColor} from "../01/twinnodeHelpers.js";

const LGraphNode = LiteGraph.LGraphNode
export class TwinNodes extends LGraphNode {
    defaultVisibility = true;
    serialize_widgets = true;
    drawConnection = false;
    slotColors = ["#fff", "#fff"];
    canvas = app?.canvas;
    isVirtualNode = true;
    numberOfInputSlots = 2;
    numberOfOutputSlots = 2;

    constructor(title) {
        super(title);
    }

    // Return the previous name recorded for the widget at index 'idx'
    getPreviousName(idx) {
        return getPreviousWidgetName(this, idx);
    }

    clone() {
        // Call parent clone and then recompute size
        const cloned = LiteGraph.LGraphNode.prototype.clone.apply(this);
        if (cloned && typeof cloned.computeSize === "function") {
            cloned.size = cloned.computeSize();
        }
        return cloned;
    }

    onAdded(graph) {
        if (Array.isArray(this.widgets)) {
            for (let i = 0; i < this.widgets.length; i++) {
                try {
                    wrapWidgetValueSetter(this.widgets[i]);
                } catch (_e) {}
            }
        }
    }

    updateTitle() {
        // To be overridden by subclasses
        console.log("[TwinNodes] updateTitle");
    }

    updateColors() {
        // Note: we don't actually have a settings panel yet
        if (app.ui.settings.getSettingValue("KJNodes.nodeAutoColor")) {
            const typesArr = (this.outputs || [])
                .filter(i => i?.type && i.type !== '*')
                .map(i => i.type);
            if (typesArr.length) setColorAndBgColor.call(this, typesArr);
            else console.log("[TwinNodes] updateColors: no outputs");
        } else {
            console.log("[TwinNodes] updateColors: disabled by settings");
        }
        app.canvas.setDirty(true, true);
    }
}
