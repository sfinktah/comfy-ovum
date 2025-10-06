/** @typedef {import("../../typings/ComfyNode").ComfyNode} ComfyNode */
// noinspection JSFileReferences
import {app} from "../../../scripts/app.js";
import {chainCallback} from "../01/utility.js";
import {Logger} from "../common/logger.js";


import {drawGuides, drawImageInfo, gcd as gcdHelper} from "./live_crop_helpers.js";
import {hookWidget} from "./live_crop_widget_hooks.js";

const MAX_SIDE = 510;

function computeNodeSize(baseSize) {
    // LiteGraph constants for size calculation
    const NODE_TITLE_HEIGHT = 30;
    const NODE_SLOT_HEIGHT = 20;
    const NODE_WIDGET_HEIGHT = 20;
    const MARGIN = 15;

    // Start with base width
    let width = baseSize[0];
    let height = NODE_TITLE_HEIGHT;

    // Add height for inputs
    const numInputs = this.inputs ? this.inputs.length : 0;
    const inputsHeight = numInputs * NODE_SLOT_HEIGHT;

    // Add height for outputs
    const numOutputs = this.outputs ? this.outputs.length : 0;
    const outputsHeight = numOutputs * NODE_SLOT_HEIGHT;

    // Add height for widgets (only count visible widgets)
    let widgetsHeight = 0;
    if (this.widgets) {
        for (const widget of this.widgets) {
            if (!widget.hidden && widget.type !== 'LiveCropPreview') {
                // Use widget's computed height if available, otherwise use default
                const wHeight = widget.computedHeight || widget.height || NODE_WIDGET_HEIGHT;
                widgetsHeight += wHeight;
            }
        }
    }

    // Take the maximum of inputs/outputs height and widgets height
    const contentHeight = Math.max(inputsHeight, outputsHeight) + widgetsHeight;
    height += contentHeight + MARGIN;

    // Ensure minimum size
    height = Math.max(height, baseSize[1]);
    width = Math.max(width, 200);
    const s = [width, height];

    Logger.log({
        class: 'LiveCrop',
        method: 'computeSize',
        severity: 'trace',
        tag: 'size_change'
    }, 'Size computation triggered', {
        newSize: s,
        numInputs,
        numOutputs,
        numWidgets: this.widgets ? this.widgets.filter(w => !w.hidden).length : 0,
        inputsHeight,
        outputsHeight,
        widgetsHeight
    });

    return s;
}

function translateCoordToOverlay(overlay, e) {
    const rect = overlay.getBoundingClientRect();
    const scale = app.canvas.ds?.scale || 1;
    const comp = (typeof window !== "undefined" ? (window.LifeCropDragComp || 0) : 0);
    const x = (e.clientX - rect.left + comp) / scale;
    const y = (e.clientY - rect.top) / scale;
    return {x, y};
}

