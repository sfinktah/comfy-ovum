import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import {chainCallback} from "../01/utility.js";

app.registerExtension({
    name: "ovum.halt_toggle",

    /**
     * @param {import("../../typings/ComfyNode.js").ComfyNode} nodeType
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyNodeDef} nodeData
     * @param {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyApp} app
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "HaltToggle") {
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                if (onExecuted) {
                    onExecuted.apply(this, arguments);
                }

                // Check if we should halt and/or reset toggle
                if (message && message.should_halt && message.should_halt[0] === true) {
                    const delay = message.delay && message.delay[0] ? parseInt(message.delay[0]) : 0;
                    console.log(`[ovum.halt_toggle] Node requested halt with ${delay}ms delay, calling API interrupt`);

                    // Set state to waiting if there's a delay, otherwise go straight to halting
                    if (delay > 0) {
                        this.haltState = 'waiting';
                        // Mark canvas as dirty to update colors immediately
                        if (app.canvas?.setDirty) {
                            app.canvas.setDirty(true, true);
                        }
                    }

                    // Use setTimeout to delay the halt if specified
                    setTimeout(() => {
                        // Set state to halting when we actually send the interrupt
                        this.haltState = 'halting';

                        // Mark canvas as dirty to update colors
                        if (app.canvas?.setDirty) {
                            app.canvas.setDirty(true, true);
                        }

                        // Call ComfyUI API interrupt (this will halt the workflow)
                        api.interrupt(null);  // null for current running prompt
                        // if (this.properties.interruptQueue) api.interrupt();
                        // if (this.properties.autorunQueue) app.queuePrompt(0);

                        // State will be reset to 'normal' when we receive the workflow termination event

                        // If we should also reset the toggle for next time
                        if (message.should_reset_toggle && message.should_reset_toggle[0] === true) {
                            console.log("[ovum.halt_toggle] Auto-resetting stop_now toggle to false");

                            // Find the stop_now widget and set it to false
                            const stopWidget = this.widgets?.find(w => w.name === "stop_now");
                            if (stopWidget) {
                                stopWidget.value = false;

                                // Mark canvas as dirty to trigger UI refresh
                                if (app.canvas?.setDirty) {
                                    app.canvas.setDirty(true, true);
                                }

                                // Trigger widget callback if it exists
                                if (stopWidget.callback) {
                                    stopWidget.callback(stopWidget.value, app.canvas, this, null, stopWidget);
                                }
                            }
                        }
                    }, delay);
                }
            };
            chainCallback(nodeType.prototype, 'onAdded', function () {
                console.log("[ovum.halt_toggle] onAdded");
                this.history = ["sfinktah", "made", "this", "for", "u"];
                this.haltState = 'normal'; // 'normal', 'waiting', 'halting'

                // Set up event listeners for workflow termination
                const self = this;

                function executionErrorHandler(event) {
                    self.haltState = 'normal';
                    if (app.canvas?.setDirty) {
                        app.canvas.setDirty(true, true);
                    }
                }

                function executionInterruptedHandler(event) {
                    self.haltState = 'normal';
                    if (app.canvas?.setDirty) {
                        app.canvas.setDirty(true, true);
                    }
                }

                // Store references for cleanup
                this.executionErrorHandler = executionErrorHandler;
                this.executionInterruptedHandler = executionInterruptedHandler;

                // Listen for API events that signal workflow termination
                api.addEventListener('execution_error', executionErrorHandler);
                api.addEventListener('execution_interrupted', executionInterruptedHandler);
            })

            chainCallback(nodeType.prototype, 'onRemoved', function () {
                // Clean up event listeners when node is removed
                if (this.executionErrorHandler) {
                    api.removeEventListener('execution_error', this.executionErrorHandler);
                }
                if (this.executionInterruptedHandler) {
                    api.removeEventListener('execution_interrupted', this.executionInterruptedHandler);
                }
            })
            chainCallback(nodeType.prototype, 'onDrawForeground', function (ctx) {
                // Get standard LiteGraph dimensions and font settings
                const fontsize = LiteGraph.NODE_TEXT_SIZE * 0.7;
                let titleHeight = LiteGraph.NODE_TITLE_HEIGHT;
                let cWidth = this._collapsed_width || LiteGraph.NODE_COLLAPSED_WIDTH;
                let buttonWidth = cWidth - titleHeight - 6;

                // Calculate button position (right side of title bar, accounting for collapse state)
                let cx = (this.flags.collapsed ? cWidth : this.size[0]) - buttonWidth - 6;

                // Draw the button background rectangle in the title bar
                ctx.fillStyle = this.color || LiteGraph.NODE_DEFAULT_COLOR;
                ctx.beginPath();
                ctx.rect(cx, 2 - titleHeight, buttonWidth, titleHeight - 4);
                ctx.fill();

                // Move to center of button for drawing the symbol
                cx += buttonWidth / 2;

                // Check the stop_now widget value to determine which symbol to draw
                const stopWidget = this.widgets?.find(w => w.name === "stop_now");
                const stopNow = stopWidget ? stopWidget.value : false;

                ctx.lineWidth = 1;

                // Determine color based on halt state and hover state
                let fillColor;
                if (this.haltState === 'waiting') {
                    fillColor = '#CC8800'; // Amber color for waiting period
                } else if (this.haltState === 'halting') {
                    fillColor = '#CC4444'; // Red color for halting (not too bright)
                } else {
                    // Normal state - use default colors with hover effect
                    fillColor = this.mouseOver ? LiteGraph.NODE_SELECTED_TITLE_COLOR : (this.boxcolor || LiteGraph.NODE_DEFAULT_BOXCOLOR);
                }
                ctx.fillStyle = fillColor;
                ctx.beginPath();

                if (stopNow) {
                    // Draw square (stop symbol) - same vertical extent as triangle
                    const squareSize = 7.2 * 2; // Match triangle's vertical extent (14.4)
                    ctx.rect(cx - squareSize / 2, -titleHeight / 2 - 7.2, squareSize, squareSize);
                } else {
                    // Draw triangle pointing right (play button style) - 10% smaller
                    ctx.moveTo(cx - 7.2, -titleHeight / 2 - 7.2);  // Top left point (8 * 0.9 = 7.2)
                    ctx.lineTo(cx + 2.7, -titleHeight / 2);         // Right point (3 * 0.9 = 2.7)
                    ctx.lineTo(cx - 7.2, -titleHeight / 2 + 7.2);   // Bottom left point (8 * 0.9 = 7.2)
                }
                ctx.fill();

                // Only draw the history display when node is expanded (not collapsed)
                if (!this.flags.collapsed) {
                    // Draw semi-transparent background for history text area
                    // ctx.fillStyle = "rgba(20,20,20,0.5)";
                    // ctx.beginPath();
                    // ctx.roundRect(20, 5, this.size[0] - 40, fontsize + 6, 6);
                    // ctx.fill();
                    //
                    // // Draw border around the history text area
                    // ctx.strokeStyle = LiteGraph.NODE_TEXT_COLOR;
                    // ctx.beginPath();
                    // ctx.roundRect(20, 5, this.size[0] - 40, fontsize + 6, 6);
                    // ctx.stroke();

                    // Set up text rendering properties
                    ctx.fillStyle = LiteGraph.NODE_SELECTED_TITLE_COLOR;
                    ctx.font = (fontsize) + "px Arial";
                    ctx.textAlign = "center";
                    ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;

                    // Render each item in the history array as centered text
                    // Each line is positioned at increasing Y coordinates based on slot height
                    for (let i = 0; i < this.history.length; i++) {
                        ctx.fillText(this.history[i], this.size[0] / 2, LiteGraph.NODE_SLOT_HEIGHT * (0.5 * i + 1));
                    }
                }
            });
        }
    }
});
