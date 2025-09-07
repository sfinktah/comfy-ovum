/**
 * Centralized logging utility (static class).
 *
 * Overview:
 * - Provides a single entry point for all logging in the app (Logger.log()).
 * - Accepts a metadata object as the first argument, then forwards remaining arguments to the console identically to console.*.
 * - Accumulates in-memory statistics: totals, emitted/suppressed counts, bySeverity/byTag/bySource breakdowns, and combo counts.
 * - Supports prioritized allow/deny rules (whitelist/blacklist) that match by severity, tag, and source (class::method).
 * - Persists rules to localStorage and restores them on load.
 * - Exposes a simple console API for rule management and stats (e.g., Logger.addRule, Logger.listRules, Logger.showStats).
 *
 * Meta object format (first argument to Logger.log()):
 * {
 *   class: 'ClassName',               // optional; used to form "source" with method
 *   method: 'methodName',             // optional; used to form "source" with class
 *   severity: 'trace'|'debug'|'info'|'warn'|'error', // optional; defaults to 'debug'
 *   tag: 'tag' | ['tagA','tagB']      // optional; array or string; can be used for filtering and stats
 * }
 *
 * Severity mapping:
 * - 'trace' -> console.debug (avoids stack traces from console.trace)
 * - 'debug' -> console.debug
 * - 'info'  -> console.info
 * - 'warn'  -> console.warn
 * - 'error' -> console.error
 *
 * Source:
 * - Derived from meta.class and meta.method as "ClassName::methodName".
 * - If neither supplied, source is empty for display; stats record "(no-source)" placeholder.
 *
 * Rules (iptables-style):
 * - Ordered chain; rules processed sequentially, first match wins.
 * - Each rule has an action: 'allow' or 'deny'.
 * - Match criteria: severity (string|array), tag (string|array), source (string|array). Omitted criterion is a wildcard.
 * - Rules are numbered starting from 1 (like iptables line numbers).
 * - Commands mirror iptables:
 *   - appendRule(): Add rule to end of chain (like iptables -A)
 *   - insertRule(pos, rule): Insert rule at position (like iptables -I)
 *   - deleteRule(pos): Delete rule by number (like iptables -D)
 *   - replaceRule(pos, rule): Replace rule at position (like iptables -R)
 *   - listRules(): List all rules with numbers (like iptables -L)
 *   - flushRules(): Clear all rules (like iptables -F)
 * - Examples:
 *     Logger.appendRule({ action: 'deny', tag: 'function_entered', comment: 'Hide function enter spam' });
 *     Logger.insertRule(1, { action: 'allow', severity: ['warn','error'], comment: 'Always show warnings/errors first' });
 *     Logger.deleteRule(3); // Delete rule #3
 *     Logger.replaceRule(2, { action: 'deny', source: 'SetTwinNodes::update' });
 * - Rules are persisted to localStorage under a versioned key.
 *      *
 *      * Rule format:
 *      * {
 *      *   action: 'allow'|'deny',       // required
 *      *   severity?: string|string[],   // optional; match when severity is one of these values
 *      *   tag?: string|string[],        // optional; match when any of the log's tags is in this set
 *      *   source?: string|string[],     // optional; exact match against "Class::method"
 *      *   comment?: string              // optional; freeform note for humans
 *      * }
 *      *
 *      * Priority:
 *      * - If widgetIndex is provided, inserts at that widgetIndex (0 = highest priority).
 *      * - Otherwise appends to the end (lowest priority).
 *      *
 *      * Persistence:
 *      * - The updated rule list is persisted to localStorage.
 *      *
 *      * @param {Object} rule The rule object; invalid rules are ignored.
 *      * @param {number|null} [index=null] Optional insertion widgetIndex.
 *      * @returns {Array<Object>|undefined} The updated rule list as returned by listRules(), or undefined if rule was invalid.
 *
 * Stats:
 * - Logger maintains counters for totals, emitted, suppressed, and per-dimension breakdowns (severity, tag, source).
 * - Use Logger.showStats() for a quick console view; Logger.getStats() returns a plain object snapshot; Logger.resetStats() clears counts.
 *
 * Quick usage:
 *   Logger.log({ class: 'Widget', method: 'init', severity: 'trace', tag: 'function_entered' }, 'Initializing with', opts);
 *   
 *   // iptables-style rule management:
 *   Logger.appendRule({ action: 'deny', tag: 'function_entered' }); // append rule to end
 *   Logger.insertRule(1, { action: 'allow', severity: ['warn','error'] }); // insert as first rule
 *   Logger.deleteRule(2); // delete rule #2
 *   Logger.replaceRule(1, { action: 'allow', severity: 'error' }); // replace rule #1
 *   Logger.listRules(); // list all rules with numbers
 *   Logger.flushRules(); // clear all rules
 *   
 *   Logger.showStats();
 *
 * Backwards compatibility:
 * - Named export `log` is provided and bound to Logger.log(), so existing imports can continue using `log(meta, ...args)`.
 */

