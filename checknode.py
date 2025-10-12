import logging
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)

class CheckKijaiNode:
    """
    Backend companion node for the frontend "CheckKijaiNode".

    Attempts to determine whether there is a matching SetNode in the current workflow
    whose first widget's value equals the provided "Constant" and whose input slot 0
    has a valid link. This mirrors the frontend heuristic as closely as is practical
    on the backend, using extra_pnginfo workflow data when available.

    Fallback behavior: if no workflow information is available, returns True iff
    Constant is a non-empty string.
    """

    NAME = "Does Kijai SetNode exist?"
    DESCRIPTION = """
    Returns True if a SetNode with the given constant exists in the workflow and
    its first input is linked; otherwise False. Falls back to checking non-empty
    constant when workflow info is not available.
    """
    CATEGORY = "ovum"
    FUNCTION = "check"

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("exists",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Constant": ("STRING", {
                    "default": "",
                    "tooltip": "The constant name to look for on a Kijai SetNode."
                }),
            },
            "hidden": {
                # These are commonly provided by ComfyUI; workflow may be found in extra_pnginfo
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    @staticmethod
    def _safe_get_workflow(extra_pnginfo: Any) -> Optional[Dict[str, Any]]:
        """
        Try to extract a workflow dict from extra_pnginfo in a resilient way.
        extra_pnginfo can be a list/tuple/dict depending on invocation context.
        """
        try:
            # Most common: a list/tuple with a dict at index 0 containing "workflow"
            if isinstance(extra_pnginfo, (list, tuple)) and extra_pnginfo:
                first = extra_pnginfo[0]
                if isinstance(first, dict) and "workflow" in first and isinstance(first["workflow"], dict):
                    return first["workflow"]

            # Sometimes extra_pnginfo is a dict with workflow directly
            if isinstance(extra_pnginfo, dict) and "workflow" in extra_pnginfo and isinstance(extra_pnginfo["workflow"], dict):
                return extra_pnginfo["workflow"]
        except Exception:
            pass
        return None

    @staticmethod
    def _node_type_matches_setnode(node_type: str) -> bool:
        """
        Frontend uses type "SetNode"; in some workflows types could be namespaced.
        Consider matches where the type is exactly "SetNode" or ends with "/SetNode".
        """
        if not isinstance(node_type, str):
            return False
        if node_type == "SetNode":
            return True
        # Handle potential namespacing like "KJNodes/SetNode"
        return node_type.endswith("/SetNode")

    @classmethod
    def _exists_in_workflow(cls, workflow: Dict[str, Any], target_constant: str) -> bool:
        """
        Search the workflow nodes for a SetNode whose first widget equals target_constant
        and whose input slot 0 has a non-null link id.
        """
        try:
            nodes = workflow.get("nodes", [])
            if not isinstance(nodes, list) or not target_constant:
                return False

            for n in nodes:
                if not isinstance(n, dict):
                    continue
                ntype = n.get("type")
                if not cls._node_type_matches_setnode(ntype):
                    continue

                # Match by first widget value if present
                widgets = n.get("widgets_values")
                const_matches = False
                if isinstance(widgets, list) and widgets:
                    first_val = widgets[0]
                    # Normalize to string for comparison consistent with frontend behavior
                    try:
                        const_matches = (str(first_val) == str(target_constant))
                    except Exception:
                        const_matches = False

                if not const_matches:
                    continue

                # Check input slot 0 link id presence (non-null)
                inputs = n.get("inputs")
                if isinstance(inputs, list) and inputs:
                    first_input = inputs[0]
                    if isinstance(first_input, dict):
                        link_id = first_input.get("link", None)
                        if link_id is not None:
                            return True
            return False
        except Exception:
            # On any parsing error, fail safely
            return False

    @classmethod
    def IS_CHANGED(cls, Constant: str = "", unique_id: Any = None, extra_pnginfo: Any = None):
        # Recompute when the Constant changes; also include a coarse fingerprint of workflow presence
        wf = cls._safe_get_workflow(extra_pnginfo)
        # Keep it lightweight and side-effect free: include whether workflow was present and node count if possible
        try:
            wf_key = None
            if isinstance(wf, dict):
                nodes = wf.get("nodes", [])
                wf_key = ("wf", len(nodes))
            return (Constant, wf_key)
        except Exception:
            return float("NaN")  # Forces ComfyUI to consider it always changed
            return Constant

    def check(self, Constant: str = "", unique_id: Any = None, extra_pnginfo: Any = None) -> Tuple[bool]:
        # Prefer workflow-driven check
        workflow = self._safe_get_workflow(extra_pnginfo)
        # so apparently that really is a thing
        if isinstance(workflow, dict):
            logger.info("[CheckKijaiNode] workflow found: {}".format(str(workflow)[:100]))
            print("[CheckKijaiNode] workflow found: {}\n".format(str(workflow)[:100]))
            exists = self._exists_in_workflow(workflow, Constant or "")
            return (bool(exists),)

        # Fallback: treat non-empty constant as "exists"
        return (bool(Constant),)


CLAZZES = [CheckKijaiNode]
