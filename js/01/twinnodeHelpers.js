/// <reference lib="es2015.collection" />
/** @typedef {import("@comfyorg/litegraph/dist/LGraphNode").LGraphNode} LGraphNode */
/** @typedef {import("@comfyorg/litegraph/dist/LLink").LLink} LLink */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").INodeInputSlot} INodeInputSlot */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").INodeOutputSlot} INodeOutputSlot */
/** @typedef {import("@comfyorg/litegraph/dist/interfaces").ISlotType} ISlotType */
/** @typedef {import("@comfyorg/litegraph/dist/litegraph").LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/litegraph/dist/types/serialisation").SubgraphIO} SubgraphIO */
/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/comfyui-frontend-types').ToastMessageOptions} ToastMessageOptions */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').LGraphCanvas} LGraphCanvas */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').LGraph} LGraph */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').LLink} LLink */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').NodeInputSlot} NodeInputSlot */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').NodeOutputSlot} NodeOutputSlot */
/** @typedef {import('@comfyorg/litegraph/dist/litegraph').Subgraph} Subgraph */
/** @typedef {import("../../typings/ComfyNode").ComfyNode} ComfyNode */
/** @typedef {import("../common/graphHelpersForTwinNodes.js").GraphHelpers} GraphHelpers */
/** @typedef {import("@comfyorg/litegraph/dist/types/widgets").IWidget} IWidget */

import { app } from "../../../scripts/app.js";
import { GraphHelpers } from "../common/graphHelpersForTwinNodes.js";

/**
 * @param {string[]|string} types - Array of types to evaluate for color mapping; if string provided, it will be treated as a single-item array.
 */
export function setColorAndBgColor(types) {
    const node_colors = {
        // litegraph colors
        red:       { color: "#322",    bgcolor: "#533",    groupcolor: "#a88"    },
        brown:     { color: "#332922", bgcolor: "#593930", groupcolor: "#b06634" },
        green:     { color: "#232",    bgcolor: "#353",    groupcolor: "#8a8"    },
        blue:      { color: "#223",    bgcolor: "#335",    groupcolor: "#88a"    },
        pale_blue: { color: "#2a363b", bgcolor: "#3f5159", groupcolor: "#3f789e" },
        cyan:      { color: "#233",    bgcolor: "#355",    groupcolor: "#8aa"    },
        purple:    { color: "#323",    bgcolor: "#535",    groupcolor: "#a1309b" },
        yellow:    { color: "#432",    bgcolor: "#653",    groupcolor: "#b58b2a" },
        black:     { color: "#222",    bgcolor: "#000",    groupcolor: "#444"    },
        // extra colors
        indigo1:   { color: '#334',    bgcolor: '#446',    groupcolor: '#88a'    },
        indigo2:   { color: '#434',    bgcolor: '#646',    groupcolor: '#a8a'    },
        magenta1:  { color: '#424',    bgcolor: '#636',    groupcolor: '#a8a'    },
        magenta2:  { color: '#524',    bgcolor: '#735',    groupcolor: '#a88'    },
        olive:     { color: '#332',    bgcolor: '#553',    groupcolor: '#aa8'    },
        orange:    { color: '#532',    bgcolor: '#743',    groupcolor: '#a88'    },
        teal:      { color: '#244',    bgcolor: '#366',    groupcolor: '#8aa'    },

    }
    const colorMap = {
        'CLIP':         { color: '#432',    bgcolor: '#653',     }, // yellow, kjnodes
        'CONDITIONING': { color: '#332922', bgcolor: '#593930',  }, // brown, kjnodes
        'FLOAT':        { color: '#232',    bgcolor: '#353',     }, // green, kjnodes
        'IMAGE':        { color: '#2a363b', bgcolor: '#3f5159',  }, // pale_blue, kjnodes
        'LATENT':       { color: '#323',    bgcolor: '#535',     }, // purple, kjnodes
        'MODEL':        { color: '#223',    bgcolor: '#335',     }, // blue, kjnodes
        'VAE':          { color: '#322',    bgcolor: '#533',     }, // red, kjnodes

        'NOISE':        { color: '#2e2e2e', bgcolor: '#242121'   }, // custom, kjnodes
        'SAMPLER':      { color: '#614a4a', bgcolor: '#3b2c2c'   }, // custom, kjnodes
        'SIGMAS':       { color: '#485248', bgcolor: '#272e27'   }, // custom, kjnodes
        'MASK':         { color: '#1c5715', bgcolor: '#1f401b'   }, // custom, kjnodes
        'GUIDER':       { color: '#3c7878', bgcolor: '#1c453b'   }, // custom, kjnodes
        'CONTROL_NET':  { color: '#156653', bgcolor: '#1c453b'   }, // custom, kjnodes
        'INT':          { color: '#1b4669', bgcolor: '#29699c'   }, // custom, kjnodes

        'ARGS':         { color: '#434',    bgcolor: '#646',     }, // indigo2
        'EMBED':        { color: '#532',    bgcolor: '#743',     }, // orange
        'BOOLEAN':      { color: '#334',    bgcolor: '#446',     }, // indigo1
        'STRING':       { color: '#332',    bgcolor: '#553',     }, // olive
        'TEXT':         { color: '#332',    bgcolor: '#553',     }, // olive
    };

    const list = Array.isArray(types) ? types : (types != null ? [types] : []);
    const matches = [];

    for (const tRaw of list) {
        const t = (tRaw != null) ? String(tRaw) : "";
        if (!t) continue;

        // Prefer exact match
        if (colorMap[t]) {
            matches.push(colorMap[t]);
        } else {
            // Fallback: partial match (substring)
            for (const key in colorMap) {
                if (t.indexOf(key) !== -1) {
                    matches.push(colorMap[key]);
                    break;
                }
            }
        }

        if (matches.length >= 2) break;
    }

    if (matches.length === 0) {
        return;
    }

    const first = matches[0];
    const firstFg = (first && typeof first === 'object') ? first.color : first;
    const firstBg = (first && typeof first === 'object') ? first.bgcolor : undefined;

    if (matches.length === 1) {
        this.color = firstFg;
        this.bgcolor = firstBg;
        return;
    }

    const second = matches[1];
    const secondBg = (second && typeof second === 'object') ? second.bgcolor : undefined;

    // Foreground from first match; Background from second match (fallback to first if missing)
    this.color = firstFg;
    this.bgcolor = secondBg || firstBg;
}

