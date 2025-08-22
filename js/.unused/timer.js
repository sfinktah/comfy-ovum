/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('./typedefs.js').INodeInputSlot} INodeInputSlot */

import {api} from "../../scripts/api.js";
/** @type {ComfyApp} */
import {app} from "../../scripts/app.js";
import {$el} from "../../scripts/ui.js";

import { removeEmojis, getNodeNameById, graphGetNodeById, findNodesByTypeName, findTimerNodes } from '../01/graphHelpers.js';
import { chainCallback, stripTrailingId } from '../01/utility.js';
import { ensureTooltipLib, attachTooltip } from '../01/tooltipHelpers.js';

// Timer styles will be dynamically imported in the setup function
// import _ from "./lodash";

const MARGIN = 8;

const LOCALSTORAGE_KEY = 'cg.quicknodes.timer.history';

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
class Timer {
    static all_times = [];
    static run_history = {}; // Store timings for each run
    static current_run_id = null; // ID for the current run
    static last_n_runs = 5; // Number of last runs to display
    static runs_since_clear = 0;
    static onChange = null;
    static searchTerm = '';
    static searchRegex = false;
    static run_notes = {}; // Store notes for each run
    static systemInfo = null; // Store system information when connection opens
    static hidden = ['both:current-run', 'both:runs', 'both:per-run', 'both:per-flow']; // e.g., ['display:runs','copy:per-flow','both:current-run','per-run'] (bare means both)
    static ctrlDown = false; // Track Control key state for deletion UI
    static maxRuns = 40; // Maximum saved & displayed runs
    static queuedNotesByPromptId = {}; // prompt_id -> queued note string (captured at queue time)

    static isHidden(key, where) {
        // where: 'display' | 'copy'
        if (!Array.isArray(Timer.hidden)) return false;
        const entries = Timer.hidden.map(String);
        // Bare key or both:key hides in both places
        if (entries.includes(key) || entries.includes(`both:${key}`)) return true;
        // Targeted hide
        if (where && entries.includes(`${where}:${key}`)) return true;
        return false;
    }

