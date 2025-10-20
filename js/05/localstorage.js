import {app} from "../../../scripts/app.js";

function getWidgetValueFromPrompt(p, nodeId, name) {
    // Translated from the provided snippet (without lodash dependency)
    let ptr = p?.output?.[nodeId]?.inputs?.[name];
    if (ptr === undefined) throw Error("ptr undefined");
    if (!Array.isArray(ptr)) return ptr;
    if (Array.isArray(ptr) && ptr.length === 2) {
        const [n, i] = ptr;
        // noinspection EqualityComparisonWithCoercionJS
        const node = (p?.workflow?.nodes || []).find(v => v?.id == n);
        if (!node) throw Error("node not found");
        ptr = node.widgets_values?.[i];
        if (ptr === undefined) throw Error("widget value undefined");
        if (!Array.isArray(ptr)) return ptr;
    }
    throw Error('undefinedLogicHere');
}

app.registerExtension({
    name: "ovum.localstorage",
    setup() {
        const api = app.api;
        // 1) Listen for executing and send the resolved widget value to backend
        api.addEventListener("executing", async (ev) => {
            try {
                const node = ev?.detail?.node || ev?.detail?.item?.node;
                const nodeId = node?.id ?? ev?.detail?.nodeId;
                // Only act for our Get LocalStorage node; fallback to title check
                const klass = node?.comfyClass || node?.type || node?.title || "";
                if (!nodeId || !String(klass).match(/Get\s*LocalStorage|GetLocalStorage/)) return;
                const widgetName = "name"; // the widget holding the variable name
                const prompt = await app.graphToPrompt();
                const value = getWidgetValueFromPrompt(prompt, nodeId, widgetName);
                const url = `/ovum/localstorage/get?name=${encodeURIComponent(String(value ?? ""))}&node=${encodeURIComponent(nodeId)}&widget=${encodeURIComponent(widgetName)}`;
                fetch(url).catch(() => {});
            } catch (_e) {
                // swallow
            }
        });
    },
    /**
     * @param {import("../../typings/ComfyNode").ComfyNode} nodeType
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} nodeData
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} appInstance
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app_) {
        // 2) Still honor UI side-effects for SetLocalStorage on node onExecuted
        if (nodeType?.comfyClass !== "SetLocalStorage") {
            return;
        }
        Logger.log({
            class: 'SetLocalStorage',
            method: 'beforeRegisterNodeDef',
            severity: 'trace',
        }, 'nodeData.name matches "SetLocalStorage"');

        // StyleGuide: https://docs.comfy.org/development/comfyui-server/comms_messages#using-executed
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function(message) {
            Logger.log({
                class: 'SetLocalStorage',
                method: 'onExecuted',
                severity: 'trace',
            }, {message: message});
            try {

                /** @type {{ ovum_localstorage_set?: { name: string, value: string, overwrite: boolean } }} */
                const ui = message || null;
                if (ui && ui.ovum_localstorage_set) {
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
            } catch(_e) { /* ignore */ }
            return onExecuted ? onExecuted.apply(this, arguments) : undefined;
        }
    }
});
