/// <reference lib="es2015.collection" />
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LiteGraph} LiteGraph */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LGraphCanvas} LGraphCanvas */

import {app} from "../../../scripts/app.js";
import {getPreviousWidgetName, setColorAndBgColor, wrapWidgetValueSetter} from "../01/twinnodeHelpers.js";
import {log, Logger} from "./logger.js";
import {uniq} from "../01/graphHelpers.js";

// const LGraphNode = LiteGraph.LGraphNode
export class TwinNodes extends LGraphNode {
    defaultVisibility = true;
    serialize_widgets = true;
    drawConnection = false;
    slotColors = ["#fff", "#fff"];
    canvas = app?.canvas;
    isVirtualNode = true;
    numberOfInputSlots = 2;
    numberOfOutputSlots = 2;
    numberOfWidgets = 2;
    colors = [];

    constructor(title) {
        super(title);
    }

    // Return the previous name recorded for the widget at widgetIndex 'idx'
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
        Logger.log({ class: 'TwinNodes', method: 'updateTitle', severity: 'debug', tag: 'function_entered' }, 'Method called');
    }

    updateColors() {
        // Note: we don't actually have a settings panel yet
        if (app.ui.settings.getSettingValue("ovum.nodeAutoColor")) {
            const typesArr = uniq((this.outputs || [])
                .filter(o => o?.type && o.type !== '*')
                .map(o => o.type));
            if (typesArr.length) {
                Logger.log({ class: 'TwinNodes', method: 'updateColors', severity: 'debug', tag: 'type color outputs' }, 'types filtered: ', typesArr.join(','));
                setColorAndBgColor.call(this, typesArr);
            }
            else Logger.log({ class: 'TwinNodes', method: 'updateColors', severity: 'debug', tag: 'no_outputs' }, 'No outputs found for color computation');
        } else {
            Logger.log({ class: 'TwinNodes', method: 'updateColors', severity: 'info', tag: 'settings' }, 'Node auto-coloring disabled by settings');
        }
        app.canvas.setDirty(true, true);
    }

    checkConnections() {};

    /**
     * Called to render custom content behind the node body (but not the title).
     * If two or more colors are present in this.colors, draw a vertical gradient between their bgcolors.
     * Excludes the title area (seems to be enforced)
     * @param {CanvasRenderingContext2D} ctx
     */
    onDrawBackground(ctx) {
        if (this.flags && this.flags.collapsed) return;
        try {
            const colors = Array.isArray(this.properties?.bgcolors) ? this.properties.bgcolors : [];
            if (colors.length < 2 || colors[0] === colors[1]) return;
            if (!this.size || this.size.length < 2) return;
            if (this.flags && this.flags.collapsed) return;

            // const titleH = (LiteGraph && LiteGraph.NODE_TITLE_HEIGHT) ? LiteGraph.NODE_TITLE_HEIGHT : 30;
            const titleH = 0; // doesn't seem to need to be offset
            const x = 0;
            const y = titleH;
            const w = this.size[0] || 0;
            const h = Math.max(0, (this.size[1] || 0) - titleH);
            if (w <= 0 || h <= 0) return;

            const bg1 = colors[0] || this.bgcolor;
            const bg2 = colors[1] || this.bgcolor;

            const grad = ctx.createLinearGradient(0, y, 0, y + h);
            grad.addColorStop(0, bg1);
            grad.addColorStop(1, bg2);

            ctx.save();
            ctx.fillStyle = grad;

            const r = 6; // bottom corner radius

            if (typeof ctx.roundRect === "function") {
                // Draw only the body: top corners radius 0 to avoid title area, bottom corners rounded
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, [0, 0, r, r]);
                ctx.fill();
            } else {
                // Fallback: manual path with rounded bottom corners
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + w, y);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        } catch (_e) {
            // Defensive: never break canvas draw loop
        }
    }


    setOutput(index, overrides = {}) {
        if (this.outputs?.[index]) {
            Object.keys(overrides).forEach(key => {
                if (key !== 'label' && key in this.outputs[index]) {
                    this.outputs[index][key] = overrides[key];
                }
            });
        }
    }

    setInput(index, overrides = {}) {
        if (this.inputs?.[index]) {
            Object.keys(overrides).forEach(key => {
                if (key === 'type') {
                    this.setType(overrides.type, index);
                }
                else if (key !== 'label' && key in this.inputs[index]) {
                    this.inputs[index][key] = overrides[key];
                }
            });
        }
    }

    resetOutput(index, overrides = {}) {
        const defaults = {type: '*', name: '*'};
        const finalOverrides = {...defaults, ...overrides};
        this.setOutput(index, finalOverrides);
    }

    resetInput(index, overrides = {}) {
        log({class: "SetTwinNodes", method: "resetInput", severity: "trace", tag: "function_entered"}, overrides);
        const defaults = {type: '*', name: '*'};
        const finalOverrides = {...defaults, ...overrides};
        this.setInput(index, finalOverrides);
        log({class: "SetTwinNodes", method: "resetInput", severity: "trace", tag: "function_exit"}, {
            type: this.inputs?.[index]?.type,
            name: this.inputs?.[index]?.name,
            label: this.inputs?.[index]?.label
        });
    }
}
