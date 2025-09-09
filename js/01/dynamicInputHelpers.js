/** @typedef {import("@comfyorg/comfyui-frontend-types").INodeInputSlot} INodeInputSlot */
import { log } from "../common/logger.js";
import {last} from "./graphHelpers.js";

export function getDynamicInputs(node) {
    /** @type {INodeInputSlot[]} */
    const inputs = node?.inputs;
    if (!inputs) {
        // console.log('[ovum.format] getDynamicInputs: no inputs found on node', node?.id, 'node.inputs:', inputs, 'node.name:', node?.name, 'node.type:', node?.type, 'node.constructor.name:', node?.constructor.name, 'node.constructor.toString():', node?.constructor.toString(), 'node.constructor.toString().split(\' \'):', node?.constructor.toString().split(''))
        return [];
    }
    return inputs
        .map(/**
         * Creates and returns an object containing the provided input and index.
         *
         * @param {INodeInputSlot} input - The value to be assigned to the "input" property of the returned object.
         * @param {number} index - The value to be assigned to the "index" property of the returned object.
         * @returns {{input: INodeInputSlot, index: number}} An object containing "input" property of type INodeInputSlot and "index" property of type number.
         */
        function (input, index) {
            return {input, index};
        })
        .filter(o => o.input && typeof o.input.name === "string" && /^arg\d+$/.test(o.input.name))
        .map((o, key) => ({...o, logicalIndex: key}))
        // // Sorting them is just going to get super confusing
        // .sort((a, b) => {
        //     const an = getInputArgNumber(a);
        //     const bn = getInputArgNumber(b);
        //     return an - bn;
        // });
}


export function getInputArgNumber(input) {
    return parseInt(input.name.substring(3), 10);
}

export function ensureDynamicInputsImpl(node, isConnecting) {
    try {
        let dynamicInputs = getDynamicInputs(node);

        // Ensure at least arg0 exists (backend should add it, but be defensive)
        if (dynamicInputs.length === 0) {
            node.addInput("arg0", "*", {forceInput: true});
            dynamicInputs = getDynamicInputs(node);
        }

        // Give inputs pretty labels if they don't have user assigned labels
        for (const {input, index, logicalIndex} of dynamicInputs) {
            const argNumber = getInputArgNumber(input);
            if (argNumber !== logicalIndex) {
                log({class: "formatter", method: "ensureDynamicInputsImpl", severity: "warn", tag: "input_mismatch"},
                    `input index mismatch, renaming input #${index} from ${input.name} to arg${logicalIndex}`);
                if (input.label && (input.label.startsWith(input.name) || input.label.startsWith("arg"))) {
                    // can we just set this to empty or null or something?
                    // Yes, we can set it to undefined (null probably works, but undefined is what it actually is)
                    input.label = undefined;
                }
                input.name = `arg${logicalIndex}`;
            }
            if (!input.label || input.label === input.name || input.label.split(' ')[0] === input.name) {
                const t = input.type || "*";
                input.label = `arg${argNumber} ${t}`;
            }
        }
        // If the last dynamic input has a link, append a new trailing argN
        let lastInput = last(dynamicInputs)?.input;
        if (lastInput && lastInput.link != null) {
            const nextNum = getInputArgNumber(lastInput) + 1;
            node.addInput(`arg${nextNum}`, "*");
            // return; // addInput already dirties the canvas
        }

        // When disconnecting, trim trailing unused inputs leaving exactly one empty at the end
        if (!isConnecting) {
            // Repeatedly remove the last input if the last two are both unlinked
            // This keeps one unlinked trailing input
            while (true) {
                dynamicInputs = getDynamicInputs(node);
                if (dynamicInputs.length < 2) break;
                const lastInp = dynamicInputs[dynamicInputs.length - 1].input;
                const prevInp = dynamicInputs[dynamicInputs.length - 2].input;
                if (lastInp.link == null && prevInp.link == null) {
                    // Remove the last one
                    // Recompute index each loop to avoid stale indices after removal
                    
                    // What loop?  Oh, we're in a while (true)! But I think we can be smarter here, and splice out
                    // the last entry after we've removed the physical input.
                    // const fresh = getDynamicInputs(node);
                    
                    // const lastIdx = node.inputs.indexOf(lastInp);
                    const lastIdx = dynamicInputs[dynamicInputs.length - 1].index
                    // if (lastIdx === -1) {
                    //     log({class: "formatter", method: "ensureDynamicInputsImpl", severity: "warn", tag: "input_mismatch"}, `input index not found while removing extra input`);
                    //     break;
                    // }
                    node.removeInput(lastIdx);
                    // This is smarter than recomputing via getDynamicInputs. Could use pop perhaps?
                    dynamicInputs.splice(-1, 1);
                } else {
                    break;
                }
            }
        }
    } catch (err) {
        log({class: "formatter", method: "ensureDynamicInputsImpl", severity: "warn", tag: "input_mismatch"},
            `ensureDynamicInputsFailed: ${err.message}`, err.stack);
    }
}
