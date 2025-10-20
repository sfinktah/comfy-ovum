/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import {chainCallback} from "../01/utility.js";
import { Logger } from "../common/logger.js";
import { drawNodeStatus } from "../common/ui_helpers.js";

// Shared helpers to DRY status handling and drawing
/**
 * Adds a one-time listener to clear node.status on the next execution_start.
 * @param {LGraphNode} node
 */
const addOneTimeExecutionStart = (node) => {
    const clearStatusOnNextRun = function () {
        node.status = undefined;
        node.setDirtyCanvas(true, true);
        api.removeEventListener("execution_start", clearStatusOnNextRun);
    };
    api.addEventListener("execution_start", clearStatusOnNextRun);
};

/**
 * Unified status update with logging and optional scheduling of clear.
 * @param {LGraphNode} node
 * @param {any} message
 * @param {(msg:any)=>string|undefined} formatter
 */
const setStatusAndMaybeScheduleClear = (node, message, formatter) => {
    const statusText = formatter ? formatter(message) : (message?.status ? message.status.join("\n") : undefined);
    node.status = statusText;

    if (statusText) {
        addOneTimeExecutionStart(node);
    }

    node.setDirtyCanvas(true, true);
};

/**
 * Attach foreground drawing of node status in a DRY way.
 */
const attachDrawForeground = (nodeType) => {
    chainCallback(nodeType.prototype, "onDrawForeground", function(ctx) {
        drawNodeStatus.call(this, ctx, this.status, this.size, this.collapsed);
    });
};

const ovumRegexCategory = "ovum/regex";

app.registerExtension({
    name: "ovum.regex.ui",
    /**
     * @param {import("../../typings/ComfyNode").ComfyNode} nodeType
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} nodeData
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} appInstance
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.category !== ovumRegexCategory && !nodeData.name.startsWith("OvumRe")) {
            return;
        }

        Logger.log({
            class: 'ovum.regex.ui',
            method: 'beforeRegisterNodeDef',
            severity: 'trace',
        }, `nodeData.category ${nodeData.category} or nodeData.name ${nodeData.name} starts with OvumRe`);

        /** @this {LGraphNode} */
        nodeType.prototype.ovumUpdateWidgetState = function() {
            // This logic is for nodes that have a 'string' widget and 'string_in' input
            const stringWidget = this.widgets?.find((w) => w.name === "string");
            if (stringWidget) {
                const stringInInput = this.inputs?.find((i) => i.name === "string_in");
                if (stringInInput) {
                    const isConnected = !!stringInInput.link;
                    if(stringWidget.disabled !== isConnected) {
                        stringWidget.disabled = isConnected;
                    }
                }
            }
        };

        // 1. When string_in is connected, disable string widget
        chainCallback(nodeType.prototype, "onConnectionsChange", function (type, index, connected, link_info) {
            this.ovumUpdateWidgetState();
        });

        // When the node is added, check connections to set initial widget state
        chainCallback(nodeType.prototype, "onAdded", function () {
            this.ovumUpdateWidgetState();

            if (this.type === "re.Match.__repr__ (Regex Match View)") {
                if (!this.widgets?.find(w => w.name === "text")) {
                    this.addWidget("STRING", "text", "", () => {}, { multiline: true });
                    // Make the widget read-only.
                    const widget = this.widgets[this.widgets.length - 1];
                    if (widget.inputEl) {
                        widget.inputEl.readOnly = true;
                    } else {
                        // inputEl not created yet, patch draw to set it later.
                        const origDraw = widget.draw;
                        widget.draw = function(...args) {
                            if (this.inputEl) this.inputEl.readOnly = true;
                            return origDraw.apply(this, args);
                        }
                    }
                }
            }
        });

        // 2. Display status text from python `ui` return (DRY via helper)
        chainCallback(nodeType.prototype, "onExecuted", function (message) {
            setStatusAndMaybeScheduleClear(
                this,
                message,
                (msg) => (msg?.status ? msg.status.join("\n") : undefined)
            );

            if (this.type === "re.Match.__repr__ (Regex Match View)" && message?.text) {
                const widget = this.widgets.find(w => w.name === "text");
                if (widget) {
                    widget.value = message.text.join("\n");
                    this.setDirtyCanvas(true, true);
                }
            }
        });

        // Draw status in foreground
        attachDrawForeground(nodeType);
    },
});

const ovumCategory = "^ovum";
app.registerExtension({
    name: "ovum.ui",
    /**
     * @param {import("../../typings/ComfyNode").ComfyNode} nodeType
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} nodeData
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} appInstance
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (!nodeData.category.match(ovumCategory) && !nodeData.name.startsWith("Ovum") && !nodeData.name.endsWith("Ovum")) {
            return;
        }

        // 2. Display status text from python `ui` return (DRY via helper)
        chainCallback(nodeType.prototype, "onExecuted", function (message) {
            setStatusAndMaybeScheduleClear(
                this,
                message,
                (msg) => (msg?.status ? msg.status.slice(0,5).join("⏎\n") : undefined)
            );
        });

        // Draw status in foreground
        attachDrawForeground(nodeType);
    },
});
