/** @typedef {import("../../typings/ComfyNode").ComfyNode} ComfyNode */
// noinspection JSFileReferences
import { app } from "../../../scripts/app.js";
import { chainCallback } from "../01/utility.js";
import { Logger } from "../common/logger.js";


function drawGuides(ctx, w, h, params) {
    const { top, bottom, left, right } = params;
    ctx.save();
    ctx.strokeStyle = "rgba(255,0,0,0.85)";
    ctx.lineWidth = 2;

    // Negative -> crop inward; Positive -> expand outward (draw at border extents)
    // We visualize the crop lines within the original image area.
    const topY = top < 0 ? Math.round(Math.abs(top) * h) : 0;
    const bottomY = bottom < 0 ? Math.round(h - Math.abs(bottom) * h) : h;
    const leftX = left < 0 ? Math.round(Math.abs(left) * w) : 0;
    const rightX = right < 0 ? Math.round(w - Math.abs(right) * w) : w;

    // Horizontal lines (top & bottom crop boundaries)
    ctx.beginPath();
    ctx.moveTo(0, topY);
    ctx.lineTo(w, topY);
    ctx.moveTo(0, bottomY);
    ctx.lineTo(w, bottomY);
    ctx.stroke();

    // Vertical lines (left & right crop boundaries)
    ctx.beginPath();
    ctx.moveTo(leftX, 0);
    ctx.lineTo(leftX, h);
    ctx.moveTo(rightX, 0);
    ctx.lineTo(rightX, h);
    ctx.stroke();

    ctx.restore();
}

