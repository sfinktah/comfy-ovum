/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LiteGraph} LiteGraph */

import {app} from "../../../scripts/app.js";
import {chainCallback} from "../01/utility.js";

function getWidgetValueByName(node, name, fallback) {
    try {
        const w = (node.widgets || []).find(w => (w.name || w.label) === name);
        if (w && w.value !== undefined && w.value !== null && String(w.value).length > 0) return w.value;
    } catch (_) {}
    return fallback;
}

async function refreshLmStudioModelsForNode(node) {
    const server_address = String(getWidgetValueByName(node, 'server_address', 'localhost')).trim();
    const server_port = parseInt(getWidgetValueByName(node, 'server_port', 1234)) || 1234;

    const res = await fetch('/ovum/lmstudio/refresh_models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_address, server_port })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
}

app.registerExtension({
    name: "ovum.contextmenu-lmstudio",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Attach only to the LMStudio node type by class name
        if (nodeData?.name !== 'LMStudioPromptOvum') return;

        chainCallback(nodeType.prototype, "getExtraMenuOptions", function (canvas, options) {
            options.push({
                content: "🥚 Update LM Studio models",
                callback: async () => {
                    try {
                        const msgBox = app.ui?.dialog?.show || ((m)=>alert(m));
                        const {server} = await refreshLmStudioModelsForNode(this);
                        (msgBox)(`Refreshed LM Studio models from ${server}.\nIf the dropdown didn't update, try reopening it or re-running to repopulate.`);
                    } catch (e) {
                        const err = e?.message || String(e);
                        console.error('[ovum] Failed to refresh LM Studio models:', e);
                        (app.ui?.dialog?.show || ((m)=>alert(m)))(`Failed to refresh LM Studio models: ${err}`);
                    }
                }
            });
        });
    }
});