const LEVEL_TO_CONSOLE = {
    trace: 'debug', // use debug to avoid stack traces from console.trace
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
};

const RULES_STORAGE_KEY = 'ovum.logger.rules.v1';

function normalizeTag(tag) {
    if (Array.isArray(tag)) return tag.filter(Boolean).map(String);
    if (typeof tag === 'string' && tag) return [tag];
    return [];
}

function buildSource(meta) {
    const cls = meta?.class ? String(meta.class) : '';
    const method = meta?.method ? String(meta.method) : '';
    return (cls || method) ? `${cls}${cls && method ? '::' : ''}${method}` : '';
}

function buildPrefix(meta) {
    const source = buildSource(meta);
    const sev = meta?.severity ? String(meta.severity) : 'debug';
    const tags = normalizeTag(meta?.tag);
    const parts = [];
    if (source) parts.push(`[${source}]`);
    parts.push(`[${sev}]`);
    if (tags.length) parts.push(`[${tags.join(',')}]`);
    return parts.join('');
}

function stripSuperfluousArgs(meta, args) {
    if (!args || args.length === 0) return args;

    const cls = meta?.class ? String(meta.class) : '';
    const method = meta?.method ? String(meta.method) : '';

    // If we don't have class or method info, return args unchanged
    if (!cls && !method) return args;

    return args.filter(arg => {
        // Only filter string arguments
        if (typeof arg !== 'string') return true;

        // Check if the string contains redundant class/method information
        let containsClass = cls && arg.includes(`[${cls}]`);
        let containsMethod = method && arg.includes(method);
        let containsSource = cls && method && arg.includes(`[${cls}]`) && arg.includes(method);

        // Remove if the string appears to be just redundant source information
        if (containsSource || (containsClass && containsMethod)) {
            // Additional check: if the string is mostly just the redundant info, remove it
            const cleanArg = arg.replace(/\[.*?\]/g, '').trim();
            if (!cleanArg || cleanArg === method || cleanArg === cls) {
                return false;
            }
        }

        return true;
    });
}

function safeLocalStorageGet(key) {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(key);
        }
    } catch (_e) {}
    return null;
}

function safeLocalStorageSet(key, value) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, value);
        }
    } catch (_e) {}
}

/**
 * Attempt to compile a string into a RegExp.
 * Supports two styles:
 *  - Slash-delimited: '/pattern/flags'
 *  - Bare pattern: 'foo.*bar' (compiled as new RegExp(pattern))
 * Returns null if compilation fails.
 * @param {string} pattern
 * @returns {RegExp|null}
 */
function tryMakeRegExp(pattern) {
    if (typeof pattern !== 'string') return null;
    try {
        // Slash-delimited with optional flags
        if (pattern.length >= 2 && pattern[0] === '/' && pattern.lastIndexOf('/') > 0) {
            const last = pattern.lastIndexOf('/');
            const body = pattern.slice(1, last);
            const flags = pattern.slice(last + 1);
            return new RegExp(body, flags);
        }
        return new RegExp(pattern);
    } catch (_e) {
        return null;
    }
}

/**
 * Logger (static class)
 *
 * Responsibilities:
 * - Centralizes logging with metadata and severity mapping to console methods.
 * - Applies prioritized allow/deny rules against severity, tag, and source (class::method).
 * - Maintains and exposes in-memory statistics about logging activity.
 * - Persists and restores rules to/from localStorage.
 *
 * Notes:
 * - All methods are static; there is no instance state.
 * - Logger.init() is called automatically, but can be called explicitly if needed.
 * - For convenience in the browser, Logger is exposed on window.Logger (when available).
 */
