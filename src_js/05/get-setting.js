/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyNodeDef} ComfyNodeDef */
/** @typedef {import('../../typings/ComfyNode').ComfyNode} ComfyNode */

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";



function plainObjectCopy(obj) {
    try {
        return JSON.parse(JSON.stringify(obj ?? {}));
    } catch {
        const out = {};
        if (obj && typeof obj === 'object') {
            for (const k of Object.keys(obj)) out[k] = obj[k];
        }
        return out;
    }
}

function toComfyType(t) {
    try {
        if (!t || typeof t !== 'string' || t === 'hidden') return '*';
        return t.toUpperCase();
    } catch {
        return '*';
    }
}

function getLookupTypeFor(settingName) {
    try {
        const lookup = app?.ui?.settings?.settingsLookup;
        const t = lookup?.[settingName]?.type;
        return toComfyType(t);
    } catch {
        return 'STRING';
    }
}

function updateValueOut(node, settingName) {
    try {
        const value = app?.ui?.settings?.getSettingValue?.(settingName);
        const lookupType = app?.ui?.settings?.settingsLookup?.[settingName]?.type ?? typeof value;
        const typeUpper = toComfyType(lookupType);
        const text = JSON.stringify({ type: typeUpper, value: value }, null, 2);
        const widget = node.widgets?.find?.(w => w.name === 'value_out');
        if (widget) {
            widget.value = text;
        }
        node?.setDirtyCanvas?.(true, true);
    } catch {}
}

function updateOutputType(node, settingName) {
    try {
        const comfyType = getLookupTypeFor(settingName);
        if (Array.isArray(node.outputs) && node.outputs.length > 0) {
            node.outputs[0].type = comfyType;
            node.outputs[0].name = 'value';
            node.outputs[0].label = comfyType;
        }
        node?.setDirtyCanvas?.(true, true);
    } catch {}
}

app.registerExtension({
    name: 'ovum.get-setting',

    async setup() {
        // Inject settings snapshot into workflow extras during prompt build
        const originalGraphToPrompt = app.graphToPrompt;
        app.graphToPrompt = async function() {
            const res = await originalGraphToPrompt.apply(this, arguments);
            try {
                const settingsValues = plainObjectCopy(app?.ui?.settings?.settingsValues);
                res.workflow = res.workflow || {};
                res.workflow.settings = settingsValues; // top-level for easy access
                res.workflow.extra = res.workflow.extra || {};
                res.workflow.extra.settings = settingsValues; // also under extra for compatibility

                try {
                    const nodes = app?.graph?._nodes || [];
                    for (const n of nodes) {
                        if (n?.type === 'GetSettingOvum') {
                            const w = n.widgets?.find?.(w => w.name === 'setting');
                            updateValueOut(n, w?.value);
                        }
                    }
                } catch {
                    console.log('ovum.get-setting: graphToPrompt: couldnt update GetSettingOvum widget');
                }
            } catch {
                console.log('ovum.get-setting: graphToPrompt hook error');
            }
            console.log('ovum.get-setting: graphToPrompt hook result', res.workflow.extra.settings['Comfy.LinkRenderMode']);

            return res;
        }
    },

    /**
     * @param {ComfyNode} nodeType
     * @param {ComfyNodeDef} nodeData
     * @param {ComfyApp} app
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData?.name !== 'GetSettingOvum') return;

        // // Initialize output slot to a safe default; it will be updated dynamically per selection
        // try {
        //     if (Array.isArray(nodeData?.outputs) && nodeData.outputs.length > 0) {
        //         nodeData.outputs[0].type = 'STRING';
        //         nodeData.outputs[0].name = 'value';
        //         nodeData.outputs[0].label = 'STRING';
        //     }
        // } catch {}

        // Ensure the node has the widgets we need when created
        const onCreate = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            const r = onCreate?.apply(this, arguments);
            /** @type {ComfyNode} */
            const node = this;

            try {
                const keys = Object.keys(app?.ui?.settings?.settingsValues || {});
                // sort settings keys case-insensitively for consistent UI ordering
                try { keys.sort((a, b) => a?.localeCompare?.(b, undefined, { sensitivity: 'accent' }) ?? 0); } catch {}
                // Add combobox for setting selection
                let settingWidget = node.widgets?.find?.(w => w.name === 'setting');
                settingWidget.options = settingWidget.options || {}; // ensure object
                settingWidget.options.values = keys;
                // Ensure callback is set even if widget was created on Python side
                settingWidget.callback = (value) => {
                    updateOutputType(node, value);
                    updateValueOut(node, value);
                };

                // Add readonly multiline text widget for value/type
                let valueWidget = node.widgets?.find?.(w => w.name === 'value_out');
                if (valueWidget) {
                    valueWidget.options = { ...(valueWidget.options||{}), multiline: true, disabled: true };
                    valueWidget.beforeQueued = (value) => {
                        console.log('ovum.get-setting: valueWidget.beforeQueued', value);
                        updateValueOut(node, settingWidget.value);
                    }
                    if (valueWidget.inputEl) {
                        valueWidget.inputEl.disabled = true;
                    }
                }

                // Ensure initial output type and value match current selection
                updateOutputType(node, settingWidget.value);
                updateValueOut(node, settingWidget.value);
            } catch {}

            return r;
        }

        // Update read-only value_out whenever the node executes
        // const originalOnExecuted = nodeType.prototype.onExecuted;
        // nodeType.prototype.onExecuted = function(message) {
        //     try {
        //         const node = this;
        //         const settingWidget = node.widgets?.find?.(w => w.name === 'setting');
        //         updateValueOut(node, settingWidget?.value);
        //     } catch (e) {}
        //     return originalOnExecuted ? originalOnExecuted.apply(this, arguments) : undefined;
        // };

        // Also refresh on execution start (before any nodes run) TOO LATE TO AFFECT CACHE
        // const execStartHandler = () => {
        //     try {
        //         const nodes = app?.graph?._nodes || [];
        //         for (const n of nodes) {
        //             if (n?.type === nodeData.name) {
        //                 const w = n.widgets?.find?.(w => w.name === 'setting');
        //                 updateValueOut(n, w?.value);
        //             }
        //         }
        //     } catch {}
        // };
        // api.addEventListener("execution_start", execStartHandler);
    },
});
