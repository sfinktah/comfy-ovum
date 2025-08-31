/**
 * Module for dynamically loading timer styles
 */

export const timerStyles = `
/* Scoped variables and base layout */
.cg-timer-widget-wrapper {
    /* formerly global :root variables, now scoped */
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

    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;

    /* inherited text styling */
    font-family: system-ui, Arial, sans-serif;
    font-size: 12px;
    color: #e0e0e0;
}

/* primary content area */
.cg-timer-widget {
    flex: 1 1 auto;
    width: 100%;
    overflow: auto;
}

/* search area (moved inline styles from HTML) */
.cg-timer-widget .cg-timer-search {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px; /* from HTML */
}
.cg-timer-widget .cg-timer-search input[type="text"] {
    width: 150px;       /* from HTML */
    margin-right: 8px;  /* from HTML */
    min-width: 100px;
    background: #333;
    border: 1px solid #555;
    color: #eee;
    padding: 4px 8px;
    border-radius: 3px;
}
.cg-timer-widget .cg-timer-search label {
    color: #ccc;
    font-size: 80%; /* from HTML */
}

/* action buttons (moved inline margin from HTML) */
.cg-timer-widget button {
    background: #444;
    border: 1px solid #555;
    color: #eee;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    margin-right: 8px; /* from HTML */
}
.cg-timer-widget button:hover {
    background: #555;
}

/* table container */
.cg-timer-table-wrapper {
    width: 100%;
}

/* consolidated table styles */
.cg-timer-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
    margin: 0;
    padding: 0;

    background: #2a2a2a;
    border: 1px solid #555;
    border-radius: 4px;
    box-shadow: 0 0 4px rgba(0,0,0,0.1);
    color: #eee;
}
.cg-timer-table th,
.cg-timer-table td {
    border: none;
    vertical-align: middle;
}
.cg-timer-table th:first-child,
.cg-timer-table td:first-child {
    text-align: left;
}
.cg-timer-table th {
    background-color: #333;
    color: #eee;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #555;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 4px 6px;
}
.cg-timer-table td {
    color: #ddd;
    border-bottom: 1px solid #444;
    text-align: right;
    padding: 3px 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    min-width: 200px;
}

.cg-timer-table td.run-n.live-run {
    background-color: #4442
}

.cg-timer-table tr.live-node {
    background-color: #6662;
}

.cg-timer-table tr.live-node td.live-run {
    background-color: #6662;
}

.cg-timer-table .runs,
.cg-timer-table .per-run,
.cg-timer-table .per-flow,
.cg-timer-table .current-run,
.cg-timer-table .run-n {
    min-width: 70px;
    text-align: right;
}

.cg-timer-table td.run-n.cudnn-off {
    color: #daa;
}

.cg-timer-table td.run-n.cudnn-on {
    color: #ada;
}


/* notes (moved inline styles from HTML) */
.cg-timer-notes-list-wrapper {
    margin-top: 10px; /* from HTML */
}
/* New: flex row for a run note, with small fixed header and top alignment */
.cg-run-note {
    display: flex;
    align-items: flex-start;
    gap: 0.5em;
}
.cg-run-note-header {
    flex: 0 0 4em;      /* small fixed width */
    align-self: flex-start;
}
.cg-run-note-body {
    white-space: pre-wrap; /* from HTML */
    flex: 1 1 auto;
    align-self: flex-start;
}

/* status bar (consolidated duplicates) */
.cg-timer-status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;

    height: 20px;
    margin-top: 10px;
    color: #dddddd;
    font-family: system-ui, Arial, sans-serif;
    text-align: left;
}
.cg-status-left,
.cg-status-middle,
.cg-status-right {
    padding: 5px;
    text-align: center;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.cg-status-left {
    padding-left: 0;
    flex: 0 1 auto;
}
.cg-status-right {
    padding-right: 0;
    flex: 0 1 auto;
}
.cg-status-middle {
    flex: 1;
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
