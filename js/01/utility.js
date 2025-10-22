
/**
 * chainCallback(object, property, callback)
 *
 * Safely chains your callback to an existing method or event-like hook on an object
 * (typically a prototype), without mutating global prototypes in-place or losing the
 * original behavior. This is a tiny utility that makes it easy to extend third-party
 * classes such as ComfyUI/LiteGraph node hooks (onNodeCreated, onConfigure, computeSize,
 * onSerialize, onExecuted, onConnectionsChange, onTitleButtonClick, etc.).
 *
 * How it works
 * - If object[property] already exists and is callable, chainCallback wraps it so that:
 *   1) The original method is invoked first with the same this and arguments.
 *   2) The original method's return value is exposed on the instance during your callback
 *      via a temporary key: this.__chainCallbackPrevReturn_<property>.
 *   3) Your callback is then invoked. If your callback returns a non-undefined value, that
 *      value becomes the final return of the chained method. Otherwise, the original return
 *      value is preserved. After your callback finishes, the temporary key is removed.
 * - If object[property] does not exist, it is defined directly as your callback.
 *
 * Why the temporary previous-return key?
 * Some hooks (e.g., computeSize) need to read the original method's computed result and then
 * make an adjusted return. chainCallback stores the original return at:
 *   this[`__chainCallbackPrevReturn_${property}`]
 * during your callback so you can apply adjustments without re-invoking the original method.
 * The key is deleted after your callback completes.
 *
 * Return value rules
 * - If your callback returns undefined → the original return is used (if any).
 * - If your callback returns any non-undefined value → it overrides the return.
 * - If there was no original method, the return is simply whatever your callback returns.
 *
 * Usage examples
 * 1) Extending lifecycle hooks (no need to change the return value)
 *    chainCallback(NodeType.prototype, "onNodeCreated", function() {
 *      // Your extra setup logic
 *      this.foo = (this.foo || 0) + 1;
 *      // No return → the original onNodeCreated behavior and return are preserved
 *    });
 *
 * 2) Wrapping computeSize to respect a DOM widget's height (override return)
 *    chainCallback(NodeType.prototype, "computeSize", function(size) {
 *      // Access the original computeSize result captured by chainCallback
 *      const prev = this?.__chainCallbackPrevReturn_computeSize;
 *      // Start from original size if available, else a sane default
 *      const r = Array.isArray(prev) ? prev.slice() : [140, 80];
 *
 *      // Suppose we added a DOM widget that can report its natural height
 *      const w = this._myWidget;
 *      const visible = !!w && (!w.parentEl || w.parentEl.style.display !== "none");
 *      const h = visible ? Number(w?.options?.getHeight?.() ?? 0) : 0;
 *      if (Number.isFinite(h) && h > 0) {
 *        const pad = 12;
 *        if (h + pad > r[1]) r[1] = h + pad; // ensure enough height
 *      }
 *      return r; // non-undefined → overrides the original return
 *    });
 *
 * 3) Reading but not overriding the original return
 *    chainCallback(obj, "someMethod", function(a, b) {
 *      const prev = this.__chainCallbackPrevReturn_someMethod; // might be undefined if none
 *      // You can log or react to prev without changing it
 *      console.debug("Original return was:", prev);
 *      // No return → original value is preserved
 *    });
 *
 * 4) Adding a hook that does not exist yet
 *    // If obj.onSomething does not exist, this simply defines it
 *    chainCallback(obj, "onSomething", function(payload) {
 *      // Your implementation
 *      this.lastPayload = payload;
 *    });
 *
 * Edge cases and notes
 * - Non-callable original values: If object[property] exists but is not callable, it is treated
 *   as "does not exist" and will be replaced by your callback.
 * - Safety: The temporary previous-return key is best-effort (try/catch). If the instance is
 *   non-extensible or otherwise restricted, the chaining still works; you just won't see the key.
 * - This is intentionally small and framework-agnostic; you can use it for any object.
 * - Avoid relying on the temporary key outside of your callback; it is only present while your
 *   callback runs.
 *
 * @param {object} object - The target object or prototype whose property you want to chain.
 * @param {string} property - The property name to chain (e.g., "onNodeCreated", "computeSize").
 * @param {Function} callback - Your function to run after the original. Its non-undefined return
 *   overrides the original return. Inside this function, the original return (if any) is available
 *   as this.__chainCallbackPrevReturn_<property>.
 */
export function chainCallback(object, property, callback) {
    if (!object) {
        console.error("Tried to add callback to a non-existent object");
        return;
    }
    if (property in object) {
        const callback_orig = object[property];
        const key = `__chainCallbackPrevReturn_${property}`;
        object[property] = function () {
            const r = callback_orig?.apply(this, arguments);
            try { this[key] = r; } catch (_) {}
            const r2 = callback.apply(this, arguments);
            try { delete this[key]; } catch (_) {}
            return (r2 !== undefined) ? r2 : r;
        };
    } else {
        object[property] = callback;
    }
}

/**
 * Strips the trailing ID from a title.
 * @param {string} title
 * @returns {string} Title without the trailing ID.
 */
export function stripTrailingId(title) {
    return title.replace(/ \(\d+\)$/, '');
}

export function debounce(fn, wait = 0) {
    let timeoutId;
    function debounced(...args) {
        const context = this;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            timeoutId = null;
            fn.apply(context, args);
        }, wait);
    }
    debounced.cancel = () => {
        clearTimeout(timeoutId);
        timeoutId = null;
    };
    debounced.flush = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
            fn();
        }
    };
    return debounced;
}
