/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').ComfyApp} ComfyApp */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').LiteGraph} LiteGraph */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').LGraphCanvas} LGraphCanvas */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").LGraphNode} LGraphNode */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").LiteGraph} LiteGraph */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').LGraphCanvas} LGraphCanvas */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').LGraph} LGraph */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").LLink} LLink */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").INodeInputSlot} INodeInputSlot */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").INodeOutputSlot} INodeOutputSlot */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ISlotType} ISlotType */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").SubgraphIO} SubgraphIO */
/** @typedef {import('/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js').ComfyApp} ComfyApp */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").IWidget} IWidget */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").Subgraph} Subgraph */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").IFoundSlot} IFoundSlot */
/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").IContextMenuValue} IContextMenuValue */
/** @typedef {import("../../../typings/ComfyNode.js").ComfyNode} ComfyNode */
/**
 * @module Dynamic connections
 * File: dynamic_connections.js
 * Based on Project: comfy_mtb
 * Original author: Mel Massadian
 * Copyright (c) 2023-2024 Mel Massadian
 */

import {infoLogger} from './base.js'
import {nodesFromLink} from './widgets.js'
import {chainCallback} from "../../01/utility.js";

/**
 * @typedef {Object} DynamicConnectionOptions
 * @property {string} [separator='_'] - Separator between prefix and index in input names
 * @property {number} [start_index=1] - Starting index for dynamic inputs
 * @property {LLink} [link] - Link information (populated during connection events)
 * @property {INodeInputSlot | INodeOutputSlot} [ioSlot] - Slot information (populated during connection events)
 * @property {Array<string>} [nameArray] - Optional array of custom names for inputs
 * @property {Object} [DEBUG] - Debug information object
 */

/**
 * @typedef {[number, number, boolean, LLink?, (INodeInputSlot | INodeOutputSlot)?]} OnConnectionsChangeParams
 * Parameters passed to onConnectionsChange callback: [type, slotIndex, isConnected, link, ioSlot]
 */

/**
 * @typedef {Object} DynamicIOInputGroup
 * @property {string} prefix - Prefix for this group's input names (e.g., 'passthru_', 'true_')
 * @property {string | Array<string>} [type='*'] - Type(s) accepted by this input group
 * @property {number} [start=1] - Starting index for this group's inputs
 */

/**
 * @typedef {Object} DynamicIOOutputConfig
 * @property {boolean} [mirrorInputs=false] - Whether outputs should mirror the inputs
 */

/**
 * @typedef {Object} DynamicIOConfig
 * @property {Array<DynamicIOInputGroup>} [inputs] - Array of input group configurations
 * @property {DynamicIOOutputConfig} [outputs] - Output configuration
 */

/**
 * Sets up dynamic connections for a node type, allowing inputs to be added/removed dynamically.
 * This function configures a node to automatically manage a set of dynamic inputs that can grow
 * as connections are made and shrink when connections are removed.
 * 
 * @param {ComfyNode} nodeType - The node type to attach dynamic connection behavior to
 * @param {string} prefix - A prefix added to each dynamic input name
 * @param {string | Array<string>} inputType - The datatype(s) of the dynamic inputs (use '*' for any type)
 * @param {DynamicConnectionOptions} [opts] - Extra options for configuring dynamic connections
 * @returns {void}
 * 
 * @example
 * setupDynamicConnections(MyNodeType, 'input', 'IMAGE', { separator: '_', start_index: 0 })
 */
export const setupDynamicConnections = (
    nodeType,
    prefix,
    inputType,
    opts = undefined,
) => {
    infoLogger(
        'Setting up dynamic connections for',
        Object.getOwnPropertyDescriptors(nodeType).title.value,
    )

    /** @type {{separator:string, start_index:number, link?:LLink, ioSlot?:INodeInputSlot | INodeOutputSlot}?} */
    const options = Object.assign(
        {
            separator: '_',
            start_index: 1,
        },
        opts || {},
    )
    const inputList = typeof inputType === 'object'

    chainCallback(nodeType, 'onNodeCreated', function () {
        this.addInput(
            `${prefix}${options.separator}${options.start_index}`,
            inputList ? '*' : inputType,
        )
    })

    /**
     * @param {OnConnectionsChangeParams} args
     */
    chainCallback(nodeType, 'onConnectionsChange', function (...args) {
        const [type, slotIndex, isConnected, link, ioSlot] = args

        options.link = link
        options.ioSlot = ioSlot
        options.DEBUG = {
            node: this,
            type,
            slotIndex,
            isConnected,
            link,
            ioSlot,
        }

        dynamic_connection(
            this,
            slotIndex,
            isConnected,
            `${prefix}${options.separator}`,
            inputType,
            options,
        )
    })
}

