/**
 * Removes emojis from the input string.
 * @param {string} input
 * @returns {string} String without emojis.
 */
export function removeEmojis(input) {
    if (typeof input !== "string") {
        return input == null ? "" : String(input);
    }

    try {
        const stripped = input
            .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]/gu, "")
            .replace(/\p{Emoji_Modifier_Base}\p{Emoji_Modifier}/gu, "")
            .replace(/[\u20E3]/g, "");

        return stripped.normalize();
    } catch {
        return input.replace(
            /([\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{1F100}-\u{1F1FF}]|[\u2460-\u24FF]|\uFE0F)/gu,
            ""
        );
    }
}

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
