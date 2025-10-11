import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// Debounced bulk query machinery for wrap status
const BULK_QUERY_ROUTE = "/ovum/result_wrap_query_bulk";
const SINGLE_QUERY_ROUTE = "/ovum/result_wrap_query";

const wrapStatusCache = new Map(); // type -> boolean
const pendingTypes = new Set(); // Set<string>
const pendingResolvers = new Map(); // type -> Array<(v:boolean)=>void>
let bulkTimer = null;

// Schedule a flush of pending types to the backend
function scheduleBulkFlush() {
    if (bulkTimer != null) return;
    bulkTimer = setTimeout(flushPendingTypes, 0);
}

async function flushPendingTypes() {
    const types = Array.from(pendingTypes);
    pendingTypes.clear();
    bulkTimer = null;

    if (types.length === 0) return;

    // Helper to resolve and cleanup
    const resolveForType = (t, value) => {
        wrapStatusCache.set(t, value);
        const resolvers = pendingResolvers.get(t) || [];
        pendingResolvers.delete(t);
        for (const r of resolvers) {
            try {
                r(value);
            } catch {}
        }
    };

    try {
        // Try bulk first
        const data = await call_server_bulk(types, BULK_QUERY_ROUTE);
        const resp = data?.response;
        if (resp && typeof resp === "object") {
            for (const t of types) {
                resolveForType(t, Boolean(resp[t]));
            }
            return;
        }
        // If response malformed, fall through to single fallback
        throw new Error("Malformed bulk response");
    } catch (_) {
        // Fallback to single queries if bulk route isn't available
        await Promise.all(
            types.map(async (t) => {
                try {
                    const data = await call_server(t, SINGLE_QUERY_ROUTE);
                    resolveForType(t, Boolean(data?.response));
                } catch {
                    resolveForType(t, false);
                }
            })
        );
    }
}

function requestWrapStatus(type) {
    if (!type) return Promise.resolve(false);
    if (wrapStatusCache.has(type)) return Promise.resolve(wrapStatusCache.get(type));

    return new Promise((resolve) => {
        const arr = pendingResolvers.get(type) || [];
        arr.push(resolve);
        pendingResolvers.set(type, arr);
        pendingTypes.add(type);
        scheduleBulkFlush();
    });
}

// Adapted from cg-nodecaching/js/cache_node.js but for result_wrapper backend
// Provides UI to convert nodes to "result-wrapped" and annotate titles accordingly.
app.registerExtension({
    name: "ovum.result_wrapper",

    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function (_, options) {
            getExtraMenuOptions?.apply(this, arguments);
            if (!this._is_result_wrapped) {
                options.push({
                    content: "Convert to ovum result-wrapped",
                    callback: async () => {
                        const data = await call_server(this.type, "/ovum/result_wrap_request");
                        if (data?.response) {
                            nodeType.prototype._is_result_wrapped = true;
                            app.graph.nodes
                                .filter((node) => node.type === this.type)
                                .forEach((node) => {
                                    node._is_result_wrapped = true;
                                });
                        } else {
                            console.log(`Failed to convert ${this.type} to result-wrapped`);
                        }
                    },
                });
            }
        };

        // Bulk-query backend to mark class as already wrapped
        try {
            const isWrapped = await requestWrapStatus(nodeType.comfyClass);
            if (isWrapped) nodeType.prototype._is_result_wrapped = true;
        } catch (e) {
            // Silently ignore if backend route not available
        }
    },

    async nodeCreated(node) {
        const original_getTitle = node.getTitle;
        node.getTitle = function () {
            const t = original_getTitle ? original_getTitle.call(node) : node.title || node.type;
            if (node._is_result_wrapped) return `${t} (result)`;
            else return t;
        };
    },

    async init() {
        // Give backend a chance to initialize structures; ignore errors if endpoint missing
        try {
            await call_server(null, "/ovum/result_wrap_init");
        } catch (e) {}
    },
});

async function call_server(type, method) {
    const body = new FormData();
    if (type) body.append("type", type);
    const response = await api.fetchApi(method, { method: "POST", body });
    const data = await response.json();
    return data;
}

async function call_server_bulk(types, method) {
    const response = await api.fetchApi(method, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ types }),
    });
    const data = await response.json();
    return data;
}
