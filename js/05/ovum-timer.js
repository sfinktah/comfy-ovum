/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import('../01/typedefs.js').INodeInputSlot} INodeInputSlot */

import {api} from "../../../scripts/api.js";
/** @type {ComfyApp} */
import {app} from "../../../scripts/app.js";
import {$el} from "../../../scripts/ui.js";

import { graphGetNodeById  } from '../01/graphHelpers.js';
import { chainCallback, debounce} from '../01/utility.js';
import { ensureTooltipLib } from '../01/tooltipHelpers.js';
import { ensureDynamicInputsImpl} from "../01/dynamicInputHelpers.js";
import { Timer } from '../04/timer-class.js';
import { Logger } from '../common/logger.js';
import {html_impl} from "../04/timer-html.js";

window.Timer = Timer;

// Timer styles will be dynamically imported in the setup function
// import _ from "./lodash";

const MARGIN = 8;

function forwardWheelToCanvas(widgetEl, canvasEl) {
    if (!widgetEl || !canvasEl) return;

    widgetEl.addEventListener('wheel', (e) => {
        // Only intercept and forward when Ctrl is held
        if (!e.ctrlKey) return;

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
            Logger.log({class:'ovum.timer',method:'setup',severity:'error',tag:'import'}, "Failed to load timer styles:", err);
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
            Logger.log({class:'ovum.timer',method:'onSocketOpen',severity:'info',tag:'websocket'}, "[ComfyUI] websocket opened/reconnected");
            // Record system information when connection opens
            Timer.cudnn_enabled = null;
            Timer.current_run_id = null;
            app.api.subscribeLogs(true).then(x => {
                Logger.log({class:'ovum.timer',method:'onSocketOpen',severity:'info',tag:'logs'}, "Logs subscribed", x);
            });
            app.api.getSystemStats().then(x => {
                Timer.systemInfo = {
                    argv: x.system?.argv?.slice(1).join(' ') || '',
                    pytorch: x.system?.pytorch_version || '',
                    gpu: x.devices?.[0]?.name || '',
                };
                Timer.pending_run_notes = JSON.stringify(Timer.systemInfo)
                Logger.log({class:'ovum.timer',method:'onSocketOpen',severity:'info',tag:'system'}, "System Info Collected:", Timer.systemInfo);
            }).catch(err => {
                Logger.log({class:'ovum.timer',method:'onSocketOpen',severity:'warn',tag:'system'}, "Failed to collect system information:", err);
            });
        }

        // Handle socket close events
        function onSocketClose(event) {
            Logger.log({class:'ovum.timer',method:'onSocketClose',severity:'warn',tag:'websocket'}, "[ComfyUI] websocket closed", event.code, event.reason);
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
        api.addEventListener("execution_error", Timer.executionError)
        api.addEventListener("execution_interrupted", Timer.executionInterrupted)
        api.addEventListener("execution_start", Timer.executionStart)
        api.addEventListener("logs", Timer.onLog);

        // Track Control key for deletion UI cursor feedback
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Control') Timer.ctrlDown = true;
        });
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Control') Timer.ctrlDown = false;
        });

        Logger.log({class:'ovum.timer',method:'setup',severity:'info',tag:'registration'}, 'ovum.timer registered');
    },
    /**
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} app
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeType.comfyClass === "Timer") {
            chainCallback(nodeType.prototype, "onExecutionStart", function () {
                Timer.start();
            });

            chainCallback(nodeType.prototype, "onExecuted", function (message) {
                Logger.log({class:'Timer',method:'onExecuted',severity:'debug',tag:'execution'}, "[Timer] onExecuted (chainCallback)", message);
                const timerNode = this;
                let bg_image = message["bg_image"];
                if (bg_image) {
                    Logger.log({class:'Timer',method:'onExecuted',severity:'info',tag:'background'}, "[Timer] onExecuted: bg_image", bg_image);
                    this.properties.currentRunning = {data : bg_image };
                }
                if (message["queued_run_notes"]) {
                    // Set JS field "Notes from queue"
                    const queuedText = message["queued_run_notes"];
                    // Ensure we have a run id
                    if (!Timer.current_run_id) {
                        Timer.current_run_id = Date.now().toString();
                        Logger.log({class:'Timer',method:'onExecuted',severity:'debug',tag:'run_id'}, "[Timer] Created new current_run_id:", Timer.current_run_id);
                    }
                    if (queuedText && Timer.current_run_id) {
                        const existing = String(Timer.run_notes[Timer.current_run_id] || "");
                        const combined = String(existing ? `${queuedText}\n${existing}` : queuedText);
                        Timer.run_notes[Timer.current_run_id] = combined.trim();
                        Logger.log({class:'Timer',method:'onExecuted',severity:'debug',tag:'run_notes'}, "[Timer] Updated run_notes for run:", Timer.current_run_id, "combined:", combined);
                    }
                    timerNode.setDirtyCanvas?.(true);

                }
            });

            chainCallback(nodeType.prototype, "onNodeCreated", /** @this {ComfyNode} */ function () {
                Logger.log({class:'Timer',method:'onNodeCreated',severity:'debug',tag:'node_creation'}, 'beforeRegisterNodeDef.onNodeCreated', this);
                const node = this;

                // Ensure built-in widgets (like 'Run notes (for queued run)') render above the dynamic inputs
                // this.widgets_up = true;

                // ComfyNode

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
                    ensureDynamicInputsImpl(node, isConnecting);
                };

                // Initialize dynamic inputs
                // ensureDynamicInputs();

                // Update labels/types and manage dynamic slots on connect/disconnect
                chainCallback(node, "onConnectionsChange", function (slotType, slot, isConnecting, linkInfo, output) {
                    try {
                        if (slotType !== LiteGraph.INPUT) return;
                        const input = this.inputs?.[slot];
                        if (!input || !/^arg\d+$/.test(input.name)) {
                            // Only react to argN inputs
                            ensureDynamicInputs(isConnecting);
                            return;
                        }

                        if (isConnecting && linkInfo) {
                            const fromNode = graphGetNodeById(linkInfo.origin_id) || app.graph?.getNodeById?.(linkInfo.origin_id);
                            const type = fromNode?.outputs?.[linkInfo.origin_slot]?.type ?? "*";
                            input.type = type || "*";
                            if (input.type !== "*") {
                                input.label = input.name + ` ${input.type.toLowerCase()}`
                            } else {
                                input.label = input.name;
                            }
                        } else if (!isConnecting) {
                            // Reset to wildcard on disconnect
                            input.type = "*";
                            input.label = input.name;
                        }

                        ensureDynamicInputs(isConnecting);
                    } catch (err) {
                        Logger.log({class:'Timer',method:'onConnectionsChange',severity:'warn',tag:'error'}, "[formatter] onConnectionsChange error:", err);
                    }
                });
                // ---- End dynamic inputs ----

                const inputEl = html_impl();

                const widget = this.addDOMWidget(name, 'textmultiline', inputEl, {
                    getValue() {
                        return inputEl.value
                    },
                    setValue(v) {
                        inputEl.value = v
                    },
                })
                widget.element = inputEl
                widget.onRemove = () => {
                    inputEl.remove()
                }

                this.serialize_widgets = true;

                // Ensure a larger default/initial size for the Timer node
                if (!this.__sizeInitialized) {
                    const w = Array.isArray(this.size) ? this.size[0] : 0;
                    const h = Array.isArray(this.size) ? this.size[1] : 0;
                    const minW = 800, minH = 600;
                    this.size=[Math.max(w || 0, minW), Math.max(h || 0, minH)];
                    this.__sizeInitialized = true;
                }

                Timer.onChange = debounce(function () {
                    const existingTable = widget.element.querySelector('.cg-timer-table');
                    if (existingTable) {
                        existingTable.parentNode.replaceChild(html_impl('table'), existingTable);
                        const existingNotes = widget.element.querySelector('.cg-timer-notes-list-wrapper');
                        if (existingNotes) {
                            existingNotes.parentNode.replaceChild(html_impl('cg-timer-notes-list-wrapper'), existingNotes);
                        }
                    } else {
                        widget.element.replaceChild(html_impl(), widget.element.firstChild);
                    }
                }, 500);
                setTimeout(() => {
                    Timer.onChange();
                    // Forward wheel events to canvas when Ctrl is pressed
                    forwardWheelToCanvas(widget.element, app.canvas.canvas);
                }, 100);
            });
        }
    },

})

