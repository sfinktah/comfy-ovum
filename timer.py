import json
import comfy.utils

class Timer:
    CATEGORY = "ovum"
    @classmethod    
    def INPUT_TYPES(s):
        dyn_inputs = {"arg1": ('*', {"lazy": True, "tooltip": "Any input. When connected, one more input slot is added."}), }

        inputs = {
            "required": {
                "queued_run_notes": ("STRING", {"tooltip": "This will be recorded when the job is dequeued"})
                # "select": ("INT", {"default": 1, "min": 1, "max": 999999, "step": 1, "tooltip": "The input number you want to output among the inputs"}),
                # "sel_mode": ("BOOLEAN", {"default": False, "label_on": "select_on_prompt", "label_off": "select_on_execution", "forceInput": False,
                #                          "tooltip": "In the case of 'select_on_execution', the selection is dynamically determined at the time of workflow execution. 'select_on_prompt' is an option that exists for older versions of ComfyUI, and it makes the decision before the workflow execution."}),
            },
            "optional": {
                "image": ("IMAGE", {"tooltip": "This is just used as a trigger"}),
                **dyn_inputs
            },
            # "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO"}
        }
        return inputs

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "func"
    NAME = "🥚 Timer"
    OUTPUT_NODE = True
    def func(self, queued_run_notes, image=None, *args, **kwargs):
        # Accept arbitrary dynamic inputs like input2, input3, etc.

        def _to_jsonable(obj, _seen=None):
            if _seen is None:
                _seen = set()
            oid = id(obj)
            if oid in _seen:
                return "<circular>"
            _seen.add(oid)

            try:
                # Primitives
                if obj is None or isinstance(obj, (bool, int, float, str)):
                    return obj

                # Bytes -> utf-8 string (fallback to list of ints)
                if isinstance(obj, (bytes, bytearray)):
                    try:
                        return obj.decode("utf-8", "replace")
                    except Exception:
                        return list(obj)

                # Collections
                if isinstance(obj, dict):
                    return {str(_to_jsonable(k, _seen)): _to_jsonable(v, _seen) for k, v in obj.items()}
                if isinstance(obj, (list, tuple, set)):
                    return [_to_jsonable(v, _seen) for v in obj]

                # Numpy support if available
                try:
                    import numpy as _np  # type: ignore
                    if isinstance(obj, _np.ndarray):
                        return obj.tolist()
                    if isinstance(obj, _np.generic):
                        return obj.item()
                except Exception:
                    pass

                # Fallback to string representation
                return str(obj)
            finally:
                # Allow other branches to serialize the same object in different paths
                _seen.discard(oid)

        payload = {
            "args": _to_jsonable(args),
            "queued_run_notes": queued_run_notes,
            "kwargs": _to_jsonable(kwargs),
        }
        safe_json = json.dumps(payload, ensure_ascii=False)

        return {
            "ui": {
                # Return a list (not a set) to avoid unhashable type errors
                "queued_run_notes": [queued_run_notes],
                "bg_image": [safe_json],
                "kwargs": kwargs,
                "args": args,
            },
            "result": ()
        }

CLAZZES = [Timer]