/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */

import { api } from "../../scripts/api.js";
import { app } from "../../scripts/app.js";
import { $el } from "../../scripts/ui.js";
import { ComfyWidgets } from "../../scripts/widgets.js";
import { print_r } from "./print_r.js";
// Timer styles will be dynamically imported in the setup function

const MARGIN = 8;
const LOCALSTORAGE_KEY = 'cg.quicknodes.timer.history';

type TimerHistoryItem = {
    id: string;
    runs: number;
    totalTime: number;
    avgPerRun: number;
    avgPerFlow: number;
};

interface RunHistory {
    [runId: string]: {
        nodes: Record<string, any>;
        startTime: number;
    };
}

function get_position_style(
    ctx: CanvasRenderingContext2D & { canvas: HTMLCanvasElement, getTransform(): DOMMatrix },
    scroll_width: number,
    widget_width: number,
    y: number,
    node_width: number,
    node_height: number
) {
    const visible = (app as any).canvas.ds.scale > 0.5;
    const margin = 0;
    const elRect = ctx.canvas.getBoundingClientRect();
    const transform = new DOMMatrix()
        .scaleSelf(elRect.width / ctx.canvas.width, elRect.height / ctx.canvas.height)
        .multiplySelf(ctx.getTransform())
        .translateSelf(margin, margin + y);

    return {
        transformOrigin: '0 0',
        transform: transform,
        position: "absolute" as const,
        maxWidth: `${widget_width - MARGIN * 2}px`,
        maxHeight: `${node_height - MARGIN * 2 - y}px`,
    };
}

function removeEmojis(name: string): string {
    return name.replace(
        /([\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F100}-\u{1F1FF}]|[\u{2460}-\u{24FF}])/gu,
        ''
    );
}

function get_node_name_by_id(id: string): string {
    const node = (app as any).graph._nodes_by_id[id];
    if (!node) return `id:${id}`;
    const name = node.title || node.name || node.type || "";
    return removeEmojis(name) + ' (' + id + ')';
}

function stripTrailingId(title: string): string {
    return title.replace(/ \(\d+\)$/, '');
}

class Timer {
    static all_times: TimerHistoryItem[] = [];
    static run_history: RunHistory = {}; // Store timings for each run
    static current_run_id: string | null = null; // ID for the current run
    static last_n_runs = 5; // Number of last runs to display
    static runs_since_clear = 0;
    static onChange: null | (() => void) = null;
    static searchTerm = '';
    static searchRegex = false;
    static nodeRunningStartTime: number | null = null; // Track when the current node started running
    static runningTimerInterval: number | null = null; // Interval ID for updating the running timer

