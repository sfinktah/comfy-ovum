/**
 * Navigation stack for TwinNodes jumps and a backtrack hotkey command.
 */
import { app } from "../../../scripts/app.js";

const NAV_STORAGE_KEY = "ovum.twinnodes.navTip.hidden";
const DEFAULT_HOTKEY = "Shift+T";

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

function shouldHideTip() {
    try {
        const v = localStorage.getItem(NAV_STORAGE_KEY);
        return v === "1";
    } catch (_) { return false; }
}

function setHideTip(hide) {
    try { localStorage.setItem(NAV_STORAGE_KEY, hide ? "1" : "0"); } catch (_) {}
}

function showTip() {
    // Build a lightweight tip dialog
    const existing = document.querySelector(".ovum-twinnodes-tip");
    if (existing) return;

    const wrap = document.createElement("div");
    wrap.className = "ovum-twinnodes-tip";
    wrap.style.position = "fixed";
    wrap.style.right = "16px";
    wrap.style.top = "12px";
    wrap.style.zIndex = "99999";
    wrap.style.maxWidth = "380px";
    wrap.style.background = "#222";
    wrap.style.color = "#eee";
    wrap.style.padding = "10px 12px";
    wrap.style.borderRadius = "8px";
    wrap.style.boxShadow = "0 6px 18px rgba(0,0,0,0.45)";
    wrap.style.font = "13px/1.3 system-ui, sans-serif";
    wrap.style.maxHeight = "40vh";
    wrap.style.overflow = "auto";

    const title = document.createElement("div");
    title.textContent = "Useful tip";
    title.style.fontWeight = "600";
    title.style.marginBottom = "6px";

    const body = document.createElement("div");
    body.innerHTML = `After using \"Go to setter/getter\", press <b>${DEFAULT_HOTKEY}</b> to jump back. You can press it repeatedly to step back through all previous locations.`;
    body.style.marginBottom = "10px";

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "ovum-tip-hide";

    const label = document.createElement("label");
    label.htmlFor = cb.id;
    label.textContent = "Don't show me this again";

    const close = document.createElement("button");
    close.textContent = "OK";
    close.style.marginLeft = "auto";

    close.onclick = () => {
        if (cb.checked) setHideTip(true);
        wrap.remove();
    };

    row.appendChild(cb);
    row.appendChild(label);
    row.appendChild(close);

    wrap.appendChild(title);
    wrap.appendChild(body);
    wrap.appendChild(row);

    document.body.appendChild(wrap);
}

export function showTwinTipIfNeeded() {
    if (!shouldHideTip()) showTip();
}

// Register command with default hotkey
app.registerExtension({
    name: "ovum.twinnodes.navstack",
    commands: [
        {
            id: "ovum.twinnodes.backtrack",
            icon: "pi pi-arrow-left",
            label: "Return to previous TwinNodes location",
            hotkey: DEFAULT_HOTKEY,
            function: () => {
                popAndRestoreView();
            }
        }
    ]
});
