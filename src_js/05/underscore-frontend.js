/** @typedef {import("@comfyorg/comfyui-frontend-types").ComfyApp} ComfyApp */
/** @typedef {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} ComfyNodeDef */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */

import {app} from "../../../scripts/app.js";
import {chainCallback} from "../01/utility.js";
import {inspectUpstream} from "../common/ovum_helpers.js";
import {Logger} from "../common/logger.js";
import {$el} from "../common/ui.js";
import {convertToWidget, fixWidgets} from "../mtb/utils/widgets.js";

// Frontend enhancements for ovum/underscore nodes
// Loosely based on image-list-dynamic.js
// - Detect the primary input (py_list, py_dict, list_or_dict, py_func, obj)
// - When the primary input is connected to a _.CHAIN output, visually switch
//   the primary input and first output sockets to shape 5 (chain look)
// - Revert shapes when disconnected or when the upstream is not a chain

// Fetch and cache underscore methods metadata (signatures, descriptions, examples)
let _usMethodsCache = null;
let _usMethodsPromise = null;
async function getUnderscoreMethods() {
    try {
        if (_usMethodsCache) return _usMethodsCache;
        if (!_usMethodsPromise) {
            _usMethodsPromise = fetch("/ovum/web/underscore/methods.json", { cache: "no-store" })
                .then((r) => r.ok ? r.json() : ({}))
                .catch(() => ({}));
        }
        _usMethodsCache = await _usMethodsPromise;
        return _usMethodsCache;
    } catch (_) {
        return {};
    }
}

function methodNameFromNode(nodeData, nodeType) {
    // Attempt to resolve the actual underscore.js method key used in methods.json
    // Strategy:
    // 1) explicit field if provided in nodeData (us_method or method)
    // 2) derive from nodeData.name by stripping "_." and camelizing (spaces, dashes, underscores)
    // 3) derive from constructor/class name: strip leading "Underscore" and lower-case first letter
    try {
        Logger.log({ class: "ovum.underscore.ui", method: "methodNameFromNode", severity: "debug" }, "enter", { nodeName: nodeData?.name, nodeTypeName: nodeType?.name });
    } catch (_) {}
    try {
        const explicit = nodeData?.us_method || nodeData?.method;
        if (explicit) {
            Logger.log({ class: "ovum.underscore.ui", method: "methodNameFromNode", severity: "debug" }, "using explicit method override", explicit);
            return String(explicit);
        }
    } catch(_) {}
    let nameFromNode = String(nodeData?.name || "");
    if (nameFromNode.startsWith("_.")) nameFromNode = nameFromNode.slice(2);

    const toCamelLower = (s) => {
        try {
            const parts = String(s).split(/[^a-zA-Z0-9]+/).filter(Boolean);
            if (parts.length === 0) return "";
            const first = parts[0].charAt(0).toLowerCase() + parts[0].slice(1);
            const rest = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1));
            const out = [first, ...rest].join("");
            try { Logger.log({ class: "ovum.underscore.ui", method: "methodNameFromNode", severity: "debug" }, "toCamelLower", { in: s, out }); } catch(_) {}
            return out;
        } catch(_) { return String(s || ""); }
    };
    const lowerFirst = (s) => {
        const out = (s ? (s.charAt(0).toLowerCase() + s.slice(1)) : s);
        try { Logger.log({ class: "ovum.underscore.ui", method: "methodNameFromNode", severity: "debug" }, "lowerFirst", { in: s, out }); } catch(_) {}
        return out;
    };

    // If name contains separators or spaces, camelize; otherwise just lower the first letter
    const hasSep = /[\s_-]/.test(nameFromNode);
    let derived = hasSep ? toCamelLower(nameFromNode) : lowerFirst(nameFromNode);
    // try { Logger.log({ class: "ovum.underscore.ui", method: "methodNameFromNode", severity: "debug" }, "derived from node name", { nameFromNode, hasSep, derived }); } catch(_) {}

    // As a fallback, try deriving from the class/constructor name
    try {
        const ctor = String(nodeType?.name || "");
        if (ctor.startsWith("Underscore")) {
            const tail = ctor.slice("Underscore".length);
            const lf = lowerFirst(tail);
            try { Logger.log({ class: "ovum.underscore.ui", method: "methodNameFromNode", severity: "debug" }, "derived from ctor", { ctor, tail, lf }); } catch(_) {}
            if (tail) derived = lf;
        }
    } catch(_) {}

    try { Logger.log({ class: "ovum.underscore.ui", method: "methodNameFromNode", severity: "debug" }, "result", derived || nameFromNode); } catch(_) {}
    return derived || nameFromNode;
}