    static saveToLocalStorage(): void {
        try {
            localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(Timer.all_times));
            localStorage.setItem(LOCALSTORAGE_KEY + '.settings', JSON.stringify({
                last_n_runs: Timer.last_n_runs
            }));
        } catch (e) {
            console.warn('Failed to save timer history:', e);
        }
    }

    static saveToStorage(): void {
        try {
            Timer.saveToLocalStorage();
            api.storeUserData('timer_run_history', {
                all_times: Timer.all_times,
                run_history: Timer.run_history,
                last_n_runs: Timer.last_n_runs,
                runs_since_clear: Timer.runs_since_clear
            }).catch((err: any) => {
                console.warn('Failed to save timer data to storage:', err);
            });
        } catch (e) {
            console.warn('Failed to save timer data to storage:', e);
        }
    }

    static loadFromLocalStorage(): void {
        try {
            const data = localStorage.getItem(LOCALSTORAGE_KEY);
            if (data) {
                const parsedData = JSON.parse(data);
                if (parsedData.length > 0 && Array.isArray(parsedData[0])) {
                    Timer.all_times = parsedData.map((item: any[]) => ({
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

            const settingsData = localStorage.getItem(LOCALSTORAGE_KEY + '.settings');
            if (settingsData) {
                const settings = JSON.parse(settingsData);
                if (settings.last_n_runs && typeof settings.last_n_runs === 'number') {
                    Timer.last_n_runs = settings.last_n_runs;
                }
            }
        } catch (e) {
            console.warn('Failed to load timer history:', e);
        }
    }

    static loadFromStorage(): void {
        try {
            // First load from localStorage as fallback
            Timer.loadFromLocalStorage();

            // Try to load data from storage API
            api.getUserData('timer_run_history').then((data: any) => {
                if (data && data.all_times) {
                    if (data.all_times.length > 0 && Array.isArray(data.all_times[0])) {
                        Timer.all_times = data.all_times.map((item: any[]) => ({
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
                if (Timer.onChange) Timer.onChange();
            }).catch((err: any) => {
                console.warn('Failed to load timer data from storage:', err);
            });
        } catch (e) {
            console.warn('Failed to load timer data from storage:', e);
        }
    }

    static clearStorage(): void {
        try {
            localStorage.removeItem(LOCALSTORAGE_KEY);
            localStorage.removeItem(LOCALSTORAGE_KEY + '.settings');
            api.deleteUserData('timer_run_history').catch((err: any) => {
                console.warn('Failed to clear timer data from storage:', err);
            });
            console.log('Timer data cleared from storage');
        } catch (e) {
            console.warn('Failed to clear timer data from storage:', e);
        }
    }

    static clear(): void {
        Timer.all_times = [];
        Timer.run_history = {};
        Timer.current_run_id = null;
        Timer.runs_since_clear = 0;
        if (Timer.onChange) Timer.onChange();
    }

    static setLastNRuns(value: number | string): number {
        const newValue = parseInt(value as string, 10);
        if (!isNaN(newValue) && newValue > 0) {
            Timer.last_n_runs = newValue;
            if (Timer.onChange) Timer.onChange();
        }
        return Timer.last_n_runs;
    }

    static start(): void {
        const t = (window as any).LiteGraph.getTime();
        Timer.current_run_id = Date.now().toString();
        Timer.run_history[Timer.current_run_id] = { nodes: {}, startTime: t };
        (Timer as any).startTime = t;
        (Timer as any).lastChangeTime = t;
        if (Object.keys(Timer.run_history).length > 20) {
            delete Timer.run_history[Object.keys(Timer.run_history)[0]];
        }
    }

    static _format(number: number, dp = 2): string {
        if (isNaN(number) || number === 0.0) {
            return " ";
        }
        return `${(number / 1000).toFixed(dp)}`;
    }

    static getCurrentRunTime(id: string): number {
        if (!Timer.current_run_id || !Timer.run_history[Timer.current_run_id]) {
            return 0;
        }

        const nodeData = Timer.run_history[Timer.current_run_id].nodes[id];
        if (!nodeData) {
            // If this is the currently running node, show running time
            if (id === (Timer as any).currentNodeId && Timer.nodeRunningStartTime) {
                const currentTime = (window as any).LiteGraph.getTime();
                return currentTime - Timer.nodeRunningStartTime;
            }
            return 0;
        }

        // If this node is currently running, return the running time instead of total time
        if (id === (Timer as any).currentNodeId && nodeData.runningTime !== undefined) {
            return nodeData.runningTime;
        }

        return nodeData.totalTime || 0;
    }

    static getLastNRunsAvg(id: string, n: number | null = null): number {
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

    static getRunTime(id: string, runId: string): number {
        return Timer.run_history[runId]?.nodes[id]?.totalTime || 0;
    }

    static updateRunningNodeTime(): void {
        if (!(Timer as any).currentNodeId || !Timer.nodeRunningStartTime) return;

        const currentTime = (window as any).LiteGraph.getTime();
        const elapsedTime = currentTime - Timer.nodeRunningStartTime;

        // Update the current run's node time temporarily for display purposes
        if (Timer.current_run_id && Timer.run_history[Timer.current_run_id]) {
            if (!Timer.run_history[Timer.current_run_id].nodes[(Timer as any).currentNodeId]) {
                Timer.run_history[Timer.current_run_id].nodes[(Timer as any).currentNodeId] = { count: 0, totalTime: 0 };
            }
            // Update the running time (this will be overwritten with the final time when node completes)
            Timer.run_history[Timer.current_run_id].nodes[(Timer as any).currentNodeId].runningTime = elapsedTime;

            // Trigger UI update
            if (Timer.onChange) Timer.onChange();
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
     * @typedef {Object} WebSocketLike
     * @property {string} url
     * @property {number} readyState
     * @property {number} bufferedAmount
     * @property {?function} onopen
     * @property {?function} onerror
     * @property {?function} onclose
     * @property {string} extensions
     * @property {string} protocol
     * @property {?function} onmessage
     * @property {string} binaryType
     * @property {number} CONNECTING
     * @property {number} OPEN
     * @property {number} CLOSING
     * @property {number} CLOSED
     * @property {function():void} close
     * @property {function(*):void} send
     * @property {function():void} constructor
     * @property {function(string, function, boolean=):void} addEventListener
     * @property {function(Event):boolean} dispatchEvent
     * @property {function(string, function, boolean=):void} removeEventListener
     * @property {function(string):Promise} when
     */

    /**
     * @typedef {Object} SetLike
     * @property {function(any):boolean} has
     * @property {function(any):SetLike} add
     * @property {function(any):boolean} delete
     * @property {function(SetLike):SetLike} difference
     * @property {function():void} clear
     * @property {function():IterableIterator<Array>} entries
     * @property {function(function, *):void} forEach
     * @property {function(SetLike):SetLike} intersection
     * @property {function(SetLike):boolean} isSubsetOf
     * @property {function(SetLike):boolean} isSupersetOf
     * @property {function(SetLike):boolean} isDisjointFrom
     * @property {number} size
     * @property {function(SetLike):SetLike} symmetricDifference
     * @property {function(SetLike):SetLike} union
     * @property {function():IterableIterator<any>} values
     * @property {function():IterableIterator<any>} keys
     * @property {function():void} constructor
     */

    /**
     * @typedef {Object} ComfyApiLike
     * @property {string} api_host
     * @property {string} api_base
     * @property {string} initialClientId
     * @property {string} clientId
     * @property {*} user
     * @property {WebSocketLike} socket
     * @property {SetLike} reportedUnknownMessageTypes
     * @property {function(number, any):Promise<any>} queuePrompt
     * @property {function():Promise<any>} getNodeDefs
     * @property {function(string):string} apiURL
     * @property {function():void} interrupt
     * @property {function():void} constructor
     * @property {function(string):string} internalURL
     * @property {function(string):string} fileURL
     * @property {function(string, Object=):Promise<any>} fetchApi
     * @property {function(string, function, Object=):void} addEventListener
     * @property {function(string, function, Object=):void} removeEventListener
     * @property {function(string, any, boolean=, boolean=, boolean=):void} dispatchCustomEvent
     * @property {function(Event):boolean} dispatchEvent
     * @property {function():Promise<any>} init
     * @property {function():Promise<any>} getExtensions
     * @property {function():Promise<any>} getWorkflowTemplates
     * @property {function():Promise<any>} getCoreWorkflowTemplates
     * @property {function():Promise<any>} getEmbeddings
     * @property {function():Promise<any>} getModelFolders
     * @property {function(string):Promise<any>} getModels
     * @property {function(string, string):Promise<any>} viewMetadata
     * @property {function(string):Promise<any>} getItems
     * @property {function():Promise<any>} getQueue
     * @property {function(number=):Promise<any>} getHistory
     * @property {function():Promise<any>} getSystemStats
     * @property {function(string, any):Promise<any>} deleteItem
     * @property {function(string):Promise<any>} clearItems
     * @property {function():Promise<any>} getUserConfig
     * @property {function(string):Promise<any>} createUser
     * @property {function():Promise<any>} getSettings
     * @property {function(string):Promise<any>} getSetting
     * @property {function(Object):Promise<any>} storeSettings
     * @property {function(string, any):Promise<any>} storeSetting
     * @property {function(string, Object=):Promise<any>} getUserData
     * @property {function(string, any, Object=):Promise<any>} storeUserData
     * @property {function(string):Promise<any>} deleteUserData
     * @property {function(string, string, Object=):Promise<any>} moveUserData
     * @property {function(string):Promise<any>} listUserDataFullInfo
     * @property {function():Promise<any>} getLogs
     * @property {function():Promise<any>} getRawLogs
     * @property {function(boolean):void} subscribeLogs
     * @property {function():Promise<any>} getFolderPaths
     * @property {function():Promise<any>} getCustomNodesI18n
     * @property {function():Promise<any>} when
     */

    /**
     * @typedef {Object} ComfyTickEvent
     * @property {boolean} isTrusted
     * @property {number} detail
     * @property {function(string=, any=, boolean=, boolean=, boolean=):void} initCustomEvent
     * @property {function():void} constructor
     * @property {string} type
     * @property {ComfyApiLike} target
     * @property {ComfyApiLike} currentTarget
     * @property {number} eventPhase
     * @property {boolean} bubbles
     * @property {boolean} cancelable
     * @property {boolean} defaultPrevented
     * @property {boolean} composed
     * @property {number} timeStamp
     * @property {ComfyApiLike} srcElement
     * @property {boolean} returnValue
     * @property {boolean} cancelBubble
     * @property {number} NONE
     * @property {number} CAPTURING_PHASE
     * @property {number} AT_TARGET
     * @property {number} BUBBLING_PHASE
     * @property {function():Array<EventTarget>} composedPath
     * @property {function(string, boolean=, boolean=):void} initEvent
     * @property {function():void} preventDefault
     * @property {function():void} stopImmediatePropagation
     * @property {function():void} stopPropagation
     */

    /**
     * Handles execution tick events from ComfyApi.
     * @param {ComfyTickEvent} e
     */
    static executing(e) {
        if (e.detail == Timer?.currentNodeId) return;
        const node_name = get_node_name_by_id(e.type)

        const t = LiteGraph.getTime();
        const unix_t = Math.floor(t / 1000);

        // Clear any existing running timer interval
        if (Timer.runningTimerInterval) {
            clearInterval(Timer.runningTimerInterval);
            Timer.runningTimerInterval = null;
        }

        Timer.add_timing(Timer.currentNodeId ? Timer.currentNodeId : "startup", t - Timer.lastChangeTime)

        Timer.lastChangeTime = t;
        Timer.currentNodeId = e.detail;
        Timer.nodeRunningStartTime = t; // Set the start time for the running node

        if (!Timer.currentNodeId) Timer.add_timing("total", t - Timer.startTime)

        // Start a timer to update the display while node is running
        if (Timer.currentNodeId) {
            Timer.runningTimerInterval = setInterval(() => {
                Timer.updateRunningNodeTime();
            }, 100); // Update every 100ms
        }

        if (Timer.onChange) Timer.onChange();
    }

    // --- Timer Utility Functions ---

    static getCurrentRunTime(id) {
        if (!Timer.current_run_id || !Timer.run_history[Timer.current_run_id]) {
            return 0;
        }

        const nodeData = Timer.run_history[Timer.current_run_id].nodes[id];
        if (!nodeData) {
            // If this is the currently running node, show running time
            if (id === Timer.currentNodeId && Timer.nodeRunningStartTime) {
                const currentTime = LiteGraph.getTime();
                return currentTime - Timer.nodeRunningStartTime;
            }
            return 0;
        }

        // If this node is currently running, return the running time instead of total time
        if (id === Timer.currentNodeId && nodeData.runningTime !== undefined) {
            return nodeData.runningTime;
        }

        return nodeData.totalTime || 0;
    }

    static getLastNRunsAvg(id: string, n: number | null = null): number {
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

    static getRunTime(id: string, runId: string): number {
        return Timer.run_history[runId]?.nodes[id]?.totalTime || 0;
    }

    static updateRunningNodeTime() {
        if (!Timer.currentNodeId || !Timer.nodeRunningStartTime) return;

        const currentTime = LiteGraph.getTime();
        const elapsedTime = currentTime - Timer.nodeRunningStartTime;

        // Update the current run's node time temporarily for display purposes
        if (Timer.current_run_id && Timer.run_history[Timer.current_run_id]) {
            if (!Timer.run_history[Timer.current_run_id].nodes[Timer.currentNodeId]) {
                Timer.run_history[Timer.current_run_id].nodes[Timer.currentNodeId] = { count: 0, totalTime: 0 };
            }
            // Update the running time (this will be overwritten with the final time when node completes)
            Timer.run_history[Timer.current_run_id].nodes[Timer.currentNodeId].runningTime = elapsedTime;

            // Trigger UI update
            if (Timer.onChange) Timer.onChange();
        }
    }

            static add_timing(id: string, dt: number): void {
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
     * Custom tick handler function
     * @param {any} x - Event object
     */
    static tick(x: any): void {
        if (x.detail == (Timer as any).currentNodeId) return;
        console.log(`cg-quicknodes: ${(x.type)} ${(x.detail)}`, x);

        const t = (window as any).LiteGraph.getTime();

        Timer.add_timing((Timer as any).currentNodeId ? (Timer as any).currentNodeId : "startup", t - (Timer as any).lastChangeTime)

        (Timer as any).lastChangeTime = t;
        (Timer as any).currentNodeId = x.detail;

        // Start tracking running time for the new node
        Timer.nodeRunningStartTime = t;

        // Setup interval to update running time
        if (Timer.runningTimerInterval) {
            clearInterval(Timer.runningTimerInterval);
        }
        Timer.runningTimerInterval = window.setInterval(Timer.updateRunningNodeTime, 100);

        if (!(Timer as any).currentNodeId) {
            Timer.add_timing("total", t - (Timer as any).startTime);
            // Clear the running timer interval when workflow completes
            if (Timer.runningTimerInterval) {
                clearInterval(Timer.runningTimerInterval);
                Timer.runningTimerInterval = null;
            }

            // Save data after each complete run
            Timer.saveToStorage();
        }

        if (Timer.onChange) Timer.onChange();
    }

    /**
     * Progress event handler
     * @param {any} x - Event object
     */
    static progress(x: any): void {
        // Not implemented in the TypeScript version
    }

    /**
     * Set search term for filtering
     * @param {string} term - Search term
     */
    static setSearchTerm(term: string): void {
        Timer.searchTerm = term;
        if (Timer.onChange) Timer.onChange();
    }

    /**
     * Toggle regex search
     * @param {boolean} useRegex - Whether to use regex
     */
    static setSearchRegex(useRegex: boolean): void {
        Timer.searchRegex = useRegex;
        if (Timer.onChange) Timer.onChange();
    }

    /**
     * Handler for execution start event
     * @param {any} e - Event object
     */
    static executionStart(e: any): void {
        // Implementation for execution start
    }

    /**
     * Handler for execution success event
     * @param {any} e - Event object
     */
    static executionSuccess(e: any): void {
        const t = (window as any).LiteGraph.getTime();

        // Clear the running timer interval
        if (Timer.runningTimerInterval) {
            clearInterval(Timer.runningTimerInterval);
            Timer.runningTimerInterval = null;
        }

        if (Timer.current_run_id && Timer.run_history[Timer.current_run_id]) {
            Timer.run_history[Timer.current_run_id].endTime = t;
            Timer.run_history[Timer.current_run_id].totalTime = t - Timer.run_history[Timer.current_run_id].startTime;

            // Clean up old runs if we have too many
            const runIds = Object.keys(Timer.run_history);
            if (runIds.length > 20) { // Keep max 20 runs in history
                const oldestRunId = runIds.sort()[0];
                delete Timer.run_history[oldestRunId];
            }
        }

        // Reset node running start time
        Timer.nodeRunningStartTime = null;

        if (Timer.onChange) Timer.onChange();
    }

            static html(scope: string | undefined): HTMLElement {
        // Search/filter UI
        const searchInput = $el("input", {
            type: "text",
            placeholder: "Quick search...",
            value: Timer.searchTerm,
            style: { marginRight: "8px", width: "150px" },
            oninput: (e: any) => {
                console.log('html.search.oninput');
                Timer.searchTerm = e.target.value;
                if (Timer.onChange) Timer.onChange();
            },
            onenter: (e: any) => {
                console.log('html.search.onenter');
            },
            // Prevent ComfyUI/global key handlers while typing here
            onkeydown: (e: any) => {
                console.log('html.search.onkeydown');
                if (e.key === "Enter" || e.key === "Escape")
                    e.stopPropagation();
            },
            onkeyup: (e: any) => {
                e.stopPropagation();
            },
            onkeypress: (e: any) => {
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
                    const cells = Array.from(row.querySelectorAll('th, td'));
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
        const tableHeader = [$el("th", {className: "node", "textContent": "Node"}),
            $el("th", {className: "runs", "textContent": "Runs"}),
            $el("th", {className: "per-run", "textContent": "Per run"}),
            $el("th", {className: "per-flow", "textContent": "Per flow"}),
            $el('th', {className: "current-run", "textContent": "Current run"})
        ];

        // Add individual columns for each of the last n runs
        const runIds = Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs);
        const actualRuns = Math.min(runIds.length, Timer.last_n_runs);
        let runNumber = 1;
        for (let i = actualRuns - 1; i > 0; i--) {
            tableHeader.push($el('th', {className: "run-" + runNumber, "textContent": `Run ${runNumber}`}));
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
                    filterFunc = (node_data) => re.test(get_node_name_by_id(node_data.id));
                } catch {
                    filterFunc = () => true; // Don't filter if regex is broken
                }
            } else {
                const searchLower = Timer.searchTerm.toLowerCase();
                filterFunc = (node_data) =>
                    get_node_name_by_id(node_data.id).toLowerCase().includes(searchLower);
            }
        }

        Timer.all_times.forEach((node_data) => {
            if (!filterFunc(node_data)) return;
            const t = node_data.id;

            const rowCells = [
                $el("td", {className: "node", textContent: get_node_name_by_id(node_data.id)}),
                $el("td", {className: "runs", "textContent": node_data.runs.toString()}),
                $el("td", {className: "per-run", "textContent": Timer._format(node_data.avgPerRun)}),
                $el("td", {className: "per-flow", "textContent": Timer._format(node_data.avgPerFlow)}),
                $el('td', {className: "current-run", "textContent": Timer._format(Timer.getCurrentRunTime(t))})
            ];

            // Add individual cells for each of the last n runs
            const runIds = Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs);
            const actualRuns = Math.min(runIds.length, Timer.last_n_runs);

            // Add cells for actual runs
            for (let i = actualRuns - 1; i > 0; i--) {
                const runId = runIds[i];
                const runTime = runId && Timer.run_history[runId]?.nodes[t]?.totalTime || 0;
                rowCells.push($el('td', {className: "run-" + (i + 1), "textContent": Timer._format(runTime)}));
            }

            // Add empty cells for missing runs
            for (let i = actualRuns; i < Timer.last_n_runs; i++) {
                rowCells.push($el('td', {className: "run-" + (i + 1), "textContent": "-"}));
            }

            table.append($el("tr", rowCells));
        });

        // Return just the table if scope is "table"
        if (scope === "table") {
            return table;
        }

        // Top-level div with search UI and table
        return $el("div", {
            className: "cg-timer-widget",
        }, [
            $el("div", {
                className: "cg-timer-search",
                style: {marginBottom: "6px"}
            }, [
                searchInput,
                regexCheckbox,
                regexLabel,
            ]),
            copyButton,
            $el("div", {
                className: "cg-timer-table-wrapper",
            }, [ table ])
        ]);
    }
}

app.registerExtension({
    name: "cg.quicknodes.timer",
    setup: function () {
        // Import styles from module and inject them directly into the DOM
        import("./timer-styles.js").then(({ injectTimerStyles }) => {
            injectTimerStyles();
        }).catch(err => {
            console.error("Failed to load timer styles:", err);
        });

        Timer.loadFromLocalStorage(); // <--- Load history on startup
        (window as any).Timer = Timer;
        api.addEventListener("executing", Timer.executing);
        api.addEventListener("execution_start", Timer.executionStart);
        api.addEventListener("execution_success", Timer.executionSuccess)
        console.log('cg.quicknodes.timer registered');
    },
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeType.comfyClass === "Timer") {
            const orig_executionStart = nodeType.prototype.onExecutionStart;
            nodeType.prototype.onExecutionStart = function () {
                orig_executionStart?.apply(this, arguments);
                Timer.start();
            }

            const orig_nodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                orig_nodeCreated?.apply(this, arguments);

                // ComfyNode
                // console.log('cg.quicknodes.timer.onNodeCreated', this);
                this.addWidget("button", "clear", "", Timer.clear);

                // Add Save button
                this.addWidget("button", "save", "", () => {
                    Timer.saveToLocalStorage();
                });

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
                }, { min: 1, max: 20, step: 10, precision: 0 });

                // Create a properly styled HTML widget that stays aligned with the node
                const widget = {
                    type: "HTML",
                    name: "flying",
                    draw: function (ctx, node, widget_width, y, widget_height) {
                        Object.assign(this.inputEl.style, get_position_style(ctx, this.inputEl.scrollWidth, widget_width, y, node.size[0], node.size[1]));
                    },
                    onRemoved: function() {
                        // Clean up
                        if (this.inputEl) this.inputEl.remove();
                    }
                };

                // Create container with proper styling
                widget.inputEl = $el("div", {
                    className: "cg-timer-container",
                }, [$el("span", "Loading...")]);

                // Add to DOM at the right place - directly to body but will be positioned correctly
                document.body.appendChild(widget.inputEl);

                this.addCustomWidget(widget);

                // Make sure widget is cleaned up when node is removed
                this.onRemoved = function () {
                    widget.inputEl.remove();
                };

                this.serialize_widgets = false;

                Timer.onChange = function () {
                    const existingTable = widget.inputEl.querySelector('.cg-timer-table');
                    if (existingTable) {
                        existingTable.parentNode.replaceChild(Timer.html('table'), existingTable);
                    } else {
                        widget.inputEl.replaceChild(Timer.html(), widget.inputEl.firstChild);
                    }
                }
                setTimeout(Timer.onChange, 1000);
            };
        }
    },
});

export {
    Timer,
    get_position_style,
    removeEmojis,
    get_node_name_by_id,
    stripTrailingId,
};