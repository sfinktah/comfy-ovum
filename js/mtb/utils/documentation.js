/**
 * @module Documentation widget
 * File: documentation.js
 * Project: comfy_mtb
 * Author: Mel Massadian
 * Copyright (c) 2023-2024 Mel Massadian
 */

import { app } from '/scripts/app.js'
import { api } from '/scripts/api.js'
import { infoLogger } from './base.js'

const create_documentation_stylesheet = () => {
    const tag = 'mtb-documentation-stylesheet'

    let styleTag = document.head.querySelector(tag)

    if (!styleTag) {
        styleTag = document.createElement('style')
        styleTag.type = 'text/css'
        styleTag.id = tag

        styleTag.innerHTML = `
.documentation-popup {
    background: var(--comfy-menu-bg);
    position: absolute;
    color: var(--fg-color);
    font: 12px monospace;
    line-height: 1.5em;
    padding: 10px;
    border-radius: 6px;
    pointer-events: "inherit";
    z-index: 5;
    overflow: hidden;
}
.documentation-wrapper {
    padding: 0 2em;
    overflow: auto;
    max-height: 100%;
    /* Scrollbar styling for Chrome */
    &::-webkit-scrollbar {
       width: 6px;
    }
    &::-webkit-scrollbar-track {
       background: var(--bg-color);
    }
    &::-webkit-scrollbar-thumb {
       background-color: var(--fg-color);
       border-radius: 6px;
       border: 3px solid var(--bg-color);
    }

    /* Scrollbar styling for Firefox */
    scrollbar-width: thin;
    scrollbar-color: var(--fg-color) var(--bg-color);
    a {
      color: yellow;
    }
    a:visited {
      color: orange;
    }
    a:hover {
      color: red;
    }
}

.documentation-popup img {
  max-width: 100%;
}
.documentation-popup table {
  border-collapse: collapse;
  border: 1px var(--border-color) solid;
}
.documentation-popup th,
.documentation-popup td {
  border: 1px var(--border-color) solid;
}
.documentation-popup th {
  background-color: var(--comfy-input-bg);
}`
        document.head.appendChild(styleTag)
    }
}

let parserPromise
const callbackQueue = []

function runQueuedCallbacks() {
    while (callbackQueue.length) {
        const cb = callbackQueue.shift()
        cb(window.MTB.mdParser)
    }
}

function loadParser(shiki) {
    if (!parserPromise) {
        parserPromise = import(
            shiki
                ? '/mtb_async/mtb_markdown_plus.umd.js'
                : '/mtb_async/mtb_markdown.umd.js'
            )
            .then((_module) =>
                shiki ? MTBMarkdownPlus.getParser() : MTBMarkdown.getParser(),
            )
            .then((instance) => {
                window.MTB.mdParser = instance
                runQueuedCallbacks()
                return instance
            })
            .catch((error) => {
                console.error('Error loading the parser:', error)
            })
    }
    return parserPromise
}

export const ensureMarkdownParser = async (callback) => {
    infoLogger('Ensuring md parser')
    let use_shiki = false
    try {
        use_shiki = await api.getSetting('mtb.Use Shiki')
    } catch (e) {
        console.warn('Option not available yet', e)
    }

    if (window.MTB?.mdParser) {
        infoLogger('Markdown parser found')
        callback?.(window.MTB.mdParser)
        return window.MTB.mdParser
    }

    if (!parserPromise) {
        infoLogger('Running promise to fetch parser')

        try {
            loadParser(use_shiki)
        } catch (error) {
            console.error('Error loading the parser:', error)
        }
    } else {
        infoLogger('A similar promise is already running, waiting for it to finish')
    }
    if (callback) {
        callbackQueue.push(callback)
    }

    await parserPromise
    await parserPromise

    return window.MTB.mdParser
}

/**
 * Add documentation widget to the given node.
 *
 * This method will add a `docCtrl` property to the node
 * that contains the AbortController that manages all the events
 * defined inside it (global and instance ones) without explicit
 * cleanup method for each.
 *
 * @param {NodeData} nodeData
 * @param {NodeType}  nodeType
 * @param {DocumentationOptions} opts
 */
export const addDocumentation = (
    nodeData,
    nodeType,
    opts = { icon_size: 14, icon_margin: 4 },
) => {
    if (!nodeData.description) {
        infoLogger(
            `Skipping ${nodeData.name} doesn't have a description, skipping...`,
        )
        return
    }

    const options = opts || {}
    const iconSize = options.icon_size || 14
    const iconMargin = options.icon_margin || 4

    let docElement = null
    let wrapper = null

    const onRem = nodeType.prototype.onRemoved

    nodeType.prototype.onRemoved = function () {
        const r = onRem ? onRem.apply(this, []) : undefined

        if (docElement) {
            docElement.remove()
            docElement = null
        }

        if (wrapper) {
            wrapper.remove()
            wrapper = null
        }
        return r
    }

    const drawFg = nodeType.prototype.onDrawForeground

    /**
     * @param {OnDrawForegroundParams} args
     */
    nodeType.prototype.onDrawForeground = function (...args) {
        const [ctx, _canvas] = args
        const r = drawFg ? drawFg.apply(this, args) : undefined

        if (this.flags.collapsed) return r

        ctx.save()
        // ...
        ctx.restore()

        return r
    }
    const mouseDown = nodeType.prototype.onMouseDown

    /**
     * @param {OnMouseDownParams} args
     */
    nodeType.prototype.onMouseDown = function (...args) {
        const [_event, localPos, _graphCanvas] = args
        const r = mouseDown ? mouseDown.apply(this, args) : undefined
        const iconX = this.size[0] - iconSize - iconMargin
        const iconY = iconSize - 34
        if (
            localPos[0] > iconX &&
            localPos[0] < iconX + iconSize &&
            localPos[1] > iconY &&
            localPos[1] < iconY + iconSize
        ) {
            if (this.show_doc === undefined) {
                this.show_doc = true
            } else {
                this.show_doc = !this.show_doc
            }
            if (this.show_doc) {
                this.docCtrl = new AbortController()
            } else {
                this.docCtrl.abort()
            }
            return true
        }

        return r
    }
}
