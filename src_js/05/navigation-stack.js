/**
 * Navigation stack for TwinNodes jumps and a backtrack hotkey command.
 */
import { app } from "../../../scripts/app.js";
import { showTipWithCheckbox } from "../04/dialog-helper.js";
import { formatKeybindingAsKbd } from "../01/keybinding.js";

const NAV_STORAGE_KEY = "ovum.twinnodes.navTip.hidden";

// Simple in-memory stack; persists across jumps during session
const navStack = [];

function getCanvasState() {
    const c = app.canvas;
    const ds = c && c.ds;
    const scale = ds?.scale ?? c?.scale ?? 1;
    const offset = Array.isArray(ds?.offset) ? [...ds.offset] : (Array.isArray(c?.offset) ? [...c.offset] : [0,0]);
    const selected = Array.isArray(c?.selected_nodes)
        ? c.selected_nodes.map(n => n?.id).filter(Boolean)
        : (c?.selected_nodes ? [c.selected_nodes.id].filter(Boolean) : []);
    return { scale, offset, selected };
}

function restoreCanvasState(state) {
    const c = app.canvas;
    const ds = c && c.ds;
    if (!state || !c) return;

    // Restore zoom first to avoid offset shift
    const targetZoom = state.scale ?? 1;
    try {
        if (typeof c.setZoom === "function") {
            c.setZoom(targetZoom);
        } else if (ds && typeof ds.changeScale === "function") {
            const current = ds.scale || 1;
            // changeScale expects a multiplier
            ds.changeScale(targetZoom / current, c.canvas.width / 2, c.canvas.height / 2);
            ds.scale = targetZoom;
        } else if (ds) {
            ds.scale = targetZoom;
        }
    } catch (_) {}

    try {
        if (Array.isArray(state.offset)) {
            if (ds && Array.isArray(ds.offset)) {
                ds.offset[0] = state.offset[0];
                ds.offset[1] = state.offset[1];
            } else if (Array.isArray(c.offset)) {
                c.offset[0] = state.offset[0];
                c.offset[1] = state.offset[1];
            }
        }
    } catch (_) {}

    // Restore selection (best effort)
    try {
        c.deselectAllNodes?.();
        if (Array.isArray(state.selected)) {
            for (const id of state.selected) {
                const node = app.graph?.getNodeById?.(id);
                if (node) c.selectNode(node, true);
            }
        }
    } catch (_) {}

    c.setDirty?.(true, true);
}

export function pushCurrentView() {
    navStack.push(getCanvasState());
}

export function popAndRestoreView() {
    const state = navStack.pop();
    if (state) restoreCanvasState(state);
}

export function showTwinTipIfNeeded() {
    const kbdHtml = formatKeybindingAsKbd("ovum.twinnodes.backtrack");
    const msg = `After using \"Go to setter/getter\", press ${kbdHtml} to jump back. You can press it repeatedly to step back through all previous locations.`;

    showTipWithCheckbox({
        storageKey: NAV_STORAGE_KEY,
        title: "Useful tip",
        message: msg,
        okText: "OK",
    });
}

// Register command with default hotkey
app.registerExtension({
    name: "ovum.twinnodes.navstack",
    // Register commands
    // https://docs.comfy.org/custom-nodes/js/javascript_commands_keybindings
    commands: [
        {
            id: "ovum.twinnodes.backtrack",
            label: "Return to previous TwinNodes location",
            function: () => {
                popAndRestoreView();
            }
        }
    ],
    // Associate keybindings with commands
    keybindings: [
        {
            combo: { key: "t", shift: true },
            commandId: "ovum.twinnodes.backtrack"
        }
    ]
});