app.registerExtension({
    name: "ovum.live-crop",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== "LiveCrop") {
            return;
        }

        Logger.log({
            class: 'LiveCrop',
            method: 'beforeRegisterNodeDef',
            severity: 'info',
            tag: 'node_type_match'
        }, 'Registering LiveCrop node type', { nodeType: !!nodeType, nodeData: !!nodeData });

        // noinspection JSUnusedLocalSymbols
        /** @type {ComfyNode} */
        const node = nodeType;

        chainCallback(nodeType.prototype, "onNodeCreated", function () {
            Logger.log({
                class: 'LiveCrop',
                method: 'onNodeCreated',
                severity: 'info',
                tag: 'node_creation'
            }, 'Node creation started', { nodeId: this.id, nodeType: this.type });

            // Expose LEFT compensation on window for console tweaking and cross-scope access.
            // You can modify it in the browser console, e.g. window.LiveCropLeftComp = 12;
            if (typeof window !== "undefined") {
                window.LiveCropLeftComp = typeof window.LiveCropLeftComp === "number" ? window.LiveCropLeftComp : 20;
            }

            try {
                // Create a container and canvas
                Logger.log({
                    class: 'LiveCrop',
                    method: 'onNodeCreated',
                    severity: 'debug',
                    tag: 'dom_creation'
                }, 'Creating DOM elements');

                const container = document.createElement("div");
                container.style.position = "relative";
                container.style.width = "100%";
                container.style.height = "100%";
                container.style.backgroundSize = "contain";
                container.style.backgroundRepeat = "no-repeat";
                container.style.backgroundPosition = "center";
                // Prevent any content from spilling out when the node is smaller than the canvas
                container.style.overflow = "hidden";
                container.style.boxSizing = "border-box";

                // Compensate for ComfyUI's left indentation so the canvas appears centered
                // LEFT compensation is exposed on window.LiveCropLeftComp for console tweaking.
                const overlay = document.createElement("canvas");
                // Make the canvas fill and anchor to the container so it doesn't drift vertically
                overlay.style.position = "absolute";
                overlay.style.left = "0";
                overlay.style.top = "0";
                overlay.style.right = "0";
                overlay.style.bottom = "0";
                overlay.style.width = "100%";
                overlay.style.height = "100%";
                // Start tiny; redraw will size the drawing buffer to the live container size
                overlay.width = 1;
                overlay.height = 1;
                container.appendChild(overlay);

                Logger.log({
                    class: 'LiveCrop',
                    method: 'onNodeCreated',
                    severity: 'debug',
                    tag: 'dom_creation'
                }, 'DOM elements created', {
                    containerCreated: !!container,
                    overlayCreated: !!overlay,
                    overlayDimensions: { width: overlay.width, height: overlay.height }
                });

                Logger.log({
                    class: 'LiveCrop',
                    method: 'onNodeCreated',
                    severity: 'debug',
                    tag: 'widget_creation'
                }, 'Creating DOM widget');

                this.previewWidget = this.addDOMWidget("LiveCrop", "LiveCropPreview", container, {
                    serialize: false,
                    hideOnZoom: false,
                });
                this.previewWidget.parentEl = container;
                // Support multiple images in UI
                this._livecrop = { container, overlay, img: null, imgW: 0, imgH: 0, images: [] };

                // Keep the canvas sized to the actual DOM container and redraw when it changes
                try {
                    const ro = new ResizeObserver(() => {
                        if (this._livecrop_redraw) this._livecrop_redraw();
                    });
                    ro.observe(container);
                    this._livecrop.resizeObserver = ro;
                } catch (e) {
                    // ResizeObserver might not exist in some environments; safely ignore
                }

                Logger.log({
                    class: 'LiveCrop',
                    method: 'onNodeCreated',
                    severity: 'debug',
                    tag: 'widget_creation'
                }, 'DOM widget created', {
                    widgetCreated: !!this.previewWidget,
                    livecropInitialized: !!this._livecrop
                });

                this.setSize([512, 512]);
                this.resizable = true;

                Logger.log({
                    class: 'LiveCrop',
                    method: 'onNodeCreated',
                    severity: 'debug',
                    tag: 'node_setup'
                }, 'Node initial setup complete', {
                    size: this.size,
                    resizable: this.resizable
                });
            } catch (error) {
                Logger.log({
                    class: 'LiveCrop',
                    method: 'onNodeCreated',
                    severity: 'error',
                    tag: 'node_creation_error'
                }, 'Error during node creation', { error: error.message, stack: error.stack });
                throw error;
            }

            const redraw = () => {
                Logger.log({
                    class: 'LiveCrop',
                    method: 'redraw',
                    severity: 'trace',
                    tag: 'redraw_start'
                }, 'Redraw function called', {
                    nodeId: this.id,
                    nodeSize: this.size,
                    hasLivecrop: !!this._livecrop
                });

                try {
                    const overlayEl = this._livecrop?.overlay;
                    if (!overlayEl) {
                        Logger.log({ class: 'LiveCrop', method: 'redraw', severity: 'error', tag: 'canvas_error' }, 'Overlay canvas not available', { overlayExists: !!this._livecrop?.overlay });
                        return;
                    }

                    const ctx = overlayEl.getContext("2d");
                    if (!ctx) {
                        Logger.log({ class: 'LiveCrop', method: 'redraw', severity: 'error', tag: 'canvas_error' }, 'Failed to get canvas context', { overlayExists: !!overlayEl });
                        return;
                    }

                    const comp = (typeof window !== "undefined" ? (window.LiveCropLeftComp || 0) : 0);
                    const cont = this._livecrop?.container;
                    const cw = cont ? cont.clientWidth : this.size[0];
                    const ch = cont ? cont.clientHeight : this.size[1];
                    const W = overlayEl.width = Math.max(1, Math.floor(cw - comp));
                    const H = overlayEl.height = Math.max(1, Math.floor(ch));
                    ctx.clearRect(0, 0, W, H);

                    Logger.log({ class: 'LiveCrop', method: 'redraw', severity: 'trace', tag: 'canvas_setup' }, 'Canvas setup complete', {
                        canvasDimensions: { width: W, height: H },
                        cleared: true
                    });

                    // Prepare images list: prefer multiple images if available, fallback to single
                    const imgs = (this._livecrop?.images?.length
                        ? this._livecrop.images
                        : (this._livecrop?.img ? [{ img: this._livecrop.img, w: this._livecrop.imgW, h: this._livecrop.imgH }] : []));

                    if (!imgs.length) {
                        Logger.log({ class: 'LiveCrop', method: 'redraw', severity: 'debug', tag: 'no_image' }, 'No image(s) available for drawing', {
                            hasLivecrop: !!this._livecrop,
                            imgProperty: this._livecrop?.img
                        });
                        return;
                    }

                    // Read crop widget values once; apply same guides to all previews
                    const get = (name, def) => {
                        const w = (this.widgets || []).find(w => w && w.name === name);
                        return (typeof w?.value === 'number') ? w.value : def;
                    }
                    const top = get("crop_top", 0);
                    const bottom = get("crop_bottom", 0);
                    const left = get("crop_left", 0);
                    const right = get("crop_right", 0);

                    // Layout: stack vertically up to 3 images with spacing
                    const SPACING = 6;
                    let y = 0;
                    for (const entry of imgs.slice(0, 3)) {
                        const bg = entry.img;
                        const iw = entry.w, ih = entry.h;

                        // Scale to fit width; height constrained by remaining H
                        const scale = Math.min(W / iw, H / ih, 1);
                        const dw = Math.max(1, Math.round(iw * scale));
                        const dh = Math.max(1, Math.round(ih * scale));
                        const dx = Math.floor((W - dw) / 2);
                        const dy = y;

                        ctx.drawImage(bg, dx, dy, dw, dh);

                        // Guides for this tile
                        ctx.save();
                        ctx.translate(dx, dy);
                        drawGuides(ctx, dw, dh, { top, bottom, left, right });
                        ctx.restore();

                        y += dh + SPACING;
                        if (y > H) break;
                    }
                } catch (e) {
                    Logger.log({
                        class: 'LiveCrop',
                        method: 'redraw',
                        severity: 'error',
                        tag: 'redraw_error'
                    }, 'Error during redraw', {
                        error: e.message,
                        stack: e.stack,
                        nodeId: this.id,
                        overlayExists: !!this._livecrop?.overlay
                    });
                }
            };

            // Repaint on size changes
            Logger.log({ 
                class: 'LiveCrop', 
                method: 'onNodeCreated', 
                severity: 'debug',
                tag: 'size_hook'
            }, 'Setting up size computation hook');

            const oldComputeSize = this.computeSize;
            this.computeSize = function () {
                const s = oldComputeSize?.apply(this, arguments) || this.size;
                Logger.log({ 
                    class: 'LiveCrop', 
                    method: 'computeSize', 
                    severity: 'trace',
                    tag: 'size_change'
                }, 'Size computation triggered', { 
                    newSize: s,
                    oldComputeSizeExists: !!oldComputeSize
                });
                setTimeout(redraw, 0);
                return s;
            }

            // Track widget changes to redraw
            Logger.log({ 
                class: 'LiveCrop', 
                method: 'onNodeCreated', 
                severity: 'debug',
                tag: 'widget_hooks'
            }, 'Setting up widget change hooks');

            const hookWidget = (n) => {
                const w = (this.widgets || []).find(w => w && w.name === n);
                if (!w) {
                    Logger.log({ 
                        class: 'LiveCrop', 
                        method: 'hookWidget', 
                        severity: 'warn',
                        tag: 'widget_not_found'
                    }, `Widget not found: ${n}`, { 
                        widgetName: n,
                        availableWidgets: (this.widgets || []).map(w => w?.name).filter(Boolean)
                    });
                    return;
                }

                Logger.log({ 
                    class: 'LiveCrop', 
                    method: 'hookWidget', 
                    severity: 'debug',
                    tag: 'widget_hook_setup'
                }, `Setting up hook for widget: ${n}`, { 
                    widgetName: n,
                    hasExistingCallback: !!w.callback
                });

                const cb = w.callback;
                w.callback = function (val, canvas, node, pos, e) {
                    Logger.log({ 
                        class: 'LiveCrop', 
                        method: 'widgetCallback', 
                        severity: 'trace',
                        tag: 'widget_change'
                    }, `Widget changed: ${n}`, { 
                        widgetName: n,
                        newValue: val,
                        hasOriginalCallback: !!cb
                    });

                    try { 
                        redraw(); 
                    } catch(e) {
                        Logger.log({ 
                            class: 'LiveCrop', 
                            method: 'widgetCallback', 
                            severity: 'error',
                            tag: 'widget_redraw_error'
                        }, `Error during widget redraw: ${n}`, { 
                            widgetName: n,
                            error: e.message,
                            stack: e.stack
                        });
                    }
                    return cb ? cb.apply(w, arguments) : undefined;
                };
            }

            const widgetsToHook = ["crop_top", "crop_bottom", "crop_left", "crop_right"];
            Logger.log({ 
                class: 'LiveCrop', 
                method: 'onNodeCreated', 
                severity: 'debug',
                tag: 'widget_hooks'
            }, 'Hooking widgets', { widgetsToHook });

            widgetsToHook.forEach(hookWidget);

            this._livecrop_redraw = redraw;

            // If no image yet, load a default placeholder so the user sees something immediately
            if (!this._livecrop?.img) {
                try {
                    const placeholder = new Image();
                    placeholder.onload = () => {
                        if (!this._livecrop) return;
                        this._livecrop.img = placeholder;
                        this._livecrop.imgW = placeholder.width;
                        this._livecrop.imgH = placeholder.height;

                        // Resize node to placeholder size (cap to 512)
                        const maxSide = 512;
                        const scale = Math.min(maxSide / placeholder.width, maxSide / placeholder.height, 1);
                        const w = Math.round(placeholder.width * scale);
                        const h = Math.round(placeholder.height * scale);
                        this.setSize([w, h]);

                        // Draw it
                        this._livecrop_redraw?.();
                    };
                    placeholder.onerror = (err) => {
                        Logger.log({
                            class: 'LiveCrop',
                            method: 'onNodeCreated',
                            severity: 'warn',
                            tag: 'placeholder_load_error'
                        }, 'Failed to load placeholder image', { error: String(err) });
                    };
                    placeholder.src = "/ovum/web/images/pm5540.png";
                } catch (e) {
                    Logger.log({
                        class: 'LiveCrop',
                        method: 'onNodeCreated',
                        severity: 'warn',
                        tag: 'placeholder_setup_error'
                    }, 'Error setting up placeholder image', { error: e?.message, stack: e?.stack });
                }
            }

            Logger.log({ 
                class: 'LiveCrop', 
                method: 'onNodeCreated', 
                severity: 'info',
                tag: 'node_creation_complete'
            }, 'Node creation completed successfully', { nodeId: this.id });
        });

        chainCallback(nodeType.prototype, "onExecuted", function (message) {
            Logger.log({ 
                class: 'LiveCrop', 
                method: 'onExecuted', 
                severity: 'info',
                tag: 'execution_message'
            }, 'Execution message received', { 
                nodeId: this.id,
                message: message,
                live_crop: message?.live_crop,
                hasMessage: !!message,
                hasUI: !!message,
                hasLiveCrop: !!message?.live_crop
            });

            try {
                const lc = message?.live_crop;
                // lc is expected to be an array of base64 strings (max 3), but support single too
                const b64s = Array.isArray(lc) ? lc.filter(Boolean).slice(0, 3) : (lc ? [lc] : []);
                if (!b64s.length) {
                    Logger.log({ class: 'LiveCrop', method: 'onExecuted', severity: 'warn', tag: 'no_image_data' }, 'No base64 image data found in execution message');
                    return;
                }

                const imgs = [];
                let loaded = 0;

                const finalize = () => {
                    if (loaded !== b64s.length) return;

                    // Save multiple images
                    this._livecrop.images = imgs.map(i => ({ img: i, w: i.width, h: i.height }));
                    // Also keep single fields for backward-compat
                    const first = this._livecrop.images[0];
                    if (first) {
                        this._livecrop.img = first.img;
                        this._livecrop.imgW = first.w;
                        this._livecrop.imgH = first.h;
                    }

                    // Compute node size to fit stacked previews (max width 512)
                    const maxW = 512;
                    const widths = this._livecrop.images.map(e => e.w);
                    const targetW = Math.min(maxW, Math.max(...widths, 1));
                    const SPACING = 6;
                    let totalH = 0;
                    this._livecrop.images.slice(0, 3).forEach((e, i, arr) => {
                        const scale = Math.min(1, targetW / Math.max(e.w, 1));
                        const dh = Math.round(e.h * scale);
                        totalH += dh + (i < arr.length - 1 ? SPACING : 0);
                    });

                    this.setSize([targetW, Math.max(1, totalH)]);
                    this._livecrop_redraw?.();
                };

                b64s.forEach((b64) => {
                    const img = new Image();
                    img.onload = () => {
                        imgs.push(img);
                        loaded += 1;
                        finalize();
                    };
                    img.onerror = () => {
                        loaded += 1;
                        finalize();
                    };
                    img.src = `data:image/png;base64,${b64}`;
                });
            } catch(e) { 
                Logger.log({ 
                    class: 'LiveCrop', 
                    method: 'onExecuted', 
                    severity: 'error',
                    tag: 'execution_error'
                }, 'Error processing execution message', { 
                    error: e.message,
                    stack: e.stack,
                    nodeId: this.id,
                    messageKeys: message ? Object.keys(message) : []
                });
            }
        });
    }
});
