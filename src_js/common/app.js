// Shim for scripts/app.ts
/** @typedef {import("@comfyorg/comfyui-frontend-types").ComfyApp} ComfyApp */
export const ANIM_PREVIEW_WIDGET = window.comfyAPI.app.ANIM_PREVIEW_WIDGET;
export const ComfyApp = window.comfyAPI.app.ComfyApp;

/** @typedef {import("@comfyorg/comfyui-frontend-types").ComfyApp} ComfyApp */
export const app = window.comfyAPI.app.app;