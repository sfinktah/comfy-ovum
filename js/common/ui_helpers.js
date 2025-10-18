/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */

const STATUS_BELOW_NODE = true;

/**
 * Draws the status text of a node on a given canvas context.
 * Reads status/size/collapsed from `this` (bound to the calling LGraphNode).
 *
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context where the status should be drawn.
 * @return {void} Does not return a value.
 */
export function drawNodeStatus(ctx) {
    const status = this?.status;
    if (!status) {
        return;
    }

    const size = this?.renderingSize || [0, 0];
    const collapsed = this?.collapsed;

    const fontSize = 10;
    ctx.font = `${fontSize}px monospace`;

    // Use current theme's default color for node titles, fallback to #888
    let titleColor = "#888";
    try {
        const root = document?.documentElement;
        if (root) {
            const cssVal = getComputedStyle(root).getPropertyValue("--lgraph-node_title_color").trim();
            if (cssVal) titleColor = cssVal;
        }
    } catch (e) {
        // ignore and keep fallback
    }
    if (!titleColor && typeof LiteGraph !== "undefined") {
        // try some LiteGraph color fallbacks if available
        titleColor = LiteGraph.NODE_TEXT_COLOR || LiteGraph.NODE_SELECTED_TITLE_COLOR || "#888";
    }
    ctx.fillStyle = titleColor || "#888";

    ctx.textAlign = "left";
    const lines = status.split("\n");
    const lineHeight = 14;

    let y;
    if (STATUS_BELOW_NODE) {
        const V_OFFSET_BELOW = 14;
        if (collapsed) {
            y = V_OFFSET_BELOW;
            y = size[1] + V_OFFSET_BELOW;
        }
        else {
            y = size[1] + V_OFFSET_BELOW;
        }
    } else {
        if (collapsed) {
            return;
        }
        y = size[1] - (lines.length - 1) * lineHeight - fontSize / 2 - 2;
    }

    if (lines.length === 2) {
        // If both lines plus 3 spaces fit within node width, draw on a single line
        const leftText = lines[0];
        const rightText = lines[1];
        const leftWidth = ctx.measureText(leftText).width;
        const rightWidth = ctx.measureText(rightText).width;
        const spacerWidth = ctx.measureText("   ").width; // 3 spaces
        if (leftWidth + spacerWidth + rightWidth <= size[0]) {
            // draw both on same baseline: left-aligned and right-aligned
            const prevAlign = ctx.textAlign;
            ctx.textAlign = "left";
            ctx.fillText(leftText, 0, y);
            ctx.textAlign = "right";
            ctx.fillText(rightText, size[0], y);
            ctx.textAlign = prevAlign;
            return;
        }
    }

    for (const line of lines) {
        ctx.fillText(line, 0, y);
        y += lineHeight;
    }
}
