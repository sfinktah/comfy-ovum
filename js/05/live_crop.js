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

                // Compensate for ComfyUI's left indentation so the canvas appears centered
                // LEFT compensation is exposed on window.LiveCropLeftComp for console tweaking.
                const overlay = document.createElement("canvas");
                overlay.style.position = "absolute";
                overlay.style.left = "0";
                overlay.style.top = "0";
                overlay.width = Math.max(1, 512 - (typeof window !== "undefined" ? (window.LiveCropLeftComp || 0) : 0));
                overlay.height = 512;
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
                this._livecrop = { container, overlay, img: null, imgW: 0, imgH: 0 };

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
                        Logger.log({
                            class: 'LiveCrop',
                            method: 'redraw',
                            severity: 'error',
                            tag: 'canvas_error'
                        }, 'Overlay canvas not available', { overlayExists: !!this._livecrop?.overlay });
                        return;
                    }

                    const ctx = overlayEl.getContext("2d");
                    if (!ctx) {
                        Logger.log({
                            class: 'LiveCrop',
                            method: 'redraw',
                            severity: 'error',
                            tag: 'canvas_error'
                        }, 'Failed to get canvas context', { overlayExists: !!overlayEl });
                        return;
                    }

                    // Reduce the canvas width slightly to compensate for left indentation in the UI
                    const comp = (typeof window !== "undefined" ? (window.LiveCropLeftComp || 0) : 0);
                    const W = overlayEl.width = Math.max(1, this.size[0] - comp);
                    const H = overlayEl.height = this.size[1];
                    ctx.clearRect(0, 0, W, H);

                    Logger.log({
                        class: 'LiveCrop',
                        method: 'redraw',
                        severity: 'trace',
                        tag: 'canvas_setup'
                    }, 'Canvas setup complete', {
                        canvasDimensions: { width: W, height: H },
                        cleared: true
                    });

                    const bg = this._livecrop?.img;
                    if (bg) {
                        Logger.log({
                            class: 'LiveCrop',
                            method: 'redraw',
                            severity: 'trace',
                            tag: 'image_draw'
                        }, 'Drawing background image');

                        // Draw background image to fit node size (contain)
                        const iw = this._livecrop.imgW, ih = this._livecrop.imgH;
                        const scale = Math.min(W / iw, H / ih);
                        const dw = Math.round(iw * scale);
                        const dh = Math.round(ih * scale);
                        const dx = Math.floor((W - dw) / 2);
                        const dy = Math.floor((H - dh) / 2);

                        Logger.log({
                            class: 'LiveCrop',
                            method: 'redraw',
                            severity: 'trace',
                            tag: 'image_calculations'
                        }, 'Image scaling calculations', {
                            originalSize: { width: iw, height: ih },
                            canvasSize: { width: W, height: H },
                            scale,
                            drawSize: { width: dw, height: dh },
                            drawPosition: { x: dx, y: dy }
                        });

                        ctx.drawImage(bg, dx, dy, dw, dh);

                        // Read widget values
                        const get = (name, def) => {
                            const w = (this.widgets || []).find(w => w && w.name === name);
                            const value = (typeof w?.value === 'number') ? w.value : def;
                            Logger.log({
                                class: 'LiveCrop',
                                method: 'redraw',
                                severity: 'trace',
                                tag: 'widget_value'
                            }, `Widget value: ${name}`, {
                                widgetName: name,
                                widgetFound: !!w,
                                value,
                                defaultUsed: value === def
                            });
                            return value;
                        }
                        const top = get("crop_top", 0);
                        const bottom = get("crop_bottom", 0);
                        const left = get("crop_left", 0);
                        const right = get("crop_right", 0);

                        Logger.log({ 
                            class: 'LiveCrop', 
                            method: 'redraw', 
                            severity: 'debug',
                            tag: 'crop_params'
                        }, 'Crop parameters read', { top, bottom, left, right });

                        // Draw guides in scaled coordinates
                        ctx.save();
                        ctx.translate(dx, dy);

                        Logger.log({ 
                            class: 'LiveCrop', 
                            method: 'redraw', 
                            severity: 'trace',
                            tag: 'guides_draw'
                        }, 'Drawing crop guides', { 
                            guideArea: { width: dw, height: dh },
                            cropParams: { top, bottom, left, right }
                        });

                        drawGuides(ctx, dw, dh, { top, bottom, left, right });
                        ctx.restore();

                        Logger.log({ 
                            class: 'LiveCrop', 
                            method: 'redraw', 
                            severity: 'trace',
                            tag: 'redraw_complete'
                        }, 'Redraw completed successfully');
                    } else {
                        Logger.log({ 
                            class: 'LiveCrop', 
                            method: 'redraw', 
                            severity: 'debug',
                            tag: 'no_image'
                        }, 'No background image available for drawing', { 
                            hasLivecrop: !!this._livecrop,
                            imgProperty: this._livecrop?.img
                        });
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
                const lc = message?.live_crop ;
                const b64 = lc?.[0];

                Logger.log({ 
                    class: 'LiveCrop', 
                    method: 'onExecuted', 
                    severity: 'debug',
                    tag: 'message_parse'
                }, 'Parsing execution message', { 
                    hasLiveCropData: !!lc,
                    hasBase64Image: !!b64,
                    base64Length: b64?.length || 0,
                    liveCropKeys: lc ? Object.keys(lc) : []
                });

                if (!b64) {
                    Logger.log({ 
                        class: 'LiveCrop', 
                        method: 'onExecuted', 
                        severity: 'warn',
                        tag: 'no_image_data'
                    }, 'No base64 image data found in execution message', { 
                        messageStructure: {
                            hasMessage: !!message,
                            hasUI: !!message,
                            hasLiveCrop: !!message?.live_crop,
                            liveCropKeys: message?.live_crop ? Object.keys(message.ui.live_crop) : []
                        }
                    });
                    return;
                }

                Logger.log({ 
                    class: 'LiveCrop', 
                    method: 'onExecuted', 
                    severity: 'debug',
                    tag: 'image_loading'
                }, 'Creating new image from base64 data', { 
                    base64Length: b64.length
                });

                const img = new Image();

                img.onload = () => {
                    Logger.log({ 
                        class: 'LiveCrop', 
                        method: 'onExecuted', 
                        severity: 'info',
                        tag: 'image_loaded'
                    }, 'Image loaded successfully', { 
                        imageSize: { width: img.width, height: img.height },
                        hasLivecropObject: !!this._livecrop
                    });

                    if (!this._livecrop) {
                        Logger.log({ 
                            class: 'LiveCrop', 
                            method: 'onExecuted', 
                            severity: 'error',
                            tag: 'missing_livecrop'
                        }, 'LiveCrop object not initialized');
                        return;
                    }

                    this._livecrop.img = img;
                    this._livecrop.imgW = img.width;
                    this._livecrop.imgH = img.height;

                    // Resize node to image size (cap to 512)
                    const maxSide = 512;
                    const scale = Math.min(maxSide / img.width, maxSide / img.height, 1);
                    const w = Math.round(img.width * scale);
                    const h = Math.round(img.height * scale);

                    Logger.log({ 
                        class: 'LiveCrop', 
                        method: 'onExecuted', 
                        severity: 'debug',
                        tag: 'node_resize'
                    }, 'Resizing node to fit image', { 
                        originalImageSize: { width: img.width, height: img.height },
                        maxSide,
                        scale,
                        newNodeSize: { width: w, height: h },
                        currentNodeSize: this.size
                    });

                    this.setSize([w, h]);

                    if (this._livecrop_redraw) {
                        Logger.log({ 
                            class: 'LiveCrop', 
                            method: 'onExecuted', 
                            severity: 'debug',
                            tag: 'trigger_redraw'
                        }, 'Triggering redraw after image load');
                        this._livecrop_redraw();
                    } else {
                        Logger.log({ 
                            class: 'LiveCrop', 
                            method: 'onExecuted', 
                            severity: 'warn',
                            tag: 'missing_redraw'
                        }, 'Redraw function not available');
                    }
                };

                img.onerror = (error) => {
                    Logger.log({ 
                        class: 'LiveCrop', 
                        method: 'onExecuted', 
                        severity: 'error',
                        tag: 'image_load_error'
                    }, 'Failed to load image', { 
                        error,
                        base64Length: b64.length,
                        base64Preview: b64.substring(0, 50) + '...'
                    });
                };

                img.src = `data:image/png;base64,${b64}`;

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
