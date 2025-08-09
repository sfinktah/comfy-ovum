/**
 * Module for dynamically loading timer styles
 */

export const timerStyles = `
.cg-timer-table {
    border-collapse: collapse;
    width: auto;
    font-family: sans-serif;
    font-size: 12px;
    background-color: #1e1e1e;
    color: #e0e0e0;
    margin: 0;
    padding: 0;
    table-layout: auto;
    border: none;
    box-shadow: 0 0 4px rgba(0,0,0,0.1);
}

.cg-timer-table th,
.cg-timer-table td {
    border: none;
    padding: 6px 10px;
    text-align: right;
    vertical-align: middle;
}

.cg-timer-table th:first-child,
.cg-timer-table td:first-child {
    text-align: left;
}

.cg-timer-table th {
    background-color: #2a2a2a;
    font-weight: normal;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.cg-timer-container-unused-now {
    font-family: monospace;
    font-size: 12px;
    color: #eee;
    overflow: auto;
    padding: 8px;
    box-sizing: border-box;
    left: 64px;
    top: 57px;
    overflow: hidden;
}

.cg-timer-widget {
    width: 100%;
    overflow: auto;
}

.cg-timer-search {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.cg-timer-search input[type="text"] {
    flex: 1;
    min-width: 100px;
    background: #333;
    border: 1px solid #555;
    color: #eee;
    padding: 4px 8px;
    border-radius: 3px;
}

.cg-timer-search label {
    color: #ccc;
    font-size: 11px;
}

.cg-timer-table {
    background: #2a2a2a;
    border: 1px solid #555;
    border-radius: 4px;
    border-collapse: collapse;
    font-size: 12px;
    color: #eee;
}

.cg-timer-table th {
    background-color: #333;
    color: #eee;
    text-align: left;
    padding: 4px 6px;
    font-weight: bold;
    border-bottom: 1px solid #555;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cg-timer-table td {
    padding: 3px 6px;
    border-bottom: 1px solid #444;
    color: #ddd;
}

.cg-timer-table tr:nth-child(even) {
    background-color: #262626;
}

.cg-timer-table tr:hover {
    background-color: #333333;
}

.cg-timer-table .node {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cg-timer-container button {
    background: #444;
    border: 1px solid #555;
    color: #eee;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    margin-right: 5px;
    margin-bottom: 8px;
}

.cg-timer-container button:hover {
    background: #555;
}

.cg-timer-container {
    width: 100%;
}

.cg-timer-table-wrapper {
    height: 100%;
    width: 100%;
}

.cg-timer-table {
    width: 100%;
}

.cg-timer-table td {
    padding: 3px 6px;
    border-bottom: 1px solid #444;
    color: #ccc;
}

.cg-timer-table .node {
    min-width: 200px;
    width: auto;
}

.cg-timer-table .runs, 
.cg-timer-table .per-run, 
.cg-timer-table .per-flow, 
.cg-timer-table .current-run,
.cg-timer-table .run-n
{
    min-width: 100px;
    width: auto;
    text-align: right;
}


`;

/**
 * Injects timer styles into the DOM
 */
export function injectTimerStyles() {
  // Remove any existing timer styles to prevent duplicates
  const existingStylesheet = document.getElementById('cg-timer-styles');
  if (existingStylesheet) {
    existingStylesheet.remove();
  }

  // Create style element
  const styleEl = document.createElement('style');
  styleEl.id = 'cg-timer-styles';
  styleEl.textContent = timerStyles;

  // Append to document head
  document.head.appendChild(styleEl);

  return styleEl;
}
