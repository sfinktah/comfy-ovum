"""
AssertOvum node: dynamically growing boolean checks for true*/false* inputs.
Each input is BOOLEAN,* and pairs trueN/falseN. Matching outputs mirror the actual input types.
"""
from typing import Any, Dict, Tuple
from autonode import validate, node_wrapper, get_node_names_mappings, anytype

classes = []
node = node_wrapper(classes)


def _to_bool(v: Any) -> bool:
    # Convert anything to bool using Python truthiness
    try:
        return bool(v)
    except Exception:
        # Some custom types might fail __bool__
        return True if v is not None else False


def _preview_value(v: Any) -> str:
    # If scalar, show actual value. If str, first 8 chars + ellipsis.
    # Else type and length when possible.
    try:
        if isinstance(v, (int, float, bool)) or v is None:
            return repr(v)
        if isinstance(v, str):
            s = v
            if len(s) > 8:
                return repr(s[:8] + "…")
            return repr(s)
        # Try length
        ln = None
        try:
            ln = len(v)  # type: ignore[arg-type]
        except Exception:
            ln = None
        t = type(v).__name__
        return f"<{t} len={ln}>" if ln is not None else f"<{t}>"
    except Exception:
        return "<unrepr>"


@node
class AssertOvum:
    FUNCTION = "run"
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    CATEGORY = "Logic"
    DESCRIPTION = """
    Validates boolean assertions (true_N/false_N pairs) and passes through all of its inputs to corresponding outputs.
    Use this to enforce execution order in your workflow - connect any value, add your assertions,
    then use the corresponding output to ensure downstream nodes wait for validation.
    """
    custom_name = "AssertOvum"

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        return float("NaN")  # Forces ComfyUI to consider it always changed

    def run(self, passthru_1: Any = None, true_1: Any = None, false_1: Any = None, unique_id: Any = None,
            extra_pnginfo: Any = None, prompt: Any = None, **kwargs) -> Tuple:
        all_inputs = {"passthru_1": passthru_1, "true_1": true_1, "false_1": false_1, **kwargs}

        # Validate all connected inputs by convention names trueN/falseN
        failures = []

        def check_slot(name: str, val: Any, should_be: bool):
            if val is None:  # Unconnected optional input
                return
            b = _to_bool(val)
            if b != should_be:
                failures.append((name, val))

        for k, v in all_inputs.items():
            if k.startswith("true_"):
                check_slot(k, v, True)
            elif k.startswith("false_"):
                check_slot(k, v, False)

        # Find our node in the workflow definition to get all input slots in order and title
        node_inputs = None
        node_title = None
        node_id_str = str(unique_id) if unique_id is not None else "unknown"
        if node_id_str and extra_pnginfo and isinstance(extra_pnginfo, list) and len(extra_pnginfo) > 0:
            try:
                workflow_data = extra_pnginfo[0]
                if isinstance(workflow_data, dict) and "workflow" in workflow_data:
                    workflow = workflow_data["workflow"]
                    if "nodes" in workflow:
                        for node in workflow["nodes"]:
                            if str(node.get("id")) == node_id_str:
                                node_title = node.get("title")
                                node_inputs = node.get("inputs")
                                break
            except Exception:
                pass  # Silently fail

        if failures:
            parts = []
            for name, val in failures:
                parts.append(f"{name}={_preview_value(val)}")

            if node_title:
                msg = f"AssertOvum '{node_title}' (Node #{node_id_str}) failed: " + ", ".join(parts)
            else:
                msg = f"AssertOvum (Node #{node_id_str}) failed: " + ", ".join(parts)

            raise Exception(msg)

        # Pass through all inputs to their corresponding outputs.
        # The order must match the frontend, which we get from workflow data.
        input_names_in_order = []
        if node_inputs:
            input_names_in_order = [i["name"] for i in node_inputs]
        else:
            # Fallback for when we can't get workflow data (e.g. API usage)
            passthru_keys = sorted([k for k in all_inputs if k.startswith("passthru_")],
                                   key=lambda k: int(k.split('_')[1]))
            true_keys = sorted([k for k in all_inputs if k.startswith("true_")], key=lambda k: int(k.split('_')[1]))
            false_keys = sorted([k for k in all_inputs if k.startswith("false_")], key=lambda k: int(k.split('_')[1]))
            input_names_in_order = passthru_keys + true_keys + false_keys

        return tuple(all_inputs.get(name) for name in input_names_in_order)

    @classmethod
    def INPUT_TYPES(cls):
        # Start with passthru and two assertion inputs
        return {
            "required": {
            },
            "optional": {
                "passthru_1": (anytype, {
                    "tooltip": "Any value to pass through unchanged. Connect this to ensure the node executes at the right point in your workflow."
                }),
                # Dynamically added in frontend (JS) but backend must accept any
                "true_1": ("BOOLEAN,*", {
                    "forceInput": True,
                    "tooltip": "Input that should evaluate to True"
                }),
                "false_1": ("BOOLEAN,*", {
                    "forceInput": True,
                    "tooltip": "Input that should evaluate to False"
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "prompt": "PROMPT",
            },
        }


CLASS_MAPPINGS, CLASS_NAMES = get_node_names_mappings(classes)
validate(classes)
