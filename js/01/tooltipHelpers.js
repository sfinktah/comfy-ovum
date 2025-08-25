let __tippyLoader = null;

/**
 * Ensures the tooltip library is loaded.
 * @returns {Promise<void>}
 */
export function ensureTooltipLib() {
    if (window.tippy) return Promise.resolve();
    if (__tippyLoader) return __tippyLoader;

    __tippyLoader = new Promise((resolve, reject) => {
        try {
            const cssHref = "/extensions/ovum/css/tippy.css";
            if (!document.querySelector(`link[href="${cssHref}"]`)) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = cssHref;
                document.head.appendChild(link);
            }

            const popperSrc = "/extensions/ovum/lib/popper.min.js";
            const tippySrc = "/extensions/ovum/lib/tippy.umd.min.js";

            function loadScript(src) {
                return new Promise((res, rej) => {
                    if (document.querySelector(`script[src="${src}"]`)) return res();
                    const s = document.createElement('script');
                    s.src = src;
                    s.async = true;
                    s.onload = () => res();
                    s.onerror = () => rej(new Error(`Failed to load ${src}`));
                    document.head.appendChild(s);
                });
            }

            loadScript(popperSrc)
                .then(() => loadScript(tippySrc))
                .then(resolve)
                .catch(reject);
        } catch (e) {
            reject(e);
        }
    });

    return __tippyLoader;
}

/**
 * Attaches a tooltip to an element.
 * @param {HTMLElement} el 
 * @param {string|function} textOrFn 
 * @param {number} delay 
 */
export function attachTooltip(el, textOrFn, delay = 1000) {
    ensureTooltipLib().then(() => {
        if (!el || !window.tippy) return;
        window.tippy(el, {
            content: '',
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
    }).catch(err => {
        console.warn('Tooltip library failed to load:', err);
    });
}
