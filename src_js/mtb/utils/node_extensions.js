/**
 * @module Node extensions
 * File: node_extensions.js
 * Project: comfy_mtb
 * Author: Mel Massadian
 * Copyright (c) 2023-2024 Mel Massadian
 */

/**
 * Extend an object, either replacing the original property or extending it.
 * @param {Object} object - The object to which the property belongs.
 * @param {string} property - The name of the property to chain the callback to.
 * @param {Function} callback - The callback function to be chained.
 */
export function extendPrototype(object, property, callback) {
    if (object === undefined) {
        console.error('Could not extend undefined object', { object, property })
        return
    }
    if (property in object) {
        const callback_orig = object[property]
        object[property] = function (...args) {
            const r = callback_orig.apply(this, args)
            callback.apply(this, args)
            return r
        }
    } else {
        object[property] = callback
    }
}

/**
 * Appends a callback to the extra menu options of a given node type.
 * @param {NodeType} nodeType
 * @param {(app,options) => ContextMenuItem[]} cb
 */
export function addMenuHandler(nodeType, cb) {
    const getOpts = nodeType.prototype.getExtraMenuOptions
    /**
     * @returns {ContextMenuItem[]} items
     */
    nodeType.prototype.getExtraMenuOptions = function (app, options) {
        const r = getOpts.apply(this, [app, options]) || []
        const newItems = cb.apply(this, [app, options]) || []
        return [...r, ...newItems]
    }
}

/** Prefixes the node title with '[DEPRECATED]' and log the deprecation reason to the console.*/
export const addDeprecation = (nodeType, reason) => {
    const title = nodeType.title
    nodeType.title = `[DEPRECATED] ${title}`

    const styles = {
        title: 'font-size:1.3em;font-weight:900;color:yellow; background: black',
        reason: 'font-size:1.2em',
    }
    console.log(
        `%c!  ${title} is deprecated:%c ${reason}`,
        styles.title,
        styles.reason,
    )
}
