/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */

import { api } from "../../scripts/api.js";
/** @type {ComfyApp} */
import { app } from "../../scripts/app.js";
import { $el } from "../../scripts/ui.js";
import { ComfyWidgets } from "../../scripts/widgets.js";
import { print_r } from "./print_r.js";
// Timer styles will be dynamically imported in the setup function
// import _ from "./lodash";

const MARGIN = 8;

const LOCALSTORAGE_KEY = 'cg.quicknodes.timer.history';

function removeEmojis(name) {
    const nameNoEmojis = name.replace(
        /([\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F100}-\u{1F1FF}]|[\u{2460}-\u{24FF}])/gu,
        ''
    );

    return nameNoEmojis;
}

function get_node_name_by_id(id) {
    const node = app.graph._nodes_by_id[id];
    if (!node) return `id:${id}`;
    const name = node.title || node.name || node.type || "";

    // RegExp to remove most common Unicode emoji/emoticon characters
    return removeEmojis(name) + ' (' + id + ')';
}

function doesNodeBelongToUs(id) {
    const node = app.graph._nodes_by_id[id];
    if (!node) return false;
}

function stripTrailingId(title) {
    // Remove trailing ' (123)' from the title
    return title.replace(/ \(\d+\)$/, '');
}

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
            deltaY: -e.deltaY, // Invert the deltaY to fix the wheel direction
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

// Tooltip library loader (Tippy.js via CDN) and thin wrapper
let __tippyLoader = null;
function ensureTooltipLib() {
    if (window.tippy) return Promise.resolve();
    if (__tippyLoader) return __tippyLoader;

    __tippyLoader = new Promise((resolve, reject) => {
        try {
            // Load CSS
            const cssHref = "https://unpkg.com/tippy.js@6/dist/tippy.css";
            if (!document.querySelector(`link[href="${cssHref}"]`)) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = cssHref;
                document.head.appendChild(link);
            }

            // Load Popper
            const popperSrc = "https://unpkg.com/@popperjs/core@2/dist/umd/popper.min.js";
            const tippySrc = "https://unpkg.com/tippy.js@6/dist/tippy.umd.min.js";

            function loadScript(src) {
                return new Promise((res, rej) => {
                    if (document.querySelector(`script[src="${src}"]`)) return res();
                    const s = document.createElement('script');
                    s.src = src;
                    s.async = true;
                    s.onload = () => res();
                    s.onerror = (e) => rej(new Error(`Failed to load ${src}`));
                    document.head.appendChild(s);
                });
            }

            loadScript(popperSrc)
                .then(() => loadScript(tippySrc))
                .then(() => resolve())
                .catch(reject);
        } catch (e) {
            reject(e);
        }
    });

    return __tippyLoader;
}

// Wrapper that uses the loaded tippy library; content is resolved on show
function attachTooltip(el, textOrFn, delay = 1000) {
    ensureTooltipLib().then(() => {
        if (!el || !window.tippy) return;
        window.tippy(el, {
            content: '',
            delay: [delay, 0],
            allowHTML: true,
            theme: 'light-border',
            interactive: false,
            placement: 'bottom-start',
            onShow(instance) {
                try {
                    const content = (typeof textOrFn === 'function') ? textOrFn() : textOrFn;
                    instance.setContent(content || '');
                } catch (e) {
                    instance.setContent('');
                }
            }
        });
    }).catch(err => {
        console.warn('Tooltip library failed to load:', err);
    });
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
    static hidden = []; // e.g., ['display:runs','copy:per-flow','both:current-run','per-run'] (bare means both)
    static ctrlDown = false; // Track Control key state for deletion UI
    static maxRuns = 40; // Maximum saved & displayed runs

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
     * @typedef {Object} ComfyNode
     * @property {string} type
     * @property {string} name
     * @property {string} title
     * @property {Array<any>} widgets
     * @property {Array<number>} size
     * @property {function} addWidget
     * @property {function} addCustomWidget
     * @property {function} addDOMWidget
     * @property {function} onRemoved
     * @property {HTMLElement} widget_area
     * @property {boolean} serialize_widgets
     */

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
        let detail = e.detail;

        if (typeof detail === "string") {
            const match = detail.match(/^\d+:(\d+)$/);
            detail = match ? match[1] : detail;
        }

        if (detail === Timer?.currentNodeId) return;
        const node_name = get_node_name_by_id(detail);

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
            const timerNodes = app.graph._nodes.filter(node => node.type === "Timer");
            if (timerNodes.length > 0) {
                const timerNode = timerNodes[0];
                // Python-created widget for queued input
                const queuedInputWidget = timerNode.widgets?.find(w => w.name === "Run notes (for queued run)");
                const queuedText = queuedInputWidget?.value ?? "";
                // Set JS field "Notes from queue"
                const queueJsWidget = timerNode.widgets?.find(w => w.name === "Notes from queue");
                if (queueJsWidget) {
                    queueJsWidget.value = queuedText || "";
                }
                // Ensure we have a run id
                if (!Timer.current_run_id) {
                    Timer.current_run_id = Date.now().toString();
                }
                if (queuedText && Timer.current_run_id) {
                    const existing = Timer.run_notes[Timer.current_run_id] || "";
                    const combined = existing ? `${queuedText}\n${existing}` : queuedText;
                    Timer.run_notes[Timer.current_run_id] = combined;
                }
                timerNode.setDirtyCanvas?.(true);
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
            const timerNodes = app.graph._nodes.filter(node => node.type === "Timer");
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
                $el("td", {className: "node", textContent: get_node_name_by_id(node_data.id)})
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
            }, [ table ]),
            $el("div", {
                className: "cg-timer-notes-list-wrapper",
                style: { marginTop: "10px" }
            }, [
                $el("h4", { textContent: "Run Notes" }),
                notesListEl
            ])
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
            const orig_executionStart = nodeType.prototype.onExecutionStart;
            nodeType.prototype.onExecutionStart = function () {
                orig_executionStart?.apply(this, arguments);
                Timer.start();
            }

            const orig_nodeCreated = nodeType.prototype.onNodeCreated;
            /**
             * @this {ComfyNode}
             */
            nodeType.prototype.onNodeCreated = function () {
                console.log('beforeRegisterNodeDef.onNodeCreated', this);
                orig_nodeCreated?.apply(this, arguments);

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

                inputEl.addEventListener('input', () => {
                    callback?.(widget.value)
                    widget.callback?.(widget.value)
                })
                widget.onRemove = () => {
                    inputEl.remove()
                }

                this.serialize_widgets = false;

                Timer.onChange = function () {
                    // Rebuild entire content so both table and notes list update
                    const container = widget.inputEl;
                    const newContent = Timer.html();
                    if (container.firstChild) {
                        container.replaceChild(newContent, container.firstChild);
                    } else {
                        container.appendChild(newContent);
                    }
                    //this.onResize?.(this.size);
                }
                setTimeout(() => {
                    Timer.onChange();
                    // Forward wheel events to canvas when Ctrl is pressed
                    forwardWheelToCanvas(widget.inputEl, app.canvas.canvas);
                }, 100);
            };
        }
    },

})

