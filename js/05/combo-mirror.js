import {app} from "../../../scripts/app.js";
import {chainCallback} from "../01/utility.js";
import {debounce} from "../01/utility.js";

/**
 * ComboMirrorOvum
 * A lightweight frontend-only node that exposes a combobox whose options mirror
 * the options of the combobox widget of the node connected to its output.
 *
 * Usage:
 * - Drop ComboMirror near a node that has a combobox input.
 * - Connect ComboMirror's output to that combobox input.
 * - The ComboMirror's own combobox will adopt the same list of values.
 * - Selecting a value in ComboMirror will feed that string into the connected input.
 */
app.registerExtension({
    name: "ovum.combo_mirror",
    /**
     * @param {import("../../typings/ComfyNode").ComfyNode} nodeType
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} nodeData
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} appInstance
     */
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeType?.comfyClass !== "ComboMirrorOvum") {
            return;
        }

        const LiteGraph = globalThis.LiteGraph;

        /**
         * Find or create the combobox widget for the node.
         * @param {import("../../typings/ComfyNode").ComfyNode} node
         */
        function ensureComboWidget(node) {
            if (node.widgets && node.widgets[0]) {
                return node.widgets[0];
            }
            return node.addWidget("combo", "Value", "", () => {
            }, {values: []});
        }

        chainCallback(nodeType.prototype, "onNodeCreated", function () {
            this.title = "ComboMirror";
            if (!this.outputs?.length) {
                this.addOutput("value", "COMBO");
            }
            this.size = this.computeSize();
            this._debouncedRefresh = debounce(this._refreshValuesFromTarget.bind(this), 500);
        });

        chainCallback(nodeType.prototype, "onSerialize", function (o) {
            const w = this.widgets?.[0];
            if (w) {
                o.widgets_values = [w.value];
            }
        });

        chainCallback(nodeType.prototype, "onConfigure", function (o) {
            const val = o?.widgets_values?.[0];
            const w = ensureComboWidget(this);
            if (typeof val === 'string') {
                w.value = val;
            }
            this.setSize(this.computeSize());
        });

        chainCallback(nodeType.prototype, "onConnectionsChange", function (type, slotIndex, isConnected, link, ioSlot) {
            if (type !== LiteGraph.OUTPUT || slotIndex !== 0) return;
            this._debouncedRefresh();
        });

        chainCallback(nodeType.prototype, "onExecute", function () {
            const w = ensureComboWidget(this);
            this.setOutputData(0, w.value ?? "");
        });

        nodeType.prototype._refreshValuesFromTarget = function () {
            try {
                const out = this.outputs?.[0];
                const linkId = out?.links?.[0];
                if (!linkId) return this._setValues([]);
                const link = this.graph.links?.[linkId];
                if (!link) return this._setValues([]);

                const target = this.graph.getNodeById(link.target_id);
                if (!target) return this._setValues([]);
                const targetSlot = link.target_slot ?? 0;

                console.log(`target.inputs ${targetSlot}`, target.inputs);
                const inputName = target.inputs?.[targetSlot]?.name;
                const tw = target.widgets?.find(w => w?.name === inputName);

                let values = [];
                if (tw) {
                    if (Array.isArray(tw.options)) values = tw.options;
                    else if (Array.isArray(tw?.options?.values)) values = tw.options.values;
                    else if (Array.isArray(tw.values)) values = tw.values;
                }

                this._setValues(values);
            } catch (e) {
                console.warn("[ComboMirror] failed to refresh options", e);
                this._setValues([]);
            }
        };

        nodeType.prototype._setValues = function (values) {
            const w = ensureComboWidget(this);
            const opts = Array.isArray(values) ? values.map(v => String(v)) : [];

            if (Array.isArray(w.options)) {
                w.options = opts;
            } else if (w.options && typeof w.options === 'object') {
                w.options.values = opts;
            } else {
                w.options = { values: opts };
            }
            w.values = opts;

            if (!opts.includes(w.value)) {
                w.value = opts.length ? opts[0] : "";
            }
            if (this.onResize) this.onResize(this.size);
            this.setDirtyCanvas(true, true);
        };
    },
});
