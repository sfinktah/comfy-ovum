export function getDynamicInputs(node) {
    /** @type {INodeInputSlot[]} */
    const inputs = node.inputs;
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
        .sort((a, b) => {
            const an = parseInt(a.input.name.substring(3), 10);
            const bn = parseInt(b.input.name.substring(3), 10);
            return an - bn;
        });
}



export function ensureDynamicInputsImpl(node, isConnecting) {
    try {
        let dyn = getDynamicInputs(node);

        // Ensure at least arg0 exists (backend should add it, but be defensive)
        if (dyn.length === 0) {
            node.addInput("arg0", "*", {label: "arg0", forceInput: true});
            dyn = getDynamicInputs(node);
        }

        // Normalize labels for existing dynamic inputs
        for (const {input} of dyn) {
            const n = input.name.substring(3);
            if (!input.label) {
                const t = input.type || "*";
                input.label = (t && t !== "*") ? `arg${n} ${t}` : `arg${n}`;
            }
        }

        // If the last dynamic input has a link, append a new trailing argN
        let last = dyn[dyn.length - 1]?.input;
        if (last && last.link != null) {
            const lastNum = parseInt(last.name.substring(3), 10);
            const nextNum = lastNum + 1;
            node.addInput(`arg${nextNum}`, "*", {label: `arg${nextNum}`});
            return; // addInput already dirties the canvas
        }

        // When disconnecting, trim trailing unused inputs leaving exactly one empty at the end
        if (!isConnecting) {
            // Repeatedly remove the last input if the last two are both unlinked
            // This keeps one unlinked trailing input
            while (true) {
                dyn = getDynamicInputs(node);
                if (dyn.length < 2) break;
                const lastInp = dyn[dyn.length - 1].input;
                const prevInp = dyn[dyn.length - 2].input;
                if (lastInp.link == null && prevInp.link == null) {
                    // Remove the last one
                    // Recompute index each loop to avoid stale indices after removal
                    const fresh = getDynamicInputs(node);
                    const lastIdx = fresh[fresh.length - 1].index;
                    node.removeInput(lastIdx);
                } else {
                    break;
                }
            }
        }
    } catch (err) {
        console.warn("[formatter] ensureDynamicInputs failed:", err);
    }
}
