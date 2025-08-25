/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('../01/typedefs.js').INodeInputSlot} INodeInputSlot */

import {api} from "../../../scripts/api.js";
/** @type {ComfyApp} */
import {app} from "../../../scripts/app.js";
import {$el} from "../../../scripts/ui.js";

import { graphGetNodeById  } from '../01/graphHelpers.js';
import { chainCallback } from '../01/utility.js';
import { ensureTooltipLib } from '../01/tooltipHelpers.js';
import { Timer } from '../04/timer-class.js';
import { bestConfigTracker } from '../01/best-config-tracker.js';

window.Timer = Timer;

// Timer styles will be dynamically imported in the setup function
// import _ from "./lodash";

const MARGIN = 8;

function forwardWheelToCanvas(widgetEl, canvasEl) {
    if (!widgetEl || !canvasEl) return;

    widgetEl.addEventListener('wheel', (e) => {
        // Only intercept and forward when Ctrl is held
        if (!e.ctrlKey) return;
        console.log('forwardWheelToCanvas', e);

        // Stop the widget from consuming the scroll and forward it
        e.preventDefault();
        e.stopPropagation();

        const forwarded = new WheelEvent('wheel', {
            deltaX: e.deltaX,
            deltaY: e.deltaY, // Invert the deltaY to fix the wheel direction
            deltaZ: e.deltaZ,
            deltaMode: e.deltaMode,
            clientX: e.clientX,
            clientY: e.clientY,
            screenX: e.screenX,
            screenY: e.screenY,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            buttons: e.buttons,
            bubbles: true,
            cancelable: true,
            composed: true,
        });

        canvasEl.dispatchEvent(forwarded);
    }, { passive: false });
}

