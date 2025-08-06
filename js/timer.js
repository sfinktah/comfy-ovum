import { app } from '../../scripts/app.js'
import {api} from "../../scripts/api.js";
import { ComfyWidgets } from "../../scripts/widgets.js";
import {$el} from "../../scripts/ui.js";

const MARGIN = 8;

const LOCALSTORAGE_KEY = 'cg.quicknodes.timer.history';

function get_position_style(ctx, scroll_width, widget_width, y, node_width, node_height) {
    const visible = app.canvas.ds.scale > 0.5;
    const margin = 0;
    const elRect = ctx.canvas.getBoundingClientRect();
    // console.log(elRect);
    const transform = new DOMMatrix()
        .scaleSelf(elRect.width / ctx.canvas.width, elRect.height / ctx.canvas.height)
        .multiplySelf(ctx.getTransform())
        .translateSelf(margin, margin + y);


    const x = 50; // Math.max(0, Math.round(ctx.getTransform().a*(node_width - scroll_width - 2*MARGIN)/2));
    return {
        transformOrigin: '0 0',
        transform: transform,
        left: `50px`,
        top: `50px`,
        position: "absolute",
        maxWidth: `${widget_width - MARGIN * 2}px`,
        maxHeight: `${node_height - MARGIN * 2 - y}px`,
        width: `auto`,
        height: `auto`,
        overflow: `auto`,
    }
}

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

function stripTrailingId(title) {
    // Remove trailing ' (123)' from the title
    return title.replace(/ \(\d+\)$/, '');
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


    static saveToLocalStorage() {
        try {
            localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(Timer.all_times));
            localStorage.setItem(LOCALSTORAGE_KEY + '.settings', JSON.stringify({
                last_n_runs: Timer.last_n_runs
            }));
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
                runs_since_clear: Timer.runs_since_clear
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
                Timer.all_times = JSON.parse(data);
            }

            // Load settings
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

    static loadFromStorage() {
        try {
            // First load from localStorage as fallback
                Timer.loadFromStorage();

            // Try to load data from storage API
            api.getUserData('timer_run_history').then(data => {
                if (data && data.all_times) {
                    Timer.all_times = data.all_times;
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
            }).catch(err => {
                console.warn('Failed to load timer data from storage:', err);
            });
        } catch (e) {
            console.warn('Failed to load timer data from storage:', e);
        }
    }

    static clear() {
        Timer.all_times = [];
        Timer.run_history = {};
        Timer.current_run_id = null;
        Timer.runs_since_clear = 0;
        if (Timer.onChange) Timer.onChange();
    }

    static setLastNRuns(value) {
        const newValue = parseInt(value);
        if (!isNaN(newValue) && newValue > 0) {
            Timer.last_n_runs = newValue;
            if (Timer.onChange) Timer.onChange();
        }
        return Timer.last_n_runs;
    }

    static start() {
        const t = LiteGraph.getTime();
        Timer.current_run_id = Date.now().toString(); // Generate unique run ID
        Timer.run_history[Timer.current_run_id] = { nodes: {}, startTime: t };
        Timer.startTime = t;
        Timer.lastChangeTime = t;
        if (Object.keys(Timer.run_history).length > 20) {
            delete Timer.run_history[Object.keys(Timer.run_history)[0]]
        }
    }

    static _format(number, dp = 2) {
        if (isNaN(number) || number === 0.0) {
            return " ";
        }
        return `${(number / 1000).toFixed(dp)}`
    }

    static getCurrentRunTime(id) {
        if (!Timer.current_run_id || !Timer.run_history[Timer.current_run_id] || !Timer.run_history[Timer.current_run_id].nodes[id]) {
            return 0;
        }
        return Timer.run_history[Timer.current_run_id].nodes[id].totalTime;
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
        var this_node_data = Timer.all_times.find((node_data) => node_data[0] == id);
        if (!this_node_data) {
            this_node_data = [id, 0, 0, 0, 0];
            Timer.all_times.push(this_node_data);
        }
        this_node_data[1] += 1;
        if (!Timer.runs_since_clear || this_node_data[1] > Timer.runs_since_clear) Timer.runs_since_clear = this_node_data[1]
        this_node_data[2] += dt;
        this_node_data[3] = this_node_data[2] / this_node_data[1];

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
        console.log(`cg-quicknodes: ${(e.type)} ${node_name}`, e);

        const t = LiteGraph.getTime();
        const unix_t = Math.floor(t / 1000);

        Timer.add_timing(Timer.currentNodeId ? Timer.currentNodeId : "startup", t - Timer.lastChangeTime)

        Timer.lastChangeTime = t;
        Timer.currentNodeId = e.detail;

        if (!Timer.currentNodeId) Timer.add_timing("total", t - Timer.startTime)

        if (Timer.onChange) Timer.onChange();
    }

    static executionStart(e) {

    }

    static executionSuccess(e) {
        const t = LiteGraph.getTime();
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
            "textAlign": "right",
            "border": "1px solid",
            "className": "cg-timer-table"
        }, [
            $el("tr", tableHeader)
        ]);

        // Compute per-flow
        Timer.all_times.forEach((node_data) => {
            node_data[4] = node_data[2] / Timer.runs_since_clear;
        });
        // Sort descending by per-flow
        Timer.all_times.sort((a, b) => b[4] - a[4]);

        // Build filter
        let filterFunc = () => true;
        if (Timer.searchTerm) {
            if (Timer.searchRegex) {
                let re;
                try {
                    re = new RegExp(Timer.searchTerm, "i");
                    filterFunc = (node_data) => re.test(get_node_name_by_id(node_data[0]));
                } catch {
                    filterFunc = () => true; // Don't filter if regex is broken
                }
            } else {
                const searchLower = Timer.searchTerm.toLowerCase();
                filterFunc = (node_data) =>
                    get_node_name_by_id(node_data[0]).toLowerCase().includes(searchLower);
            }
        }

        Timer.all_times.forEach((node_data) => {
            if (!filterFunc(node_data)) return;
            const t = node_data[0];

            const rowCells = [
                $el("td", {className: "node", textContent: get_node_name_by_id(node_data[0])}),
                $el("td", {className: "runs", "textContent": node_data[1].toString()}),
                $el("td", {className: "per-run", "textContent": Timer._format(node_data[3])}),
                $el("td", {className: "per-flow", "textContent": Timer._format(node_data[4])}),
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
            table
        ]);
    }
}