function methodNameFromTitle(node) {
    // try {
        const t = String(node?.title || "");
        const withoutPrefix = t.startsWith("_.") ? t.slice(2) : t;
        Logger.log({ class: "ovum.underscore.ui", method: "methodNameFromTitle", severity: "debug" }, "derived from title", { t, withoutPrefix });
        return withoutPrefix.trim();
    // } catch (_) {
    //     return "";
    // }
}

function hasUnderscoreMetadata(methods, method) {
    try {
        const sig = methods?._UNDERSCORE_SIGNATURE?.[method];
        const desc = methods?._DESCRIPTION_OVERRIDES?.[method];
        const ex = methods?._CODE_EXAMPLES?.[method];
        return (Array.isArray(sig) && sig.length > 0) || !!desc || !!ex;
    } catch(_) {
        return false;
    }
}

// Try to resolve the best underscore method key by scanning methods.json keys and
// checking if any of them match the end of our node name (display/class), case-insensitive.
function resolveMethodFromMethods(methods, nodeData, nodeType, initial) {
    try {
        const keys = new Set();
        try { Object.keys(methods?._UNDERSCORE_SIGNATURE || {}).forEach(k => keys.add(k)); } catch(_) {}
        try { Object.keys(methods?._DESCRIPTION_OVERRIDES || {}).forEach(k => keys.add(k)); } catch(_) {}
        try { Object.keys(methods?._CODE_EXAMPLES || {}).forEach(k => keys.add(k)); } catch(_) {}
        const allKeys = Array.from(keys);
        if (allKeys.length === 0) return initial; // nothing to do

        const rawName = String(nodeData?.name || "");
        const display = rawName.startsWith("_.") ? rawName.slice(2) : rawName;
        const ctor = String(nodeType?.name || "");
        const classTail = ctor.startsWith("Underscore") ? ctor.slice("Underscore".length) : ctor;

        const norm = (s) => String(s || "").toLowerCase();
        const squeeze = (s) => norm(s).replace(/[^a-z0-9]+/g, "");

        const targets = [display, classTail].filter(Boolean);
        const targetVariants = [];
        for (const t of targets) {
            targetVariants.push({ kind: "raw", v: norm(t) });
            targetVariants.push({ kind: "squeezed", v: squeeze(t) });
        }

        const initialLower = norm(initial);
        const candidates = [];
        for (const k of allKeys) {
            const kl = norm(k);
            const ks = squeeze(k);
            // Highest priority: exact match with initial
            if (kl === initialLower) {
                candidates.push({ k, score: 1000, why: "exact-initial" });
                continue;
            }
            // Next: exact match with display/class raw
            if (targetVariants.some(tv => tv.kind === "raw" && tv.v === kl)) {
                candidates.push({ k, score: 900, why: "exact-raw" });
                continue;
            }
            // Next: endsWith raw
            if (targetVariants.some(tv => tv.kind === "raw" && tv.v.endsWith(kl))) {
                candidates.push({ k, score: 800 + kl.length, why: "endswith-raw" });
                continue;
            }
            // Next: exact match squeezed
            if (targetVariants.some(tv => tv.kind === "squeezed" && tv.v === ks)) {
                candidates.push({ k, score: 700, why: "exact-squeezed" });
                continue;
            }
            // Next: endsWith squeezed
            if (targetVariants.some(tv => tv.kind === "squeezed" && tv.v.endsWith(ks))) {
                candidates.push({ k, score: 600 + ks.length, why: "endswith-squeezed" });
                continue;
            }
        }
        if (candidates.length === 0) {
            try { Logger.log({ class: "ovum.underscore.ui", method: "resolveMethodFromMethods", severity: "debug" }, "no suffix match", { initial, display, classTail }); } catch(_) {}
            return initial;
        }
        // Pick highest score, tie-break by longest key and then alphabetical
        candidates.sort((a,b) => (b.score - a.score) || (b.k.length - a.k.length) || (a.k.localeCompare(b.k)));
        const best = candidates[0];
        return best?.k || initial;
    } catch(_) {
        return initial;
    }
}

