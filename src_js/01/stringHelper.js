/**
 * Split a name into tokens for comparison, handling snake_case, kebab-case, camelCase, digits, etc.
 * Tokens are lowercased for matching.
 * @param {string} str
 * @returns {string[]}
 */
function splitNameTokens(str) {
    if (typeof str !== 'string') return [];
    let s = safeStringTrim(str);
    if (!s) return [];
    // Separate camelCase boundaries
    s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    // Replace non-alphanumeric with space
    s = s.replace(/[^A-Za-z0-9]+/g, ' ');
    // Collapse spaces and split
    const parts = s.trim().split(/\s+/).filter(Boolean);
    return parts.map(p => p.toLowerCase());
}

/**
 * Analyze a list of names and return abbreviated forms and a compact title suggestion.
 * Prefers common suffix; falls back to common prefix. If neither is found, tries a common infix
 * (longest common contiguous token subsequence present in all names).
 * Only activates if at least one name is "long" (>6 chars) and a non-empty common part exists.
 * @param {string[]} names
 * @returns {{use: boolean, mode?: 'prefix'|'suffix'|'infix', common?: string[], shortNames?: string[], titleText?: string}}
 */
export function analyzeNamesForAbbrev(names) {
    const normalized = (names || []).map(n => safeStringTrim(n)).filter(Boolean);
    if (normalized.length < 2) return { use: false };

    const anyLong = normalized.some(n => n.length > 6);
    const tokenLists = normalized.map(splitNameTokens);
    if (tokenLists.some(t => t.length === 0)) return { use: false };

    // Common suffix
    let suffix = [];
    const minLenS = Math.min(...tokenLists.map(l => l.length));
    for (let k = 1; k <= minLenS; k++) {
        const tok = tokenLists[0][tokenLists[0].length - k];
        if (tokenLists.every(lst => lst[lst.length - k] === tok)) {
            suffix.unshift(tok);
        } else {
            break;
        }
    }

    // Common prefix
    let prefix = [];
    const minLenP = Math.min(...tokenLists.map(l => l.length));
    for (let k = 0; k < minLenP; k++) {
        const tok = tokenLists[0][k];
        if (tokenLists.every(lst => lst[k] === tok)) {
            prefix.push(tok);
        } else {
            break;
        }
    }

    // If neither suffix nor prefix exists, attempt to find a common infix (middle) subsequence
    let mode = suffix.length ? 'suffix' : (prefix.length ? 'prefix' : null);
    let common = mode === 'suffix' ? suffix : (mode === 'prefix' ? prefix : null);

    // Helper to find the longest common contiguous subsequence across all lists
    function findLongestCommonContiguousSubsequence(lists) {
        if (!lists.length) return [];
        const ref = lists[0];
        let best = [];
        for (let i = 0; i < ref.length; i++) {
            for (let j = i + 1; j <= ref.length; j++) {
                const sub = ref.slice(i, j);
                if (!sub.length) continue;
                // Quick skip if current sub can't beat best
                if (sub.length <= best.length) continue;

                const presentInAll = lists.every(lst => {
                    // search sub contiguously within lst
                    for (let a = 0; a + sub.length <= lst.length; a++) {
                        let ok = true;
                        for (let b = 0; b < sub.length; b++) {
                            if (lst[a + b] !== sub[b]) { ok = false; break; }
                        }
                        if (ok) return true;
                    }
                    return false;
                });

                if (presentInAll) {
                    best = sub;
                }
            }
        }
        return best;
    }

    if (!mode) {
        const infix = findLongestCommonContiguousSubsequence(tokenLists);
        if (infix.length) {
            mode = 'infix';
            common = infix;
        }
    }

    if (!mode || !anyLong) return { use: false };

    // Build short tokens per name by removing the common part according to the mode
    const shortTokensPer = tokenLists.map(lst => {
        if (mode === 'suffix') {
            return lst.slice(0, Math.max(0, lst.length - suffix.length));
        }
        if (mode === 'prefix') {
            return lst.slice(prefix.length);
        }
        // mode === 'infix'
        // remove the first occurrence of the common subsequence
        let startIndex = -1;
        for (let a = 0; a + common.length <= lst.length; a++) {
            let ok = true;
            for (let b = 0; b < common.length; b++) {
                if (lst[a + b] !== common[b]) { ok = false; break; }
            }
            if (ok) { startIndex = a; break; }
        }
        if (startIndex === -1) {
            // Shouldn't happen if common was verified, but fallback to original
            return lst.slice();
        }
        return lst.slice(0, startIndex).concat(lst.slice(startIndex + common.length));
    });

    // Ensure we have at least something for each short name
    const shortNames = shortTokensPer.map((toks) => {
        const useToks = toks.length ? toks : ['na'];
        return useToks.join('_');
    });

    let titleText;
    if (mode === 'suffix') {
        titleText = `${shortNames.join('/')}${suffix.length ? ' ' + suffix.join(' ') : ''}`;
    } else if (mode === 'prefix') {
        titleText = `${prefix.join(' ')}${shortNames.length ? ' ' + shortNames.join('/') : ''}`;
    } else {
        // infix: render "<common> <short1>/<short2>/..."
        // Use underscore to preserve snake_case style for the common middle
        titleText = `${common.join('_')}${shortNames.length ? ' ' + shortNames.join('/') : ''}`;
    }

    return { use: true, mode, common, shortNames, titleText };
}

