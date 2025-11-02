import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "ovum.burn_notice",

    /**
     * @param {import("../../typings/ComfyNode").ComfyNode} nodeType
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} nodeData
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} app
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // The Python class is BurnNoticeOvum; nodeData.name matches the class name in Ovum.
        if (nodeData.name === "BurnNoticeOvum") {
            const originalOnExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                if (originalOnExecuted) {
                    originalOnExecuted.apply(this, arguments);
                }

                try {
                    // Find widgets
                    const valueWidget = this.widgets?.find(w => w.name === "value");
                    const muteWidget = this.widgets?.find(w => w.name === "mute_after");

                    // Clear the value widget after execution
                    if (valueWidget) {
                        if (valueWidget.value !== "") {
                            valueWidget.value = "";
                            if (valueWidget.callback) {
                                valueWidget.callback(valueWidget.value, app.canvas, this, null, valueWidget);
                            }
                        }
                    }

                    // If mute_after is true, mute the node
                    const shouldMute = !!(muteWidget && (muteWidget.value === true));
                    if (message.mute_after[0]) {
                        // 2 = LiteGraph.ALWAYS = "mute"
                        this.mode = 2;
                        if (app.canvas?.setDirty) {
                            app.canvas.setDirty(true, true);
                        }
                    } else {
                        // leave mode unchanged
                    }
                } catch (e) {
                    console.warn("[ovum.burn_notice] onExecuted error:", e);
                }
            };
        }
    }
});
