/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import('../01/typedefs.js').INodeInputSlot} INodeInputSlot */

/** @type {ComfyApp} */
import {app} from "../../../scripts/app.js";
import {chainCallback} from "../01/utility.js";
import { Logger } from "../common/logger.js";
// Frontend extension to apply backend "ui" updates for XRange cursor widget.

app.registerExtension({
    name: "pyobjects.xrange.ui",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Target the specific node by its displayed name or class name (support both).
        if (nodeData.name !== "XRangeNode") return;
        Logger.log({class:'pyobjects.xrange.ui',method:'beforeRegisterNodeDef',severity:'info',tag:'installed', nodeName:'pyobjects.xrange.ui'}, `xrange-ui: ${nodeData.name} installed`);

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            Logger.log({class:'pyobjects.xrange.ui',method:'onNodeCreated',severity:'debug',tag:'event', nodeName:'pyobjects.xrange.ui'}, 'onNodeCreated', {'this': this});
            return onNodeCreated?.apply(this, arguments);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (e) {
            Logger.log({class:'pyobjects.xrange.ui',method:'onConfigure',severity:'debug',tag:'event', nodeName:'pyobjects.xrange.ui'}, 'onConfigure', {'this': this});
            onConfigure?.apply(this, arguments);
        };

        const onExecuted = nodeType.prototype.onExecuted;
        // chainCallback(nodeType.prototype, "onExecuted", function (e) {
        nodeType.prototype.onExecuted = function (message) {
            Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'debug',tag:'event', nodeName:'pyobjects.xrange.ui'}, 'onExecuted', message);
            onExecuted?.apply(this, arguments);

            try {
                if (!message) {
                    Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'debug',tag:'early_return', nodeName:'pyobjects.xrange.ui'}, 'no message');
                    return;
                }

                // Only update the cursor widget if provided by backend.
                if ("cursor" in message) {
                    const w = this.widgets?.find(w => w?.name === "cursor");
                    if (w) {
                        const newVal = String(message.cursor);
                        if (w.value !== newVal) {
                            Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'info',tag:'cursor', nodeName:'pyobjects.xrange.ui'}, `cursor widget value changed ${w.value} -> ${newVal}`);
                            w.value = newVal;

                            // Trigger any attached widget callback (keeps graph consistent).
                            if (typeof w.callback === "function") {
                                try {
                                    w.callback(w.value, this, app);
                                } catch (e) {
                                    Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'warn',tag:'error', nodeName:'pyobjects.xrange.ui'}, 'widget callback error:', e);
                                }
                            }

                            // Redraw to show the updated value.
                            app.graph.setDirtyCanvas(true, true);
                        }
                        else {
                            Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'debug',tag:'cursor', nodeName:'pyobjects.xrange.ui'}, `cursor widget value unchanged ${w.value} -> ${newVal}`);
                        }
                    }
                    else {
                        Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'debug',tag:'cursor', nodeName:'pyobjects.xrange.ui'}, 'cursor widget not found');
                    }
                }
                else {
                    Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'debug',tag:'cursor', nodeName:'pyobjects.xrange.ui'}, 'no cursor in message');
                }
            } catch (e) {
                Logger.log({class:'pyobjects.xrange.ui',method:'onExecuted',severity:'warn',tag:'error', nodeName:'pyobjects.xrange.ui'}, 'failed applying UI updates:', e);
            }
        };
    },
});