export class Logger {
    static _initialized = false;
    static _rules = []; // prioritized list; first match wins
    static _stats = {
        total: 0,
        emitted: 0,
        suppressed: 0,
        bySeverity: Object.create(null),
        byTag: Object.create(null),
        bySource: Object.create(null),
        combos: Object.create(null),        // key: `${severity}|${tag}|${source}`
        suppressedByRule: Object.create(null), // key: ruleIndex
    };

    // Initialization to load persisted rules and expose Logger to window for console access
    static init() {
        if (this._initialized) return;
        this._initialized = true;
        this._loadRules();
        try {
            if (typeof window !== 'undefined') {
                // Expose for easy console access
                window.Logger = this;
            }
        } catch (_e) {}
    }

    // ---- Public API ----

    /**
     * Log via the central logger.
     *
     * Behavior:
     * - Evaluates rules (first match wins). If a 'deny' rule matches, the log is suppressed but still counted in stats.
     * - If allowed, forwards to the appropriate console method based on severity, prefixing output with [source][severity][tags].
     * - Updates statistics counters regardless of suppression status.
     *
     * Source and tags:
     * - Source is derived from meta.class and meta.method as "Class::method".
     * - Tags may be a string or an array; internally normalized to an array; if absent, stats use "(no-tag)" placeholder.
     *
     * @param {{class?: string, method?: string, severity?: 'trace'|'debug'|'info'|'warn'|'error', tag?: string|string[]}} meta
     *        Structured metadata describing the log source and attributes.
     * @param  {...any} args
     *        Any additional arguments; forwarded identically to the underlying console function.
     * @returns {void}
     */
    static log(meta, ...args) {
        this.init();

        const severity = (meta && typeof meta.severity === 'string' && LEVEL_TO_CONSOLE[meta.severity])
            ? meta.severity
            : 'debug';
        const consoleMethod = LEVEL_TO_CONSOLE[severity] || 'log';
        const tags = normalizeTag(meta?.tag);
        const source = buildSource(meta);

        const match = this._matchRules({ severity, tags, source });
        const allowed = match?.action ? match.action === 'allow' : true;

        // Update stats
        this._updateStats({ severity, tags, source }, allowed, match?.index);

        if (!allowed) return;

        const prefix = buildPrefix({ ...meta, severity, tag: tags });
        const filteredArgs = stripSuperfluousArgs(meta, args);

        // Display arguments with superfluous information stripped
        try {
            if (prefix) {
                console[consoleMethod](prefix, ...filteredArgs);
            } else {
                console[consoleMethod](...filteredArgs);
            }
        } catch (_e) {
            // Fallback if console method is not available for any reason
            try {
                if (prefix) {
                    console.log(prefix, ...filteredArgs);
                } else {
                    console.log(...filteredArgs);
                }
            } catch (_e2) {
                // Swallow to avoid breaking app on logging failures
            }
        }
    }

    // Stats helpers
    /**
     * Reset all statistics counters to zero.
     * Does not affect rules or persistence; purely in-memory counters.
     * @returns {void}
     */
    static resetStats() {
        this._stats = {
            total: 0,
            emitted: 0,
            suppressed: 0,
            bySeverity: Object.create(null),
            byTag: Object.create(null),
            bySource: Object.create(null),
            combos: Object.create(null),
            suppressedByRule: Object.create(null),
        };
    }

    /**
     * Get a snapshot of current statistics.
     * A shallow-cloned object is returned to prevent external mutation of internal state.
     * @returns {{ total:number, emitted:number, suppressed:number, bySeverity:Object, byTag:Object, bySource:Object, combos:Object, suppressedByRule:Object }}
     */
    static getStats() {
        // return a shallow-cloned snapshot to avoid external mutation
        const cloneMap = (m) => Object.assign({}, m);
        return {
            total: this._stats.total,
            emitted: this._stats.emitted,
            suppressed: this._stats.suppressed,
            bySeverity: cloneMap(this._stats.bySeverity),
            byTag: cloneMap(this._stats.byTag),
            bySource: cloneMap(this._stats.bySource),
            combos: cloneMap(this._stats.combos),
            suppressedByRule: cloneMap(this._stats.suppressedByRule),
        };
    }

