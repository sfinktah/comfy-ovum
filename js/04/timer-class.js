/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('../01/typedefs.js').INodeInputSlot} INodeInputSlot */

/** @type {ComfyApp} */
import {app} from "../../../scripts/app.js";
import {$el} from "../../../scripts/ui.js";

import { removeEmojis, getNodeNameById, graphGetNodeById, findNodesByTypeName, findTimerNodes } from '../01/graphHelpers.js';
import { chainCallback, stripTrailingId } from '../01/utility.js';
import { ensureTooltipLib, attachTooltip } from '../01/tooltipHelpers.js';
import { bestConfigTracker } from '../01/best-config-tracker.js';

const LOCALSTORAGE_KEY = 'ovum.timer.history';

export class Timer {
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
    static maxRuns = 100; // Maximum saved & displayed runs
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
            localStorage.setItem(LOCALSTORAGE_KEY + '.run_history', JSON.stringify(Timer.run_history));
            localStorage.setItem(LOCALSTORAGE_KEY + '.runs_since_clear', JSON.stringify(Timer.runs_since_clear));
        } catch (e) {
            console.warn('Failed to save timer history:', e);
        }
    }

    static saveToStorage() {
        try {
            // Local-only persistence
            Timer.saveToLocalStorage();
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

            // Load run history
            const historyData = localStorage.getItem(LOCALSTORAGE_KEY + '.run_history');
            if (historyData) {
                const parsedHistory = JSON.parse(historyData);
                if (parsedHistory && typeof parsedHistory === 'object') {
                    Timer.run_history = parsedHistory;
                }
            }

            // Load runs_since_clear
            const rscData = localStorage.getItem(LOCALSTORAGE_KEY + '.runs_since_clear');
            if (rscData) {
                const v = JSON.parse(rscData);
                if (typeof v === 'number') {
                    Timer.runs_since_clear = v;
                }
            }
        } catch (e) {
            console.warn('Failed to load timer history:', e);
        }
    }

    static loadFromStorage() {
        try {
            // Local-only persistence
            Timer.loadFromLocalStorage();
            if (Timer.onChange) Timer.onChange();
        } catch (e) {
            console.warn('Failed to load timer data from storage:', e);
        }
    }

    static clearStorage() {
        try {
            // Clear from localStorage
            localStorage.removeItem(LOCALSTORAGE_KEY);
            localStorage.removeItem(LOCALSTORAGE_KEY + '.settings');
            localStorage.removeItem(LOCALSTORAGE_KEY + '.run_notes');
            localStorage.removeItem(LOCALSTORAGE_KEY + '.run_history');
            localStorage.removeItem(LOCALSTORAGE_KEY + '.runs_since_clear');

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

    // Append any newly seen best-config entries into the current run notes
    static async noteNewBestConfigsInCurrentRunNotes() {
        try {
            // Make sure we have latest logs merged into storage
            try {
                await bestConfigTracker.fetchAndStoreFromLogs();
            } catch (e) {
                console.warn("[Timer] Failed to fetch and store logs:", e);
                // non-fatal
            }

            const newItems = bestConfigTracker.getNewSinceAndMark();
            if (!newItems.length) return false;

            const lines = newItems.map(i => (i?.m?.trim?.() ?? String(i?.m || ""))).filter(Boolean);
            if (!lines.length) return false;

            const addition = "New best configs:\n" + lines.join("\n");

            if (Timer.current_run_id) {
                const prev = Timer.run_notes[Timer.current_run_id] || "";
                Timer.run_notes[Timer.current_run_id] = prev ? prev + "\n" + addition : addition;
            }

            // Try to reflect in the active run notes widget, if present
            if (Timer.activeNotesWidget) {
                const curVal = Timer.activeNotesWidget.value || "";
                Timer.activeNotesWidget.value = curVal ? curVal + "\n" + addition : addition;
            }

            if (typeof Timer.onChange === "function") {
                Timer.onChange();
            }
            return true;
        } catch (err) {
            console.warn("[Timer] Failed to append best-config notes:", err);
            return false;
        }
    }

    // Wrapper used by ovum-timer.js to handle the 'execution_success' event.
    // Calls the original executionSuccess (if defined) and then appends best-config notes.
    static async onExecutionSuccess(e) {
        console.log("[Timer] onExecutionSuccess:", e);
        // Call the original handler if present
        try {
            if (typeof Timer.executionSuccess === "function") {
                const maybePromise = Timer.executionSuccess(e);
                if (maybePromise && typeof maybePromise.then === "function") {
                    await maybePromise;
                }
            }
        } catch (err) {
            console.warn("[Timer] executionSuccess handler threw:", err);
        }

        // Append any newly seen best-config entries to the current run notes
        await Timer.noteNewBestConfigsInCurrentRunNotes();
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

    // Edit notes for a specific runId; prompts user and persists changes
    static editRunNotes(runId) {
        try {
            const existing = (Timer.run_notes && Timer.run_notes[runId]) ? String(Timer.run_notes[runId]) : "";
            const updated = window.prompt("Edit notes for this run:", existing);
            if (updated !== null) {
                if (updated.trim().length) {
                    Timer.run_notes[runId] = updated;
                } else {
                    // Empty input => clear notes
                    delete Timer.run_notes[runId];
                }
                Timer.saveToStorage();
                if (typeof Timer.onChange === "function") Timer.onChange();
            }
        } catch (err) {
            console.warn("[Timer] editRunNotes failed:", err);
        }
    }

    // Edit notes for a specific runId; prompts user and persists changes
    static editRunNotes(runId) {
        try {
            const existing = (Timer.run_notes && Timer.run_notes[runId]) ? String(Timer.run_notes[runId]) : "";
            const updated = window.prompt("Edit notes for this run:", existing);
            if (updated !== null) {
                if (updated.trim().length) {
                    Timer.run_notes[runId] = updated;
                } else {
                    // Empty input => clear notes
                    delete Timer.run_notes[runId];
                }
                Timer.saveToStorage();
                if (typeof Timer.onChange === "function") Timer.onChange();
            }
        } catch (err) {
            console.warn("[Timer] editRunNotes failed:", err);
        }
    }

    static html(scope) {
        // Search/filter UI
        const searchInput = $el("input", {
            type: "text",
            placeholder: "Quick search...",
            value: Timer.searchTerm,
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
        }, ["Regex"]);

        // Table header with individual columns for each of the last n runs
        const tableHeader = [$el("th", {className: "node", "textContent": "Node"})];
        if (!Timer.isHidden('runs', 'display')) tableHeader.push($el("th", {className: "runs", "textContent": "Runs"}));
        if (!Timer.isHidden('per-run', 'display')) tableHeader.push($el("th", {className: "per-run", "textContent": "Per run"}));
        if (!Timer.isHidden('per-flow', 'display')) tableHeader.push($el("th", {className: "per-flow", "textContent": "Per flow"}));
        if (!Timer.isHidden('current-run', 'display')) tableHeader.push($el('th', {className: "current-run", "textContent": "Current run"}));

        // Prepare attributes for header <tr> that map displayed run indices to true run numbers
        const headerAttrs = {};
        const allRunIdsAsc = Object.keys(Timer.run_history).sort(); // chronological list of all runs

        // Add individual columns for each of the last n runs
        const runIds = Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs - 1); // -1 to exclude the current run
        const actualRuns = Math.min(runIds.length, Timer.last_n_runs - 1);
        let runNumber = 1;
        for (let i = actualRuns - 1; i >= 0; i--) {
            const runId = runIds[i];

            // Compute the true chronological run number (1-based)
            const trueRunNumber = allRunIdsAsc.indexOf(runId) + 1;

            /** @type {HTMLTableCellElement} */
            const th = $el('th', {
                className: "run-n",
                textContent: Timer.run_notes[runId] ?  `* Run ${runNumber}` : `Run ${runNumber}`,
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
            th.setAttribute('data-run-number', String(trueRunNumber));

            // Tooltip showing run notes after 1 second hover
            const notesText = Timer.run_notes[runId] || "No run notes";
            attachTooltip(th, () => notesText, 1000);

            // Attach double click event for editing run notes
            th.addEventListener("dblclick", () => {
                Timer.editRunNotes(runId);
            });

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



        // Total up the time taken by each node in our recent run history
        const totalsByK = runIds.reduce((acc, id) => {
            const nodes = Timer.run_history[id]?.nodes;
            if (!nodes) return acc;

            for (const [k, v] of Object.entries(nodes)) {
                const total = (v && typeof v.totalTime === 'number') ? v.totalTime : 0;
                acc[k] = (acc[k] || 0) + total;
            }
            return acc;
        }, {});

        // Total up the time taken by each node in our recent run history
        const startTimes = runIds.reduce((acc, id) => {
            const nodes = Timer.run_history[id]?.nodes;
            if (!nodes) return acc;

            for (const [k, v] of Object.entries(nodes)) {
                const start = v.startTimes?.[0] ?? 0;
                //const title = app.graph.getNodeById(k)?.getTitle();
                const title = getNodeNameById(k);
                if (title && start && v.totalTime > 10000) {
                    acc.push({start: start, node: title, total: v.totalTime});
                }
            }
            return acc;
        }, []);

        const averagesByK = (function averageByK(runIds) {
            const sums = Object.create(null);
            const counts = Object.create(null);

            for (const id of runIds) {
                const nodes = Timer.run_history[id]?.nodes;
                if (!nodes) continue;

                // Exclude runs that don't have a numeric totalTime for the 'id:total' key
                const totalNode = nodes['id:total'];
                if (!totalNode || typeof totalNode.totalTime !== 'number') continue;

                for (const [k, v] of Object.entries(nodes)) {
                    const total = (v && typeof v.totalTime === 'number') ? v.totalTime : 0;
                    sums[k] = (sums[k] || 0) + total;
                    counts[k] = (counts[k] || 0) + 1; // count appearance of k within included runs
                }
            }

            const averages = Object.create(null);
            for (const k of Object.keys(sums)) {
                averages[k] = counts[k] ? sums[k] / counts[k] : 0;
            }
            return averages;
        })(runIds);

        // Sort by aggregated totals (desc), defaulting to 0 when missing
        Timer.all_times.sort((a, b) => (averagesByK[b.id] ?? 0) - (averagesByK[a.id] ?? 0));

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
            // const runIds = Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs);
            // const actualRuns = Math.min(runIds.length, Timer.last_n_runs - 1);

            // Add cells for actual runs
            for (let i = actualRuns - 1; i >= 0; i--) {
                const runId = runIds[i];
                // Compute the true chronological run number (1-based)
                const trueRunNumber = allRunIdsAsc.indexOf(runId) + 1;
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
        // const allRunIdsAsc = Object.keys(Timer.run_history).sort(); // chronological by id
        const notesListEl = $el("div", { className: "cg-timer-notes-list" });
        let rn = 1;
        for (let i = 0; i < allRunIdsAsc.length; i++) {
            const runId = allRunIdsAsc[i];
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
            });
            notesListEl.append(header, body);
            rn++;
        }

        // Header for the notes section
        const notesHeader = $el("h4", { textContent: "Run Notes" });

        // If scope targets the notes list wrapper, return the wrapper element with its content
        if (scope === "cg-timer-notes-list-wrapper") {
            return $el("div", {
                className: "cg-timer-notes-list-wrapper",
            }, [
                notesHeader,
                notesListEl
            ]);
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
                }, [
                    notesHeader,
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
