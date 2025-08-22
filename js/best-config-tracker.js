/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */

import { app } from "../../scripts/app.js";

export class BestConfigTracker {
    static storageKey = "timer_best_configs";
    static lastSeenKey = "timer_best_configs.last_seen";
    static bestConfigPrefix = "best config selected:";

    // Safely read the stored object { [timestamp:number]: message:string }
    static getStoredConfigs() {
        try {
            const raw = localStorage.getItem(BestConfigTracker.storageKey) || "{}";
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") return parsed;
        } catch {}
        return {};
    }

    static setStoredConfigs(obj) {
        try {
            localStorage.setItem(BestConfigTracker.storageKey, JSON.stringify(obj || {}));
        } catch (e) {
            console.warn("[BestConfigTracker] Failed to persist stored configs:", e);
        }
    }

    static getLastSeen() {
        const v = localStorage.getItem(BestConfigTracker.lastSeenKey);
        const n = Number(v);
        return isFinite(n) ? n : 0;
    }

    static setLastSeen(ts) {
        try {
            if (typeof ts === "number" && isFinite(ts)) {
                localStorage.setItem(BestConfigTracker.lastSeenKey, String(ts));
            }
        } catch {}
    }

    // Merge fetched logs into storage; returns array of new objects { t:number, m:string }
    static mergeEntries(entries) {
        const stored = BestConfigTracker.getStoredConfigs();
        const newlyAdded = [];
        for (const entry of entries || []) {
            if (!entry || typeof entry.m !== "string") continue;
            if (!entry.m.startsWith(BestConfigTracker.bestConfigPrefix)) continue;
            const t = entry.t;
            const m = entry.m.trim();
            if (t == null) continue;
            if (!stored[t]) {
                newlyAdded.push({ t, m });
            }
            stored[t] = m;
        }
        BestConfigTracker.setStoredConfigs(stored);
        return newlyAdded;
    }

    // Fetch raw logs from ComfyUI and merge into local storage
    static async fetchAndStoreFromLogs() {
        const res = await app.api.getRawLogs();
        const entries = res?.entries || [];
        return BestConfigTracker.mergeEntries(entries);
    }

    // Get items newer than lastSeen; advances lastSeen to the newest item included
    static getNewSinceAndMark() {
        const stored = BestConfigTracker.getStoredConfigs();
        const lastSeen = BestConfigTracker.getLastSeen();
        const items = Object.keys(stored)
            .map(k => ({ t: Number(k), m: stored[k] }))
            .filter(x => isFinite(x.t) && x.t > lastSeen)
            .sort((a, b) => a.t - b.t);

        if (items.length) {
            BestConfigTracker.setLastSeen(items[items.length - 1].t);
        }
        return items;
    }

    // Clear tracking data (optional helper)
    static clear() {
        try {
            localStorage.removeItem(BestConfigTracker.storageKey);
            localStorage.removeItem(BestConfigTracker.lastSeenKey);
        } catch {}
    }
}
