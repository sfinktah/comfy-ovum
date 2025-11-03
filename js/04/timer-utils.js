/**
 * Timer-specific utilities.
 * These helpers operate on the global Timer state and are only applicable to the Timer node.
 */

/**
 * Compute wall-clock start and end timestamps (ms) for a run.
 * Uses systemStartTime as the real-world start, and adds the LiteGraph delta
 * (endTime - startTime) to derive a wall-clock end. If end is not yet known,
 * endMs will be null. If start cannot be resolved, startMs will be null.
 *
 * @param {string} runId
 * @returns {{startMs: (number|null), endMs: (number|null)}}
 */
export function getRunStartEndMs(runId) {
    try {
        const rh = (typeof Timer !== 'undefined' && Timer?.run_history) ? (Timer.run_history[runId] || {}) : {};
        const sysStartMs = rh.systemStartTime;
        const lgStart = rh.startTime;
        const lgEnd = rh.endTime;

        const startMs = (typeof sysStartMs === 'number') ? sysStartMs : null;
        let endMs = null;
        if (typeof sysStartMs === 'number' && typeof lgEnd === 'number' && typeof lgStart === 'number') {
            const delta = lgEnd - lgStart;
            if (!Number.isNaN(delta)) endMs = sysStartMs + delta;
        }
        return { startMs, endMs };
    } catch (_e) {
        return { startMs: null, endMs: null };
    }
}

// Optional: attach to window for ad-hoc browser use
if (typeof window !== 'undefined') {
    window.ovumTimerUtils = window.ovumTimerUtils || {};
    if (!window.ovumTimerUtils.getRunStartEndMs) {
        window.ovumTimerUtils.getRunStartEndMs = getRunStartEndMs;
    }
}
