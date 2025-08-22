
/**
 * Chains a callback function to an object's property.
 * @param {object} object 
 * @param {string} property 
 * @param {function} callback 
 */
export function chainCallback(object, property, callback) {
    if (object == undefined) {
        console.error("Tried to add callback to a non-existent object");
        return;
    }
    if (property in object) {
        const callback_orig = object[property];
        object[property] = function () {
            const r = callback_orig?.apply(this, arguments);
            callback.apply(this, arguments);
            return r;
        };
    } else {
        object[property] = callback;
    }
}

/**
 * Strips the trailing ID from a title.
 * @param {string} title
 * @returns {string} Title without the trailing ID.
 */
export function stripTrailingId(title) {
    return title.replace(/ \(\d+\)$/, '');
}
