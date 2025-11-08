const comfyAPI = window.comfyAPI ?? {};
const app = comfyAPI.app?.app ?? null;
const api = comfyAPI.api?.api ?? null;
const $el = comfyAPI.ui?.$el ?? null;
const ComfyDialog = comfyAPI.dialog?.ComfyDialog ?? null;
const ComfyWidgets = comfyAPI.widgets?.ComfyWidgets ?? null;
const applyTextReplacements = comfyAPI.utils?.applyTextReplacements ?? null;
const GroupNodeConfig = comfyAPI.groupNode?.GroupNodeConfig ?? null;

const registerExtension = (ext) => {
    try {
        app?.registerExtension?.(ext);
    } catch (_) {}
};
function getUserSettingsValue(key) {
    try {
        if (!key) return null;
        return app?.ui?.settings?.getSettingValue?.(key) ?? null;
    } catch (_) {
        return null;
    }
}

function getSetting(key, localKey = null) {
    try {
        let value = key ? getUserSettingsValue(key) : null;
        if (value == null) {
            value = localKey ? localStorage[localKey] : localStorage[key] ?? null;
        }
        return value;
    } catch (_) {
        return null;
    }
}

function getSettingsLookup(name, onChange = () => {}) {
    const entry = app?.ui?.settings?.settingsLookup?.[name];
    if (entry) {
        entry.onChange = (v) => onChange(v);
    }
}

async function setSetting(key, value, persistKey = null) {
    if (!key) throw new Error("Invalid arguments");
    try {
        const hasSetter = app?.ui?.settings?.setSettingValue;
        if (hasSetter) {
            app.ui.settings.setSettingValue(key, value);
        } else {
            await api.storeSetting(key, value);
        }
        if (persistKey) {
            localStorage[persistKey] = typeof value === "object" ? JSON.stringify(value) : value;
        }
    } catch (_) {}
}

function addSetting(setting) {
    const exists = app?.ui?.settings?.settingsLookup?.[setting?.id];
    if (!exists) app?.ui?.settings?.addSetting?.(setting);
}

function getLocale() {
    return getSetting("Comfy.Locale");
}
