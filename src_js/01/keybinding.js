import { app } from "../../../scripts/app.js";

/**
 * Returns the keybinding array for a given commandId, following macOS menu order
 * of modifiers and placing the main key last. If no matching command is found,
 * returns null. If the command exists but has no keybinding, returns false.
 *
 * macOS modifier order we use: Control, Option, Shift, Command, then the key.
 *
 * @param {string} commandId - The command ID to look up.
 * @param {object} [options]
 * @param {any} [options.appRef=app] - Optional ComfyUI app reference (defaults to imported app).
 * @returns {string[] | null | false}
 */
export function getKeybindingForCommand(commandId, { appRef = app } = {}) {
    try {
        const exts = appRef?.extensions;
        if (!commandId || !Array.isArray(exts) || exts.length === 0) return null;

        // Find any extension that declares this commandId
        let matchedExt = null;
        for (const ext of exts) {
            const cmds = Array.isArray(ext?.commands) ? ext.commands : [];
            if (cmds.some(c => c && c.id === commandId)) {
                matchedExt = ext;
                break;
            }
        }

        if (!matchedExt) return null; // Command not registered at all

        const binds = Array.isArray(matchedExt.keybindings) ? matchedExt.keybindings : [];
        const kb = binds.find(b => b && b.commandId === commandId);
        if (!kb) return false; // Command exists but has no current keybinding

        const combo = kb.combo || {};
        const out = [];

        // macOS menu order: Control, Option(Alt), Shift, Command(Meta)
        if (combo.ctrl) out.push("Control");
        if (combo.alt) out.push("Option");
        if (combo.shift) out.push("Shift");
        if (combo.meta) out.push("Command");

        // Normalize main key last
        const mainKey = normalizeKey(combo.key);
        if (mainKey) out.push(mainKey);

        return out.length ? out : false;
    } catch (_) {
        // Be conservative: if something unexpected happens, act as not found
        return null;
    }
}

/**
 * Normalize a key value to a human-friendly representation.
 * - Single letters become uppercase (e.g., 't' -> 'T')
 * - Known special names are title-cased
 * @param {string} key
 * @returns {string | undefined}
 */
function normalizeKey(key) {
    if (!key || typeof key !== "string") return undefined;
    if (key.length === 1) return key.toUpperCase();

    const map = {
        "arrowup": "ArrowUp",
        "arrowdown": "ArrowDown",
        "arrowleft": "ArrowLeft",
        "arrowright": "ArrowRight",
        "pageup": "PageUp",
        "pagedown": "PageDown",
        "escape": "Escape",
        "esc": "Escape",
        "space": "Space",
        "spacebar": "Space",
        "enter": "Enter",
        "return": "Enter",
        "tab": "Tab",
        "backspace": "Backspace",
        "delete": "Delete",
        "home": "Home",
        "end": "End",
        "f1": "F1","f2": "F2","f3": "F3","f4": "F4","f5": "F5","f6": "F6","f7": "F7","f8": "F8","f9": "F9","f10": "F10","f11": "F11","f12": "F12",
    };

    const lower = key.toLowerCase();
    if (map[lower]) return map[lower];

    // Generic Title Case fallback
    return lower.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (m, p1, p2) => p1 + p2.toUpperCase());
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Formats a command's keybinding as a sequence of <kbd> elements.
 * - If the command isn't found, returns a single <kbd> with "contact developer".
 * - If found but unbound, returns a single <kbd> with "not set".
 * - Otherwise, returns <kbd> elements for each key in order.
 * @param {string} commandId
 * @param {{className?: string}} [opts]
 * @returns {string} HTML string
 */
export function formatKeybindingAsKbd(commandId, opts = {}) {
    const { className = "ovum-kbd" } = opts;
    const res = getKeybindingForCommand(commandId);

    let keys;
    if (res === null) {
        keys = ["contact developer"];
    } else if (res === false) {
        keys = ["not set"];
    } else {
        keys = res;
    }

    return keys
        .map(k => `<kbd class="${className}">${escapeHtml(k)}</kbd>`)
        .join("");
}

export default getKeybindingForCommand;
