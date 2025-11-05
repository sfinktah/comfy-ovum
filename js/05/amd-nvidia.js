/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').ComfyApp} ComfyApp */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/litegraph.js').LiteGraph} LiteGraph */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").INodeInputSlot} INodeInputSlot */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").INodeOutputSlot} INodeOutputSlot */
/** @typedef {import("../../typings/ComfyNode.js").ComfyNode} ComfyNode */

import { app } from "../../../scripts/app.js";
import { chainCallback } from "../01/utility.js";
import { setupDynamicIOMixin } from "../mtb/utils/dynamic_connections.js";

app.registerExtension({
    name: "ovum.amdnvidia.dynamicio",
    /**
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyApp} app
     */
    /**
     * @param {import("../../typings/ComfyNode.js").ComfyNode} nodeType
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyNodeDef} nodeData
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyApp} app
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeType.comfyClass !== "AmdNvidiaIfElseOvum") return;

        // Use generic mixin to provide two independent dynamic input groups
        setupDynamicIOMixin(nodeType, {
            inputs: [
                { prefix: 'amd_', type: '*', start: 1 },
                { prefix: 'nvidia_', type: '*', start: 1 },
            ],
            // outputs are handled custom below (out_#)
            outputs: { mirrorInputs: false },
        });

        // After mixin hooks, add custom output management named out_#
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, []) : undefined;
            ensureOutputs.call(this);
            return r;
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info, inputOrOutput) {
            const r = onConnectionsChange ? onConnectionsChange.apply(this, [type, index, connected, link_info, inputOrOutput]) : undefined;
            if (type === LiteGraph.INPUT) {
                ensureOutputs.call(this);
                this.setDirtyCanvas(true, true);
            }
            return r;
        };

        function ensureOutputs() {
            // Count connected amd_ and nvidia_ inputs separately
            const amdCount = (this.inputs || []).filter(i => i.name.startsWith('amd_') && i.link != null).length;
            const nvdCount = (this.inputs || []).filter(i => i.name.startsWith('nvidia_') && i.link != null).length;
            const outCount = Math.max(amdCount, nvdCount);
            this.outputs = this.outputs || [];
            // adjust number of outputs to outCount
            while (this.outputs.length < outCount) this.addOutput(`out_${this.outputs.length + 1}`, '*');
            while (this.outputs.length > outCount) this.removeOutput(this.outputs.length - 1);
            // ensure names correct
            for (let i = 0; i < this.outputs.length; i++) {
                const desired = `out_${i + 1}`;
                if (this.outputs[i].name !== desired) this.outputs[i].name = desired;
            }
        }
    },
});
