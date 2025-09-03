/**
 * Split a name into tokens for comparison, handling snake_case, kebab-case, camelCase, digits, etc.
 * Tokens are lowercased for matching.
 * @param {string} str
 * @returns {string[]}
 */
function splitNameTokens(str) {
    if (typeof str !== 'string') return [];
    let s = String(str).trim();
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
 * Prefers common suffix; falls back to common prefix. Only activates if at least one name is "long" (>6 chars)
 * and a non-empty common prefix/suffix exists.
 * @param {string[]} names
 * @returns {{use: boolean, mode?: 'prefix'|'suffix', common?: string[], shortNames?: string[], titleText?: string}}
 */
export function analyzeNamesForAbbrev(names) {
    const normalized = (names || []).map(n => (n == null ? '' : String(n).trim())).filter(Boolean);
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

    let mode = suffix.length ? 'suffix' : (prefix.length ? 'prefix' : null);
    if (!mode || !anyLong) return { use: false };

    const common = mode === 'suffix' ? suffix : prefix;
    const shortTokensPer = tokenLists.map(lst => {
        if (mode === 'suffix') return lst.slice(0, Math.max(0, lst.length - suffix.length));
        return lst.slice(prefix.length);
    });

    // Ensure we have at least something for each short name
    const shortNames = shortTokensPer.map((toks) => {
        const useToks = toks.length ? toks : ['na'];
        return useToks.join('_');
    });

    let titleText;
    if (mode === 'suffix') {
        titleText = `${shortNames.join('/')}${suffix.length ? ' ' + suffix.join(' ') : ''}`;
    } else {
        titleText = `${prefix.join(' ')}${shortNames.length ? ' ' + shortNames.join('/') : ''}`;
    }

    return { use: true, mode, common, shortNames, titleText };
}

/**
 * Build a compact node title for Get/Set twin nodes from a list of names.
 * - Falls back to "<kind>TwinNodes" if no names
 * - Uses analyzeNamesForAbbrev for compact titles when beneficial
 * - Applies optional "Get_/Set_" prefix unless disablePrefix is true
 * @param {string[]} names
 * @param {"Get"|"Set"} kind
 * @param {boolean} [disablePrefix=false]
 * @returns {string}
 */
export function computeTwinNodeTitle(names, kind, disablePrefix = false) {
    const normalized = Array.isArray(names)
        ? names.map(n => (n == null ? '' : String(n).trim())).filter(Boolean)
        : [];
    const baseTitle = `${kind}TwinNodes`;
    if (normalized.length === 0) return baseTitle;

    const analysis = analyzeNamesForAbbrev(normalized);
    if (analysis && analysis.use) {
        return (disablePrefix ? "" : `${kind}_`) + analysis.titleText;
    }
    const joined = normalized.join(" & ");
    return (disablePrefix ? "" : `${kind}_`) + joined;
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

    // Helpers to determine connectivity for index i
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

        const val = String(raw).trim();
        if (!val) continue;
        if (unique && result.indexOf(val) !== -1) continue;

        result.push(val);
    }

    return result;
}