    /**
     * Pretty-print a summary of current statistics to the console.
     *
     * Includes:
     * - Totals (total/emitted/suppressed)
     * - By-severity counts
     * - By-tag counts
     * - By-source counts
     * - The current rule list (with indices)
     *
     * Returns a snapshot object identical to getStats().
     * @returns {{ total:number, emitted:number, suppressed:number, bySeverity:Object, byTag:Object, bySource:Object, combos:Object, suppressedByRule:Object }}
     */
    static showStats() {
        const s = this.getStats();
        try {
            console.groupCollapsed?.('[Logger] Statistics');
        } catch (_e) {}
        try { console.info?.('[Logger] totals', { total: s.total, emitted: s.emitted, suppressed: s.suppressed }); } catch (_e) {}
        try { console.table?.(s.bySeverity); } catch (_e) { try { console.info?.('[Logger] bySeverity', s.bySeverity); } catch (_e2) {} }
        try { console.table?.(s.byTag); } catch (_e) { try { console.info?.('[Logger] byTag', s.byTag); } catch (_e2) {} }
        try { console.table?.(s.bySource); } catch (_e) { try { console.info?.('[Logger] bySource', s.bySource); } catch (_e2) {} }
        try { console.info?.('[Logger] rules', this.listRules()); } catch (_e) {}
        try {
            console.groupEnd?.();
        } catch (_e) {}
        return s;
    }

    // iptables-style Rule Management
    /**
     * List rules in iptables-style format with line numbers.
     * Similar to 'iptables -L' command.
     * @param {boolean} [verbose=false] Show detailed information
     * @returns {void} Prints rules to console
     */
    static listRules(verbose = false) {
        this.init();
        console.log('Logger Rules (processed in order):');
        console.log('num  action   criteria');
        console.log('---  ------   ---------');

        if (this._rules.length === 0) {
            console.log('(no rules - default ACCEPT)');
            return;
        }

        this._rules.forEach((rule, i) => {
            const num = (i + 1).toString().padStart(3);
            const action = rule.action.toUpperCase().padEnd(6);
            const criteria = this._formatRuleCriteria(rule, verbose);
            console.log(`${num}  ${action}   ${criteria}`);
        });
    }

    /**
     * Append a rule to the end of the chain.
     * Similar to 'iptables -A' command.
     * @param {Object} rule Rule specification
     * @returns {number|undefined} Rule number if successful
     */
    static appendRule(rule) {
        const sanitized = this._sanitizeRule(rule);
        if (!sanitized) return;
        this._rules.push(sanitized);
        this._saveRules();
        return this._rules.length;
    }

    /**
     * Insert a rule at the specified position.
     * Similar to 'iptables -I' command.
     * @param {number} position 1-based position (1 = first rule)
     * @param {Object} rule Rule specification
     * @returns {number|undefined} Rule number if successful
     */
    static insertRule(position, rule) {
        const sanitized = this._sanitizeRule(rule);
        if (!sanitized) return;

        // Convert 1-based position to 0-based index
        let index = position - 1;
        if (index < 0) index = 0;
        if (index > this._rules.length) index = this._rules.length;

        this._rules.splice(index, 0, sanitized);
        this._saveRules();
        return index + 1;
    }

    /**
     * Delete a rule by position or by specification.
     * Similar to 'iptables -D' command.
     * @param {number|Object} ruleSpec Either 1-based rule number or rule specification to match
     * @returns {boolean} True if rule was deleted
     */
    static deleteRule(ruleSpec) {
        if (typeof ruleSpec === 'number') {
            // Delete by rule number (1-based)
            const index = ruleSpec - 1;
            if (index < 0 || index >= this._rules.length) return false;
            this._rules.splice(index, 1);
            this._saveRules();
            return true;
        } else if (typeof ruleSpec === 'object') {
            // Delete by matching rule specification
            const index = this._findMatchingRuleIndex(ruleSpec);
            if (index === -1) return false;
            this._rules.splice(index, 1);
            this._saveRules();
            return true;
        }
        return false;
    }

    /**
     * Replace a rule at the specified position.
     * Similar to 'iptables -R' command.
     * @param {number} position 1-based position
     * @param {Object} rule New rule specification
     * @returns {boolean} True if rule was replaced
     */
    static replaceRule(position, rule) {
        const index = position - 1;
        if (index < 0 || index >= this._rules.length) return false;

        const sanitized = this._sanitizeRule(rule);
        if (!sanitized) return false;

        this._rules[index] = sanitized;
        this._saveRules();
        return true;
    }

