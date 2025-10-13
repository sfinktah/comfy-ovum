/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */

import { app } from "../../../scripts/app.js";
import { chainCallback } from "../01/utility.js";

app.registerExtension({
    name: "StringListEditor",

    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (!nodeData || nodeData.name !== "StringListEditor") return;

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

            // Hidden file input to choose files and add their paths
            const fileInput = document.createElement("input");
            Object.assign(fileInput, {
                type: "file",
                multiple: true,
                style: "display: none",
                onchange: () => {
                    try {
                        const files = Array.from(fileInput.files || []);
                        if (!files.length) return;
                        const paths = files.map(f => f.path || f.name).filter(Boolean);
                        if (!paths.length) return;

                        const w = node.widgets?.find?.(w => w?.name === "items_text") || node.widgets?.[0];
                        const cur = (w?.value ?? "");
                        const base = cur.length === 0 ? "" : (cur.endsWith("\n") ? cur : cur + "\n");
                        const newVal = base + paths.join("\n");

                        if (w) w.value = newVal;
                        if (node.onInputChanged) node.onInputChanged();
                        if (node.canvas?.setDirty) node.canvas.setDirty(true, true);
                    } catch (_e) {}
                },
            });

            // Ensure the input is removed when the node is removed
            chainCallback(this, "onRemoved", () => {
                fileInput?.remove();
            });

            // Append the input to the document
            document.body.append(fileInput);

            // Button to open file picker and add selected file paths
            const chooseWidget = node.addWidget("button", "Choose files to add", null, () => {
                //clear the active click event
                app.canvas.node_widget = null;

                fileInput.click();
            });
            chooseWidget.options.serialize = false;

            // Per-node drag & drop handling using the example style
            this.onDragOver = (e) => !!e?.dataTransfer?.types?.includes?.("Files");
            this.onDragDrop = async (e) => {
                try {
                    if (!e?.dataTransfer?.types?.includes?.("Files")) {
                        return false;
                    }

                    const files = Array.from(e.dataTransfer?.files || []);
                    if (!files.length) return false;

                    const paths = files.map(f => f.path || f.name).filter(Boolean);
                    if (!paths.length) return false;

                    const w = this.widgets?.find?.(w => w?.name === "items_text") || this.widgets?.[0];
                    const cur = (w?.value ?? "");
                    const base = cur.length === 0 ? "" : (cur.endsWith("\n") ? cur : cur + "\n");
                    const newVal = base + paths.join("\n");

                    if (w) w.value = newVal;
                    if (this.onInputChanged) this.onInputChanged();
                    if (this.canvas?.setDirty) this.canvas.setDirty(true, true);

                    return true;
                } catch (err) {
                    console.error("Error handling onDragDrop:", err);
                    return false;
                }
            };
        });

        // Drag & drop handlers are now defined per-node in onNodeCreated using a hidden file input.
    },
});
