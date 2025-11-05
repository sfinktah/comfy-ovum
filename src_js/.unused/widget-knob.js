/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */

import { app } from "../../../scripts/app.js";

const LiteGraph = /** @type {LiteGraph} */ (window.LiteGraph);

// Frontend-only knob node that outputs a NUMBER and provides a circular UI control
function WidgetKnob() {
    // Single NUMBER output
    this.addOutput("value", "NUMBER");

    // Size and properties
    this.size = [80, 100];
    this.properties = {
        min: 0,
        max: 1,
        value: 0.5,
        color: "#7AF",
        precision: 2
    };

    // Internal normalized value (0..1), -1 means not initialized
    this.value = -1;

    // Make sure widget state is saved with the graph
    this.serialize_widgets = true;
}

WidgetKnob.title = "Knob";
WidgetKnob.desc = "Circular controller";
WidgetKnob.category = "widget";

WidgetKnob.prototype.onNodeCreated = function () {
    // Mark as frontend-only node
    this.isVirtualNode = true;
};

WidgetKnob.prototype.onDrawForeground = function (ctx) {
    if (this.flags?.collapsed) return;

    if (this.value === -1) {
        this.value =
            (this.properties.value - this.properties.min) /
            Math.max(1e-12, (this.properties.max - this.properties.min));
        this.value = Math.min(1, Math.max(0, this.value));
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
    ctx.fillStyle = this.properties.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(
        0,
        0,
        radius - 4,
        0,
        Math.PI * 1.5 * Math.max(0.01, this.value)
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

    // Knob handle
    ctx.fillStyle = this.mouseOver ? "white" : this.properties.color;
    ctx.beginPath();
    const angle = this.value * Math.PI * 1.5 + Math.PI * 0.75;
    ctx.arc(
        center_x + Math.cos(angle) * radius * 0.65,
        center_y + Math.sin(angle) * radius * 0.65,
        radius * 0.05,
        0,
        Math.PI * 2,
        true
    );
    ctx.fill();

    // Value text
    ctx.fillStyle = this.mouseOver ? "white" : "#AAA";
    ctx.font = Math.floor(radius * 0.5) + "px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
        Number(this.properties.value).toFixed(this.properties.precision),
        center_x,
        center_y + radius * 0.15
    );
};

WidgetKnob.prototype.onExecute = function () {
    // Provide current value on the output
    this.setOutputData?.(0, this.properties.value);

    // Box color based on normalized value
    if (LiteGraph?.colorToString) {
        this.boxcolor = LiteGraph.colorToString([this.value, this.value, this.value]);
    }
};

WidgetKnob.prototype.onMouseDown = function (e) {
    this.center = [this.size[0] * 0.5, this.size[1] * 0.5 + 20];
    this.radius = this.size[0] * 0.5;
    if (
        e.canvasY - this.pos[1] < 20 ||
        LiteGraph.distance(
            [e.canvasX, e.canvasY],
            [this.pos[0] + this.center[0], this.pos[1] + this.center[1]]
        ) > this.radius
    ) {
        return false;
    }
    this.oldmouse = [e.canvasX - this.pos[0], e.canvasY - this.pos[1]];
    this.captureInput?.(true);
    return true;
};

WidgetKnob.prototype.onMouseMove = function (e) {
    if (!this.oldmouse) return;

    const m = [e.canvasX - this.pos[0], e.canvasY - this.pos[1]];

    let v = this.value;
    v -= (m[1] - this.oldmouse[1]) * 0.01;
    v = Math.min(1, Math.max(0, v));

    this.value = v;

    // Map normalized value back to property range
    const min = Number(this.properties.min) || 0;
    const max = Number(this.properties.max) || 1;
    const raw = min + (max - min) * this.value;

    // Apply precision
    const prec = Math.max(0, Number(this.properties.precision) || 0);
    const factor = Math.pow(10, prec);
    this.properties.value = Math.round(raw * factor) / factor;

    this.oldmouse = m;
    this.setDirtyCanvas?.(true);
};

WidgetKnob.prototype.onMouseUp = function () {
    if (this.oldmouse) {
        this.oldmouse = null;
        this.captureInput?.(false);
    }
};

WidgetKnob.prototype.onPropertyChanged = function (name, value) {
    if (name === "min" || name === "max" || name === "value" || name === "precision") {
        const num = parseFloat(value);
        if (!Number.isNaN(num)) {
            this.properties[name] = num;
            // Clamp and recompute normalized value when bounds or value change
            const min = Number(this.properties.min) || 0;
            const max = Number(this.properties.max) || 1;
            const val = Math.min(max, Math.max(min, Number(this.properties.value) || 0));
            this.properties.value = val;
            this.value = (val - min) / Math.max(1e-12, (max - min));
            this.value = Math.min(1, Math.max(0, this.value));
            this.setDirtyCanvas?.(true);
        }
        return true;
    }
};

// Register as a ComfyUI frontend extension
app.registerExtension({
    name: "ovum.widget.knob",
    setup() {
        if (!LiteGraph || !LiteGraph.registerNodeType) return;

        // Avoid duplicate registration
        const typePath = "widget/knob";
        if (!LiteGraph.registered_node_types || !LiteGraph.registered_node_types[typePath]) {
            LiteGraph.registerNodeType(typePath, WidgetKnob);
        }
    }
});