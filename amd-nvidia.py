"""
AmdNvidia node: Routes inputs from AMD or NVIDIA based on detected GPU.
Dynamic inputs: amd_#, nvidia_#; Dynamic outputs: out_# counting only the active vendor's connected inputs.
"""
from typing import Any, Dict, List, Tuple
from common_types import TautologyStr, ByPassTypeTuple, ANYTYPE
from autonode import validate, node_wrapper, get_node_names_mappings, anytype

classes = []
node = node_wrapper(classes)

MAX_FLOW_NUM = 20

def _detect_gpu_vendor() -> str:
    try:
        import torch  # type: ignore
        s = ""
        try:
            if torch.cuda.is_available():
                s = torch.cuda.get_device_name(0)
        except Exception:
            pass
        # Add hints from version info
        try:
            hip = getattr(getattr(torch, "version", object()), "hip", None)
            if hip:
                s = (s + " AMD ").strip()
        except Exception:
            pass
        # ZLUDA env hint
        import os
        if os.environ.get("ZLUDA", "") or os.environ.get("ZLUDA_ROOT", ""):
            s = (s + " ZLUDA").strip()
        return s
    except Exception:
        return ""


@node
class AmdNvidiaIfElseOvum:
    FUNCTION = "run"
    RETURN_TYPES = ByPassTypeTuple(tuple([ANYTYPE] * (MAX_FLOW_NUM - 1)))
    RETURN_NAMES = ByPassTypeTuple(tuple(["out_%d" % i for i in range(1, MAX_FLOW_NUM)]))
    CATEGORY = "ovum/logic"
    DESCRIPTION = "Route AMD or NVIDIA inputs to out_# based on GPU vendor."
    custom_name = "if AMD else if NVIDIA Ovum"

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        return float("NaN")

    @staticmethod
    def run(amd_1: Any = None, nvidia_1: Any = None, unique_id: Any = None,
            extra_pnginfo: Any = None, prompt: Any = None, **kwargs) -> Tuple:
        # Collect all inputs
        all_inputs: Dict[str, Any] = {"amd_1": amd_1, "nvidia_1": nvidia_1, **kwargs}
        # Determine vendor
        vstr = _detect_gpu_vendor()
        vlow = vstr.lower()
        use_vendor = "amd" if ("amd " in vstr or "zluda" in vlow) else ("nvidia" if "nvidia" in vlow else "amd")

        # Prepare ordered input names from workflow (for deterministic ordering and count)
        node_inputs = None
        node_id_str = str(unique_id) if unique_id is not None else "unknown"
        if node_id_str and extra_pnginfo and isinstance(extra_pnginfo, list) and len(extra_pnginfo) > 0:
            try:
                workflow_data = extra_pnginfo[0]
                if isinstance(workflow_data, dict) and "workflow" in workflow_data:
                    workflow = workflow_data["workflow"]
                    if "nodes" in workflow:
                        for node in workflow["nodes"]:
                            if str(node.get("id")) == node_id_str:
                                node_inputs = node.get("inputs")
                                break
            except Exception:
                pass

        input_names_in_order: List[str] = []
        if node_inputs:
            input_names_in_order = [i["name"] for i in node_inputs]
        else:
            # Fallback: collect and sort
            amd_keys = sorted([k for k in all_inputs if k.startswith("amd_")], key=lambda k: int(k.split("_")[1]))
            nvd_keys = sorted([k for k in all_inputs if k.startswith("nvidia_")], key=lambda k: int(k.split("_")[1]))
            input_names_in_order = amd_keys + nvd_keys

        # Build outputs according to vendor
        outs: List[Any] = []
        if use_vendor == "amd":
            amd_keys = [k for k in input_names_in_order if k.startswith("amd_")]
            for k in amd_keys:
                if all_inputs.get(k) is not None:
                    outs.append(all_inputs[k])
        else:
            nvd_keys = [k for k in input_names_in_order if k.startswith("nvidia_")]
            for k in nvd_keys:
                if all_inputs.get(k) is not None:
                    outs.append(all_inputs[k])

        return tuple(outs)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "amd_1": (anytype, {"tooltip": "AMD input"}),
                "nvidia_1": (anytype, {"tooltip": "NVIDIA input"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "prompt": "PROMPT",
            },
        }


CLASS_MAPPINGS, CLASS_NAMES = get_node_names_mappings(classes)
validate(classes)
