import tippy from '/ovum/web/dist/vendor/tippy-bundle.js';

/**
 * Ensures the tooltip library is loaded (no-op when bundled via Vite).
 * Kept for backward compatibility with existing imports.
 * @returns {Promise<void>}
 */
export function ensureTooltipLib() {
    return Promise.resolve();
}

/**
 * Attaches a tooltip to an element.
 * @param {HTMLElement} el
 * @param {string|function} textOrFn
 * @param {number} delay
 */
export function attachTooltip(el, textOrFn, delay = 1000) {
    if (!el) return;
    tippy(el, {
        content: '🥚 ',
        delay: [delay, 0],
        allowHTML: true,
        theme: 'light-border',
        interactive: false,
        placement: 'bottom-start',
        onShow(instance) {
            try {
                const content = typeof textOrFn === 'function' ? textOrFn() : textOrFn;
                instance.setContent(content || '');
            } catch (e) {
                instance.setContent('');
            }
        }
    });
}
