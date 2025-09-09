import {app} from "../../../scripts/app.js";

app.registerExtension({
    name: "ovum.localstorage",
    async beforeRegisterNodeDef(nodeType, nodeData, app_) {
        // Hook render of UI payload for nodes
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function(output) {
            try {
                const ui = output?.ui || output?.[0]?.ui || null;
                if (ui?.ovum_localstorage_set) {
                    const {name, value, overwrite} = ui.ovum_localstorage_set;
                    if (name && typeof localStorage !== 'undefined') {
                        if (!overwrite) {
                            const exists = localStorage.getItem(name) !== null;
                            if (!exists) localStorage.setItem(name, String(value ?? ""));
                        } else {
                            localStorage.setItem(name, String(value ?? ""));
                        }
                    }
                }
                if (ui?.ovum_localstorage_get) {
                    const {name} = ui.ovum_localstorage_get;
                    if (name && typeof localStorage !== 'undefined') {
                        // nothing to push back into backend outputs; ComfyUI doesn't allow dynamic override here.
                        // This hook exists to warm caches if needed in future.
                    }
                }
            } catch(_e) { /* ignore */ }
            return onExecuted ? onExecuted.apply(this, arguments) : undefined;
        }
    }
});
