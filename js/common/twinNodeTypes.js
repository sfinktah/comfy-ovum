/**
 * Shared type guards and helpers for Twin Get/Set nodes across supported packs.
 */

/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").LGraphNode} LGraphNode */

// Base Twin types
export const GET_TWIN_TYPE = "GetTwinNodes";
export const SET_TWIN_TYPE = "SetTwinNodes";

/**
 * Lite rules for third-party packs we support equivalently.
 */
export const KJ_SET_TYPE = "SetNode";
export const EASY_USE_SET_TYPE = "easy setNode";

export const toGetType = (setType) => {
    if (!setType || typeof setType !== "string") return setType;
    return setType.replace(/set/i, (m) => (m[0] === "S" ? "Get" : "get"));
};

// Predicates
export const isGetTwinNode = (node) => node?.type === GET_TWIN_TYPE;
export const isSetTwinNode = (node) => node?.type === SET_TWIN_TYPE;
export const isGetSetTwinNode = (node) => isGetTwinNode(node) || isSetTwinNode(node);

export const isKJSetNode = (node) => node?.type === KJ_SET_TYPE;
export const isEasyUseSetNode = (node) => node?.type === EASY_USE_SET_TYPE;
export const isKJGetNode = (node) => node?.type === toGetType(KJ_SET_TYPE);
export const isEasyUseGetNode = (node) => node?.type === toGetType(EASY_USE_SET_TYPE);

export const isAnyGetNode = (node) => isGetTwinNode(node) || isKJGetNode(node) || isEasyUseGetNode(node);
export const isAnySetNode = (node) => isSetTwinNode(node) || isKJSetNode(node) || isEasyUseSetNode(node);
export const isAnyGetSetNode = (node) => isAnyGetNode(node) || isAnySetNode(node);

const TwinNodeTypes = {
    GET_TWIN_TYPE,
    SET_TWIN_TYPE,
    KJ_SET_TYPE,
    EASY_USE_SET_TYPE,
    toGetType,
    isGetTwinNode,
    isSetTwinNode,
    isGetSetTwinNode,
    isKJSetNode,
    isEasyUseSetNode,
    isKJGetNode,
    isEasyUseGetNode,
    isAnyGetNode,
    isAnySetNode,
    isAnyGetSetNode,
};
export default TwinNodeTypes;