function buildInfoElement(methods, method) {
    const sig = methods?._UNDERSCORE_SIGNATURE?.[method];
    const desc = methods?._DESCRIPTION_OVERRIDES?.[method];
    const ex = methods?._CODE_EXAMPLES?.[method];

    // Build children array progressively, then create root via $el with styles and children
    const children = [];

    // Title
    const title = $el("div.ovum-us-title", { textContent: method ? `_.${method}` : "Underscore method" });
    children.push(title);

    const section = (label, contentNodeOrText, containerTag = "div") => {
        let contentEl;
        if (typeof contentNodeOrText === "string") {
            contentEl = $el(`${containerTag}.ovum-us-section-content`, {textContent: contentNodeOrText});
        } else if (contentNodeOrText) {
            // Wrap provided node to avoid mutating it directly
            contentEl = $el(`${containerTag}.ovum-us-section-content`, {}, [contentNodeOrText]);
        } else {
            contentEl = $el(`${containerTag}.ovum-us-section-content`);
        }

        // Convert label to kebab-case
        const kebabString = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        return $el(`div.ovum-us-section.section-${kebabString}`, {}, [
            $el("div.ovum-us-section-label", {textContent: label}),
            contentEl,
        ]);
    };

    let hasAny = false;
    if (sig && Array.isArray(sig)) {
        children.push(section("Signature", `_.${method}(${sig.join(", ")})`, "code"));
        hasAny = true;
    }
    if (desc) {
        children.push(section("Description", desc));
        hasAny = true;
    }
    if (ex) {
        const pre = $el("pre.ovum-us-code", { textContent: ex });
        children.push(section("Example", pre));
        hasAny = true;
    }

    // Fallback content so the panel never appears empty
    if (!hasAny) {
        const fallback =
            (methods && Object.keys(methods).length > 0)
                ? "No metadata available for this method."
                : "Metadata not loaded. Check that /ovum/web/underscore/methods.json is accessible.";
        children.push(section("Info", fallback));
    }

    const el = $el("div.ovum-us-info", {
        style: {
            flex: "0 0 auto", // do not grow or shrink
            height: "auto",
            maxHeight: "none",
            overflow: "visible",
            display: "block",
        }
    }, children);

    return el;
}

const PRIMARY_INPUT_CANDIDATES = [
    "py_list",
    "py_dict",
    "list_or_dict",
    "py_func",
    "obj",
];

/**
 * Find the primary input name from nodeData or node instance, preferring
 * the category-derived names that underscore_nodes.py uses.
 * @param {ComfyNodeDef} nodeData
 * @param {LGraphNode & {inputs?: any[]}} [node]
 */
function findPrimaryInputName(nodeData, node) {
    try {
        // Prefer nodeData.input.optional keys
        const optional = nodeData?.input?.optional || {};
        for (const k of PRIMARY_INPUT_CANDIDATES) {
            if (Object.prototype.hasOwnProperty.call(optional, k)) return k;
        }
        // Fallback: inspect instance inputs
        const inputs = node?.inputs || [];
        for (const inp of inputs) {
            if (PRIMARY_INPUT_CANDIDATES.includes(inp?.name)) return inp.name;
        }
    } catch (_e) {}
    // Last resort
    return "obj";
}

/**
 * Update shapes for primary input and first output based on whether the
 * upstream connection is a CHAIN.
 * @param {LGraphNode & {inputs?: any[], outputs?: any[]}} node
 * @param {string} primaryName
 */
