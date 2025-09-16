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

    // Only draw lines for negative (crop) values
    ctx.beginPath();

    // Horizontal lines (top & bottom crop boundaries)
    if (top < 0) {
        const topY = Math.round(Math.abs(top) * h);
        ctx.moveTo(0, topY);
        ctx.lineTo(w, topY);
    }
    if (bottom < 0) {
        const bottomY = Math.round(h - Math.abs(bottom) * h);
        ctx.moveTo(0, bottomY);
        ctx.lineTo(w, bottomY);
    }

    // Vertical lines (left & right crop boundaries)
    if (left < 0) {
        const leftX = Math.round(Math.abs(left) * w);
        ctx.moveTo(leftX, 0);
        ctx.lineTo(leftX, h);
    }
    if (right < 0) {
        const rightX = Math.round(w - Math.abs(right) * w);
        ctx.moveTo(rightX, 0);
        ctx.lineTo(rightX, h);
    }

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

                // Add drag state tracking
                this._livecrop_drag = {
                    isDragging: false,
                    dragType: null, // 'top', 'bottom', 'left', 'right'
                    startY: 0,
                    startX: 0,
                    startValue: 0,
                    imageArea: null // will store the current image area for hit detection
                };

                // Add mouse event handlers for dragging
                overlay.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const rect = overlay.getBoundingClientRect();
                    const scale = app.canvas.ds?.scale || 1;
                    const comp = (typeof window !== "undefined" ? (window.LiveCropLeftComp || 0) : 0);
                    const x = (e.clientX - rect.left + comp) / scale;
                    const y = (e.clientY - rect.top) / scale;

                    // Check if we clicked on a crop line
                    const dragType = this._livecrop_hitTest(x, y);
                    if (dragType) {
                        this._livecrop_drag.isDragging = true;
                        this._livecrop_drag.dragType = dragType;
                        this._livecrop_drag.startX = x;
                        this._livecrop_drag.startY = y;

                        // Get current widget value
                        const widget = this.widgets.find(w => w.name === `crop_${dragType}`);
                        this._livecrop_drag.startValue = widget ? widget.value : 0;

                        overlay.style.cursor = (dragType === 'top' || dragType === 'bottom') ? 'ns-resize' : 'ew-resize';
                        document.addEventListener('mousemove', this._livecrop_onMouseMove);
                        document.addEventListener('mouseup', this._livecrop_onMouseUp);
                    }
                });

                overlay.addEventListener('mousemove', (e) => {
                    if (!this._livecrop_drag.isDragging) {
                        const rect = overlay.getBoundingClientRect();
                        const scale = app.canvas.ds?.scale || 1;
                        const comp = (typeof window !== "undefined" ? (window.LiveCropLeftComp || 0) : 0);
                        const x = (e.clientX - rect.left + comp) / scale;
                        const y = (e.clientY - rect.top) / scale;
                        const dragType = this._livecrop_hitTest(x, y);
                        overlay.style.cursor = dragType ?
                            ((dragType === 'top' || dragType === 'bottom') ? 'ns-resize' : 'ew-resize') :
                            'default';
                    }
                });

                // Bind mouse event handlers to this node context
                this._livecrop_onMouseMove = (e) => {
                    if (!this._livecrop_drag.isDragging) return;

                    const rect = overlay.getBoundingClientRect();
                    const scale = app.canvas.ds?.scale || 1;
                    const comp = (typeof window !== "undefined" ? (window.LiveCropLeftComp || 0) : 0);
                    const x = (e.clientX - rect.left + comp) / scale;
                    const y = (e.clientY - rect.top) / scale;

                    this._livecrop_updateDrag(x, y);
                };

                this._livecrop_onMouseUp = (e) => {
                    if (this._livecrop_drag.isDragging) {
                        this._livecrop_drag.isDragging = false;
                        this._livecrop_drag.dragType = null;
                        overlay.style.cursor = 'default';
                        document.removeEventListener('mousemove', this._livecrop_onMouseMove);
                        document.removeEventListener('mouseup', this._livecrop_onMouseUp);
                    }
                };

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

                    // Store image area information for hit testing (use first image)
                    if (imgs.length > 0) {
                        const firstEntry = imgs[0];
                        const iw = firstEntry.w, ih = firstEntry.h;
                        const scale = Math.min(W / iw, H / ih, 1);
                        const dw = Math.max(1, Math.round(iw * scale));
                        const dh = Math.max(1, Math.round(ih * scale));
                        const dx = Math.floor((W - dw) / 2);
                        const dy = 0;

                        // Convert to element coordinates for mouse interaction
                        const cont = this._livecrop?.container;
                        const elementW = cont ? cont.clientWidth : W;
                        const elementH = cont ? cont.clientHeight : H;
                        const scaleX = elementW / W;
                        const scaleY = elementH / H;

                        // Account for left compensation offset
                        const comp = (typeof window !== "undefined" ? (window.LiveCropLeftComp || 0) : 0);

                        this._livecrop_drag.imageArea = { 
                            dx: dx * scaleX + comp, 
                            dy: dy * scaleY, 
                            dw: dw * scaleX, 
                            dh: dh * scaleY 
                        };
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

            // Hit testing for crop lines
            this._livecrop_hitTest = (x, y) => {
                if (!this._livecrop_drag.imageArea) return null;

                const { dx, dy, dw, dh } = this._livecrop_drag.imageArea;
                const get = (name, def) => {
                    const w = (this.widgets || []).find(w => w && w.name === name);
                    return (typeof w?.value === 'number') ? w.value : def;
                }

                const top = get("crop_top", 0);
                const bottom = get("crop_bottom", 0);
                const left = get("crop_left", 0);
                const right = get("crop_right", 0);

                // Calculate line positions (only negative values create visible lines)
                const topY = top < 0 ? dy + Math.round(Math.abs(top) * dh) : dy;
                const bottomY = bottom < 0 ? dy + Math.round(dh - Math.abs(bottom) * dh) : dy + dh;
                const leftX = left < 0 ? dx + Math.round(Math.abs(left) * dw) : dx;
                const rightX = right < 0 ? dx + Math.round(dw - Math.abs(right) * dw) : dx + dw;

                const tolerance = 8; // pixels

                // Check horizontal lines
                if (Math.abs(y - topY) <= tolerance && x >= dx && x <= dx + dw && top < 0) {
                    return 'top';
                }
                if (Math.abs(y - bottomY) <= tolerance && x >= dx && x <= dx + dw && bottom < 0) {
                    return 'bottom';
                }

                // Check vertical lines
                if (Math.abs(x - leftX) <= tolerance && y >= dy && y <= dy + dh && left < 0) {
                    return 'left';
                }
                if (Math.abs(x - rightX) <= tolerance && y >= dy && y <= dy + dh && right < 0) {
                    return 'right';
                }

                return null;
            };

            // Update drag operation
            this._livecrop_updateDrag = (x, y) => {
                if (!this._livecrop_drag.imageArea) return;

                const { dx, dy, dw, dh } = this._livecrop_drag.imageArea;
                const { dragType, startX, startY, startValue } = this._livecrop_drag;

                let newValue = startValue;

                if (dragType === 'top') {
                    const deltaY = y - startY;
                    const relativeDelta = deltaY / dh;
                    newValue = Math.max(-1, Math.min(0, startValue - relativeDelta));
                } else if (dragType === 'bottom') {
                    const deltaY = y - startY;
                    const relativeDelta = deltaY / dh;
                    newValue = Math.max(-1, Math.min(0, startValue + relativeDelta));
                } else if (dragType === 'left') {
                    const deltaX = x - startX;
                    const relativeDelta = deltaX / dw;
                    newValue = Math.max(-1, Math.min(0, startValue - relativeDelta));
                } else if (dragType === 'right') {
                    const deltaX = x - startX;
                    const relativeDelta = deltaX / dw;
                    newValue = Math.max(-1, Math.min(0, startValue + relativeDelta));
                }

                // Update the widget
                const widget = this.widgets.find(w => w.name === `crop_${dragType}`);
                if (widget && widget.value !== newValue) {
                    widget.value = Math.round(newValue * 100) / 100; // Round to 2 decimal places
                    if (widget.callback) {
                        widget.callback(widget.value, null, this);
                    }
                    this._livecrop_redraw();
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
