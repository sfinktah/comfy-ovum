import {app} from "../../../scripts/app.js";
import {chainCallback} from "../01/utility.js";
import {debounce} from "../01/utility.js";

/**
 * Local type that extends ComfyNode with ComboMirror-specific helpers without modifying global d.ts.
 * @typedef {import("../../typings/ComfyNode").ComfyNode & {
 *   _setValues?: (values: any[]) => void,
 *   _refreshValuesFromTarget?: () => void,
 *   _debouncedRefresh?: () => void,
 * }} ComboMirrorNode
 */

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
    beforeRegisterNodeDef: async function (nodeType, nodeData, appInstance) {
        if (nodeType?.comfyClass !== "ComboMirrorOvum") {
            return;
        }

        const LiteGraph = globalThis.LiteGraph;

        /**
         * Find or create the combobox widget for the node.
         * @param {import("../../typings/ComfyNode").ComfyNode} node
         */
        function ensureComboWidget (node) {
            if (node.widgets && node.widgets[0]) {
                return node.widgets[0];
            }
            // Do not attempt to create this widget, it will be created by the Python node.
            Logger.log({
                    class: 'ComboMirrorOvum',
                    method: 'ensureComboWidget',
                    severity: 'warn',
                },
                `node.widgets or node.widgets[0] is undefined`, node.widgets, node.widgets[0]
            );
        }

        chainCallback(nodeType.prototype, "onNodeCreated",
            function () {
            const self = /** @type {ComboMirrorNode} */ (this);
            self.title = "ComboMirror";

            // Ensure I/O: output[0] value (COMBO), output[1] strings (LIST); input[0] choice_index (INT)
            if (!self.outputs || self.outputs.length === 0) {
                self.addOutput("value", "COMBO");
                self.addOutput("strings", "LIST");
            } else {
                // Backfill missing second output if older graphs
                if (self.findOutputSlot && self.findOutputSlot("strings") === -1) {
                    self.addOutput("strings", "LIST");
                }
            }
            if (!self.inputs || self.inputs.length === 0 || (self.findInputSlot && self.findInputSlot("choice_index") === -1)) {
                self.addInput("choice_index", "INT");
            }

            // This really does make the node nicer (smaller)
            self.size = self.computeSize();
            self._debouncedRefresh = debounce(self._refreshValuesFromTarget.bind(self), 500);

            // Initial enable/disable state for the combo based on choice_index connection
            const idxSlot = self.findInputSlot ? self.findInputSlot("choice_index") : 0;
            const hasIdxLink = self.inputs?.[idxSlot]?.link != null;
            const w = ensureComboWidget(self);
            if (w) w.disabled = !!hasIdxLink;
        });

        // Minimal onConfigure: ensure widget exists and apply persisted options
        chainCallback(nodeType.prototype, "onConfigure",
            function (o) {
            const self = /** @type {ComboMirrorNode} */ (this);
            ensureComboWidget(self);
            if (typeof self.properties?.combo_options_str === 'string') {
                const opts = self.properties.combo_options_str
                    .split('\n')
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                self._setValues(opts);
            }
            if (self.setSize && self.computeSize) {
                self.setSize(self.computeSize());
            }
        });

        chainCallback(nodeType.prototype, "onConnectionsChange",
            function (type, slotIndex, isConnected, link, ioSlot) {
            const self = /** @type {ComboMirrorNode} */ (this);

            // Handle choice_index input connection to enable/disable combo widget
            if (type === LiteGraph.INPUT) {
                const choiceIdxSlot = self.findInputSlot ? self.findInputSlot("choice_index") : 0;
                if (slotIndex === choiceIdxSlot) {
                    const w = ensureComboWidget(self);
                    w.disabled = !!(self.inputs?.[choiceIdxSlot]?.link != null);
                    self.setDirtyCanvas(true, true);
                    return;
                }
            }

            // Only respond to output[0] link changes for mirroring options
            if (type !== LiteGraph.OUTPUT || slotIndex !== 0) {
                return;
            }
            if (!self.properties) {
                Logger.log({
                        class: 'ComboMirrorOvum',
                        method: 'onConnectionsChange',
                        severity: 'info',
                    },
                    'this.properties is not yet available for ComboMirror node'
                );
            }
            self._debouncedRefresh();
        });

        nodeType.prototype._refreshValuesFromTarget =
            function () {
            const self = /** @type {ComboMirrorNode} */ (this);
            try {
                const out = self.outputs?.[0];
                const linkIds = out?.links;
                // If no links at all, fall back to persisted options
                if (!Array.isArray(linkIds) || linkIds.length === 0) {
                    // Clear any previous highlight
                    try {
                        const all = out?.links || [];
                        for (const id of all) {
                            const l = self.graph?.links?.[id];
                            if (l && l.color) delete l.color;
                        }
                    } catch (_) {}

                    let persisted;
                    if (typeof self.properties?.combo_options_str === 'string') {
                        persisted = self.properties.combo_options_str.split('\n').map(s => s.trim()).filter(Boolean);
                    } else {
                        persisted = [];
                    }
                    return self._setValues(persisted);
                }

                for (const linkId of linkIds) {
                    const link = self.graph?.links?.[linkId];
                    if (!link) {
                        continue;
                    }
                    const target = self.graph.getNodeById(link.target_id);
                    if (!target) {
                        continue;
                    }

                    // ---
                    const targetSlot = link.target_slot ?? 0;

                    // Prefer the widget attached to the input slot
                    let tiName = target.inputs?.[targetSlot]?.widget?.name;
                    // let tiName = target.inputs?.[targetSlot]?.name;
                    Logger.log({
                        class: 'ComboMirrorOvum',
                        method: '_refreshValuesFromTarget',
                        nodeName: `${self.title}#${self.id}`,
                        severity: 'trace',
                    }, "widget name", tiName);
                    // Fallback: try to find by name in target.widgets
                    // if (!ti) {
                    //     const inputName = target.inputs?.[targetSlot]?.name;
                    //     ti = target.widgets?.find(w => w?.name === inputName);
                    // }
                    // ---
                    // Find first ComboWidget in the target node matching the name
                    const tw = target.widgets?.find(w => {
                        const ctorName = w?.constructor?.name;
                        return ctorName === 'ComboWidget' && w?.name === tiName;
                    });

                    if (tw) {
                        let values = [];
                        if (Array.isArray(tw.options)) {
                            values = tw.options;
                        } else if (Array.isArray(tw?.options?.values)) {
                            values = tw.options.values;
                        } else if (Array.isArray(tw.values)) {
                            values = tw.values;
                        }

                        // Highlight the link that provided these options (this does not work)
                        // TODO: remove if you can't find a fix
                        try {
                            const out = self.outputs?.[0];
                            const all = out?.links || [];
                            for (const id of all) {
                                const l = self.graph?.links?.[id];
                                if (l) {
                                    if (id === linkId) {
                                        l.color = "#ffcc00"; // amber highlight
                                    } else {
                                        // clear highlight on others
                                        if (l.color) delete l.color;
                                    }
                                }
                            }
                            self.setDirtyCanvas(true, true);
                        } catch (_) {}

                        return self._setValues(values);
                    }
                }

                // No connected targets with ComboWidget; use persisted options
                const persisted = typeof self.properties?.combo_options_str === 'string'
                    ? self.properties.combo_options_str.split('\n').map(s => s.trim()).filter(Boolean)
                    : [];
                return self._setValues(persisted);
            } catch (e) {
                console.warn("[ComboMirror] failed to refresh options", e);
                const persisted = typeof self.properties?.combo_options_str === 'string'
                    ? self.properties.combo_options_str.split('\n').map(s => s.trim()).filter(Boolean)
                    : [];
                return self._setValues(persisted);
            }
        };

        nodeType.prototype._setValues =
            function (values) {
            const self = /** @type {ComboMirrorNode} */ (this);
            const w = ensureComboWidget(self);
            const opts = Array.isArray(values) ? values.map(v => String(v)) : [];

            // Persist options to ComfyUI properties as one option per line
            const optsStr = opts.join('\n');
            self.properties = self.properties || {};
            self.properties.combo_options_str = optsStr;
            // Trigger a serialize so the graph captures updated properties
            if (typeof self.serialize === 'function') {
                try { self.serialize(); } catch (_) {}
            }

            if (Array.isArray(w.options)) {
                w.options = opts;
            } else if (w.options && typeof w.options === 'object') {
                w.options.values = opts;
            } else {
                w.options = {values: opts};
            }
            w.values = opts;

            if (!opts.includes(w.value)) {
                w.value = opts.length ? opts[0] : "";
            }
            if (self.onResize) {
                self.onResize(self.size);
            }
            self.setDirtyCanvas(true, true);
        };
    },
});