    static saveToLocalStorage() {
        try {
            localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(Timer.all_times));
            localStorage.setItem(LOCALSTORAGE_KEY + '.settings', JSON.stringify({
                last_n_runs: Timer.last_n_runs
            }));
            localStorage.setItem(LOCALSTORAGE_KEY + '.run_notes', JSON.stringify(Timer.run_notes));
        } catch (e) {
            console.warn('Failed to save timer history:', e);
        }
    }

    static saveToStorage() {
        try {
            // Save to localStorage first
            Timer.saveToLocalStorage();

            // Save data to external storage using API
            api.storeUserData('timer_run_history', {
                all_times: Timer.all_times,
                run_history: Timer.run_history,
                last_n_runs: Timer.last_n_runs,
                runs_since_clear: Timer.runs_since_clear,
                run_notes: Timer.run_notes
            }).catch(err => {
                console.warn('Failed to save timer data to storage:', err);
            });
        } catch (e) {
            console.warn('Failed to save timer data to storage:', e);
        }
    }

    static loadFromLocalStorage() {
        try {
            const data = localStorage.getItem(LOCALSTORAGE_KEY);
            if (data) {
                const parsedData = JSON.parse(data);
                // Handle migration from array format to object format
                if (parsedData.length > 0 && Array.isArray(parsedData[0])) {
                    Timer.all_times = parsedData.map(item => ({
                        id: item[0],
                        runs: item[1],
                        totalTime: item[2],
                        avgPerRun: item[3],
                        avgPerFlow: item[4] || 0
                    }));
                } else {
                    Timer.all_times = parsedData;
                }
            }

            // Load settings
            const settingsData = localStorage.getItem(LOCALSTORAGE_KEY + '.settings');
            if (settingsData) {
                const settings = JSON.parse(settingsData);
                if (settings.last_n_runs && typeof settings.last_n_runs === 'number') {
                    Timer.last_n_runs = settings.last_n_runs;
                }
            }

            // Load run notes
            const notesData = localStorage.getItem(LOCALSTORAGE_KEY + '.run_notes');
            if (notesData) {
                Timer.run_notes = JSON.parse(notesData);
            }
        } catch (e) {
            console.warn('Failed to load timer history:', e);
        }
    }

    static loadFromStorage() {
        try {
            // First load from localStorage as fallback
            Timer.loadFromLocalStorage();

            // Try to load data from storage API
            api.getUserData('timer_run_history').then(data => {
                if (data && data.all_times) {
                    // Handle migration from array format to object format
                    if (data.all_times.length > 0 && Array.isArray(data.all_times[0])) {
                        Timer.all_times = data.all_times.map(item => ({
                            id: item[0],
                            runs: item[1],
                            totalTime: item[2],
                            avgPerRun: item[3],
                            avgPerFlow: item[4] || 0
                        }));
                    } else {
                        Timer.all_times = data.all_times;
                    }
                }
                if (data && data.run_history) {
                    Timer.run_history = data.run_history;
                }
                if (data && data.last_n_runs) {
                    Timer.last_n_runs = data.last_n_runs;
                }
                if (data && data.runs_since_clear !== undefined) {
                    Timer.runs_since_clear = data.runs_since_clear;
                }
                if (data && data.run_notes) {
                    Timer.run_notes = data.run_notes;
                }
                if (Timer.onChange) Timer.onChange();
            }).catch(err => {
                console.warn('Failed to load timer data from storage:', err);
            });
        } catch (e) {
            console.warn('Failed to load timer data from storage:', e);
        }
    }

    static clearStorage() {
        try {
            // Clear from localStorage
            localStorage.removeItem(LOCALSTORAGE_KEY);
            localStorage.removeItem(LOCALSTORAGE_KEY + '.settings');

            // Clear from external storage API
            api.deleteUserData('timer_run_history').catch(err => {
                console.warn('Failed to clear timer data from storage:', err);
            });

            console.log('Timer data cleared from storage');
        } catch (e) {
            console.warn('Failed to clear timer data from storage:', e);
        }
    }

    static clear() {
        Timer.all_times = [];
        Timer.run_history = {};
        Timer.current_run_id = null;
        Timer.runs_since_clear = 0;
        Timer.run_notes = {};
        if (Timer.onChange) Timer.onChange();
    }

    static setLastNRuns(value) {
        const newValue = parseInt(value);
        if (!isNaN(newValue) && newValue > 0) {
            Timer.last_n_runs = Math.min(newValue, Timer.maxRuns);
            if (Timer.onChange) Timer.onChange();
        }
        return Timer.last_n_runs;
    }

    static start() {
        const t = LiteGraph.getTime();
        Timer.current_run_id = Date.now().toString(); // Generate unique run ID
        Timer.run_history[Timer.current_run_id] = { nodes: {}, startTime: t, systemStartTime: Date.now() };
        Timer.startTime = t;
        Timer.lastChangeTime = t;

        // Persist complete history at start
        Timer.saveToStorage();

        // Prune to maximum runs
        if (Object.keys(Timer.run_history).length > Timer.maxRuns) {
            delete Timer.run_history[Object.keys(Timer.run_history)[0]];
        }
    }

    static _format(number, dp = 2) {
        if (isNaN(number) || number === 0.0) {
            return " ";
        }
        return `${(number / 1000).toFixed(dp)}`
    }

    // Convert any input value into a safe string for notes
    static toNoteString(val) {
        if (val === undefined || val === null) return "";
        const t = typeof val;
        if (t === "string") return val;
        if (t === "number" || t === "boolean" || t === "bigint") return String(val);
        try {
            if (t === "object") {
                const seen = new WeakSet();
                return JSON.stringify(val, (key, value) => {
                    if (typeof value === "object" && value !== null) {
                        if (seen.has(value)) return "[Circular]";
                        seen.add(value);
                    }
                    return value;
                });
            }
        } catch (err) {
            try {
                return String(val);
            } catch {
                return "";
            }
        }
        return String(val);
    }

    static getCurrentRunTime(id) {
        const currentRun = Timer.run_history[Timer.current_run_id];
        if (!currentRun?.nodes[id]?.totalTime) {
            return 0;
        }
        return currentRun.nodes[id].totalTime;
    }

    // Attempt to extract the Timer node's queued note from a prompt payload
    static extractQueuedNoteFromPrompt(promptPayload) {
        try {
            if (!promptPayload) return undefined;
            // Heuristic: scan for any object with class_type === "Timer" and inputs containing our field
            const targetInputKey = "Run notes (for queued run)";

            const visited = new WeakSet();
            const stack = [promptPayload];

            while (stack.length) {
                const cur = stack.pop();
                if (!cur || typeof cur !== "object") continue;
                if (visited.has(cur)) continue;
                visited.add(cur);

                // Node-like object check
                if (cur.class_type === "Timer" && cur.inputs && typeof cur.inputs === "object") {
                    if (Object.prototype.hasOwnProperty.call(cur.inputs, targetInputKey)) {
                        return cur.inputs[targetInputKey];
                    }
                }

                // If it's a plain object or array, traverse
                if (Array.isArray(cur)) {
                    for (const v of cur) stack.push(v);
                } else {
                    for (const k of Object.keys(cur)) {
                        stack.push(cur[k]);
                    }
                }
            }
        } catch (err) {
            console.warn("[Timer] extractQueuedNoteFromPrompt failed:", err);
        }
        return undefined;
    }

    static getLastNRunsAvg(id, n = null) {
        if (n === null) n = Timer.last_n_runs;
        const runIds = Object.keys(Timer.run_history).sort().reverse().slice(0, n);

        let totalTime = 0;
        let count = 0;

        for (const runId of runIds) {
            if (Timer.run_history[runId].nodes[id]) {
                totalTime += Timer.run_history[runId].nodes[id].totalTime;
                count++;
            }
        }

        return count > 0 ? totalTime / count : 0;
    }

    static getRunTime(id, runId) {
        return Timer.run_history[runId]?.nodes[id]?.totalTime || 0;
    }

    static add_timing(id, dt) {
        // Update aggregated timing data
        var this_node_data = Timer.all_times.find((node_data) => node_data.id === id);
        if (!this_node_data) {
            this_node_data = {
                id: id,
                runs: 0,
                totalTime: 0,
                avgPerRun: 0,
                avgPerFlow: 0
            };
            Timer.all_times.push(this_node_data);
        }
        this_node_data.runs += 1;
        if (!Timer.runs_since_clear || this_node_data.runs > Timer.runs_since_clear) Timer.runs_since_clear = this_node_data.runs
        this_node_data.totalTime += dt;
        this_node_data.avgPerRun = this_node_data.totalTime / this_node_data.runs;

        // Store timing for the current run
        if (Timer.current_run_id) {
            const runData = Timer.run_history[Timer.current_run_id];
            if (runData) {
                if (!runData.nodes[id]) {
                    runData.nodes[id] = { count: 0, totalTime: 0 };
                }
                runData.nodes[id].count += 1;
                runData.nodes[id].totalTime += dt;
            }
        }
    }

    /**
     * Handles execution tick events from ComfyApi.
     * @param {ComfyTickEvent} e
     */
    static executing(e) {
        let detail = e.detail;

        if (typeof detail === "string") {
            const match = detail.match(/^\d+:(\d+)$/);
            detail = match ? match[1] : detail;
        }

        if (detail === Timer?.currentNodeId) return;
        const node_name = getNodeNameById(detail);

        const t = LiteGraph.getTime();
        const unix_t = Math.floor(t / 1000);

        Timer.add_timing(Timer.currentNodeId ? Timer.currentNodeId : "startup", t - Timer.lastChangeTime);

        Timer.lastChangeTime = t;
        Timer.currentNodeId = detail;

        // Record system clock start time for this node
        if (Timer.current_run_id && Timer.run_history[Timer.current_run_id]) {
            const runData = Timer.run_history[Timer.current_run_id];
            const id = Timer.currentNodeId;
            if (id) {
                if (!runData.nodes[id]) {
                    runData.nodes[id] = { count: 0, totalTime: 0, startTimes: [] };
                }
                if (!Array.isArray(runData.nodes[id].startTimes)) {
                    runData.nodes[id].startTimes = [];
                }
                runData.nodes[id].startTimes.push(Date.now());
            }
        }

        if (!Timer.currentNodeId) Timer.add_timing("total", t - Timer.startTime);

        if (Timer.onChange) Timer.onChange();
    }

    static executionStart(e) {
        // When a job starts, copy the queued run notes into the JS "Notes from queue" field
        try {
            const timerNodes = findTimerNodes();
            console.debug("[Timer] executionStart: found timer nodes:", timerNodes?.length);
            if (timerNodes.length > 0) {
                const timerNode = timerNodes[0];
                console.debug("[Timer] Using timer node id/title:", timerNode?.id, timerNode?.title);

                // Try to read from a linked "input connection"
                let connectedRaw = undefined;
                try {
                    const inputSlot = timerNode.inputs?.find(inp => inp && (inp.name === "input connection" || inp.label === "input connection"));
                    console.debug("[Timer] inputSlot for 'input connection':", inputSlot);
                    if (inputSlot?.link != null) {
                        const link = app.graph.links?.[inputSlot.link];
                        console.debug("[Timer] link object:", link);
                        if (link) {
                            const originNode = (typeof app.graph.getNodeById === "function")
                                ? app.graph.getNodeById(link.origin_id)
                                : (app.graph._nodes_by_id ? app.graph._nodes_by_id[link.origin_id] : null);
                            console.debug("[Timer] origin node from link:", originNode?.id, originNode?.title);
                            if (originNode) {
                                // 1) Try output slot (if it exposes a value)
                                if (Array.isArray(originNode.outputs) && link.origin_slot != null) {
                                    const outSlot = originNode.outputs[link.origin_slot];
                                    console.debug("[Timer] origin outSlot:", outSlot);
                                    if (outSlot && "value" in outSlot && outSlot.value !== undefined) {
                                        connectedRaw = outSlot.value;
                                        console.debug("[Timer] Using output slot value:", connectedRaw);
                                    }
                                }
                                // 2) Try widgets (prefer any with a concrete value)
                                if (connectedRaw === undefined && Array.isArray(originNode.widgets) && originNode.widgets.length) {
                                    const widgetCandidates = originNode.widgets.filter(w => w && ("value" in w));
                                    const preferred = widgetCandidates.find(w => typeof w.value === "string")
                                        || widgetCandidates.find(w => (w?.type === "text" || w?.type === "string"))
                                        || widgetCandidates[0];
                                    if (preferred && preferred.value !== undefined) {
                                        connectedRaw = preferred.value;
                                        console.debug("[Timer] Using widget value from origin:", connectedRaw, "widget:", preferred?.name || preferred?.label || preferred?.type);
                                    }
                                }
                                // 3) Try common properties
                                if (connectedRaw === undefined && originNode?.properties) {
                                    const p = originNode.properties;
                                    if (typeof p.value !== "undefined") {
                                        connectedRaw = p.value;
                                        console.debug("[Timer] Using origin properties.value:", connectedRaw);
                                    } else if (typeof p.text === "string") {
                                        connectedRaw = p.text;
                                        console.debug("[Timer] Using origin properties.text:", connectedRaw);
                                    }
                                }
                            }
                        }
                    } else {
                        console.debug("[Timer] No link in 'input connection'.");
                    }
                } catch (e2) {
                    console.warn("[Timer] Failed to read connected input:", e2);
                }

                // Prefer: connected input, then queued snapshot by prompt_id, then widget fallback
                const promptId =
                    e?.detail?.prompt_id ??
                    e?.detail?.data?.prompt_id ??
                    e?.detail?.promptId ??
                    e?.prompt_id ??
                    null;
                if (promptId) {
                    console.debug("[Timer] executionStart promptId:", promptId);
                } else {
                    console.debug("[Timer] executionStart: no promptId found on event detail:", e?.detail || e);
                }

                const queuedSnapshot = promptId ? Timer.queuedNotesByPromptId[promptId] : undefined;
                if (promptId && queuedSnapshot !== undefined) {
                    console.debug("[Timer] Found stored queued note for prompt:", promptId, "=>", queuedSnapshot);
                    // Optionally clean up to avoid growth
                    delete Timer.queuedNotesByPromptId[promptId];
                }

                // Python-created widget for queued input (literal fallback; note this reflects current UI)
                const queuedInputWidget = timerNode.widgets?.find(w => w.name === "Run notes (for queued run)");
                console.debug("[Timer] queuedInputWidget:", queuedInputWidget);
                const widgetRaw = queuedInputWidget?.value;
                console.debug("[Timer] widgetRaw value (current UI):", widgetRaw);

                let queuedText = "";
                if (connectedRaw !== undefined && connectedRaw !== null) {
                    queuedText = Timer.toNoteString(connectedRaw);
                    console.debug("[Timer] queuedText from connectedRaw (converted):", queuedText);
                } else if (queuedSnapshot !== undefined) {
                    queuedText = Timer.toNoteString(queuedSnapshot);
                    console.debug("[Timer] queuedText from stored queued snapshot (converted):", queuedText);
                } else if (widgetRaw !== undefined) {
                    queuedText = Timer.toNoteString(widgetRaw);
                    console.debug("[Timer] queuedText from widgetRaw (converted, fallback):", queuedText);
                } else {
                    console.debug("[Timer] No connected, no stored queued snapshot, and no widget value for queued notes.");
                }

                // Set JS field "Notes from queue"
                const queueJsWidget = timerNode.widgets?.find(w => w.name === "Notes from queue");
                if (queueJsWidget) {
                    queueJsWidget.value = queuedText || "";
                    console.debug("[Timer] Set 'Notes from queue' widget to:", queueJsWidget.value);
                }
                // Ensure we have a run id
                if (!Timer.current_run_id) {
                    Timer.current_run_id = Date.now().toString();
                    console.debug("[Timer] Created new current_run_id:", Timer.current_run_id);
                }
                if (queuedText && Timer.current_run_id) {
                    const existing = Timer.run_notes[Timer.current_run_id] || "";
                    const combined = existing ? `${queuedText}\n${existing}` : queuedText;
                    Timer.run_notes[Timer.current_run_id] = combined;
                    console.debug("[Timer] Updated run_notes for run:", Timer.current_run_id, "combined:", combined);
                }
                timerNode.setDirtyCanvas?.(true);
            } else {
                console.debug("[Timer] No timer nodes found in graph.");
            }
        } catch (err) {
            console.warn("Failed to propagate queued notes:", err);
        }
    }

    static executionSuccess(e) {
        const t = LiteGraph.getTime();
        if (Timer.current_run_id && Timer.run_history[Timer.current_run_id]) {
            Timer.run_history[Timer.current_run_id].endTime = t;
            Timer.run_history[Timer.current_run_id].totalTime = t - Timer.run_history[Timer.current_run_id].startTime;

            // Save any notes from the textarea for this run
            const timerNodes = findTimerNodes();
            if (timerNodes.length > 0) {
                const timerNode = timerNodes[0]; // Use the first timer node found
                const activeWidget = timerNode.widgets.find(w => w.name === "Run notes (for active run)");
                const queueWidget = timerNode.widgets.find(w => w.name === "Notes from queue");
                const activeText = (activeWidget?.value || "").toString().trim();
                const queueText = (queueWidget?.value || "").toString().trim();
                const combined = [queueText, activeText].filter(Boolean).join('\n');

                if (combined) {
                    Timer.run_notes[Timer.current_run_id] = combined;
                }

                // Reset the text areas for next run
                if (activeWidget) activeWidget.value = "";
                if (queueWidget) queueWidget.value = "";
                timerNode.setDirtyCanvas(true);
            }

            // Clean up old runs if we have too many
            const runIds = Object.keys(Timer.run_history);
            if (runIds.length > Timer.maxRuns) { // Keep max runs in history
                const oldestRunId = runIds.sort()[0];
                delete Timer.run_history[oldestRunId];
                // Also delete corresponding notes
                if (Timer.run_notes[oldestRunId]) {
                    delete Timer.run_notes[oldestRunId];
                }
            }

            // Persist complete history after completion
            Timer.saveToStorage();
        }
    }

    static html(scope) {
        // Search/filter UI
        const searchInput = $el("input", {
            type: "text",
            placeholder: "Quick search...",
            value: Timer.searchTerm,
            style: { marginRight: "8px", width: "150px" },
            oninput: e => {
                console.log('html.search.oninput');
                Timer.searchTerm = e.target.value;
                if (Timer.onChange) Timer.onChange();
            },
            onenter: e => {
                console.log('html.search.onenter');
            },
            // Prevent ComfyUI/global key handlers while typing here
            onkeydown: e => {
                console.log('html.search.onkeydown');
                if (e.key === "Enter" || e.key === "Escape")
                    e.stopPropagation();
            },
            onkeyup: e => {
                e.stopPropagation();
            },
            onkeypress: e => {
                e.stopPropagation();
            }
        });

        // Copy button for copying table contents
        const copyButton = $el("button", {
            textContent: "Copy",
            style: { marginRight: "8px" },
            onclick: e => {
                // Find the table with the cg-timer-table class
                const table = document.querySelector('.cg-timer-table');
                if (!table) {
                    console.warn('Timer table not found');
                    return;
                }

                // Extract the data from the table
                const rows = Array.from(table.querySelectorAll('tr'));
                let tableText = '';

                // Clipboard copy logic
                rows.forEach(row => {
                    // Skip columns hidden for copy based on their class
                    const hideableKeys = new Set(['runs','per-run','per-flow','current-run']);
                    const cells = Array.from(row.querySelectorAll('th, td')).filter(cell => {
                        const classes = cell.classList || [];
                        let key = null;
                        for (const c of classes) {
                            if (hideableKeys.has(c)) { key = c; break; }
                        }
                        return !(key && Timer.isHidden(key, 'copy'));
                    });

                    const rowText = cells.map((cell, idx) => {
                        let text = cell.textContent.trim();
                        // Apply emoji removal and trailing id stripping to the first cell only
                        if (idx === 0) {
                            text = removeEmojis(text);
                            text = stripTrailingId(text);
                        }
                        return text;
                    }).join('\t');
                    tableText += rowText + '\n';
                });

                // Add run notes if we have any
                if (Object.keys(Timer.run_notes).length > 0) {
                    tableText += '\n### Run Notes\n';
                    const runIds = Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs);
                    let runNumber = 1;
                    for (let i = runIds.length - 1; i >= 0; i--) {
                        const runId = runIds[i];
                        if (Timer.run_notes[runId]) {
                            const noteLines = Timer.run_notes[runId].split('\n');
                            if (noteLines.length > 0) {
                                tableText += `RUN ${runNumber}: ${noteLines[0]}\n`;
                                for (let j = 1; j < noteLines.length; j++) {
                                    tableText += `       ${noteLines[j]}\n`;
                                }
                            }
                        }
                        runNumber++;
                    }
                }

                // Append system information if available
                if (Timer.systemInfo) {
                    tableText += '\n### System Info\n';
                    const { gpu, pytorch, argv, connectionClosed, closeCode, closeReason } = Timer.systemInfo;
                    if (gpu) tableText += `GPU: ${gpu}\n`;
                    if (pytorch) tableText += `PyTorch: ${pytorch}\n`;
                    if (argv) tableText += `Args: ${argv}\n`;
                    if (connectionClosed) {
                        tableText += `Socket closed: code=${closeCode ?? ''} reason=${closeReason ?? ''}\n`;
                    }
                }

                // Copy to clipboard
                navigator.clipboard.writeText(tableText)
                    .then(() => {
                        console.log('Table copied to clipboard');
                        // Visual feedback that copy worked
                        const originalText = copyButton.textContent;
                        copyButton.textContent = "Copied!";
                        setTimeout(() => {
                            copyButton.textContent = originalText;
                        }, 1500);
                    })
                    .catch(err => {
                        console.error('Failed to copy: ', err);
                    });
            }
        });

        const regexCheckbox = $el("input", {
            type: "checkbox",
            checked: Timer.searchRegex,
            id: "timer-search-regex",
            onchange: e => {
                Timer.searchRegex = e.target.checked;
                if (Timer.onChange) Timer.onChange();
            }
        });

        const regexLabel = $el("label", {
            for: "timer-search-regex",
            style: {fontSize: "80%"}
        }, ["Regex"]);

        // Table header with individual columns for each of the last n runs
        const tableHeader = [$el("th", {className: "node", "textContent": "Node"})];
        if (!Timer.isHidden('runs', 'display')) tableHeader.push($el("th", {className: "runs", "textContent": "Runs"}));
        if (!Timer.isHidden('per-run', 'display')) tableHeader.push($el("th", {className: "per-run", "textContent": "Per run"}));
        if (!Timer.isHidden('per-flow', 'display')) tableHeader.push($el("th", {className: "per-flow", "textContent": "Per flow"}));
        if (!Timer.isHidden('current-run', 'display')) tableHeader.push($el('th', {className: "current-run", "textContent": "Current run"}));

        // Add individual columns for each of the last n runs
        const runIds = Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs);
        const actualRuns = Math.min(runIds.length, Timer.last_n_runs);
        let runNumber = 1;
        for (let i = actualRuns - 1; i >= 0; i--) {
            const runId = runIds[i];
            const th = $el('th', {
                className: "run-n",
                textContent: `Run ${runNumber}`,
                onmouseenter: ev => {
                    ev.currentTarget.style.cursor = (ev.ctrlKey || Timer.ctrlDown) ? 'not-allowed' : '';
                },
                onmousemove: ev => {
                    ev.currentTarget.style.cursor = (ev.ctrlKey || Timer.ctrlDown) ? 'not-allowed' : '';
                },
                onclick: ev => {
                    if (!ev.ctrlKey) return;
                    if (Timer.run_history[runId]) delete Timer.run_history[runId];
                    if (Timer.run_notes[runId]) delete Timer.run_notes[runId];
                    if (Timer.onChange) Timer.onChange();
                }
            });

            // Tooltip showing run notes after 1 second hover
            const notesText = Timer.run_notes[runId] || "No run notes";
            attachTooltip(th, () => notesText, 1000);

            tableHeader.push(th);
            runNumber += 1;
        }

        // Add empty cells for missing runs
        for (let i = actualRuns; i < Timer.last_n_runs; i++) {
            tableHeader.push($el('th', {className: "run-n", "textContent": `Run ${runNumber}`}));
            runNumber += 1;
        }

        // If we have fewer actual runs than the setting, add placeholder columns
        // for (let i = actualRuns; i < Timer.last_n_runs; i++) {
        //     const runNumber = i + 1;
        //     tableHeader.push($el('th', {className: "run-" + runNumber, "textContent": `Run ${runNumber}`}));
        // }

        const table = $el("table", {
            "className": "cg-timer-table"
        }, [
            $el("tr", tableHeader)
        ]);

        // Compute per-flow
        Timer.all_times.forEach((node_data) => {
            node_data.avgPerFlow = node_data.totalTime / Timer.runs_since_clear;
        });
        // Sort descending by per-flow
        Timer.all_times.sort((a, b) => b.avgPerFlow - a.avgPerFlow);

        // Build filter
        let filterFunc = () => true;
        if (Timer.searchTerm) {
            if (Timer.searchRegex) {
                let re;
                try {
                    re = new RegExp(Timer.searchTerm, "i");
                    filterFunc = (node_data) => re.test(getNodeNameById(node_data.id));
                } catch {
                    filterFunc = () => true; // Don't filter if regex is broken
                }
            } else {
                const searchLower = Timer.searchTerm.toLowerCase();
                filterFunc = (node_data) =>
                    getNodeNameById(node_data.id).toLowerCase().includes(searchLower);
            }
        }

        Timer.all_times.forEach((node_data) => {
            if (!filterFunc(node_data)) return;
            const t = node_data.id;

            const rowCells = [
                $el("td", {className: "node", textContent: getNodeNameById(node_data.id)})
            ];
            if (!Timer.isHidden('runs', 'display')) rowCells.push($el("td", {className: "runs", "textContent": node_data.runs.toString()}));
            if (!Timer.isHidden('per-run', 'display')) rowCells.push($el("td", {className: "per-run", "textContent": Timer._format(node_data.avgPerRun)}));
            if (!Timer.isHidden('per-flow', 'display')) rowCells.push($el("td", {className: "per-flow", "textContent": Timer._format(node_data.avgPerFlow)}));
            if (!Timer.isHidden('current-run', 'display')) rowCells.push($el('td', {className: "current-run", "textContent": Timer._format(Timer.getCurrentRunTime(t))}));

            // Add individual cells for each of the last n runs
            const runIds = Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs);
            const actualRuns = Math.min(runIds.length, Timer.last_n_runs);

            // Add cells for actual runs
            for (let i = actualRuns - 1; i >= 0; i--) {
                const runId = runIds[i];
                const runTime = runId && Timer.run_history[runId]?.nodes[t]?.totalTime || 0;
                rowCells.push($el('td', {className: "run-n", "textContent": Timer._format(runTime)}));
            }

            // Add empty cells for missing runs
            for (let i = actualRuns; i < Timer.last_n_runs; i++) {
                rowCells.push($el('td', {className: "run-n", "textContent": "-"}));
            }

            table.append($el("tr", rowCells));
        });

        // Return just the table if scope is "table"
        if (scope === "table") {
            return table;
        }

        // Build list of all run notes
        const allRunIds = Object.keys(Timer.run_history).sort(); // chronological by id
        const notesListEl = $el("div", { className: "cg-timer-notes-list" });
        let rn = 1;
        for (let i = 0; i < allRunIds.length; i++) {
            const runId = allRunIds[i];
            const header = $el("div", {
                className: "cg-run-note-header",
                textContent: `RUN ${rn}`,
                onmouseenter: ev => {
                    ev.currentTarget.style.cursor = (ev.ctrlKey || Timer.ctrlDown) ? 'not-allowed' : '';
                },
                onmousemove: ev => {
                    ev.currentTarget.style.cursor = (ev.ctrlKey || Timer.ctrlDown) ? 'not-allowed' : '';
                },
                onclick: ev => {
                    if (!ev.ctrlKey) return;
                    if (Timer.run_history[runId]) delete Timer.run_history[runId];
                    if (Timer.run_notes[runId]) delete Timer.run_notes[runId];
                    if (Timer.onChange) Timer.onChange();
                }
            });
            const noteText = Timer.run_notes[runId] || "";
            const body = $el("div", {
                className: "cg-run-note-body",
                textContent: noteText,
                style: { whiteSpace: "pre-wrap", marginBottom: "8px" }
            });
            notesListEl.append(header, body);
            rn++;
        }

        // Top-level div with search UI, table, and run notes list
        return $el("div", {
            className: "cg-timer-widget-wrapper",
        }, [
            $el("div", {
                className: "cg-timer-widget",
            }, [
                $el("div", {
                    className: "cg-timer-search",
                    style: { marginBottom: "6px" }
                }, [
                    searchInput,
                    regexCheckbox,
                    regexLabel,
                ]),
                copyButton,
                $el("div", {
                    className: "cg-timer-table-wrapper",
                }, [table]),
                $el("div", {
                    className: "cg-timer-notes-list-wrapper",
                    style: { marginTop: "10px" }
                }, [
                    $el("h4", { textContent: "Run Notes" }),
                    notesListEl
                ])
            ]),
            // Add the status bar
            $el("div", {
                className: "cg-timer-status-bar",
            }, [
                $el("div", {
                    className: "cg-status-left",
                    textContent: "Miss Katie, where have you gone, why have you gone so far away from here", // Replace with actual content if needed
                }),
                $el("div", {
                    className: "cg-status-middle",
                }),
                $el("div", {
                    className: "cg-status-middle",
                }),
                $el("div", {
                    className: "cg-status-right",
                    textContent: "sfinktah made this", // Replace with actual content
                })
            ])
        ]);
    }
}

