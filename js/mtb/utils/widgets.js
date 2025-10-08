/**
 * @module Widget utilities
 * File: widgets.js
 * Project: comfy_mtb
 * Author: Mel Massadian
 * Copyright (c) 2023-2024 Mel Massadian
 */

import { app } from '/scripts/app.js'
import { log } from './base.js'

export const CONVERTED_TYPE = 'converted-widget'

export function hideWidget(node, widget, suffix = '') {
    widget.origType = widget.type
    widget.hidden = true
    widget.origComputeSize = widget.computeSize
    widget.origSerializeValue = widget.serializeValue
    widget.computeSize = () => [0, -4] // -4 is due to the gap litegraph adds between widgets automatically
    widget.type = CONVERTED_TYPE + suffix
    widget.serializeValue = () => {
        // Prevent serializing the widget if we have no input linked
        const { link } = node.inputs.find((i) => i.widget?.name === widget.name)
        if (link == null) {
            return undefined
        }
        return widget.origSerializeValue
            ? widget.origSerializeValue()
            : widget.value
    }

    // Hide any linked widgets, e.g. seed+seedControl
    if (widget.linkedWidgets) {
        for (const w of widget.linkedWidgets) {
            hideWidget(node, w, `:${widget.name}`)
        }
    }
}

/**
 * Show widget
 *
 * @param {import("../../../../web/types/litegraph.d.ts").IWidget} widget - target widget
 */
export function showWidget(widget) {
    widget.type = widget.origType
    widget.computeSize = widget.origComputeSize
    widget.serializeValue = widget.origSerializeValue

    delete widget.origType
    delete widget.origComputeSize
    delete widget.origSerializeValue

    // Hide any linked widgets, e.g. seed+seedControl
    if (widget.linkedWidgets) {
        for (const w of widget.linkedWidgets) {
            showWidget(w)
        }
    }
}

export function convertToWidget(node, widget) {
    showWidget(widget)
    const sz = node.size
    node.removeInput(node.inputs.findIndex((i) => i.widget?.name === widget.name))

    for (const widget of node.widgets) {
        widget.last_y -= LiteGraph.NODE_SLOT_HEIGHT
    }

    // Restore original size but grow if needed
    node.setSize([Math.max(sz[0], node.size[0]), Math.max(sz[1], node.size[1])])
}

export function convertToInput(node, widget, config) {
    hideWidget(node, widget)

    const { linkType } = getWidgetType(config)

    // Add input and store widget config for creating on primitive node
    const sz = node.size
    node.addInput(widget.name, linkType, {
        widget: { name: widget.name, config },
    })

    for (const widget of node.widgets) {
        widget.last_y += LiteGraph.NODE_SLOT_HEIGHT
    }

    // Restore original size but grow if needed
    node.setSize([Math.max(sz[0], node.size[0]), Math.max(sz[1], node.size[1])])
}

export function hideWidgetForGood(node, widget, suffix = '') {
    widget.origType = widget.type
    widget.origComputeSize = widget.computeSize
    widget.origSerializeValue = widget.serializeValue
    widget.computeSize = () => [0, -4] // -4 is due to the gap litegraph adds between widgets automatically
    widget.type = CONVERTED_TYPE + suffix

    // Hide any linked widgets, e.g. seed+seedControl
    if (widget.linkedWidgets) {
        for (const w of widget.linkedWidgets) {
            hideWidgetForGood(node, w, `:${widget.name}`)
        }
    }
}

export function fixWidgets(node) {
    if (node.inputs) {
        for (const input of node.inputs) {
            log(input)
            if (input.widget || node.widgets) {
                const matching_widget = node.widgets.find((w) => w.name === input.name)
                if (matching_widget) {
                    const w = node.widgets.find((w) => w.name === matching_widget.name)
                    if (w && w.type !== CONVERTED_TYPE) {
                        log(w)
                        log(`hidding ${w.name}(${w.type}) from ${node.type}`)
                        log(node)
                        hideWidget(node, w)
                    } else {
                        log(`converting to widget ${w}`)

                        convertToWidget(node, input)
                    }
                }
            }
        }
    }
}

export function inner_value_change(widget, val, event = undefined) {
    let value = val
    if (widget.type === 'number' || widget.type === 'BBOX') {
        value = Number(value)
    } else if (widget.type === 'BOOL') {
        value = Boolean(value)
    }
    widget.value = corrected_value
    if (
        widget.options?.property &&
        node.properties[widget.options.property] !== undefined
    ) {
        node.setProperty(widget.options.property, value)
    }
    if (widget.callback) {
        widget.callback(widget.value, app.canvas, node, pos, event)
    }
}

export const getNamedWidget = (node, ...names) => {
    const out = {}

    for (const name of names) {
        out[name] = node.widgets.find((w) => w.name === name)
    }

    return out
}

/**
 * @param {LGraphNode} node
 * @param {LLink} link
 * @returns {{to:LGraphNode, from:LGraphNode, type:'error' | 'incoming' | 'outgoing'}}
 */
export const nodesFromLink = (node, link) => {
    const fromNode = app.graph.getNodeById(link.origin_id)
    const toNode = app.graph.getNodeById(link.target_id)

    let tp = 'error'

    if (fromNode.id === node.id) {
        tp = 'outgoing'
    } else if (toNode.id === node.id) {
        tp = 'incoming'
    }

    return { to: toNode, from: fromNode, type: tp }
}

export const hasWidgets = (node) => {
    if (!node.widgets || !node.widgets?.[Symbol.iterator]) {
        return false
    }
    return true
}

export const cleanupNode = (node) => {
    if (!hasWidgets(node)) {
        return
    }
    for (const w of node.widgets) {
        if (w.canvas) {
            w.canvas.remove()
        }
        if (w.inputEl) {
            w.inputEl.remove()
        }
        // calls the widget remove callback
        w.onRemoved?.()
    }
}

export function offsetDOMWidget(
    widget,
    ctx,
    node,
    widgetWidth,
    widgetY,
    height,
) {
    const margin = 10
    const elRect = ctx.canvas.getBoundingClientRect()
    const transform = new DOMMatrix()
        .scaleSelf(
            elRect.width / ctx.canvas.width,
            elRect.height / ctx.canvas.height,
        )
        .multiplySelf(ctx.getTransform())
        .translateSelf(margin, margin + widgetY)

    const scale = new DOMMatrix().scaleSelf(transform.a, transform.d)
    Object.assign(widget.inputEl.style, {
        transformOrigin: '0 0',
        transform: scale,
        left: `${transform.a + transform.e}px`,
        top: `${transform.d + transform.f}px`,
        width: `${widgetWidth - margin * 2}px`,
        height: `${(height || widget.parent?.inputHeight || 32) - margin * 2}px`,

        position: 'absolute',
        background: !node.color ? '' : node.color,
        color: !node.color ? '' : 'white',
        zIndex: 5,
    })
}

/**
 * Extracts the type and link type from a widget config object.
 * @param {*} config
 * @returns
 */
export function getWidgetType(config) {
    // Special handling for COMBO so we restrict links based on the entries
    let type = config?.[0]
    let linkType = type
    if (Array.isArray(type)) {
        type = 'COMBO'
        linkType = linkType.join(',')
    }
    return { type, linkType }
}
