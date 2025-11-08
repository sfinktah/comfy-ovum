// Easy drawing utilities for CanvasRenderingContext2D
// De-minified and documented for readability.

/**
 * Draw a rounded rectangle path on a 2D canvas context.
 * Note: this only creates the path; caller can stroke/fill after calling.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {number} x - Left coordinate
 * @param {number} y - Top coordinate
 * @param {number} width - Rectangle width
 * @param {number} height - Rectangle height
 * @param {number} radius - Corner radius
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
}

/**
 * Draw text with quick font and color setup.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {string} [color="#000"]
 * @param {number} [size=12] - font size in px
 * @param {string} [family="Inter"] - font family
 */
function drawText(ctx, text, x, y, color = "#000", size = 12, family = "Inter") {
    ctx.font = `${size}px ${family}`;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}

const ELLIPSIS = "…";
const TWO_DOT_LEADER = "‥";
const ONE_DOT_LEADER = "․";

// Simple enum of shapes supported by strokeShape
const RenderShape = {
    BOX: 1,
    ROUND: 2,
    CIRCLE: 3,
    CARD: 4,
    ARROW: 5,
    GRID: 6,
    HollowCircle: 7,
};

/**
 * Stroke a shape around a given rectangle with padding and style options.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {[number, number, number, number]} rect - [x, y, width, height]
 * @param {object} [opts]
 * @param {number} [opts.shape=RenderShape.BOX]
 * @param {number} [opts.round_radius=LiteGraph.ROUND_RADIUS]
 * @param {number} [opts.title_height=LiteGraph.NODE_TITLE_HEIGHT]
 * @param {number} [opts.title_mode=LiteGraph.NORMAL_TITLE]
 * @param {string} [opts.color=LiteGraph.NODE_BOX_OUTLINE_COLOR]
 * @param {number} [opts.padding=6]
 * @param {boolean} [opts.collapsed=false]
 * @param {number} [opts.thickness=1]
 */
function strokeShape(ctx, rect, opts = {}) {
    const {
        shape = RenderShape.BOX,
        round_radius = LiteGraph.ROUND_RADIUS,
        title_height = LiteGraph.NODE_TITLE_HEIGHT,
        title_mode = LiteGraph.NORMAL_TITLE,
        color = LiteGraph.NODE_BOX_OUTLINE_COLOR,
        padding = 6,
        collapsed = false,
        thickness = 1,
    } = opts;

    // If title is transparent, expand rect to include title area
    if (title_mode === LiteGraph.TRANSPARENT_TITLE) {
        rect[1] -= title_height;
        rect[3] += title_height;
    }

    // Preserve previous stroke settings
    const { lineWidth: prevLineWidth, strokeStyle: prevStrokeStyle } = ctx;

    ctx.lineWidth = thickness;
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = color;
    ctx.beginPath();

    const [x, y, w, h] = rect;

    switch (shape) {
        case RenderShape.BOX: {
            ctx.rect(x - padding, y - padding, w + 2 * padding, h + 2 * padding);
            break;
        }
        case RenderShape.ROUND:
        case RenderShape.CARD: {
            const rr = round_radius + padding;
            // CARD with collapsed top corners vs ROUND all corners.
            const cornerRadii = (shape === RenderShape.CARD && collapsed) || shape === RenderShape.ROUND
                ? [rr]
                : [rr, 2, rr, 2];
            // roundRect is supported on modern Canvas2D; if not available, caller can polyfill if needed.
            ctx.roundRect(x - padding, y - padding, w + 2 * padding, h + 2 * padding, cornerRadii);
            break;
        }
        case RenderShape.CIRCLE: {
            const cx = x + w / 2;
            const cy = y + h / 2;
            const R = Math.max(w, h) / 2 + padding;
            ctx.arc(cx, cy, R, 0, 2 * Math.PI);
            break;
        }
        default: {
            // Fallback to box if unknown shape
            ctx.rect(x - padding, y - padding, w + 2 * padding, h + 2 * padding);
        }
    }

    ctx.stroke();

    // Restore previous stroke settings
    ctx.lineWidth = prevLineWidth;
    ctx.strokeStyle = prevStrokeStyle;
    ctx.globalAlpha = 1;
}

