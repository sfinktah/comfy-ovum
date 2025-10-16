// Generic dialog helper for lightweight in-app prompts and tips
// Provides a Promise-based API for confirmation and info dialogs without external dependencies.

/**
 * Show a lightweight dialog.
 * @param {Object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.message] - Can contain limited HTML.
 * @param {string} [opts.confirmText="OK"]
 * @param {string} [opts.cancelText] - If provided, shows a Cancel button.
 * @param {boolean} [opts.showCheckbox=false]
 * @param {string} [opts.checkboxLabel]
 * @param {string} [opts.className] - Extra class on wrapper
 * @param {number} [opts.zIndex=99999]
 * @param {("top-right"|"center")} [opts.position="center"]
 * @returns {Promise<{confirmed: boolean, checkboxChecked: boolean}>}
 */
export function showDialog(opts = {}) {
    return new Promise((resolve) => {
        const {
            title = "",
            message = "",
            confirmText = "OK",
            cancelText = undefined,
            showCheckbox = false,
            checkboxLabel = "",
            className = "ovum-dialog",
            zIndex = 99999,
            position = "center",
        } = opts;

        // Prevent duplicate dialogs of the same class
        if (document.querySelector(`.${className}`)) {
            resolve({ confirmed: false, checkboxChecked: false });
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = className;
        wrap.style.position = "fixed";
        wrap.style.zIndex = String(zIndex);
        wrap.style.maxWidth = "420px";
        wrap.style.background = "#222";
        wrap.style.color = "#eee";
        wrap.style.padding = "12px 14px";
        wrap.style.borderRadius = "10px";
        wrap.style.boxShadow = "0 10px 24px rgba(0,0,0,0.55)";
        wrap.style.font = "13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        wrap.style.maxHeight = "60vh";
        wrap.style.overflow = "auto";
        wrap.style.border = "1px solid rgba(255,255,255,0.08)";

        if (position === "top-right") {
            wrap.style.right = "16px";
            wrap.style.top = "12px";
        } else {
            // Center with backdrop
            const backdrop = document.createElement("div");
            backdrop.style.position = "fixed";
            backdrop.style.left = "0";
            backdrop.style.top = "0";
            backdrop.style.right = "0";
            backdrop.style.bottom = "0";
            backdrop.style.background = "rgba(0,0,0,0.35)";
            backdrop.style.backdropFilter = "blur(2px)";
            backdrop.style.zIndex = String(zIndex - 1);
            document.body.appendChild(backdrop);
            // place wrap centered
            wrap.style.left = "50%";
            wrap.style.top = "20%";
            wrap.style.transform = "translateX(-50%)";
            // Click outside closes if cancel is available
            if (cancelText) {
                backdrop.addEventListener("click", () => {
                    cleanup();
                    resolve({ confirmed: false, checkboxChecked: cb?.checked || false });
                });
            }
            // keep ref for cleanup
            wrap.__backdrop = backdrop;
        }

        const titleEl = document.createElement("div");
        titleEl.textContent = title || "";
        titleEl.style.fontWeight = "600";
        titleEl.style.marginBottom = title ? "8px" : "0";
        titleEl.style.fontSize = "14px";

        const body = document.createElement("div");
        body.innerHTML = message || "";
        body.style.marginBottom = "12px";

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "10px";

        let cb = null;
        if (showCheckbox) {
            cb = document.createElement("input");
            cb.type = "checkbox";
            cb.id = `${className}-cb`;
            const label = document.createElement("label");
            label.htmlFor = cb.id;
            label.textContent = checkboxLabel || "";
            row.appendChild(cb);
            row.appendChild(label);
        }

        const spacer = document.createElement("div");
        spacer.style.flex = "1";
        row.appendChild(spacer);

        const cancelBtn = cancelText ? document.createElement("button") : null;
        if (cancelBtn) {
            cancelBtn.textContent = cancelText;
            cancelBtn.onclick = () => {
                cleanup();
                resolve({ confirmed: false, checkboxChecked: cb?.checked || false });
            };
            row.appendChild(cancelBtn);
        }

        const okBtn = document.createElement("button");
        okBtn.textContent = confirmText;
        okBtn.style.fontWeight = "600";
        okBtn.onclick = () => {
            cleanup();
            resolve({ confirmed: true, checkboxChecked: cb?.checked || false });
        };
        row.appendChild(okBtn);

        function onKey(e){
            if (e.key === "Escape" && cancelText) {
                e.stopPropagation();
                e.preventDefault();
                cleanup();
                resolve({ confirmed: false, checkboxChecked: cb?.checked || false });
            }
            if (e.key === "Enter") {
                e.stopPropagation();
                e.preventDefault();
                cleanup();
                resolve({ confirmed: true, checkboxChecked: cb?.checked || false });
            }
        }

        function cleanup(){
            document.removeEventListener("keydown", onKey, true);
            wrap.remove();
            if (wrap.__backdrop) wrap.__backdrop.remove();
        }

        wrap.appendChild(titleEl);
        wrap.appendChild(body);
        wrap.appendChild(row);
        document.body.appendChild(wrap);

        // Focus OK for quick Enter
        setTimeout(() => okBtn.focus?.(), 0);
        document.addEventListener("keydown", onKey, true);
    });
}

/**
 * Convenience helper to show a tip with a "Don't show again" checkbox at top-right.
 * Persists the checkbox state to a provided storage key.
 * @param {Object} opts
 * @param {string} opts.storageKey
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} [opts.okText="OK"]
 */
export function showTipWithCheckbox({ storageKey, title, message, okText = "OK" }) {
    // Read current hide flag
    let hide = false;
    try { hide = localStorage.getItem(storageKey) === "1"; } catch (_) {}
    if (hide) return;

    showDialog({
        title,
        message,
        confirmText: okText,
        showCheckbox: true,
        checkboxLabel: "Don't show me this again",
        className: "ovum-tip",
        position: "top-right",
        zIndex: 99999,
    }).then(({ checkboxChecked }) => {
        if (checkboxChecked) {
            try { localStorage.setItem(storageKey, "1"); } catch (_) {}
        }
    });
}

/**
 * Show a destructive confirmation dialog in the center.
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} [opts.confirmText="Delete"]
 * @param {string} [opts.cancelText="Cancel"]
 * @returns {Promise<boolean>} confirmed
 */
export async function confirmDestructive(opts) {
    const { title, message, confirmText = "Delete", cancelText = "Cancel" } = opts || {};
    const { confirmed } = await showDialog({
        title,
        message,
        confirmText,
        cancelText,
        className: "ovum-confirm",
        position: "center",
    });
    return !!confirmed;
}
