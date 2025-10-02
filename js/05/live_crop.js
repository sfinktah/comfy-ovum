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

function drawImageInfo(ctx, w, h, params, originalW, originalH, divisor, gcd) {
    const { top, bottom, left, right } = params;

    // Calculate post-crop dimensions using original image size
    const cropTop = top < 0 ? Math.abs(top) : 0;
    const cropBottom = bottom < 0 ? Math.abs(bottom) : 0;
    const cropLeft = left < 0 ? Math.abs(left) : 0;
    const cropRight = right < 0 ? Math.abs(right) : 0;

    // Calculate crop offsets in pixels based on original image size
    const cropOffsetX = Math.round(originalW * cropLeft);
    const cropOffsetY = Math.round(originalH * cropTop);

    // Calculate cropped dimensions in original image space
    const croppedW = originalW * (1 - cropLeft - cropRight);
    const croppedH = originalH * (1 - cropTop - cropBottom);

    // Calculate final cropped dimensions
    const finalCroppedW = Math.round(croppedW);
    const finalCroppedH = Math.round(croppedH);

    // Calculate width-height ratio as float with 4 decimal precision
    const aspectRatioFloat = (croppedW / croppedH).toFixed(4);

    // Divide by divisor and round to get integer values for aspect ratio calculation
    const aspectW = Math.round(croppedW / divisor);
    const aspectH = Math.round(croppedH / divisor);

    // Calculate GCD to reduce to lowest integers
    const gcdValue = gcd(aspectW, aspectH);
    const ratioW = Math.max(1, aspectW / gcdValue);
    const ratioH = Math.max(1, aspectH / gcdValue);

    const aspectRatioText = `${ratioW}:${ratioH}`;

    ctx.save();
    ctx.font = "12px Arial";

    // Helper function to draw text with outline
    const drawTextWithOutline = (text, x, y, align = "left", baseline = "top") => {
        ctx.textAlign = align;
        ctx.textBaseline = baseline;

        // Draw black outline
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 3;
        ctx.strokeText(text, x, y);

        // Draw white text
        ctx.fillStyle = "white";
        ctx.fillText(text, x, y);
    };

    // Top left: Crop offset (in original image pixels)
    const offsetText = `${cropOffsetX}, ${cropOffsetY}`;
    drawTextWithOutline(offsetText, 8, 8, "left", "top");

    // Top right: Cropped size (in original image pixels)
    const sizeText = `${finalCroppedW}×${finalCroppedH}`;
    drawTextWithOutline(sizeText, w - 8, 8, "right", "top");

    // Bottom right: Aspect ratio as integer ratio (based on original image)
    drawTextWithOutline(aspectRatioText, w - 8, h - 8, "right", "bottom");

    // Bottom left: Width-height ratio as float (based on original image)
    drawTextWithOutline(aspectRatioFloat, 8, h - 8, "left", "bottom");

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

        // Helper function to calculate greatest common divisor for aspect ratio reduction
        const gcd = (a, b) => {
            a = Math.abs(Math.round(a));
            b = Math.abs(Math.round(b));
            while (b !== 0) {
                const temp = b;
                b = a % b;
                a = temp;
            }
            return a || 1;
        };

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
                window.LiveCropLeftComp = typeof window.LiveCropLeftComp === "number" ? window.LiveCropLeftComp : 0;
                window.LiveCropDragComp = typeof window.LiveCropDragComp === "number" ? window.LiveCropDragComp : 0;
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

                // Rotation controls (top-middle): rotate left, rotate right
                const rotateBar = document.createElement('div');
                rotateBar.style.position = 'absolute';
                rotateBar.style.top = '4px';
                rotateBar.style.left = '50%';
                rotateBar.style.transform = 'translateX(-50%)';
                rotateBar.style.display = 'flex';
                rotateBar.style.gap = '6px';
                rotateBar.style.zIndex = '10';
                // Buttons
                const btnStyle = (el)=>{
                    el.style.width = '24px';
                    el.style.height = '24px';
                    el.style.borderRadius = '12px';
                    el.style.border = '1px solid rgba(255,255,255,0.6)';
                    el.style.background = 'rgba(0,0,0,0.45)';
                    el.style.color = 'white';
                    el.style.display = 'flex';
                    el.style.alignItems = 'center';
                    el.style.justifyContent = 'center';
                    el.style.cursor = 'pointer';
                    el.style.userSelect = 'none';
                };
                const btnLeft = document.createElement('div');
                btnStyle(btnLeft);
                btnLeft.title = 'Rotate Left (−90°)';
                btnLeft.textContent = '⟲';
                const btnRight = document.createElement('div');
                btnStyle(btnRight);
                btnRight.title = 'Rotate Right (+90°)';
                btnRight.textContent = '⟳';
                rotateBar.appendChild(btnLeft);
                rotateBar.appendChild(btnRight);
                container.appendChild(rotateBar);

                const getWidget = (name) => (this.widgets || []).find(w => w && w.name === name);
                const applyRotateDelta = (delta)=>{
                    const w = getWidget('rotate_degrees');
                    if (!w) return;
                    let v = (typeof w.value === 'number') ? w.value : 0;
                    v = Math.round(v / 90) * 90 + delta;
                    // clamp to -180..180 for now
                    if (v > 180) v = -180 + (v - 180 - 90) % 360; // wrap
                    if (v < -180) v = 180 - (-180 - v - 90) % 360;
                    w.setValue?.(v, { e: { isTransient: true }, node: this, canvas: app.canvas });
                    w.callback?.(w.value, app.canvas, this, null, { isTransient: true });
                    this._livecrop_redraw?.();
                };
                btnLeft.addEventListener('click', ()=> applyRotateDelta(-90));
                btnRight.addEventListener('click', ()=> applyRotateDelta(+90));

                // Mute/Bypass: update container classes on initial render and on changes
                this._updateMuteBypassClasses = () => {
                    try {
                        const mode = Number(this.mode ?? 0);
                        const isMuted = mode === 2;
                        const isBypassed = mode === 4;
                        container.classList.toggle("muted", isMuted);
                        container.classList.toggle("bypassed", isBypassed);
                    } catch (_) {}
                };
                // Initial sync
                this._updateMuteBypassClasses?.();

                const node = this;

                // Hook into common toggles that affect mute/bypass
                try {
                    chainCallback(nodeType.prototype, "changeMode", function (mode) {
                        try {
                            Logger.log({
                                class: 'LiveCrop',
                                method: 'changeMode',
                                severity: 'debug',
                                tag: 'mode_change'
                            }, 'changeMode hook called', { nodeId: this.id, newMode: mode });
                            node._updateMuteBypassClasses?.();
                        } catch (_) {}
                    });
                    chainCallback(nodeType.prototype, "onModeChange", function (mode) {
                        try {
                            Logger.log({
                                class: 'LiveCrop',
                                method: 'onModeChange',
                                severity: 'debug',
                                tag: 'mode_change'
                            }, 'onModeChange hook called', { nodeId: node.id, newMode: mode });
                            node._updateMuteBypassClasses?.();
                        } catch (_) {}
                    });
                    chainCallback(nodeType.prototype, "onPropertyChanged", function (name, value, previousValue) {
                        if (name === "mode") {
                            try {
                                Logger.log({
                                    class: 'LiveCrop',
                                    method: 'onPropertyChanged',
                                    severity: 'debug',
                                    tag: 'mode_change'
                                }, 'onPropertyChanged hook for mode', {
                                    nodeId: node.id,
                                    value: value,
                                    previous: previousValue
                                });
                                node._updateMuteBypassClasses?.();
                            } catch (_) {}
                        }
                    });
                } catch (_) {}

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
                    const comp = (typeof window !== "undefined" ? (window.LifeCropDragComp || 0) : 0);
                    const x = (e.clientX - rect.left + comp) / scale;
                    const y = (e.clientY - rect.top) / scale;

                    // Check if we clicked on a crop line
                    const dragType = this._livecrop_hitTest(x, y);
                    if (dragType) {
                        this._livecrop_drag.isDragging = true;
                        this._livecrop_drag.dragType = dragType;
                        this._livecrop_drag.startX = x;
                        this._livecrop_drag.startY = y;

                        // For corners, store both axis values
                        if (dragType.includes('top') || dragType.includes('bottom')) {
                            const hWidget = this.widgets.find(w => w.name === `crop_${dragType.includes('top') ? 'top' : 'bottom'}`);
                            this._livecrop_drag.startValueH = hWidget ? hWidget.value : 0;
                            window.widget1 = hWidget;
                        }
                        if (dragType.includes('left') || dragType.includes('right')) {
                            const vWidget = this.widgets.find(w => w.name === `crop_${dragType.includes('left') ? 'left' : 'right'}`);
                            this._livecrop_drag.startValueV = vWidget ? vWidget.value : 0;
                        }

                        // For single axis, store in startValue for backward compatibility
                        if (!dragType.includes('top') && !dragType.includes('bottom') && !dragType.includes('left') && !dragType.includes('right')) {
                            const widget = this.widgets.find(w => w.name === `crop_${dragType}`);
                            this._livecrop_drag.startValue = widget ? widget.value : 0;
                        } else if (dragType === 'top' || dragType === 'bottom' || dragType === 'left' || dragType === 'right') {
                            const widget = this.widgets.find(w => w.name === `crop_${dragType}`);
                            this._livecrop_drag.startValue = widget ? widget.value : 0;
                        }

                        // Set appropriate cursor
                        let cursor;
                        if (dragType === 'top' || dragType === 'bottom') cursor = 'ns-resize';
                        else if (dragType === 'left' || dragType === 'right') cursor = 'ew-resize';
                        else if (dragType === 'topleft' || dragType === 'bottomright') cursor = 'nw-resize';
                        else if (dragType === 'topright' || dragType === 'bottomleft') cursor = 'ne-resize';
                        overlay.style.cursor = cursor;

                        document.addEventListener('mousemove', this._livecrop_onMouseMove);
                        document.addEventListener('mouseup', this._livecrop_onMouseUp);
                    }
                });

                overlay.addEventListener('mousemove', (e) => {
                    if (!this._livecrop_drag.isDragging) {
                        const rect = overlay.getBoundingClientRect();
                        const scale = app.canvas.ds?.scale || 1;
                        const comp = (typeof window !== "undefined" ? (window.LifeCropDragComp || 0) : 0);
                        const x = (e.clientX - rect.left + comp) / scale;
                        const y = (e.clientY - rect.top) / scale;
                        const dragType = this._livecrop_hitTest(x, y);
                        let cursor = 'default';
                        if (dragType) {
                            if (dragType === 'top' || dragType === 'bottom') cursor = 'ns-resize';
                            else if (dragType === 'left' || dragType === 'right') cursor = 'ew-resize';
                            else if (dragType === 'topleft' || dragType === 'bottomright') cursor = 'nw-resize';
                            else if (dragType === 'topright' || dragType === 'bottomleft') cursor = 'ne-resize';
                        }
                        overlay.style.cursor = cursor;
                    }
                });

                // Bind mouse event handlers to this node context
                this._livecrop_onMouseMove = (e) => {
                    if (!this._livecrop_drag.isDragging) return;

                    const rect = overlay.getBoundingClientRect();
                    const scale = app.canvas.ds?.scale || 1;
                    const comp = (typeof window !== "undefined" ? (window.LiveCropDragComp || 0) : 0);
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

                // Add aspect ratio divisor widget
                if (!this.widgets.find(w => w.name === "divisible_by")) {
                    const divisorWidget = this.addWidget("number", "divisible_by", 32, function(v) {
                        if (this.redraw) this.redraw();
                    }, { min: 1, max: 512, step: 10, precision: 0 });
                    divisorWidget.value = 32;
                }

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
                    // Keep container CSS classes in sync with node state
                    try { this._updateMuteBypassClasses?.(); } catch (_) {}

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
                    const aspectRatioDivisor = get("divisible_by", 32);

                    // Layout: stack vertically up to 3 images with spacing, each maintaining aspect ratio
                    const SPACING = 6;
                    const maxDisplayWidth = Math.min(W, 512); // Cap display width
                    let y = 0;
                    const imageAreas = []; // Store all image areas for hit testing

                    for (let i = 0; i < imgs.slice(0, 3).length; i++) {
                        const entry = imgs[i];
                        const bg = entry.img;
                        const iw = entry.w, ih = entry.h;

                        // Scale each image individually to fit available width while maintaining aspect ratio
                        const scale = Math.min(maxDisplayWidth / iw, (H - y) / ih, 1);
                        const dw = Math.max(1, Math.round(iw * scale));
                        const dh = Math.max(1, Math.round(ih * scale));
                        const dx = Math.floor((W - dw) / 2);
                        const dy = y;

                        // Read current rotation
                        const rotW = (this.widgets || []).find(w => w.name === 'rotate_degrees');
                        const degrees = rotW ? (Number(rotW.value)||0) : 0;

                        // Draw image with immediate rotation feedback
                        if (degrees % 360 !== 0) {
                            ctx.save();
                            // rotate around the center of this image tile
                            ctx.translate(dx + dw/2, dy + dh/2);
                            ctx.rotate((-degrees * Math.PI) / 180);
                            ctx.drawImage(bg, -dw/2, -dh/2, dw, dh);
                            ctx.restore();
                        } else {
                            ctx.drawImage(bg, dx, dy, dw, dh);
                        }

                        // Guides for this tile
                        ctx.save();
                        ctx.translate(dx, dy);
                        drawGuides(ctx, dw, dh, { top, bottom, left, right });
                        const originalW = this._livecrop.originalWidth || iw;
                        const originalH = this._livecrop.originalHeight || ih;
                        // Apply rotation visually by rotating the guides and image info according to rotate_degrees widget
                        if (degrees % 360 !== 0) {
                            ctx.save();
                            ctx.translate(dw/2, dh/2);
                            ctx.rotate((-degrees * Math.PI) / 180);
                            ctx.translate(-dw/2, -dh/2);
                            drawImageInfo(ctx, dw, dh, { top, bottom, left, right }, originalW, originalH, aspectRatioDivisor, gcd);
                            ctx.restore();
                        } else {
                            drawImageInfo(ctx, dw, dh, { top, bottom, left, right }, originalW, originalH, aspectRatioDivisor, gcd);
                        }
                        ctx.restore();

                        // Store this image's area for hit testing
                        imageAreas.push({ dx, dy, dw, dh, index: i });

                        y += dh + SPACING;
                        if (y > H) break;
                    }

                    // Store image areas information for hit testing (use all images)
                    if (imageAreas.length > 0) {
                        // Convert to element coordinates for mouse interaction
                        const cont = this._livecrop?.container;
                        const elementW = cont ? cont.clientWidth : W;
                        const elementH = cont ? cont.clientHeight : H;
                        const scaleX = elementW / W;
                        const scaleY = elementH / H;

                        // Account for left compensation offset with proper scaling
                        const comp = (typeof window !== "undefined" ? (window.LiveCropLeftComp || 0) : 0);
                        const scaledComp = comp * scaleX;

                        this._livecrop_drag.imageAreas = imageAreas.map(area => ({
                            dx: area.dx * scaleX + scaledComp,
                            dy: area.dy * scaleY,
                            dw: area.dw * scaleX,
                            dh: area.dh * scaleY,
                            index: area.index
                        }));

                        // Keep first image area for backward compatibility
                        this._livecrop_drag.imageArea = this._livecrop_drag.imageAreas[0];
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
                const imageAreas = this._livecrop_drag.imageAreas || (this._livecrop_drag.imageArea ? [this._livecrop_drag.imageArea] : []);
                if (!imageAreas.length) return null;

                const get = (name, def) => {
                    const w = (this.widgets || []).find(w => w && w.name === name);
                    return (typeof w?.value === 'number') ? w.value : def;
                }

                const top = get("crop_top", 0);
                const bottom = get("crop_bottom", 0);
                const left = get("crop_left", 0);
                const right = get("crop_right", 0);

                const tolerance = 8; // pixels

                // Check all image areas
                for (const area of imageAreas) {
                    const { dx, dy, dw, dh } = area;

                    // Skip if point is not within this image area bounds (with tolerance)
                    if (x < dx - tolerance || x > dx + dw + tolerance || y < dy - tolerance || y > dy + dh + tolerance) {
                        continue;
                    }

                    // Calculate line positions
                    const topY = top < 0 ? dy + Math.round(Math.abs(top) * dh) : dy;
                    const bottomY = bottom < 0 ? dy + Math.round(dh - Math.abs(bottom) * dh) : dy + dh;
                    const leftX = left < 0 ? dx + Math.round(Math.abs(left) * dw) : dx;
                    const rightX = right < 0 ? dx + Math.round(dw - Math.abs(right) * dw) : dx + dw;

                    // Check for corner intersections first (higher priority)
                    if (Math.abs(x - leftX) <= tolerance && Math.abs(y - topY) <= tolerance) {
                        this._livecrop_drag.activeImageArea = area;
                        return 'topleft';
                    }
                    if (Math.abs(x - rightX) <= tolerance && Math.abs(y - topY) <= tolerance) {
                        this._livecrop_drag.activeImageArea = area;
                        return 'topright';
                    }
                    if (Math.abs(x - leftX) <= tolerance && Math.abs(y - bottomY) <= tolerance) {
                        this._livecrop_drag.activeImageArea = area;
                        return 'bottomleft';
                    }
                    if (Math.abs(x - rightX) <= tolerance && Math.abs(y - bottomY) <= tolerance) {
                        this._livecrop_drag.activeImageArea = area;
                        return 'bottomright';
                    }

                    // Check horizontal lines (existing crop lines or image edges)
                    if (Math.abs(y - topY) <= tolerance && x >= dx && x <= dx + dw) {
                        // Store which image area was hit for drag operations
                        this._livecrop_drag.activeImageArea = area;
                        return 'top';
                    }
                    if (Math.abs(y - bottomY) <= tolerance && x >= dx && x <= dx + dw) {
                        this._livecrop_drag.activeImageArea = area;
                        return 'bottom';
                    }

                    // Check vertical lines (existing crop lines or image edges)
                    if (Math.abs(x - leftX) <= tolerance && y >= dy && y <= dy + dh) {
                        this._livecrop_drag.activeImageArea = area;
                        return 'left';
                    }
                    if (Math.abs(x - rightX) <= tolerance && y >= dy && y <= dy + dh) {
                        this._livecrop_drag.activeImageArea = area;
                        return 'right';
                    }
                }

                return null;
            };

            // Update drag operation
            this._livecrop_updateDrag = (x, y) => {
                const activeArea = this._livecrop_drag.activeImageArea || this._livecrop_drag.imageArea;
                if (!activeArea) return;

                const { dx, dy, dw, dh } = activeArea;
                const { dragType, startX, startY, startValue, startValueH, startValueV } = this._livecrop_drag;

                const get = (name, def) => {
                    const w = (this.widgets || []).find(w => w && w.name === name);
                    return (typeof w?.value === 'number') ? w.value : def;
                }

                const minRemaining = 0.1; // At least 10% of image must remain
                let updated = false;

                // Helper function to update a crop value with constraints
                const updateCropValue = (cropType, delta, dimension, startVal) => {
                    let unconstrained = startVal - delta;
                    if (cropType === 'bottom' || cropType === 'right') {
                        unconstrained = startVal + delta;
                    }

                    let maxCrop;
                    if (cropType === 'top' || cropType === 'bottom') {
                        const otherValue = get(cropType === 'top' ? "crop_bottom" : "crop_top", 0);
                        maxCrop = (1 - minRemaining) - Math.abs(otherValue);
                    } else {
                        const otherValue = get(cropType === 'left' ? "crop_right" : "crop_left", 0);
                        maxCrop = (1 - minRemaining) - Math.abs(otherValue);
                    }

                    const maxValue = -maxCrop;
                    const newValue = Math.max(-1, Math.min(0, Math.max(maxValue, unconstrained)));

                    const widget = this.widgets.find(w => w.name === `crop_${cropType}`);
                    if (widget && widget.value !== newValue) {
                        widget.value = Math.round(newValue * 100) / 100;
                        if (widget.callback) {
                            widget.callback(widget.value, null, this);
                        }
                        updated = true;
                    }
                };

                // Handle corner dragging
                if (dragType.includes('top') || dragType.includes('bottom')) {
                    const deltaY = y - startY;
                    const relativeDeltaY = deltaY / dh;
                    const vCropType = dragType.includes('top') ? 'top' : 'bottom';
                    updateCropValue(vCropType, relativeDeltaY, dh, startValueH || startValue);
                }

                if (dragType.includes('left') || dragType.includes('right')) {
                    const deltaX = x - startX;
                    const relativeDeltaX = deltaX / dw;
                    const hCropType = dragType.includes('left') ? 'left' : 'right';
                    updateCropValue(hCropType, relativeDeltaX, dw, startValueV || startValue);
                }

                // Handle single axis dragging
                if (dragType === 'top' || dragType === 'bottom') {
                    const deltaY = y - startY;
                    const relativeDelta = deltaY / dh;
                    updateCropValue(dragType, relativeDelta, dh, startValue);
                } else if (dragType === 'left' || dragType === 'right') {
                    const deltaX = x - startX;
                    const relativeDelta = deltaX / dw;
                    updateCropValue(dragType, relativeDelta, dw, startValue);
                }

                if (updated) {
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
                const isCrop = /^crop_/.test(n);
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
                            console.error(`[LiveCrop] Linked value for ${n} out of range (>100):`, v);
                            return this.widgets?.find(wi=>wi===w)?.value ?? -0; // no change
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
                            // Note: Original setValue looks like this:
                            // setValue(
                            //    value: TWidget['value'],
                            //    { e, node, canvas }: WidgetEventOptions
                            //  ): void {
                            //    const oldValue = this.value
                            //    if (value === this.value) return
                            //
                            //    const v = this.type === 'number' ? Number(value) : value
                            //    this.value = v
                            //    if (
                            //      this.options?.property &&
                            //      node.properties[this.options.property] !== undefined
                            //    ) {
                            //      node.setProperty(this.options.property, v)
                            //    }
                            //    const pos = canvas.graph_mouse
                            //    this.callback?.(this.value, canvas, node, pos, e)
                            //
                            //    node.onWidgetChanged?.(this.name ?? '', v, oldValue, this)
                            //    if (node.graph) node.graph._version++
                            //  }
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
                    }, `Widget changed: ${n}`, { 
                        widgetName: n,
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
                        }, `Error during widget redraw: ${n}`, { 
                            widgetName: n,
                            error: e.message,
                            stack: e.stack
                        });
                    }
                });
            }

            const widgetsToHook = (this.widgets || []).map(w => w?.name).filter(Boolean);
            for (const n of widgetsToHook) {
                hookWidget(n);
            }
            // const widgetsToHook = ["crop_top", "crop_bottom", "crop_left", "crop_right", "divisible_by"];
            Logger.log({ 
                class: 'LiveCrop', 
                method: 'onNodeCreated', 
                severity: 'debug',
                tag: 'widget_hooks'
            }, 'Hooking widgets', { widgetsToHook });

            // this.widgets.find(w => w.name === `crop_${dragType.includes('left') ? 'left' : 'right'}`);
            // widgetsToHook.forEach(hookWidget);

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

                    // Store original image dimensions from metadata if available
                    const originalDimensions = message?.original_dimensions;
                    if (originalDimensions) {
                        this._livecrop.originalWidth = originalDimensions.width;
                        this._livecrop.originalHeight = originalDimensions.height;
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
