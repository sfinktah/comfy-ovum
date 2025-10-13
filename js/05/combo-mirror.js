import { app } from "../../../scripts/app.js";

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
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // no-op
    },
    registerCustomNodes() {
        // Define the node class
        const LiteGraph = globalThis.LiteGraph; // use global LiteGraph API (ComfyUI frontend)

        function ensureComboWidget(node) {
            if (!node.widgets) node.widgets = [];
            if (!node.widgets[0]) {
                const w = node.addWidget("combo", "value", "", () => {}, { values: [] });
                w.serialize = false; // values are dynamic; keep value only
            } else {
                // If existing, ensure it's a combo widget
                const w = node.widgets[0];
                if (w.type !== "combo") {
                    // Replace with a combo while preserving value if stringy
                    const current = (typeof w.value === 'string') ? w.value : "";
                    node.widgets.splice(0, 1);
                    const nw = node.addWidget("combo", "value", current, () => {}, { values: [] });
                    nw.serialize = false;
                }
            }
            return node.widgets[0];
        }

        class ComboMirror extends LiteGraph.LGraphNode {
            constructor() {
                super();
                this.title = "ComboMirror";
                this.addOutput("value", "COMBO");
                ensureComboWidget(this);
                this.size = this.computeSize();
            }

            onSerialize(o) {
                // Persist the selected value; options are dynamic
                const w = this.widgets?.[0];
                if (w) {
                    o.widgets_values = [w.value];
                }
            }

            onConfigure(o) {
                // Restore previously selected value
                const val = o?.widgets_values?.[0];
                const w = ensureComboWidget(this);
                if (typeof val === 'string') {
                    w.value = val;
                }
                this.setSize(this.computeSize());
            }

            getTitle() { return this.title; }

            onConnectionsChange(type, slotIndex, isConnected, link, ioSlot) {
                // React only to output 0 link changes
                if (type !== LiteGraph.OUTPUT || slotIndex !== 0) return;
                setTimeout(() => this._refreshValuesFromTarget(), 0);
            }

            onExecute() {
                // Push current value downstream as a constant
                const w = ensureComboWidget(this);
                this.setOutputData(0, w.value ?? "");
            }

            _refreshValuesFromTarget() {
                try {
                    const out = this.outputs?.[0];
                    const linkId = out?.links?.[0];
                    if (!linkId) return this._setValues([]);
                    const link = this.graph.links?.[linkId];
                    if (!link) return this._setValues([]);

                    const target = this.graph.getNodeById(link.target_id);
                    if (!target) return this._setValues([]);
                    const targetSlot = link.target_slot ?? 0;

                    // Prefer the widget attached to the input slot
                    let tw = target.inputs?.[targetSlot]?.widget;
                    console.log(`target.inputs ${targetSlot}`, target.inputs);
                    console.log(`tw`, tw);
                    // Fallback: try to find by name in target.widgets
                    if (1 || !tw) {
                        const inputName = target.inputs?.[targetSlot]?.name;
                        tw = target.widgets?.find(w => w?.name === inputName);
                        console.log(`tw`, tw);
                    }

                    // Extract values from a ComboWidget-like object
                    let values = [];
                    if (tw) {
                        // Common shapes: options is array; or options.values; or values
                        if (Array.isArray(tw.options)) values = tw.options;
                        else if (Array.isArray(tw?.options?.values)) values = tw.options.values;
                        else if (Array.isArray(tw.values)) values = tw.values;
                    }

                    this._setValues(values);
                } catch (e) {
                    console.warn("[ComboMirror] failed to refresh options", e);
                    this._setValues([]);
                }
            }

            _setValues(values) {
                const w = ensureComboWidget(this);
                // Normalize to string array
                const opts = Array.isArray(values) ? values.map(v => String(v)) : [];
                // Update widget options (support both array and object forms)
                if (Array.isArray(w.options)) {
                    w.options = opts;
                } else if (w.options && typeof w.options === 'object') {
                    w.options.values = opts;
                } else {
                    w.options = { values: opts };
                }
                // also keep "values" direct prop for some widgets
                w.values = opts;
                if (!opts.includes(w.value)) {
                    w.value = opts.length ? opts[0] : "";
                }
                if (this.onResize) this.onResize(this.size);
                this.setDirtyCanvas(true, true);
            }
        }

        ComboMirror.title = "ComboMirror";
        ComboMirror.desc = "Combobox that mirrors options from its connected target combobox";
        ComboMirror.category = "ovum";

        LiteGraph.registerNodeType("ComboMirrorOvum", ComboMirror);
    }
});
