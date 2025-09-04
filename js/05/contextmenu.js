/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/litegraph').LiteGraph} LiteGraph */
/** @typedef {import('../01/typedefs.js').INodeInputSlot} INodeInputSlot */

import {app} from "../../../scripts/app.js";

// Stolen from Kijai
// Adds context menu entries, code partly from pyssssscustom-scripts

function addMenuHandler(nodeType, cb) {
    const getOpts = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function () {
        const r = getOpts.apply(this, arguments);
        cb.apply(this, arguments);
        return r;
    };
}

function addNode(name, nextTo, options) {
    console.log("name:", name);
    console.log("nextTo:", nextTo);
    options = { side: "left", select: true, shiftY: 0, shiftX: 0, ...(options || {}) };
    const node = LiteGraph.createNode(name);
    app.graph.add(node);

    node.pos = [
        options.side === "left" ? nextTo.pos[0] - (node.size[0] + options.offset): nextTo.pos[0] + nextTo.size[0] + options.offset,

        nextTo.pos[1] + options.shiftY,
    ];
    if (options.select) {
        app.canvas.selectNode(node, false);
    }
    return node;
}

app.registerExtension({
    name: "OvumContextMenu",
    async setup(app) {
        const updateSlots = (value) => {
            const valuesToAddToIn = ["GetTwinNodes"];
            const valuesToAddToOut = ["SetTwinNodes"];
            // Remove entries if they exist
            for (const arr of Object.values(LiteGraph.slot_types_default_in)) {
                for (const valueToAdd of valuesToAddToIn) {
                    const idx = arr.indexOf(valueToAdd);
                    if (idx !== -1) {
                        arr.splice(idx, 1);
                    }
                }
            }

            for (const arr of Object.values(LiteGraph.slot_types_default_out)) {
                for (const valueToAdd of valuesToAddToOut) {
                    const idx = arr.indexOf(valueToAdd);
                    if (idx !== -1) {
                        arr.splice(idx, 1);
                    }
                }
            }
            if (value!="disabled") {
                for (const arr of Object.values(LiteGraph.slot_types_default_in)) {
                    for (const valueToAdd of valuesToAddToIn) {
                        const idx = arr.indexOf(valueToAdd);
                        if (idx !== -1) {
                            arr.splice(idx, 1);
                        }
                        if (value === "top") {
                            arr.unshift(valueToAdd);
                        } else {
                            arr.push(valueToAdd);
                        }
                    }
                }

                for (const arr of Object.values(LiteGraph.slot_types_default_out)) {
                    for (const valueToAdd of valuesToAddToOut) {
                        const idx = arr.indexOf(valueToAdd);
                        if (idx !== -1) {
                            arr.splice(idx, 1);
                        }
                        if (value === "top") {
                            arr.unshift(valueToAdd);
                        } else {
                            arr.push(valueToAdd);
                        }
                    }
                }
            }
        };

        app.ui.settings.addSetting({
            id: "ovum.SetGetMenu",
            name: "ovum: Make Set/Get -nodes defaults",
            tooltip: 'Adds Set/Get nodes to the top or bottom of the list of available node suggestions.',
            options: ['disabled', 'top', 'bottom'],
            defaultValue: 'disabled',
            type: "combo",
            onChange: updateSlots,

        });
        app.ui.settings.addSetting({
            id: "ovum.nodeAutoColor",
            name: "ovum: Automatically set node colors",
            type: "boolean",
            defaultValue: true,
        });
        app.ui.settings.addSetting({
            id: "ovum.disablePrefix",
            name: "ovum: Disable automatic Set_ and Get_ prefix",
            defaultValue: true,
            type: "boolean",
        });
    }
});
