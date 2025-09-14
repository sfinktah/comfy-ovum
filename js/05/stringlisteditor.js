/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/litegraph/dist/LGraphNode").LGraphNode} LGraphNode */

import { app } from "../../../scripts/app.js";
import { chainCallback } from "../01/utility.js";

app.registerExtension({
    name: "StringListEditorNode",

    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (!nodeData || nodeData.name !== "StringListEditorNode") return;

        // When a node instance is created, add the UI helpers: Add button and drop handling
        chainCallback(nodeType.prototype, "onNodeCreated", function () {
            const node = this;
            // Expect the first widget to be the multiline text area for items_text
            // Add an "Add" button to append a new empty line
            node.addWidget("button", "Add", null, () => {
                try {
                    const w = node.widgets?.find?.(w => w?.name === "items_text") || node.widgets?.[0];
                    const cur = (w?.value ?? "");
                    const updated = cur.length === 0 ? "" : (cur.endsWith("\n") ? cur : cur + "\n");
                    const newVal = updated + ""; // append an empty line
                    if (w) w.value = newVal;
                    if (node.onInputChanged) node.onInputChanged();
                    if (node.canvas?.setDirty) node.canvas.setDirty(true, true);
                } catch (_e) {}
            });

            // Small hint label
            node.addWidget("info", "Drop files onto this node to add full paths", "", null, { serialize: false });
        });

        // Handle file(s) drag & drop onto the node
        if (typeof nodeType.prototype.onDragDrop !== "function") {
            nodeType.prototype.onDragDrop = function (e) {
                try {
                    if (!e?.dataTransfer?.files?.length) return false;
                    const files = Array.from(e.dataTransfer.files);
                    const paths = files.map(f => f?.path || f?.name).filter(Boolean);
                    if (!paths.length) return false;
                    const w = this.widgets?.find?.(w => w?.name === "items_text") || this.widgets?.[0];
                    const cur = (w?.value ?? "");
                    const base = cur.length === 0 ? "" : (cur.endsWith("\n") ? cur : cur + "\n");
                    const appended = base + paths.join("\n");
                    if (w) w.value = appended;
                    if (this.onInputChanged) this.onInputChanged();
                    if (this.canvas?.setDirty) this.canvas.setDirty(true, true);
                    return true;
                } catch (_e) {
                    return false;
                }
            }
        } else {
            // If already defined, extend existing behavior
            chainCallback(nodeType.prototype, "onDragDrop", function (e) {
                try {
                    if (!e?.dataTransfer?.files?.length) return;
                    const files = Array.from(e.dataTransfer.files);
                    const paths = files.map(f => f?.path || f?.name).filter(Boolean);
                    if (!paths.length) return;
                    const w = this.widgets?.find?.(w => w?.name === "items_text") || this.widgets?.[0];
                    const cur = (w?.value ?? "");
                    const base = cur.length === 0 ? "" : (cur.endsWith("\n") ? cur : cur + "\n");
                    const appended = base + paths.join("\n");
                    if (w) w.value = appended;
                    if (this.onInputChanged) this.onInputChanged();
                    if (this.canvas?.setDirty) this.canvas.setDirty(true, true);
                } catch (_e) {}
            });
        }
    },
});