app.registerExtension({
    name: "ovum.timer",
    setup: function () {
        // Import styles from module and inject them directly into the DOM
        import("../01/timer-styles.js").then(({ injectTimerStyles }) => {
            injectTimerStyles();
        }).catch(err => {
            console.error("Failed to load timer styles:", err);
        });

        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = '/extensions/ovum/css/tippy.css';
        styleLink.id = 'cg-timer-stylesheet';
        document.head.appendChild(styleLink);


        // Preload tooltip library (Tippy.js via CDN)
        ensureTooltipLib().catch(() => {});

        // Collect system information when socket opens
        function onSocketOpen() {
            console.info("[ComfyUI] websocket opened/reconnected");
            // Record system information when connection opens
            app.api.getSystemStats().then(x => {
                Timer.systemInfo = {
                    argv: x.system?.argv?.slice(1).join(' ') || '',
                    pytorch: x.system?.pytorch_version || '',
                    gpu: x.devices?.[0]?.name || ''
                };
                Timer.pending_run_notes = JSON.stringify(Timer.systemInfo)
                console.log("System Info Collected:", Timer.systemInfo);
            }).catch(err => {
                console.warn("Failed to collect system information:", err);
            });

            bestConfigTracker.fetchAndStoreFromLogs().catch(err => {
                console.warn("Failed to collect comfyui logs:", err);
            });
        }

        // Handle socket close events
        function onSocketClose(event) {
            console.warn("[ComfyUI] websocket closed", event.code, event.reason);
            Timer.systemInfo = {...Timer.systemInfo, connectionClosed: true, closeCode: event.code, closeReason: event.reason};
        }

        // Set up socket event listeners
        if (api.socket && api.socket.readyState === WebSocket.OPEN) {
            // If socket is already open, collect stats immediately
            onSocketOpen();
        }
        api.addEventListener('reconnected', onSocketOpen);

        Timer.loadFromLocalStorage(); // <--- Load history on startup
        Timer.loadFromStorage(); // <--- Restore complete history from DB
        window.Timer = Timer;
        api.addEventListener("executing", Timer.executing);
        api.addEventListener("execution_success", Timer.executionSuccess)
        api.addEventListener("logs", e => console.log("[Timer] logs event", e));

        // Track Control key for deletion UI cursor feedback
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Control') Timer.ctrlDown = true;
        });
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Control') Timer.ctrlDown = false;
        });

        console.log('ovum.timer registered');
    },
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeType.comfyClass === "Timer") {
            chainCallback(nodeType.prototype, "onExecutionStart", function () {
                Timer.start();
            });

            chainCallback(nodeType.prototype, "onExecuted", function (message) {
                console.debug("[Timer] onExecuted (chainCallback)", message);
                const timerNode = this;
                let bg_image = message["bg_image"];
                if (bg_image) {
                    console.log("[Timer] onExecuted: bg_image", bg_image);
                    this.properties.currentRunning = {data : bg_image };
                }
                if (message["queued_run_notes"]) {
                    // Set JS field "Notes from queue"
                    const queuedText = message["queued_run_notes"];
                    // Ensure we have a run id
                    if (!Timer.current_run_id) {
                        Timer.current_run_id = Date.now().toString();
                        console.debug("[Timer] Created new current_run_id:", Timer.current_run_id);
                    }
                    if (queuedText && Timer.current_run_id) {
                        const existing = Timer.run_notes[Timer.current_run_id] || "";
                        const combined = existing ? `${queuedText}\n${existing}` : queuedText;
                        Timer.run_notes[Timer.current_run_id] = combined.trim();
                        console.debug("[Timer] Updated run_notes for run:", Timer.current_run_id, "combined:", combined);
                    }
                    timerNode.setDirtyCanvas?.(true);

                }
            });

            chainCallback(nodeType.prototype, "onNodeCreated", function () {
                console.log('beforeRegisterNodeDef.onNodeCreated', this);
                const node = this;

                // Ensure built-in widgets (like 'Run notes (for queued run)') render above the dynamic inputs
                // this.widgets_up = true;

                // ComfyNode
                // console.log('ovum.timer.onNodeCreated', this);

                this.addWidget("button", "clear", "", Timer.clear);


                // Add Storage button
                this.addWidget("button", "store", "", () => {
                    Timer.saveToStorage();
                });

                // Add Clear Storage button
                this.addWidget("button", "clear storage", "", () => {
                    Timer.clearStorage();
                });

                // Add a number input to control how many last runs to display
                this.addWidget("number", "Last runs to show", Timer.last_n_runs, (v) => {
                    return Timer.setLastNRuns(v);
                }, { min: 1, max: Timer.maxRuns, step: 10, precision: 0 });

                // Add the multiline run notes textarea (active run)
                const textareaWidget = this.addWidget("text", "Run notes (for active run)", "", (v) => {
                    // Save the note to the current run if available
                    if (Timer.current_run_id) {
                        Timer.run_notes[Timer.current_run_id] = v;
                    }
                    return v;
                }, { multiline: true });  // Enable multiline for textarea

                // Store references for later use
                Timer.activeNotesWidget = textareaWidget;

                // ---- Dynamic inputs: arg1, arg2, ... ----
                const ensureDynamicInputs = (isConnecting = true) => {
                    console.log('ensureDynamicInputs', node);
                    try {
                        // this.inputs = this.inputs || [];
                        // Ensure we have at least "input 1"
                        // this === node
                        // console.log('this == node?', this === node);
                        const dynamicInputs = this.inputs.filter(input => input.name.startsWith("arg"));
                        const dynamicInputIndexes = [];
                        for (let i = 0; i < this.inputs.length; i++) {
                            if (!this.inputs[i].isWidgetInputSlot) {
                                dynamicInputIndexes.push(i);
                            }
                        }
                        let dynamicInputLength = dynamicInputs.length;
                        if (dynamicInputLength === 1) {
                            if (dynamicInputs[0].name && dynamicInputs[0].label === undefined && dynamicInputs[0].name.startsWith("arg")) {
                                dynamicInputs[0].label = "py-input " + dynamicInputs[0].name.substr(3);
                            }
                        }
                        if (!dynamicInputs.length) {
                            const nextIndex = dynamicInputLength + 1;
                            console.debug(`[Timer] Adding initial dynamic input: arg${nextIndex}`);

                            // properties include label, link, name, type, shape, widget, boundingRect
                            /** @type {INodeInputSlot} */
                            const nodeInputSlot = this.addInput(`arg${nextIndex}`, "*", { label: "in-input " + nextIndex });
                            dynamicInputs.push(nodeInputSlot);
                            dynamicInputIndexes.push(dynamicInputLength);
                            ++dynamicInputLength;

                            // setDirtyCanvas is called by LGraphNode.addInput
                            // this.canvas.setDirty(true, true);
                            // node.graph.setDirtyCanvas(true);
                        }

                        // If last input has a link, add a new trailing input
                        let last = this.inputs[dynamicInputIndexes[dynamicInputLength - 1]];
                        const lastHasLink = (last.link != null);
                        if (lastHasLink) {
                            const nextIndex = dynamicInputLength + 1;
                            console.debug("[Timer] Last input has link; adding input", nextIndex);
                            const nodeInputSlot = this.addInput(`arg${nextIndex}`, "*", { label: "nu-input " + nextIndex });
                            // setDirtyCanvas is called by LGraphNode.addInput
                            // this.canvas.setDirty(true, true);
                            // node.graph.setDirtyCanvas(true);
                        }
                        else {
                            console.debug("[Timer] Last input does not have link; seeing if it's cleanup time");
                            if (!isConnecting) {
                                let secondLast;
                                for (;;) {
                                    if (dynamicInputLength > 1)
                                        secondLast = this.inputs[dynamicInputIndexes[dynamicInputLength - 2]]
                                    else
                                        secondLast = null;
                                    if (secondLast && last && secondLast.link == null && last.link == null) {
                                        console.debug("[Timer] Removing last input", last.name);
                                        this.removeInput(dynamicInputIndexes[dynamicInputLength - 1]);
                                        dynamicInputIndexes.pop();
                                        --dynamicInputLength;
                                        last = secondLast;
                                    } else {
                                        break;
                                    }
                                }
                            }
                        }

                    } catch (err) {
                        console.warn("[Timer] ensureDynamicInputs failed:", err);
                    }
                };

                // Initialize dynamic inputs
                ensureDynamicInputs();

                // Hook connections change to handle rename and auto-append inputs
                chainCallback(this, "onConnectionsChange", function (slotType, slot, isConnecting, linkInfo, output) {
                    try {
                        console.debug("[Timer] onConnectionsChange", {
                            slotType: slotType,
                            slot: slot,
                            isChangeConnect: isConnecting,
                            linkInfo: linkInfo,
                            output: output,
                            nodeId: this.id
                        });
                        if (slotType == LiteGraph.INPUT) {
                            // disconnecting
                            if (!isConnecting) {
                                if (this.inputs[slot].name.startsWith("arg")) {
                                    this.inputs[slot].type = '*';
                                    this.inputs[slot].label = "re-input " + this.inputs[slot].name.substring(3);
                                    // revertInputBaseName(slot);
                                    // this.title = "Set"
                                }
                            }
                            //On Connect
                            if (linkInfo && node.graph && isConnecting) {
                                const fromNode = graphGetNodeById(linkInfo.origin_id);
                                // app.graph.getNodeById

                                if (fromNode && fromNode.outputs && fromNode.outputs[linkInfo.origin_slot]) {
                                    const type = fromNode.outputs[linkInfo.origin_slot].type;
                                    // slot.name = newName;
                                    // Set the slot type to match the connected type
                                    // this.setDirtyCanvas?.(true, true);

                                    if (this.inputs[slot].name.startsWith("arg")) {
                                        this.inputs[slot].label = type + " " + this.inputs[slot].name.substring(3);
                                        this.inputs[slot].type = type;
                                    }
                                } else {
                                    showAlert("node input undefined.")
                                }
                            }
                            ensureDynamicInputs(isConnecting);
                        }
                    } catch (err) {
                        console.warn("[Timer] onConnectionsChange handler error:", err);
                    }
                });
                // ---- End dynamic inputs ----

                /**
                 * @var {BaseDOMWidgetImpl} widget
                 */
                let widget;

                const inputEl = Timer.html();

                widget = this.addDOMWidget(name, 'textmultiline', inputEl, {
                    getValue() {
                        return inputEl.value
                    },
                    setValue(v) {
                        inputEl.value = v
                    },
                })
                widget.inputEl = inputEl
                widget.onRemove = () => {
                    inputEl.remove()
                }

                this.serialize_widgets = true;

                // Ensure a larger default/initial size for the Timer node
                if (!this.__sizeInitialized) {
                    const w = Array.isArray(this.size) ? this.size[0] : 0;
                    const h = Array.isArray(this.size) ? this.size[1] : 0;
                    const minW = 800, minH = 600;
                    this.setsize(Math.max(w || 0, minW), Math.max(h || 0, minH));
                    this.__sizeInitialized = true;
                }

                Timer.onChange = function () {
                    const existingTable = widget.inputEl.querySelector('.cg-timer-table');
                    if (existingTable) {
                        existingTable.parentNode.replaceChild(Timer.html('table'), existingTable);
                        const existingNotes = widget.inputEl.querySelector('.cg-timer-notes-list-wrapper');
                        if (existingNotes) {
                            existingNotes.parentNode.replaceChild(Timer.html('cg-timer-notes-list-wrapper'), existingNotes);
                        }
                    } else {
                        widget.inputEl.replaceChild(Timer.html(), widget.inputEl.firstChild);
                    }
                }
                setTimeout(() => {
                    Timer.onChange();
                    // Forward wheel events to canvas when Ctrl is pressed
                    forwardWheelToCanvas(widget.inputEl, app.canvas.canvas);
                }, 100);
            });
        }
    },

})

