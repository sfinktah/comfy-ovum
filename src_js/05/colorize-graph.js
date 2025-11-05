/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LGraph} LGraph */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LGraphNode} LGraphNode */
/** @typedef {import('../../typings/ComfyNode').ComfyNode} ComfyNode */

import { app } from "../../../scripts/app.js";
import { setColorAndBgColor } from "../01/twinnodeHelpers.js";
import { chainCallback } from "../01/utility.js";
import { Logger } from "../common/logger.js";

// Registry of ColorizeGraph instances with auto-color enabled
const __autoColorEnabledNodes = new Set();
let __autoColorHookInstalled = false;

function ensureAutoColorHook() {
    if (__autoColorHookInstalled) return;
    __autoColorHookInstalled = true;
    try {
        // Chain graph-level onNodeAdded to observe all node additions
        chainCallback(app.graph || {}, "onNodeAdded", function (node) {
            try {
                if (!__autoColorEnabledNodes.size) return; // no listeners enabled
                if (!node) return;
                // Skip coloring the ColorizeGraph tool node itself
                if (node.constructor?.name === 'ColorizeGraphNode' || node.type === 'ColorizeGraph' || node.title === 'Colorize Graph') {
                    Logger.log({ class: 'ColorizeGraph', method: 'onNodeAdded', severity: 'debug', tag: 'skip self' }, 'New node added (self), skipping:', node?.title || node?.type || node?.id);
                    return;
                }

                const firstInType = Array.isArray(node.inputs) && node.inputs.length > 0 && !node.inputs[0]?.widget ? node.inputs[0]?.type : undefined;
                const firstOutType = (!firstInType && Array.isArray(node.outputs) && node.outputs.length > 0) ? node.outputs[0]?.type : undefined;
                const slotType = firstInType || firstOutType;

                let changed = false;
                if (slotType) {
                    try {
                        setColorAndBgColor.call(node, slotType);
                        changed = true;
                    } catch (e) {
                        Logger.log({ class: 'ColorizeGraph', method: 'onNodeAdded', severity: 'warn', tag: 'colorize' }, 'Failed to colorize new node', node?.title || node?.type || node?.id, e);
                    }
                }

                // Log all new nodes when feature is enabled
                Logger.log({ class: 'ColorizeGraph', method: 'onNodeAdded', severity: 'info', tag: ['node_added','auto_color'] },
                    'New node added:', node?.title || node?.type || node?.id, '| slotType:', slotType || '(none)', '| colored:', changed);

                // Refresh canvas if color changed
                if (changed) {
                    try { app?.canvas?.setDirty?.(true, true); } catch (_) {}
                    try { this?.setDirtyCanvas?.(true, true); } catch (_) {}
                }
            } catch (e) {
                // Never break graph add flow
                console.warn('[ovum.colorize-graph] onNodeAdded hook error', e);
            }
        });
    } catch (e) {
        console.warn('[ovum.colorize-graph] Failed to install onNodeAdded hook', e);
    }
}

class ColorizeGraphNode extends LGraphNode {
    isVirtualNode = true;
    constructor() {
        super();
        /** @type {LGraph} */
        this.graph = this.graph; // keep typing hint only
        /** Snapshot storage for undo */
        this._colorizeBackup = null;
        // Widgets
        this.addWidget("button", "Apply Colors", null, () => this.applyColors());
        this.addWidget("button", "Undo", null, () => this.undoColors());
        // Boolean widget to enable auto-coloring of newly added nodes
        if (!this.properties) this.properties = {};
        const initialAuto = !!this.properties.autoColorNewNodes;
        this._autoColorWidget = this.addWidget(
            "toggle",
            "Auto Color New Nodes",
            initialAuto,
            (value) => {
                const on = !!value;
                // Keep widget value in sync
                try { if (this._autoColorWidget) this._autoColorWidget.value = on; } catch (_) {}
                // Persist to properties and property system (if available)
                this.properties.autoColorNewNodes = on;
                try { this.setProperty && this.setProperty("autoColorNewNodes", on); } catch (_) {}
                // Apply effect
                this.setAutoColorEnabled(on);
            },
            { serialize: true }
        );
        this.properties.autoColorNewNodes = initialAuto;
        // this.serialize_widgets = true;
        // this.size = this.computeSize ? this.computeSize() : [280, 60];
        // Apply initial toggle state to registry
        setTimeout(() => {
            const value = this.properties.autoColorNewNodes;
            // this._autoColorWidget && (this._autoColorWidget.value = value);
            this.setAutoColorEnabled(value);
        }, 2000);
    }

    title = "Colorize Graph";

    /**
     * Iterate all nodes in the current graph and recolor them according to the
     * first input slot's type (if any) else the first output slot's type.
     */
    applyColors() {
        const graph = this.graph || app?.graph;
        if (!graph || !Array.isArray(graph._nodes)) return;

        // Only take a backup if we don't already have one (so Undo restores to original)
        if (!this._colorizeBackup) {
            this._colorizeBackup = [];
            for (const n of graph._nodes) {
                if (!n) continue;
                this._colorizeBackup.push({
                    id: n.id,
                    color: n.color,
                    bgcolor: n.bgcolor,
                    colors: Array.isArray(n.colors) ? [...n.colors] : n.colors,
                    props_bgcolors: n.properties && Array.isArray(n.properties.bgcolors) ? [...n.properties.bgcolors] : (n.properties ? n.properties.bgcolors : undefined),
                });
            }
        }

        for (const n of graph._nodes) {
            // Skip this tool node itself to avoid confusing recolor during use
            if (!n || n === this) continue;

            const firstInType = Array.isArray(n.inputs) && n.inputs.length > 0 && !n.inputs[0].widget ? n.inputs[0]?.type : undefined;
            const firstOutType = (!firstInType && Array.isArray(n.outputs) && n.outputs.length > 0) ? n.outputs[0]?.type : undefined;
            const slotType = firstInType || firstOutType;
            if (!slotType) continue;

            try {
                // Apply helper bound to node so it can set this.color/bgcolor
                setColorAndBgColor.call(n, slotType);
            } catch (e) {
                // ignore per-node errors and continue
                console.warn("[ovum.colorize-graph] Failed to colorize node", n?.type || n?.title || n?.id, e);
            }
        }

        // Refresh canvas
        (graph.setDirtyCanvas ? graph.setDirtyCanvas(true, true) : app?.canvas?.setDirty?.(true, true));
    }

