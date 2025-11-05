/** @typedef {import("../../typings/ComfyNode.js").ComfyNode} ComfyNode */
/** @typedef {import('../common/logger.js').Logger} Logger */

/**
 * Hooks into a widget to provide live update functionality for the LiveCrop node.
 * This includes custom drawing for crop widgets, value normalization, and triggering redraw on change.
 *
 * @param {ComfyNode} node The node instance.
 * @param {string} widgetName The name of the widget to hook.
 * @param {function} redraw The redraw function to call when the widget value changes.
 * @param {Logger} Logger The logger instance.
 * @param {function} chainCallback The utility to chain callbacks.
 */
export function hookWidget(node, widgetName, redraw, Logger, chainCallback) {
    const isCrop = /^crop_/.test(widgetName);
    const w = (node.widgets || []).find(w => w && w.name === widgetName);
    if (!w) {
        Logger.log({
            class: 'LiveCrop',
            method: 'hookWidget',
            severity: 'warn',
            tag: 'widget_not_found'
        }, `Widget not found: ${widgetName}`, {
            widgetName: widgetName,
            availableWidgets: (node.widgets || []).map(w => w?.name).filter(Boolean)
        });
        return;
    }

    Logger.log({
        class: 'LiveCrop',
        method: 'hookWidget',
        severity: 'debug',
        tag: 'widget_hook_setup'
    }, `Setting up hook for widget: ${widgetName}`, {
        widgetName: widgetName,
        hasExistingCallback: !!w.callback
    });

    // Override display for crop_* widgets to show positive percentages
    if (isCrop) {
        try {
            const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(w), "_displayValue");
            const originalGetter = desc && desc.get;
            Object.defineProperty(w, "_displayValue", {
                get: function() {
                    try {
                        if (this.computedDisabled) return "";
                        const v = Number(this.value);
                        if (!isFinite(v)) return String(this.value);
                        const pct = Math.round(-100 * v);
                        return `${Math.abs(pct)}%`;
                    } catch (_) {
                        return originalGetter ? originalGetter.call(this) : String(this.value);
                    }
                },
                configurable: true
            });
        } catch (_) { /* ignore */ }

        // Override drawWidget to ensure our custom _displayValue is used
        try {
            const origDrawWidget = w.drawWidget?.bind(w);
            // Utility clamp since we cannot import from litegraph here
            const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
            w.drawWidget = function(ctx, { width, showText = true } = {}) {
                try {
                    // Fallbacks for required values from BaseWidget
                    const margin = (this.constructor && typeof this.constructor.margin === 'number') ? this.constructor.margin : 4;
                    const { height, y } = this;

                    // Background
                    ctx.save();
                    const prev = { fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, textAlign: ctx.textAlign };
                    ctx.fillStyle = this.background_color;
                    const barW = Math.max(0, (width ?? (this.width || 0)) - margin * 2);
                    ctx.fillRect(margin, y, barW, height);

                    // Slider value portion
                    const min = (this.options && typeof this.options.min === 'number') ? this.options.min : -1;
                    const max = (this.options && typeof this.options.max === 'number') ? this.options.max : 0;
                    const range = (max - min) || 1;
                    let nvalue = ((Number(this.value) - min) / range);
                    if (!isFinite(nvalue)) nvalue = 0;
                    nvalue = clamp(nvalue, 0, 1);
                    ctx.fillStyle = (this.options && this.options.slider_color) ? this.options.slider_color : '#678';
                    ctx.fillRect(margin, y, nvalue * barW, height);

                    // Outline when active
                    if (showText && !this.computedDisabled) {
                        ctx.strokeStyle = this.outline_color;
                        ctx.strokeRect(margin, y, barW, height);
                    }

                    // Marker support
                    if (this.marker != null) {
                        let marker_nvalue = ((Number(this.marker) - min) / range);
                        if (!isFinite(marker_nvalue)) marker_nvalue = 0;
                        marker_nvalue = clamp(marker_nvalue, 0, 1);
                        ctx.fillStyle = (this.options && this.options.marker_color) ? this.options.marker_color : '#AA9';
                        ctx.fillRect(margin + marker_nvalue * barW, y, 2, height);
                    }

                    // Text using our overridden _displayValue
                    if (showText) {
                        ctx.textAlign = 'center';
                        ctx.fillStyle = this.text_color;
                        const text = `${this.label || this.name}  ${this._displayValue}`;
                        ctx.fillText(text, (width ?? (this.width || 0)) * 0.5, y + height * 0.7);
                    }

                    // Restore context
                    Object.assign(ctx, prev);
                    ctx.restore();
                } catch (e) {
                    // Fallback to original if our override fails
                    if (typeof origDrawWidget === 'function') {
                        return origDrawWidget(ctx, { width, showText });
                    }
                }
            };
        } catch (_) { /* ignore */ }

        // Normalize incoming linked values according to rules
        // 1) value = abs(value)
        // 2) if value > 100 then error
        // 3) if value >= 1 then value /= 100
        // 4) value = value * -1
        const normalizeLinked = (val) => {
            let v = Number(val);
            if (!isFinite(v)) return val;
            v = Math.abs(v);
            if (v > 100) {
                console.error(`[LiveCrop] Linked value for ${widgetName} out of range (>100):`, v);
                return node.widgets?.find(wi=>wi===w)?.value ?? -0; // no change
            }
            if (v >= 1) v = v / 100;
            v = v * -1;
            return v;
        };

        // Intercept changes coming from links by wrapping setValue if present
        if (typeof w.setValue === 'function') {
            const origSetValue = w.setValue.bind(w);
            w.setValue = function(newVal, options) {
                // Preserve original signature: (value, { e, node, canvas })
                const normalizedVal = normalizeLinked(newVal);
                return origSetValue(normalizedVal, options || {});
            };
        }

        // Also wrap callback so manual edits still trigger redraw and linked inputs get normalized
        const priorCb = w.callback;
        w.callback = function(val, canvas, node, pos, e) {
            // setValue now normalizes incoming values for linked updates when they call into setValue.
            // To avoid double-normalizing, only normalize here if value seems raw AND event indicates link.
            const sourceIsLink = e && (e.isTransient === true || e.isLink === true);
            const maybeNormalized = (typeof val === 'number' && val <= 0 && val >= -1);
            const newVal = sourceIsLink && !maybeNormalized ? normalizeLinked(val) : val;
            if (typeof priorCb === 'function') priorCb.call(this, newVal, canvas, node, pos, e);
        };
    }

    const hadCb = !!w.callback;
    chainCallback(w, "callback", function (val, canvas, node, pos, e) {
        Logger.log({
            class: 'LiveCrop',
            method: 'widgetCallback',
            severity: 'trace',
            tag: 'widget_change'
        }, `Widget changed: ${widgetName}`, {
            widgetName: widgetName,
            newValue: val,
            hasOriginalCallback: hadCb
        });

        try {
            redraw();
        } catch(e) {
            Logger.log({
                class: 'LiveCrop',
                method: 'widgetCallback',
                severity: 'error',
                tag: 'widget_redraw_error'
            }, `Error during widget redraw: ${widgetName}`, {
                widgetName: widgetName,
                error: e.message,
                stack: e.stack
            });
        }
    });
}