/**
 * Truncate text to fit within a maximum width, appending an ellipsis or dot leaders when necessary.
 * Attempts to reserve ~75% of the ellipsis width for the suffix character.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string}
 */
function truncateTextToWidth(ctx, text, maxWidth) {
    if (!(maxWidth > 0)) return "";

    if (ctx.measureText(text).width <= maxWidth) return text;

    const ellipsisReserve = 0.75 * ctx.measureText(ELLIPSIS).width;

    // If even an ellipsis won't fit, try leaders, else empty
    if (ellipsisReserve > maxWidth) {
        if (0.75 * ctx.measureText(TWO_DOT_LEADER).width < maxWidth) return TWO_DOT_LEADER;
        return 0.75 * ctx.measureText(ONE_DOT_LEADER).width < maxWidth ? ONE_DOT_LEADER : "";
    }

    // Binary search for the max prefix that fits with ellipsis
    let lo = 0;
    let hi = text.length;
    let best = 0;

    while (lo <= hi) {
        const mid = Math.floor(0.5 * (lo + hi));
        if (mid === 0) {
            lo = mid + 1;
            continue;
        }
        const prefix = text.substring(0, mid);
        if (ctx.measureText(prefix).width + ellipsisReserve <= maxWidth) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }

    return best === 0 ? ELLIPSIS : text.substring(0, best) + ELLIPSIS;
}

/**
 * Draw text inside a rectangular area, truncating with ellipsis if needed.
 * Optionally aligns text left, right, or center.
 *
 * @param {object} params
 * @param {CanvasRenderingContext2D} params.ctx
 * @param {string} params.text
 * @param {{left:number,right:number,bottom:number,width:number,centreX:number}} params.area
 * @param {CanvasTextAlign} [params.align="left"]
 */
function drawTextInArea({ ctx, text, area, align = "left" }) {
    const { left, right, bottom, width, centreX } = area;

    const fullWidth = ctx.measureText(text).width;
    if (fullWidth <= width) {
        ctx.textAlign = align;
        const x = align === "left" ? left : align === "right" ? right : centreX;
        ctx.fillText(text, x, bottom);
        return;
    }

    const truncated = truncateTextToWidth(ctx, text, width);
    if (truncated.length === 0) return;

    // Draw the main prefix part to the left edge
    ctx.textAlign = "left";
    ctx.fillText(truncated.slice(0, -1), left, bottom);

    // Optional guide line the original minified code had; keeping the call but no visible stroke if not stroked
    ctx.rect(left, bottom, width, 1);

    // Draw the final character (ellipsis or leader) right-aligned
    ctx.textAlign = "right";
    const lastChar = truncated.at(-1);
    if (lastChar) {
        ctx.fillText(lastChar, right, bottom, 0.75 * ctx.measureText(lastChar).width);
    }
}

/**
 * Convenience: draw a small time pill above the node title area.
 * Depends on LiteGraph and a translation helper $t.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number|string} timeSec - time in seconds
 */
function drawTime(ctx, timeSec) {
    if (!timeSec) return;

    // $t is expected to be a translation function available globally.
    const label = parseFloat(timeSec).toFixed(3) + $t("s");

    ctx.save();
    ctx.fillStyle = LiteGraph.NODE_DEFAULT_BGCOLOR;

    const pillWidth = ctx.measureText(label).width + 10;
    const pillHeight = LiteGraph.NODE_TITLE_HEIGHT - 10;

    drawRoundedRect(
        ctx,
        0,
        -LiteGraph.NODE_TITLE_HEIGHT - 20,
        pillWidth,
        pillHeight,
        4
    );
    ctx.fill();

    drawText(
        ctx,
        label,
        8,
        -LiteGraph.NODE_TITLE_HEIGHT - 6,
        LiteGraph.NODE_TITLE_COLOR
    );
    ctx.restore();
}