    /**
     * Flush all rules (equivalent to clearing the chain).
     * Similar to 'iptables -F' command.
     * @returns {void}
     */
    static flushRules() {
        this._rules = [];
        this._saveRules();
    }

    /**
     * Get rule count.
     * @returns {number} Number of rules
     */
    static getRuleCount() {
        return this._rules.length;
    }

    /**
     * Get rules array with position numbers (backwards compatibility).
     * @returns {Array<Object>} Array of rule objects with added 'num' property.
     */
    static getRules() {
        this.init();
        return this._rules.map((r, i) => ({ num: i + 1, ...r }));
    }

    // Legacy methods (backwards compatibility)
    /**
     * @deprecated Use appendRule instead
     */
    static addRule(rule, index = null) {
        if (index != null) {
            return this.insertRule(index + 1, rule) ? this.getRules() : undefined;
        } else {
            return this.appendRule(rule) ? this.getRules() : undefined;
        }
    }

    /**
     * @deprecated Use appendRule with action: 'allow' instead
     */
    static addAllowRule(criteria, index = null) {
        return this.addRule({ action: 'allow', ...criteria }, index);
    }

    /**
     * @deprecated Use appendRule with action: 'deny' instead
     */
    static addDenyRule(criteria, index = null) {
        return this.addRule({ action: 'deny', ...criteria }, index);
    }

    /**
     * @deprecated Use deleteRule instead
     */
    static removeRule(index) {
        return this.deleteRule(index + 1) ? this.getRules() : undefined;
    }

    /**
     * @deprecated Use insertRule/deleteRule combination instead
     */
    static moveRule(fromIndex, toIndex) {
        if (fromIndex === toIndex) return this.getRules();
        if (fromIndex < 0 || fromIndex >= this._rules.length) return;
        if (toIndex < 0) toIndex = 0;
        if (toIndex >= this._rules.length) toIndex = this._rules.length - 1;
        const [r] = this._rules.splice(fromIndex, 1);
        this._rules.splice(toIndex, 0, r);
        this._saveRules();
        return this.getRules();
    }

    /**
     * @deprecated Use flushRules instead
     */
    static clearRules() {
        this.flushRules();
    }

    /**
     * @deprecated Use direct rule manipulation methods instead
     */
    static setRules(rules) {
        this._rules = this._sanitizeRulesArray(Array.isArray(rules) ? rules : []);
        this._saveRules();
    }

    // ---- Internal helpers ----

    /**
     * Format rule criteria for display in iptables-style listing.
     * @param {Object} rule Rule object
     * @param {boolean} verbose Show detailed information
     * @returns {string} Formatted criteria string
     * @private
     */
    static _formatRuleCriteria(rule, verbose = false) {
        const parts = [];

        if (rule.severity) {
            const sevs = Array.isArray(rule.severity) ? rule.severity : [rule.severity];
            parts.push(`severity ${sevs.join(',')}`);
        }

        if (rule.tag) {
            const tags = Array.isArray(rule.tag) ? rule.tag : [rule.tag];
            parts.push(`tag ${tags.join(',')}`);
        }

        if (rule.source) {
            const sources = Array.isArray(rule.source) ? rule.source : [rule.source];
            parts.push(`source ${sources.join(',')}`);
        }

        if (parts.length === 0) {
            parts.push('all');
        }

        let criteria = parts.join(' ');

        if (rule.comment) {
            criteria += ` /* ${rule.comment} */`;
        }

        return criteria;
    }

    /**
     * Find the index of a rule matching the given specification.
     * @param {Object} ruleSpec Rule specification to match
     * @returns {number} Index of matching rule, or -1 if not found
     * @private
     */
    static _findMatchingRuleIndex(ruleSpec) {
        return this._rules.findIndex(rule => this._rulesMatch(rule, ruleSpec));
    }

