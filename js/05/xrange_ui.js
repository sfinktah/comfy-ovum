/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import('../01/typedefs.js').INodeInputSlot} INodeInputSlot */

/** @type {ComfyApp} */
import {app} from "../../../scripts/app.js";
import {chainCallback} from "../01/utility.js";
// Frontend extension to apply backend "ui" updates for XRange cursor widget.

app.registerExtension({
    name: "pyobjects.xrange.ui",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Target the specific node by its displayed name or class name (support both).
        if (nodeData.name !== "XRangeNode") return;
        console.log(`xrange-ui: ${nodeData.name} installed`);

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            console.log("[xrange-ui] onNodeCreated", {'this': this});
            return onNodeCreated?.apply(this, arguments);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (e) {
            console.log("[xrange-ui] onConfigure", {'this': this});
            onConfigure?.apply(this, arguments);
        };

        const onExecuted = nodeType.prototype.onExecuted;
        // chainCallback(nodeType.prototype, "onExecuted", function (e) {
        nodeType.prototype.onExecuted = function (message) {
            console.log("[xrange-ui] onExecuted", message);
            onExecuted?.apply(this, arguments);

            try {
                if (!message) {
                    console.log("[xrange-ui] no message");
                    return;
                }

                // Only update the cursor widget if provided by backend.
                if ("cursor" in message) {
                    const w = this.widgets?.find(w => w?.name === "cursor");
                    if (w) {
                        const newVal = String(message.cursor);
                        if (w.value !== newVal) {
                            console.log(`[xrange-ui] cursor widget value changed ${w.value} -> ${newVal}`);
                            w.value = newVal;

                            // Trigger any attached widget callback (keeps graph consistent).
                            if (typeof w.callback === "function") {
                                try {
                                    w.callback(w.value, this, app);
                                } catch (e) {
                                    console.warn("[xrange-ui] widget callback error:", e);
                                }
                            }

                            // Redraw to show the updated value.
                            app.graph.setDirtyCanvas(true, true);
                        }
                        else {
                            console.log(`[xrange-ui] cursor widget value unchanged ${w.value} -> ${newVal}`);
                        }
                    }
                    else {
                        console.log("[xrange-ui] cursor widget not found");
                    }
                }
                else {
                    console.log("[xrange-ui] no cursor in message");
                }
            } catch (e) {
                console.warn("[xrange-ui] failed applying UI updates:", e);
            }
        };
    },
});
