/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */
/** @typedef {import('@comfyorg/comfyui-frontend-types').LiteGraph} LiteGraph */
/** @typedef {import("@comfyorg/comfyui-frontend-types").LGraphNode} LGraphNode */
/** @typedef {import("@comfyorg/comfyui-frontend-types").IWidget} IWidget */

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { Logger } from "../common/logger.js";

// Local chain helper to compose node prototype callbacks (keeps previous behavior intact)
function chainCallback(target, methodName, fn) {
    const prev = target[methodName];
    target[methodName] = function (...args) {
        if (typeof prev === "function") {
            try {
                prev.apply(this, args);
            } catch (e) {
                console.warn(`[ovum] ${methodName} previous callback threw`, e);
            }
        }
        return fn.apply(this, args);
    };
}

const API_BASE = "/ovum/image-list";

/**
 * Example: call backend to fetch image metadata
 * @param {string} path
 */
async function apiGetMeta(path) {
    const res = await api.fetchApi(
        `${API_BASE}/meta?path=${encodeURIComponent(path)}`
    );
    if (!res.ok) throw new Error(`meta failed: ${res.status}`);
    return res.json();
}

/**
 * Example: call backend to fetch raw file bytes
 * @param {string} path
 */
async function apiGetFile(path) {
    const res = await api.fetchApi(
        `${API_BASE}/file?path=${encodeURIComponent(path)}`
    );
    if (!res.ok) throw new Error(`file failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    return new Blob([buf]);
}

/**
 * Example: search under OUTPUT_ROOT for files matching a regex, optionally within a base path
 * @param {string} pattern
 * @param {string} [base]
 */
async function apiSearch(pattern, base = "") {
    const url =
        `${API_BASE}/search?pattern=${encodeURIComponent(pattern)}` +
        (base ? `&base=${encodeURIComponent(base)}` : "");
    const res = await api.fetchApi(url);
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    return res.json();
}

/**
 * Build an example response by demonstrating each API call.
 * Posts a response event after completion.
 */
async function handleBatchPayload(payload) {
    // Payload is expected to be: { files: string[], paths: string[] }
    const paths = Array.isArray(payload?.paths) ? payload.paths : [];
    const files = Array.isArray(payload?.files) ? payload.files : [];

    const firstPath = paths[0];
    const results = {
        ok: true,
        request: {
            fileCount: files.length,
            pathCount: paths.length,
        },
        meta: [],
        fileProbe: null,
        search: null,
        errors: [],
    };

    try {
        // Demonstrate meta: fetch metadata for up to first 3 paths
        const sampleForMeta = paths.slice(0, 3);
        results.meta = await Promise.all(
            sampleForMeta.map(async (p) => {
                try {
                    return await apiGetMeta(p);
                } catch (e) {
                    results.errors.push(`meta(${p}): ${e.message || e}`);
                    return { error: true, path: p };
                }
            })
        );
    } catch (e) {
        results.errors.push(`meta: ${e.message || e}`);
    }

    try {
        // Demonstrate file: fetch bytes for the first path and report byte length
        if (firstPath) {
            const blob = await apiGetFile(firstPath);
            results.fileProbe = {
                path: firstPath,
                bytes: blob.size,
                mime: blob.type || "application/octet-stream",
            };
        }
    } catch (e) {
        results.errors.push(`file(${firstPath}): ${e.message || e}`);
    }

    try {
        // Demonstrate search: build a loose pattern from the first filename, or fallback to ".*"
        const firstName = files[0] || "";
        const escaped = firstName
            ? firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            : ".*";
        const pattern = firstName ? `^${escaped}$` : ".*";
        results.search = await apiSearch(pattern);
    } catch (e) {
        results.errors.push(`search: ${e.message || e}`);
    }

    // Post the answer back for any consumers (e.g., other JS extensions or a future UI)
    const responseEvent = "ovum.image_list.info.response";
    api.dispatchCustomEvent(responseEvent, results);

    // Also log for visibility during development
    console.debug("[ovum] image_list response:", results);
}

// Frontend companion and node hooks
app.registerExtension({
    name: "ovum.image_list.loader_callback",

    // Hook into the backend node so we can add UI later
    /**
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} app
     */
    /**
     * @param {import("../../typings/ComfyNode").ComfyNode} nodeType
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyNodeDef} nodeData
     * @param {import("@comfyorg/comfyui-frontend-types").ComfyApp} app
     */
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (!nodeData || nodeData.name !== "LoadImagesListWithCallback") return;
        /** @type {LGraphNode} */
        // const node = this;

        function updateDirectoryWidgetVisibility(/** LGraphNode */ node) {
            try {
                const slotIndex = node.findInputSlot("filenames");
                const isLinked = slotIndex >= 0 && node.inputs?.[slotIndex]?.link != null;
                /** @type {IWidget | undefined} */
                const w = node.widgets?.find((w) => w.name === "directory");
                if (w) {
                    w.computeDisabled = !!isLinked;
                }
                if (node.canvas?.setDirty) app.canvas.setDirty(true, true);
            } catch (e) {
                console.warn("[ovum] updateDirectoryWidgetVisibility error", e);
            }
        }

        // Add a simple demo button on the node for future UI expansion
        // chainCallback(nodeType.prototype, "onNodeCreated", function () {
        //     const node = /** @type {LGraphNode} */ (this);
        //     // if (!node.properties) node.properties = {};
        //
        //     // A demo button to send a "request" event (useful for testing wiring)
        //     node.addWidget("button", "Test image-list API", "Run", async () => {
        //         api.dispatchCustomEvent("ovum.image_list.info.request", {
        //             node_id: node.id,
        //             timestamp: Date.now(),
        //         });
        //     });
        //
        //     updateDirectoryWidgetVisibility(node);
        // });

        // Keep visuals updated when links change, and hide/disable directory when 'filenames' is linked
        chainCallback(nodeType.prototype, "onConnectionsChange", function () {
            updateDirectoryWidgetVisibility(this);
            if (this.canvas?.setDirty) this.canvas.setDirty(true, true);
        });
    },

    // Set up event listeners for batch info and optional test requests
    async setup() {
        // Receive batch info from backend, demonstrate API usage, and post response
        api.addEventListener("ovum.image_list.info", async (ev) => {
            try {
                const payload = ev?.detail ?? ev; // {files:[], paths:[]}
                console.debug("[ovum] image_list batch:", payload);
                await handleBatchPayload(payload);
            } catch (err) {
                console.error("[ovum] image_list handler error", err);
                api.dispatchCustomEvent("ovum.image_list.info.response", {
                    ok: false,
                    errors: [String(err?.message || err)],
                });
            }
        });

        // Optional: allow UI button to request a demo response even without new backend data
        api.addEventListener("ovum.image_list.info.request", async () => {
            try {
                console.log("[ovum] image_list request");
                return;
                // Demonstrate the search endpoint
                const demo = await apiSearch(".*");

                // Request workflow (via meta) for the first file returned by apiSearch and log it
                const first = Array.isArray(demo?.results) && demo.results.length > 0 ? demo.results[0] : null;
                if (first) {
                    try {
                        const meta = await apiGetMeta(first);
                        Logger.log(
                            { class: 'ovum.image_list', method: 'info.request', severity: 'info', tag: 'workflow' },
                            'First search result:', first,
                            'Workflow:', meta?.workflow ?? null
                        );
                    } catch (e) {
                        Logger.log(
                            { class: 'ovum.image_list', method: 'info.request', severity: 'warn', tag: 'workflow error' },
                            'Failed to fetch meta for', first, e?.message || e
                        );
                    }
                } else {
                    Logger.log(
                        { class: 'ovum.image_list', method: 'info.request', severity: 'info', tag: 'workflow' },
                        'No results from apiSearch to request workflow.'
                    );
                }

                api.dispatchCustomEvent("ovum.image_list.info.response", {
                    ok: true,
                    request: { fileCount: 0, pathCount: 0 },
                    meta: [],
                    fileProbe: null,
                    search: demo,
                    errors: [],
                });
            } catch (err) {
                console.error("[ovum] image_list request error", err);
                api.dispatchCustomEvent("ovum.image_list.info.response", {
                    ok: false,
                    errors: [String(err?.message || err)],
                });
            }
        });
    },
});
