/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('../01/typedefs.js').INodeInputSlot} INodeInputSlot */

/** @type {ComfyApp} */
import {app} from "../../../scripts/app.js";
import {api} from "../../../scripts/api.js";

import {findTimerNodes, getNodeNameById} from '../01/graphHelpers.js';
import {onUploadGraphData} from "../01/copyButton.js";
import {Logger} from "../common/logger.js";
import { confirmDestructive } from "./dialog-helper.js";

const LOCALSTORAGE_KEY = 'ovum.timer.history';

async function fetch_cudnn_status() {
    try {
        const res = await api.fetchApi('/ovum/cudnn', {method: 'GET'});
        const json = await res.json();
        let cudnn_enabled = null;
        if (json && typeof json === 'object') {
            if (typeof json["torch.backends.cudnn.enabled"] === 'boolean') {
                cudnn_enabled = json["torch.backends.cudnn.enabled"];
            }
        }
        return cudnn_enabled;
    } catch (err) {
        Logger.log({
            class: 'ovum.timer',
            method: 'fetch_cudnn_status',
            severity: 'warn',
            tag: 'error',
            nodeName: 'ovum.timer'
        }, '[Timer] Failed to fetch cudnn status:', err);
    }
}

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
    static currentRunDataNode = null;
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
            Logger.log({class:'ovum.timer',method:'saveToLocalStorage',severity:'warn',tag:'error', nodeName:'ovum.timer'}, '[Timer] Failed to save timer history:', e);
        }
    }

    static saveToStorage() {
        try {
            // Local-only persistence
            Timer.saveToLocalStorage();
        } catch (e) {
            Logger.log({class:'ovum.timer',method:'saveToStorage',severity:'warn',tag:'error', nodeName:'ovum.timer'}, '[Timer] Failed to save timer data to storage:', e);
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
                    Logger.log({class:'ovum.timer',method:'loadFromLocalStorage',severity:'warn',tag:'error', nodeName:'ovum.timer'}, '[Timer] Failed to parse node name cache:', err);
                }
            }
        } catch (e) {
            Logger.log({class:'ovum.timer',method:'loadFromLocalStorage',severity:'warn',tag:'error', nodeName:'ovum.timer'}, '[Timer] Failed to load timer history:', e);
        }
    }

    static loadFromStorage() {
        try {
            // Local-only persistence
            Timer.loadFromLocalStorage();
            if (Timer.onChange) Timer.onChange();
        } catch (e) {
            Logger.log({class:'ovum.timer',method:'loadFromStorage',severity:'warn',tag:'error', nodeName:'ovum.timer'}, '[Timer] Failed to load timer data from storage:', e);
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

            if (Timer.debug) { Logger.log({class:'ovum.timer',method:'clearStorage',severity:'debug',tag:'flow', nodeName:'ovum.timer'}, '[Timer] Timer data cleared from storage'); }
        } catch (e) {
            Logger.log({class:'ovum.timer',method:'clearStorage',severity:'warn',tag:'error', nodeName:'ovum.timer'}, '[Timer] Failed to clear timer data from storage:', e);
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

    static async confirmAndClear() {
        const confirmed = await confirmDestructive({
            title: "Clear timing history?",
            message: "This will permanently delete all saved timing history, notes, and cached names on this browser.",
            confirmText: "Delete",
            cancelText: "Cancel",
        });
        if (!confirmed) return false;
        try {
            Timer.clear();
            Timer.clearStorage();
            return true;
        } finally {
            // No-op
        }
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
                    Logger.log({class:'ovum.timer',method:'getNodeNameByIdCached',severity:'warn',tag:'error', nodeName:'ovum.timer'}, '[Timer] Failed to persist node name cache:', e);
                }
            }
            else if (name && name.startsWith('id:')) {
                if (Timer.nodeNameCache && typeof Timer.nodeNameCache === 'object' && typeof Timer.nodeNameCache[id] === 'object') {
                    return Timer.nodeNameCache[id].name + ' (n/a)';
                }
            }
            return name;
        } catch (err) {
            Logger.log({class:'ovum.timer',method:'getNodeNameByIdCached',severity:'warn',tag:'error', nodeName:'ovum.timer'}, '[Timer] Failed to get node name by id:', err);
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
                    Logger.log({class:'ovum.timer',method:'pruneOldCachedNames',severity:'warn',tag:'error', nodeName:'ovum.timer'}, '[Timer] Failed to persist pruned node name cache:', e);
                }
            }
        } catch (err) {
            Logger.log({class:'ovum.timer',method:'pruneOldCachedNames',severity:'warn',tag:'error', nodeName:'ovum.timer'}, '[Timer] Failed to prune node name cache:', err);
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
     * When a new node is about to be executed
     * node (node id or None to indicate completion), prompt_id
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
                    runData.nodes[id] = { count: 0, totalTime: 0, startTimes: [], cudnn: null };
                }
                if (!Array.isArray(runData.nodes[id].startTimes)) {
                    runData.nodes[id].startTimes = [];
                }
                runData.nodes[id].startTimes.push(Date.now());
                Timer.currentRunDataNode = runData.nodes[id];
            }
        }

        if (!Timer.currentNodeId) Timer.add_timing("total", t - Timer.startTime);

        if (Timer.onChange) Timer.onChange();
    }

    static onLog(e) {
        /*
        detail.entries = [{m: message, t: timestamp}]
         */
        // Check Timer is actually registered
        if (!Timer?.maxRuns) {
            return;
        }
        const entries = e?.detail?.entries;
        if (!Array.isArray(entries)) return;

        entries.forEach((entry) => {
            const msg = typeof entry?.m === "string" ? entry.m : "";
            if (!msg) return;

            // Match explicit booleans case-insensitively
            const m = msg.match(/torch\.backends\.cudnn\.enabled (?:still )?set to (true|false)/i);
            if (m) {
                if (Timer?.currentRunDataNode?.cudnn !== null) {
                    Logger.log({
                        class: 'ovum.timer',
                        method: 'onLog',
                        severity: 'debug',
                        tag: 'flow',
                        nodeName: 'ovum.timer'
                    }, "Ignoring multiple cudnn status messages for #", Timer?.currentNodeId, ":", Timer?.currentRunDataNode?.cudnn, "->", m[1].toLowerCase());
                }
                else {
                    Logger.log({
                        class: 'ovum.timer',
                        method: 'onLog',
                        severity: 'debug',
                        tag: 'flow',
                        nodeName: 'ovum.timer'
                    }, "Investigating first cudnn status messages for #", Timer?.currentNodeId, ":", Timer?.currentRunDataNode?.cudnn, "->", m[1].toLowerCase());

                    if (Timer?.currentNodeId) {
                        fetch_cudnn_status()
                            .then(cudnn_enabled => {
                                if (cudnn_enabled !== null) {
                                    if (Timer?.currentRunDataNode) {
                                        Timer.currentRunDataNode.cudnn = Timer.cudnn_enabled = cudnn_enabled;
                                    }
                                }
                            })
                            .catch(err => {
                                Logger.log({
                                    class: 'ovum.timer',
                                    method: 'onLog',
                                    severity: 'warn',
                                    tag: 'error',
                                    nodeName: 'ovum.timer'
                                }, '[Timer] Failed to fetch cudnn status:', err);
                            })
                        ;
                    }
                }
                Timer.cudnn_enabled = m[1].toLowerCase() === "true";
                if (Timer.debug) Logger.log({class:'ovum.timer',method:'onLog',severity:'debug',tag:'flow', nodeName:'ovum.timer'}, `[Timer] cudnn enabled #${Timer.currentNodeId} ${getNodeNameByIdCached(Timer.currentNodeId)}:`, Timer.cudnn_enabled);
            }
        });
    }

    static executionError(e) {}
    static executionInterrupted(e) {}
    static executionStart(e) {}
    // When all nodes from the prompt have been successfully executed	prompt_id, timestamp
    static executionSuccess(e) {
        const t = LiteGraph.getTime();
        if (Timer.current_run_id && Timer.run_history[Timer.current_run_id]) {
            Timer.run_history[Timer.current_run_id].endTime = t;
            Timer.run_history[Timer.current_run_id].totalTime = t - Timer.run_history[Timer.current_run_id].startTime;

            // Save any notes from the textarea for this run
            // const timerNodes = findTimerNodes();
            // if (timerNodes.length > 0) {
                // const timerNode = timerNodes[0]; // Use the first timer node found
                // const activeWidget = timerNode.widgets.find(w => w.name === "Run notes (for active run)");
                // const activeText = (activeWidget?.value || "").toString().trim();
                //
                // if (activeText) {
                //     Timer.run_notes[Timer.current_run_id] = activeText;
                // }

                // Reset the text area for next run
                // if (activeWidget) activeWidget.value = "";
                // timerNode.setDirtyCanvas(true);
            // }

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
            onUploadGraphData().catch(err => Logger.log({class:'ovum.timer',method:'executionSuccess',severity:'warn',tag:'error', nodeName:'ovum.timer'}, '[Timer] Upload timing failed:', err));
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
            Logger.log({class:'ovum.timer',method:'editRunNotes',severity:'warn',tag:'error', nodeName:'ovum.timer'}, "[Timer] editRunNotes failed:", err);
        }
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
