/**
 * @module HTML/CSS utilities
 * File: html.js
 * Project: comfy_mtb
 * Author: Mel Massadian
 * Copyright (c) 2023-2024 Mel Massadian
 */

/**
 * Calculate total height of DOM element child
 *
 * @param {HTMLElement} parentElement - The target dom element
 * @returns {number} the total height
 */
export function calculateTotalChildrenHeight(parentElement) {
    let totalHeight = 0

    for (const child of parentElement.children) {
        const style = window.getComputedStyle(child)

        // Get height as an integer (without 'px')
        const height = Number.parseInt(style.height, 10)

        // Get vertical margin as integers
        const marginTop = Number.parseInt(style.marginTop, 10)
        const marginBottom = Number.parseInt(style.marginBottom, 10)

        // Sum up height and vertical margins
        totalHeight += height + marginTop + marginBottom
    }

    return totalHeight
}

export const loadScript = (
    FILE_URL,
    async = true,
    type = 'text/javascript',
) => {
    return new Promise((resolve, reject) => {
        try {
            // Check if the script already exists
            const existingScript = document.querySelector(`script[src="${FILE_URL}"]`)
            if (existingScript) {
                resolve({ status: true, message: 'Script already loaded' })
                return
            }

            const scriptEle = document.createElement('script')
            scriptEle.type = type
            scriptEle.async = async
            scriptEle.src = FILE_URL

            scriptEle.addEventListener('load', (_ev) => {
                resolve({ status: true })
            })

            scriptEle.addEventListener('error', (_ev) => {
                reject({
                    status: false,
                    message: `Failed to load the script ${FILE_URL}`,
                })
            })

            document.body.appendChild(scriptEle)
        } catch (error) {
            reject(error)
        }
    })
}
