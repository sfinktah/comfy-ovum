import { app } from "../../../scripts/app.js";
import { chainCallback } from "../01/utility.js";

const TARGET_CLASSES = new Set([
    "LoadImageWithWorkflowOvum",
    "LoadImageFromOutputWithWorkflowOvum",
    "LoadImageFromOutputSubdirectoryWithWorkflowOvum",
]);

function basename(path) {
    try {
        if (!path) return "";
        const norm = String(path).replace(/\\/g, "/");
        const idx = norm.lastIndexOf("/");
        return idx >= 0 ? norm.slice(idx + 1) : norm;
    } catch(_) { return ""; }
}

app.registerExtension({
    name: "ovum.load_image_with_workflow.ui",
    /**
     * @param {import("../../typings/ComfyNode").ComfyNode} nodeType
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} nodeData
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} app
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (!TARGET_CLASSES.has(nodeType?.comfyClass)) return;

        // Create a small info area to show the loaded filename
        chainCallback(nodeType.prototype, "onNodeCreated", function() {
            try {
                // Remove existing widget if re-created
                if (this._loadedPathWidget && this.ensureWidgetRemoved) {
                    try { this.ensureWidgetRemoved(this._loadedPathWidget); } catch(_){ }
                    this._loadedPathWidget = null;
                }

                const el = document.createElement("div");
                el.className = "ovum-loaded-filename";
                el.style.fontSize = "11px";
                el.style.opacity = "0.85";
                el.style.whiteSpace = "nowrap";
                el.style.textOverflow = "ellipsis";
                el.style.overflow = "hidden";
                el.style.maxWidth = "100%";
                el.title = "";
                el.textContent = "";

                const w = this.addDOMWidget("Loaded File", "loaded-path-info", el, {
                    serialize: false,
                    hideOnZoom: false,
                    getHeight: () => {
                        try {
                            const parent = w?.parentEl || el;
                            if (!parent) return 0;
                            const visible = (el.textContent || "").length > 0;
                            return visible ? Math.min(28, Math.max(16, el.scrollHeight || el.offsetHeight || 18)) : 0;
                        } catch(_) { return 0; }
                    },
                });
                this._loadedPathWidget = w;

                // helper to update both the hidden widget and the label
                this._setLoadedPathUI = (absPath) => {
                    try {
                        const pathStr = String(absPath || "");
                        // Update hidden widget if present
                        const hw = (this.widgets || []).find((w) => w?.name === "loaded_path");
                        if (hw) {
                            hw.value = pathStr;
                        }
                        // Update the label
                        const base = basename(pathStr);
                        if (el) {
                            el.textContent = base || "";
                            el.title = pathStr || "";
                        }
                        this.setDirtyCanvas?.(true, true);
                    } catch(_) { /* ignore */ }
                }
            } catch(_) { /* ignore */ }
        });

        // When node executed, get the absolute path from the UI payload and update
        chainCallback(nodeType.prototype, "onExecuted", function(message) {
            try {
                const ui = message || {};
                // We expect python to send { loaded_path, loaded_basename }
                const p = ui.loaded_path || ui.filepath || ui.path || "";
                this._setLoadedPathUI?.(p);
            } catch(_) { /* ignore */ }
        });
    }
});
