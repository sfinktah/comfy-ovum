/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").INodeInputSlot} INodeInputSlot */
import { log } from "../common/logger.js";
import {last} from "./graphHelpers.js";

function getNodeDynamicConfig(node) {
    try {
        const getParsed = node?.getParsedDynamicInputs || node?.constructor?.getDynamicInput;
        const parsed = typeof getParsed === "function" ? (node.getParsedDynamicInputs?.() ?? node.constructor.getDynamicInput?.()) : undefined;
        if (!parsed || typeof parsed !== "object") return undefined;
        return parsed;
    } catch {
        return undefined;
    }
}

export function getDynamicInputs(node, cfg) {
    /** @type {INodeInputSlot[]} */
    const inputs = node?.inputs;
    if (!inputs) {
        return [];
    }
    const dynCfg = cfg || getNodeDynamicConfig(node);
    const nameRegex = dynCfg?.dynamicInputs?.nameRegex ? new RegExp(dynCfg.dynamicInputs.nameRegex) : /^arg\d+$/;
    const nameIndexBase = Number.isFinite(dynCfg?.dynamicInputs?.nameIndex) ? dynCfg.dynamicInputs.nameIndex : 0;

    let logicalCounter = 0;
    return inputs
        .map(function (input, index) {
            return {input, index};
        })
        .filter(o => o.input && typeof o.input.name === "string" && nameRegex.test(o.input.name))
        .map((o) => {
            // Compute logicalIndex from current order; ignore name numeric part because regex/format can vary
            const logicalIndex = logicalCounter++;
            return {...o, logicalIndex, nameIndex: nameIndexBase + logicalIndex};
        });
}

export function getInputArgNumber(input) {
    // Backward compatibility: assumes names like argN
    return parseInt(String(input.name).replace(/\D+/g, ""), 10);
}

export function ensureDynamicInputsImpl(node, isConnecting) {
    try {
        const cfg = getNodeDynamicConfig(node);
        const nameFmt = cfg?.dynamicInputs?.nameFormat || "arg${index}";
        const nameIndexBase = Number.isFinite(cfg?.dynamicInputs?.nameIndex) ? cfg.dynamicInputs.nameIndex : 0;
        const labelFmt = cfg?.dynamicInputs?.labelFormat; // optional
        const labelIndexBase = Number.isFinite(cfg?.dynamicInputs?.labelIndex) ? cfg.dynamicInputs.labelIndex : undefined;
        const defaultType = cfg?.dynamicInputs?.type || "*";
        const preserveUserLabels = cfg?.dynamicInputs?.preserveUserLabels === true;

        let dynamicInputs = getDynamicInputs(node, cfg);

        // Ensure at least one exists
        if (dynamicInputs.length === 0) {
            const firstName = nameFmt.replaceAll("${index}", String(nameIndexBase));
            node.addInput(firstName, defaultType, {forceInput: true});
            dynamicInputs = getDynamicInputs(node, cfg);
        }

        // Normalize names and labels
        for (const {input, logicalIndex} of dynamicInputs) {
            const desiredName = nameFmt.replaceAll("${index}", String(nameIndexBase + logicalIndex));
            if (input.name !== desiredName) {
                log({class: "ensureDynamicInputsImpl", method: "ensureDynamicInputsImpl", severity: "warn", tag: "input_mismatch"},
                    `node #${node.id} input index mismatch, renaming input ${input.name} to ${desiredName}`);
                // If label looked auto-generated from the old name, clear it so we'll regenerate off the new name
                if (input.label && (input.label === input.name || input.label.startsWith(input.name + " "))) {
                    input.label = undefined;
                }
                input.name = desiredName;
            }
            const wantLabel = labelFmt && (labelIndexBase !== undefined)
                ? labelFmt.replaceAll("${index}", String(labelIndexBase + logicalIndex))
                : undefined;

            // Decide whether to overwrite label
            let shouldSetLabel = true;
            if (preserveUserLabels) {
                // If user has customized the label away from defaults, keep it
                const current = input.label ?? "";
                const isEmpty = !current || current.trim() === "";
                const looksAutoFromName = current === input.name || current.startsWith(input.name + " ");
                const matchesWant = wantLabel && current === wantLabel;
                if (!isEmpty && !looksAutoFromName && !matchesWant) {
                    shouldSetLabel = false;
                }
            }

            if (shouldSetLabel) {
                if (wantLabel) {
                    input.label = wantLabel;
                } else if (!input.label || input.label === input.name || input.label.split(' ')[0] === input.name) {
                    const inputType = input.type || defaultType;
                    input.label = `${input.name} ${inputType}`;
                }
            }

            // Ensure input.type aligns with defaultType when it was wildcarded
            if (!input.type) input.type = defaultType;
        }

        // If the last dynamic input has a link, append a new trailing input
        let lastInput = last(dynamicInputs)?.input;
        if (lastInput && lastInput.link != null) {
            const nextLogical = dynamicInputs[dynamicInputs.length - 1].logicalIndex + 1;
            const nextName = nameFmt.replaceAll("${index}", String(nameIndexBase + nextLogical));
            node.addInput(nextName, defaultType);
        }

        // When disconnecting, trim trailing unused inputs leaving exactly one empty at the end
        if (!isConnecting) {
            while (true) {
                dynamicInputs = getDynamicInputs(node, cfg);
                if (dynamicInputs.length < 2) break;
                const lastInp = dynamicInputs[dynamicInputs.length - 1].input;
                const prevInp = dynamicInputs[dynamicInputs.length - 2].input;
                if (lastInp.link == null && prevInp.link == null) {
                    const lastIdx = dynamicInputs[dynamicInputs.length - 1].index;
                    node.removeInput(lastIdx);
                    dynamicInputs.splice(-1, 1);
                } else {
                    break;
                }
            }
        }
    } catch (err) {
        log({class: "ensureDynamicInputsImpl", method: "ensureDynamicInputsImpl", severity: "warn", tag: "input_mismatch"},
            `node #${node.id} ensureDynamicInputsFailed: ${err?.message}`, err?.stack);
    }
}
