/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */

import { app } from "../../../scripts/app.js";
import { graphGetNodeById } from "../01/graphHelpers.js";
import { chainCallback } from "../01/utility.js";

app.registerExtension({
    name: "ovum.format",
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        // Target the Python class that supports many dynamic inputs
        if (nodeType?.comfyClass !== "TextFormatManyInputs") return;

        chainCallback(nodeType.prototype, "onNodeCreated", function () {
            const node = this;

            const getDynamicInputs = () => {
                const inputs = Array.isArray(node.inputs) ? node.inputs : [];
                return inputs
                    .map((inp, idx) => ({ inp, idx }))
                    .filter(o => o.inp && typeof o.inp.name === "string" && /^arg\d+$/.test(o.inp.name))
                    .sort((a, b) => {
                        const an = parseInt(a.inp.name.substring(3), 10);
                        const bn = parseInt(b.inp.name.substring(3), 10);
                        return an - bn;
                    });
            };

            const ensureDynamicInputs = (isConnecting = true) => {
                try {
                    let dyn = getDynamicInputs();

                    // Ensure at least arg0 exists (backend should add it, but be defensive)
                    if (dyn.length === 0) {
                        node.addInput("arg0", "*", { label: "arg0", forceInput: true });
                        dyn = getDynamicInputs();
                    }

                    // Normalize labels for existing dynamic inputs
                    for (const { inp } of dyn) {
                        const n = inp.name.substring(3);
                        if (!inp.label) {
                            const t = inp.type || "*";
                            inp.label = (t && t !== "*") ? `arg${n} ${t}` : `arg${n}`;
                        }
                    }

                    // If the last dynamic input has a link, append a new trailing argN
                    let last = dyn[dyn.length - 1]?.inp;
                    if (last && last.link != null) {
                        const lastNum = parseInt(last.name.substring(3), 10);
                        const nextNum = lastNum + 1;
                        node.addInput(`arg${nextNum}`, "*", { label: `arg${nextNum}` });
                        return; // addInput already dirties the canvas
                    }

                    // When disconnecting, trim trailing unused inputs leaving exactly one empty at the end
                    if (!isConnecting) {
                        // Repeatedly remove the last input if the last two are both unlinked
                        // This keeps one unlinked trailing input
                        while (true) {
                            dyn = getDynamicInputs();
                            if (dyn.length < 2) break;
                            const lastInp = dyn[dyn.length - 1].inp;
                            const prevInp = dyn[dyn.length - 2].inp;
                            if (lastInp.link == null && prevInp.link == null) {
                                // Remove the last one
                                // Recompute index each loop to avoid stale indices after removal
                                const fresh = getDynamicInputs();
                                const lastIdx = fresh[fresh.length - 1].idx;
                                node.removeInput(lastIdx);
                            } else {
                                break;
                            }
                        }
                    }
                } catch (err) {
                    console.warn("[formatter] ensureDynamicInputs failed:", err);
                }
            };

            // Initialize once created
            ensureDynamicInputs(false);

            // Update labels/types and manage dynamic slots on connect/disconnect
            chainCallback(node, "onConnectionsChange", function (slotType, slot, isConnecting, linkInfo, output) {
                try {
                    if (slotType !== LiteGraph.INPUT) return;
                    const input = this.inputs?.[slot];
                    if (!input || !/^arg\d+$/.test(input.name)) {
                        // Only react to argN inputs
                        ensureDynamicInputs(isConnecting);
                        return;
                    }

                    if (isConnecting && linkInfo) {
                        const fromNode = graphGetNodeById(linkInfo.origin_id) || app.graph?.getNodeById?.(linkInfo.origin_id);
                        const type = fromNode?.outputs?.[linkInfo.origin_slot]?.type ?? "*";
                        input.type = type || "*";
                        if (input.type !== "*") {
                            input.label = input.name + ` ${input.type.toLowerCase()}`
                        } else {
                            input.label = input.name;
                        }
                    } else if (!isConnecting) {
                        // Reset to wildcard on disconnect
                        input.type = "*";
                        input.label = input.name;
                    }

                    ensureDynamicInputs(isConnecting);
                } catch (err) {
                    console.warn("[formatter] onConnectionsChange error:", err);
                }
            });
        });
    },
});