/**
 * Build a compact node title for Get/Set twin nodes from a list of names.
 * - Falls back to "<kind>TwinNodes" if no names
 * - Uses analyzeNamesForAbbrev for compact titles when beneficial
 * - Applies optional "Get_/Set_" prefix unless disablePrefix is true
 * @param {string[]} names
 * @param {"get"|"set"} kind
 * @param {boolean} [disablePrefix=false]
 * @returns {string}
 */
export function computeTwinNodeTitle(names, kind, disablePrefix = false) {
    const normalized = Array.isArray(names)
        ? names.map(n => safeStringTrim(n)).filter(Boolean)
        : [];
    const baseTitle = `${kind}TwinNodes`;
    if (normalized.length === 0) return baseTitle;

    const analysis = analyzeNamesForAbbrev(normalized);
    if (analysis && analysis.use) {
        return (disablePrefix ? "" : `${kind} `) + analysis.titleText;
    }
    const joined = normalized.join(" & ");
    return (disablePrefix ? "" : `${kind} `) + joined;
}

/**
 * Safely convert a value to a trimmed string, returning empty string if null/undefined.
 * @param {*} value - The value to convert
 * @returns {string} The trimmed string or empty string
 */
export function safeStringTrim(value) {
    return (value != null) ? String(value).trim() : "";
}

/**
 * Extracts the names of widgets from a given node, with an optional filter for connected widgets.
 *
 * @param {Object} node - The node containing the widgets and optional input/output links.
 * @param {Object} [options={}] - Optional configuration.
 * @param {boolean|'inputs'|'outputs'} [options.connectedOnly=false] - If true, include widgets with either input or output links; if "inputs", require connected input links; if "outputs", require connected output links. Other truthy values behave like "inputs".
 * @param {boolean} [options.unique=true] - If true, return only unique names (preserving first occurrences); if false, allow duplicates.
 * @return {string[]} An array of widget names, preserving original order; deduplicated when unique is true.
 */
export function extractWidgetNames(node, options = {}) {
    const { connectedOnly = false, unique = true } = options;
    const widgets = Array.isArray(node?.widgets) ? node.widgets : [];

    // Helpers to determine connectivity for widgetIndex i
    const hasInputLink = (i) => node?.inputs?.[i]?.link != null;
    const hasOutputLink = (i) => {
        const links = node?.outputs?.[i]?.links;
        return Array.isArray(links) ? links.length > 0 : links != null;
    };

    const result = [];

    for (let i = 0; i < widgets.length; i++) {
        // Connectivity gating based directly on connectedOnly
        if (connectedOnly) {
            let linked;
            if (connectedOnly === 'inputs') {
                linked = hasInputLink(i);
            } else if (connectedOnly === 'outputs') {
                linked = hasOutputLink(i);
            } else {
                linked = hasInputLink(i) || hasOutputLink(i);
            } 
            if (!linked) continue;
        }

        const raw = widgets[i]?.value;
        if (raw == null) continue;

        const val = safeStringTrim(raw);
        if (!val) continue;
        if (unique && result.indexOf(val) !== -1) continue;

        result.push(val);
    }

    return result;
}
