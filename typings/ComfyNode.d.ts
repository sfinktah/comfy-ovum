// ComfyNode.d.ts

import type { LGraphNode } from "@comfyorg/litegraph/dist/LGraphNode";

/**
 * ComfyNode extends LGraphNode with additional ComfyUI-specific behaviors and callbacks.
 * Only Comfy-specific additions are declared here to avoid redeclaring LGraphNode methods.
 */
export interface ComfyNode extends LGraphNode {
  // Extra utilities / deprecations
  /** @deprecated */
  convertWidgetToInput(): boolean;
  /** @deprecated */
  setSizeForImage(): void;
}
