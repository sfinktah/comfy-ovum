/** @typedef {import('@comfyorg/comfyui-frontend-types').ComfyApp} ComfyApp */

import { app } from "../../../scripts/app.js";

export class bestConfigTracker {
    static storageKey = "timer_best_configs";
    static lastSeenKey = "timer_best_configs.last_seen";
    static bestConfigPrefix = "best config selected:";

    // Parse a timestamp (number or ISO-like string) into epoch milliseconds
    static parseTimestampToMs(ts) {
        if (typeof ts === "number" && isFinite(ts)) return ts;

        if (typeof ts === "string") {
            // Try a strict ISO-like format first: YYYY-MM-DDTHH:mm:ss(.fraction up to 6)
            const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/);
            if (m) {
                const [, y, mo, d, h, mi, s, frac] = m;
                // Convert microseconds to milliseconds by truncating to first 3 digits
                const ms = frac ? parseInt(frac.substring(0, 3).padEnd(3, "0"), 10) : 0;
                const t = Date.UTC(
                    Number(y),
                    Number(mo) - 1,
                    Number(d),
                    Number(h),
                    Number(mi),
                    Number(s),
                    ms
                );
                if (isFinite(t)) return t;
            }
            // Fallback to Date.parse for any other formats
            const parsed = Date.parse(ts);
            if (isFinite(parsed)) return parsed;
        }
        return 0;
    }

    // Safely read the stored object { [timestamp:string]: message:string }
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
        if (v == null) return 0;
        const n = Number(v);
        if (isFinite(n) && n > 0) return n;
        const parsed = bestConfigTracker.parseTimestampToMs(v);
        return isFinite(parsed) ? parsed : 0;
    }

    static setLastSeen(ts) {
        try {
            const ms = bestConfigTracker.parseTimestampToMs(ts);
            localStorage.setItem(bestConfigTracker.lastSeenKey, String(ms));
        } catch {
            console.log("[BestConfigTracker] Failed to persist last seen:", ts);
        }
    }

    // Merge fetched logs into storage; returns array of new objects { t:number, m:string }
    static mergeEntries(entries) {
        const stored = bestConfigTracker.getStoredConfigs();
        const newlyAdded = [];
        for (const entry of entries || []) {
            if (!entry || typeof entry.m !== "string") continue;
            if (!entry.m.startsWith(bestConfigTracker.bestConfigPrefix)) continue;

            const tRaw = entry.t;
            if (tRaw == null) continue;

            const m = entry.m.trim();
            const key = String(tRaw);
            const tMs = bestConfigTracker.parseTimestampToMs(tRaw);

            if (!stored[key]) {
                newlyAdded.push({ t: tMs, m });
            }
            stored[key] = m;
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
            .map(k => ({ t: bestConfigTracker.parseTimestampToMs(k), m: stored[k] }))
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
