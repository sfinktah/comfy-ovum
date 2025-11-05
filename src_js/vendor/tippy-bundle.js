// Vendor bundle entry for tippy.js that includes its Popper dependency.
// This file is built by: npm run build:vendor (vite --mode vendor)
// It produces: /ovum/web/dist/vendor/tippy-bundle.js

// Import the ESM build directly and Popper so Rollup includes both.
import tippy from 'tippy.js/dist/tippy.esm.js';
import * as Popper from '@popperjs/core';

// Create a tiny side-effect so the chunk is never considered empty during tree-shaking.
if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-underscore-dangle
    window.__ovum_has_tippy = true;
}

// Reference Popper to avoid it being removed as unused in some setups.
void Popper;

export default tippy;
