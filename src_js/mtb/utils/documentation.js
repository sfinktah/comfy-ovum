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

        // icon position
        const x = this.size[0] - iconSize - iconMargin

        let resizeHandle
        // create it
        if (this.show_doc && docElement === null) {
            create_documentation_stylesheet()

            docElement = document.createElement('div')
            docElement.classList.add('documentation-popup')
            document.body.appendChild(docElement)

            wrapper = document.createElement('div')
            wrapper.classList.add('documentation-wrapper')
            docElement.appendChild(wrapper)

            ensureMarkdownParser().then(() => {
                MTB.mdParser.parse(nodeData.description).then((e) => {
                    wrapper.innerHTML = e
                    // resize handle
                    resizeHandle = document.createElement('div')
                    resizeHandle.classList.add('doc-resize-handle')
                    resizeHandle.style.width = '0'
                    resizeHandle.style.height = '0'
                    resizeHandle.style.position = 'absolute'
                    resizeHandle.style.bottom = '0'
                    resizeHandle.style.right = '0'

                    resizeHandle.style.cursor = 'se-resize'
                    resizeHandle.style.userSelect = 'none'

                    resizeHandle.style.borderWidth = '15px'
                    resizeHandle.style.borderStyle = 'solid'

                    resizeHandle.style.borderColor =
                        'transparent var(--border-color) var(--border-color) transparent'

                    wrapper.appendChild(resizeHandle)
                    let isResizing = false

                    let startX
                    let startY
                    let startWidth
                    let startHeight

                    resizeHandle.addEventListener(
                        'mousedown',
                        (e) => {
                            e.stopPropagation()
                            isResizing = true
                            startX = e.clientX
                            startY = e.clientY
                            startWidth = Number.parseInt(
                                document.defaultView.getComputedStyle(docElement).width,
                                10,
                            )
                            startHeight = Number.parseInt(
                                document.defaultView.getComputedStyle(docElement).height,
                                10,
                            )
                        },

                        { signal: this.docCtrl.signal },
                    )

                    document.addEventListener(
                        'mousemove',
                        (e) => {
                            if (!isResizing) return
                            const scale = app.canvas.ds.scale
                            const newWidth = startWidth + (e.clientX - startX) / scale
                            const newHeight = startHeight + (e.clientY - startY) / scale

                            docElement.style.width = `${newWidth}px`
                            docElement.style.height = `${newHeight}px`

                            this.docPos = {
                                width: `${newWidth}px`,
                                height: `${newHeight}px`,
                            }
                        },
                        { signal: this.docCtrl.signal },
                    )

                    document.addEventListener(
                        'mouseup',
                        () => {
                            isResizing = false
                        },
                        { signal: this.docCtrl.signal },
                    )
                })
            })
        } else if (!this.show_doc && docElement !== null) {
            docElement.remove()
            docElement = null
        }

        // reposition
        if (this.show_doc && docElement !== null) {
            const rect = ctx.canvas.getBoundingClientRect()

            const dpi = Math.max(1.0, window.devicePixelRatio)
            const scaleX = rect.width / ctx.canvas.width
            const scaleY = rect.height / ctx.canvas.height
            const transform = new DOMMatrix()
                .scaleSelf(scaleX, scaleY)
                .multiplySelf(ctx.getTransform())
                .translateSelf(this.size[0] * scaleX * dpi, 0)
                .translateSelf(10, -32)

            const scale = new DOMMatrix().scaleSelf(transform.a, transform.d)

            Object.assign(docElement.style, {
                transformOrigin: '0 0',
                transform: scale,
                left: `${transform.a + rect.x + transform.e}px`,
                top: `${transform.d + rect.y + transform.f}px`,
                width: this.docPos ? this.docPos.width : `${this.size[0] * 1.5}px`,
                height: this.docPos?.height,
            })

            if (this.docPos === undefined) {
                this.docPos = {
                    width: docElement.style.width,
                    height: docElement.style.height,
                }
            }
        }

        ctx.save()
        ctx.translate(x, iconSize - 34)
        ctx.scale(iconSize / 32, iconSize / 32)
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'

        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        ctx.lineWidth = 2.4
        ctx.font = 'bold 36px monospace'
        ctx.fillText('?', 0, 24)

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
