/**
 * @module Color utilities
 * File: colors.js
 * Project: comfy_mtb
 * Author: Mel Massadian
 * Copyright (c) 2023-2024 Mel Massadian
 */

export function isColorBright(rgb, threshold = 240) {
    const brightess = getBrightness(rgb)
    return brightess > threshold
}

function getBrightness(rgbObj) {
    return Math.round(
        (Number.parseInt(rgbObj[0]) * 299 +
            Number.parseInt(rgbObj[1]) * 587 +
            Number.parseInt(rgbObj[2]) * 114) /
        1000,
    )
}