app.registerExtension({
    name: "cg.quicknodes.oldtimer",
    setup: function () {
        // Import styles from module and inject them directly into the DOM
        import("../01/timer-styles.js").then(({ injectTimerStyles }) => {
            injectTimerStyles();
        }).catch(err => {
            console.error("Failed to load timer styles:", err);
        });

        // Preload tooltip library (Tippy.js via CDN)
        ensureTooltipLib().catch(() => {});

        // Wrap queuePrompt to capture queued notes at queue time
        try {
            const origQueuePrompt = api.queuePrompt?.bind(api);
            if (typeof origQueuePrompt === "function") {
                api.queuePrompt = async function(...args) {
                    try {
                        // Last arg is typically the prompt payload
                        const payload = args[args.length - 1];
                        const queuedRaw = Timer.extractQueuedNoteFromPrompt(payload);
                        const result = await origQueuePrompt(...args);
                        const promptId = result?.prompt_id ?? result?.promptId ?? result?.number ?? result?.data?.prompt_id;
                        if (promptId && queuedRaw !== undefined) {
                            const text = Timer.toNoteString(queuedRaw);
                            Timer.queuedNotesByPromptId[promptId] = text;
                            console.debug("[Timer] Captured queued note for prompt", promptId, ":", text);
                        } else {
                            console.debug("[Timer] queuePrompt: no promptId or no queuedRaw found.", { queuedRaw, result });
                        }
                        return result;
                    } catch (err) {
                        console.warn("[Timer] queuePrompt wrapper error:", err);
                        return origQueuePrompt(...args);
                    }
                }
            }
        } catch (wrapErr) {
            console.warn("[Timer] Failed to wrap queuePrompt:", wrapErr);
        }

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
                console.log("System Info Collected:", Timer.systemInfo);
            }).catch(err => {
                console.warn("Failed to collect system information:", err);
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
        api.addEventListener("execution_start", Timer.executionStart);
        api.addEventListener("execution_success", Timer.executionSuccess)

        // Track Control key for deletion UI cursor feedback
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Control') Timer.ctrlDown = true;
        });
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Control') Timer.ctrlDown = false;
        });

        console.log('cg.quicknodes.timer registered');
    },
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeType.comfyClass === "Timer") {
            chainCallback(nodeType.prototype, "onExecutionStart", function () {
                Timer.start();
            });

            chainCallback(nodeType.prototype, "onExecuted", function (message) {
                console.debug("[Timer] onExecuted", message);
                let bg_image = message["bg_image"];
                if (bg_image) {
                    console.log("[Timer] onExecuted: bg_image", bg_image);
                    this.properties.currentRunning = {data : bg_image };
                }
            });

            chainCallback(nodeType.prototype, "onNodeCreated", function () {
                console.log('beforeRegisterNodeDef.onNodeCreated', this);
                const node = this;

                // Ensure built-in widgets (like 'Run notes (for queued run)') render above the dynamic inputs
                // this.widgets_up = true;

                // ComfyNode
                // console.log('cg.quicknodes.timer.onNodeCreated', this);

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
                }, { min: 1, max: Timer.maxRuns, step: 1, precision: 0 });

                // Add the multiline run notes textarea (active run)
                const textareaWidget = this.addWidget("text", "Run notes (for active run)", "", (v) => {
                    // Save the note to the current run if available
                    if (Timer.current_run_id) {
                        Timer.run_notes[Timer.current_run_id] = v;
                    }
                    return v;
                }, { multiline: true });  // Enable multiline for textarea

                // Add Notes from queue textarea (populated when job starts)
                const notesFromQueueWidget = this.addWidget("text", "Notes from queue", "", (v) => v, { multiline: true });

                // Store references for later use
                Timer.activeNotesWidget = textareaWidget;
                Timer.notesFromQueueWidget = notesFromQueueWidget;

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
                                        secondlast = null;
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

                // inputEl.addEventListener('input', () => {
                // callback?.(widget.value)
                // widget.callback?.(widget.value)
                // })
                widget.onRemove = () => {
                    inputEl.remove()
                }

                this.serialize_widgets = false;

                Timer.onChange = function () {
                    // Rebuild entire content so both table and notes list update
                    // const container = widget.inputEl;
                    // const newContent = Timer.html();
                    // if (container.firstChild) {
                    //     container.replaceChild(newContent, container.firstChild);
                    // } else {
                    //     container.appendChild(newContent);
                    // }
                    //this.onResize?.(this.size);

                    const existingTable = widget.inputEl.querySelector('.cg-timer-table');
                    if (existingTable) {
                        existingTable.parentNode.replaceChild(Timer.html('table'), existingTable);
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