// Helpers for handling "unlinked" markers (star-suffix)
export function isUnlinkedName(str) {
    if (typeof str !== 'string') return false;
    return str.trim().endsWith('*');
}

export function stripUnlinkedPrefix(str) {
    if (typeof str !== 'string') return '';
    // Remove one or more trailing asterisks
    return str.replace(/\*+$/, '').trim();
}

export function makeUnlinkedName(name) {
    const base = stripUnlinkedPrefix(name);
    // Do not alter the text on disconnect; preserve the original value
    return `${base}`;
}

// Hook the 'value' setter to record the previous value on change
export function wrapWidgetValueSetter(widget) {
    try {
        if (!widget || typeof widget !== 'object') return;
        if (widget.__previousHooked) return;

        // Find the accessor descriptor up the prototype chain
        let proto = widget;
        let desc = null;
        while (proto && !desc) {
            desc = Object.getOwnPropertyDescriptor(proto, 'value');
            proto = Object.getPrototypeOf(proto);
        }
        if (!desc || typeof desc.set !== 'function') {
            widget.__previousHooked = true; // avoid repeated attempts
            return;
        }
        const origGet = typeof desc.get === 'function' ? desc.get : null;
        const origSet = desc.set;

        Object.defineProperty(widget, 'value', {
            configurable: true,
            enumerable: desc.enumerable ?? true,
            get: function () {
                return origGet ? origGet.call(this) : undefined;
            },
            set: function (v) {
                const current = origGet ? origGet.call(this) : undefined;
                // Consider invalid a string that is empty (after trim) or equals '*'
                const vt = (typeof v === 'string') ? v.trim() : v;
                const isInvalidString = (typeof v === 'string') && (vt === '' || vt === '*');
                console.log(`[wrapWidgetValueSetter] ${current} -> ${v}`);

                if (current !== v && !isInvalidString) {
                    try {
                        // Store previous value on change
                        this["#previous"] = current;
                    } catch (_e) {
                        // ignore if we cannot set
                    }
                }
                return origSet.call(this, v);
            }
        });

        // Expose a method to fetch the previous name/value
        if (typeof widget.getPreviousName !== 'function') {
            Object.defineProperty(widget, 'getPreviousName', {
                value: function () {
                    return this["#previous"];
                },
                writable: false,
                enumerable: false,
                configurable: true
            });
        }

        Object.defineProperty(widget, '__previousHooked', {
            value: true,
            writable: false,
            enumerable: false,
            configurable: false
        });
    } catch (_err) {
        // best-effort; ignore errors
    }
}

/**
 * Display a toast message with a custom icon and color.
 * @param detail
 * @param {ToastMessageOptions} options - Toast message configuration options
 * @param {'success' | 'info' | 'warn' | 'error' | 'secondary' | 'contrast'} [options.severity='info'] - Severity level of the message.
 * @param {string} [options.summary] - Summary content of the message.
 * @param {*} [options.detail] - Detail content of the message.
 * @param {boolean} [options.closable=true] - Whether the message can be closed manually using the close icon.
 * @param {number} [options.life] - Delay in milliseconds to close the message automatically.
 * @param {string} [options.group] - Key of the Toast to display the message.
 * @param {*} [options.styleClass] - Style class of the message.
 * @param {*} [options.contentStyleClass] - Style class of the content.
 */