    /** Restore original colors saved by the last Apply Colors action */
    undoColors() {
        const graph = this.graph || app?.graph;
        if (!this._colorizeBackup || !graph) return;

        for (const b of this._colorizeBackup) {
            const n = graph.getNodeById ? graph.getNodeById(b.id) : (graph._nodes?.find(x => x && x.id === b.id));
            if (!n) continue;
            n.color = b.color;
            n.bgcolor = b.bgcolor;
            n.colors = Array.isArray(b.colors) ? [...b.colors] : b.colors;
            if (!n.properties) n.properties = {};
            n.properties.bgcolors = Array.isArray(b.props_bgcolors) ? [...b.props_bgcolors] : b.props_bgcolors;
        }

        this._colorizeBackup = null;
        (graph.setDirtyCanvas ? graph.setDirtyCanvas(true, true) : app?.canvas?.setDirty?.(true, true));
    }

    /**
     * Called to render custom content behind the node body (but not the title).
     * If two or more colors are present in this.colors, draw a vertical gradient between their bgcolors.
     * Excludes the title area (seems to be enforced)
     * @param {CanvasRenderingContext2D} ctx
     */
    onDrawBackground(ctx) {
        try {
            if (this.flags && this.flags.collapsed) return;
            drawColorBars(ctx, this);
        } catch (e) {
            console.warn("[ovum.colorize-graph] Failed to draw color bars", e);
        }
    }

    /** Enable/disable auto-coloring for new nodes */
    setAutoColorEnabled(enabled) {
        const on = !!enabled;
        this.properties.autoColorNewNodes = on;
        try { this._autoColorWidget && (this._autoColorWidget.value = on); } catch (_) {}
        if (on) {
            __autoColorEnabledNodes.add(this);
            ensureAutoColorHook();
            Logger.log({ class: 'ColorizeGraph', method: 'setAutoColorEnabled', severity: 'info', tag: 'enable' }, 'Auto-color enabled');
        } else {
            if (__autoColorEnabledNodes.delete(this)) {
                Logger.log({ class: 'ColorizeGraph', method: 'setAutoColorEnabled', severity: 'info', tag: 'disable' }, 'Auto-color disabled');
            }
        }
    }

    onRemoved() {
        try { __autoColorEnabledNodes.delete(this); } catch (_) {}
    }
}

// Draw a SMPTE-like color bar pattern behind the node's body
function drawColorBars(ctx, node) {
    if (!ctx || !node) return;
    if (node.flags && node.flags.collapsed) return;

    const titleH = 0; // title looks excluded already by LiteGraph
    const x = 0;
    const y = titleH;
    const w = Math.max(0, node.size[0] || 0);
    const h = Math.max(0, (node.size[1] || 0) - titleH);
    if (w <= 0 || h <= 0) return;

    const r = 6; // bottom corner radius similar to twinNodes example

    // Clip to a rounded-rect of the node body so painting doesn't overflow
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, w, h, [0, 0, r, r]);
    } else {
        // Fallback path
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.closePath();
    }
    ctx.clip();

    // Top vertical color bars
    const topColors = [
        "#c0c0c0", // light gray
        "#cccc00", // yellow-ish
        "#00c8c8", // cyan
        "#00a800", // green
        "#cc00cc", // magenta
        "#a80000", // red
        "#0000a8"  // blue
    ];

    const bottomStripH = Math.min(Math.round(h * 0.18), 26);
    const topH = Math.max(0, h - bottomStripH);

    const barW = w / topColors.length;
    for (let i = 0; i < topColors.length; i++) {
        ctx.fillStyle = topColors[i];
        const bx = x + Math.floor(i * barW);
        const bw = Math.ceil((i + 1) * barW) - Math.floor(i * barW);
        ctx.fillRect(bx, y, bw, topH);
    }

    // Bottom smaller bars pattern
    const botColors = [
        "#0000a8", // blue
        "#111111", // black
        "#cc00cc", // magenta
        "#111111", // black
        "#00c8c8", // cyan
        "#111111", // black
        "#c0c0c0"  // light gray
    ];
    const botBarW = w / botColors.length;
    const by = y + topH;
    for (let i = 0; i < botColors.length; i++) {
        ctx.fillStyle = botColors[i];
        const bx = x + Math.floor(i * botBarW);
        const bw = Math.ceil((i + 1) * botBarW) - Math.floor(i * botBarW);
        ctx.fillRect(bx, by, bw, bottomStripH);
    }

    ctx.restore();
}

app.registerExtension({
    name: "ovum.colorize_graph",
    registerCustomNodes() {
        // Register as a simple utility node under ovum category
        LiteGraph.registerNodeType(
            "ColorizeGraph",
            Object.assign(ColorizeGraphNode, {
                title: "Colorize Graph",
            })
        );
        ColorizeGraphNode.category = "ovum";
    },
    // loadedGraphNode(node, app) {
    //     console.log(`[colorize-graph] loadGraphNode: ${node.comfyClass || node.title}`);
    //     // input_dirty[node.id + ""] = true;
    // },
});