/**
 * Main logic for managing dynamic input connections on a node.
 * Handles adding new inputs when connections are made, removing unused inputs when
 * connections are removed, and renaming inputs to maintain sequential ordering.
 *
 * @param {LGraphNode} node - The target node to manage dynamic inputs for
 * @param {number} index - The slot index of the connection that triggered this event
 * @param {boolean} connected - Whether this event is connecting (true) or disconnecting (false)
 * @param {string} [connectionPrefix='input_'] - The common prefix for dynamic input names
 * @param {string | Array<string>} [connectionType='*'] - The type(s) accepted by the dynamic connections
 * @param {DynamicConnectionOptions} [opts] - Additional options for configuring behavior
 * @returns {void}
 * 
 * @example
 * dynamic_connection(node, 2, true, 'input_', 'IMAGE', { start_index: 1 })
 */
export const dynamic_connection = (
    node,
    index,
    connected,
    connectionPrefix = 'input_',
    connectionType = '*',
    opts = undefined,
) => {
    const options = Object.assign(
        {
            start_index: 1,
        },
        opts || {},
    )

    // function to test if input is a dynamic one
    const isDynamicInput = (inputName) => inputName.startsWith(connectionPrefix)

    if (node.inputs.length > 0 && !isDynamicInput(node.inputs[index].name)) {
        return
    }

    const listConnection = typeof connectionType === 'object'

    const conType = listConnection ? '*' : connectionType
    const nameArray = options.nameArray || []

    const clean_inputs = () => {
        if (node.inputs.length === 0) return

        let w_count = node.widgets?.length || 0
        let i_count = node.inputs?.length || 0
        infoLogger(`Cleaning inputs: [BEFORE] (w: ${w_count} | inputs: ${i_count})`)

        const to_remove = []
        for (let n = 1; n < node.inputs.length; n++) {
            const element = node.inputs[n]
            if (!element.link && isDynamicInput(element.name)) {
                if (node.widgets) {
                    const w = node.widgets.find((w) => w.name === element.name)
                    if (w) {
                        w.onRemoved?.()
                        node.widgets.length = node.widgets.length - 1
                    }
                }
                infoLogger(`Removing input ${n}`)
                to_remove.push(n)
            }
        }
        for (let i = 0; i < to_remove.length; i++) {
            const id = to_remove[i]

            node.removeInput(id)
            i_count -= 1
        }
        node.inputs.length = i_count

        w_count = node.widgets?.length || 0
        i_count = node.inputs?.length || 0
        infoLogger(`Cleaning inputs: [AFTER] (w: ${w_count} | inputs: ${i_count})`)

        infoLogger('Cleaning inputs: making it sequential again')
        // make inputs sequential again
        let prefixed_idx = options.start_index
        for (let i = 0; i < node.inputs.length; i++) {
            let name = ''
            // rename only prefixed inputs
            if (isDynamicInput(node.inputs[i].name)) {
                // prefixed => rename and increase index
                name = `${connectionPrefix}${prefixed_idx}`
                prefixed_idx += 1
            } else {
                // not prefixed => keep same name
                name = node.inputs[i].name
            }

            if (nameArray.length > 0) {
                name = i < nameArray.length ? nameArray[i] : name
            }

            // preserve label if it exists
            node.inputs[i].label = node.inputs[i].label || name
            node.inputs[i].name = name
        }
    }
    if (!connected) {
        if (!options.link) {
            infoLogger('Disconnecting', { options })

            clean_inputs()
        } else {
            if (!options.ioSlot.link) {
                // connectionTransit is some kind of mtb specialization
                node.connectionTransit = true
            } else {
                node.connectionTransit = false
                clean_inputs()
            }
            infoLogger('Reconnecting', { options })
        }
    }

    if (connected) {
        if (options.link) {
            const { from, to, type } = nodesFromLink(node, options.link)
            if (type === 'outgoing') return
            infoLogger('Connecting', { options, from, to, type })
        } else {
            infoLogger('Connecting', { options })
        }

        if (node.connectionTransit) {
            infoLogger('In Transit')
            node.connectionTransit = false
        }

        // Remove inputs and their widget if not linked.
        clean_inputs()

        if (node.inputs.length === 0) return
        // add an extra input
        if (node.inputs[node.inputs.length - 1].link !== null) {
            // count only the prefixed inputs
            const nextIndex = node.inputs.reduce(
                (acc, cur) => (isDynamicInput(cur.name) ? ++acc : acc),
                0,
            )

            const name =
                nextIndex < nameArray.length
                    ? nameArray[nextIndex]
                    : `${connectionPrefix}${nextIndex + options.start_index}`

            infoLogger(`Adding input ${nextIndex + 1} (${name})`)
            node.addInput(name, conType)
        }
    }
}


