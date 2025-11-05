import {log} from "../common/logger";

export function propagateToGetters(node) {
    log({ class: "TwinNodeHelpers", method: "propagateToGetters", severity: "trace", tag: "function_entered" }, "[propagateToGetters]", { node: node });
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
                ? node.widgets.map(w => safeStringTrim(w?.value))
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