app.registerExtension({
    name: "cg.quicknodes.timer",
    setup: function () {
        Timer.loadFromLocalStorage(); // <--- Load history on startup
        window.Timer = Timer;
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

                this.addWidget("button", "clear", "", Timer.clear);

                // Add Save button
                this.addWidget("button", "save", "", () => {
                    Timer.saveToLocalStorage();
                });

                // Add Storage button
                this.addWidget("button", "store", "", () => {
                    Timer.saveToStorage();
                });

                // Add a number input to control how many last runs to display
                this.addWidget("number", "Last runs to show", Timer.last_n_runs, (v) => {
                    return Timer.setLastNRuns(v);
                }, { min: 1, max: 20, step: 10, precision: 0 });

                this.ageHandle = this.addWidget("number", "Age", 28, function () {
                    console.log("age modified", this)
                }, {min: 0, max: 100, step: 10, precision: 0})

                const widget = {
                    type: "HTML",
                    name: "flying",
                    draw: function (ctx, node, widget_width, y, widget_height) {
                        Object.assign(this.inputEl.style, get_position_style(ctx, this.inputEl.scrollWidth, widget_width, y, node.size[0], node.size[1]));
                    },
                };
                widget.inputEl = $el("div", [$el("span"),]);

                document.body.appendChild(widget.inputEl);

                this.addCustomWidget(widget);
                this.onRemoved = function () {
                    widget.inputEl.remove();
                };
                this.serialize_widgets = false;

                Timer.onChange = function () {
                    // .cg-timer-table
                    
                    const existingTable = widget.inputEl.querySelector('.cg-timer-table');
                    if (existingTable) {
                        existingTable.parentNode.replaceChild(Timer.html('table'), existingTable);
                    } else {
                        widget.inputEl.replaceChild(Timer.html(), widget.inputEl.firstChild);
                    }
                    //this.onResize?.(this.size);
                }

                // Mount the element inside the node
                // this.addCustomWidget(htmlWidget);

                // // Add to widget area inside node
                // if (this.widget_area) {
                //     this.widget_area.appendChild(htmlWidget.htmlEl);
                // } else {
                //     // fallback: attach to node's main DOM element if available (depends on ComfyUI version)
                //     if (this.el) this.el.appendChild(htmlWidget.htmlEl);
                //     else document.body.appendChild(htmlWidget.htmlEl); // fallback (shouldn't be needed)
                // }
                //
                // // Clean up when node is removed
                // this.onRemoved = function () {
                //     htmlWidget.htmlEl.remove();
                // };
                // this.serialize_widgets = false; // don't auto-save widget state
            };
        }
    },

})

