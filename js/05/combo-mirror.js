import {app} from "../../../scripts/app.js";
import {chainCallback} from "../01/utility.js";
import {debounce} from "../01/utility.js";

/**
 * Local type that extends ComfyNode with ComboMirror-specific helpers without modifying global d.ts.
 * @typedef {import("../../typings/ComfyNode.js").ComfyNode & {
 *   _setValues?: (values: any[], value?: string) => void,
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
     * @param {import("../../typings/ComfyNode.js").ComfyNode} nodeType
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyNodeDef} nodeData
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyApp} app
     */
    beforeRegisterNodeDef: async function (nodeType, nodeData, app) {
        if (nodeType?.comfyClass !== "ComboMirrorOvum") {
            return;
        }

        const LiteGraph = globalThis.LiteGraph;

        /**
         * Find or create the combobox widget for the node.
         * @param {import("../../typings/ComfyNode.js").ComfyNode} node
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
            // Going to leave this in here (though they are not necessary) just because its handy for the AI to have the names of everything handy
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

            // Initial enable/disable state for the combo based on choice_index connection and widget value
            const indexSlot = self.findInputSlot ? self.findInputSlot("choice_index") : 0;
            const hasIndexLink = self.inputs?.[indexSlot]?.link != null;
            const w = ensureComboWidget(self);
            const indexWidget = self.widgets?.find(wi => wi?.name === "choice_index");
            const forcedByValue = Number(indexWidget?.value) > -1;
            // if (w) w.disabled = hasIndexLink || forcedByValue;
            if (w) w.disabled = hasIndexLink;

            // Add callback so changing choice_index value disables/enables the combo widget
            if (indexWidget) {
                const prevCb = indexWidget.callback;
                indexWidget.callback = function (...args) {
                    try {
                        const disableByValue = Number(indexWidget.value) > -1;
                        if (w) {
                            const linkActive = (self.inputs?.[indexSlot]?.link != null);
                            // w.disabled = disableByValue || linkActive;
                            w.disabled = linkActive;
                        }

                        // Also set w.value to combo_options_str[widgetIndex.value]
                        const index = Number(indexWidget.value);
                        if (w && Number.isInteger(index) && index > -1) {
                            const carrierW = self.widgets?.find(wi => wi?.name === "combo_options_str");
                            if (typeof carrierW?.value === "string") {
                                const options = carrierW.value
                                    .split("\n")
                                    .map(s => s.trim())
                                    .filter(Boolean);
                                if (index < options.length) {
                                    w.value = options[index];
                                }
                                else {
                                    w.value = '';
                                }
                            }
                        }

                        self.setDirtyCanvas(true, true);
                    } catch (e) {
                        console.warn("[ComboMirror] choice_index callback error", e);
                    } finally {
                        if (typeof prevCb === "function") {
                            try { prevCb.apply(this, args); } catch (e2) { console.warn("[ComboMirror] prior choice_index callback error", e2); }
                        }
                    }
                };
            }
        });

        // Minimal onConfigure: ensure widget exists and apply persisted options
        chainCallback(nodeType.prototype, "onConfigure",
            function (o) {
            const self = /** @type {ComboMirrorNode} */ (this);
            ensureComboWidget(self);
            // Is this superfluous, could we just call _refreshValuesFromTarget?
            const carrierW = self.widgets?.find(w => w?.name === "combo_options_str");
            if (carrierW && typeof carrierW.value === 'string') {
                const opts = carrierW.value
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
                const choiceIndexSlot = self.findInputSlot ? self.findInputSlot("choice_index") : 0;
                if (slotIndex === choiceIndexSlot) {
                    const w = ensureComboWidget(self);
                    const indexW = self.widgets?.find(wi => wi?.name === "choice_index");
                    const forcedByValue = Number(indexW?.value) > -1;
                    // w.disabled = isConnected || forcedByValue;
                    w.disabled = isConnected;
                    self.setDirtyCanvas(true, true);
                    return;
                }
            }

            // Only respond to output[0] link changes for mirroring options
            if (type !== LiteGraph.OUTPUT || slotIndex !== 0) {
                return;
            }
            self._debouncedRefresh();
        });

        nodeType.prototype._refreshValuesFromTarget =
            function () {
            const self = /** @type {ComboMirrorNode} */ (this);
            try {
                const out = self.outputs?.[0];
                const linkIds = out?.links;
                // If no links at all, fall back to options stored in the 'combo_options_str' widget
                if (!Array.isArray(linkIds) || linkIds.length === 0) {
                    const carrierW = self.widgets?.find(w => w?.name === "combo_options_str");
                    const persisted = typeof carrierW?.value === 'string'
                        ? carrierW.value.split('\n').map(s => s.trim()).filter(Boolean)
                        : [];
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
                    const targetSlot = link.target_slot;
                    if (link.target_slot == null) {
                        Logger.log({
                            class: 'ComboMirrorOvum',
                            method: '_refreshValuesFromTarget',
                            nodeName: `${self.title}#${self.id}`,
                            severity: 'trace',
                        }, "link.target_slot is null");
                        continue;
                    }

                    // Prefer the widget attached to the input slot
                    let tiName = target.inputs?.[targetSlot]?.widget?.name;
                    // let tiName = target.inputs?.[targetSlot]?.name;
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

                    Logger.log({
                        class: 'ComboMirrorOvum',
                        method: '_refreshValuesFromTarget',
                        nodeName: `${self.title}#${self.id}`,
                        severity: 'trace',
                    }, "tiName", tiName, "targetSlot", targetSlot, "tw", tw);

                    if (tw) {
                        let values = [];
                        if (Array.isArray(tw.options)) {
                            values = tw.options;
                        } else if (Array.isArray(tw?.options?.values)) {
                            values = tw.options.values;
                        } else if (Array.isArray(tw.values)) {
                            values = tw.values;
                            Logger.log({
                                class: 'ComboMirrorOvum',
                                method: '_refreshValuesFromTarget',
                                nodeName: `${self.title}#${self.id}`,
                                severity: 'warn',
                            }, "not expecting condition 209 to be hit; tw.values is an array, but tw.options is not an array", tw.options);
                        }

                        const value = tw.value;

                        Logger.log({
                            class: 'ComboMirrorOvum',
                            method: '_refreshValuesFromTarget',
                            nodeName: `${self.title}#${self.id}`,
                            severity: 'trace',
                        }, "values", values, "value", value);

                        return self._setValues(values, value);
                    }
                }

                // No connected targets with ComboWidget; use options from the 'combo_options_str' widget
                const carrierW = self.widgets?.find(w => w?.name === "combo_options_str");
                const persisted = typeof carrierW?.value === 'string'
                    ? carrierW.value.split('\n').map(s => s.trim()).filter(Boolean)
                    : [];
                return self._setValues(persisted);
            } catch (e) {
                console.warn("[ComboMirror] failed to refresh options", e);
                const carrierW = self.widgets?.find(w => w?.name === "combo_options_str");
                const persisted = typeof carrierW?.value === 'string'
                    ? carrierW.value.split('\n').map(s => s.trim()).filter(Boolean)
                    : [];
                return self._setValues(persisted);
            }
        };

        nodeType.prototype._setValues = function (values, value = undefined) {
            const self = /** @type {ComboMirrorNode} */ (this);
            const w = ensureComboWidget(self);
            const options = Array.isArray(values) ? values.map(v => String(v)) : [];

            // Persist options into the hidden carrier widget as one option per line
            const carrierW = self.widgets?.find(wi => wi?.name === "combo_options_str");
            if (carrierW) {
                carrierW.value = options.join('\n');
            }

            if (Array.isArray(w.options)) {
                w.options = options;
            } else if (w.options && typeof w.options === 'object') {
                w.options.values = options;
            } else {
                w.options = {values: options};
                Logger.log({
                    class: 'ComboMirrorOvum',
                    method: '_refreshValuesFromTarget',
                    nodeName: `${self.title}#${self.id}`,
                    severity: 'warn',
                }, "not expecting condition 265 to be hit");
            }

            if (!options.includes(w.value)) {
                if (value != null) {
                    w.value = value;
                // } else if (options.length > 0) {
                //     w.value = options[0];
                } else {
                    w.value = "";
                }
            }
            if (self.onResize) {
                self.onResize(self.size);
            }
            self.setDirtyCanvas(true, true);
        };
    },
});