function getCursorForDragType(dragType) {
    let cursor;
    if (dragType === 'top' || dragType === 'bottom') cursor = 'ns-resize';
    else if (dragType === 'left' || dragType === 'right') cursor = 'ew-resize';
    else if (dragType === 'topleft' || dragType === 'bottomright') cursor = 'nw-resize';
    else if (dragType === 'topright' || dragType === 'bottomleft') cursor = 'ne-resize';
    return cursor;
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

        // Greatest common divisor imported from helper module
        const gcd = gcdHelper;

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
                    const normalize = (deg)=>{
                        // Map to canonical set without -180: ...,-90,0,90,180,-90,0,...
                        let d = Math.round(Number(deg)||0);
                        d = Math.round(d/90)*90;
                        // Wrap any 270 to -90; any -270 to 90
                        if (d === 270) d = -90;
                        if (d === -270) d = 90;
                        // Collapse 360/-360 to 0
                        if (d === 360 || d === -360) d = 0;
                        // Keep only -90, 0, 90, 180
                        if (![ -90, 0, 90, 180 ].includes(d)) {
                            d = ((d%360)+360)%360; // 0..359
                            if (d === 270) d = -90;
                            else if (d === 0) d = 0;
                            else if (d === 90) d = 90;
                            else if (d === 180) d = 180;
                            else d = 0;
                        }
                        return d;
                    };
                    const w = getWidget('rotate_degrees');
                    if (!w) return;
                    let v = (typeof w.value === 'number') ? w.value : 0;
                    v = normalize(v + delta);
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
                    const {x, y} = translateCoordToOverlay(overlay, e);

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
                        overlay.style.cursor = getCursorForDragType(dragType);

                        document.addEventListener('mousemove', this._livecrop_onMouseMove);
                        document.addEventListener('mouseup', this._livecrop_onMouseUp);
                    }
                });

                overlay.addEventListener('mousemove', (e) => {
                    if (!this._livecrop_drag.isDragging) {
                        const {x, y} = translateCoordToOverlay(overlay, e);
                        const dragType = this._livecrop_hitTest(x, y);
                        overlay.style.cursor = getCursorForDragType(dragType) || 'default';
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
                this._livecrop = { container, overlay, images: [] };

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

                this.setSize([510, 640]);
                this.resizable = true;

                // Add aspect ratio divisor widget
                if (!this.widgets.find(w => w.name === "divisible_by")) {
                    const divisorWidget = this.addWidget("number", "divisible_by", 32, function(v) {
                        if (this.redraw) this.redraw();
                    }, { min: 1, max: 256, step: 10, precision: 0 });
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

                    // Get images from the array
                    const imgs = this._livecrop?.images || [];
                    if (!imgs.length) {
                        Logger.log({ class: 'LiveCrop', method: 'redraw', severity: 'warn', tag: 'no_image' }, 'No image(s) available for drawing', {
                            hasLivecrop: !!this._livecrop,
                            imagesProperty: this._livecrop?.images
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
                    const maxDisplayWidth = Math.min(W, MAX_SIDE); // Cap display width
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
                        const originalDims = this._livecrop.originalDimensions?.[i];
                        const originalW = originalDims ? originalDims[0] : iw;
                        const originalH = originalDims ? originalDims[1] : ih;
                        // Draw guides and info unrotated so they are readable and aligned to displayed image box
                        drawImageInfo(ctx, dw, dh, { top, bottom, left, right }, originalW, originalH, aspectRatioDivisor, gcd);
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
                        widget.value = Math.round(newValue * 10000) / 10000;
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
                // Get base size from original method if it exists
                const baseSize = [300, 400];
                // if (oldComputeSize) {
                //     baseSize[1] = oldComputeSize.apply(this, arguments);
                // }
                const s = computeNodeSize.call(this, baseSize);


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

            const widgetsToHook = (this.widgets || []).map(w => w?.name).filter(Boolean);
            for (const n of widgetsToHook) {
                hookWidget(this, n, redraw, Logger, chainCallback);
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

            // If no images yet, load a default placeholder so the user sees something immediately
            if (!this._livecrop?.images?.length) {
                try {
                    const placeholder = new Image();
                    placeholder.onload = () => {
                        if (!this._livecrop) return;
                        this._livecrop.images = [{ img: placeholder, w: placeholder.width, h: placeholder.height }];

                        // Resize node to placeholder size (cap to MAX_SIDE)
                        const maxSide = MAX_SIDE;
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
                Logger.log({
                    class: 'LiveCrop',
                    method: 'onExecuted',
                    severity: 'trace',
                    tag: 'execution_message_b64s'
                }, `Execution message received. b64s count: ${b64s.length}`, {
                    nodeId: this.id,
                    message: message,
                    live_crop: message?.live_crop,
                    hasMessage: !!message,
                })
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

                    // Store original image dimensions from metadata if available
                    const originalDimensions = message?.original_dimensions;
                    if (originalDimensions) {
                        this._livecrop.originalDimensions = originalDimensions;
                    }

                    // Compute node size to fit stacked previews (max width MAX_SIDE)
                    const maxW = MAX_SIDE;
                    const widths = this._livecrop.images.map(e => e.w);
                    const targetW = Math.min(maxW, Math.max(...widths, 1));
                    const SPACING = 6;
                    let totalH = 0;
                    this._livecrop.images.slice(0, 3).forEach((e, i, arr) => {
                        const scale = Math.min(1, targetW / Math.max(e.w, 1));
                        const dh = Math.round(e.h * scale);
                        totalH += dh + (i < arr.length - 1 ? SPACING : 0);
                    });

                    const s = computeNodeSize.call(this, [300, 0]);

                    this.setSize([targetW, Math.max(1, totalH) + s[1]]);
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
