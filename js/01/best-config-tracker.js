/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */

import { app } from "../../../scripts/app.js";

export class bestConfigTracker {
    static storageKey = "timer_best_configs";
    static lastSeenKey = "timer_best_configs.last_seen";
    static bestConfigPrefix = "best config selected:";

    // Safely read the stored object { [timestamp:number]: message:string }
    static getStoredConfigs() {
        try {
            const raw = localStorage.getItem(bestConfigTracker.storageKey) || "{}";
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") return parsed;
        } catch {}
        return {};
    }

    static setStoredConfigs(obj) {
        try {
            localStorage.setItem(bestConfigTracker.storageKey, JSON.stringify(obj || {}));
        } catch (e) {
            console.warn("[BestConfigTracker] Failed to persist stored configs:", e);
        }
    }

    static getLastSeen() {
        const v = localStorage.getItem(bestConfigTracker.lastSeenKey);
        const n = Number(v);
        return isFinite(n) ? n : 0;
    }

    static setLastSeen(ts) {
        try {
            if (typeof ts === "number" && isFinite(ts)) {
                localStorage.setItem(bestConfigTracker.lastSeenKey, String(ts));
            }
        } catch {}
    }

    // Merge fetched logs into storage; returns array of new objects { t:number, m:string }
    static mergeEntries(entries) {
        const stored = bestConfigTracker.getStoredConfigs();
        const newlyAdded = [];
        for (const entry of entries || []) {
            if (!entry || typeof entry.m !== "string") continue;
            if (!entry.m.startsWith(bestConfigTracker.bestConfigPrefix)) continue;
            const t = entry.t;
            const m = entry.m.trim();
            if (t == null) continue;
            if (!stored[t]) {
                newlyAdded.push({ t, m });
            }
            stored[t] = m;
        }
        bestConfigTracker.setStoredConfigs(stored);
        return newlyAdded;
    }

    // Fetch raw logs from ComfyUI and merge into local storage
    static async fetchAndStoreFromLogs() {
        const res = await app.api.getRawLogs();
        const entries = res?.entries || [];
        return bestConfigTracker.mergeEntries(entries);
    }

    // Get items newer than lastSeen; advances lastSeen to the newest item included
    static getNewSinceAndMark() {
        const stored = bestConfigTracker.getStoredConfigs();
        const lastSeen = bestConfigTracker.getLastSeen();
        const items = Object.keys(stored)
            .map(k => ({ t: Number(k), m: stored[k] }))
            .filter(x => isFinite(x.t) && x.t > lastSeen)
            .sort((a, b) => a.t - b.t);

        if (items.length) {
            bestConfigTracker.setLastSeen(items[items.length - 1].t);
        }
        return items;
    }

    // Clear tracking data (optional helper)
    static clear() {
        try {
            localStorage.removeItem(bestConfigTracker.storageKey);
            localStorage.removeItem(bestConfigTracker.lastSeenKey);
        } catch {}
    }
}
