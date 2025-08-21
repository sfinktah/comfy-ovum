/**
 * Module for dynamically loading timer styles
 */

export const timerStyles = `
:root {
    --lgraph-node_title_height: 30px;
    --lgraph-node_title_text_y: 20px;
    --lgraph-node_slot_height: 20px;
    --lgraph-node_widget_height: 20px;
    --lgraph-node_width: 140px;
    --lgraph-node_min_width: 50px;
    --lgraph-node_collapsed_radius: 10px;
    --lgraph-node_collapsed_width: 80px;
    --lgraph-node_title_color: #999;
    --lgraph-node_selected_title_color: #FFF;
    --lgraph-node_text_size: 14px;
    --lgraph-node_text_color: #AAA;
    --lgraph-node_text_highlight_color: #EEE;
    --lgraph-node_subtext_size: 12px;
    --lgraph-node_default_color: #333;
    --lgraph-node_default_bgcolor: #353535;
    --lgraph-node_default_boxcolor: #666;
    --lgraph-node_default_shape: ROUND;
    --lgraph-node_box_outline_color: #FFF;
    --lgraph-node_error_colour: #E00;
    --lgraph-node_font: Arial;
    --lgraph-default_font: Arial;
    --lgraph-default_shadow_color: rgba(0,0,0,0.5);
    --lgraph-default_group_font: 24px;
    --lgraph-default_group_font_size: 24px;
    --lgraph-group_font: Arial;
    --lgraph-widget_bgcolor: #222;
    --lgraph-widget_outline_color: #666;
    --lgraph-widget_advanced_outline_color: rgba(56, 139, 253, 0.8);
    --lgraph-widget_text_color: #DDD;
    --lgraph-widget_secondary_text_color: #999;
    --lgraph-widget_disabled_text_color: #666;
    --lgraph-link_color: #9A9;
    --lgraph-event_link_color: #A86;
    --lgraph-connecting_link_color: #AFA;
}

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

.cg-timer-widget-wrapper {
    height: 100%;
    width: 100%;
}

.cg-timer-widget-wrapper > * {
    height: 100%;
    width: 100%;
}

.cg-timer-widget-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%; /* Optional: Adjust depending on your needs */
    width: 100%;  /* Optional: Adjust depending on your needs */
}

.cg-timer-widget {
    flex: 1; /* Takes up the remaining space */
}

.cg-timer-status-bar {
    height: 30px; /* Set the height of the status bar */
    text-align: center; /* Optional: Center the text */
    line-height: 30px; /* Optional: Vertically center text */
    color: #dddddd; /* Example text color */
}

.cg-timer-widget-wrapper {
    height: 100%;
    width: 100%;
}

.cg-timer-widget-wrapper > * {
    height: 100%;
    width: 100%;
}

.cg-timer-widget-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%; /* Optional: Adjust depending on your needs */
    width: 100%;  /* Optional: Adjust depending on your needs */
}

.cg-timer-widget {
    flex: 1; /* Takes up the remaining space */
}

.cg-timer-status-bar {
    height: 20px; /* Set the height of the status bar */
    margin-top: 10px;
    text-align: center; /* Optional: Center the text */
    line-height: 13px; /* Optional: Vertically center text */
    color: #dddddd; /* Example text color */
    font-family: system-ui;
    font-size: 0.8em;
    text-align: left;
}

.cg-timer-status-bar {
    display: flex;
    justify-content: space-between; /* Spread sections dynamically */
    align-items: center; /* Align items vertically */
    gap: 10px; /* Optional: Adds spacing between the middle sections */
}

.cg-status-left,
.cg-status-right,
.cg-status-middle {
    padding: 5px;
    text-align: center;
    flex: 1; /* Let all sections scale dynamically */
}

.cg-status-left {
    padding-left: 0;
}

.cg-status-right {
    padding-left: 0;
}

.cg-status-left {
    flex: 0 1 auto; /* Allow shrink and grow naturally */
}

.cg-status-right {
    flex: 0 1 auto; /* Allow shrink and grow naturally */
}

.cg-status-middle {
    flex: 1; /* Middle sections take the remaining space evenly */
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