export function showAlert(detail, options = {}) {
    return app.extensionManager.toast.add({
        severity: 'warn',
        summary: "Get/SetTwinNodes",
        detail: detail,
        life: 5000,
        ...options
    })
}

export function findSetters(node, name = undefined) {
    // noinspection DuplicatedCode
    if (!(node instanceof LiteGraph.LGraphNode)) {
        throw new Error("node parameter must be instance of LGraphNode");
    }
    const sourceNames = Array.isArray(node.widgets) ? node.widgets.map(w => (w && w.value != null ? String(w.value).trim() : "")) : [];
    const names = name ? [name] : sourceNames.filter(v => !!v);
    // console.log("[findSetters]", { node: node, names: names });
    if (names.length === 0) return [];
    const nameSet = new Set(names);
    return GraphHelpers.getNodesByType(node.graph, ['SetTwinNodes', 'SetNode']).filter(otherNode =>
        Array.isArray(otherNode.widgets) &&
        otherNode.widgets.some(widget => {
            // console.log("[findSetters] widget", { widget: widget });
            const widgetValue = widget && widget.value != null ? String(widget.value).trim() : "";
            return widgetValue && nameSet.has(widgetValue);
        })
    );
}

/**
 * @param {GetTwinNodes|ComfyNode} node - The input node containing widgets and a graph. This node is used to determine
 *                        the set of values to filter getter nodes against. The `node` object is expected
 *                        to have the properties `widgets` (an array) and `graph` (a reference to the graph instance).
 * @return {ComfyNode} - An array of getter nodes that meet the matching criteria. If no matches or values are found,
 *                   an empty array is returned.
 */
export function findSetter(node, name = undefined) {
    const setters = findSetters(node, name);
    if (setters.length) {
        return setters[0];
    }
    return null;
}

// Match GetTwinNodes if they share at least one name with this node
// If checkForPreviousName is true, use the previousNames snapshot; otherwise use current widget values.
export function findGetters(node, checkForPreviousName, widgetIndex) {
    if (!(node instanceof LiteGraph.LGraphNode)) {
        throw new Error("node parameter must be instance of LGraphNode");
    }

    // Collect all candidate raw values (either previousNames or current widget values)
    const allCandidates = checkForPreviousName
        ? (Array.isArray(node.properties?.previousNames) ? node.properties.previousNames : [])
        : (Array.isArray(node.widgets) ? node.widgets.map(w => (w && w.value != null ? w.value : "")) : []);

    // If a widget index is provided, only consider that one value; otherwise, consider all
    const candidates = widgetIndex != null ? [allCandidates[widgetIndex]] : allCandidates;

    // Normalize to trimmed strings and drop empty values
    const names = candidates
        .map(v => (v != null ? String(v).trim() : ""))
        .filter(v => v !== "");

    // console.log("[findGetters]", { node: node, checkForPreviousName: checkForPreviousName, widgetIndex: widgetIndex, names: names });
    if (!node.graph || names.length === 0) return [];
    const nameSet = new Set(names);

    return GraphHelpers.getNodesByType(node.graph, 'GetTwinNodes').filter(otherNode =>
        Array.isArray(otherNode.widgets) &&
        otherNode.widgets.some(w => {
            const val = w && w.value != null ? String(w.value).trim() : "";
            return val && nameSet.has(val);
        })
    );
}

export function propagateToGetters(node) {
    console.log("[propagateToGetters]", { node: node });
    const types = (node.inputs || []).map(input => input?.type || '*');
    const getters = findGetters(node);
    getters.forEach(/** TwinNodes */ getter => {
        if (getter.setTypesArray) {
            getter.setTypesArray(types);
        } else if (getter.setTypes) {
            getter.setTypes(types[0] || '*', types[1] || '*');
        }
    });

    // Broadcast rename events so getters can update their widget values
    try {
        const g = node && node.graph;
        if (g && typeof g.sendEventToAllNodes === "function") {
            const currNames = Array.isArray(node.widgets)
                ? node.widgets.map(w => (w && w.value != null ? String(w.value).trim() : ""))
                : [];
            const prevNames = Array.isArray(node.properties?.previousNames)
                ? node.properties.previousNames
                : [];
            const maxLen = Math.max(prevNames.length, currNames.length);
            for (let i = 0; i < maxLen; i++) {
                const prev = (prevNames[i] || "").trim();
                const next = (currNames[i] || "").trim();
                if (prev && next && prev !== next) {
                    g.sendEventToAllNodes("setnodeNameChange", {
                        prev,
                        next,
                        index: i,
                        setterId: node.id
                    });
                }
            }
        }
    } catch (_e) {
        // ignore broadcast errors
    }
}

