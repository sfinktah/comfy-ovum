from typing import Any, Dict, Tuple, List

from common_types import ANYTYPE


class NewMultiDictionaryOvum:
    """
    Build a dictionary from dynamically added inputs.
    - The input value comes from the connected value on each dynamic input.
    - The dictionary key comes from the UI label of that input (editable in the graph).
    - The UI provides a mapping of input name -> label via workflow.extra using a graphToPrompt hook.
    """

    NAME = "New Multi-type Dictionary"
    CATEGORY = "ovum"
    FUNCTION = "run"
    RETURN_TYPES = ("DICT",)
    RETURN_NAMES: Tuple = ("dict",)

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        # Always considered changed to ensure the latest UI labels are used
        return float("NaN")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                # Seed first dynamic input; frontend JS will manage growth/renaming
                "key-value-1": (ANYTYPE, {"forceInput": True, "tooltip": "Connect any value here; rename the input label to become the key."}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "prompt": "PROMPT",
            },
        }

    def _get_label_mapping(self, unique_id: Any, extra_pnginfo: Any) -> Dict[str, str]:
        """Retrieve mapping from input name -> label for this node from workflow.extra.
        The UI writes under key f"ovum.multi.dict:({nodeId})" an array of [name, label] pairs
        or an object mapping names to labels. We normalize into a dict.
        """
        mapping: Dict[str, str] = {}
        try:
            node_id_str = str(unique_id) if unique_id is not None else None
            
            # extra_pnginfo.get('workflow', {}).get('extra', {}) or {}
            
            if not node_id_str:
                return mapping
            wf = extra_pnginfo.get("workflow", {}) or {}
            extra = wf.get("extra", {}) or {}
            key = f"ovum.multi.dict:({node_id_str})"
            raw = extra.get(key, {})
            if not raw:
                print("Couldn't find key in extra.pnginfo:", key, extra)
                return mapping
            # Accept array of pairs or dict
            if isinstance(raw, dict):
                for k, v in raw.items():
                    if isinstance(k, str) and isinstance(v, str) and v:
                        mapping[k] = v
            elif isinstance(raw, list):
                for item in raw:
                    if isinstance(item, (list, tuple)) and len(item) >= 2:
                        name, label = item[0], item[1]
                        if isinstance(name, str) and isinstance(label, str) and label:
                            mapping[name] = label
                    elif isinstance(item, dict):
                        # In case UI sends [{name: 'key-value-1', label: 'foo'}]
                        n = item.get("name")
                        l = item.get("label")
                        if isinstance(n, str) and isinstance(l, str) and l:
                            mapping[n] = l
        except Exception:
            # Be robust; fall back to empty mapping
            pass
        return mapping

    def run(self, unique_id: Any = None, extra_pnginfo: Any = None, prompt: Any = None, **kwargs) -> Tuple[Dict[str, Any]]:
        # Collect all inputs that match dynamic naming pattern and are provided in kwargs
        # Pattern: key-value-<n>
        items: List[Tuple[str, Any]] = []
        for k, v in kwargs.items():
            if isinstance(k, str) and k.startswith("key-value-"):
                # Only include if a value is present (connected); allow False/0/empty-string values
                if v is not None:
                    items.append((k, v))

        label_map = self._get_label_mapping(unique_id, extra_pnginfo)

        out: Dict[str, Any] = {}
        for name, value in items:
            key = label_map.get(name) or name  # fall back to input name when label missing
            try:
                # Normalize key to string
                key_str = str(key)
            except Exception:
                key_str = name
            out[key_str] = value

        return (out,)


CLAZZES = [NewMultiDictionaryOvum]
