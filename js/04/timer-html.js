import {$el} from "../common/ui.js";
import {onCopyButton, onCopyGraphData, onUploadGraphData} from "../01/copyButton.js";
import {Logger} from "../common/logger.js";
import {attachTooltip} from "../01/tooltipHelpers.js";
import {uniq} from "../01/graphHelpers.js";

// Define global tips array (can be overridden elsewhere before this file runs)
if (!Array.isArray(window.OVUM_TIPS)) {
    window.OVUM_TIPS = [
        "Hold Control while clicking on a \"RUN\" heading to delete that run.",
        "Double-click a \"RUN\" heading to edit/insert a note for that run.",
        "Green/red text indicates cuDNN has been enabled/disabled by an Ovum cuDNN node.",
        "Timing data can be retrieved via the <code>/ovum/get-timing</code> endpoint.",
        "Timing history is stored in your browser\'s LocalStorage."
    ];
}

export function html_impl(scope) {
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
        textContent: "Copy as text",
        onclick: onCopyButton
    }); // onCopyGraphData

    const copyGraphDataButton = $el("button", {
        textContent: "Copy as JSON",
        onclick: onCopyGraphData
    }); // onCopyGraphData

    // const uploadGraphDataButton = $el("button", {
    //     textContent: "Upload Graph Data",
    //     onclick: onUploadGraphData
    // });


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
    if (!Timer.isHidden('per-run', 'display')) tableHeader.push($el("th", {
        className: "per-run",
        "textContent": "Per run"
    }));
    if (!Timer.isHidden('per-flow', 'display')) tableHeader.push($el("th", {
        className: "per-flow",
        "textContent": "Per flow"
    }));
    if (!Timer.isHidden('current-run', 'display')) tableHeader.push($el('th', {
        className: "current-run",
        "textContent": "Current run"
    }));

    // Prepare attributes for header <tr> that map displayed run indices to true run numbers
    const allRunIdsAsc = Object.keys(Timer.run_history).sort(); // chronological list of all runs

    // Add individual columns for each of the last n runs
    const lastNRunIds = Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs); // -1 to exclude the current run
    if (Timer.debug) Logger.log({
        class: 'ovum.timer',
        method: 'html',
        severity: 'debug',
        tag: 'flow',
        nodeName: 'ovum.timer'
    }, '[Timer] lastNRunIds', lastNRunIds);
    const lastNRunCount = Math.min(lastNRunIds.length, Timer.last_n_runs);
    if (Timer.debug) Logger.log({
        class: 'ovum.timer',
        method: 'html',
        severity: 'debug',
        tag: 'flow',
        nodeName: 'ovum.timer'
    }, '[Timer] lastNRunCount', lastNRunCount);
    let displayedRunNumber = 1;
    for (let i = lastNRunCount - 1; i >= 0; i--) {
        const runId = lastNRunIds[i];

        // Compute the true chronological run number (1-based)
        const trueRunNumber = allRunIdsAsc.indexOf(runId) + 1;

        /** @type {HTMLTableCellElement} */
        const th = $el('th', {
            className: "run-n",
            textContent: Timer.run_notes[runId] ? `* Run ${displayedRunNumber}` : `Run ${displayedRunNumber}`,
            dataset: {trueRunNumber},
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
        const rh = Timer.run_history[runId] || {};
        const sysStartMs = rh.systemStartTime;
        const lgStart = rh.startTime;
        const lgEnd = rh.endTime;
        const startDate = (typeof sysStartMs === 'number') ? new Date(sysStartMs) : null;
        let endDate = null;
        if (startDate && typeof lgEnd === 'number' && typeof lgStart === 'number') {
            const delta = lgEnd - lgStart;
            if (!isNaN(delta)) endDate = new Date(sysStartMs + delta);
        }
        const startStr = startDate ? startDate.toLocaleString() : 'Unknown';
        const endStr = endDate ? endDate.toLocaleString() : (typeof lgEnd === 'number' ? 'Unknown' : 'In progress');
        const noteRaw = Timer.run_notes[runId] || "No run notes";
        function escapeHtml(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
        const noteEscaped = escapeHtml(noteRaw).replace(/\r?\n/g, "<br>");
        const notesTextHtml = `${noteEscaped}<br><br>Start: ${escapeHtml(startStr)}<br>End: ${escapeHtml(endStr)}`;
        attachTooltip(th, () => notesTextHtml, 1000);

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
    if (Timer.debug) Logger.log({
        class: 'ovum.timer',
        method: 'html',
        severity: 'debug',
        tag: 'flow',
        nodeName: 'ovum.timer'
    }, "[Timer] currentRunHistory: ", currentRunHistory);
    if (Timer.debug) Logger.log({
        class: 'ovum.timer',
        method: 'html',
        severity: 'debug',
        tag: 'flow',
        nodeName: 'ovum.timer'
    }, "[Timer] runNodeIds: ", runNodeIds);
    const currentNodeIds = uniq(runNodeIds); // this.getUniqueNodeIds(runNodeIds);
    if (Timer.debug) Logger.log({
        class: 'ovum.timer',
        method: 'html',
        severity: 'debug',
        tag: 'flow',
        nodeName: 'ovum.timer'
    }, "[Timer] currentNodeIds: ", currentNodeIds);

    const averagesByK = (function averageByK(lastNRunIds) {
        const sums = Object.create(null);
        const counts = Object.create(null);

        for (const id of lastNRunIds) {
            const nodes = Timer.run_history[id]?.nodes;
            if (!nodes) {
                if (Timer.debug) Logger.log({
                    class: 'ovum.timer',
                    method: 'html',
                    severity: 'debug',
                    tag: 'flow',
                    nodeName: 'ovum.timer'
                }, `[Timer] [averagesByK] No nodes found for run ${id}`);
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
                dataset: {trueRunNumber}
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
    const notesListEl = $el("div", {className: "cg-timer-notes-list"});

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
    const notesHeader = $el("h4", {textContent: "Run Notes"});

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
            // uploadGraphDataButton,
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
            (function(){
                // Create status-left and initialize rotating tips
                const statusLeft = $el("div", { className: "cg-status-left" });
                function setTipNow() {
                    try {
                        const tips = Array.isArray(window.OVUM_TIPS) ? window.OVUM_TIPS : [];
                        if (!tips.length) return;
                        const idxRaw = (typeof window.OVUM_TIPS_INDEX === "number" ? window.OVUM_TIPS_INDEX : 0);
                        const idx = ((idxRaw % tips.length) + tips.length) % tips.length;
                        const el = document.querySelector('.cg-status-left') || statusLeft;
                        el.innerHTML = String(tips[idx]);
                        window.OVUM_TIPS_INDEX = (idx + 1) % tips.length;
                    } catch (_) { /* noop */ }
                }
                // Set immediately
                setTipNow();
                // Ensure a single global interval updates the tip roughly every minute
                if (!window.OVUM_TIPS_INTERVAL) {
                    window.OVUM_TIPS_INTERVAL = setInterval(setTipNow, 60 * 1000);
                }
                return statusLeft;
            })(),
            $el("div", {
                className: "cg-status-middle",
            }),
            $el("div", {
                className: "cg-status-middle",
            }),
            $el("div", {
                className: "cg-status-right",
                textContent: "\u00a0",
            })
        ])
    ]);
}