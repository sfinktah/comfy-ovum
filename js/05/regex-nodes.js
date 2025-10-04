/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */

import { app } from "../../../scripts/app.js";
import {chainCallback} from "../01/utility.js";
import { Logger } from "../common/logger.js";

const ovumRegexCategory = "ovum/regex";

const STATUS_BELOW_NODE = true;

app.registerExtension({
    name: "ovum.regex.ui",
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
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info) {
            onConnectionsChange?.apply(this, arguments);
            this.ovumUpdateWidgetState();
        };

        // When the node is added, check connections to set initial widget state
        const onAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function () {
            onAdded?.apply(this, arguments);
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
        };

        // 2. Display status text from python `ui` return
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);

            Logger.log({
                class: 'ovum.regex.ui',
                method: 'onExecuted',
                severity: 'trace',
            }, {message});
            this.status = message?.status ? message.status.join("\n") : undefined;

            if (this.type === "re.Match.__repr__ (Regex Match View)" && message?.text) {
                const widget = this.widgets.find(w => w.name === "text");
                if (widget) {
                    widget.value = message.text.join("\n");
                }
            }

            /** @this {LGraphNode} */
            this.setDirtyCanvas(true, true);
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            onDrawForeground?.apply(this, arguments);

            /** @this {LGraphNode} */
            if (this.status) {
                const fontSize = 12;
                ctx.font = `${fontSize}px Arial`;
                ctx.fillStyle = "#888";
                ctx.textAlign = "center";
                if (STATUS_BELOW_NODE) {
                    const V_OFFSET_BELOW = 14;
                    ctx.fillText(this.status, this.size[0] / 2, this.size[1] + V_OFFSET_BELOW);
                } else {
                    if (this.flags?.collapsed) {
                        return;
                    }
                    ctx.fillText(this.status, this.size[0] / 2, this.size[1] - fontSize / 2 - 2);
                }
            }
        };
    },
});

const ovumCategory = "^ovum";
app.registerExtension({
    name: "ovum.ui",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (!nodeData.category.match(ovumCategory) && !nodeData.name.startsWith("Ovum") && !nodeData.name.endsWith("Ovum")) {
            return;
        }

        // 2. Display status text from python `ui` return
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);

            Logger.log({
                class: 'ovum.*',
                method: 'onExecuted',
                severity: 'trace',
            }, {message});
            if ((this.status = message?.status ? message.status.join("\n") : undefined)) {
                /** @this {LGraphNode} */
                this.setDirtyCanvas(true, true);
            }
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            onDrawForeground?.apply(this, arguments);

            /** @this {LGraphNode} */
            if (this.status) {
                const fontSize = 12;
                ctx.font = `${fontSize}px Arial`;
                ctx.fillStyle = "#888";
                ctx.textAlign = "center";
                if (STATUS_BELOW_NODE) {
                    const V_OFFSET_BELOW = 14;
                    ctx.fillText(this.status, this.size[0] / 2, this.size[1] + V_OFFSET_BELOW);
                } else {
                    if (this.flags?.collapsed) {
                        return;
                    }
                    ctx.fillText(this.status, this.size[0] / 2, this.size[1] - fontSize / 2 - 2);
                }
            }
        };
    },
});