    /**
     * Check if two rule specifications match.
     * @param {Object} rule1 First rule
     * @param {Object} rule2 Second rule
     * @returns {boolean} True if rules match
     * @private
     */
    static _rulesMatch(rule1, rule2) {
        if (rule1.action !== rule2.action) return false;

        // Compare arrays/strings as normalized arrays
        const normalize = (val) => {
            if (Array.isArray(val)) return [...val].sort();
            if (typeof val === 'string') return [val];
            return null;
        };

        const compareArrays = (a1, a2) => {
            if (a1 === null && a2 === null) return true;
            if (a1 === null || a2 === null) return false;
            if (a1.length !== a2.length) return false;
            return a1.every((item, index) => item === a2[index]);
        };

        const sev1 = normalize(rule1.severity);
        const sev2 = normalize(rule2.severity);
        if (!compareArrays(sev1, sev2)) return false;

        const tag1 = normalize(rule1.tag);
        const tag2 = normalize(rule2.tag);
        if (!compareArrays(tag1, tag2)) return false;

        const src1 = normalize(rule1.source);
        const src2 = normalize(rule2.source);
        if (!compareArrays(src1, src2)) return false;

        return true;
    }

    static _updateStats({ severity, tags, source }, allowed, matchedRuleIndex) {
        this._stats.total += 1;
        if (allowed) this._stats.emitted += 1; else this._stats.suppressed += 1;

        // severity
        this._stats.bySeverity[severity] = (this._stats.bySeverity[severity] || 0) + 1;

        // source
        const src = source || '(no-source)';
        this._stats.bySource[src] = (this._stats.bySource[src] || 0) + 1;

        // tags (if none, use '(no-tag)' placeholder)
        const tagsArr = (tags && tags.length) ? tags : ['(no-tag)'];
        for (const t of tagsArr) {
            this._stats.byTag[t] = (this._stats.byTag[t] || 0) + 1;
            const comboKey = `${severity}|${t}|${src}`;
            this._stats.combos[comboKey] = (this._stats.combos[comboKey] || 0) + 1;
        }

        if (!allowed && typeof matchedRuleIndex === 'number') {
            const k = String(matchedRuleIndex);
            this._stats.suppressedByRule[k] = (this._stats.suppressedByRule[k] || 0) + 1;
        }
    }

    /**
     * Determine the first matching rule for the given attributes.
     *
     * Matching rules:
     * - First match wins; the list is treated as prioritized from widgetIndex 0 upwards.
     * - For each criterion:
     *   - If rule.severity is present, severity must match either an exact string or any provided RegExp.
     *   - If rule.tag is present, at least one of the log's tags must match either an exact string or any provided RegExp.
     *   - If rule.source is present, source must match either an exact string or any provided RegExp.
     *   - String criteria are treated as regular expressions when possible; if compilation fails, they are matched as exact strings.
     * - Omitted criteria are treated as wildcards.
     *
     * Return value:
     * - { widgetIndex: number, action: 'allow'|'deny' } for a match
     * - null when no rule matches (which defaults to 'allow')
     *
     * @param {{ severity: string, tags: string[], source: string }} attrs
     * @returns {{ widgetIndex:number, action:'allow'|'deny' } | null}
     * @private
     */
    static _matchRules({ severity, tags, source }) {
        // First match wins. Empty rules array => allow.
        if (!Array.isArray(this._rules) || this._rules.length === 0) return null;

        for (let i = 0; i < this._rules.length; i++) {
            const rule = this._rules[i];
            if (!rule || (rule.action !== 'allow' && rule.action !== 'deny')) continue;

            const sevOk =
                !rule.severity ||
                (rule._sevSet?.has(severity) === true) ||
                ((rule._sevRegex && rule._sevRegex.length > 0) ? rule._sevRegex.some(re => re.test(severity)) : false);

            const tagOk =
                !rule.tag ||
                this._ruleMatchesAnyTag(rule, tags);

            const srcOk =
                !rule.source ||
                (rule._srcSet?.has(source) === true) ||
                ((rule._srcRegex && rule._srcRegex.length > 0) ? rule._srcRegex.some(re => re.test(source)) : false);

            if (sevOk && tagOk && srcOk) {
                return { index: i, action: rule.action };
            }
        }
        return null; // default allow
    }

    static _ruleMatchesAnyTag(rule, tags) {
        if (!rule.tag) return true;
        if (!tags || tags.length === 0) return false;
        for (const t of tags) {
            if (rule._tagSet?.has(t)) return true;
            if (rule._tagRegex && rule._tagRegex.length > 0) {
                for (const re of rule._tagRegex) {
                    try {
                        if (re.test(t)) return true;
                    } catch (_e) {
                        // ignore regex test errors
                    }
                }
            }
        }
        return false;
    }

