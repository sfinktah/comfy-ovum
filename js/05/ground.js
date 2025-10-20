/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */

import {app} from "../../../scripts/app.js";
import {ensureDynamicInputsImpl} from "../01/dynamicInputHelpers.js";
// import {LGraphCanvas} from "@comfyorg/litegraph";

app.registerExtension({
    name: "ovum.ground",

    /**
     * @param {import("../../typings/ComfyNode").ComfyNode} nodeType
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} nodeData
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} appInstance
     */
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeType.comfyClass !== "Ground") return;

        nodeType.prototype.ovumDraw = function(ctx) {
        }

        // Ensure no outputs
        nodeType.prototype.onNodeCreated = function() {
            // Clear any outputs that backend might add defensively
            if (this.outputs && this.outputs.length) {
                this.outputs.length = 0;
            }
            // Ensure there is at least arg0 and label it
            ensureDynamicInputsImpl(this, false);
            if (this.inputs) {
                let i = 1;
                for (const inp of this.inputs) {
                    if (typeof inp.name === "string" && /^arg\d+$/.test(inp.name)) {
                        inp.label = '  ';
                        i++;
                    }
                }
            }
            // Initial size tuned for circular draw
            this.size = this.computeSize ? this.computeSize() : [100, 110];
            this.title = "GND";
        };

        // Dynamic inputs management: rename to gnd_1, gnd_2 ... and append/remove
        const origOnConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info, inputOrOutput) {
            // Reuse helper to maintain argN scaffold
            ensureDynamicInputsImpl(this, connected);
            // Relabel dynamic argN to gnd_# for UI
            if (this.inputs) {
                let displayIndex = 1;
                for (const inp of this.inputs) {
                    if (typeof inp.name === "string" && /^arg\d+$/.test(inp.name)) {
                        inp.label = "  ";
                        displayIndex++;
                    }
                }
            }
            // Recompute size so all sockets fit and icon remains centered relative to inputs
            if (typeof this.computeSize === "function") {
                const newSize = this.computeSize();
                if (Array.isArray(newSize) && (newSize[0] !== this.size[0] || newSize[1] !== this.size[1])) {
                    this.size = newSize;
                }
            }
            this.setDirtyCanvas(true, true);
            if (origOnConnectionsChange) return origOnConnectionsChange.apply(this, arguments);
        };

        // Fully custom drawing: draw a white circle with a ground symbol inside
        nodeType.prototype.onDrawBackground = function(ctx, graphcanvas, diagramCanvas) {
            if (this.flags.collapsed) { return; }
            const [w, h] = this.size;
            const r = Math.min(w, h) * 0.45;
            const cx = w / 2; const cy = h / 2;

            // white circle
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = this.selected ? "#00bcd4" : "#333";
            ctx.stroke();

            // ground symbol: three horizontal lines decreasing width, centered, scaled 2x and rotated 90deg CCW
            // ctx.translate(cx, cy + r * 0.05);
            ctx.translate(cx + r * 0.25, cy + r * 0.05);
            ctx.rotate(-Math.PI / 2);
            ctx.scale(2, 2);
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 1;
            const widths = [0.6, 0.4, 0.24];
            let y = -r * 0.15;
            for (const frac of widths) {
                const half = (r * frac) / 2;
                ctx.beginPath();
                ctx.moveTo(-half, y);
                ctx.lineTo(half, y);
                ctx.stroke();
                y += r * 0.12;
            }
            // vertical lead up
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.38);
            ctx.lineTo(0, -r * 0.18);
            ctx.stroke();

            ctx.restore();
        };

        // Disable default title box drawing by reporting a small header height
        nodeType.prototype.onDrawForeground = function(ctx) {
            // Skip default text to keep it icon-like; optionally show small label
            if (this.flags?.collapsed) return;
        };

        // Make size adapt to number of inputs so all sockets fit inside and circle stays centered
        const origComputeSize = nodeType.prototype.computeSize;
        nodeType.prototype.computeSize = function() {
            const slotH = (typeof LiteGraph !== "undefined" && LiteGraph.NODE_SLOT_HEIGHT) ? LiteGraph.NODE_SLOT_HEIGHT : 20;
            const titleH = (typeof LiteGraph !== "undefined" && LiteGraph.NODE_TITLE_HEIGHT) ? LiteGraph.NODE_TITLE_HEIGHT : 16;
            const numInputs = Array.isArray(this.inputs) ? this.inputs.length : 0;
            // symmetric padding keeps the icon vertically centered relative to input positions
            const pad = Math.max(12, Math.round(slotH * 0.75));
            const minW = 80;
            const minH = 80;
            const slotsH = numInputs > 0 ? (numInputs * slotH) : 0;
            // Balance the title/header height by adding the same space below the inputs so the circle stays centered.
            const totalH = slotsH + (pad * 2) - (titleH * 1);
            const h = Math.max(minH, totalH);
            // Keep width constant: use current width if set, otherwise minW. Do not expand with height.
            const currentW = (this.size && Array.isArray(this.size) && Number.isFinite(this.size[0])) ? this.size[0] : minW;
            const w = Math.max(minW, currentW);
            return [w, h];
        };

        // Ensure initial size after creation reflects inputs count
        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (typeof origOnNodeCreated === "function") origOnNodeCreated.apply(this, arguments);
            // Clear any outputs that backend might add defensively
            if (this.outputs && this.outputs.length) {
                this.outputs.length = 0;
            }
            // Ensure at least arg0 and label it
            ensureDynamicInputsImpl(this, false);
            if (this.inputs) {
                let i = 1;
                for (const inp of this.inputs) {
                    if (typeof inp.name === "string" && /^arg\d+$/.test(inp.name)) {
                        inp.label = '  ';
                        i++;
                    }
                }
            }
            this.size = this.computeSize ? this.computeSize() : [100, 110];
            this.title = "GND";
        };
    },
});

const oldDrawNode = LGraphCanvas.prototype.drawNode;
LGraphCanvas.prototype.drawNode = function (node, ctx) {
    if (node.ovumDraw) {
        node.bgcolor = "transparent";
        node.color = "transparent";
        const v = oldDrawNode.apply(this, arguments);
        node.ovumDraw(ctx);
        return v;
    }
    const v = oldDrawNode.apply(this, arguments);
    return v;
};
