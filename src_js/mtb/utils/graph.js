/**
 * @module Authoring API / graph utilities
 * File: graph.js
 * Project: comfy_mtb
 * Author: Mel Massadian
 * Copyright (c) 2023-2024 Mel Massadian
 */

import { app } from '/scripts/app.js'

export const getAPIInputs = () => {
    const inputs = {}
    let counter = 1
    for (const node of getNodes(true)) {
        const widgets = node.widgets

        if (node.properties.mtb_api && node.properties.useAPI) {
            if (node.properties.mtb_api.inputs) {
                for (const currentName in node.properties.mtb_api.inputs) {
                    const current = node.properties.mtb_api.inputs[currentName]
                    if (current.enabled) {
                        const inputName = current.name || currentName
                        const widget = widgets.find((w) => w.name === currentName)
                        if (!widget) continue
                        if (!(inputName in inputs)) {
                            inputs[inputName] = {
                                ...current,
                                id: counter,
                                name: inputName,
                                type: current.type,
                                node_id: node.id,
                                widgets: [],
                            }
                        }
                        inputs[inputName].widgets.push(widget)
                        counter = counter + 1
                    }
                }
            }
        }
    }
    return inputs
}

export const getNodes = (skip_unused) => {
    const nodes = []
    for (const outerNode of app.graph.computeExecutionOrder(false)) {
        const skipNode =
            (outerNode.mode === 2 || outerNode.mode === 4) && skip_unused
        const innerNodes =
            !skipNode && outerNode.getInnerNodes
                ? outerNode.getInnerNodes()
                : [outerNode]
        for (const node of innerNodes) {
            if ((node.mode === 2 || node.mode === 4) && skip_unused) {
                continue
            }
            nodes.push(node)
        }
    }
    return nodes
}