// Slot management helper functions
export function ensureInputSlots(node, count) {
    console.log("[ensureInputSlots] count:", count);
    while ((node.inputs?.length || 0) < count) node.addInput("*", "*");
    while ((node.inputs?.length || 0) > count) node.removeInput(node.inputs.length - 1);
}

export function ensureOutputSlots(node, count) {
    console.log("[ensureOutputSlots] count:", count);
    while ((node.outputs?.length || 0) < count) node.addOutput("*", "*");
    while ((node.outputs?.length || 0) > count) node.removeOutput(node.outputs.length - 1);
}

/** @param {TwinNodes} node */
export function ensureSlotCounts(node) {
    const inputCount = node.numberOfInputSlots;
    const outputCount = node.numberOfOutputSlots;
    ensureInputSlots(node, inputCount);
    ensureOutputSlots(node, outputCount);
}

// Widget management helper functions
export function ensureWidgetCount(node, count, widgetType, namePrefix, callback, options) {
    console.log("[ensureWidgetCount] count:", count, "type:", widgetType);
    const current = node.widgets?.length || 0;
    for (let i = current; i < count; i++) {
        const idx = i;
        const widget = node.addWidget(
            widgetType,
            `${namePrefix} ${idx + 1}`,
            "",
            callback ? (...args) => callback(idx, ...args) : undefined,
            options || {}
        );
        // Hook the value setter to track previous value
        wrapWidgetValueSetter(widget);
    }
}

export function normalizeWidgetLabels(node, namePrefix) {
    console.log("[normalizeWidgetLabels] namePrefix:", namePrefix);
    if (!Array.isArray(node.widgets)) return;
    for (let i = 0; i < node.widgets.length; i++) {
        if (node.widgets[i] && typeof node.widgets[i].name !== "undefined") {
            node.widgets[i].name = `${namePrefix} ${i + 1}`;
        }
    }
}

// Link validation helper function
export function validateNodeLinks(node) {
    console.log("[validateNodeLinks]");
    if (!node.outputs) return;

    for (let i = 0; i < node.outputs.length; i++) {
        if (node.outputs[i].type !== '*' && node.outputs[i].links) {
            node.outputs[i].links.filter(linkId => {
                const link = GraphHelpers.getLink(node.graph, linkId);
                return link && (!link.type.split(",").includes(node.outputs[i].type) && link.type !== '*');
            }).forEach(linkId => {
                console.log("[validateNodeLinks] Removing invalid link", linkId);
                GraphHelpers.removeLink(node.graph, linkId);
            });
        }
    }
}

// Widget name validation helper function
/**
 * Validates and ensures the uniqueness of a widget's name within a graph structure.
 * If the name conflicts with other widget values in `SetTwinNodes` nodes in the graph,
 * it appends a numeric suffix to resolve the conflict.
 *
 * @param {Object} node - The node containing the widget to validate.
 * @param {number} idx - The index of the widget in the node's widget list to validate.
 * @return {void} This function does not return a value.
 */
export function validateWidgetName(node, idx) {
    const graph = node.graph;
    if (!graph || !node.widgets || !node.widgets[idx]) return;
    let base = String(node.widgets[idx].value || "").trim();
    if (!base) return;

    // Collect every widget value from all SetTwinNodes (excluding this exact widget)
    const existingValues = new Set();
    graph._nodes.forEach(otherNode => {
        if (otherNode && otherNode.type === 'SetTwinNodes' && Array.isArray(otherNode.widgets)) {
            otherNode.widgets.forEach((w, wi) => {
                if (!w) return;
                if (otherNode === node && wi === idx) return; // skip self at same index
                const v = (w.value != null) ? String(w.value).trim() : "";
                if (v) existingValues.add(v);
            });
        }
    });

    // If base collides, append _0, _1, ...
    if (existingValues.has(base)) {
        let tries = 0;
        let candidate = `${base}_${tries}`;
        while (existingValues.has(candidate)) {
            tries++;
            candidate = `${base}_${tries}`;
        }
        node.widgets[idx].value = candidate;
    }
    node.update();
}

// Slot label helper function
export function getPreferredSlotLabel(fromNode, originSlotIndex) {
    console.log("[getPreferredSlotLabel]");
    const srcSlot = fromNode?.outputs?.[originSlotIndex];
    const lbl = srcSlot?.label || srcSlot?.name || srcSlot?.type;
    return (lbl && String(lbl).trim()) || "";
}

// Previous name helper function
export function getPreviousWidgetName(node, idx) {
    const w = node.widgets && node.widgets[idx];
    if (!w) return undefined;
    if (typeof w.getPreviousName === 'function') return w.getPreviousName();
    return w["#previous"];
}
