/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */

const STATUS_BELOW_NODE = true;

/**
 * Draws the status text of a node on a given canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context where the status should be drawn.
 * @param {string} status - The status text to be displayed. Supports multiple lines separated by newline characters.
 * @param {number[]} size - Array containing the width and height of the node [width, height].
 * @param {int} flags - LGraphNode flags to determine if the node is in a collapsed state.
 * @return {void} Does not return a value.
 */
export function drawNodeStatus(ctx, status, size, flags) {
    if (!status) {
        return;
    }

    const fontSize = 10;
    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = "#888";
    ctx.textAlign = "left";
    const lines = status.split("\n");
    const lineHeight = 14;

    let y;
    if (STATUS_BELOW_NODE) {
        const V_OFFSET_BELOW = 14;
        y = size[1] + V_OFFSET_BELOW;
    } else {
        if (flags?.collapsed) {
            return;
        }
        y = size[1] - (lines.length - 1) * lineHeight - fontSize / 2 - 2;
    }

    for (const line of lines) {
        ctx.fillText(line, 0, y);
        y += lineHeight;
    }
}