function refreshChainShapes(node, primaryName) {
    try {
        const inputIndex = (node.inputs || []).findIndex((i) => i?.name === primaryName);
        if (inputIndex < 0) return Promise.resolve();
        const input = node.inputs[inputIndex];
        const isLinked = !!input.link;
        if (!isLinked) {
            // No link -> clear chain shape, revert to default
            try { input.shape = undefined; } catch (_e) {}
            try {
                if (node.outputs?.[0]) {
                    if (!node._underscoreDefaultOutputType) node._underscoreDefaultOutputType = node.outputs[0].type;
                    node.outputs[0].shape = undefined;
                    if (node._underscoreDefaultOutputType) node.outputs[0].type = node._underscoreDefaultOutputType;
                }
            } catch (_e) {}
            node.setDirtyCanvas(true, true);
            return Promise.resolve();
        }

        // Inspect upstream to determine output type
        return app.graphToPrompt().then((_prompt) => {
            return inspectUpstream(_prompt, node.id, primaryName);
        }).then((info) => {
            const isChain = String(info?.source_node_output_type || "") === "_.CHAIN";
            const chainShape = 5; // match style used elsewhere for _.CHAIN
            try { input.shape = isChain ? chainShape : undefined; } catch (_e) {}
            try {
                if (node.outputs?.[0]) {
                    // Record original output type once
                    if (!node._underscoreDefaultOutputType) node._underscoreDefaultOutputType = node.outputs[0].type;
                    node.outputs[0].shape = isChain ? chainShape : undefined;
                    node.outputs[0].type = isChain ? "_.CHAIN" : (node._underscoreDefaultOutputType || node.outputs[0].type);
                }
            } catch (_e) {
            }
            node.setDirtyCanvas(true, true);
        }).catch((_e) => {
            // On error, clear shapes and restore default type if known
            try { input.shape = undefined; } catch (_e2) {}
            try {
                if (node.outputs?.[0]) {
                    node.outputs[0].shape = undefined;
                    if (node._underscoreDefaultOutputType) node.outputs[0].type = node._underscoreDefaultOutputType;
                }
            } catch (_e2) {}
            node.setDirtyCanvas(true, true);
        });
    } catch (e) {
        Logger.log({
            class: "ovum.underscore.ui",
            method: "refreshChainShapes",
            severity: "debug",
        }, "failed to refresh shapes", e);
        return Promise.resolve();
    }
}

/**
 * Re-apply user-forced IO shapes/types based on node.properties.forceInput/forceOutput.
 * Does not infer; only enforces selections.
 * @param {LGraphNode & {inputs?: any[], outputs?: any[]}} node
 * @param {string} primaryName
 */
function applyForcedIO(node, primaryName) {
    try {
        const chainShape = 5;
        const forceIn = String(node.properties?.forceInput || "none");
        const forceOut = String(node.properties?.forceOutput || "none");
        if (forceIn !== "none") {
            const inputIndex = (node.inputs || []).findIndex((i) => i?.name === primaryName);
            if (inputIndex >= 0 && node.inputs?.[inputIndex]) {
                try { node.inputs[inputIndex].shape = (forceIn === "chained") ? chainShape : undefined; } catch(_e) {}
            }
        }
        if (node.outputs?.[0]) {
            const out0 = node.outputs[0];
            if (!node._underscoreDefaultOutputType) node._underscoreDefaultOutputType = out0.type;
            if (forceOut === "chained") {
                out0.shape = chainShape;
                out0.type = "_.CHAIN";
            } else if (forceOut === "object") {
                out0.shape = undefined;
                if (node._underscoreDefaultOutputType) out0.type = node._underscoreDefaultOutputType;
            }
        }
        node.setDirtyCanvas?.(true, true);
    } catch(_e2) {}
}

/**
 * Walk downstream from node.outputs[0] and refresh connected underscore nodes.
 * Only follows the first output to avoid unnecessary fan-out. Uses a visited set
 * to avoid cycles.
 * @param {LGraphNode} node
 */
