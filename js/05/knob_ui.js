/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */

import { app } from "../../../scripts/app.js";
import { chainCallback } from "../01/utility.js";

/**
 * Utility to find a widget by name on a node.
 * @param {any} node
 * @param {string} name
 * @returns {any|null}
 */
function getWidget(node, name) {
    return (node.widgets || []).find(w => w && w.name === name) || null;
}

/**
 * Utility to get numeric value from properties first, then widget, then fallback.
 * For min/max/precision, prioritize properties. For value, prioritize widget.
 */
function getNum(node, name, fallback) {
    let v;
    if (name === 'value') {
        // For value, check widget first, then properties
        const w = getWidget(node, name);
        v = w?.value ?? node?.properties?.[name];
    } else {
        // For min/max/precision, check properties first, then widget
        v = node?.properties?.[name];
        if (v === undefined) {
            const w = getWidget(node, name);
            v = w?.value;
        }
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Utility to set a widget value and call its callback for consistency.
 */
function setWidgetValue(node, name, value) {
    const w = getWidget(node, name);
    if (!w) return;
    if (w.value !== value) {
        w.value = value;
        if (typeof w.callback === "function") {
            try {
                w.callback(w.value, node, app);
            } catch (_e) {}
        }
    }
}

app.registerExtension({
    name: "ovum.ui.knob",
    /**
     * @param {import("../../typings/ComfyNode").ComfyNode} nodeType
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} nodeData
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} appInstance
     */
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        // Bind only to our Python node
        if (!nodeData || nodeData.name !== "BigKnob") return;

        // Initialize per-instance state and defaults
        chainCallback(nodeType.prototype, "onNodeCreated", function () {
            if (!this.properties) this.properties = {};
            // Default visual color for the knob UI
            if (!this.properties.color) this.properties.color = "#7AF";
            // Default knob parameters as properties
            if (this.properties.min === undefined) this.properties.min = 0.0;
            if (this.properties.max === undefined) this.properties.max = 1.0;
            if (this.properties.precision === undefined) this.properties.precision = 2;

            // Internal normalized value cache (0..1); -1 means uninitialized
            this.__knobNorm = -1;
            this.serialize_widgets = true;

            // Ensure sensible node size
            if (!Array.isArray(this.size) || this.size.length < 2) {
                this.size = [80, 100];
            } else {
                this.size[0] = Math.max(this.size[0] || 80, 80);
                this.size[1] = Math.max(this.size[1] || 100, 100);
            }
        });

        // Draw knob foreground (circular control)
        chainCallback(nodeType.prototype, "onDrawForeground", function (ctx) {
            if (this.flags?.collapsed) return;
            const mode = Number(this.mode ?? 0);
            const isMuted = mode === 2;
            const isBypassed = mode === 4;
            if (isMuted || isBypassed) return;

            const min = getNum(this, "min", 0);
            const max = getNum(this, "max", 1);
            const precision = Math.max(0, Number(getNum(this, "precision", 2)) | 0);
            let val = getNum(this, "value", 0.5);

            // Initialize normalized value from widget if needed
            if (this.__knobNorm === -1) {
                const denom = Math.max(1e-12, (max - min));
                this.__knobNorm = Math.min(1, Math.max(0, (val - min) / denom));
            }

            const center_x = this.size[0] * 0.5;
            const center_y = this.size[1] * 0.5;
            const radius = Math.min(this.size[0], this.size[1]) * 0.5 - 5;

            ctx.globalAlpha = 1;
            ctx.save();
            ctx.translate(center_x, center_y);
            ctx.rotate(Math.PI * 0.75);

            // Background arc
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius, 0, Math.PI * 1.5);
            ctx.fill();

            // Value arc
            ctx.strokeStyle = "black";
            ctx.fillStyle = this.properties.color || "#7AF";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(
                0,
                0,
                radius - 4,
                0,
                Math.PI * 1.5 * Math.max(0.01, this.__knobNorm)
            );
            ctx.closePath();
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.globalAlpha = 1;
            ctx.restore();

            // Inner circle
            ctx.fillStyle = "black";
            ctx.beginPath();
            ctx.arc(center_x, center_y, radius * 0.75, 0, Math.PI * 2, true);
            ctx.fill();

            // BigKnob handle
            ctx.fillStyle = this.mouseOver ? "white" : (this.properties.color || "#7AF");
            ctx.beginPath();
            const angle = this.__knobNorm * Math.PI * 1.5 + Math.PI * 0.75;
            ctx.arc(
                center_x + Math.cos(angle) * radius * 0.65,
                center_y + Math.sin(angle) * radius * 0.65,
                radius * 0.05,
                0,
                Math.PI * 2,
                true
            );
            ctx.fill();

            // Value text (rounded)
            const denom = Math.max(1e-12, (max - min));
            val = min + denom * this.__knobNorm;
            const factor = Math.pow(10, precision);
            const rounded = Math.round(val * factor) / factor;

            ctx.fillStyle = this.mouseOver ? "white" : "#AAA";
            ctx.font = Math.floor(radius * 0.5) + "px Arial";
            ctx.textAlign = "center";
            ctx.fillText(String(rounded.toFixed(precision)), center_x, center_y + radius * 0.15);
        });

        // Mouse capture on the knob area to adjust value
        chainCallback(nodeType.prototype, "onMouseDown", function (e) {
            // Define knob hit area
            this.__knobCenter = [this.size[0] * 0.5, this.size[1] * 0.5 + 20];
            this.__knobRadius = this.size[0] * 0.5;

            const insideHeader = (e.canvasY - this.pos[1]) < 20;
            const dx = e.canvasX - (this.pos[0] + this.__knobCenter[0]);
            const dy = e.canvasY - (this.pos[1] + this.__knobCenter[1]);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (insideHeader || dist > this.__knobRadius) {
                return; // let other handlers run
            }

            this.__knobOldMouse = [e.canvasX - this.pos[0], e.canvasY - this.pos[1]];
            this.captureInput?.(true);
            // Stop propagation to prevent graph panning
            return true;
        });

        chainCallback(nodeType.prototype, "onMouseMove", function (e) {
            if (!this.__knobOldMouse) return;

            const m = [e.canvasX - this.pos[0], e.canvasY - this.pos[1]];
            let v = this.__knobNorm;
            v -= (m[1] - this.__knobOldMouse[1]) * 0.01; // vertical drag adjusts value
            v = Math.min(1, Math.max(0, v));
            this.__knobNorm = v;

            // Map normalized value back to widget "value"
            const min = getNum(this, "min", 0);
            const max = getNum(this, "max", 1);
            const precision = Math.max(0, Number(getNum(this, "precision", 2)) | 0);
            const denom = Math.max(1e-12, (max - min));
            const raw = min + denom * v;
            const factor = Math.pow(10, precision);
            const rounded = Math.round(raw * factor) / factor;

            setWidgetValue(this, "value", rounded);
            this.__knobOldMouse = m;
            this.setDirtyCanvas?.(true);
        });

        chainCallback(nodeType.prototype, "onMouseUp", function () {
            if (this.__knobOldMouse) {
                this.__knobOldMouse = null;
                this.captureInput?.(false);
            }
        });

        // Update the widget from backend execution (e.g., after clamping)
        chainCallback(nodeType.prototype, "onExecuted", function (message) {
            if (!message) return;

            if (Object.prototype.hasOwnProperty.call(message, "value")) {
                const newVal = Number(message.value);
                if (Number.isFinite(newVal)) {
                    const oldVal = getNum(this, "value", NaN);
                    if (oldVal !== newVal) {
                        setWidgetValue(this, "value", newVal);
                        // Reset normalized cache so it re-initializes from new value
                        this.__knobNorm = -1;
                        this.setDirtyCanvas?.(true);
                    }
                }
            }
        });
    },
});
