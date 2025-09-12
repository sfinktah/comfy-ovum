/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('../01/typedefs.js').INodeInputSlot} INodeInputSlot */

/** @type {ComfyApp} */
import {app} from "../../../scripts/app.js";
import {$el} from "../../../scripts/ui.js";

import { uniq, removeEmojis, getNodeNameById, graphGetNodeById, findNodesByTypeName, findTimerNodes } from '../01/graphHelpers.js';
import { chainCallback, stripTrailingId } from '../01/utility.js';
import { ensureTooltipLib, attachTooltip } from '../01/tooltipHelpers.js';
import { onUploadGraphData, onCopyGraphData, onCopyButton } from "../01/copyButton.js";
import { bestConfigTracker } from "../01/best-config-tracker.js";

const LOCALSTORAGE_KEY = 'ovum.timer.history';

export class Timer {
    static debug = false;
    static all_times = [];
    static run_history = {}; // Store timings for each run
    static pending_run_notes = null;
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
    static cudnn_enabled = null;
    // Cache for node names: id -> { name: string, updatedAt: number }
    static nodeNameCache = {};
    static NAME_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
            // Prune old cached names before saving
            Timer.pruneOldCachedNames();

            localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(Timer.all_times));
            localStorage.setItem(LOCALSTORAGE_KEY + '.settings', JSON.stringify({
                last_n_runs: Timer.last_n_runs
            }));
            localStorage.setItem(LOCALSTORAGE_KEY + '.run_notes', JSON.stringify(Timer.run_notes));
            localStorage.setItem(LOCALSTORAGE_KEY + '.run_history', JSON.stringify(Timer.run_history));
            localStorage.setItem(LOCALSTORAGE_KEY + '.runs_since_clear', JSON.stringify(Timer.runs_since_clear));
            localStorage.setItem(LOCALSTORAGE_KEY + '.node_name_cache', JSON.stringify(Timer.nodeNameCache));
        } catch (e) {
            console.warn('[Timer] Failed to save timer history:', e);
        }
    }

    static saveToStorage() {
        try {
            // Local-only persistence
            Timer.saveToLocalStorage();
        } catch (e) {
            console.warn('[Timer] Failed to save timer data to storage:', e);
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

            // Load node name cache
            const nameCacheData = localStorage.getItem(LOCALSTORAGE_KEY + '.node_name_cache');
            if (nameCacheData) {
                try {
                    const parsedCache = JSON.parse(nameCacheData);
                    if (parsedCache && typeof parsedCache === 'object') {
                        Timer.nodeNameCache = {};
                        const now = Date.now();
                        for (const [id, entry] of Object.entries(parsedCache)) {
                            if (entry && typeof entry === 'object' && 'name' in entry) {
                                const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : now;
                                Timer.nodeNameCache[id] = { name: String(entry.name), updatedAt };
                            } else if (typeof entry === 'string') {
                                // Legacy value: cache held plain name
                                Timer.nodeNameCache[id] = { name: entry, updatedAt: now };
                            }
                        }
                        // Recycle old entries on load
                        Timer.pruneOldCachedNames();
                    }
                } catch (err) {
                    console.warn('[Timer] Failed to parse node name cache:', err);
                }
            }
        } catch (e) {
            console.warn('[Timer] Failed to load timer history:', e);
        }
    }

    static loadFromStorage() {
        try {
            // Local-only persistence
            Timer.loadFromLocalStorage();
            if (Timer.onChange) Timer.onChange();
        } catch (e) {
            console.warn('[Timer] Failed to load timer data from storage:', e);
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
            localStorage.removeItem(LOCALSTORAGE_KEY + '.node_name_cache');

            if (Timer.debug) console.log('[Timer] Timer data cleared from storage');
        } catch (e) {
            console.warn('[Timer] Failed to clear timer data from storage:', e);
        }
    }

    static clear() {
        Timer.all_times = [];
        Timer.run_history = {};
        Timer.current_run_id = null;
        Timer.runs_since_clear = 0;
        Timer.run_notes = {};
        Timer.pending_run_notes = null;
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
        Timer.run_notes[Timer.current_run_id] = Timer.pending_run_notes || '';
        Timer.pending_run_notes = null;
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
        return (number / 1000).toLocaleString(undefined, {
            minimumFractionDigits: dp,
            maximumFractionDigits: dp
        });
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

    // Wrapper around getNodeNameById that caches and persists node names
    static getNodeNameByIdCached(id) {
        try {
            const name = getNodeNameById(id);
            const now = Date.now();
            if (name && !name.startsWith('id:')) {
                if (!Timer.nodeNameCache || typeof Timer.nodeNameCache !== 'object') {
                    Timer.nodeNameCache = {};
                }
                Timer.nodeNameCache[id] = { name, updatedAt: now };
                // Recycle old entries and persist just the cache
                Timer.pruneOldCachedNames(now);
                try {
                    localStorage.setItem(LOCALSTORAGE_KEY + '.node_name_cache', JSON.stringify(Timer.nodeNameCache));
                } catch (e) {
                    console.warn('[Timer] Failed to persist node name cache:', e);
                }
            }
            else if (name && name.startsWith('id:')) {
                if (Timer.nodeNameCache && typeof Timer.nodeNameCache === 'object' && typeof Timer.nodeNameCache[id] === 'object') {
                    return Timer.nodeNameCache[id].name + ' (cached)';
                }
            }
            return name;
        } catch (err) {
            console.warn('[Timer] Failed to get node name by id:', err);
            // Fallback to direct call
            return getNodeNameById(id);
        }
    }

    // Remove cached names older than NAME_CACHE_MAX_AGE_MS
    static pruneOldCachedNames(nowTs) {
        try {
            const now = typeof nowTs === 'number' ? nowTs : Date.now();
            const cutoff = now - Timer.NAME_CACHE_MAX_AGE_MS;
            if (!Timer.nodeNameCache || typeof Timer.nodeNameCache !== 'object') {
                Timer.nodeNameCache = {};
                return;
            }
            let changed = false;
            for (const [id, entry] of Object.entries(Timer.nodeNameCache)) {
                const ts = (entry && typeof entry.updatedAt === 'number') ? entry.updatedAt : 0;
                if (ts < cutoff || entry.name.startsWith('id:')) {
                    delete Timer.nodeNameCache[id];
                    changed = true;
                }
            }
            if (changed) {
                try {
                    localStorage.setItem(LOCALSTORAGE_KEY + '.node_name_cache', JSON.stringify(Timer.nodeNameCache));
                } catch (e) {
                    console.warn('[Timer] Failed to persist pruned node name cache:', e);
                }
            }
        } catch (err) {
            console.warn('[Timer] Failed to prune node name cache:', err);
        }
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
     * Returns a unique list of node IDs seen across the current graph, aggregated timings, and run history.
     * Pseudo-IDs like "total" and "startup" are excluded.
     * @returns {string[]}
     */
    static getUniqueNodeIds(runHistory = null) {
        try {
            const ids = new Set();

            // From aggregated timing data
            // if (Array.isArray(Timer.all_times)) {
            //     for (const entry of Timer.all_times) {
            //         if (entry && entry.id != null) ids.add(String(entry.id));
            //     }
            // }

            // From run history
            if (runHistory)
            runHistory.forEach(id => ids.add(String(id)));

            // From current graph, if available
            const g = app?.graph;
            ids = new Set();
            if (g && Array.isArray(g._nodes)) {
                for (const n of g._nodes) {
                    if (n && n.id != null) ids.add(String(n.id));
                }
            }

            // Remove pseudo-IDs
            ids.delete("startup");

            return Array.from(ids);
        } catch {
            return [];
        }
    }

    /**
     * Handles execution tick events from ComfyApi.
     * @param {ComfyTickEvent} e
     */
    static executing(e) {
        let detail = e.detail;

        if (detail === Timer?.currentNodeId) return;
        const node_name = Timer.getNodeNameByIdCached(detail);

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
                    runData.nodes[id] = { count: 0, totalTime: 0, startTimes: [], cudnn: Timer.cudnn_enabled };
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

    static onLog(e) {
        /*
        detail.entries = [{m: message, t: timestamp}]
         */
        const entries = e?.detail?.entries;
        if (!Array.isArray(entries)) return;

        entries.forEach((entry) => {
            const msg = typeof entry?.m === "string" ? entry.m : "";
            if (!msg) return;

            // Match explicit booleans case-insensitively
            const m = msg.match(/torch\.backends\.cudnn\.enabled (?:still )?set to (true|false)/i);
            if (m) {
                Timer.cudnn_enabled = m[1].toLowerCase() === "true";
                if (Timer.debug) console.log('[Timer] cudnn enabled:', Timer.cudnn_enabled);
            }
        });
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
                const activeText = (activeWidget?.value || "").toString().trim();

                if (activeText) {
                    Timer.run_notes[Timer.current_run_id] = activeText;
                }

                // Reset the text area for next run
                if (activeWidget) activeWidget.value = "";
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
            // Trigger upload of timing data at end of execution
            onUploadGraphData().catch(err => console.warn('[Timer] Upload timing failed:', err));
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
                Timer.searchTerm = e.target.value;
                if (Timer.onChange) Timer.onChange();
            },
            onenter: e => {
            },
            // Prevent ComfyUI/global key handlers while typing here
            onkeydown: e => {
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
            onclick: onCopyButton
        }); // onCopyGraphData

        const copyGraphDataButton = $el("button", {
            textContent: "Copy Graph Data",
            onclick: onCopyGraphData
        }); // onCopyGraphData

        const uploadGraphDataButton = $el("button", {
            textContent: "Upload Graph Data",
            onclick: onUploadGraphData
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
        const allRunIdsAsc = Object.keys(Timer.run_history).sort(); // chronological list of all runs

        // Add individual columns for each of the last n runs
        const lastNRunIds = Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs); // -1 to exclude the current run
        if (Timer.debug) console.log('[Timer] lastNRunIds', lastNRunIds);
        const lastNRunCount = Math.min(lastNRunIds.length, Timer.last_n_runs);
        if (Timer.debug) console.log('[Timer] lastNRunCount', lastNRunCount);
        let displayedRunNumber = 1;
        for (let i = lastNRunCount - 1; i >= 0; i--) {
            const runId = lastNRunIds[i];

            // Compute the true chronological run number (1-based)
            const trueRunNumber = allRunIdsAsc.indexOf(runId) + 1;

            /** @type {HTMLTableCellElement} */
            const th = $el('th', {
                className: "run-n",
                textContent: Timer.run_notes[runId] ?  `* Run ${displayedRunNumber}` : `Run ${displayedRunNumber}`,
                dataset: { trueRunNumber },
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

            // Attach double click event for editing run notes
            th.addEventListener("dblclick", () => {
                Timer.editRunNotes(runId);
            });

            tableHeader.push(th);
            displayedRunNumber += 1;
        }

        // Add empty cells for missing runs
        for (let i = lastNRunCount; i < Timer.last_n_runs; i++) {
            tableHeader.push($el('th', {className: "run-n", "textContent": `Run ${displayedRunNumber}`}));
            displayedRunNumber += 1;
        }

        // If we have fewer actual runs than the setting, add placeholder columns
        // for (let i = lastNRunCount; i < Timer.last_n_runs; i++) {
        //     const displayedRunNumber = i + 1;
        //     tableHeader.push($el('th', {className: "run-" + displayedRunNumber, "textContent": `Run ${displayedRunNumber}`}));
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
        const startTimes = lastNRunIds.reduce((acc, id) => {
            const nodes = Timer.run_history[id]?.nodes;
            if (!nodes) return acc;

            for (const [k, v] of Object.entries(nodes)) {
                const start = v.startTimes?.[0] ?? 0;
                //const title = app.graph.getNodeById(k)?.getTitle();
                const title = Timer.getNodeNameByIdCached(k);
                if (title && start && v.totalTime > 10000) {
                    acc.push({start: start, node: title, total: v.totalTime});
                }
            }
            return acc;
        }, []);


        const currentRunHistory = lastNRunIds.reduce((acc, id) => {
            const nodes = Timer.run_history[id]?.nodes;
            acc.push(nodes);
            return acc;
        }, [])
        const runNodeIds = currentRunHistory.flatMap(o => Object.keys(o))
        if (Timer.debug) console.log("[Timer] currentRunHistory: ", currentRunHistory);
        if (Timer.debug) console.log("[Timer] runNodeIds: ", runNodeIds);
        const currentNodeIds = uniq(runNodeIds); // this.getUniqueNodeIds(runNodeIds);
        if (Timer.debug) console.log("[Timer] currentNodeIds: ", currentNodeIds);

        const averagesByK = (function averageByK(lastNRunIds) {
            const sums = Object.create(null);
            const counts = Object.create(null);

            for (const id of lastNRunIds) {
                const nodes = Timer.run_history[id]?.nodes;
                if (!nodes) {
                    if (Timer.debug) console.log(`[Timer] [averagesByK] No nodes found for run ${id}`);
                    continue;
                }

                // Exclude runs that don't have a numeric totalTime for the 'total' key
                const totalNode = nodes['total'];
                if (!totalNode || typeof totalNode.totalTime !== 'number') {
                    continue;
                }

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
        })(lastNRunIds);
        // console.log("[Timer] averagesByK: ", averagesByK);

        // Sort by aggregated totals (desc), defaulting to 0 when missing
        Timer.all_times.sort((a, b) => (averagesByK[b.id] ?? 0) - (averagesByK[a.id] ?? 0));

        // Build filter
        let filterFunc = (node_data) => ~currentNodeIds.indexOf(node_data.id) || node_data.id.includes("total");
        if (Timer.searchTerm) {
            if (Timer.searchRegex) {
                let re;
                try {
                    re = new RegExp(Timer.searchTerm, "i");
                    filterFunc = (node_data) => re.test(Timer.getNodeNameByIdCached(node_data.id));
                } catch {
                    Timer.errorInStatus("Invalid regex: " + Timer.searchTerm);
                    // filterFunc = () => true; // Don't filter if regex is broken
                }
            } else {
                const searchLower = Timer.searchTerm.toLowerCase();
                filterFunc = (node_data) =>
                    Timer.getNodeNameByIdCached(node_data.id).toLowerCase().includes(searchLower);
            }
        }

        Timer.all_times.forEach((node_data) => {
            if (!filterFunc(node_data)) return;
            const nodeId = node_data.id;
            const drawingActiveNode = Timer.currentNodeId === nodeId;

            const rowCells = [
                $el("td", {className: "node", textContent: Timer.getNodeNameByIdCached(node_data.id)})
            ];
            rowCells[0].addEventListener("dblclick", () => {
                // nodeId = "123:345"
                const firstNode = nodeId.split(":")[0];
                app.canvas.centerOnNode(app.graph.getNodeById(firstNode));
                // app.canvas.centerOnNode(app.graph.getNodeById(27))
                app.canvas.selectNode(app.graph.getNodeById(firstNode), false);
                // app.graph.canvasAction((c) => {
                //     c.centerOnNode(nodeId);
                //     c.selectNode(nodeId, false);
                // });
            });
            if (!Timer.isHidden('runs', 'display')) rowCells.push($el("td", {
                className: "runs",
                "textContent": node_data.runs.toString()
            }));
            if (!Timer.isHidden('per-run', 'display')) rowCells.push($el("td", {
                className: "per-run",
                "textContent": Timer._format(node_data.avgPerRun)
            }));
            if (!Timer.isHidden('per-flow', 'display')) rowCells.push($el("td", {
                className: "per-flow",
                "textContent": Timer._format(node_data.avgPerFlow)
            }));
            if (!Timer.isHidden('current-run', 'display')) rowCells.push($el('td', {
                className: "current-run",
                "textContent": Timer._format(Timer.getCurrentRunTime(nodeId))
            }));

            // Add individual cells for each of the last n runs
            // const runIds = Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs);
            // const lastNRunCount = Math.min(runIds.length, Timer.last_n_runs - 1);

            // Add cells for actual runs
            for (let i = lastNRunCount - 1; i >= 0; i--) {
                const runId = lastNRunIds[i];
                const drawingLiveRun = (runId === Timer.current_run_id);
                // Compute the true chronological run number (1-based)
                const trueRunNumber = allRunIdsAsc.indexOf(runId) + 1;
                const runTime = runId && Timer.run_history[runId]?.nodes[nodeId]?.totalTime || 0;
                const extraClasses = ['run-n'];
                if (Timer.run_history[runId]?.nodes[nodeId]?.cudnn === false) {
                    extraClasses.push('cudnn-off');
                } else if (Timer.run_history[runId]?.nodes[nodeId]?.cudnn === true) {
                    extraClasses.push('cudnn-on');
                }
                if (drawingLiveRun === true) {
                    extraClasses.push('live-run');
                }
                rowCells.push($el('td', {
                    className: extraClasses.join(' '),
                    textContent: Timer._format(runTime),
                    dataset: { trueRunNumber }
                }));
            }

            // Add empty cells for missing runs
            for (let i = lastNRunCount; i < Timer.last_n_runs; i++) {
                rowCells.push($el('td', {
                    className: "run-n run-empty",
                    textContent: "-"
                }));
            }
            table.append($el("tr", {className: drawingActiveNode ? "live-node" : ""}, rowCells));

        });

        // Return just the table if scope is "table"
        if (scope === "table") {
            return table;
        }

        // Build list of all run notes
        // const allRunIdsAsc = Object.keys(Timer.run_history).sort(); // chronological by id
        const notesListEl = $el("div", { className: "cg-timer-notes-list" });

        const runIds = Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs);
        let runNumber = 1;
        for (let i = runIds.length - 1; i >= 0; i--) {
            const runId = runIds[i];
            if (Timer.run_notes[runId]) {
                const header = $el("div", {
                    className: "cg-run-note-header",
                    textContent: `RUN ${runNumber}`,
                });
                const noteText = Timer.run_notes[runId] || "";
                const body = $el("div", {
                    className: "cg-run-note-body",
                    textContent: noteText,
                });

                // Wrap header and body into a flex container; styling handled via CSS
                const row = $el("div", {
                    className: "cg-run-note",
                }, [header, body]);

                notesListEl.append(row);
            }
            runNumber++;
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
            // Moved UI above the widget
            $el("div", {
                className: "cg-timer-above-table",
            }, [
                $el("div", {
                    className: "cg-timer-search",
                }, [
                    searchInput,
                    regexCheckbox,
                    regexLabel,
                ]),
                copyButton,
                copyGraphDataButton,
                uploadGraphDataButton,
            ]),
            $el("div", {
                className: "cg-timer-widget",
            }, [
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

    static errorInStatus(s) {
        const statusLeft = document.querySelector('.cg-status-left');
        if (statusLeft) {
            const previousInnerText = statusLeft.innerText;
            statusLeft.innerText = s;
            setTimeout(() => {
                statusLeft.innerText = previousInnerText;
            }, 5000);
        }
    }
}