    static _sanitizeRulesArray(rules) {
        return rules
            .map(r => this._sanitizeRule(r))
            .filter(Boolean);
    }

    /**
     * Sanitize a single rule object.
     *
     * - Validates 'action' to be either 'allow' or 'deny'.
     * - Normalizes severity, tag, and source to arrays of strings (when provided).
     * - Builds internal exact-match Sets (_sevSet/_tagSet/_srcSet) and RegExp arrays (_sevRegex/_tagRegex/_srcRegex) for efficient matching.
     * - Preserves original string arrays for persistence and display.
     * - Preserves a human-readable 'comment' field if provided.
     *
     * String criteria are treated as regular expressions when possible:
     * - If the string is slash-delimited (e.g., '/foo.*./i'), the pattern and flags are respected.
     * - Otherwise the string is compiled as a bare RegExp (new RegExp(str)). If that fails, falls back to exact string match.
     *
     * @param {any} rule A candidate rule object.
     * @returns {{ action:'allow'|'deny', severity?:string[], tag?:string[], source?:string[], comment?:string,
     *             _sevSet?:Set<string>, _tagSet?:Set<string>, _srcSet?:Set<string>,
     *             _sevRegex?:RegExp[], _tagRegex?:RegExp[], _srcRegex?:RegExp[] } | null}
     * @private
     */
    static _sanitizeRule(rule) {
        if (!rule) return null;
        const action = (rule.action === 'allow' || rule.action === 'deny') ? rule.action : null;
        if (!action) return null;

        // Accept string or array for fields; store internal Sets and RegExp arrays for fast match
        const norm = { action, comment: rule.comment };

        if (rule.severity != null) {
            const list = Array.isArray(rule.severity) ? rule.severity : [rule.severity];
            const cleaned = list.map(String).filter(Boolean);
            if (cleaned.length) {
                norm.severity = cleaned; // preserve original criteria for persistence
                const exact = [];
                const regex = [];
                for (const s of cleaned) {
                    const re = tryMakeRegExp(s);
                    if (re) regex.push(re);
                    else exact.push(s);
                }
                if (exact.length) norm._sevSet = new Set(exact);
                if (regex.length) norm._sevRegex = regex;
            }
        }
        if (rule.tag != null) {
            const list = Array.isArray(rule.tag) ? rule.tag : [rule.tag];
            const cleaned = list.map(String).filter(Boolean);
            if (cleaned.length) {
                norm.tag = cleaned; // preserve original criteria for persistence
                const exact = [];
                const regex = [];
                for (const s of cleaned) {
                    const re = tryMakeRegExp(s);
                    if (re) regex.push(re);
                    else exact.push(s);
                }
                if (exact.length) norm._tagSet = new Set(exact);
                if (regex.length) norm._tagRegex = regex;
            }
        }
        if (rule.source != null) {
            const list = Array.isArray(rule.source) ? rule.source : [rule.source];
            const cleaned = list.map(String).filter(Boolean);
            if (cleaned.length) {
                norm.source = cleaned; // preserve original criteria for persistence
                const exact = [];
                const regex = [];
                for (const s of cleaned) {
                    const re = tryMakeRegExp(s);
                    if (re) regex.push(re);
                    else exact.push(s);
                }
                if (exact.length) norm._srcSet = new Set(exact);
                if (regex.length) norm._srcRegex = regex;
            }
        }
        return norm;
    }

    static _saveRules() {
        try {
            const serializable = this._rules.map(r => ({
                action: r.action,
                severity: r.severity,
                tag: r.tag,
                source: r.source,
                comment: r.comment,
            }));
            safeLocalStorageSet(RULES_STORAGE_KEY, JSON.stringify(serializable));
        } catch (_e) {}
    }

    static _loadRules() {
        const raw = safeLocalStorageGet(RULES_STORAGE_KEY);
        if (!raw) {
            this._rules = [];
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                this._rules = this._sanitizeRulesArray(parsed);
            } else {
                this._rules = [];
            }
        } catch (_e) {
            this._rules = [];
        }
    }
}

// Backwards-compatible function export
export const log = Logger.log.bind(Logger);

// Initialize on module load
Logger.init();

export default Logger;