/**
 * Generic multi-group dynamic IO mixin.
 * Allows configuring multiple independent dynamic input groups with different prefixes and types,
 * and optionally mirrors all inputs to outputs.
 * 
 * Each input group operates independently, maintaining its own numbering sequence.
 * When mirrorInputs is enabled, outputs automatically sync with inputs in count, naming, and type.
 * 
 * @param {ComfyNode} nodeType - The node type to attach dynamic IO behavior to
 * @param {DynamicIOConfig} config - Configuration object defining input groups and output behavior
 * @returns {void}
 * 
 * @example
 * setupDynamicIOMixin(MyNodeType, {
 *   inputs: [
 *     { prefix: 'passthru_', type: '*', start: 1 },
 *     { prefix: 'condition_', type: 'BOOLEAN', start: 1 },
 *   ],
 *   outputs: { mirrorInputs: true }
 * })
 */
export const setupDynamicIOMixin = (nodeType, config) => {
    const inputsCfg = config.inputs || []
    const outputsCfg = config.outputs || { mirrorInputs: false }

    chainCallback(nodeType, 'onNodeCreated', function () {
        // ensure at least one slot per configured input group
        inputsCfg.forEach((g) => {
            const start = g.start ?? 1
            const name = `${g.prefix}${start}`
            if (!this.inputs || !this.inputs.some((i) => i.name === name)) {
                this.addInput(name, g.type || '*')
            }
        })
        syncOutputs.call(this)
    })

    chainCallback(nodeType, 'onConnectionsChange', function (type, index, connected, link_info, inputOrOutput) {
        if (!link_info || type !== LiteGraph.INPUT) {
            // still keep outputs in sync when not an input event
            syncOutputs.call(this)
            return
        }

        const stackTrace = new Error().stack || ''
        // if user manually disconnected, allow removal of that input
        if (!connected) {
            if (!stackTrace.includes('LGraphNode.prototype.connect') &&
                !stackTrace.includes('convertToSubgraph') &&
                !stackTrace.includes('pasteFromClipboard') &&
                !stackTrace.includes('LGraphNode.connect') &&
                !stackTrace.includes('loadGraphData')) {
                this.removeInput(index)
            }
        }

        // Renumber each configured group independently; ensure one empty slot per group
        inputsCfg.forEach((g) => {
            let counter = g.start ?? 1
            let hasEmpty = false
            for (const input of this.inputs) {
                if (input.name.startsWith(g.prefix)) {
                    const newName = `${g.prefix}${counter++}`
                    if (input.name !== newName) input.name = newName
                    if (input.link == null) hasEmpty = true
                }
            }
            if (!hasEmpty) {
                this.addInput(`${g.prefix}${counter}`, g.type || '*')
            }
        })

        syncOutputs.call(this)
        this.setDirtyCanvas(true, true)
    })

    /**
     * Internal function that synchronizes outputs to mirror inputs.
     * Creates, removes, and updates output slots to match input slots in count, name, and type.
     * Type information is inferred from the connected link when available.
     * 
     * @this {LGraphNode} - The node instance
     * @returns {void}
     * @private
     */
    function syncOutputs() {
        if (!outputsCfg.mirrorInputs) return
        this.outputs = this.outputs || []
        const inCount = this.inputs?.length || 0
        while (this.outputs.length < inCount) this.addOutput('any', '*')
        while (this.outputs.length > inCount) this.removeOutput(this.outputs.length - 1)
        for (let i = 0; i < inCount; i++) {
            const inSlot = this.inputs[i]
            const outSlot = this.outputs[i]
            if (outSlot.name !== inSlot.name) outSlot.name = inSlot.name
            // try to mirror type from linked input
            let typ = '*'
            const linkId = inSlot.link
            if (linkId != null && this.graph?.links?.[linkId]) {
                const link = this.graph.links[linkId]
                const fromNode = this.graph.getNodeById(link.origin_id)
                const fromSlot = fromNode?.outputs?.[link.origin_slot]
                typ = fromSlot?.type || '*'
            }
            outSlot.type = typ
        }
    }
}
