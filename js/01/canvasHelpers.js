/**
 * Draw text with a semi-transparent black background for readability.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y Baseline Y coordinate
 * @param {string} [font="12px sans-serif"]
 * @returns {void}
 */
export function drawTextWithBg(ctx, text, x, y, font = "12px sans-serif") {
    ctx.save();
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent ?? 9;
    const descent = metrics.actualBoundingBoxDescent ?? 3;
    const padX = 4, padY = 2;
    const bgX = x - padX;
    const bgY = y - ascent - padY; // top-left relative to baseline
    const bgW = metrics.width + padX * 2;
    const bgH = ascent + descent + padY * 2;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(bgX, bgY, bgW, bgH);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x, y);
    ctx.restore();
}

/**
 * Get the bounding box of a widget in node-local coordinates
 * @param {import("@comfyorg/comfyui-frontend-types").LGraphNode} node - The node containing the widget
 * @param {Object} widget - The widget to get bounds for
 * @returns {{x:number,y:number,width:number,height:number}|null} - bounds in node-local coordinates
 */
export function getWidgetBounds(node, widget) {
  const widgets = node.widgets || [];
  const widgetIndex = widgets.indexOf(widget);
  if (widgetIndex === -1) {
    return null; // Widget not found
  }

  const w = widget;

  // LiteGraph constants (these may vary by version)
  const WIDGET_HEIGHT = w.height;
  const WIDGET_MARGIN = 15;
  const WIDGET_PADDING = 3;

  // Use computed y if available
  let y = w.y - WIDGET_PADDING;

  // Calculate widget dimensions
  let width = node.size[0] - WIDGET_MARGIN * 2;
  let height = WIDGET_HEIGHT;

  if (w.computedHeight) {
    height = widget.computedHeight;
  }

  return {
    x: WIDGET_MARGIN,
    y: y,
    width: width,
    height: height
  };
}
