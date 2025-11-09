// Shim for scripts/api.ts
export const UnauthorizedError = window.comfyAPI.api.UnauthorizedError;
export const PromptExecutionError = window.comfyAPI.api.PromptExecutionError;
export const ComfyApi = window.comfyAPI.api.ComfyApi;

/** @typedef {import("/ovum/web/dist/node_modules/@comfyorg/comfyui-frontend-types.js").ComfyApi} ComfyApi */
export const api = window.comfyAPI.api.api;