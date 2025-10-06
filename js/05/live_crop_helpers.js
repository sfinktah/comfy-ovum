// Helper functions extracted from live_crop.js to reduce file size and improve modularity.

/** Draw crop guide lines based on negative crop params (top,bottom,left,right in [0..1] negative means crop). */
export function drawGuides(ctx, w, h, params) {
    const { top, bottom, left, right } = params;
    ctx.save();
    ctx.strokeStyle = "rgba(255,0,0,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (top < 0) {
        const topY = Math.round(Math.abs(top) * h);
        ctx.moveTo(0, topY);
        ctx.lineTo(w, topY);
    }
    if (bottom < 0) {
        const bottomY = Math.round(h - Math.abs(bottom) * h);
        ctx.moveTo(0, bottomY);
        ctx.lineTo(w, bottomY);
    }
    if (left < 0) {
        const leftX = Math.round(Math.abs(left) * w);
        ctx.moveTo(leftX, 0);
        ctx.lineTo(leftX, h);
    }
    if (right < 0) {
        const rightX = Math.round(w - Math.abs(right) * w);
        ctx.moveTo(rightX, 0);
        ctx.lineTo(rightX, h);
    }
    ctx.stroke();
    ctx.restore();
}

/** Greatest common divisor for aspect ratio reduction. */
export function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b !== 0) {
        const temp = b;
        b = a % b;
        a = temp;
    }
    return a || 1;
}

/** Draw overlay info: offset, cropped size, aspect ratio (int and float). */
export function drawImageInfo(ctx, w, h, params, originalW, originalH, divisor, gcdFn = gcd) {
    const { top, bottom, left, right } = params;
    const cropTop = top < 0 ? Math.abs(top) : 0;
    const cropBottom = bottom < 0 ? Math.abs(bottom) : 0;
    const cropLeft = left < 0 ? Math.abs(left) : 0;
    const cropRight = right < 0 ? Math.abs(right) : 0;
    const cropOffsetX = Math.round(originalW * cropLeft);
    const cropOffsetY = Math.round(originalH * cropTop);
    const croppedW = originalW * (1 - cropLeft - cropRight);
    const croppedH = originalH * (1 - cropTop - cropBottom);
    const finalCroppedW = Math.round(croppedW);
    const finalCroppedH = Math.round(croppedH);
    const aspectRatioFloat = (croppedW / croppedH).toFixed(4);
    const aspectW = Math.round(croppedW / divisor);
    const aspectH = Math.round(croppedH / divisor);
    const gcdValue = gcdFn(aspectW, aspectH);
    const ratioW = Math.max(1, aspectW / gcdValue);
    const ratioH = Math.max(1, aspectH / gcdValue);
    const aspectRatioText = `${ratioW}:${ratioH}`;

    ctx.save();
    ctx.font = "12px Arial";

    const drawTextWithOutline = (text, x, y, align = "left", baseline = "top") => {
        ctx.textAlign = align;
        ctx.textBaseline = baseline;
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 3;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = "white";
        ctx.fillText(text, x, y);
    };

    const offsetText = `${cropOffsetX}, ${cropOffsetY}`;
    drawTextWithOutline(offsetText, 8, 8, "left", "top");

    const sizeText = `${finalCroppedW}×${finalCroppedH}`;
    drawTextWithOutline(sizeText, w - 8, 8, "right", "top");

    drawTextWithOutline(aspectRatioText, w - 8, h - 8, "right", "bottom");
    drawTextWithOutline(aspectRatioFloat, 8, h - 8, "left", "bottom");

    ctx.restore();
}
