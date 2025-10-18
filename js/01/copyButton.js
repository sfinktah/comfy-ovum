import {stripTrailingId} from "./utility.js";

export function getLatestRunIds() {
    return Object.keys(Timer.run_history).sort().reverse().slice(0, Timer.last_n_runs - 1);
}

export function getStartTimes() {
    return getLatestRunIds().reduce((acc, id) => {
        const nodes = Timer.run_history[id]?.nodes;
        if (!nodes) return acc;

        let previousTitle = "";
        let previousCudnn = undefined;

        for (const [id, node] of Object.entries(nodes)) {
            const start = node.startTimes?.[0] ?? 0;

            const title = String(app.graph.getNodeById(id)?.getTitle() ?? "");
            if (
                title &&
                start &&
                (
                    node.totalTime > 2000 ||
                    ~previousTitle.indexOf('code') ||
                    node.cudnn !== previousCudnn
                )
            ) {
                acc.push({ start: start, node: title, total: node.totalTime >>> 0, cudnn: node.cudnn});
            }

            previousTitle = title;
            previousCudnn = node.cudnn;
        }
        return acc;
    }, []);
}

export function getRunNoteTimes() {
    return getLatestRunIds().reduce((acc, id) => {
        const startTime = Timer.run_history[id]?.systemStartTime;
        const runNote = Timer.run_notes[id] || '';
        if (!startTime) return acc;

        acc.push({start: startTime, note: runNote});

        return acc;
    }, []);
}
// Extracted clipboard helper
export function copyToClipboard(text) {
    return navigator.clipboard.writeText(text);
}

export function onCopyButton(e) {
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
        const hideableKeys = new Set(['runs', 'per-run', 'per-flow', 'current-run']);
        const cells = Array.from(row.querySelectorAll('th, td')).filter(cell => {
            const classes = cell.classList || [];
            let key = null;
            for (const c of classes) {
                if (hideableKeys.has(c)) {
                    key = c;
                    break;
                }
            }
            return !(key && Timer.isHidden(key, 'copy'));
        });

        const rowText = cells.map((cell, idx) => {
            let text = cell.textContent.trim();
            // Apply emoji removal and trailing id stripping to the first cell only
            if (idx === 0) {
                text = text.replace(/[^\x20-\x7F]/g, '');
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
        const {gpu, pytorch, argv, connectionClosed, closeCode, closeReason} = Timer.systemInfo;
        if (gpu) tableText += `GPU: ${gpu}\n`;
        if (pytorch) tableText += `PyTorch: ${pytorch}\n`;
        if (argv) tableText += `Args: ${argv}\n`;
        if (connectionClosed) {
            tableText += `Socket closed: code=${closeCode ?? ''} reason=${closeReason ?? ''}\n`;
        }
    }

    // Copy to clipboard via the extracted function
    copyToClipboard(tableText)
        .then(() => {
            console.log('Table copied to clipboard');
            // Visual feedback that copy worked
            const button = e?.currentTarget;
            if (button && typeof button.textContent === 'string') {
                const originalText = button.textContent;
                button.textContent = "Copied!";
                setTimeout(() => {
                    button.textContent = originalText;
                }, 1500);
            }
        })
        .catch(err => {
            console.error('Failed to copy: ', err);
        });

}

export function onCopyGraphData(e) {
    // Find the table with the cg-timer-table class

    const runNotes = getRunNoteTimes();
    const startTimes = getStartTimes();
    // Copy to clipboard via the extracted function
    copyToClipboard(JSON.stringify({ runNotes, startTimes }, null, 2))
        .then(() => {
            console.log('Table copied to clipboard');
            // Visual feedback that copy worked
            const button = e?.currentTarget;
            if (button && typeof button.textContent === 'string') {
                const originalText = button.textContent;
                button.textContent = "Copied!";
                setTimeout(() => {
                    button.textContent = originalText;
                }, 1500);
            }
        })
        .catch(err => {
            console.error('Failed to copy: ', err);
        });

}

export async function onUploadGraphData(e = null) {
    try {
        const runNotes = getRunNoteTimes();
        const startTimes = getStartTimes();
        const payload = { runNotes, startTimes };
        const json = JSON.stringify(payload);

        let headers = { Accept: 'application/json' };
        let body;
        // Fallback: regular JSON
        headers['Content-Type'] = 'application/json';
        body = json;

        const res = await fetch('/ovum/update-timing', {
            method: 'POST',
            headers,
            body
        });

        if (!res.ok) {
            console.log("[Timer] Sync failed: ", res.status)
            return;
            // throw new Error(`[Timer] Sync failed: ${res.status}`);
        }
        // console.log("[Timer] Upload successful: ", res.status)

        // Optional: read response to ensure completion
        // const result = await res.json().catch(() => ({}));

        // Visual feedback that upload worked
        const button = e?.currentTarget;
        if (button && typeof button.textContent === 'string') {
            const originalText = button.textContent;
            button.textContent = 'Uploaded!';
            setTimeout(() => {
                button.textContent = originalText;
            }, 1500);
        }
    } catch (err) {
        console.error('Failed to upload timing data:', err);
        const button = e?.currentTarget;
        if (button && typeof button.textContent === 'string') {
            const originalText = button.textContent;
            button.textContent = 'Upload failed';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        }
    }
}