function propagateDownstream(node) {
    const visited = new Set();
    const graph = app?.graph;
    if (!graph) return;

    /** @param {LGraphNode} n */
    const visit = (n) => {
        if (!n || visited.has(n.id)) return;
        visited.add(n.id);
        const out0 = (n.outputs || [])[0];
        const linkIds = out0?.links || [];
        if (!Array.isArray(linkIds)) return;
        for (const lid of linkIds) {
            const link = graph.links?.[lid];
            if (!link) continue;
            const target = graph.getNodeById?.(link.target_id);
            if (!target) continue;
            // Determine the primary input name for the target node
            const primaryName = target.constructor?.primaryUnderscoreInputName || findPrimaryInputName(undefined, target);
            // Refresh the target, then keep walking
            try {
                Promise.resolve(refreshChainShapes(target, primaryName)).then(() => {
                    // Re-apply forced IO states on the target so propagation doesn't override user intent
                    applyForcedIO(target, primaryName);
                    visit(target);
                });
            } catch (_e) {
                // even if it fails, continue traversal
                visit(target);
            }
        }
    };

    visit(node);
}

app.registerExtension({
    name: "ovum.underscore.ui",
    /**
     * @param {import("../../typings/ComfyNode").ComfyNode} nodeType
     * @param {ComfyNodeDef} nodeData
     * @param {ComfyApp} app
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Target underscore nodes
        const isUnderscore = (nodeData?.category === "ovum/underscore") || /^_\./.test(nodeData?.name || "");
        if (!isUnderscore) return;

        // Resolve primary input name once per class
        nodeType.primaryUnderscoreInputName = findPrimaryInputName(nodeData);

        // Ensure node.computeSize accounts for our DOM widget height (some frontends apparently ignore DOMWidget.getHeight, looking at you ComfyUI!)
        try {
            chainCallback(nodeType.prototype, "computeSize", function(size) {
                let rv;
                try {
                    // Retrieve the original computeSize return captured by chainCallback
                    const prev = this?.__chainCallbackPrevReturn_computeSize;
                    rv = Array.isArray(prev) ? prev : (Array.isArray(this?.size) ? this.size.slice() : [140, 80]);
                } catch(_) {
                    rv = Array.isArray(this?.size) ? this.size.slice() : [140, 80];
                }
                try {
                    const widget = this._usInfoWidget;
                    // Consider visible only if widget exists and its container is not display:none
                    const parentEl = widget?.parentEl || widget?.element;
                    const isVisible = !!widget && (this._usInfoVisible !== false) && (!parentEl || parentEl.style.display !== "none");
                    const getH = Number(widget?.options?.getHeight?.() ?? 0);
                    if (isVisible && Number.isFinite(getH) && getH > 0) {
                        // Provide a conservative extra space so the widget content fits.
                        // We do not attempt to subtract any existing allocation because some frontends ignore DOM height completely.
                        const pad = Number(widget?.options?.margin ?? 6) + 12; // small padding around the widget
                        const fudge = LiteGraph.NODE_SLOT_HEIGHT * (this.inputs ?? []).length; // extra requested fudge factor
                        const desired = getH + pad + fudge; // include title, spacing, and fudge
                        if (desired > rv[1]) rv[1] = desired;
                    }
                } catch(_) {}
                // Do not change width; lock it to the current width if available (not reliable across frontends)
                return rv;
            });
        } catch(_) {}

        // Cosmetic: mark title (WTF? Does this even work?)
        // Removed suffix modification to keep title exact for method resolution based on node.title

        // On node created/configured, ensure shapes are in sync
        chainCallback(nodeType.prototype, "onNodeCreated", function() {
            const node = /** @type {LGraphNode} */ (this);
            // Ensure force properties exist and are exposed as properties (not widgets)
            try {
                if (!node.properties) node.properties = {};
                if (!node.properties.forceInput) node.properties.forceInput = "none";
                if (!node.properties.forceOutput) node.properties.forceOutput = "none";
                // Create combo properties so they appear in the side Properties panel
                if (typeof node.addProperty === "function") {
                    // addProperty(name, default_value, type, extra_info)
                    try { node.addProperty("forceInput", node.properties.forceInput, "combo", { values: ["none","chained","object"] }); } catch(_e2) {}
                    try { node.addProperty("forceOutput", node.properties.forceOutput, "combo", { values: ["none","chained","object"] }); } catch(_e3) {}
                }
            } catch(_e) {}
            Promise.resolve(refreshChainShapes(node, nodeType.primaryUnderscoreInputName)).then(() => {
                propagateDownstream(node);
            });

            // Underscore info panel setup
            // try {
                // Restore persisted visibility from properties
                if (!node.properties) node.properties = {};
                if (typeof node.properties._usInfoVisible !== "boolean") node.properties._usInfoVisible = false;
                node._usInfoVisible = !!node.properties._usInfoVisible;

                // Convert any widget-only inputs (ovumWidgetOnly) into pure widgets (remove sockets)
                try {
                    if (Array.isArray(node.inputs) && Array.isArray(node.widgets)) {
                        for (const input of node.inputs.slice()) {
                            // would this even be visible?
                            if (input?.options?.ovumWidgetOnly) {
                                console.log("converting ovumWidgetOnly input", input);
                                const w = node.widgets.find(w => w.name === input.name);
                                if (w) {
                                    try { convertToWidget(node, w); } catch(_) {}
                                }
                            }
                        }
                    }
                } catch(_) {}

                // Ensure widgets are hidden when inputs are connected (iteratee JSON widget override)
                // DO NOT RUN FIXWIDGETS IS DOES NOT WORK< IT IS NOT THE RIGHT FUCKING FUNCTION
                // DO NOT RUN: try { fixWidgets(node); } catch(_) {} << DO NOT RUN

                const setupInfoPanel = async () => {
                    const titleMethod = methodNameFromTitle(node);
                    const baseMethod = titleMethod || methodNameFromNode(nodeData, nodeType);
                    const methods = await getUnderscoreMethods();
                    const resolvedMethod = resolveMethodFromMethods(methods, nodeData, nodeType, baseMethod);
                    const method = resolvedMethod;
                    // try {
                        // Remove previous widget if any
                        if (node._usInfoWidget) {
                            try { node.ensureWidgetRemoved?.(node._usInfoWidget); } catch(_) {}
                            node._usInfoWidget = null;
                        }
                        const hasMeta = hasUnderscoreMetadata(methods, method);
                        if (!hasMeta) {
                            // No metadata: do not create the widget or the title button
                            node._applyUsInfoVisibility = undefined;
                            node._usInfoVisible = false;
                            // Avoid leaving a stale button around on reconfigure
                            // (ComfyUI doesn't expose a removeTitleButton API; only add if needed elsewhere)
                            return;
                        }
                        const el = buildInfoElement(methods, method);
                        // Create DOM widget
                        const w = node.addDOMWidget("Underscore Info", "underscore-info", el, {
                            serialize: false,
                            hideOnZoom: false,
                            // Dynamically report the DOM height so the node resizes correctly
                            getHeight: () => {
                                try {
                                    // If hidden, report 0 height so the node shrinks
                                    const parent = w?.parentEl || el;
                                    if (!parent || parent.style.display === "none") return 0;
                                    // Measure the natural content height of our element, not the container
                                    const natural = Math.ceil((el.scrollHeight || el.offsetHeight || 0));
                                    const margin = 6;
                                    const maxClamp = 1200; // defensive clamp to avoid runaway growth in edge cases
                                    const h = Math.max(0, Math.min(natural + margin, maxClamp));
                                    return h;
                                } catch (_) { return 0; }
                            },
                            getMinHeight: () => 0,
                            afterResize: function() {
                                // Ensure canvas redraw after resize
                                try { node.setDirtyCanvas?.(true, true); } catch(_) {}
                            }
                        });
                        node._usInfoWidget = w;
                        // Helper to request an immediate node resize based on current widget heights
                        const _requestUsInfoResize = () => {
                            // try {
                                if (typeof node.computeSize === "function") {
                                    const sz = node.computeSize(node.size);
                                    Logger.log({
                                        class: "ovum.underscore.ui",
                                        method: "_requestUsInfoResize",
                                        severity: "debug",
                                    }, `node.size: ${this.size.join("x")} ${node.size.join("x")} computeSize: ${sz.join("x")}`);
                                    node.setSize([Math.max(sz[0], node.size[0]), Math.max(sz[1], node.size[1])])
                                }
                            // } catch(_) {}
                            try { node.setDirtyCanvas?.(true, true); } catch(_) {}
                        };
                        // Visibility control
                        const applyVis = (v) => {
                            node._usInfoVisible = !!v;
                            node.properties._usInfoVisible = node._usInfoVisible;
                            try {
                                const parent = w?.parentEl || el;
                                if (parent) {
                                    parent.style.display = node._usInfoVisible ? "" : "none";
                                    if (node._usInfoVisible) {
                                        try { parent.style.flex = "0 0 auto"; } catch(_e) {}
                                    }
                                }
                            } catch(_) {}
                            node.setDirtyCanvas(true, true);
                            // Defer resize to next tick to allow DOM to layout -- sounds silly to me -- sfink
                            // setTimeout(_requestUsInfoResize, 0);
                        };
                        node._applyUsInfoVisibility = applyVis;
                        // No need to call this just because it's there.
                        // applyVis(node._usInfoVisible);
                        // Add an info button to the titlebar only if metadata exists and button not yet added
                        if (!node._usInfoTitleBtn && typeof node.addTitleButton === "function") {
                            try {
                                // button options stolen from a Subgraph LGraphNode, defaults omitted
                                node._usInfoTitleBtn = node.addTitleButton({
                                    text: "\ue924", // (i) info-circle-icon,
                                    // fgColor: "white",
                                    // bgColor: "#0F1F0F",
                                    fontSize: 16,
                                    // padding: 6,
                                    // height: 20,
                                    // cornerRadius: 5,
                                    xOffset: -10,
                                    yOffset: 0,
                                    name: "examples",
                                });
                            } catch(_) {}
                        }
                    // } catch(_) {}
                };
                node._setupUsInfoPanel = setupInfoPanel;
                setupInfoPanel();

            // } catch(_) {}
        });

        // Toggle info panel via titlebar button
        chainCallback(nodeType.prototype, "onTitleButtonClick", function(button, canvas2) {
            // try {
                if (this._usInfoTitleBtn && button === this._usInfoTitleBtn) {
                    this._applyUsInfoVisibility?.(!this._usInfoVisible);
                }
            // } catch (_) {}
        });

        // Ensure we restore shapes/types on load and then propagate a refresh
        chainCallback(nodeType.prototype, "onConfigure", function (info) {
            try {
                const node = /** @type {LGraphNode} */ (this);
                // Ensure force properties exist
                if (!node.properties) node.properties = {};
                if (!node.properties.forceInput) node.properties.forceInput = "none";
                if (!node.properties.forceOutput) node.properties.forceOutput = "none";
                const state = info?._underscoreSocketState;
                if (state) {
                    // Restore primary input shape
                    const inputIndex = (node.inputs || []).findIndex((i) => i?.name === nodeType.primaryUnderscoreInputName);
                    if (inputIndex >= 0 && node.inputs?.[inputIndex]) {
                        try { node.inputs[inputIndex].shape = state.primaryInputShape ?? node.inputs[inputIndex].shape; } catch(_e) {}
                    }
                    // Restore first output shape/type and seed default type
                    if (node.outputs?.[0]) {
                        try { node.outputs[0].shape = (state.output0?.shape ?? node.outputs[0].shape); } catch(_e) {}
                        try {
                            if (state.output0?.type) node.outputs[0].type = state.output0.type;
                        } catch(_e) {}
                        if (state.output0?.defaultType) node._underscoreDefaultOutputType = state.output0.defaultType;
                        else if (state.output0?.type) node._underscoreDefaultOutputType = state.output0.type;
                    }
                    node.setDirtyCanvas(true, true);
                }
            } catch(_e) {}
            const node = /** @type {LGraphNode} */ (this);
            Promise.resolve(refreshChainShapes(node, nodeType.primaryUnderscoreInputName)).then(() => {
                // After default refresh, apply forced IO states so they persist on reload
                applyForcedIO(node, nodeType.primaryUnderscoreInputName);
                propagateDownstream(node);
            });
            // Recreate info panel and apply persisted visibility
            // try {
                if (!node.properties) node.properties = {};
                if (typeof node.properties._usInfoVisible === "boolean") node._usInfoVisible = !!node.properties._usInfoVisible;
                node._setupUsInfoPanel?.();
            // } catch(_) {}
        });

        // Persist shapes/types into saved workflow
        chainCallback(nodeType.prototype, "onSerialize", function(o) {
            try {
                const node = /** @type {LGraphNode} */ (this);
                const inputIndex = (node.inputs || []).findIndex((i) => i?.name === nodeType.primaryUnderscoreInputName);
                const primaryInputShape = (inputIndex >= 0 && node.inputs?.[inputIndex]) ? node.inputs[inputIndex].shape : null;
                const out0 = (node.outputs || [])[0] || {};
                const state = {
                    primaryInputShape,
                    output0: {
                        shape: out0.shape ?? null,
                        type: out0.type ?? null,
                        defaultType: node._underscoreDefaultOutputType ?? null,
                    },
                };
                o._underscoreSocketState = state;
            } catch(_e) {}
        });

        // When node executed, use backend ui types and force settings to enforce chain state
        chainCallback(nodeType.prototype, "onExecuted", function(message) {
            try {
                const node = /** @type {LGraphNode} */ (this);
                const ui = message || {};
                const reportedIn = String(ui.inputType || "");
                const reportedOut = String(ui.outputType || "");
                console.log("reportedIn", reportedIn, "reportedOut", reportedOut, reportedOut === "chained");
                // Resolve desired chain states honoring force properties first
                const forceIn = String(node.properties?.forceInput || "none");
                const forceOut = String(node.properties?.forceOutput || "none");
                const desiredInChain = forceIn === "chained" ? true : forceIn === "object" ? false : (reportedIn === "chained");
                const desiredOutChain = forceOut === "chained" ? true : forceOut === "object" ? false : (reportedOut === "chained");
                const chainShape = 5;
                // Apply to input shape
                const inputIndex = (node.inputs || []).findIndex((i) => i?.name === nodeType.primaryUnderscoreInputName);
                if (inputIndex >= 0 && node.inputs?.[inputIndex]) {
                    try { node.inputs[inputIndex].shape = desiredInChain ? chainShape : undefined; } catch(_e) {}
                }
                // Apply to first output type/shape
                try {
                    const out0 = (node.outputs || [])[0];
                    if (out0) {
                        if (!node._underscoreDefaultOutputType) node._underscoreDefaultOutputType = out0.type;
                        out0.shape = desiredOutChain ? chainShape : undefined;
                        out0.type = desiredOutChain ? "_.CHAIN" : (node._underscoreDefaultOutputType || out0.type);
                    }
                } catch(_e) {}
                node.setDirtyCanvas?.(true, true);
                // If we auto-overrode and no user force set, remember our decision in properties so it persists
                try {
                    if (!node.properties) node.properties = {};
                    if ((forceIn === "none") && (reportedIn === "chained" || reportedIn === "object")) node.properties.forceInput = reportedIn;
                    if ((forceOut === "none") && (reportedOut === "chained" || reportedOut === "object")) node.properties.forceOutput = reportedOut;
                } catch(_e) {}
                propagateDownstream(node);
            } catch(_e) {}
        });

        // On connections change, update shapes when primary input changes
        chainCallback(nodeType.prototype, "onConnectionsChange", function(type, index, connected, link_info) {
            try {
                const node = /** @type {LGraphNode} */ (this);
                const inp = (node.inputs || [])[index];
                if (!inp) return;
                if (inp.name !== nodeType.primaryUnderscoreInputName) return;

                const stackTrace = new Error().stack;
                if (stackTrace.includes('LGraphNode.prototype.connect') ||
                    stackTrace.includes('convertToSubgraph') ||
                    stackTrace.includes('pasteFromClipboard') ||
                    stackTrace.includes('LGraphNode.connect') ||
                    stackTrace.includes('loadGraphData')) {
                    return;
                }
                Promise.resolve(refreshChainShapes(node, nodeType.primaryUnderscoreInputName)).then(() => {
                    // Re-apply forced IO states so a connection change doesn't override user intent
                    applyForcedIO(node, nodeType.primaryUnderscoreInputName);
                    propagateDownstream(node);
                });
            } catch (_e) {}
        });
    },
});
