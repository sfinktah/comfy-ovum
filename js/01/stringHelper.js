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
    const shortNames = shortTokensPer.map((toks, idx) => {
        const fallback = tokenLists[idx].length ? [tokenLists[idx][0]] : [];
        const useToks = toks.length ? toks : fallback;
        return useToks.join('_');
    });

    let titleText;
    if (mode === 'suffix') {
        titleText = `${shortNames.join('/')}${suffix.length ? ' ' + suffix.join('_') : ''}`;
    } else {
        titleText = `${prefix.join('_')}${shortNames.length ? ' ' + shortNames.join('/') : ''}`;
    }

    return { use: true, mode, common, shortNames, titleText };
}
